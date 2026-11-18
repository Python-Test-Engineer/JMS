/** Jobs: list, create/edit, detail, assignments, schedule, status, notes, PDF. */
import { Router } from "express";
import { config } from "../config.js";
import { requirePermission } from "../middleware/auth.js";
import { flash } from "../middleware/session-flash.js";
import { renderPage } from "../render.js";
import { all, one } from "../db/index.js";
import { mapCustomer } from "../db/rows.js";
import { STATUS_LABELS, WORK_TYPES } from "../domain/status.js";
import { inputToIso, isoToLocalInput } from "../domain/dates.js";
import { requireUser } from "../middleware/auth.js";
import {
  addNote,
  archiveJob,
  conflictsFor,
  createJob,
  jobDetail,
  jobFormValues,
  listJobs,
  saveAssignments,
  saveSchedule,
  transitionJob,
  updateJob,
  validateJobInput,
} from "../services/jobs.js";
import { getVisibleJob } from "../services/access.js";
import { generateJobSheet } from "../services/documents.js";
import { layout, meta } from "./helpers.js";

export const jobsRouter = Router();

function customers(): ReturnType<typeof mapCustomer>[] {
  return all("SELECT * FROM customers WHERE archived_at IS NULL ORDER BY name").map(mapCustomer);
}

function staffJob(req: Parameters<typeof getVisibleJob>[0], id: string): ReturnType<typeof getVisibleJob> {
  const job = getVisibleJob(req, id);
  if (!job || req.role_key === "CUSTOMER") return null;
  return job;
}

jobsRouter.get("/jobs", requirePermission("job.view.all"), (req, res) => {
  layout(req, res);
  const page = Math.max(1, Number.parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const perPage = 25;
  const { rows, total } = listJobs(req.user!, req.query as Record<string, unknown>);
  renderPage(res, "pages/jobs/list.njk", {
    title: "Jobs",
    jobs: rows.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    customers: customers(),
    filters: req.query,
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.get("/jobs/new", requirePermission("job.create"), (req, res) => {
  layout(req, res);
  const customer = req.query["customer_id"] ? one("SELECT * FROM customers WHERE id = ?", req.query["customer_id"]) : null;
  renderPage(res, "pages/jobs/form.njk", {
    title: "Create job",
    mode: "new",
    job: null,
    values: {
      customer_id: customer ? String(customer["id"]) : "",
      title: "",
      description: "",
      work_type: "WINDOW_INSTALL",
      priority: "NORMAL",
      planned_slot: "ALL_DAY",
      price_net: "",
      vat_rate_bp: String(config.vatRateBp),
      internal_notes: "",
      customer_notes: "",
    },
    errors: {},
    customers: customers(),
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.post("/jobs", requirePermission("job.create"), (req, res) => {
  const { values, errors } = validateJobInput(req.body as Record<string, unknown>);
  if (Object.keys(errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/jobs/form.njk", {
      title: "Create job",
      mode: "new",
      job: null,
      values,
      errors,
      customers: customers(),
      statuses: STATUS_LABELS,
      workTypes: WORK_TYPES,
    });
  }
  const job = createJob(req.user!, values, meta(req));
  flash(req, "success", `Job ${job.reference} created.`);
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.get("/jobs/:id", requireUser, (req, res) => {
  const job = getVisibleJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) {
    layout(req, res);
    res.status(404);
    return renderPage(res, "pages/error.njk", { title: "Not found", status: 404, message: "That job could not be found." });
  }
  layout(req, res);
  const detail = jobDetail(req.user!, job);
  renderPage(res, "pages/jobs/detail.njk", {
    title: `${job.reference} · ${job.title}`,
    ...detail,
    statuses: STATUS_LABELS,
  });
});

jobsRouter.get("/jobs/:id/edit", requirePermission("job.edit"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/jobs/form.njk", {
    title: `Edit ${job.reference}`,
    mode: "edit",
    job,
    values: jobFormValues(job),
    errors: {},
    customers: customers(),
    statuses: STATUS_LABELS,
    workTypes: WORK_TYPES,
  });
});

jobsRouter.post("/jobs/:id", requirePermission("job.edit"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  const { values, errors } = validateJobInput(req.body as Record<string, unknown>);
  if (Object.keys(errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/jobs/form.njk", {
      title: `Edit ${job.reference}`,
      mode: "edit",
      job,
      values,
      errors,
      customers: customers(),
      statuses: STATUS_LABELS,
      workTypes: WORK_TYPES,
    });
  }
  const updated = updateJob(req.user!, job, values, meta(req));
  flash(req, "success", "Job saved.");
  res.redirect(`/jobs/${updated.id}`);
});

jobsRouter.get("/jobs/:id/assign", requirePermission("job.assign"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  layout(req, res);
  const detail = jobDetail(req.user!, job);
  renderPage(res, "pages/jobs/assign.njk", { title: `Assign ${job.reference}`, ...detail });
});

jobsRouter.post("/jobs/:id/assign", requirePermission("job.assign"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  const result = saveAssignments(req.user!, job, req.body as Record<string, unknown>, meta(req));
  if (result.errors.length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/jobs/assign.njk", { title: `Assign ${job.reference}`, ...jobDetail(req.user!, job), errors: result.errors });
  }
  flash(req, "success", "Assignments saved.");
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.get("/jobs/:id/schedule", requirePermission("job.schedule"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  layout(req, res);
  renderPage(res, "pages/jobs/schedule.njk", {
    title: `Schedule ${job.reference}`,
    job,
    values: {
      planned_start: isoToLocalInput(job.planned_start),
      planned_end: isoToLocalInput(job.planned_end),
      planned_slot: job.planned_slot,
    },
    conflicts: [],
    errors: {},
  });
});

jobsRouter.post("/jobs/:id/schedule", requirePermission("job.schedule"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  const values = {
    planned_start: inputToIso(req.body["planned_start"]),
    planned_end: inputToIso(req.body["planned_end"]),
    planned_slot: (["AM", "PM", "ALL_DAY"].includes(String(req.body["planned_slot"])) ? String(req.body["planned_slot"]) : "ALL_DAY") as "AM" | "PM" | "ALL_DAY",
  };
  const conflicts = conflictsFor(job, values.planned_start, values.planned_end);
  const result = saveSchedule(req.user!, job, values, { force: req.body["force"] === "1", conflicts }, meta(req));
  if (result.conflicts.length > 0) {
    layout(req, res);
    res.status(409);
    return renderPage(res, "pages/jobs/schedule.njk", {
      title: `Schedule ${job.reference}`,
      job,
      values: { planned_start: String(req.body["planned_start"] ?? ""), planned_end: String(req.body["planned_end"] ?? ""), planned_slot: values.planned_slot },
      conflicts: result.conflicts,
      errors: {},
    });
  }
  if (Object.keys(result.errors).length > 0) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/jobs/schedule.njk", {
      title: `Schedule ${job.reference}`,
      job,
      values: { planned_start: String(req.body["planned_start"] ?? ""), planned_end: String(req.body["planned_end"] ?? ""), planned_slot: values.planned_slot },
      conflicts: [],
      errors: result.errors,
    });
  }
  flash(req, "success", "Schedule saved.");
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/status", requirePermission("job.status.advance"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  const detail = jobDetail(req.user!, job);
  const result = transitionJob(
    req.user!,
    job,
    {
      to: String(req.body["to"] ?? "") as never,
      note: String(req.body["note"] ?? ""),
      assigned: detail.assigned,
      hasAssignee: detail.hasAssignee,
    },
    meta(req),
  );
  if (!result.ok) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/jobs/detail.njk", {
      title: `${job.reference} · ${job.title}`,
      ...jobDetail(req.user!, job),
      error: result.message,
      statuses: STATUS_LABELS,
    });
  }
  flash(req, "success", "Job status updated.");
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/notes", requirePermission("job.note.add"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  const result = addNote(
    req.user!,
    job,
    {
      message: String(req.body["message"] ?? ""),
      visibility: req.body["visibility"] === "CUSTOMER" ? "CUSTOMER" : "INTERNAL",
    },
    meta(req),
  );
  flash(req, result.ok ? "success" : "error", result.ok ? "Note added." : result.message ?? "Note not added.");
  res.redirect(`/jobs/${job.id}`);
});

jobsRouter.post("/jobs/:id/archive", requirePermission("job.archive"), (req, res) => {
  const job = staffJob(req.user!, String(req.params["id"] ?? ""));
  if (!job) return res.status(404).send("Not found");
  archiveJob(req.user!, job, meta(req));
  flash(req, "success", "Job archived.");
  res.redirect("/jobs");
});

jobsRouter.get("/jobs/:id/job-sheet.pdf", requirePermission("document.job.pdf"), async (req, res, next) => {
  try {
    const job = getVisibleJob(req.user!, String(req.params["id"] ?? ""));
    if (!job) return res.status(404).send("Not found");
    const doc = await generateJobSheet(req.user!, job.id, meta(req));
    res.download(doc.file_path, `${job.reference}.pdf`);
  } catch (error) {
    next(error);
  }
});
