import express from "express";
import { all, one } from "../db/index.js";
import { inputToIso, isoToLocalInput, nowIso } from "../domain/dates.js";
import { penceToPoundsInput } from "../domain/money.js";
import { availableTransitions, STATUS_LABELS, WORK_TYPES } from "../domain/status.js";
import { canViewJob, getVisibleJob, jobById, liveInvoiceForJob } from "../services/access.js";
import {
  addNote, archiveJob, conflictsFor, createJob, jobDetail, listJobs,
  saveAssignments, saveSchedule, transitionJob, updateJob, validateJobInput,
} from "../services/jobs.js";
import { generateJobSheet } from "../services/documents.js";
import { requirePermission, asyncHandler, parsePage } from "../middleware/permissions.js";
import { notFound, forbidden } from "../middleware/errors.js";
import { renderPage } from "../render.js";

export const jobsRouter = express.Router();

function jobForStaff(req, id) {
  const job = getVisibleJob(req.user, id);
  if (!job) return null;
  if (req.user.role_key === "CUSTOMER") return null;
  return job;
}

function formValuesFromJob(job) {
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
    vat_rate_bp: job.vat_rate_bp,
    internal_notes: job.internal_notes || "",
    customer_notes: job.customer_notes || "",
  };
}

jobsRouter.get("/jobs", requirePermission("job.view.all"), (req, res) => {
  const { page, perPage } = parsePage(req.query);
  const { rows, total } = listJobs(req.user, req.query);
  const customers = all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name");
  const paged = rows.slice((page - 1) * perPage, page * perPage);
  renderPage(req, res, "pages/jobs/list.njk", {
    title: "Jobs",
    jobs: paged,
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    customers,
    filters: req.query,
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.get("/jobs/new", requirePermission("job.create"), (req, res) => {
  const customers = all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name");
  const customer = req.query.customer_id ? one("SELECT * FROM customers WHERE id=?", req.query.customer_id) : null;
  renderPage(req, res, "pages/jobs/form.njk", {
    title: "Create job",
    mode: "new",
    values: {
      customer_id: customer?.id || "",
      title: "", description: "", work_type: "WINDOW_INSTALL", priority: "NORMAL",
      planned_slot: "ALL_DAY", vat_rate_bp: 2000, price_net: "", internal_notes: "", customer_notes: "",
    },
    errors: {},
    customers,
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.post("/jobs", requirePermission("job.create"), (req, res) => {
  const { values, errors } = validateJobInput(req.body);
  const customers = all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name");
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/jobs/form.njk", {
      title: "Create job", mode: "new", values, errors, customers, statuses: STATUS_LABELS, workTypes: WORK_TYPES,
    });
  }
  const job = createJob(req.user, values, req);
  req.session.flash_json = JSON.stringify({ type: "success", message: `Job ${job.reference} created.` });
  return res.redirect(`/jobs/${job.id}`);
});

jobsRouter.get("/jobs/:id", (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const detail = jobDetail(req.user, job);
  const transitions = availableTransitions(req.user, job, { assigned: detail.assigned, hasAssignee: detail.hasAssignee });
  renderPage(req, res, "pages/jobs/detail.njk", {
    title: `${job.reference} · ${job.title}`,
    ...detail,
    transitions,
    statuses: STATUS_LABELS,
  });
});

jobsRouter.get("/jobs/:id/edit", requirePermission("job.edit"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const customers = all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name");
  renderPage(req, res, "pages/jobs/form.njk", {
    title: `Edit ${job.reference}`,
    mode: "edit",
    job,
    values: formValuesFromJob(job),
    errors: {},
    customers,
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.post("/jobs/:id", requirePermission("job.edit"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const { values, errors } = validateJobInput(req.body);
  const customers = all("SELECT id,name FROM customers WHERE archived_at IS NULL ORDER BY name");
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/jobs/form.njk", {
      title: `Edit ${job.reference}`, mode: "edit", job, values, errors, customers, statuses: STATUS_LABELS, workTypes: WORK_TYPES,
    });
  }
  updateJob(req.user, job, values, req);
  req.session.flash_json = JSON.stringify({ type: "success", message: "Job saved." });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.get("/jobs/:id/assign", requirePermission("job.assign"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const detail = jobDetail(req.user, job);
  renderPage(req, res, "pages/jobs/assign.njk", { title: `Assign ${job.reference}`, ...detail });
});

jobsRouter.post("/jobs/:id/assign", requirePermission("job.assign"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const result = saveAssignments(req.user, job, req.body, req);
  if (result.errors.length) {
    res.status(400);
    const detail = jobDetail(req.user, job);
    return renderPage(req, res, "pages/jobs/assign.njk", { title: `Assign ${job.reference}`, ...detail, errors: result.errors });
  }
  req.session.flash_json = JSON.stringify({ type: "success", message: "Assignments saved." });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.get("/jobs/:id/schedule", requirePermission("job.schedule"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  renderPage(req, res, "pages/jobs/schedule.njk", {
    title: `Schedule ${job.reference}`,
    job,
    values: formValuesFromJob(job),
    errors: {},
    conflicts: [],
  });
});

jobsRouter.post("/jobs/:id/schedule", requirePermission("job.schedule"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const values = {
    planned_start: inputToIso(req.body.planned_start),
    planned_end: inputToIso(req.body.planned_end),
    planned_slot: ["AM", "PM", "ALL_DAY"].includes(req.body.planned_slot) ? req.body.planned_slot : "ALL_DAY",
  };
  const errors = {};
  if (!values.planned_start) errors.planned_start = "Choose a planned start.";
  if (!values.planned_end) errors.planned_end = "Choose a planned end.";
  if (values.planned_start && values.planned_end && Date.parse(values.planned_end) < Date.parse(values.planned_start)) {
    errors.planned_end = "The end must not be before the start.";
  }
  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/jobs/schedule.njk", { title: `Schedule ${job.reference}`, job, values: req.body, errors, conflicts: [] });
  }
  const conflicts = conflictsFor(job, values.planned_start, values.planned_end);
  const result = saveSchedule(req.user, job, values, { force: req.body.force === "1", conflicts }, req);
  if (Object.keys(result.errors || {}).length) {
    res.status(400);
    return renderPage(req, res, "pages/jobs/schedule.njk", { title: `Schedule ${job.reference}`, job, values: req.body, errors: result.errors, conflicts: [] });
  }
  if (result.conflicts?.length) {
    return renderPage(req, res, "pages/jobs/schedule.njk", { title: `Schedule ${job.reference}`, job, values: req.body, errors: {}, conflicts: result.conflicts });
  }
  req.session.flash_json = JSON.stringify({ type: "success", message: "Schedule saved." });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/status", requirePermission("job.status.advance"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const to = String(req.body.to || "");
  if (!STATUS_LABELS[to]) return forbidden(req, res, "That status is not valid.");
  if (to === "CANCELLED" && !req.user.permissions.has("job.cancel")) return forbidden(req, res);
  const detail = jobDetail(req.user, job);
  const result = transitionJob(req.user, job, {
    to,
    note: String(req.body.note || "").trim(),
    assigned: detail.assigned,
    hasAssignee: detail.hasAssignee,
  }, req);
  if (!result.ok) {
    req.session.flash_json = JSON.stringify({ type: "error", message: result.message });
    return res.redirect(`/jobs/${job.id}`);
  }
  req.session.flash_json = JSON.stringify({ type: "success", message: `Job is now ${STATUS_LABELS[to].toLowerCase()}.` });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/cancel", requirePermission("job.cancel"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const result = transitionJob(req.user, job, { to: "CANCELLED", note: String(req.body.reason || "").trim() }, req);
  req.session.flash_json = JSON.stringify(result.ok
    ? { type: "success", message: "Job cancelled." }
    : { type: "error", message: result.message });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/notes", requirePermission("job.note.add"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const result = addNote(req.user, job, {
    message: String(req.body.message || ""),
    visibility: req.body.visibility === "CUSTOMER" ? "CUSTOMER" : "INTERNAL",
  }, req);
  req.session.flash_json = JSON.stringify(result.ok
    ? { type: "success", message: "Note added to the timeline." }
    : { type: "error", message: result.message });
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/archive", requirePermission("job.archive"), (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  archiveJob(req.user, job, req);
  req.session.flash_json = JSON.stringify({ type: "success", message: `${job.reference} archived.` });
  res.redirect("/jobs");
});

jobsRouter.get("/jobs/:id/timeline", (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const detail = jobDetail(req.user, job);
  renderPage(req, res, "partials/timeline.njk", { events: detail.events });
});

jobsRouter.get("/jobs/:id/job-sheet.pdf", requirePermission("document.job.pdf"), asyncHandler(async (req, res) => {
  const job = jobForStaff(req, req.params.id);
  if (!job) return notFound(req, res);
  const doc = await generateJobSheet({ user: req.user, job, req });
  res.download(doc.file_path, `${job.reference}-job-sheet.pdf`);
}));
