/** Operations dashboard, engineer dashboard and My jobs. */
import { Router } from "express";
import { all } from "../db/index.js";
import { mapInvoice } from "../db/rows.js";
import { requirePermission, requireUser } from "../middleware/auth.js";
import { renderPage } from "../render.js";
import { operationsDashboard, myJobs } from "../services/dashboard.js";
import { STATUS_LABELS } from "../domain/status.js";
import { layout } from "./helpers.js";

export const dashboardsRouter = Router();

dashboardsRouter.get("/", requireUser, (req, res) => {
  if (!req.user) return res.redirect("/signin");
  if (req.user.role_key === "CUSTOMER") return res.redirect("/portal/jobs");
  if (req.user.role_key === "ENGINEER") return res.redirect("/my-jobs");
  return res.redirect("/dashboard/operations");
});

dashboardsRouter.get("/dashboard/operations", requirePermission("insight.operational"), (req, res) => {
  layout(req, res);
  const data = operationsDashboard(req.user!);
  renderPage(res, "pages/dashboard/operations.njk", {
    title: "Operations",
    ...data,
    statuses: STATUS_LABELS,
  });
});

dashboardsRouter.get("/dashboard/engineer", requirePermission("job.view.assigned"), (req, res) => {
  layout(req, res);
  const jobs = myJobs(req.user!);
  const today = new Date().toISOString().slice(0, 10);
  const todays = jobs.filter((job) => job.planned_start?.slice(0, 10) === today);
  renderPage(res, "pages/dashboard/engineer.njk", {
    title: "My day",
    jobs: todays.length > 0 ? todays : jobs,
    statuses: STATUS_LABELS,
    todayCount: todays.length,
  });
});

dashboardsRouter.get("/my-jobs", requirePermission("job.view.assigned"), (req, res) => {
  layout(req, res);
  const jobs = myJobs(req.user!);
  renderPage(res, "pages/dashboard/engineer.njk", {
    title: "My jobs",
    jobs,
    statuses: STATUS_LABELS,
    todayCount: jobs.filter((job) => job.status === "IN_PROGRESS").length,
  });
});

dashboardsRouter.get("/portal/jobs", requirePermission("job.view.own"), (req, res) => {
  layout(req, res);
  if (req.user!.role_key !== "CUSTOMER") return res.redirect("/jobs");
  const jobs = myJobs(req.user!);
  renderPage(res, "pages/portal/jobs.njk", { title: "My jobs", jobs, statuses: STATUS_LABELS });
});

dashboardsRouter.get("/portal/invoices", requirePermission("invoice.view.own"), (req, res) => {
  layout(req, res);
  const rows = all(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE j.customer_id = ? AND i.status <> 'DRAFT' ORDER BY i.issued_at DESC`,
    req.user!.customer_id,
  ).map(mapInvoice);
  renderPage(res, "pages/portal/invoices.njk", { title: "My invoices", invoices: rows });
});
