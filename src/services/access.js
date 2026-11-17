import { all, one } from "../db/index.js";
import { can } from "../domain/permissions.js";

export function activeAssignmentFor(jobId, userId) {
  return one(
    "SELECT * FROM job_assignments WHERE job_id=? AND user_id=? AND removed_at IS NULL",
    jobId, userId,
  );
}

export function assignmentsFor(jobId, { activeOnly = true } = {}) {
  return all(
    `SELECT a.*, u.display_name, u.email, u.role_key, u.phone
     FROM job_assignments a JOIN users u ON u.id=a.user_id
     WHERE a.job_id=? ${activeOnly ? "AND a.removed_at IS NULL" : ""}
     ORDER BY a.is_lead DESC, u.display_name`,
    jobId,
  );
}

export function jobById(id) {
  return one("SELECT * FROM jobs WHERE id=?", id);
}

export function customerById(id) {
  return one("SELECT * FROM customers WHERE id=?", id);
}

/**
 * Object-level job scope (_TECH.md §10.3). Returns a SQL fragment and params.
 */
export function jobScope(user) {
  if (!user) return { sql: "0=1", params: [] };
  if (user.role_key === "CUSTOMER") return { sql: "j.customer_id = ?", params: [user.customer_id] };
  if (user.role_key === "ENGINEER") {
    return {
      sql: `EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.user_id=? AND a.removed_at IS NULL)`,
      params: [user.id],
    };
  }
  if (can(user, "job.view.all")) return { sql: "1=1", params: [] };
  if (can(user, "job.view.assigned")) {
    return {
      sql: `EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.user_id=? AND a.removed_at IS NULL)`,
      params: [user.id],
    };
  }
  return { sql: "0=1", params: [] };
}

export function canViewJob(user, job) {
  if (!user || !job) return false;
  if (user.role_key === "CUSTOMER") return job.customer_id === user.customer_id;
  if (user.role_key === "ENGINEER") return Boolean(activeAssignmentFor(job.id, user.id));
  return can(user, "job.view.all");
}

export function getVisibleJob(user, id) {
  const job = jobById(id);
  if (!job || !canViewJob(user, job)) return null;
  return job;
}

export function isFieldUser(user) {
  return Boolean(user?.can_engineer && user.status === "ACTIVE");
}

export function assignedToJob(jobId, userId) {
  return Boolean(activeAssignmentFor(jobId, userId));
}

export function canSeePrices(user) {
  return user?.role_key === "ADMIN" || user?.role_key === "MANAGER";
}

export function canSeeInternal(user) {
  return user?.role_key === "ADMIN" || user?.role_key === "MANAGER" || user?.role_key === "ENGINEER";
}

export function fieldTabs(user) {
  return all(
    `SELECT * FROM users WHERE status='ACTIVE' AND can_engineer=1 AND role_key IN ('ENGINEER','MANAGER')
     ORDER BY role_key, display_name`,
  );
}

export function liveInvoiceForJob(jobId) {
  return one("SELECT * FROM invoices WHERE job_id=? AND status<>'VOID' ORDER BY created_at DESC LIMIT 1", jobId);
}

export function invoiceById(id) {
  return one("SELECT * FROM invoices WHERE id=?", id);
}

export function invoiceLines(invoiceId) {
  return all("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY sort_order, rowid", invoiceId);
}

export function canViewInvoice(user, invoice) {
  if (!user || !invoice) return false;
  if (user.role_key === "CUSTOMER") {
    const job = jobById(invoice.job_id);
    return Boolean(job && job.customer_id === user.customer_id && invoice.status !== "DRAFT");
  }
  return can(user, "invoice.view.all");
}

export function getVisibleInvoice(user, id) {
  const invoice = invoiceById(id);
  return invoice && canViewInvoice(user, invoice) ? invoice : null;
}
