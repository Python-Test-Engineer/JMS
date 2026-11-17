import express from "express";
import { all, one } from "../db/index.js";
import { dayKey, todayRange } from "../domain/dates.js";
import { STATUS_LABELS } from "../domain/status.js";
import { jobScope } from "../services/access.js";
import { requirePermission } from "../middleware/permissions.js";
import { renderPage } from "../render.js";

export const insightsRouter = express.Router();

insightsRouter.get("/insights/timeline", requirePermission("insight.timeline"), (req, res) => {
  const scope = jobScope(req.user);
  const range = todayRange();
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE (${scope.sql}) AND j.archived_at IS NULL AND j.planned_start IS NOT NULL
       AND j.planned_start >= ? AND j.planned_start < datetime(?, '+42 days')
     ORDER BY j.planned_start`,
    ...scope.params, range.start, range.start,
  );
  const days = new Map();
  for (const job of jobs) {
    const key = dayKey(job.planned_start);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(job);
  }
  renderPage(req, res, "pages/insights/timeline.njk", {
    title: "Timeline",
    groups: [...days.entries()],
    statuses: STATUS_LABELS,
  });
});

insightsRouter.get("/insights/workload", requirePermission("insight.workload"), (req, res) => {
  const fieldUsers = all(
    `SELECT id, display_name, role_key FROM users
     WHERE status='ACTIVE' AND can_engineer=1 ORDER BY display_name`,
  );
  const range = todayRange();
  const rows = fieldUsers.map((user) => {
    const active = all(
      `SELECT j.id, j.reference, j.title, j.status, j.planned_start, c.name AS customer_name
       FROM job_assignments a JOIN jobs j ON j.id=a.job_id JOIN customers c ON c.id=j.customer_id
       WHERE a.user_id=? AND a.removed_at IS NULL AND j.archived_at IS NULL
         AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD')
       ORDER BY j.planned_start`,
      user.id,
    );
    return {
      ...user,
      jobs: active,
      count: active.length,
      week: active.filter((j) => j.planned_start && j.planned_start < range.endWeek).length,
    };
  }).sort((a, b) => b.count - a.count);
  renderPage(req, res, "pages/insights/workload.njk", { title: "Workload", rows });
});

insightsRouter.get("/insights/financials", requirePermission("insight.financial"), (req, res) => {
  const totals = one(
    `SELECT
      COALESCE(SUM(CASE WHEN status='DRAFT' THEN net END),0) AS draft_net,
      COALESCE(SUM(CASE WHEN status='ISSUED' THEN net END),0) AS issued_net,
      COALESCE(SUM(CASE WHEN status='ISSUED' THEN gross END),0) AS issued_gross,
      COALESCE(SUM(CASE WHEN status='PAID' THEN net END),0) AS paid_net,
      COALESCE(SUM(CASE WHEN status='PAID' THEN gross END),0) AS paid_gross,
      COALESCE(SUM(CASE WHEN status='VOID' THEN net END),0) AS void_net
     FROM invoices`,
  );
  const quoted = one(
    `SELECT COALESCE(SUM(price_net),0) AS net, COALESCE(SUM(price_gross),0) AS gross, COUNT(*) AS n
     FROM jobs WHERE archived_at IS NULL AND status NOT IN ('CANCELLED','PAID','INVOICED')`,
  );
  const byStatus = all(
    `SELECT status, COUNT(*) AS n, COALESCE(SUM(gross),0) AS gross FROM invoices GROUP BY status ORDER BY status`,
  );
  const recent = all(
    `SELECT i.*, c.name AS customer_name FROM invoices i JOIN jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id
     ORDER BY i.created_at DESC LIMIT 10`,
  );
  renderPage(req, res, "pages/insights/financials.njk", {
    title: "Financials", totals, quoted, byStatus, recent,
  });
});

insightsRouter.get("/insights/needs-invoicing", requirePermission("insight.operational"), (req, res) => {
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status='COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID')
     ORDER BY j.actual_end DESC`,
  );
  renderPage(req, res, "pages/insights/needs-invoicing.njk", { title: "Needs invoicing", jobs });
});
