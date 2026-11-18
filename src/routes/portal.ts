/** Customer portal details and downloads. Every query is scoped by customer_id. */
import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { renderPage } from "../render.js";
import { all } from "../db/index.js";
import { mapInvoice } from "../db/rows.js";
import { getVisibleInvoice, getVisibleJob } from "../services/access.js";
import { jobDetail } from "../services/jobs.js";
import { invoiceDetail } from "../services/invoices.js";
import { generateInvoicePdf, generateJobSheet } from "../services/documents.js";
import { layout, meta } from "./helpers.js";

export const portalRouter = Router();

function customerOnly(req: Parameters<typeof layout>[0], res: Parameters<typeof layout>[1]): boolean {
  if (req.user?.role_key !== "CUSTOMER") {
    res.redirect("/jobs");
    return false;
  }
  return true;
}

portalRouter.get("/portal/jobs/:id", requirePermission("job.view.own"), (req, res) => {
  if (!customerOnly(req, res)) return;
  const job = getVisibleJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  layout(req, res);
  const invoices = all(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE i.job_id = ? AND i.status <> 'DRAFT' ORDER BY i.issued_at DESC`,
    job.id,
  ).map(mapInvoice);
  renderPage(res, "pages/portal/job.njk", { title: job.title, ...jobDetail(req.user!, job), invoices });
});

portalRouter.get("/portal/jobs/:id/job-sheet.pdf", requirePermission("document.job.pdf"), async (req, res, next) => {
  try {
    if (!customerOnly(req, res)) return;
    const job = getVisibleJob(req.user!, String(req.params["id"] ?? ""));
    if (!job) return res.status(404).send("Not found");
    const doc = await generateJobSheet(req.user!, job.id, meta(req));
    res.download(doc.file_path, `${job.reference}.pdf`);
  } catch (error) {
    next(error);
  }
});

portalRouter.get("/portal/invoices/:id", requirePermission("invoice.view.own"), (req, res) => {
  if (!customerOnly(req, res)) return;
  const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
  if (!invoice) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/portal/invoice.njk", { title: invoice.number, ...invoiceDetail(invoice) });
});

portalRouter.get("/portal/invoices/:id/pdf", requirePermission("document.invoice.pdf"), async (req, res, next) => {
  try {
    if (!customerOnly(req, res)) return;
    const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
    if (!invoice) return res.status(404).send("Not found");
    const doc = await generateInvoicePdf(req.user!, invoice.id, meta(req));
    res.download(doc.file_path, `${invoice.number}.pdf`);
  } catch (error) {
    next(error);
  }
});
