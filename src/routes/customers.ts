/** Customer CRUD, portal invitations and archive. */
import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { flash } from "../middleware/session-flash.js";
import { renderPage } from "../render.js";
import {
  archiveCustomer,
  createCustomerWithInvite,
  customerJobs,
  listCustomers,
  loginsForCustomer,
  updateCustomer,
  validateCustomerInput,
  inviteCustomer,
} from "../services/customers.js";
import { customerById } from "../services/access.js";
import { STATUS_LABELS } from "../domain/status.js";
import { layout, meta } from "./helpers.js";

export const customersRouter = Router();

customersRouter.get("/customers", requirePermission("customer.view.all"), (req, res) => {
  layout(req, res);
  const q = String(req.query["q"] ?? "");
  renderPage(res, "pages/customers/list.njk", { title: "Customers", customers: listCustomers(q), q });
});

customersRouter.get("/customers/new", requirePermission("customer.create"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/customers/form.njk", {
    title: "New customer",
    mode: "new",
    customer: null,
    values: { name: "", contact_name: "", email: "", phone: "", line1: "", line2: "", town: "", postcode: "", notes: "", country: "GB", invite: true },
    errors: {},
  });
});

customersRouter.post("/customers", requirePermission("customer.create"), async (req, res) => {
  const { values, errors } = validateCustomerInput(req.body as Record<string, unknown>);
  if (Object.keys(errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/customers/form.njk", {
      title: "New customer",
      mode: "new",
      customer: null,
      values: { ...values, invite: req.body["invite"] === "1" },
      errors,
    });
  }
  try {
    const result = await createCustomerWithInvite(req.user!, values, req.body["invite"] === "1", meta(req));
    flash(req, "success", result.loginEmail ? "Customer created. Temporary password: JMS123" : "Customer created.");
    res.redirect(`/customers/${result.customer.id}`);
  } catch (error) {
    layout(req, res);
    res.status(409);
    renderPage(res, "pages/customers/form.njk", {
      title: "New customer",
      mode: "new",
      customer: null,
      values: { ...values, invite: false },
      errors: { email: error instanceof Error ? error.message : "Could not create customer." },
    });
  }
});

customersRouter.get("/customers/:id", requirePermission("customer.view.all"), (req, res) => {
  const customer = customerById(String(req.params["id"] ?? ""));
  if (!customer) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/customers/detail.njk", {
    title: customer.name,
    customer,
    jobs: customerJobs(customer.id),
    logins: loginsForCustomer(customer.id),
    statuses: STATUS_LABELS,
  });
});

customersRouter.get("/customers/:id/edit", requirePermission("customer.edit"), (req, res) => {
  const customer = customerById(String(req.params["id"] ?? ""));
  if (!customer) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/customers/form.njk", {
    title: `Edit ${customer.name}`,
    mode: "edit",
    customer,
    values: {
      name: customer.name,
      contact_name: customer.contact_name,
      email: customer.email,
      phone: customer.phone,
      line1: customer.address.line1,
      line2: customer.address.line2,
      town: customer.address.town,
      postcode: customer.address.postcode,
      notes: customer.notes ?? "",
      country: customer.address.country,
      invite: false,
    },
    errors: {},
  });
});

customersRouter.post("/customers/:id", requirePermission("customer.edit"), (req, res) => {
  const customer = customerById(String(req.params["id"] ?? ""));
  if (!customer) return res.status(404).send("Not found");
  const { values, errors } = validateCustomerInput(req.body as Record<string, unknown>);
  if (Object.keys(errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/customers/form.njk", {
      title: `Edit ${customer.name}`,
      mode: "edit",
      customer,
      values: { ...values, invite: false },
      errors,
    });
  }
  updateCustomer(req.user!, customer, values, meta(req));
  flash(req, "success", "Customer saved.");
  res.redirect(`/customers/${customer.id}`);
});

customersRouter.post("/customers/:id/invite", requirePermission("customer.invite"), async (req, res) => {
  const customer = customerById(String(req.params["id"] ?? ""));
  if (!customer) return res.status(404).send("Not found");
  await inviteCustomer(req.user!, customer, meta(req));
  flash(req, "success", "Portal login ready. Temporary password: JMS123");
  res.redirect(`/customers/${customer.id}`);
});

customersRouter.post("/customers/:id/archive", requirePermission("customer.archive"), (req, res) => {
  const customer = customerById(String(req.params["id"] ?? ""));
  if (!customer) return res.status(404).send("Not found");
  archiveCustomer(req.user!, customer, meta(req));
  flash(req, "success", "Customer archived.");
  res.redirect("/customers");
});
