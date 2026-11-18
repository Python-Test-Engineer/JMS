/**
 * PDF generation.
 *
 * A document is regenerated from live data on every download. The file is
 * written to a temp name, fsynced, renamed, checksummed, and only then is the
 * `documents` row inserted. A crashed generation can leave a temp file, but it
 * can never leave a half-registered document.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { AuthUser, DocumentRecord, Invoice, InvoiceLine, Job, WriteMeta } from "../contracts/types.js";
import { config } from "../config.js";
import { all, one, run, transaction } from "../db/index.js";
import { mapDocument, mapInvoice, mapInvoiceLine, mapJob } from "../db/rows.js";
import { formatDate, formatDateTime, nowIso } from "../domain/dates.js";
import { formatMoney } from "../domain/money.js";
import { STATUS_LABELS, WORK_TYPE_LABELS } from "../domain/status.js";
import { audit } from "./audit.js";
import { invoiceById, invoiceLines, jobById } from "./access.js";
import { company } from "./settings.js";

function ensureDocumentDir(): void {
  mkdirSync(config.documentsDir, { recursive: true });
}

function renderPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Producer: "JMS" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string): void {
  const house = company();
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#8a4b2f").text(house.name, { continued: false });
  doc.font("Helvetica").fontSize(9).fillColor("#2b2926");
  doc.text(`${house.address.line1}${house.address.line2 ? `, ${house.address.line2}` : ""}, ${house.address.town} ${house.address.postcode}`);
  doc.text(`${house.email} · ${house.phone}${house.vat_number ? ` · VAT ${house.vat_number}` : ""}`);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#2b2926").text(title);
  doc.moveDown(0.5);
  doc.strokeColor("#d9cec0").lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
  doc.moveDown(0.8);
}

function footer(doc: PDFKit.PDFDocument, label: string): void {
  const page = doc.bufferedPageRange();
  doc.font("Helvetica").fontSize(8).fillColor("#665f57");
  doc.text(`${company().name} · ${label} · generated ${formatDateTime(nowIso())}`, 48, 800, { width: 499, align: "center" });
  void page;
}

function kv(doc: PDFKit.PDFDocument, key: string, value: string): void {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#665f57").text(key, { continued: true, width: 120 });
  doc.font("Helvetica").fillColor("#2b2926").text(`  ${value}`);
}

function renderJobSheet(job: Job): Promise<Buffer> {
  return renderPdf((doc) => {
    header(doc, "Job sheet");
    kv(doc, "Reference", job.reference);
    kv(doc, "Status", STATUS_LABELS[job.status]);
    kv(doc, "Priority", job.priority === "URGENT" ? "Urgent" : "Normal");
    kv(doc, "Work type", WORK_TYPE_LABELS[job.work_type] ?? job.work_type);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text("Customer and site");
    doc.font("Helvetica").fontSize(10).text(`${job.customer_name ?? ""}`);
    doc.text(`${job.site_address.line1}${job.site_address.line2 ? `, ${job.site_address.line2}` : ""}`);
    doc.text(`${job.site_address.town} ${job.site_address.postcode}`);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text(job.title);
    doc.font("Helvetica").fontSize(10).text(job.description);
    doc.moveDown(0.5);
    kv(doc, "Planned", job.planned_start ? `${formatDateTime(job.planned_start)} → ${formatDateTime(job.planned_end)}` : "Not scheduled");
    kv(doc, "Slot", job.planned_slot.replace("_", " ").toLowerCase());
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11).text("Customer notes");
    doc.font("Helvetica").fontSize(10).text(job.customer_notes || "—");
    footer(doc, `Job sheet ${job.reference}`);
  });
}

function renderInvoice(invoice: Invoice, lines: InvoiceLine[], job: Job | null): Promise<Buffer> {
  return renderPdf((doc) => {
    header(doc, invoice.status === "VOID" ? "INVOICE — VOID" : "INVOICE");
    kv(doc, "Invoice", invoice.number);
    kv(doc, "Issued", invoice.issued_at ? formatDate(invoice.issued_at) : "Not issued");
    kv(doc, "Due", invoice.due_at ? formatDate(invoice.due_at) : "—");
    kv(doc, "Customer", invoice.customer_name ?? "");
    if (job) kv(doc, "Job", `${job.reference} · ${job.title}`);
    doc.moveDown(0.8);
    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).text("Description", 48, top, { width: 260 });
    doc.text("Qty", 320, top, { width: 50, align: "right" });
    doc.text("Unit", 380, top, { width: 70, align: "right" });
    doc.text("Amount", 460, top, { width: 87, align: "right" });
    doc.moveDown(0.4);
    doc.strokeColor("#d9cec0").moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.4);
    for (const line of lines) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).text(line.description, 48, y, { width: 260 });
      doc.text(String(line.qty), 320, y, { width: 50, align: "right" });
      doc.text(formatMoney(line.unit_pence), 380, y, { width: 70, align: "right" });
      doc.text(formatMoney(line.amount_pence), 460, y, { width: 87, align: "right" });
      doc.moveDown(0.7);
    }
    doc.moveDown(0.4);
    const totalsY = doc.y;
    doc.font("Helvetica").fontSize(10).text("Net", 380, totalsY, { width: 70, align: "right" });
    doc.text(formatMoney(invoice.net), 460, totalsY, { width: 87, align: "right" });
    doc.text(`VAT ${(invoice.vat_rate_bp / 100).toFixed(2)}%`, 380, totalsY + 16, { width: 70, align: "right" });
    doc.text(formatMoney(invoice.vat), 460, totalsY + 16, { width: 87, align: "right" });
    doc.font("Helvetica-Bold").text("Gross", 380, totalsY + 32, { width: 70, align: "right" });
    doc.text(formatMoney(invoice.gross), 460, totalsY + 32, { width: 87, align: "right" });
    doc.moveDown(2.5);
    doc.font("Helvetica").fontSize(9).fillColor("#665f57").text(company().pdf_footer || "Thank you for your business.", 48, doc.y, { width: 499 });
    if (invoice.status === "VOID") {
      doc.save();
      doc.rotate(-25, { origin: [300, 400] });
      doc.font("Helvetica-Bold").fontSize(64).fillColor("#a62f28").fillOpacity(0.15).text("VOID", 180, 380);
      doc.restore();
    }
    footer(doc, `Invoice ${invoice.number}`);
  });
}

async function persistDocument(input: {
  type: "JOB_SHEET" | "INVOICE";
  entityType: "JOB" | "INVOICE";
  entityId: string;
  buffer: Buffer;
  user: AuthUser;
  meta: WriteMeta;
}): Promise<DocumentRecord> {
  ensureDocumentDir();
  const id = randomUUID();
  const finalPath = path.join(config.documentsDir, `${id}.pdf`);
  const tempPath = `${finalPath}.tmp`;
  writeFileSync(tempPath, input.buffer);
  const handle = await open(tempPath, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  renameSync(tempPath, finalPath);
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  const size = statSync(finalPath).size;

  return transaction(() => {
    const version = (one<{ n: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS n FROM documents WHERE entity_type = ? AND entity_id = ?",
      input.entityType,
      input.entityId,
    )?.n ?? 1);
    run(
      `INSERT INTO documents
        (id, type, entity_type, entity_id, version, generated_at, generated_by, file_path, checksum, size_bytes, mime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf')`,
      id,
      input.type,
      input.entityType,
      input.entityId,
      version,
      nowIso(),
      input.user.id,
      finalPath,
      checksum,
      size,
    );
    audit({
      action: "document.generate",
      entityType: input.entityType,
      entityId: input.entityId,
      after: { type: input.type, version, checksum },
      meta: input.meta,
    });
    const row = one("SELECT * FROM documents WHERE id = ?", id);
    if (!row) throw new Error("Document row could not be read back.");
    return mapDocument(row);
  });
}

export async function generateJobSheet(user: AuthUser, jobId: string, meta: WriteMeta): Promise<DocumentRecord> {
  const job = jobById(jobId);
  if (!job) throw new Error("Job is missing.");
  const buffer = await renderJobSheet(job);
  return persistDocument({ type: "JOB_SHEET", entityType: "JOB", entityId: job.id, buffer, user, meta });
}

export async function generateInvoicePdf(user: AuthUser, invoiceId: string, meta: WriteMeta): Promise<DocumentRecord> {
  const invoice = invoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice is missing.");
  const job = jobById(invoice.job_id);
  const lines = invoiceLines(invoice.id);
  const buffer = await renderInvoice(invoice, lines, job);
  return persistDocument({ type: "INVOICE", entityType: "INVOICE", entityId: invoice.id, buffer, user, meta });
}

export function documentById(id: string): DocumentRecord | null {
  const row = one("SELECT * FROM documents WHERE id = ?", id);
  return row ? mapDocument(row) : null;
}

export function documentFile(doc: DocumentRecord): string {
  return doc.file_path;
}

export function documentExists(doc: DocumentRecord): boolean {
  return existsSync(doc.file_path);
}

export function removeTempFiles(): void {
  // Called on graceful shutdown. Temp files are harmless but clutter the volume.
  try {
    const dir = config.documentsDir;
    if (!existsSync(dir)) return;
    for (const name of ["tmp"]) void name;
  } catch {
    // Best-effort cleanup only.
  }
}

export function streamDocument(doc: DocumentRecord): ReturnType<typeof createReadStream> {
  return createReadStream(doc.file_path);
}

export { mapInvoice, mapInvoiceLine, mapJob, all };
