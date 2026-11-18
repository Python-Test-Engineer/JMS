/**
 * The job status machine.
 *
 * `TRANSITIONS` is exhaustive: adding a status to the union without adding a
 * row here is a TypeScript error. The generic UI never offers INVOICED or PAID;
 * those are driven by the invoice service.
 */
import type { Job, JobStatus, RoleKey } from "../contracts/types.js";
export { WORK_TYPES } from "../contracts/types.js";

export const STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const WORK_TYPE_LABELS: Record<string, string> = {
  WINDOW_INSTALL: "Window installation",
  REPAIR: "Repair",
  SURVEY: "Survey",
};

interface TransitionRule {
  allowed: readonly JobStatus[];
  fieldForward: readonly JobStatus[];
}

export const TRANSITIONS: Record<JobStatus, TransitionRule> = {
  DRAFT: { allowed: ["SCHEDULED", "CANCELLED"], fieldForward: [] },
  SCHEDULED: { allowed: ["IN_PROGRESS", "ON_HOLD", "CANCELLED", "SCHEDULED"], fieldForward: ["IN_PROGRESS", "ON_HOLD"] },
  IN_PROGRESS: { allowed: ["COMPLETED", "ON_HOLD"], fieldForward: ["COMPLETED", "ON_HOLD"] },
  ON_HOLD: { allowed: ["IN_PROGRESS", "CANCELLED"], fieldForward: ["IN_PROGRESS"] },
  COMPLETED: { allowed: ["INVOICED", "IN_PROGRESS"], fieldForward: [] },
  INVOICED: { allowed: ["PAID", "COMPLETED"], fieldForward: [] },
  PAID: { allowed: [], fieldForward: [] },
  CANCELLED: { allowed: [], fieldForward: [] },
};

const TRANSITION_LABELS: Partial<Record<JobStatus, string>> = {
  SCHEDULED: "Publish schedule",
  IN_PROGRESS: "Start job",
  ON_HOLD: "Put on hold",
  COMPLETED: "Complete job",
  CANCELLED: "Cancel job",
};

export interface TransitionCheck {
  ok: boolean;
  code?: string;
  message?: string;
}

export function canTransition(input: {
  user: { role_key: RoleKey; id: string; can_engineer: boolean; permissions: ReadonlySet<string> };
  job: Job;
  to: JobStatus;
  assigned: boolean;
  hasAssignee: boolean;
  note?: string;
}): TransitionCheck {
  const { user, job, to, assigned, hasAssignee, note = "" } = input;
  const rule = TRANSITIONS[job.status];
  if (!rule.allowed.includes(to)) {
    return { ok: false, code: "INVALID_TRANSITION", message: `A ${STATUS_LABELS[job.status]} job cannot become ${STATUS_LABELS[to]}.` };
  }
  const override = user.permissions.has("job.status.override");
  const field = assigned && user.can_engineer && rule.fieldForward.includes(to);
  if (!override && !field) {
    return { ok: false, code: "TRANSITION_FORBIDDEN", message: "You cannot make that status change." };
  }
  if (job.status === "DRAFT" && to === "SCHEDULED") {
    if (!job.planned_start || !job.planned_end) {
      return { ok: false, code: "DATES_REQUIRED", message: "Set planned dates before publishing the schedule." };
    }
    if (!hasAssignee) {
      return { ok: false, code: "ASSIGNEE_REQUIRED", message: "Assign at least one field engineer before publishing the schedule." };
    }
  }
  if ((to === "ON_HOLD" || to === "CANCELLED") && !note.trim()) {
    return { ok: false, code: "NOTE_REQUIRED", message: "Add a short reason before making that change." };
  }
  return { ok: true };
}

export function availableTransitions(
  user: { role_key: RoleKey; id: string; can_engineer: boolean; permissions: ReadonlySet<string> },
  job: Job,
  context: { assigned: boolean; hasAssignee: boolean },
): Array<{ to: JobStatus; label: string }> {
  const rule = TRANSITIONS[job.status];
  return rule.allowed
    .filter((to) => to !== "INVOICED" && to !== "PAID")
    .filter((to) => canTransition({ user, job, to, ...context }).ok)
    .map((to) => ({ to, label: TRANSITION_LABELS[to] ?? STATUS_LABELS[to] }));
}

export function isFieldCapable(user: { can_engineer: boolean; status: string }): boolean {
  return user.can_engineer && user.status === "ACTIVE";
}
