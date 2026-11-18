/**
 * Job services.
 *
 * Controllers stay thin: they parse a form, call one of these functions and
 * render. Every mutation here runs inside a single SQLite transaction and
 * writes its audit row in that same transaction, so the history can never
 * disagree with the record it describes.
 */
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "../db/index.js";
import type {
  AuthUser,
  Job,
  JobStatus,
  PlannedSlot,
  Priority,
  WorkType,
  WriteMeta,
} from "../contracts/types.js";
import { mapCustomer, mapJob } from "../db/rows.js";
import { companyYear, inputToIso, isoToLocalInput, nowIso } from "../domain/dates.js";
import { grossFromNet, parsePoundsToPence, penceToPoundsInput } from "../domain/money.js";
import { availableTransitions, canTransition, STATUS_LABELS, WORK_TYPES } from "../domain/status.js";
import { audit } from "./audit.js";
import {
  assignmentsFor,
  canSeeInternal,
  canSeePrices,
  customerById,
  fieldUsers,
  jobById,
  jobEvents,
  jobScope,
  liveInvoiceForJob,
} from "./access.js";
import { company } from "./settings.js";

export interface JobInput {
  customer_id: string;
  title: string;
  description: string;
  work_type: WorkType;
  priority: Priority;
  planned_start: string | null;
  planned_end: string | null;
  planned_slot: PlannedSlot;
  price_net: number | null;
  vat_rate_bp: number;
  internal_notes: string | null;
  customer_notes: string | null;
}

export function validateJobInput(body: Record<string, unknown>): { values: JobInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const customerId = String(body["customer_id"] ?? "").trim();
  const customer = customerById(customerId);
  if (!customer || customer.archived_at) errors["customer_id"] = "Choose an active customer.";

  const title = String(body["title"] ?? "").trim();
  if (!title) errors["title"] = "Add a short job title.";
  else if (title.length > 140) errors["title"] = "Keep the title under 140 characters.";

  const description = String(body["description"] ?? "").trim();
  if (!description) errors["description"] = "Describe the work.";

  const workType = String(body["work_type"] ?? "") as WorkType;
  if (!WORK_TYPES.includes(workType)) errors["work_type"] = "Choose a work type.";

  const priority: Priority = body["priority"] === "URGENT" ? "URGENT" : "NORMAL";
  const plannedStart = inputToIso(body["planned_start"]);
  const plannedEnd = inputToIso(body["planned_end"]);
  if (String(body["planned_start"] ?? "").trim() && !plannedStart) errors["planned_start"] = "Use a valid start date and time.";
  if (String(body["planned_end"] ?? "").trim() && !plannedEnd) errors["planned_end"] = "Use a valid end date and time.";
  if (plannedStart && plannedEnd && Date.parse(plannedEnd) < Date.parse(plannedStart)) {
    errors["planned_end"] = "The end must not be before the start.";
  }

  const slotRaw = String(body["planned_slot"] ?? "ALL_DAY");
  const plannedSlot: PlannedSlot = slotRaw === "AM" || slotRaw === "PM" ? slotRaw : "ALL_DAY";
  const vatRateBp = Math.max(0, Math.min(10000, Number.parseInt(String(body["vat_rate_bp"] ?? "2000"), 10) || 2000));

  let priceNet: number | null = null;
  const priceRaw = String(body["price_net"] ?? "").trim();
  if (priceRaw) {
    try {
      priceNet = parsePoundsToPence(priceRaw);
    } catch (error) {
      errors["price_net"] = error instanceof Error ? error.message : "Enter a valid price.";
    }
  }

  return {
    values: {
      customer_id: customerId,
      title,
      description,
      work_type: workType,
      priority,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      planned_slot: plannedSlot,
      price_net: priceNet,
      vat_rate_bp: vatRateBp,
      internal_notes: String(body["internal_notes"] ?? "").trim() || null,
      customer_notes: String(body["customer_notes"] ?? "").trim() || null,
    },
    errors,
  };
}

export function listJobs(user: AuthUser, filters: Record<string, unknown>): { rows: Job[]; total: number } {
  const scope = jobScope(user);
  const where: string[] = [`(${scope.sql})`, "j.archived_at IS NULL"];
  const params: unknown[] = [...scope.params];

  const status = String(filters["status"] ?? "");
  if (status && STATUS_LABELS[status as JobStatus]) {
    where.push("j.status = ?");
    params.push(status);
  }
  const customerId = String(filters["customer_id"] ?? "");
  if (customerId) {
    where.push("j.customer_id = ?");
    params.push(customerId);
  }
  if (filters["priority"] === "URGENT") where.push("j.priority = 'URGENT'");
  const workType = String(filters["work_type"] ?? "");
  if (workType && WORK_TYPES.includes(workType as WorkType)) {
    where.push("j.work_type = ?");
    params.push(workType);
  }
  const query = String(filters["q"] ?? "").trim();
  if (query) {
    const term = `%${query}%`;
    where.push("(j.reference LIKE ? OR j.title LIKE ? OR c.name LIKE ?)");
    params.push(term, term, term);
  }
  const assignedTo = String(filters["assigned_to"] ?? "");
  if (assignedTo) {
    where.push("EXISTS (SELECT 1 FROM job_assignments fa WHERE fa.job_id = j.id AND fa.user_id = ? AND fa.removed_at IS NULL)");
    params.push(assignedTo);
  }

  const whereSql = where.join(" AND ");
  const total = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE ${whereSql}`,
    ...params,
  )?.n ?? 0;

  const rows = all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id = a.user_id
         WHERE a.job_id = j.id AND a.removed_at IS NULL AND a.is_lead = 1 LIMIT 1) AS lead_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE ${whereSql}
      ORDER BY CASE j.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'SCHEDULED' THEN 1 WHEN 'ON_HOLD' THEN 2 ELSE 3 END,
               j.planned_start IS NULL, j.planned_start, j.created_at DESC`,
    ...params,
  ).map(mapJob);

  return { rows, total };
}

function nextSequence(kind: "job" | "invoice", year: number): number {
  const existing = one<{ value: number }>("SELECT value FROM sequences WHERE kind = ? AND year = ?", kind, year);
  const value = (existing?.value ?? 0) + 1;
  if (existing) {
    run("UPDATE sequences SET value = ? WHERE kind = ? AND year = ?", value, kind, year);
  } else {
    run("INSERT INTO sequences (kind, year, value) VALUES (?, ?, ?)", kind, year, value);
  }
  return value;
}

export function createJob(user: AuthUser, values: JobInput, meta: WriteMeta): Job {
  const id = randomUUID();
  const now = nowIso();
  const year = companyYear(now);
  const customer = customerById(values.customer_id);
  if (!customer) throw new Error("Customer disappeared while creating the job.");

  return transaction(() => {
    const sequence = nextSequence("job", year);
    const reference = `JOB-${year}-${String(sequence).padStart(4, "0")}`;
    const priceGross = values.price_net === null ? null : grossFromNet(values.price_net, values.vat_rate_bp);
    run(
      `INSERT INTO jobs
        (id, company_id, reference, customer_id, title, description, work_type, status, priority,
         site_line1, site_line2, site_town, site_postcode, site_country,
         planned_start, planned_end, planned_slot, actual_start, actual_end,
         price_net, vat_rate_bp, price_gross, internal_notes, customer_notes,
         version, created_by, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)`,
      id,
      customer.company_id,
      reference,
      values.customer_id,
      values.title,
      values.description,
      values.work_type,
      values.priority,
      customer.address.line1,
      customer.address.line2 || null,
      customer.address.town,
      customer.address.postcode,
      customer.address.country,
      values.planned_start,
      values.planned_end,
      values.planned_slot,
      values.price_net,
      values.vat_rate_bp,
      priceGross,
      values.internal_notes,
      values.customer_notes,
      user.id,
      now,
      now,
    );
    run(
      `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
       VALUES (?, ?, ?, 'CREATED', NULL, 'DRAFT', 'Job created', 'INTERNAL', ?)`,
      randomUUID(),
      id,
      user.id,
      now,
    );
    audit({
      action: "job.create",
      entityType: "JOB",
      entityId: id,
      after: { reference, title: values.title, customer_id: values.customer_id },
      meta,
    });
    const created = jobById(id);
    if (!created) throw new Error("Created job could not be read back.");
    return created;
  });
}

export function updateJob(user: AuthUser, job: Job, values: JobInput, meta: WriteMeta): Job {
  const now = nowIso();
  const priceGross = values.price_net === null ? null : grossFromNet(values.price_net, values.vat_rate_bp);
  const before = { title: job.title, status: job.status, customer_id: job.customer_id, price_net: job.price_net };
  const result = run(
    `UPDATE jobs SET customer_id = ?, title = ?, description = ?, work_type = ?, priority = ?,
       planned_start = ?, planned_end = ?, planned_slot = ?, price_net = ?, vat_rate_bp = ?, price_gross = ?,
       internal_notes = ?, customer_notes = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ?`,
    values.customer_id,
    values.title,
    values.description,
    values.work_type,
    values.priority,
    values.planned_start,
    values.planned_end,
    values.planned_slot,
    values.price_net,
    values.vat_rate_bp,
    priceGross,
    values.internal_notes,
    values.customer_notes,
    now,
    job.id,
    job.version,
  );
  if (result.changes === 0) throw new Error("This job changed in another tab. Reload and try again.");
  if (job.planned_start !== values.planned_start || job.planned_end !== values.planned_end) {
    run(
      `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
       VALUES (?, ?, ?, 'SCHEDULE_CHANGE', ?, ?, 'Schedule changed', 'CUSTOMER', ?)`,
      randomUUID(),
      job.id,
      user.id,
      job.planned_start,
      values.planned_start,
      now,
    );
  }
  audit({ action: "job.update", entityType: "JOB", entityId: job.id, before, after: { title: values.title }, meta });
  const updated = jobById(job.id);
  if (!updated) throw new Error("Updated job could not be read back.");
  return updated;
}

export function saveAssignments(
  user: AuthUser,
  job: Job,
  body: Record<string, unknown>,
  meta: WriteMeta,
): { errors: string[] } {
  const raw = body["user_ids"];
  const selected = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean);
  const unique = [...new Set(selected)];
  const leadId = String(body["lead_id"] ?? "");
  const errors: string[] = [];
  if (unique.length === 0) errors.push("Choose at least one engineer.");
  if (unique.length > 0 && !unique.includes(leadId)) errors.push("Choose a lead from the selected engineers.");

  const valid = unique.map((id) => one("SELECT * FROM users WHERE id = ?", id))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .filter((row) => Number(row["can_engineer"]) === 1 && String(row["status"]) === "ACTIVE");
  if (valid.length !== unique.length) errors.push("Every selected person must be an active field-capable user.");
  if (errors.length > 0) return { errors };

  const now = nowIso();
  transaction(() => {
    const active = assignmentsFor(job.id);
    const activeUserIds = new Set(active.map((assignment) => assignment.user_id));
    for (const assignment of active) {
      if (!unique.includes(assignment.user_id)) {
        run("UPDATE job_assignments SET removed_at = ? WHERE id = ?", now, assignment.id);
        run(
          `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
           VALUES (?, ?, ?, 'ASSIGNMENT', 'Assigned', 'Removed', 'Engineer removed', 'INTERNAL', ?)`,
          randomUUID(),
          job.id,
          user.id,
          now,
        );
      }
    }
    for (const userId of unique) {
      const isLead = userId === leadId;
      if (activeUserIds.has(userId)) {
        run(
          "UPDATE job_assignments SET is_lead = ? WHERE job_id = ? AND user_id = ? AND removed_at IS NULL",
          isLead ? 1 : 0,
          job.id,
          userId,
        );
      } else {
        run(
          `INSERT INTO job_assignments (id, job_id, user_id, is_lead, assigned_at, assigned_by, removed_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          randomUUID(),
          job.id,
          userId,
          isLead ? 1 : 0,
          now,
          user.id,
        );
        run(
          `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
           VALUES (?, ?, ?, 'ASSIGNMENT', NULL, ?, 'Engineer assigned', 'INTERNAL', ?)`,
          randomUUID(),
          job.id,
          user.id,
          isLead ? "Lead" : "Engineer",
          now,
        );
      }
    }
    run("UPDATE jobs SET version = version + 1, updated_at = ? WHERE id = ?", now, job.id);
    audit({ action: "job.assign", entityType: "JOB", entityId: job.id, after: { user_ids: unique, lead_id: leadId }, meta });
  });
  return { errors: [] };
}

export function conflictsFor(job: Job, startIso: string | null, endIso: string | null): Array<Record<string, unknown>> {
  if (!startIso || !endIso) return [];
  const conflicts: Array<Record<string, unknown>> = [];
  for (const assignment of assignmentsFor(job.id)) {
    const rows = all(
      `SELECT j.id, j.reference, j.title, j.status, j.planned_start, j.planned_end
         FROM jobs j JOIN job_assignments a ON a.job_id = j.id AND a.user_id = ? AND a.removed_at IS NULL
        WHERE j.id <> ? AND j.archived_at IS NULL AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD')
          AND j.planned_start IS NOT NULL AND j.planned_end IS NOT NULL
          AND NOT (j.planned_end <= ? OR j.planned_start >= ?)`,
      assignment.user_id,
      job.id,
      startIso,
      endIso,
    );
    for (const row of rows) conflicts.push({ ...row, engineer: assignment.display_name });
  }
  return conflicts;
}

export function saveSchedule(
  user: AuthUser,
  job: Job,
  values: { planned_start: string | null; planned_end: string | null; planned_slot: PlannedSlot },
  options: { force: boolean; conflicts: Array<Record<string, unknown>> },
  meta: WriteMeta,
): { errors: Record<string, string>; conflicts: Array<Record<string, unknown>> } {
  if (values.planned_start && values.planned_end && Date.parse(values.planned_end) < Date.parse(values.planned_start)) {
    return { errors: { planned_end: "The end must not be before the start." }, conflicts: [] };
  }
  if (options.conflicts.length > 0 && !options.force) return { errors: {}, conflicts: options.conflicts };

  const now = nowIso();
  run(
    `UPDATE jobs SET planned_start = ?, planned_end = ?, planned_slot = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?`,
    values.planned_start,
    values.planned_end,
    values.planned_slot,
    now,
    job.id,
    job.version,
  );
  run(
    `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
     VALUES (?, ?, ?, 'SCHEDULE_CHANGE', ?, ?, ?, 'CUSTOMER', ?)`,
    randomUUID(),
    job.id,
    user.id,
    job.planned_start,
    values.planned_start,
    options.conflicts.length > 0 ? "Schedule saved with accepted conflict" : "Schedule saved",
    now,
  );
  audit({ action: "job.schedule", entityType: "JOB", entityId: job.id, after: values, meta });
  return { errors: {}, conflicts: [] };
}

export function transitionJob(
  user: AuthUser,
  job: Job,
  input: { to: JobStatus; note?: string; assigned: boolean; hasAssignee: boolean },
  meta: WriteMeta,
): { ok: boolean; message?: string; job?: Job } {
  const check = canTransition({
    user,
    job,
    to: input.to,
    assigned: input.assigned,
    hasAssignee: input.hasAssignee,
    note: input.note ?? "",
  });
  if (!check.ok) return { ok: false, message: check.message ?? "That change is not allowed." };

  const now = nowIso();
  return transaction(() => {
    let actualStart = job.actual_start;
    let actualEnd = job.actual_end;
    if ((input.to === "IN_PROGRESS" || input.to === "ON_HOLD") && !actualStart) actualStart = now;
    if (input.to === "COMPLETED") actualEnd = now;

    run(
      `UPDATE jobs SET status = ?, actual_start = ?, actual_end = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
      input.to,
      actualStart,
      actualEnd,
      now,
      job.id,
      job.version,
    );
    run(
      `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
       VALUES (?, ?, ?, 'STATUS_CHANGE', ?, ?, ?, ?, ?)`,
      randomUUID(),
      job.id,
      user.id,
      job.status,
      input.to,
      input.note?.trim() || `Status changed to ${STATUS_LABELS[input.to]}`,
      input.to === "CANCELLED" || input.to === "ON_HOLD" ? "CUSTOMER" : "INTERNAL",
      now,
    );
    if (input.note?.trim()) {
      run(
        `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
         VALUES (?, ?, ?, 'NOTE', NULL, NULL, ?, 'CUSTOMER', ?)`,
        randomUUID(),
        job.id,
        user.id,
        input.note.trim(),
        now,
      );
    }
    audit({
      action: input.to === "CANCELLED" ? "job.cancel" : "job.status.change",
      entityType: "JOB",
      entityId: job.id,
      before: { status: job.status },
      after: { status: input.to },
      meta,
    });
    const updated = jobById(job.id);
    if (!updated) throw new Error("Updated job could not be read back.");
    return { ok: true, job: updated };
  });
}

export function addNote(
  user: AuthUser,
  job: Job,
  input: { message: string; visibility: "INTERNAL" | "CUSTOMER" },
  meta: WriteMeta,
): { ok: boolean; message?: string } {
  const message = input.message.trim();
  if (!message) return { ok: false, message: "Write a note before saving." };
  run(
    `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
     VALUES (?, ?, ?, 'NOTE', NULL, NULL, ?, ?, ?)`,
    randomUUID(),
    job.id,
    user.id,
    message,
    input.visibility,
    nowIso(),
  );
  run("UPDATE jobs SET version = version + 1, updated_at = ? WHERE id = ?", nowIso(), job.id);
  audit({ action: "job.note.add", entityType: "JOB", entityId: job.id, after: { visibility: input.visibility }, meta });
  return { ok: true };
}

export function archiveJob(user: AuthUser, job: Job, meta: WriteMeta): void {
  const now = nowIso();
  run("UPDATE jobs SET archived_at = ?, version = version + 1, updated_at = ? WHERE id = ?", now, now, job.id);
  run(
    `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
     VALUES (?, ?, ?, 'ARCHIVED', NULL, NULL, 'Job archived', 'INTERNAL', ?)`,
    randomUUID(),
    job.id,
    user.id,
    now,
  );
  audit({ action: "job.archive", entityType: "JOB", entityId: job.id, meta });
}

export function jobDetail(user: AuthUser, job: Job): {
  job: Job;
  customer: ReturnType<typeof mapCustomer>;
  assignments: ReturnType<typeof assignmentsFor>;
  events: ReturnType<typeof jobEvents>;
  invoice: ReturnType<typeof liveInvoiceForJob>;
  documents: ReturnType<typeof all>;
  options: ReturnType<typeof fieldUsers>;
  showPrices: boolean;
  showInternal: boolean;
  assigned: boolean;
  hasAssignee: boolean;
  transitions: ReturnType<typeof availableTransitions>;
} {
  const customer = customerById(job.customer_id);
  if (!customer) throw new Error("Job customer is missing.");
  const assignments = assignmentsFor(job.id);
  const events = jobEvents(job.id, user.role_key === "CUSTOMER");
  const invoice = liveInvoiceForJob(job.id);
  const documents = all("SELECT * FROM documents WHERE entity_type = 'JOB' AND entity_id = ? ORDER BY generated_at DESC", job.id);
  const options = fieldUsers();
  const assigned = assignments.some((assignment) => assignment.user_id === user.id);
  const hasAssignee = assignments.length > 0;
  const transitions = availableTransitions(user, job, { assigned, hasAssignee });
  return {
    job,
    customer,
    assignments,
    events,
    invoice,
    documents,
    options,
    showPrices: canSeePrices(user),
    showInternal: canSeeInternal(user),
    assigned,
    hasAssignee,
    transitions,
  };
}

export function jobFormValues(job: Job): Record<string, string> {
  return {
    customer_id: job.customer_id,
    title: job.title,
    description: job.description,
    work_type: job.work_type,
    priority: job.priority,
    planned_start: isoToLocalInput(job.planned_start),
    planned_end: isoToLocalInput(job.planned_end),
    planned_slot: job.planned_slot,
    price_net: penceToPoundsInput(job.price_net),
    vat_rate_bp: String(job.vat_rate_bp),
    internal_notes: job.internal_notes ?? "",
    customer_notes: job.customer_notes ?? "",
  };
}

export { company };
