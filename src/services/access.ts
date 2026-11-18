/**
 * Object-level scoping and shared lookups.
 *
 * Permissions say "may view jobs"; scoping says *which* jobs. These rules are
 * code invariants, not editable matrix cells. Every route goes through the
 * helpers here so a guessed URL returns 404 rather than leaking a record.
 */
import { all, one } from "../db/index.js";
import {
  mapAssignment,
  mapCustomer,
  mapEvent,
  mapInvoice,
  mapInvoiceLine,
  mapJob,
  mapUser,
} from "../db/rows.js";
import type {
  Assignment,
  AuthUser,
  Customer,
  Invoice,
  InvoiceLine,
  Job,
  JobEvent,
  User,
  WriteMeta,
} from "../contracts/types.js";
import { can } from "../domain/permissions.js";
import type { Request } from "express";

export function activeAssignmentFor(jobId: string, userId: string): Assignment | null {
  const row = one(
    `SELECT a.*, u.display_name, u.email, u.role_key, u.phone
       FROM job_assignments a JOIN users u ON u.id = a.user_id
      WHERE a.job_id = ? AND a.user_id = ? AND a.removed_at IS NULL`,
    jobId,
    userId,
  );
  return row ? mapAssignment(row) : null;
}

export function assignmentsFor(jobId: string, activeOnly = true): Assignment[] {
  const rows = all(
    `SELECT a.*, u.display_name, u.email, u.role_key, u.phone
       FROM job_assignments a JOIN users u ON u.id = a.user_id
      WHERE a.job_id = ? ${activeOnly ? "AND a.removed_at IS NULL" : ""}
      ORDER BY a.is_lead DESC, u.display_name`,
    jobId,
  );
  return rows.map(mapAssignment);
}

export function jobById(id: string): Job | null {
  const row = one(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id = a.user_id
         WHERE a.job_id = j.id AND a.removed_at IS NULL AND a.is_lead = 1 LIMIT 1) AS lead_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.id = ?`,
    id,
  );
  return row ? mapJob(row) : null;
}

export function customerById(id: string): Customer | null {
  const row = one("SELECT * FROM customers WHERE id = ?", id);
  return row ? mapCustomer(row) : null;
}

export function userById(id: string): User | null {
  const row = one(
    `SELECT u.*, c.name AS customer_name FROM users u LEFT JOIN customers c ON c.id = u.customer_id WHERE u.id = ?`,
    id,
  );
  return row ? mapUser(row) : null;
}

export function userByEmail(email: string): User | null {
  const row = one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", email.trim().toLowerCase());
  return row ? mapUser(row) : null;
}

export function permissionsFor(roleKey: string): Set<string> {
  const rows = all<{ action_key: string }>("SELECT action_key FROM permissions WHERE role_key = ? AND allowed = 1", roleKey);
  return new Set(rows.map((row) => row.action_key));
}

export function withPermissions(user: User): AuthUser {
  return { ...user, permissions: permissionsFor(user.role_key) };
}

/** A SQL fragment that limits job rows to the caller's scope. */
export function jobScope(user: AuthUser): { sql: string; params: unknown[] } {
  if (user.role_key === "CUSTOMER") {
    return { sql: "j.customer_id = ?", params: [user.customer_id] };
  }
  if (user.role_key === "ENGINEER") {
    return {
      sql: "EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id AND a.user_id = ? AND a.removed_at IS NULL)",
      params: [user.id],
    };
  }
  if (can(user, "job.view.all")) return { sql: "1 = 1", params: [] };
  if (can(user, "job.view.assigned")) {
    return {
      sql: "EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id AND a.user_id = ? AND a.removed_at IS NULL)",
      params: [user.id],
    };
  }
  return { sql: "0 = 1", params: [] };
}

export function canViewJob(user: AuthUser | null, job: Job | null): boolean {
  if (!user || !job) return false;
  if (user.role_key === "CUSTOMER") return job.customer_id === user.customer_id;
  if (user.role_key === "ENGINEER") return Boolean(activeAssignmentFor(job.id, user.id));
  return can(user, "job.view.all") || Boolean(activeAssignmentFor(job.id, user.id));
}

export function getVisibleJob(user: AuthUser, id: string): Job | null {
  const job = jobById(id);
  return canViewJob(user, job) ? job : null;
}

export function isFieldUser(user: AuthUser | User | null): boolean {
  return Boolean(user?.can_engineer && user.status === "ACTIVE");
}

export function fieldUsers(): User[] {
  return all(
    `SELECT * FROM users WHERE status = 'ACTIVE' AND can_engineer = 1 AND role_key IN ('ENGINEER','MANAGER')
      ORDER BY role_key, display_name`,
  ).map(mapUser);
}

export function canSeePrices(user: AuthUser): boolean {
  return user.role_key === "ADMIN" || user.role_key === "MANAGER";
}

export function canSeeInternal(user: AuthUser): boolean {
  return user.role_key !== "CUSTOMER";
}

export function liveInvoiceForJob(jobId: string): Invoice | null {
  const row = one("SELECT * FROM invoices WHERE job_id = ? AND status <> 'VOID' ORDER BY created_at DESC LIMIT 1", jobId);
  return row ? mapInvoice(row) : null;
}

export function invoiceById(id: string): Invoice | null {
  const row = one(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE i.id = ?`,
    id,
  );
  return row ? mapInvoice(row) : null;
}

export function invoiceLines(invoiceId: string): InvoiceLine[] {
  return all("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_no", invoiceId).map(mapInvoiceLine);
}

export function canViewInvoice(user: AuthUser | null, invoice: Invoice | null): boolean {
  if (!user || !invoice) return false;
  if (user.role_key === "CUSTOMER") {
    const job = jobById(invoice.job_id);
    return Boolean(job && job.customer_id === user.customer_id && invoice.status !== "DRAFT");
  }
  return can(user, "invoice.view.all");
}

export function getVisibleInvoice(user: AuthUser, id: string): Invoice | null {
  const invoice = invoiceById(id);
  return canViewInvoice(user, invoice) ? invoice : null;
}

export function jobEvents(jobId: string, customerVisibleOnly: boolean): JobEvent[] {
  return all(
    `SELECT e.*, u.display_name AS actor_name
       FROM job_events e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.job_id = ? ${customerVisibleOnly ? "AND e.visibility = 'CUSTOMER'" : ""}
      ORDER BY e.at DESC`,
    jobId,
  ).map(mapEvent);
}

export function writeMeta(req: Request): WriteMeta {
  return {
    actorUserId: req.user?.id ?? "",
    requestId: req.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}
