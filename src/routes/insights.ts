/** Timeline, workload, financial and needs-invoicing views. */
import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { renderPage } from "../render.js";
import { DateTime } from "luxon";
import { all } from "../db/index.js";
import { mapJob } from "../db/rows.js";
import { financials, timeline, workload } from "../services/dashboard.js";
import { STATUS_LABELS } from "../domain/status.js";
import { layout } from "./helpers.js";

export const insightsRouter = Router();

insightsRouter.get("/insights/timeline", requirePermission("insight.timeline"), (req, res) => {
  layout(req, res);
  const from = String(req.query["from"] ?? DateTime.utc().startOf("day").toISODate() ?? "");
  renderPage(res, "pages/insights/timeline.njk", {
    title: "Timeline",
    groups: timeline(req.user!, from, 42),
    statuses: STATUS_LABELS,
  });
});

insightsRouter.get("/insights/workload", requirePermission("insight.workload"), (req, res) => {
  layout(req, res);
  const week = String(req.query["week"] ?? DateTime.utc().startOf("week").toISODate() ?? "");
  const data = workload(req.user!, week);
  renderPage(res, "pages/insights/workload.njk", { title: "Workload", ...data, statuses: STATUS_LABELS });
});

insightsRouter.get("/insights/financials", requirePermission("insight.financial"), (req, res) => {
  layout(req, res);
  const from = String(req.query["from"] ?? DateTime.utc().minus({ months: 3 }).startOf("day").toISO() ?? "");
  const to = String(req.query["to"] ?? DateTime.utc().plus({ days: 1 }).startOf("day").toISO() ?? "");
  renderPage(res, "pages/insights/financials.njk", { title: "Financials", ...financials(from, to) });
});

insightsRouter.get("/insights/needs-invoicing", requirePermission("insight.operational"), requirePermission("invoice.create"), (req, res) => {
  layout(req, res);
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.status = 'COMPLETED' AND j.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status <> 'VOID')
      ORDER BY j.actual_end DESC`,
  ).map(mapJob);
  renderPage(res, "pages/insights/needs-invoicing.njk", { title: "Needs invoicing", jobs });
});
