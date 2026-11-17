import crypto from "node:crypto";
import { all, audit, nextSequence, one, run, setting, transaction } from "../db/index.js";
import { addDaysIso, companyYear, nowIso } from "../domain/dates.js";
import { grossFromNet, lineAmount, vatFromNet } from "../domain/money.js";
import { invoiceLines, liveInvoiceForJob } from "./access.js";

export function invoiceWithJob(id) {
  return one(
    `SELECT i.*, j.reference AS job_reference, j.title AS job_title, j.customer_id,
       c.name AS customer_name
     FROM invoices i JOIN jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id
     WHERE i.id=?`,
    id,
  );
}

export function listInvoices(filters = {}) {
  const where = ["1=1"];
  const params = [];
  if (filters.status) { where.push("i.status=?"); params.push(filters.status); }
  if (filters.q) {
    const term = `%${filters.q}%`;
    where.push("(i.number LIKE ? OR j.reference LIKE ? OR c.name LIKE ?)");
    params.push(term, term, term);
  }
  const rows = all(
    `SELECT i.*, j.reference AS job_reference, c.name AS customer_name
     FROM invoices i JOIN jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id
     WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC`,
    ...params,
  );
  return rows;
}

export function createInvoice(user, { job_id, description, qty, unit_pence, vat_rate_bp, notes }, req) {
  const job = one("SELECT * FROM jobs WHERE id=? AND archived_at IS NULL", job_id);
  if (!job) return { errors: { job_id: "Choose a job." } };
  if (liveInvoiceForJob(job.id)) return { errors: { job_id: "That job already has a live invoice. Void it before creating another." } };
  const amount = lineAmount(qty, unit_pence);
  if (!description?.trim()) return { errors: { description: "Describe the invoice line." } };
  if (!(Number(qty) > 0)) return { errors: { qty: "Quantity must be greater than zero." } };
  if (!(Number(unit_pence) >= 0)) return { errors: { unit_pence: "Enter a valid unit price." } };
  const net = amount;
  const vat = vatFromNet(net, vat_rate_bp);
  const id = crypto.randomUUID();
  const company = one("SELECT id FROM companies LIMIT 1");
  transaction(() => {
    run(
      `INSERT INTO invoices (id,company_id,number,job_id,status,issued_at,due_at,paid_at,net,vat_rate_bp,vat,gross,notes,created_by,created_at,voided_at,void_reason)
       VALUES (?,?,NULL,?,?,NULL,NULL,NULL,?,?,?,?,?,?,?,NULL,NULL)`,
      id, company.id, job.id, "DRAFT", net, vat_rate_bp, vat, net + vat, notes || null, user.id, nowIso(),
    );
    run(
      `INSERT INTO invoice_lines (id,invoice_id,description,qty,unit_pence,amount_pence,sort_order)
       VALUES (?,?,?,?,?,?,0)`,
      crypto.randomUUID(), id, description.trim(), qty, unit_pence, amount,
    );
    audit({ actorId: user.id, action: "invoice.create", entityType: "INVOICE", entityId: id, after: { job_id: job.id, net }, req });
  });
  return { invoice: invoiceWithJob(id) };
}

export function updateDraft(user, invoice, { description, qty, unit_pence, vat_rate_bp }, req) {
  if (invoice.status !== "DRAFT") return { errors: { form: "Only draft invoices can be edited." } };
  const amount = lineAmount(qty, unit_pence);
  const vat = vatFromNet(amount, vat_rate_bp);
  transaction(() => {
    run("DELETE FROM invoice_lines WHERE invoice_id=?", invoice.id);
    run(
      `INSERT INTO invoice_lines (id,invoice_id,description,qty,unit_pence,amount_pence,sort_order)
       VALUES (?,?,?,?,?,?,0)`,
      crypto.randomUUID(), invoice.id, description.trim(), qty, unit_pence, amount,
    );
    run("UPDATE invoices SET net=?, vat_rate_bp=?, vat=?, gross=? WHERE id=?",
      amount, vat_rate_bp, vat, amount + vat, invoice.id);
    audit({ actorId: user.id, action: "invoice.update", entityType: "INVOICE", entityId: invoice.id, after: { net: amount }, req });
  });
  return { invoice: invoiceWithJob(invoice.id) };
}

export function issueInvoice(user, invoice, req) {
  if (invoice.status !== "DRAFT") return { error: "Only a draft invoice can be issued." };
  if (!invoiceLines(invoice.id).length) return { error: "Add at least one line before issuing." };
  const now = nowIso();
  const dueDays = Number(setting("company.invoice_due_days", 14));
  const job = one("SELECT * FROM jobs WHERE id=?", invoice.job_id);
  return transaction(() => {
    let number = invoice.number;
    if (!number) {
      const year = companyYear(now);
      const sequence = nextSequence("invoice", year);
      number = `INV-${year}-${String(sequence).padStart(4, "0")}`;
    }
    run("UPDATE invoices SET status='ISSUED', number=?, issued_at=?, due_at=? WHERE id=?",
      number, now, addDaysIso(now, dueDays), invoice.id);
    run("UPDATE jobs SET status='INVOICED', updated_at=? WHERE id=?", now, invoice.job_id);
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), invoice.job_id, user.id, "STATUS_CHANGE", job.status, "INVOICED", `Invoice ${number} issued`, "CUSTOMER", now,
    );
    audit({ actorId: user.id, action: "invoice.issue", entityType: "INVOICE", entityId: invoice.id, after: { number, gross: invoice.gross }, req });
    return { invoice: invoiceWithJob(invoice.id) };
  });
}

export function markPaid(user, invoice, req) {
  if (invoice.status !== "ISSUED") return { error: "Only an issued invoice can be marked paid." };
  const now = nowIso();
  return transaction(() => {
    run("UPDATE invoices SET status='PAID', paid_at=? WHERE id=?", now, invoice.id);
    run("UPDATE jobs SET status='PAID', updated_at=? WHERE id=?", now, invoice.job_id);
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), invoice.job_id, user.id, "STATUS_CHANGE", "INVOICED", "PAID", `Invoice ${invoice.number} paid`, "CUSTOMER", now,
    );
    audit({ actorId: user.id, action: "invoice.paid", entityType: "INVOICE", entityId: invoice.id, after: { paid_at: now }, req });
    return { invoice: invoiceWithJob(invoice.id) };
  });
}

export function voidInvoice(user, invoice, reason, req) {
  if (invoice.status !== "ISSUED") return { error: "Only an issued invoice can be voided." };
  if (!reason?.trim()) return { error: "Add a reason before voiding." };
  const now = nowIso();
  return transaction(() => {
    run("UPDATE invoices SET status='VOID', voided_at=?, void_reason=? WHERE id=?", now, reason.trim(), invoice.id);
    run("UPDATE jobs SET status='COMPLETED', updated_at=? WHERE id=?", now, invoice.job_id);
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), invoice.job_id, user.id, "STATUS_CHANGE", "INVOICED", "COMPLETED", `Invoice ${invoice.number} voided: ${reason.trim()}`, "CUSTOMER", now,
    );
    audit({ actorId: user.id, action: "invoice.void", entityType: "INVOICE", entityId: invoice.id, after: { reason }, req });
    return { invoice: invoiceWithJob(invoice.id) };
  });
}
