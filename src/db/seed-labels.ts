/** Human labels used by seeded timeline events. */
import type { JobStatus } from "../contracts/types.js";

export function statusSeedLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    DRAFT: "Draft created",
    SCHEDULED: "Schedule published",
    IN_PROGRESS: "Work started",
    ON_HOLD: "Put on hold",
    COMPLETED: "Work completed",
    INVOICED: "Invoice issued",
    PAID: "Invoice paid",
    CANCELLED: "Job cancelled",
  };
  return labels[status];
}
