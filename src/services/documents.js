import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { config } from "../config.js";
import { all, audit, one, run } from "../db/index.js";
import { formatDate, formatDateTime } from "../domain/dates.js";
import { formatMoney } from "../domain/money.js";
import { STATUS_LABELS, WORK_TYPE_LABELS } from "../domain/status.js";
import { assignmentsFor, canSeePrices, customerById, invoiceLines } from "./access.js";

const PAGE = { width: 595.28, height: 841.89, margin: 48 };

function company() {
  const row = one("SELECT * FROM companies LIMIT 1");
  if (!row) return {};
  try { row.address = JSON.parse(row.address_json); } catch { row.address = {}; }
  return row;
}

function renderToFile(filePath, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);
    try { draw(doc); } catch (error) { reject(error); return; }
    doc.end();
  });
}

function header(doc, title, subtitle) {
  const c = company();
  doc.fillColor("#3d3a36").font("Helvetica-Bold").fontSize(18).text(c.name || "Acme Windows");
  doc.font("Helvetica").fontSize(9).fillColor("#665f57");
  if (c.address) {
    doc.text([c.address.line1, c.address.line2, c.address.town, c.address.postcode].filter(Boolean).join(", "));
  }
  doc.text([c.email, c.phone].filter(Boolean).join(" · "));
  if (c.vat_number) doc.text(`VAT ${c.vat_number}`);
  doc.moveDown(1);
  doc.fillColor("#8a4b2f").font("Helvetica-Bold").fontSize(16).text(title);
  if (subtitle) doc.fillColor("#665f57").font("Helvetica").fontSize(10).text(subtitle);
  doc.moveDown(0.6);
  doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.width - PAGE.margin, doc.y).strokeColor("#c9b9a8").stroke();
  doc.moveDown(0.8);
}

function field(doc, label, value) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#665f57").text(String(label).toUpperCase());
  doc.font("Helvetica").fontSize(10.5).fillColor("#2b2926").text(String(value ?? "—"));
  doc.moveDown(0.45);
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.font("Helvetica").fontSize(8).fillColor("#8b847b");
    doc.text(
      `${company().name || "Acme Windows"} · page ${i + 1} of ${range.count} · generated ${formatDateTime(new Date().toISOString())}`,
      PAGE.margin, PAGE.height - 34, { width: PAGE.width - PAGE.margin * 2, align: "center" },
    );
  }
}

async function createDocument({ user, type, entityType, entityId, req, draw }) {
  const id = crypto.randomUUID();
  const version = one(
    "SELECT COUNT(*) AS n FROM documents WHERE entity_type=? AND entity_id=? AND type=?",
    entityType, entityId, type,
  ).n + 1;
  const filePath = path.join(config.pdfDir, `${id}.pdf`);
  fs.mkdirSync(config.pdfDir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await renderToFile(tmpPath, draw);
  fs.renameSync(tmpPath, filePath);
  const buffer = fs.readFileSync(filePath);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const doc = {
    id, type, entity_type: entityType, entity_id: entityId, version,
    generated_at: new Date().toISOString(), generated_by: user.id,
    file_path: filePath, checksum, size_bytes: buffer.length, mime: "application/pdf",
  };
  run(
    `INSERT INTO documents (id,type,entity_type,entity_id,version,generated_at,generated_by,file_path,checksum,size_bytes,mime)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    doc.id, doc.type, doc.entity_type, doc.entity_id, doc.version, doc.generated_at,
    doc.generated_by, doc.file_path, doc.checksum, doc.size_bytes, doc.mime,
  );
  audit({ actorId: user.id, action: "document.generate", entityType, entityId, after: { type, version }, req });
  return doc;
}

export function generateJobSheet({ user, job, req }) {
  const customer = customerById(job.customer_id);
  let site = {};
  try { site = JSON.parse(job.site_address_json); } catch { site = {}; }
  const assignments = assignmentsFor(job.id);
  const showPrices = canSeePrices(user);
  const showInternal = user.role_key !== "CUSTOMER";

  return createDocument({
    user, type: "JOB_SHEET", entityType: "JOB", entityId: job.id, req,
    draw: (doc) => {
      header(doc, "Job sheet", `${job.reference} · ${STATUS_LABELS[job.status] || job.status}`);
      field(doc, "Customer", customer?.name);
      field(doc, "Site", [site.line1, site.line2, site.town, site.postcode].filter(Boolean).join(", "));
      field(doc, "Work type", WORK_TYPE_LABELS[job.work_type] || job.work_type);
      field(doc, "Priority", job.priority === "URGENT" ? "Urgent" : "Normal");
      field(doc, "Title", job.title);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#665f57").text("DESCRIPTION");
      doc.font("Helvetica").fontSize(10.5).fillColor("#2b2926").text(job.description || "—");
      doc.moveDown(0.7);
      field(doc, "Planned", job.planned_start
        ? `${formatDateTime(job.planned_start)} → ${formatDateTime(job.planned_end)} (${job.planned_slot.replace("_", " ").toLowerCase()})`
        : "Not scheduled");
      field(doc, "Assigned", assignments.map((a) => `${a.display_name}${a.is_lead ? " (lead)" : ""}`).join(", ") || "Unassigned");
      if (job.customer_notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#665f57").text("CUSTOMER NOTES");
        doc.font("Helvetica").fontSize(10.5).fillColor("#2b2926").text(job.customer_notes);
        doc.moveDown(0.7);
      }
      if (showInternal && job.internal_notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#8a4b2f").text("INTERNAL NOTES — NOT FOR CUSTOMER");
        doc.font("Helvetica").fontSize(10.5).fillColor("#2b2926").text(job.internal_notes);
        doc.moveDown(0.7);
      }
      if (showPrices && job.price_net !== null) {
        field(doc, "Price (net)", formatMoney(job.price_net, config.CURRENCY));
        field(doc, "VAT", `${(job.vat_rate_bp / 100).toFixed(2)}%`);
        field(doc, "Total (gross)", formatMoney(job.price_gross, config.CURRENCY));
      }
      footer(doc);
    },
  });
}

export function generateInvoicePdf({ user, invoice, req }) {
  const job = one("SELECT * FROM jobs WHERE id=?", invoice.job_id);
  const customer = job ? customerById(job.customer_id) : null;
  const lines = invoiceLines(invoice.id);

  return createDocument({
    user, type: "INVOICE", entityType: "INVOICE", entityId: invoice.id, req,
    draw: (doc) => {
      header(doc, "Invoice", invoice.number || "Draft");
      if (invoice.status === "VOID") {
        doc.save();
        doc.fillColor("#b23a2f").opacity(0.18).font("Helvetica-Bold").fontSize(90)
          .text("VOID", 0, 360, { align: "center", width: PAGE.width });
        doc.restore();
      }
      field(doc, "Issued", invoice.issued_at ? formatDate(invoice.issued_at) : "Not issued");
      field(doc, "Due", invoice.due_at ? formatDate(invoice.due_at) : "—");
      field(doc, "Customer", customer?.name);
      field(doc, "Job", job?.reference);
      doc.moveDown(0.4);
      const tableTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#665f57");
      doc.text("Description", PAGE.margin, tableTop, { width: 300 });
      doc.text("Qty", 365, tableTop, { width: 50, align: "right" });
      doc.text("Unit", 420, tableTop, { width: 55, align: "right" });
      doc.text("Amount", 480, tableTop, { width: 65, align: "right" });
      doc.moveDown(0.4);
      doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.width - PAGE.margin, doc.y).strokeColor("#d9cfc4").stroke();
      doc.moveDown(0.4);
      for (const line of lines) {
        const y = doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("#2b2926");
        doc.text(line.description, PAGE.margin, y, { width: 300 });
        doc.text(String(line.qty), 365, y, { width: 50, align: "right" });
        doc.text(formatMoney(line.unit_pence, config.CURRENCY), 420, y, { width: 55, align: "right" });
        doc.text(formatMoney(line.amount_pence, config.CURRENCY), 480, y, { width: 65, align: "right" });
        doc.moveDown(0.5);
      }
      doc.moveDown(0.5);
      doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.width - PAGE.margin, doc.y).strokeColor("#c9b9a8").stroke();
      doc.moveDown(0.6);
      field(doc, "Net", formatMoney(invoice.net, config.CURRENCY));
      field(doc, `VAT (${(invoice.vat_rate_bp / 100).toFixed(2)}%)`, formatMoney(invoice.vat, config.CURRENCY));
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#2b2926")
        .text(`Total ${formatMoney(invoice.gross, config.CURRENCY)}`, { align: "right" });
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(9).fillColor("#665f57")
        .text(invoice.notes || "Payment due within 14 days.");
      if (company().pdf_footer) doc.text(company().pdf_footer);
      footer(doc);
    },
  });
}
