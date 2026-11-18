/** Admin: users, roles & permissions, settings, audit and archive. */
import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { flash } from "../middleware/session-flash.js";
import { renderPage } from "../render.js";
import { all } from "../db/index.js";
import { mapCustomer } from "../db/rows.js";
import { ACTION_KEYS, ROLE_LABELS, type ActionKey } from "../domain/permissions.js";
import type { RoleKey } from "../contracts/types.js";
import {
  archivedRecords,
  auditList,
  changeUserRole,
  createUser,
  listUsers,
  permissionMatrix,
  resetPassword,
  restoreJob,
  saveCompanySettings,
  savePermissions,
  setUserStatus,
  settingsForAdmin,
  userDetail,
} from "../services/admin.js";
import { restoreCustomer } from "../services/customers.js";
import { latestBackupStatus } from "../backup/status.js";
import { layout, meta } from "./helpers.js";

export const adminRouter = Router();

adminRouter.get("/admin/users", requirePermission("user.view"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/admin/users.njk", { title: "Users", users: listUsers() });
});

adminRouter.get("/admin/users/new", requirePermission("user.create"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/admin/user-form.njk", {
    title: "New user",
    values: { display_name: "", email: "", role_key: "ENGINEER", customer_id: "", phone: "", can_engineer: false },
    errors: {},
    customers: all("SELECT * FROM customers WHERE archived_at IS NULL ORDER BY name").map(mapCustomer),
  });
});

adminRouter.post("/admin/users", requirePermission("user.create"), async (req, res) => {
  try {
    await createUser(
      req.user!,
      {
        display_name: String(req.body["display_name"] ?? ""),
        email: String(req.body["email"] ?? ""),
        role_key: String(req.body["role_key"] ?? "ENGINEER") as RoleKey,
        customer_id: String(req.body["customer_id"] ?? "") || null,
        phone: String(req.body["phone"] ?? ""),
        can_engineer: req.body["can_engineer"] === "1",
      },
      meta(req),
    );
    flash(req, "success", "User created. Temporary password: JMS123");
    res.redirect("/admin/users");
  } catch (error) {
    layout(req, res);
    res.status(400);
    renderPage(res, "pages/admin/user-form.njk", {
      title: "New user",
      values: {
        display_name: String(req.body["display_name"] ?? ""),
        email: String(req.body["email"] ?? ""),
        role_key: String(req.body["role_key"] ?? "ENGINEER"),
        customer_id: String(req.body["customer_id"] ?? ""),
        phone: String(req.body["phone"] ?? ""),
        can_engineer: req.body["can_engineer"] === "1",
      },
      errors: { email: error instanceof Error ? error.message : "Could not create user." },
      customers: all("SELECT * FROM customers WHERE archived_at IS NULL ORDER BY name").map(mapCustomer),
    });
  }
});

adminRouter.get("/admin/users/:id", requirePermission("user.view"), (req, res) => {
  const detail = userDetail(String(req.params["id"] ?? ""));
  if (!detail) return res.status(404).send("Not found");
  layout(req, res);
  const activeAdmins = all<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ADMIN' AND status = 'ACTIVE'")[0]?.n ?? 0;
  renderPage(res, "pages/admin/user-detail.njk", {
    title: detail.target.display_name,
    ...detail,
    customers: all("SELECT * FROM customers WHERE archived_at IS NULL ORDER BY name").map(mapCustomer),
    canDeactivate: !(detail.target.id === req.user!.id || (detail.target.role_key === "ADMIN" && activeAdmins <= 1)),
  });
});

adminRouter.post("/admin/users/:id/role", requirePermission("user.edit.role"), (req, res) => {
  const detail = userDetail(String(req.params["id"] ?? ""));
  if (!detail) return res.status(404).send("Not found");
  try {
    changeUserRole(
      req.user!,
      detail.target,
      String(req.body["role_key"] ?? detail.target.role_key) as RoleKey,
      req.body["can_engineer"] === "1",
      String(req.body["customer_id"] ?? "") || null,
      meta(req),
    );
    flash(req, "success", "User role updated. Their sessions were revoked.");
  } catch (error) {
    flash(req, "error", error instanceof Error ? error.message : "Could not update role.");
  }
  res.redirect(`/admin/users/${detail.target.id}`);
});

adminRouter.post("/admin/users/:id/reset-password", requirePermission("user.reset.password"), async (req, res) => {
  const detail = userDetail(String(req.params["id"] ?? ""));
  if (!detail) return res.status(404).send("Not found");
  const temporary = await resetPassword(req.user!, detail.target, meta(req));
  flash(req, "success", `Temporary password set to ${temporary}. It must be changed at next sign-in.`);
  res.redirect(`/admin/users/${detail.target.id}`);
});

adminRouter.post("/admin/users/:id/deactivate", requirePermission("user.deactivate"), (req, res) => {
  const detail = userDetail(String(req.params["id"] ?? ""));
  if (!detail) return res.status(404).send("Not found");
  const action = String(req.body["action"] ?? "");
  const status = action === "reactivate" ? "ACTIVE" : String(req.body["status"] ?? "SUSPENDED");
  try {
    setUserStatus(req.user!, detail.target, status === "ACTIVE" ? "ACTIVE" : status === "ARCHIVED" ? "ARCHIVED" : "SUSPENDED", meta(req));
    flash(req, "success", "User status updated.");
  } catch (error) {
    flash(req, "error", error instanceof Error ? error.message : "Could not update user.");
  }
  res.redirect(`/admin/users/${detail.target.id}`);
});

adminRouter.get("/admin/roles", requirePermission("admin.roles.manage"), (req, res) => {
  layout(req, res);
  const groups: Record<string, string[]> = {};
  for (const key of ACTION_KEYS) {
    const group = key.split(".")[0] ?? "other";
    (groups[group] ??= []).push(key);
  }
  renderPage(res, "pages/admin/roles.njk", {
    title: "Roles & permissions",
    roles: Object.keys(ROLE_LABELS) as RoleKey[],
    roleLabels: ROLE_LABELS,
    groups,
    matrix: permissionMatrix(),
    errors: [],
  });
});

adminRouter.post("/admin/roles/permissions", requirePermission("admin.permissions.edit"), (req, res) => {
  const changes: Array<{ role_key: RoleKey; action_key: ActionKey; allowed: boolean }> = [];
  for (const role of Object.keys(ROLE_LABELS) as RoleKey[]) {
    for (const action of ACTION_KEYS) {
      // The matrix view uses names of the form `perm|ROLE|action`; the pipe is
      // kept out of action keys and is URL-safe in form encoding.
      changes.push({
        role_key: role,
        action_key: action,
        allowed: req.body[`perm|${role}|${action}`] === "1" || req.body[`perm_${role}_${action}`] === "1",
      });
    }
  }
  const errors = savePermissions(req.user!, changes, meta(req));
  if (errors.length > 0) {
    layout(req, res);
    res.status(400);
    const groups: Record<string, string[]> = {};
    for (const key of ACTION_KEYS) {
      const group = key.split(".")[0] ?? "other";
      (groups[group] ??= []).push(key);
    }
    return renderPage(res, "pages/admin/roles.njk", {
      title: "Roles & permissions",
      roles: Object.keys(ROLE_LABELS) as RoleKey[],
      roleLabels: ROLE_LABELS,
      groups,
      matrix: permissionMatrix(),
      errors,
    });
  }
  flash(req, "success", "Permission matrix saved.");
  res.redirect("/admin/roles");
});

adminRouter.get("/admin/settings", requirePermission("admin.settings.manage"), (req, res) => {
  layout(req, res);
  const data = settingsForAdmin();
  const theme = (data.settings["company.default_theme"] as { mode?: string } | undefined)?.mode ?? "system";
  renderPage(res, "pages/admin/settings.njk", { title: "Company settings", ...data, themeMode: theme });
});

adminRouter.post("/admin/settings", requirePermission("admin.settings.manage"), (req, res) => {
  saveCompanySettings(req.user!, req.body as Record<string, unknown>, meta(req));
  flash(req, "success", "Settings saved.");
  res.redirect("/admin/settings");
});

adminRouter.get("/admin/audit", requirePermission("admin.audit.view"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/admin/audit.njk", {
    title: "Audit log",
    rows: auditList(req.query as Record<string, unknown>),
    filters: req.query,
  });
});

adminRouter.get("/admin/archive", requirePermission("job.archive"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/admin/archive.njk", { title: "Archive", ...archivedRecords() });
});

adminRouter.post("/admin/archive/:type/:id/restore", requirePermission("job.archive"), (req, res) => {
  const type = req.params["type"];
  const id = String(req.params["id"] ?? "");
  if (type === "job") restoreJob(req.user!, id, meta(req));
  if (type === "customer" && req.user!.permissions.has("customer.archive")) restoreCustomer(req.user!, id, meta(req));
  flash(req, "success", "Record restored.");
  res.redirect("/admin/archive");
});

adminRouter.get("/admin/backups", requirePermission("backup.manage"), (req, res) => {
  layout(req, res);
  renderPage(res, "pages/admin/backups.njk", { title: "Backups", status: latestBackupStatus() });
});
