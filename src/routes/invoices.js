import express from "express";
import { all, one } from "../db/index.js";
import { penceToPoundsInput, parsePoundsToPence } from "../domain/money.js";
import { getVisibleInvoice, invoiceLines, liveInvoiceForJob } from "../services/access.js";
import {
  createInvoice, invoiceWithJob, issueInvoice, listInvoices, markPaid, updateDraft, voidInvoice,
} from "../services/invoices.js";
import { generateInvoicePdf } from "../services/documents.js";
import { requirePermission, asyncHandler } from "../middleware/permissions.js";
import { notFound } from "../middleware/errors.js";
import { renderPage } from "../render.js";

export const invoicesRouter = express.Router();

function invoiceDetail(invoice) {
  const lines = invoiceLines(invoice.id);
  const documents = all("SELECT * FROM documents WHERE entity_type='INVOICE' AND entity_id=? ORDER BY generated_at DESC", invoice.id);
  const job = one("SELECT * FROM jobs WHERE id=?", invoice.job_id);
  return { invoice, lines, documents, job };
}

invoicesRouter.get("/invoices", requirePermission("invoice.view.all"), (req, res) => {
  const rows = listInvoices({ status: req.query.status, q: req.query.q });
  const totals = {
    issued: rows.filter((r) => r.status === "ISSUED").reduce((s, r) => s + r.gross, 0),
    paid: rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.gross, 0),
    draft: rows.filter((r) => r.status === "DRAFT").reduce((s, r) => s + r.gross, 0),
  };
  renderPage(req, res, "pages/invoices/list.njk", {
    title: "Invoices", invoices: rows, totals, filters: req.query,
  });
});

invoicesRouter.get("/invoices/new", requirePermission("invoice.create"), (req, res) => {
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status='COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID')
     ORDER BY j.actual_end DESC`,
  );
  const selected = req.query.job_id ? one("SELECT * FROM jobs WHERE id=?", req.query.job_id) : null;
  renderPage(req, res, "pages/invoices/form.njk", {
    title: "Create invoice",
    jobs,
    selected,
    values: {
      job_id: selected?.id || "",
      description: selected?.title || "",
      qty: 1,
      unit_pence: selected ? penceToPoundsInput(selected.price_net) : "",
      vat_rate_bp: selected?.vat_rate_bp ?? 2000,
      notes: "Payment due within 14 days.",
    },
    errors: {},
  });
});

invoicesRouter.post("/invoices", requirePermission("invoice.create"), (req, res) => {
  const errors = {};
  let unitPence = 0;
  try { unitPence = parsePoundsToPence(req.body.unit_pence); } catch (error) { errors.unit_pence = error.message; }
  const values = {
    job_id: String(req.body.job_id || ""),
    description: String(req.body.description || ""),
    qty: Number(req.body.qty || 0),
    unit_pence: req.body.unit_pence,
    vat_rate_bp: Math.max(0, Math.min(10000, Number.parseInt(req.body.vat_rate_bp, 10) || 2000)),
    notes: String(req.body.notes || ""),
  };
  if (!Object.keys(errors).length) {
    const result = createInvoice(req.user, {
      job_id: values.job_id, description: values.description, qty: values.qty,
      unit_pence: unitPence, vat_rate_bp: values.vat_rate_bp, notes: values.notes,
    }, req);
    if (result.invoice) {
      req.session.flash_json = JSON.stringify({ type: "success", message: "Draft invoice created." });
      return res.redirect(`/invoices/${result.invoice.id}`);
    }
    Object.assign(errors, result.errors);
  }
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status='COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID')
     ORDER BY j.actual_end DESC`,
  );
  res.status(400);
  return renderPage(req, res, "pages/invoices/form.njk", {
    title: "Create invoice", jobs, selected: null, values, errors,
  });
});

invoicesRouter.get("/invoices/:id", requirePermission("invoice.view.all"), (req, res) => {
  const invoice = invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  renderPage(req, res, "pages/invoices/detail.njk", {
    title: `Invoice ${invoice.number || "draft"}`,
    ...invoiceDetail(invoice),
    values: {
      description: invoiceLines(invoice.id)[0]?.description || invoice.job_title,
      qty: invoiceLines(invoice.id)[0]?.qty || 1,
      unit_pence: penceToPoundsInput(invoiceLines(invoice.id)[0]?.unit_pence ?? invoice.net),
      vat_rate_bp: invoice.vat_rate_bp,
    },
    errors: {},
  });
});

invoicesRouter.post("/invoices/:id", requirePermission("invoice.create"), (req, res) => {
  const invoice = invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  let unitPence = 0;
  const errors = {};
  try { unitPence = parsePoundsToPence(req.body.unit_pence); } catch (error) { errors.unit_pence = error.message; }
  if (!Object.keys(errors).length) {
    const result = updateDraft(req.user, invoice, {
      description: String(req.body.description || ""),
      qty: Number(req.body.qty || 0),
      unit_pence: unitPence,
      vat_rate_bp: Math.max(0, Math.min(10000, Number.parseInt(req.body.vat_rate_bp, 10) || 2000)),
    }, req);
    if (!result.errors) {
      req.session.flash_json = JSON.stringify({ type: "success", message: "Draft invoice updated." });
      return res.redirect(`/invoices/${invoice.id}`);
    }
    Object.assign(errors, result.errors);
  }
  res.status(400);
  return renderPage(req, res, "pages/invoices/detail.njk", {
    title: `Invoice ${invoice.number || "draft"}`,
    ...invoiceDetail(invoiceWithJob(invoice.id)),
    values: req.body,
    errors,
  });
});

invoicesRouter.post("/invoices/:id/issue", requirePermission("invoice.issue"), (req, res) => {
  const invoice = invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  const result = issueInvoice(req.user, invoice, req);
  req.session.flash_json = JSON.stringify(result.error
    ? { type: "error", message: result.error }
    : { type: "success", message: `Invoice ${result.invoice.number} issued.` });
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.post("/invoices/:id/paid", requirePermission("invoice.mark.paid"), (req, res) => {
  const invoice = invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  const result = markPaid(req.user, invoice, req);
  req.session.flash_json = JSON.stringify(result.error
    ? { type: "error", message: result.error }
    : { type: "success", message: "Invoice marked paid." });
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.post("/invoices/:id/void", requirePermission("invoice.issue"), (req, res) => {
  const invoice = invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  const result = voidInvoice(req.user, invoice, String(req.body.reason || ""), req);
  req.session.flash_json = JSON.stringify(result.error
    ? { type: "error", message: result.error }
    : { type: "success", message: "Invoice voided. The job is back to completed." });
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.get("/invoices/:id/pdf", requirePermission("document.invoice.pdf"), asyncHandler(async (req, res) => {
  const invoice = getVisibleInvoice(req.user, req.params.id) && invoiceWithJob(req.params.id);
  if (!invoice) return notFound(req, res);
  if (req.user.role_key === "CUSTOMER" && invoice.status === "DRAFT") return notFound(req, res);
  const doc = await generateInvoicePdf({ user: req.user, invoice, req });
  res.download(doc.file_path, `${invoice.number || "invoice"}.pdf`);
}));
