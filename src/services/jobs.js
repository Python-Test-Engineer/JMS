import crypto from "node:crypto";
import { all, audit, nextSequence, one, run, transaction } from "../db/index.js";
import { companyYear, inputToIso, nowIso } from "../domain/dates.js";
import { grossFromNet, parsePoundsToPence } from "../domain/money.js";
import { canTransition, STATUS_LABELS, WORK_TYPES } from "../domain/status.js";
import {
  assignmentsFor, canSeeInternal, canSeePrices, fieldTabs, jobById, jobScope,
  liveInvoiceForJob,
} from "./access.js";

export function validateJobInput(body) {
  const values = {
    customer_id: String(body.customer_id || ""),
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    work_type: String(body.work_type || ""),
    priority: body.priority === "URGENT" ? "URGENT" : "NORMAL",
    planned_start: inputToIso(body.planned_start),
    planned_end: inputToIso(body.planned_end),
    planned_slot: ["AM", "PM", "ALL_DAY"].includes(body.planned_slot) ? body.planned_slot : "ALL_DAY",
    price_net: null,
    vat_rate_bp: Math.max(0, Math.min(10000, Number.parseInt(body.vat_rate_bp, 10) || 2000)),
    internal_notes: String(body.internal_notes || "").trim() || null,
    customer_notes: String(body.customer_notes || "").trim() || null,
  };
  const errors = {};
  if (!one("SELECT id FROM customers WHERE id=? AND archived_at IS NULL", values.customer_id)) errors.customer_id = "Choose a customer.";
  if (!values.title) errors.title = "Add a short job title.";
  else if (values.title.length > 140) errors.title = "Keep the title under 140 characters.";
  if (!values.description) errors.description = "Describe the work.";
  if (!WORK_TYPES.includes(values.work_type)) errors.work_type = "Choose a work type.";
  if (String(body.planned_start || "") && !values.planned_start) errors.planned_start = "Use a valid start date and time.";
  if (String(body.planned_end || "") && !values.planned_end) errors.planned_end = "Use a valid end date and time.";
  if (values.planned_start && values.planned_end && Date.parse(values.planned_end) < Date.parse(values.planned_start)) {
    errors.planned_end = "The end must not be before the start.";
  }
  const priceRaw = String(body.price_net || "").trim();
  if (priceRaw) {
    try { values.price_net = parsePoundsToPence(priceRaw); } catch (error) { errors.price_net = error.message; }
  }
  return { values, errors };
}

export function listJobs(user, filters = {}) {
  const scope = jobScope(user);
  const where = [`(${scope.sql})`, "j.archived_at IS NULL"];
  const params = [...scope.params];
  const status = String(filters.status || "");
  if (status && STATUS_LABELS[status]) { where.push("j.status=?"); params.push(status); }
  const customer = String(filters.customer_id || "");
  if (customer) { where.push("j.customer_id=?"); params.push(customer); }
  if (filters.priority === "URGENT") where.push("j.priority='URGENT'");
  if (filters.work_type && WORK_TYPES.includes(filters.work_type)) { where.push("j.work_type=?"); params.push(filters.work_type); }
  if (filters.q) {
    const term = `%${String(filters.q).trim()}%`;
    where.push("(j.reference LIKE ? OR j.title LIKE ? OR c.name LIKE ?)");
    params.push(term, term, term);
  }
  if (filters.assigned_to) {
    where.push("EXISTS (SELECT 1 FROM job_assignments fa WHERE fa.job_id=j.id AND fa.user_id=? AND fa.removed_at IS NULL)");
    params.push(filters.assigned_to);
  }
  const whereSql = where.join(" AND ");
  const total = one(
    `SELECT COUNT(*) AS n FROM jobs j JOIN customers c ON c.id=j.customer_id WHERE ${whereSql}`,
    ...params,
  ).n;
  const rows = all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id=a.user_id
         WHERE a.job_id=j.id AND a.removed_at IS NULL AND a.is_lead=1 LIMIT 1) AS lead_name
     FROM jobs j JOIN customers c ON c.id=j.customer_id
     WHERE ${whereSql}
     ORDER BY CASE j.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'SCHEDULED' THEN 1 WHEN 'ON_HOLD' THEN 2 ELSE 3 END,
              j.planned_start IS NULL, j.planned_start, j.created_at DESC`,
    ...params,
  );
  return { rows, total };
}

export function createJob(user, values, req) {
  const id = crypto.randomUUID();
  const now = nowIso();
  const year = companyYear(now);
  return transaction(() => {
    const sequence = nextSequence("job", year);
    const reference = `JOB-${year}-${String(sequence).padStart(4, "0")}`;
    const priceGross = values.price_net === null ? null : grossFromNet(values.price_net, values.vat_rate_bp);
    const customer = one("SELECT * FROM customers WHERE id=?", values.customer_id);
    run(
      `INSERT INTO jobs (id,company_id,reference,customer_id,title,description,work_type,status,priority,site_address_json,
        planned_start,planned_end,planned_slot,actual_start,actual_end,price_net,vat_rate_bp,price_gross,
        internal_notes,customer_notes,created_by,created_at,updated_at,archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, customer.company_id, reference, values.customer_id, values.title, values.description,
      values.work_type, "DRAFT", values.priority, customer.address_json,
      values.planned_start, values.planned_end, values.planned_slot, null, null,
      values.price_net, values.vat_rate_bp, priceGross, values.internal_notes, values.customer_notes,
      user.id, now, now, null,
    );
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), id, user.id, "CREATED", null, "DRAFT", "Job created", "INTERNAL", now,
    );
    audit({ actorId: user.id, action: "job.create", entityType: "JOB", entityId: id, after: { reference, title: values.title }, req });
    return one("SELECT * FROM jobs WHERE id=?", id);
  });
}

export function updateJob(user, job, values, req) {
  const now = nowIso();
  const priceGross = values.price_net === null ? null : grossFromNet(values.price_net, values.vat_rate_bp);
  const before = { title: job.title, status: job.status, customer_id: job.customer_id, price_net: job.price_net };
  run(
    `UPDATE jobs SET customer_id=?, title=?, description=?, work_type=?, priority=?, planned_start=?, planned_end=?,
       planned_slot=?, price_net=?, vat_rate_bp=?, price_gross=?, internal_notes=?, customer_notes=?, updated_at=?
     WHERE id=?`,
    values.customer_id, values.title, values.description, values.work_type, values.priority,
    values.planned_start, values.planned_end, values.planned_slot, values.price_net, values.vat_rate_bp,
    priceGross, values.internal_notes, values.customer_notes, now, job.id,
  );
  if (job.planned_start !== values.planned_start || job.planned_end !== values.planned_end) {
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), job.id, user.id, "SCHEDULE_CHANGE", job.planned_start, values.planned_start, "Schedule changed", "CUSTOMER", now,
    );
  }
  audit({ actorId: user.id, action: "job.update", entityType: "JOB", entityId: job.id, before, after: { title: values.title }, req });
  return jobById(job.id);
}

export function saveAssignments(user, job, body, req) {
  const raw = body.user_ids;
  const selected = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
  const unique = [...new Set(selected)];
  const errors = [];
  if (!unique.length) errors.push("Choose at least one engineer.");
  if (unique.length && !unique.includes(body.lead_id)) errors.push("Choose a lead from the selected engineers.");

  const validUsers = unique.map((id) => one("SELECT * FROM users WHERE id=?", id))
    .filter((u) => u && u.status === "ACTIVE" && u.can_engineer);
  if (validUsers.length !== unique.length) errors.push("Every selected person must be an active field-capable user.");
  if (errors.length) return { errors };

  const now = nowIso();
  return transaction(() => {
    const active = assignmentsFor(job.id);
    const activeUserIds = new Set(active.map((a) => a.user_id));
    for (const assignment of active) {
      if (!unique.includes(assignment.user_id)) {
        run("UPDATE job_assignments SET removed_at=? WHERE id=?", now, assignment.id);
        run(
          `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          crypto.randomUUID(), job.id, user.id, "ASSIGNMENT", "Assigned", "Removed", "Engineer removed", "INTERNAL", now,
        );
      }
    }
    for (const userId of unique) {
      if (activeUserIds.has(userId)) {
        run("UPDATE job_assignments SET is_lead=? WHERE job_id=? AND user_id=? AND removed_at IS NULL",
          userId === body.lead_id ? 1 : 0, job.id, userId);
      } else {
        run(
          `INSERT INTO job_assignments (id,job_id,user_id,is_lead,assigned_at,assigned_by,removed_at)
           VALUES (?,?,?,?,?,?,NULL)`,
          crypto.randomUUID(), job.id, userId, userId === body.lead_id ? 1 : 0, now, user.id,
        );
        run(
          `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          crypto.randomUUID(), job.id, user.id, "ASSIGNMENT", null, userId === body.lead_id ? "Lead" : "Engineer", "Engineer assigned", "INTERNAL", now,
        );
      }
    }
    run("UPDATE jobs SET updated_at=? WHERE id=?", now, job.id);
    audit({ actorId: user.id, action: "job.assign", entityType: "JOB", entityId: job.id, after: { user_ids: unique, lead_id: body.lead_id }, req });
    return { errors: [] };
  });
}

export function conflictsFor(job, startIso, endIso) {
  if (!startIso || !endIso) return [];
  const assignees = assignmentsFor(job.id);
  const conflicts = [];
  for (const assignment of assignees) {
    const rows = all(
      `SELECT j.id, j.reference, j.title, j.status, j.planned_start, j.planned_end
       FROM jobs j
       JOIN job_assignments a ON a.job_id=j.id AND a.user_id=? AND a.removed_at IS NULL
       WHERE j.id<>? AND j.archived_at IS NULL AND j.status IN ('SCHEDULED','IN_PROGRESS','ON_HOLD')
         AND j.planned_start IS NOT NULL AND j.planned_end IS NOT NULL
         AND NOT (j.planned_end <= ? OR j.planned_start >= ?)`,
      assignment.user_id, job.id, startIso, endIso,
    );
    for (const row of rows) conflicts.push({ ...row, engineer: assignment.display_name });
  }
  return conflicts;
}

export function saveSchedule(user, job, values, { force = false, conflicts = [] } = {}, req) {
  if (values.planned_start && values.planned_end && Date.parse(values.planned_end) < Date.parse(values.planned_start)) {
    return { errors: { planned_end: "The end must not be before the start." } };
  }
  if (conflicts.length && !force) return { errors: {}, conflicts };
  const now = nowIso();
  run("UPDATE jobs SET planned_start=?, planned_end=?, planned_slot=?, updated_at=? WHERE id=?",
    values.planned_start, values.planned_end, values.planned_slot, now, job.id);
  run(
    `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), job.id, user.id, "SCHEDULE_CHANGE", job.planned_start, values.planned_start,
    conflicts.length ? "Schedule saved with accepted conflict" : "Schedule saved", "CUSTOMER", now,
  );
  audit({ actorId: user.id, action: "job.schedule", entityType: "JOB", entityId: job.id, after: values, req });
  return { errors: {}, conflicts: [] };
}

export function transitionJob(user, job, { to, note = "", assigned = false, hasAssignee = true }, req) {
  const check = canTransition({ user, job, to, assigned, hasAssignee, note });
  if (!check.ok) return { ok: false, ...check };
  const now = nowIso();
  return transaction(() => {
    let actualStart = job.actual_start;
    let actualEnd = job.actual_end;
    if (to === "IN_PROGRESS" && !actualStart) actualStart = now;
    if (to === "COMPLETED") actualEnd = now;
    if (to === "ON_HOLD" && !actualStart) actualStart = now;
    run("UPDATE jobs SET status=?, actual_start=?, actual_end=?, updated_at=? WHERE id=?",
      to, actualStart, actualEnd, now, job.id);
    run(
      `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(), job.id, user.id, "STATUS_CHANGE", job.status, to,
      note || `Status changed to ${STATUS_LABELS[to]}`, to === "CANCELLED" || to === "ON_HOLD" ? "CUSTOMER" : "INTERNAL", now,
    );
    if (note) {
      run(
        `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        crypto.randomUUID(), job.id, user.id, "NOTE", null, null, note, "CUSTOMER", now,
      );
    }
    audit({
      actorId: user.id,
      action: to === "CANCELLED" ? "job.cancel" : "job.status.change",
      entityType: "JOB", entityId: job.id, before: { status: job.status }, after: { status: to }, req,
    });
    return { ok: true, job: jobById(job.id) };
  });
}

export function addNote(user, job, { message, visibility }, req) {
  if (!message?.trim()) return { ok: false, message: "Write a note before saving." };
  const now = nowIso();
  run(
    `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), job.id, user.id, "NOTE", null, null, message.trim(),
    visibility === "CUSTOMER" ? "CUSTOMER" : "INTERNAL", now,
  );
  run("UPDATE jobs SET updated_at=? WHERE id=?", now, job.id);
  audit({ actorId: user.id, action: "job.note.add", entityType: "JOB", entityId: job.id, after: { visibility }, req });
  return { ok: true };
}

export function archiveJob(user, job, req) {
  const now = nowIso();
  run("UPDATE jobs SET archived_at=?, updated_at=? WHERE id=?", now, now, job.id);
  run(
    `INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), job.id, user.id, "ARCHIVED", null, null, "Job archived", "INTERNAL", now,
  );
  audit({ actorId: user.id, action: "job.archive", entityType: "JOB", entityId: job.id, req });
}

export function jobDetail(user, job) {
  const customer = one("SELECT * FROM customers WHERE id=?", job.customer_id);
  if (customer) {
    try { customer.address = JSON.parse(customer.address_json); } catch { customer.address = {}; }
  }
  try { job.site_address = JSON.parse(job.site_address_json); } catch { job.site_address = {}; }
  const assignments = assignmentsFor(job.id);
  const events = all(
    `SELECT e.*, u.display_name AS actor_name FROM job_events e LEFT JOIN users u ON u.id=e.actor_user_id
     WHERE e.job_id=? ${user.role_key === "CUSTOMER" ? "AND e.visibility='CUSTOMER'" : ""} ORDER BY e.at DESC`,
    job.id,
  );
  const invoice = liveInvoiceForJob(job.id);
  const documents = all("SELECT * FROM documents WHERE entity_type='JOB' AND entity_id=? ORDER BY generated_at DESC", job.id);
  const options = fieldTabs(user);
  return {
    job, customer, assignments, events, invoice, documents, options,
    showPrices: canSeePrices(user),
    showInternal: canSeeInternal(user),
    assigned: assignments.some((a) => a.user_id === user.id),
    hasAssignee: assignments.length > 0,
    canEdit: user.permissions?.has("job.edit"),
    canAssign: user.permissions?.has("job.assign"),
    canSchedule: user.permissions?.has("job.schedule"),
  };
}
