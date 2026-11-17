import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { all, audit, one, run, transaction } from "../db/index.js";
import { nowIso } from "../domain/dates.js";
import { STATUS_LABELS } from "../domain/status.js";
import { hashPassword } from "../auth/passwords.js";
import { revokeAllForUser } from "../auth/sessions.js";
import { requirePermission } from "../middleware/permissions.js";
import { notFound } from "../middleware/errors.js";
import { renderPage } from "../render.js";

export const customersRouter = express.Router();

function addressFromBody(body) {
  return {
    line1: String(body.line1 || "").trim(),
    line2: String(body.line2 || "").trim(),
    town: String(body.town || "").trim(),
    postcode: String(body.postcode || "").trim().toUpperCase(),
    country: "GB",
  };
}

function validateCustomer(body, existingId = null) {
  const values = {
    name: String(body.name || "").trim(),
    contact_name: String(body.contact_name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    phone: String(body.phone || "").trim(),
    notes: String(body.notes || "").trim() || null,
    address: addressFromBody(body),
    invite: body.invite === "1" || body.invite === "on",
  };
  const errors = {};
  if (!values.name) errors.name = "Add the customer name.";
  if (!values.contact_name) errors.contact_name = "Add the main contact.";
  if (!values.email) errors.email = "Add an email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Enter a valid email address.";
  if (!values.phone) errors.phone = "Add a phone number.";
  if (!values.address.line1) errors.line1 = "Add the first line of the address.";
  if (!values.address.town) errors.town = "Add the town or city.";
  if (!values.address.postcode) errors.address.postcode = "Add the postcode.";

  if (values.name) {
    const duplicate = one("SELECT id FROM customers WHERE name=? COLLATE NOCASE AND id<>?", values.name, existingId || "");
    if (duplicate) errors.name = "A customer with that name already exists.";
  }
  if (values.email) {
    const duplicate = one("SELECT id FROM customers WHERE email=? COLLATE NOCASE AND id<>?", values.email, existingId || "");
    if (duplicate) errors.email = "A customer with that email already exists.";
  }
  return { values, errors };
}

customersRouter.get("/customers", requirePermission("customer.view.all"), (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = all(
    `SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id=c.id AND j.archived_at IS NULL) AS job_count,
       (SELECT COUNT(*) FROM users u WHERE u.customer_id=c.id AND u.status='ACTIVE') AS login_count
     FROM customers c
     WHERE c.archived_at IS NULL ${q ? "AND (c.name LIKE ? OR c.email LIKE ? OR c.contact_name LIKE ?)" : ""}
     ORDER BY c.name`,
    ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []),
  );
  renderPage(req, res, "pages/customers/list.njk", { title: "Customers", customers: rows, q });
});

customersRouter.get("/customers/new", requirePermission("customer.create"), (req, res) => {
  renderPage(req, res, "pages/customers/form.njk", {
    title: "Create customer", mode: "new", errors: {},
    values: { name: "", contact_name: "", email: "", phone: "", notes: "", line1: "", line2: "", town: "", postcode: "", invite: true },
  });
});

customersRouter.post("/customers", requirePermission("customer.create"), (req, res) => {
  const { values, errors } = validateCustomer(req.body);
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/customers/form.njk", { title: "Create customer", mode: "new", values, errors });
  }
  const now = nowIso();
  const id = crypto.randomUUID();
  const company = one("SELECT id FROM companies LIMIT 1");
  transaction(() => {
    run(
      `INSERT INTO customers (id,company_id,name,contact_name,email,phone,address_json,notes,status,created_at,created_by,archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      id, company.id, values.name, values.contact_name, values.email, values.phone,
      JSON.stringify(values.address), values.notes, "ACTIVE", now, req.user.id,
    );
    if (values.invite) {
      run(
        `INSERT INTO users (id,company_id,email,password_hash,display_name,role_key,customer_id,can_engineer,phone,status,must_change_password,theme_prefs_json,last_login_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
        crypto.randomUUID(), company.id, values.email, hashPassword(config.DEFAULT_PASSWORD), values.contact_name,
        "CUSTOMER", id, 0, values.phone, "INVITED", 1, null, now, now,
      );
    }
    audit({ actorId: req.user.id, action: "customer.create", entityType: "CUSTOMER", entityId: id, after: { name: values.name, invite: values.invite }, req });
  });
  req.session.flash_json = JSON.stringify({
    type: "success",
    message: values.invite ? `Customer created. Temporary password: ${config.DEFAULT_PASSWORD}` : "Customer created.",
  });
  res.redirect(`/customers/${id}`);
});

customersRouter.get("/customers/:id", requirePermission("customer.view.all"), (req, res) => {
  const customer = one("SELECT * FROM customers WHERE id=?", req.params.id);
  if (!customer) return notFound(req, res);
  try { customer.address = JSON.parse(customer.address_json); } catch { customer.address = {}; }
  const jobs = all("SELECT * FROM jobs WHERE customer_id=? AND archived_at IS NULL ORDER BY created_at DESC", customer.id);
  const logins = all("SELECT * FROM users WHERE customer_id=? ORDER BY created_at", customer.id);
  renderPage(req, res, "pages/customers/detail.njk", { title: customer.name, customer, jobs, logins, statuses: STATUS_LABELS });
});

customersRouter.get("/customers/:id/edit", requirePermission("customer.edit"), (req, res) => {
  const customer = one("SELECT * FROM customers WHERE id=?", req.params.id);
  if (!customer) return notFound(req, res);
  let address = {};
  try { address = JSON.parse(customer.address_json); } catch { address = {}; }
  renderPage(req, res, "pages/customers/form.njk", {
    title: `Edit ${customer.name}`,
    mode: "edit",
    customer,
    errors: {},
    values: {
      name: customer.name, contact_name: customer.contact_name, email: customer.email,
      phone: customer.phone, notes: customer.notes || "",
      line1: address.line1 || "", line2: address.line2 || "", town: address.town || "", postcode: address.postcode || "",
      invite: false,
    },
  });
});

customersRouter.post("/customers/:id", requirePermission("customer.edit"), (req, res) => {
  const customer = one("SELECT * FROM customers WHERE id=?", req.params.id);
  if (!customer) return notFound(req, res);
  const { values, errors } = validateCustomer(req.body, customer.id);
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/customers/form.njk", { title: `Edit ${customer.name}`, mode: "edit", customer, values, errors });
  }
  run(
    "UPDATE customers SET name=?, contact_name=?, email=?, phone=?, address_json=?, notes=? WHERE id=?",
    values.name, values.contact_name, values.email, values.phone, JSON.stringify(values.address), values.notes, customer.id,
  );
  audit({ actorId: req.user.id, action: "customer.update", entityType: "CUSTOMER", entityId: customer.id, before: { name: customer.name }, after: { name: values.name }, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: "Customer saved." });
  res.redirect(`/customers/${customer.id}`);
});

customersRouter.post("/customers/:id/invite", requirePermission("customer.invite"), (req, res) => {
  const customer = one("SELECT * FROM customers WHERE id=?", req.params.id);
  if (!customer) return notFound(req, res);
  const now = nowIso();
  const company = one("SELECT id FROM companies LIMIT 1");
  const existing = one("SELECT * FROM users WHERE customer_id=? ORDER BY created_at LIMIT 1", customer.id);
  transaction(() => {
    if (existing) {
      run(
        "UPDATE users SET password_hash=?, must_change_password=1, status='ACTIVE', updated_at=? WHERE id=?",
        hashPassword(config.DEFAULT_PASSWORD), now, existing.id,
      );
      revokeAllForUser(existing.id);
    } else {
      run(
        `INSERT INTO users (id,company_id,email,password_hash,display_name,role_key,customer_id,can_engineer,phone,status,must_change_password,theme_prefs_json,last_login_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
        crypto.randomUUID(), company.id, customer.email, hashPassword(config.DEFAULT_PASSWORD),
        customer.contact_name, "CUSTOMER", customer.id, 0, customer.phone, "INVITED", 1, null, now, now,
      );
    }
    audit({ actorId: req.user.id, action: "customer.invite", entityType: "CUSTOMER", entityId: customer.id, after: { email: customer.email }, req });
  });
  req.session.flash_json = JSON.stringify({
    type: "success",
    message: `Portal login ready for ${customer.email}. Temporary password: ${config.DEFAULT_PASSWORD}`,
  });
  res.redirect(`/customers/${customer.id}`);
});

customersRouter.post("/customers/:id/archive", requirePermission("customer.archive"), (req, res) => {
  const customer = one("SELECT * FROM customers WHERE id=?", req.params.id);
  if (!customer) return notFound(req, res);
  const now = nowIso();
  run("UPDATE customers SET status='ARCHIVED', archived_at=? WHERE id=?", now, customer.id);
  for (const login of all("SELECT id FROM users WHERE customer_id=?", customer.id)) revokeAllForUser(login.id);
  audit({ actorId: req.user.id, action: "customer.archive", entityType: "CUSTOMER", entityId: customer.id, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: `${customer.name} archived.` });
  res.redirect("/customers");
});
