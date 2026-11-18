/**
 * Read models for dashboards, insights and the engineer "My jobs" screen.
 * All queries use parameterised dates and the caller's job scope.
 */
import { all, one } from "../db/index.js";
import { mapJob } from "../db/rows.js";
import type { AuthUser, Job } from "../contracts/types.js";
import { DateTime } from "luxon";
import { jobScope } from "./access.js";
import { company } from "./settings.js";

function scopedRows(user: AuthUser, extraWhere: string, params: unknown[], order = "j.planned_start"): Job[] {
  const scope = jobScope(user);
  return all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id = a.user_id
         WHERE a.job_id = j.id AND a.removed_at IS NULL AND a.is_lead = 1 LIMIT 1) AS lead_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE (${scope.sql}) AND j.archived_at IS NULL AND ${extraWhere}
      ORDER BY ${order}`,
    ...scope.params,
    ...params,
  ).map(mapJob);
}

export function operationsDashboard(user: AuthUser, now = new Date()): Record<string, unknown> {
  const todayStart = DateTime.fromJSDate(now).setZone(company().timezone).startOf("day").toUTC().toISO();
  const tomorrow = DateTime.fromJSDate(now).setZone(company().timezone).startOf("day").plus({ days: 1 }).toUTC().toISO();
  const weekEnd = DateTime.fromJSDate(now).setZone(company().timezone).startOf("day").plus({ days: 7 }).toUTC().toISO();
  const today = todayStart && tomorrow
    ? scopedRows(user, "j.planned_start >= ? AND j.planned_start < ?", [todayStart, tomorrow])
    : [];
  const upcoming = weekEnd
    ? scopedRows(user, "j.planned_start >= ? AND j.planned_start < ? AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD')", [tomorrow ?? todayStart ?? "", weekEnd])
    : [];
  const needsInvoicing = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.status = 'COMPLETED' AND j.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status <> 'VOID')
      ORDER BY j.actual_end DESC`,
  ).map(mapJob);
  const stats = {
    today: today.length,
    week: upcoming.length,
    inProgress: one<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status = 'IN_PROGRESS' AND archived_at IS NULL")?.n ?? 0,
    onHold: one<{ n: number }>("SELECT COUNT(*) AS n FROM jobs WHERE status = 'ON_HOLD' AND archived_at IS NULL")?.n ?? 0,
    needsInvoicing: needsInvoicing.length,
    unpaid: one<{ total: number }>("SELECT COALESCE(SUM(gross), 0) AS total FROM invoices WHERE status = 'ISSUED'")?.total ?? 0,
  };
  return { today, upcoming, needsInvoicing, stats };
}

export function myJobs(user: AuthUser): Job[] {
  return scopedRows(
    user,
    "j.status NOT IN ('CANCELLED','ARCHIVED')",
    [],
    "j.planned_start IS NULL, j.planned_start",
  );
}

export function timeline(user: AuthUser, from: string, days = 42): Array<{ day: string; jobs: Job[] }> {
  const fromDate = DateTime.fromISO(from, { zone: "utc" }).startOf("day");
  const to = fromDate.plus({ days }).toISO() ?? "";
  const rows = scopedRows(user, "j.planned_start >= ? AND j.planned_start < ?", [fromDate.toISO() ?? "", to]);
  const groups = new Map<string, Job[]>();
  for (const job of rows) {
    if (!job.planned_start) continue;
    const key = DateTime.fromISO(job.planned_start, { zone: "utc" }).toFormat("yyyy-LL-dd");
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, jobs]) => ({ day, jobs }));
}

export function workload(user: AuthUser, weekStart: string): { week: string; rows: Array<Record<string, unknown>> } {
  const start = DateTime.fromISO(weekStart, { zone: "utc" }).startOf("day");
  const end = start.plus({ days: 7 });
  const users = all(
    `SELECT id, display_name, role_key FROM users WHERE status = 'ACTIVE' AND can_engineer = 1
      AND role_key IN ('ENGINEER','MANAGER') ORDER BY role_key, display_name`,
  );
  const rows = users.map((row) => {
    const jobs = scopedRows(
      user,
      "j.planned_start >= ? AND j.planned_start < ? AND EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id AND a.user_id = ? AND a.removed_at IS NULL)",
      [start.toISO() ?? "", end.toISO() ?? "", String(row["id"])],
    );
    return { ...row, count: jobs.length, jobs, week: start.toFormat("dd LLL yyyy") };
  });
  return { week: start.toFormat("dd LLL yyyy"), rows };
}

export function financials(from: string, to: string): Record<string, unknown> {
  const totals = one<Record<string, number>>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'ISSUED' THEN gross END), 0) AS issued_net,
       COALESCE(SUM(CASE WHEN status = 'PAID' THEN gross END), 0) AS paid_net,
       COALESCE(SUM(CASE WHEN status = 'DRAFT' THEN gross END), 0) AS draft_net,
       COALESCE(SUM(CASE WHEN status = 'VOID' THEN gross END), 0) AS void_net
     FROM invoices WHERE created_at >= ? AND created_at < ?`,
    from,
    to,
  ) ?? {};
  const quoted = one<{ net: number; n: number }>(
    "SELECT COALESCE(SUM(price_net), 0) AS net, COUNT(*) AS n FROM jobs WHERE price_net IS NOT NULL AND created_at >= ? AND created_at < ?",
    from,
    to,
  ) ?? { net: 0, n: 0 };
  const byStatus = all(
    "SELECT status, COUNT(*) AS n, COALESCE(SUM(gross), 0) AS gross FROM invoices WHERE created_at >= ? AND created_at < ? GROUP BY status",
    from,
    to,
  );
  const recent = all(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE i.created_at >= ? AND i.created_at < ? ORDER BY i.created_at DESC LIMIT 20`,
    from,
    to,
  );
  return { totals, quoted, byStatus, recent };
}

export function searchAll(user: AuthUser, query: string): Record<string, unknown> {
  const term = `%${query.trim()}%`;
  const scope = jobScope(user);
  const jobs = all(
    `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE (${scope.sql}) AND j.archived_at IS NULL AND (j.reference LIKE ? OR j.title LIKE ? OR c.name LIKE ? OR j.site_postcode = ?)
      ORDER BY j.planned_start DESC LIMIT 20`,
    ...scope.params,
    term,
    term,
    term,
    query.trim().toUpperCase(),
  ).map(mapJob);
  const customers = user.role_key === "CUSTOMER"
    ? []
    : all(
        "SELECT id, name, contact_name, email, phone FROM customers WHERE archived_at IS NULL AND (name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR address_postcode = ?) ORDER BY name LIMIT 20",
        term,
        term,
        term,
        query.trim().toUpperCase(),
      );
  const invoices = all(
    `SELECT i.*, c.name AS customer_name, j.reference AS job_reference, j.title AS job_title
       FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN customers c ON c.id = j.customer_id
      WHERE i.status <> 'DRAFT' AND (i.number LIKE ? OR c.name LIKE ? OR j.reference LIKE ?)
      ORDER BY i.created_at DESC LIMIT 20`,
    term,
    term,
    term,
  );
  return { jobs, customers, invoices };
}
