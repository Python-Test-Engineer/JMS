/** Invoice list, creation, issue, payment, void and PDF download. */
import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { flash } from "../middleware/session-flash.js";
import { renderPage } from "../render.js";
import { one } from "../db/index.js";
import { mapJob } from "../db/rows.js";
import {
  completedJobsWithoutInvoice,
  createInvoice,
  invoiceDetail,
  issueInvoice,
  listInvoices,
  markInvoicePaid,
  validateInvoiceInput,
  voidInvoice,
} from "../services/invoices.js";
import { getVisibleInvoice, jobById } from "../services/access.js";
import { generateInvoicePdf } from "../services/documents.js";
import { layout, meta } from "./helpers.js";

export const invoicesRouter = Router();

invoicesRouter.get("/invoices", requirePermission("invoice.view.all"), (req, res) => {
  layout(req, res);
  const data = listInvoices(req.query as Record<string, unknown>);
  renderPage(res, "pages/invoices/list.njk", {
    title: "Invoices",
    ...data,
    filters: req.query,
  });
});

invoicesRouter.get("/invoices/new", requirePermission("invoice.create"), (req, res) => {
  layout(req, res);
  const jobs = completedJobsWithoutInvoice();
  const selected = req.query["job_id"] ? jobById(String(req.query["job_id"])) : null;
  renderPage(res, "pages/invoices/form.njk", {
    title: "Create invoice",
    jobs,
    values: {
      job_id: selected?.id ?? "",
      description: selected?.title ?? "",
      qty: "1",
      unit_pence: selected?.price_net ? (selected.price_net / 100).toFixed(2) : "",
      vat_rate_bp: String(selected?.vat_rate_bp ?? 2000),
      notes: "",
    },
    errors: {},
  });
});

invoicesRouter.post("/invoices", requirePermission("invoice.create"), (req, res) => {
  const { values, errors } = validateInvoiceInput(req.body as Record<string, unknown>);
  if (Object.keys(errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/invoices/form.njk", {
      title: "Create invoice",
      jobs: completedJobsWithoutInvoice(),
      values: {
        job_id: values.job_id,
        description: values.description,
        qty: String(values.qty_milli / 1000),
        unit_pence: (values.unit_pence / 100).toFixed(2),
        vat_rate_bp: String(values.vat_rate_bp),
        notes: values.notes ?? "",
      },
      errors,
    });
  }
  try {
    const invoice = createInvoice(req.user!, values, meta(req));
    flash(req, "success", `Invoice ${invoice.number} created as a draft.`);
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    layout(req, res);
    res.status(409);
    renderPage(res, "pages/invoices/form.njk", {
      title: "Create invoice",
      jobs: completedJobsWithoutInvoice(),
      values: {
        job_id: values.job_id,
        description: values.description,
        qty: String(values.qty_milli / 1000),
        unit_pence: (values.unit_pence / 100).toFixed(2),
        vat_rate_bp: String(values.vat_rate_bp),
        notes: values.notes ?? "",
      },
      errors: { job_id: error instanceof Error ? error.message : "Could not create invoice." },
    });
  }
});

invoicesRouter.get("/invoices/:id", requirePermission("invoice.view.all"), (req, res) => {
  const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
  if (!invoice) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/invoices/detail.njk", {
    title: invoice.number,
    ...invoiceDetail(invoice),
    values: { description: "", qty: "1", unit_pence: "", vat_rate_bp: String(invoice.vat_rate_bp) },
    errors: {},
  });
});

invoicesRouter.post("/invoices/:id/issue", requirePermission("invoice.issue"), (req, res) => {
  const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
  if (!invoice) return res.status(404).send("Not found");
  issueInvoice(req.user!, invoice, meta(req));
  flash(req, "success", "Invoice issued.");
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.post("/invoices/:id/paid", requirePermission("invoice.mark.paid"), (req, res) => {
  const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
  if (!invoice) return res.status(404).send("Not found");
  markInvoicePaid(req.user!, invoice, meta(req));
  flash(req, "success", "Invoice marked paid.");
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.post("/invoices/:id/void", requirePermission("invoice.issue"), (req, res) => {
  const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
  if (!invoice) return res.status(404).send("Not found");
  try {
    voidInvoice(req.user!, invoice, String(req.body["reason"] ?? ""), meta(req));
    flash(req, "success", "Invoice voided.");
  } catch (error) {
    flash(req, "error", error instanceof Error ? error.message : "Could not void invoice.");
  }
  res.redirect(`/invoices/${invoice.id}`);
});

invoicesRouter.get("/invoices/:id/pdf", requirePermission("document.invoice.pdf"), async (req, res, next) => {
  try {
    const invoice = getVisibleInvoice(req.user!, String(req.params["id"] ?? ""));
    if (!invoice) return res.status(404).send("Not found");
    const doc = await generateInvoicePdf(req.user!, invoice.id, meta(req));
    res.download(doc.file_path, `${invoice.number}.pdf`);
  } catch (error) {
    next(error);
  }
});
