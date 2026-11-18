/**
 * Admin services: user administration, editable permission matrix, audit list,
 * archive/restore and company settings.
 *
 * The last-admin safeguards are enforced here, inside a transaction, rather
 * than relying on a disabled checkbox in the view.
 */
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "../db/index.js";
import { mapAudit, mapCustomer, mapJob, mapUser } from "../db/rows.js";
import type { AuditRow, AuthUser, Customer, Job, RoleKey, User, WriteMeta } from "../contracts/types.js";
import { hashPassword } from "../auth/passwords.js";
import { config } from "../config.js";
import { nowIso } from "../domain/dates.js";
import { ACTION_KEYS, DEFAULT_MATRIX, ROLE_LABELS, type ActionKey } from "../domain/permissions.js";
import { audit } from "./audit.js";
import { revokeAllSessionsForUser } from "../auth/sessions.js";
import { company, settingsMap, updateSettings } from "./settings.js";

export function listUsers(): Array<User & { job_count: number }> {
  return all(
    `SELECT u.*, c.name AS customer_name,
       (SELECT COUNT(*) FROM job_assignments a WHERE a.user_id = u.id AND a.removed_at IS NULL) AS job_count
       FROM users u LEFT JOIN customers c ON c.id = u.customer_id
      ORDER BY u.role_key, u.display_name`,
  ).map((row) => ({ ...mapUser(row), job_count: Number(row["job_count"] ?? 0) }));
}

export function userDetail(id: string): {
  target: User;
  customer: Customer | null;
  assignments: Array<Record<string, unknown>>;
} | null {
  const row = one(
    "SELECT u.*, c.name AS customer_name FROM users u LEFT JOIN customers c ON c.id = u.customer_id WHERE u.id = ?",
    id,
  );
  if (!row) return null;
  const target = mapUser(row);
  const customerRow = target.customer_id ? one("SELECT * FROM customers WHERE id = ?", target.customer_id) : null;
  const assignments = all(
    `SELECT a.job_id, j.reference, j.title, j.status FROM job_assignments a JOIN jobs j ON j.id = a.job_id
      WHERE a.user_id = ? AND a.removed_at IS NULL ORDER BY j.planned_start`,
    id,
  );
  return { target, customer: customerRow ? mapCustomer(customerRow) : null, assignments };
}

export async function createUser(
  actor: AuthUser,
  input: {
    display_name: string;
    email: string;
    role_key: RoleKey;
    customer_id: string | null;
    phone: string;
    can_engineer: boolean;
    password?: string;
  },
  meta: WriteMeta,
): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (one("SELECT id FROM users WHERE email = ? COLLATE NOCASE", email)) {
    throw new Error("A user with that email already exists.");
  }
  if (input.role_key === "CUSTOMER" && !input.customer_id) throw new Error("Choose a customer for a CUSTOMER login.");
  if (input.role_key !== "CUSTOMER" && input.customer_id) throw new Error("Only a CUSTOMER login may point at a customer.");
  if (input.role_key === "ADMIN" && input.can_engineer) throw new Error("An Admin cannot be field-capable.");
  const canEngineer = input.role_key === "ENGINEER" ? true : input.role_key === "ADMIN" ? false : input.can_engineer;
  const password = input.password?.trim() || config.defaultPassword;
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const now = nowIso();
  transaction(() => {
    run(
      `INSERT INTO users
        (id, company_id, email, password_hash, display_name, role_key, customer_id, can_engineer, phone,
         status, must_change_password, theme_prefs_json, last_login_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVITED', 1, NULL, NULL, 1, ?, ?)`,
      id,
      company().id,
      email,
      passwordHash,
      input.display_name.trim(),
      input.role_key,
      input.role_key === "CUSTOMER" ? input.customer_id : null,
      canEngineer ? 1 : 0,
      input.phone.trim() || null,
      now,
      now,
    );
    audit({ action: "user.create", entityType: "USER", entityId: id, after: { email, role_key: input.role_key }, meta });
  });
  const row = one("SELECT * FROM users WHERE id = ?", id);
  if (!row) throw new Error("Created user could not be read back.");
  return mapUser(row);
}

export function changeUserRole(
  actor: AuthUser,
  target: User,
  roleKey: RoleKey,
  canEngineer: boolean,
  customerId: string | null,
  meta: WriteMeta,
): void {
  if (target.id === actor.id && target.role_key === "ADMIN" && roleKey !== "ADMIN") {
    throw new Error("You cannot change your own Admin role.");
  }
  if (target.role_key === "ADMIN" && roleKey !== "ADMIN") {
    const admins = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ADMIN' AND status = 'ACTIVE'")?.n ?? 0;
    if (admins <= 1) throw new Error("At least one active Admin must remain.");
  }
  if (roleKey === "ADMIN" && canEngineer) throw new Error("An Admin cannot be field-capable.");
  transaction(() => {
    run(
      "UPDATE users SET role_key = ?, can_engineer = ?, customer_id = ?, version = version + 1, updated_at = ? WHERE id = ?",
      roleKey,
      canEngineer ? 1 : 0,
      roleKey === "CUSTOMER" ? customerId : null,
      nowIso(),
      target.id,
    );
    revokeAllSessionsForUser(target.id);
    audit({
      action: "user.update.role",
      entityType: "USER",
      entityId: target.id,
      before: { role_key: target.role_key },
      after: { role_key: roleKey },
      meta,
    });
  });
}

export async function resetPassword(actor: AuthUser, target: User, meta: WriteMeta): Promise<string> {
  const temporary = config.defaultPassword;
  const passwordHash = await hashPassword(temporary);
  transaction(() => {
    run(
      "UPDATE users SET password_hash = ?, must_change_password = 1, version = version + 1, updated_at = ? WHERE id = ?",
      passwordHash,
      nowIso(),
      target.id,
    );
    revokeAllSessionsForUser(target.id);
    audit({ action: "user.reset.password", entityType: "USER", entityId: target.id, meta });
  });
  return temporary;
}

export function setUserStatus(
  actor: AuthUser,
  target: User,
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED",
  meta: WriteMeta,
): void {
  if (target.id === actor.id && status !== "ACTIVE") throw new Error("You cannot deactivate your own account.");
  if (target.role_key === "ADMIN" && status !== "ACTIVE") {
    const admins = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ADMIN' AND status = 'ACTIVE'")?.n ?? 0;
    if (admins <= 1) throw new Error("At least one active Admin must remain.");
  }
  transaction(() => {
    run("UPDATE users SET status = ?, version = version + 1, updated_at = ? WHERE id = ?", status, nowIso(), target.id);
    revokeAllSessionsForUser(target.id);
    audit({ action: "user.deactivate", entityType: "USER", entityId: target.id, after: { status }, meta });
  });
}

export function permissionMatrix(): Record<RoleKey, Record<string, boolean>> {
  const matrix = Object.fromEntries(
    (Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => [
      role,
      Object.fromEntries(ACTION_KEYS.map((key) => [key, false])),
    ]),
  ) as Record<RoleKey, Record<string, boolean>>;
  for (const row of all<{ role_key: RoleKey; action_key: string; allowed: number }>("SELECT * FROM permissions")) {
    if (matrix[row.role_key]) matrix[row.role_key][row.action_key] = Number(row.allowed) === 1;
  }
  return matrix;
}

export function savePermissions(
  actor: AuthUser,
  changes: Array<{ role_key: RoleKey; action_key: ActionKey; allowed: boolean }>,
  meta: WriteMeta,
): string[] {
  const errors: string[] = [];
  for (const change of changes) {
    if (
      (change.role_key === "CUSTOMER" || change.role_key === "ENGINEER") &&
      change.action_key === "admin.audit.view" &&
      change.allowed
    ) {
      errors.push("Audit access cannot be granted to Customer or Engineer roles.");
    }
  }
  if (errors.length > 0) return errors;

  transaction(() => {
    for (const change of changes) {
      const before = one<{ allowed: number }>(
        "SELECT allowed FROM permissions WHERE role_key = ? AND action_key = ?",
        change.role_key,
        change.action_key,
      );
      run(
        `INSERT INTO permissions (role_key, action_key, allowed, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(role_key, action_key) DO UPDATE SET
           allowed = excluded.allowed, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        change.role_key,
        change.action_key,
        change.allowed ? 1 : 0,
        nowIso(),
        actor.id,
      );
      if (Number(before?.allowed ?? -1) !== (change.allowed ? 1 : 0)) {
        audit({
          action: "permission.update",
          entityType: "PERMISSION",
          entityId: `${change.role_key}:${change.action_key}`,
          before: { allowed: Number(before?.allowed ?? 0) === 1 },
          after: { allowed: change.allowed },
          meta,
        });
      }
    }
  });
  return [];
}

export function auditList(filters: Record<string, unknown>): AuditRow[] {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  const action = String(filters["action"] ?? "").trim();
  if (action) {
    where.push("a.action LIKE ?");
    params.push(`%${action}%`);
  }
  const type = String(filters["entity_type"] ?? "").trim();
  if (type) {
    where.push("a.entity_type = ?");
    params.push(type);
  }
  return all(
    `SELECT a.*, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${where.join(" AND ")} ORDER BY a.at DESC LIMIT 200`,
    ...params,
  ).map(mapAudit);
}

export function archivedRecords(): { jobs: Job[]; customers: Customer[] } {
  return {
    jobs: all(
      "SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE j.archived_at IS NOT NULL ORDER BY j.archived_at DESC",
    ).map(mapJob),
    customers: all("SELECT * FROM customers WHERE archived_at IS NOT NULL ORDER BY archived_at DESC").map(mapCustomer),
  };
}

export function restoreJob(actor: AuthUser, id: string, meta: WriteMeta): void {
  run("UPDATE jobs SET archived_at = NULL, version = version + 1, updated_at = ? WHERE id = ?", nowIso(), id);
  audit({ action: "job.restore", entityType: "JOB", entityId: id, meta });
}

export function saveCompanySettings(actor: AuthUser, body: Record<string, unknown>, meta: WriteMeta): void {
  const rawVat = body["vat_rate_bp"] ?? body["vat_rate_percent"] ?? "20";
  const vat = Math.max(0, Math.min(10000, Math.round((Number.parseFloat(String(rawVat)) || 20) * 100)));
  const dueDays = Math.max(0, Math.min(365, Number.parseInt(String(body["invoice_due_days"] ?? "14"), 10) || 14));
  const footer = String(body["pdf_footer"] ?? "").trim();
  const rawTheme = String(body["theme_mode"] ?? body["default_theme"] ?? "system");
  const themeMode = ["system", "light", "dark"].includes(rawTheme) ? rawTheme : "system";
  const minLength = Math.max(8, Math.min(64, Number.parseInt(String(body["password_min_length"] ?? "10"), 10) || 10));
  const idle = Math.max(5, Math.min(1440, Number.parseInt(String(body["session_idle_minutes"] ?? "60"), 10) || 60));
  updateSettings(
    {
      "company.vat_rate_bp": vat,
      "company.invoice_due_days": dueDays,
      "company.pdf_footer": footer,
      "company.default_theme": { mode: themeMode },
      "security.password_min_length": minLength,
      "security.session_idle_minutes": idle,
    },
    actor.id,
    { requestId: meta.requestId },
  );
  run(
    "UPDATE companies SET invoice_due_days = ?, pdf_footer = ?, default_theme_json = ?, version = version + 1, updated_at = ? WHERE id = ?",
    dueDays,
    footer,
    JSON.stringify({ mode: themeMode }),
    nowIso(),
    company().id,
  );
  audit({ action: "settings.update", entityType: "SETTING", entityId: null, after: { vat, dueDays, themeMode }, meta });
}

export function settingsForAdmin(): {
  settings: Record<string, unknown>;
  company: ReturnType<typeof company>;
} {
  return { settings: settingsMap(), company: company() };
}

export { DEFAULT_MATRIX };
