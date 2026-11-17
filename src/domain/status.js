// Job status machine (_TECH.md §11.1–11.2).

export const JOB_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "INVOICED",
  "PAID",
  "CANCELLED",
];

export const STATUS_LABELS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const WORK_TYPES = ["WINDOW_INSTALL", "REPAIR", "SURVEY"];
export const WORK_TYPE_LABELS = {
  WINDOW_INSTALL: "Window install",
  REPAIR: "Repair",
  SURVEY: "Survey",
};

export const TRANSITIONS = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["INVOICED", "IN_PROGRESS"],
  INVOICED: ["PAID", "COMPLETED"],
  PAID: [],
  CANCELLED: [],
};

const FIELD_TRANSITIONS = new Set([
  "SCHEDULED>IN_PROGRESS",
  "IN_PROGRESS>COMPLETED",
  "IN_PROGRESS>ON_HOLD",
  "ON_HOLD>IN_PROGRESS",
]);

// Human labels for outcome buttons.
export const TRANSITION_LABELS = {
  "DRAFT>SCHEDULED": "Schedule job",
  "DRAFT>CANCELLED": "Cancel draft",
  "SCHEDULED>IN_PROGRESS": "Start job",
  "SCHEDULED>ON_HOLD": "Put on hold",
  "SCHEDULED>CANCELLED": "Cancel job",
  "IN_PROGRESS>COMPLETED": "Complete job",
  "IN_PROGRESS>ON_HOLD": "Put on hold",
  "ON_HOLD>IN_PROGRESS": "Resume job",
  "ON_HOLD>CANCELLED": "Cancel job",
  "COMPLETED>IN_PROGRESS": "Reopen job",
  "COMPLETED>INVOICED": "Create invoice",
  "INVOICED>PAID": "Mark paid",
  "INVOICED>COMPLETED": "Void invoice",
};

export function isInvoiceControlled(to) {
  return to === "INVOICED" || to === "PAID";
}

export function can(user, key) {
  return Boolean(user?.permissions?.has(key));
}

/**
 * Decide whether a transition is allowed.
 * Returns { ok, code, message }.
 */
export function canTransition({ user, job, to, assigned = false, hasAssignee = true, note = "" }) {
  const from = job.status;
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
    return { ok: false, code: 409, message: `A ${STATUS_LABELS[from]} job cannot become ${STATUS_LABELS[to] || to}.` };
  }
  if (isInvoiceControlled(to)) {
    return { ok: false, code: 409, message: "Invoice-controlled statuses are managed from the invoice screen." };
  }

  const override = can(user, "job.status.override");
  const forward = can(user, "job.status.advance") && assigned && FIELD_TRANSITIONS.has(`${from}>${to}`);
  if (!override && !forward) {
    return { ok: false, code: 403, message: "You do not have permission to make this change." };
  }

  if (from === "DRAFT" && to === "SCHEDULED") {
    if (!job.planned_start || !job.planned_end) {
      return { ok: false, code: 400, message: "Add planned start and end dates before scheduling." };
    }
    if (!hasAssignee) {
      return { ok: false, code: 400, message: "Assign at least one field-capable engineer before scheduling." };
    }
  }

  if (to === "ON_HOLD" && !note.trim()) {
    return { ok: false, code: 400, message: "Add a short reason before putting the job on hold." };
  }
  if (to === "CANCELLED" && !note.trim()) {
    return { ok: false, code: 400, message: "Add a cancellation reason." };
  }
  if (from === "COMPLETED" && to === "IN_PROGRESS" && !override) {
    return { ok: false, code: 403, message: "Reopening a completed job needs manager override." };
  }

  return { ok: true, code: 200, message: "" };
}

export function availableTransitions(user, job, { assigned = false, hasAssignee = true } = {}) {
  return (TRANSITIONS[job.status] || [])
    .filter((to) => !isInvoiceControlled(to))
    .map((to) => ({ to, label: TRANSITION_LABELS[`${job.status}>${to}`] || to }))
    .filter(({ to }) => canTransition({ user, job, to, assigned, hasAssignee, note: "x" }).ok ||
      // Note-required transitions still show; the form asks for the reason.
      canTransition({ user, job, to, assigned, hasAssignee, note: "" }).code === 400);
}
