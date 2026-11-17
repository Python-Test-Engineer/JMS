import express from "express";
import { all, one } from "../db/index.js";
import { todayRange } from "../domain/dates.js";
import { STATUS_LABELS } from "../domain/status.js";
import { jobScope } from "../services/access.js";
import { requirePermission } from "../middleware/permissions.js";
import { renderPage } from "../render.js";

export const dashboardsRouter = express.Router();

dashboardsRouter.get("/dashboard/operations", requirePermission("insight.operational"), (req, res) => {
  const range = todayRange();
  const stats = {
    today: one("SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL AND status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD') AND planned_start>=? AND planned_start<?", range.start, range.end).n,
    week: one("SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL AND status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD') AND planned_start>=? AND planned_start<?", range.start, range.endWeek).n,
    inProgress: one("SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL AND status='IN_PROGRESS'").n,
    onHold: one("SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL AND status='ON_HOLD'").n,
    draft: one("SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL AND status='DRAFT'").n,
    needsInvoicing: one(`SELECT COUNT(*) AS n FROM jobs j WHERE j.archived_at IS NULL AND j.status='COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID')`).n,
    unpaid: one("SELECT COALESCE(SUM(gross),0) AS n FROM invoices WHERE status='ISSUED'").n,
  };
  const today = all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id=a.user_id WHERE a.job_id=j.id AND a.removed_at IS NULL AND a.is_lead=1 LIMIT 1) AS lead_name
     FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD') AND j.planned_start>=? AND j.planned_start<?
     ORDER BY j.planned_start, c.name`,
    range.start, range.end,
  );
  const upcoming = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD') AND j.planned_start>=? AND j.planned_start<?
     ORDER BY j.planned_start LIMIT 12`,
    range.end, range.endWeek,
  );
  const needsInvoicing = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE j.archived_at IS NULL AND j.status='COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID')
     ORDER BY j.actual_end DESC LIMIT 8`,
  );
  renderPage(req, res, "pages/dashboard/operations.njk", {
    title: "Operations", stats, today, upcoming, needsInvoicing, statuses: STATUS_LABELS,
  });
});

dashboardsRouter.get("/dashboard/engineer", requirePermission("job.view.assigned"), (req, res) => {
  res.redirect("/my-jobs");
});

dashboardsRouter.get("/my-jobs", requirePermission("job.view.assigned"), (req, res) => {
  const scope = jobScope(req.user);
  const jobs = all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT name FROM customers WHERE id=j.customer_id) AS customer_name,
       (SELECT COUNT(*) FROM job_assignments a WHERE a.job_id=j.id AND a.user_id=? AND a.removed_at IS NULL) AS mine
     FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE (${scope.sql}) AND j.archived_at IS NULL
     ORDER BY j.planned_start IS NULL, j.planned_start, j.priority DESC`,
    req.user.id, ...scope.params,
  );
  renderPage(req, res, "pages/dashboard/engineer.njk", {
    title: "My jobs", jobs, statuses: STATUS_LABELS,
  });
});
