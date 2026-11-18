/**
 * Invoice services.
 *
 * Number allocation and line totals are recomputed inside the same transaction
 * that writes the invoice. Money is integer pence throughout; the database's
 * `gross = net + vat` check is a final backstop.
 */
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "../db/index.js";
import { mapInvoice, mapInvoiceLine, mapJob } from "../db/rows.js";
import type { AuthUser, Invoice, InvoiceLine, InvoiceStatus, Job, WriteMeta } from "../contracts/types.js";
import { companyYear, nowIso } from "../domain/dates.js";
import { grossFromNet, lineAmount, parsePoundsToPence, parseQtyToMilli, vatFromNet } from "../domain/money.js";
import { audit } from "./audit.js";
import { invoiceById, invoiceLines, liveInvoiceForJob, jobById } from "./access.js";
import { company } from "./settings.js";

function nextInvoiceNumber(year: number): string {
  const existing = one<{ value: number }>("SELECT value FROM sequences WHERE kind = 'invoice' AND year = ?", year);
  const value = (existing?.value ?? 0) + 1;
  if (existing) run("UPDATE sequences SET value = ? WHERE kind = 'invoice' AND year = ?", value, year);
  else run("INSERT INTO sequences (kind, year, value) VALUES ('invoice', ?, ?)", year, value);
  return `INV-${year}-${String(value).padStart(4, "0")}`;
}

export interface InvoiceLineInput {
  description: string;
  qty_milli: number;
  unit_pence: number;
}

export interface InvoiceInput {
  job_id: string;
  description: string;
  qty_milli: number;
  unit_pence: number;
  vat_rate_bp: number;
  notes: string | null;
}

export function validateInvoiceInput(body: Record<string, unknown>): { values: InvoiceInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const jobId = String(body["job_id"] ?? "");
  const job = jobById(jobId);
  if (!job) errors["job_id"] = "Choose a job.";
  const description = String(body["description"] ?? "").trim();
  if (!description) errors["description"] = "Describe the invoice line.";
  let qtyMilli = 0;
  try {
    qtyMilli = parseQtyToMilli(body["qty"]);
    if (qtyMilli <= 0) errors["qty"] = "Quantity must be positive.";
  } catch (error) {
    errors["qty"] = error instanceof Error ? error.message : "Enter a quantity.";
  }
  let unitPence = 0;
  try {
    unitPence = parsePoundsToPence(body["unit_pence"]) ?? 0;
  } catch (error) {
    errors["unit_pence"] = error instanceof Error ? error.message : "Enter a unit price.";
  }
  const vatRateBp = Math.max(0, Math.min(10000, Number.parseInt(String(body["vat_rate_bp"] ?? "2000"), 10) || 2000));
  return {
    values: {
      job_id: jobId,
      description,
      qty_milli: qtyMilli,
      unit_pence: unitPence,
      vat_rate_bp: vatRateBp,
      notes: String(body["notes"] ?? "").trim() || null,
    },
    errors,
  };
}

export function createInvoice(user: AuthUser, values: InvoiceInput, meta: WriteMeta): Invoice {
  const job = jobById(values.job_id);
  if (!job) throw new Error("Job is missing.");
  if (job.status !== "COMPLETED") throw new Error("Only a completed job can be invoiced.");
  if (liveInvoiceForJob(job.id)) throw new Error("This job already has a live invoice. Void it before re-issuing.");
  const id = randomUUID();
  const now = nowIso();
  const year = companyYear(now);
  const amount = lineAmount(values.qty_milli, values.unit_pence);
  const vat = vatFromNet(amount, values.vat_rate_bp);
  const gross = amount + vat;

  return transaction(() => {
    const number = nextInvoiceNumber(year);
    run(
      `INSERT INTO invoices
        (id, company_id, number, job_id, status, issued_at, due_at, paid_at, net, vat_rate_bp, vat, gross,
         notes, version, created_by, created_at, voided_at, void_reason)
       VALUES (?, ?, ?, ?, 'DRAFT', NULL, NULL, NULL, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL)`,
      id,
      job.company_id,
      number,
      job.id,
      amount,
      values.vat_rate_bp,
      vat,
      gross,
      values.notes,
      user.id,
      now,
    );
    run(
      `INSERT INTO invoice_lines (id, invoice_id, line_no, description, qty_milli, unit_pence, amount_pence)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
      randomUUID(),
      id,
      values.description,
      values.qty_milli,
      values.unit_pence,
      amount,
    );
    audit({ action: "invoice.create", entityType: "INVOICE", entityId: id, after: { number, job_id: job.id, gross }, meta });
    const created = invoiceById(id);
    if (!created) throw new Error("Created invoice could not be read back.");
    return created;
  });
}

export function issueInvoice(user: AuthUser, invoice: Invoice, meta: WriteMeta): Invoice {
  if (invoice.status !== "DRAFT") throw new Error("Only a draft invoice can be issued.");
  const job = jobById(invoice.job_id);
  if (!job) throw new Error("Invoice job is missing.");
  const now = nowIso();
  const due = new Date(Date.now() + company().invoice_due_days * 86_400_000).toISOString();
  return transaction(() => {
    run(
      "UPDATE invoices SET status = 'ISSUED', issued_at = ?, due_at = ?, version = version + 1 WHERE id = ? AND version = ?",
      now,
      due,
      invoice.id,
      invoice.version,
    );
    run("UPDATE jobs SET status = 'INVOICED', version = version + 1, updated_at = ? WHERE id = ?", now, job.id);
    run(
      `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
       VALUES (?, ?, ?, 'STATUS_CHANGE', 'COMPLETED', 'INVOICED', ?, 'CUSTOMER', ?)`,
      randomUUID(),
      job.id,
      user.id,
      `Invoice ${invoice.number} issued`,
      now,
    );
    audit({ action: "invoice.issue", entityType: "INVOICE", entityId: invoice.id, after: { number: invoice.number }, meta });
    const updated = invoiceById(invoice.id);
    if (!updated) throw new Error("Issued invoice could not be read back.");
    return updated;
  });
}

export function markInvoicePaid(user: AuthUser, invoice: Invoice, meta: WriteMeta): Invoice {
  if (invoice.status !== "ISSUED") throw new Error("Only an issued invoice can be marked paid.");
  const now = nowIso();
  return transaction(() => {
    run("UPDATE invoices SET status = 'PAID', paid_at = ?, version = version + 1 WHERE id = ? AND version = ?", now, invoice.id, invoice.version);
    run("UPDATE jobs SET status = 'PAID', version = version + 1, updated_at = ? WHERE id = ?", now, invoice.job_id);
    audit({ action: "invoice.paid", entityType: "INVOICE", entityId: invoice.id, after: { paid_at: now }, meta });
    const updated = invoiceById(invoice.id);
    if (!updated) throw new Error("Paid invoice could not be read back.");
    return updated;
  });
}

export function voidInvoice(user: AuthUser, invoice: Invoice, reason: string, meta: WriteMeta): Invoice {
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") throw new Error("Only an issued invoice can be voided.");
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Give a reason for voiding the invoice.");
  const now = nowIso();
  return transaction(() => {
    run(
      "UPDATE invoices SET status = 'VOID', voided_at = ?, void_reason = ?, version = version + 1 WHERE id = ? AND version = ?",
      now,
      cleanReason,
      invoice.id,
      invoice.version,
    );
    run("UPDATE jobs SET status = 'COMPLETED', version = version + 1, updated_at = ? WHERE id = ?", now, invoice.job_id);
    run(
      `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
       VALUES (?, ?, ?, 'STATUS_CHANGE', 'INVOICED', 'COMPLETED', ?, 'CUSTOMER', ?)`,
      randomUUID(),
      invoice.job_id,
      user.id,
      `Invoice ${invoice.number} voided: ${cleanReason}`,
      now,
    );
    audit({ action: "invoice.void", entityType: "INVOICE", entityId: invoice.id, after: { reason: cleanReason }, meta });
    const updated = invoiceById(invoice.id);
    if (!updated) throw new Error("Voided invoice could not be read back.");
    return updated;
  });
}

export function listInvoices(filters: Record<string, unknown>): { rows: Invoice[]; totals: Record<string, number> } {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  const status = String(filters["status"] ?? "");
  if (["DRAFT", "ISSUED", "PAID", "VOID"].includes(status)) {
    where.push("i.status = ?");
    params.push(status);
  }
  const query = String(filters["q"] ?? "").trim();
  if (query) {
    const term = `%${query}%`;
    where.push("(i.number LIKE ? OR c.name LIKE ? OR j.reference LIKE ?)");
    params.push(term, term, term);
  }
  const whereSql = where.join(" AND ");
  const rows = all(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE ${whereSql} ORDER BY i.created_at DESC`,
    ...params,
  ).map(mapInvoice);
  const totals = { draft: 0, issued: 0, paid: 0, void: 0 };
  for (const row of all<{ status: string; total: number }>(
    `SELECT i.status, COALESCE(SUM(i.gross), 0) AS total FROM invoices i
       JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE ${whereSql} GROUP BY i.status`,
    ...params,
  )) {
    const key = row.status.toLowerCase();
    if (key in totals) totals[key as keyof typeof totals] = Number(row.total);
  }
  return { rows, totals };
}

export function invoiceDetail(invoice: Invoice): {
  invoice: Invoice;
  lines: InvoiceLine[];
  job: Job | null;
  documents: ReturnType<typeof all>;
} {
  return {
    invoice,
    lines: invoiceLines(invoice.id),
    job: jobById(invoice.job_id),
    documents: all("SELECT * FROM documents WHERE entity_type = 'INVOICE' AND entity_id = ? ORDER BY generated_at DESC", invoice.id),
  };
}

export function completedJobsWithoutInvoice(): Job[] {
  return all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.status = 'COMPLETED' AND j.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status <> 'VOID')
      ORDER BY j.actual_end DESC, j.created_at DESC`,
  ).map(mapJob);
}

export function invoiceTotalCounts(): Record<InvoiceStatus, { n: number; gross: number }> {
  const result: Record<InvoiceStatus, { n: number; gross: number }> = {
    DRAFT: { n: 0, gross: 0 },
    ISSUED: { n: 0, gross: 0 },
    PAID: { n: 0, gross: 0 },
    VOID: { n: 0, gross: 0 },
  };
  for (const row of all<{ status: InvoiceStatus; n: number; gross: number }>(
    "SELECT status, COUNT(*) AS n, COALESCE(SUM(gross), 0) AS gross FROM invoices GROUP BY status",
  )) {
    result[row.status] = { n: Number(row.n), gross: Number(row.gross) };
  }
  return result;
}

export function invoiceLinesForDisplay(invoiceId: string): InvoiceLine[] {
  return invoiceLines(invoiceId).map((line) => ({ ...line, qty: line.qty_milli / 1000 }));
}

export function jobForInvoice(job: Job): Job {
  return job;
}

export function recomputeInvoiceTotals(invoiceId: string): { net: number; vat: number; gross: number } {
  const lines = invoiceLines(invoiceId);
  const net = lines.reduce((sum, line) => sum + line.amount_pence, 0);
  const invoice = one<{ vat_rate_bp: number }>("SELECT vat_rate_bp FROM invoices WHERE id = ?", invoiceId);
  const vat = vatFromNet(net, invoice?.vat_rate_bp ?? 2000);
  return { net, vat, gross: net + vat };
}

export { grossFromNet, mapInvoiceLine, mapJob };
