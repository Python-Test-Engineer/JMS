import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { all, audit, one, run, transaction } from "../db/index.js";
import { nowIso } from "../domain/dates.js";
import { hashPassword } from "../auth/passwords.js";
import { revokeAllForUser } from "../auth/sessions.js";
import {
  ACTION_GROUPS, ACTION_KEYS, DEFAULT_MATRIX, ROLES, ROLE_LABELS, SAFEGUARDED_DENIALS, can,
} from "../domain/permissions.js";
import { requirePermission } from "../middleware/permissions.js";
import { notFound } from "../middleware/errors.js";
import { renderPage } from "../render.js";
import {
  COLOR_KEYS, FONT_FIELDS, LAYOUT_FIELDS, PRESETS, TYPE_FIELDS,
  fontOptions, mergeTheme, presetTheme, resolveTheme, themeFromForm, themeToToml,
} from "../domain/theme.js";

export const adminRouter = express.Router();

function activeAdminCount() {
  return one("SELECT COUNT(*) AS n FROM users WHERE role_key='ADMIN' AND status='ACTIVE'").n;
}

function userById(id) {
  return one("SELECT * FROM users WHERE id=?", id);
}

function userList() {
  return all(
    `SELECT u.*, c.name AS customer_name,
       (SELECT COUNT(*) FROM job_assignments a WHERE a.user_id=u.id AND a.removed_at IS NULL) AS job_count
     FROM users u LEFT JOIN customers c ON c.id=u.customer_id
     ORDER BY CASE u.role_key WHEN 'ADMIN' THEN 0 WHEN 'MANAGER' THEN 1 WHEN 'ENGINEER' THEN 2 ELSE 3 END, u.display_name`,
  );
}

adminRouter.get("/admin/users", requirePermission("user.view"), (req, res) => {
  renderPage(req, res, "pages/admin/users.njk", { title: "Users", users: userList(), roles: ROLE_LABELS });
});

adminRouter.get("/admin/users/new", requirePermission("user.create"), (req, res) => {
  renderPage(req, res, "pages/admin/user-form.njk", {
    title: "Create user", values: { role_key: "ENGINEER", can_engineer: true }, errors: {}, customers: all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name"),
  });
});

adminRouter.post("/admin/users", requirePermission("user.create"), (req, res) => {
  const values = {
    display_name: String(req.body.display_name || "").trim(),
    email: String(req.body.email || "").trim().toLowerCase(),
    role_key: String(req.body.role_key || ""),
    can_engineer: req.body.can_engineer === "1",
    phone: String(req.body.phone || "").trim(),
    customer_id: String(req.body.customer_id || ""),
  };
  const errors = {};
  if (!values.display_name) errors.display_name = "Add the user's name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Enter a valid email address.";
  else if (one("SELECT id FROM users WHERE email=?", values.email)) errors.email = "That email is already in use.";
  if (!ROLES.includes(values.role_key)) errors.role_key = "Choose a role.";
  if (values.role_key === "CUSTOMER" && !values.customer_id) errors.customer_id = "A customer login needs a customer.";
  if (values.role_key !== "CUSTOMER" && values.customer_id) errors.customer_id = "Only customer logins point at a customer.";
  if (values.can_engineer && !["ENGINEER", "MANAGER"].includes(values.role_key)) errors.can_engineer = "Only engineers and managers can be field-capable.";
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/admin/user-form.njk", {
      title: "Create user", values, errors, customers: all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name"),
    });
  }
  const now = nowIso();
  const id = crypto.randomUUID();
  const company = one("SELECT id FROM companies LIMIT 1");
  run(
    `INSERT INTO users (id,company_id,email,password_hash,display_name,role_key,customer_id,can_engineer,phone,status,must_change_password,theme_prefs_json,last_login_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
    id, company.id, values.email, hashPassword(config.DEFAULT_PASSWORD), values.display_name,
    values.role_key, values.customer_id || null, values.can_engineer ? 1 : 0,
    values.phone || null, values.role_key === "CUSTOMER" ? "INVITED" : "ACTIVE", 1, null, now, now,
  );
  audit({ actorId: req.user.id, action: "user.create", entityType: "USER", entityId: id, after: { role: values.role_key, email: values.email }, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: `User created. Temporary password: ${config.DEFAULT_PASSWORD}` });
  res.redirect(`/admin/users/${id}`);
});

adminRouter.get("/admin/users/:id", requirePermission("user.view"), (req, res) => {
  const user = userById(req.params.id);
  if (!user) return notFound(req, res);
  const customer = user.customer_id ? one("SELECT * FROM customers WHERE id=?", user.customer_id) : null;
  const assignments = all(
    `SELECT a.*, j.reference, j.title, j.status FROM job_assignments a JOIN jobs j ON j.id=a.job_id
     WHERE a.user_id=? AND a.removed_at IS NULL ORDER BY j.planned_start`, user.id,
  );
  renderPage(req, res, "pages/admin/user-detail.njk", {
    title: user.display_name, target: user, customer, assignments, roles: ROLE_LABELS,
    customers: all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name"),
    canDeactivate: activeAdminCount() > 1 || user.role_key !== "ADMIN",
  });
});

adminRouter.post("/admin/users/:id/role", requirePermission("user.edit.role"), (req, res) => {
  const user = userById(req.params.id);
  if (!user) return notFound(req, res);
  const role = String(req.body.role_key || "");
  const canEngineer = req.body.can_engineer === "1";
  const customerId = String(req.body.customer_id || "") || null;
  const errors = {};
  if (!ROLES.includes(role)) errors.role = "Choose a valid role.";
  if (role === "CUSTOMER" && !customerId) errors.customer = "A customer login needs a customer.";
  if (role !== "CUSTOMER" && customerId) errors.customer = "Only customer logins point at a customer.";
  if (canEngineer && !["ENGINEER", "MANAGER"].includes(role)) errors.can_engineer = "Only engineers and managers can be field-capable.";
  if (user.role_key === "ADMIN" && role !== "ADMIN" && activeAdminCount() <= 1) errors.role = "The last active admin cannot change their own role.";
  if (Object.keys(errors).length) {
    req.session.flash_json = JSON.stringify({ type: "error", message: Object.values(errors).join(" ") });
    return res.redirect(`/admin/users/${user.id}`);
  }
  run("UPDATE users SET role_key=?, can_engineer=?, customer_id=?, updated_at=? WHERE id=?",
    role, canEngineer ? 1 : 0, customerId, nowIso(), user.id);
  revokeAllForUser(user.id);
  audit({ actorId: req.user.id, action: "user.update.role", entityType: "USER", entityId: user.id, before: { role: user.role_key }, after: { role }, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: "Role updated. The user must sign in again." });
  res.redirect(`/admin/users/${user.id}`);
});

adminRouter.post("/admin/users/:id/reset-password", requirePermission("user.reset.password"), (req, res) => {
  const user = userById(req.params.id);
  if (!user) return notFound(req, res);
  const temporary = crypto.randomBytes(4).toString("hex").toUpperCase();
  run("UPDATE users SET password_hash=?, must_change_password=1, updated_at=? WHERE id=?",
    hashPassword(temporary), nowIso(), user.id);
  revokeAllForUser(user.id);
  audit({ actorId: req.user.id, action: "user.reset.password", entityType: "USER", entityId: user.id, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: `Temporary password for ${user.display_name}: ${temporary}` });
  res.redirect(`/admin/users/${user.id}`);
});

adminRouter.post("/admin/users/:id/deactivate", requirePermission("user.deactivate"), (req, res) => {
  const user = userById(req.params.id);
  if (!user) return notFound(req, res);
  if (user.id === req.user.id) {
    req.session.flash_json = JSON.stringify({ type: "error", message: "You cannot deactivate your own account." });
    return res.redirect(`/admin/users/${user.id}`);
  }
  if (user.role_key === "ADMIN" && activeAdminCount() <= 1) {
    req.session.flash_json = JSON.stringify({ type: "error", message: "The last active admin cannot be deactivated." });
    return res.redirect(`/admin/users/${user.id}`);
  }
  const status = req.body.action === "reactivate" ? "ACTIVE" : "SUSPENDED";
  run("UPDATE users SET status=?, updated_at=? WHERE id=?", status, nowIso(), user.id);
  if (status !== "ACTIVE") revokeAllForUser(user.id);
  audit({ actorId: req.user.id, action: "user.deactivate", entityType: "USER", entityId: user.id, before: { status: user.status }, after: { status }, req });
  req.session.flash_json = JSON.stringify({ type: "success", message: `User ${status === "ACTIVE" ? "reactivated" : "suspended"}.` });
  res.redirect(`/admin/users/${user.id}`);
});

adminRouter.get("/admin/roles", requirePermission("admin.roles.manage"), (req, res) => {
  const rows = all("SELECT * FROM permissions");
  const matrix = {};
  for (const role of ROLES) {
    matrix[role] = {};
    for (const action of ACTION_KEYS) {
      const row = rows.find((r) => r.role_key === role && r.action_key === action);
      matrix[role][action] = row ? Boolean(row.allowed) : DEFAULT_MATRIX[action].has(role);
    }
  }
  renderPage(req, res, "pages/admin/roles.njk", {
    title: "Roles & permissions", matrix, groups: ACTION_GROUPS, roles: ROLES, roleLabels: ROLE_LABELS,
    errors: [], saved: req.query.saved === "1",
  });
});

adminRouter.post("/admin/roles/permissions", requirePermission("admin.permissions.edit"), (req, res) => {
  const requested = {};
  for (const key of Object.keys(req.body)) {
    const match = /^perm\|([A-Z]+)\|(.+)$/.exec(key);
    if (match && ACTION_KEYS.includes(match[2])) {
      requested[`${match[1]}|${match[2]}`] = true;
    }
  }
  const errors = [];
  for (const [action, deniedRoles] of Object.entries(SAFEGUARDED_DENIALS)) {
    for (const role of deniedRoles) {
      if (requested[`${role}|${action}`]) errors.push(`${action} cannot be granted to ${ROLE_LABELS[role]}.`);
    }
  }
  const lastAdmin = activeAdminCount() <= 1;
  if (lastAdmin && !requested[`ADMIN|admin.permissions.edit`]) {
    errors.push("The last active admin must keep permission editing.");
  }
  if (errors.length) {
    res.status(400);
    const rows = all("SELECT * FROM permissions");
    const matrix = {};
    for (const role of ROLES) {
      matrix[role] = {};
      for (const action of ACTION_KEYS) {
        matrix[role][action] = requested[`${role}|${action}`] ?? false;
      }
    }
    return renderPage(req, res, "pages/admin/roles.njk", {
      title: "Roles & permissions", matrix, groups: ACTION_GROUPS, roles: ROLES, roleLabels: ROLE_LABELS,
      errors, saved: false,
    });
  }
  transaction(() => {
    for (const role of ROLES) {
      for (const action of ACTION_KEYS) {
        const allowed = requested[`${role}|${action}`] ? 1 : 0;
        const existing = one("SELECT allowed FROM permissions WHERE role_key=? AND action_key=?", role, action);
        if (!existing || existing.allowed !== allowed) {
          run(
            `INSERT INTO permissions (role_key,action_key,allowed) VALUES (?,?,?)
             ON CONFLICT(role_key,action_key) DO UPDATE SET allowed=excluded.allowed`,
            role, action, allowed,
          );
          audit({
            actorId: req.user.id, action: "permission.update", entityType: "PERMISSION",
            entityId: `${role}:${action}`, before: existing ? { allowed: Boolean(existing.allowed) } : null,
            after: { role_key: role, action_key: action, allowed: Boolean(allowed) }, req,
          });
        }
      }
    }
  });
  req.session.flash_json = JSON.stringify({ type: "success", message: "Permission matrix saved. Changes apply on the next request." });
  res.redirect("/admin/roles?saved=1");
});

adminRouter.get("/admin/settings", requirePermission("admin.settings.manage"), (req, res) => {
  const company = one("SELECT * FROM companies LIMIT 1");
  const settings = Object.fromEntries(all("SELECT key,value_json FROM settings").map((row) => {
    try { return [row.key, JSON.parse(row.value_json)]; } catch { return [row.key, row.value_json]; }
  }));
  const theme = resolveTheme(currentCompanyTheme());
  renderPage(req, res, "pages/admin/settings.njk", {
    title: "Company settings", company, settings, themeMode: theme.mode, errors: {},
  });
});

function currentCompanyTheme() {
  const company = one("SELECT default_theme_json FROM companies LIMIT 1");
  try { return JSON.parse(company.default_theme_json || "{}"); } catch { return {}; }
}

adminRouter.get("/admin/theme", requirePermission("admin.settings.manage"), (req, res) => {
  let theme = resolveTheme(currentCompanyTheme());
  const preset = typeof req.query.preset === "string" ? req.query.preset : "";
  if (preset) theme = presetTheme(theme, preset);
  renderPage(req, res, "pages/admin/theme.njk", {
    title: "Site theme",
    theme,
    presets: PRESETS,
    selectedPreset: preset,
    typeFields: TYPE_FIELDS,
    layoutFields: LAYOUT_FIELDS,
    fontFields: FONT_FIELDS.map((field) => ({ ...field, options: fontOptions(field.key, theme.fonts[field.key]) })),
    colorKeys: COLOR_KEYS,
    toml: themeToToml(theme),
  });
});

adminRouter.post("/admin/theme", requirePermission("admin.settings.manage"), (req, res) => {
  const before = resolveTheme(currentCompanyTheme());
  const theme = themeFromForm(req.body, before);
  const now = nowIso();
  transaction(() => {
    run("UPDATE companies SET default_theme_json=? WHERE id=?", JSON.stringify(theme), one("SELECT id FROM companies LIMIT 1").id);
    run(
      `INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
      "company.default_theme", JSON.stringify(theme), now, req.user.id,
    );
    audit({
      actorId: req.user.id, action: "theme.default.update", entityType: "SETTING",
      entityId: "company.default_theme", before: { mode: before.mode, type: before.type }, after: { mode: theme.mode, type: theme.type }, req,
    });
  });
  req.session.flash_json = JSON.stringify({ type: "success", message: "Site theme saved. Every page now uses it." });
  res.redirect("/admin/theme");
});

adminRouter.post("/admin/settings", requirePermission("admin.settings.manage"), (req, res) => {
  const vatRateBp = Math.round(Number(req.body.vat_rate_percent || 20) * 100);
  const dueDays = Math.max(0, Math.min(365, Number.parseInt(req.body.invoice_due_days, 10) || 14));
  const mode = ["system", "light", "dark"].includes(req.body.default_theme) ? req.body.default_theme : "system";
  const pdfFooter = String(req.body.pdf_footer || "").trim();
  const passwordMinLength = Math.max(8, Math.min(72, Number.parseInt(req.body.password_min_length, 10) || 10));
  const sessionIdle = Math.max(5, Math.min(1440, Number.parseInt(req.body.session_idle_minutes, 10) || 60));
  const existingTheme = currentCompanyTheme();
  const theme = mergeTheme(resolveTheme(existingTheme), { mode });
  const values = {
    "company.vat_rate_bp": vatRateBp,
    "company.invoice_due_days": dueDays,
    "company.default_theme": theme,
    "company.pdf_footer": pdfFooter,
    "security.password_min_length": passwordMinLength,
    "security.session_idle_minutes": sessionIdle,
  };
  const now = nowIso();
  transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      run(
        `INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        key, JSON.stringify(value), now, req.user.id,
      );
    }
    run("UPDATE companies SET invoice_due_days=?, default_theme_json=?, pdf_footer=? WHERE id=?",
      dueDays, JSON.stringify(theme), pdfFooter, one("SELECT id FROM companies LIMIT 1").id);
    audit({ actorId: req.user.id, action: "settings.update", entityType: "SETTING", after: values, req });
    if (mode) audit({ actorId: req.user.id, action: "theme.default.update", entityType: "SETTING", after: { mode }, req });
  });
  req.session.flash_json = JSON.stringify({ type: "success", message: "Settings saved." });
  res.redirect("/admin/settings");
});

adminRouter.get("/admin/audit", requirePermission("admin.audit.view"), (req, res) => {
  const where = ["1=1"];
  const params = [];
  if (req.query.action) { where.push("a.action LIKE ?"); params.push(`%${req.query.action}%`); }
  if (req.query.entity_type) { where.push("a.entity_type=?"); params.push(req.query.entity_type); }
  const rows = all(
    `SELECT a.*, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id
     WHERE ${where.join(" AND ")} ORDER BY a.at DESC LIMIT 250`,
    ...params,
  );
  renderPage(req, res, "pages/admin/audit.njk", { title: "Audit log", rows, filters: req.query });
});

adminRouter.get("/admin/archive", requirePermission("job.archive"), (req, res) => {
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NOT NULL ORDER BY j.archived_at DESC`,
  );
  const customers = all("SELECT * FROM customers WHERE archived_at IS NOT NULL ORDER BY archived_at DESC");
  renderPage(req, res, "pages/admin/archive.njk", { title: "Archive", jobs, customers });
});

adminRouter.post("/admin/archive/:type/:id/restore", requirePermission("job.archive"), (req, res) => {
  const { type, id } = req.params;
  if (type === "job") {
    const job = one("SELECT * FROM jobs WHERE id=?", id);
    if (!job) return notFound(req, res);
    run("UPDATE jobs SET archived_at=NULL, updated_at=? WHERE id=?", nowIso(), id);
    audit({ actorId: req.user.id, action: "job.restore", entityType: "JOB", entityId: id, req });
  } else if (type === "customer") {
    if (!can(req.user, "customer.archive")) return notFound(req, res);
    const customer = one("SELECT * FROM customers WHERE id=?", id);
    if (!customer) return notFound(req, res);
    run("UPDATE customers SET archived_at=NULL, status='ACTIVE' WHERE id=?", id);
    audit({ actorId: req.user.id, action: "customer.restore", entityType: "CUSTOMER", entityId: id, req });
  } else {
    return notFound(req, res);
  }
  req.session.flash_json = JSON.stringify({ type: "success", message: "Record restored." });
  res.redirect("/admin/archive");
});
