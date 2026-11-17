import express from "express";
import { all, one } from "../db/index.js";
import { STATUS_LABELS } from "../domain/status.js";
import { canViewInvoice, getVisibleJob, invoiceById, invoiceLines } from "../services/access.js";
import { generateInvoicePdf, generateJobSheet } from "../services/documents.js";
import { requirePermission, asyncHandler } from "../middleware/permissions.js";
import { notFound } from "../middleware/errors.js";
import { renderPage } from "../render.js";

export const portalRouter = express.Router();

function requireCustomerScope(req, res, next) {
  if (req.user?.role_key !== "CUSTOMER") return notFound(req, res);
  return next();
}

function portalJob(job) {
  return {
    ...job,
    price_net: undefined,
    price_gross: undefined,
    internal_notes: undefined,
  };
}

portalRouter.get("/portal/jobs", requirePermission("job.view.own"), requireCustomerScope, (req, res) => {
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.customer_id=? AND j.archived_at IS NULL ORDER BY j.created_at DESC`,
    req.user.customer_id,
  );
  renderPage(req, res, "pages/portal/jobs.njk", { title: "My jobs", jobs, statuses: STATUS_LABELS });
});

portalRouter.get("/portal/jobs/:id", requirePermission("job.view.own"), requireCustomerScope, (req, res) => {
  const job = getVisibleJob(req.user, req.params.id);
  if (!job) return notFound(req, res);
  const events = all(
    "SELECT * FROM job_events WHERE job_id=? AND visibility='CUSTOMER' ORDER BY at DESC",
    job.id,
  );
  const assignments = all(
    `SELECT u.display_name, a.is_lead FROM job_assignments a JOIN users u ON u.id=a.user_id
     WHERE a.job_id=? AND a.removed_at IS NULL ORDER BY a.is_lead DESC`,
    job.id,
  );
  const invoices = all(
    "SELECT * FROM invoices WHERE job_id=? AND status<>'DRAFT' ORDER BY created_at DESC",
    job.id,
  );
  renderPage(req, res, "pages/portal/job.njk", {
    title: `${job.reference} · ${job.title}`,
    job: portalJob(job), events, assignments, invoices, statuses: STATUS_LABELS,
  });
});

portalRouter.get("/portal/jobs/:id/job-sheet.pdf", requirePermission("document.job.pdf"), requireCustomerScope, asyncHandler(async (req, res) => {
  const job = getVisibleJob(req.user, req.params.id);
  if (!job) return notFound(req, res);
  const doc = await generateJobSheet({ user: req.user, job, req });
  res.download(doc.file_path, `${job.reference}-job-sheet.pdf`);
}));

portalRouter.get("/portal/invoices", requirePermission("invoice.view.own"), requireCustomerScope, (req, res) => {
  const invoices = all(
    `SELECT i.*, j.reference AS job_reference FROM invoices i JOIN jobs j ON j.id=i.job_id
     WHERE j.customer_id=? AND i.status<>'DRAFT' ORDER BY i.created_at DESC`,
    req.user.customer_id,
  );
  renderPage(req, res, "pages/portal/invoices.njk", { title: "My invoices", invoices });
});

portalRouter.get("/portal/invoices/:id", requirePermission("invoice.view.own"), requireCustomerScope, (req, res) => {
  const invoice = invoiceById(req.params.id);
  if (!invoice || !canViewInvoice(req.user, invoice) || invoice.status === "DRAFT") return notFound(req, res);
  const job = one("SELECT * FROM jobs WHERE id=?", invoice.job_id);
  renderPage(req, res, "pages/portal/invoice.njk", {
    title: `Invoice ${invoice.number}`, invoice, job, lines: invoiceLines(invoice.id),
  });
});

portalRouter.get("/portal/invoices/:id/pdf", requirePermission("document.invoice.pdf"), requireCustomerScope, asyncHandler(async (req, res) => {
  const invoice = invoiceById(req.params.id);
  if (!invoice || !canViewInvoice(req.user, invoice) || invoice.status === "DRAFT") return notFound(req, res);
  const full = one(
    `SELECT i.*, j.reference AS job_reference, c.name AS customer_name
     FROM invoices i JOIN jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id WHERE i.id=?`,
    invoice.id,
  );
  const doc = await generateInvoicePdf({ user: req.user, invoice: full, req });
  res.download(doc.file_path, `${invoice.number}.pdf`);
}));
