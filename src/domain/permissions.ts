/**
 * The permission matrix is data, not `if` statements spread through templates.
 *
 * `ACTION_KEYS` is the canonical list. `DEFAULT_MATRIX` seeds one row per
 * role × action so "missing means denied" can never hide a mistaken omission.
 * Routes, nav pills and buttons all call `can()`.
 */
import type { AuthUser, RoleKey } from "../contracts/types.js";

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  ENGINEER: "Engineer",
  CUSTOMER: "Customer",
};

export const ACTION_KEYS = [
  "customer.view.all",
  "customer.view.own",
  "customer.create",
  "customer.edit",
  "customer.invite",
  "customer.archive",
  "job.view.all",
  "job.view.assigned",
  "job.view.own",
  "job.create",
  "job.edit",
  "job.assign",
  "job.schedule",
  "job.status.advance",
  "job.status.override",
  "job.note.add",
  "job.cancel",
  "job.archive",
  "user.view",
  "user.create",
  "user.edit.role",
  "user.reset.password",
  "user.deactivate",
  "invoice.view.all",
  "invoice.view.own",
  "invoice.create",
  "invoice.issue",
  "invoice.mark.paid",
  "document.job.pdf",
  "document.invoice.pdf",
  "insight.operational",
  "insight.financial",
  "insight.workload",
  "insight.timeline",
  "admin.roles.manage",
  "admin.permissions.edit",
  "admin.settings.manage",
  "admin.audit.view",
  "admin.theme.default",
  "backup.manage",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

const role = (
  all: readonly ActionKey[],
): Record<ActionKey, boolean> => {
  const result = Object.fromEntries(ACTION_KEYS.map((key) => [key, false])) as Record<ActionKey, boolean>;
  for (const key of all) result[key] = true;
  return result;
};

const ADMIN_ALL = ACTION_KEYS;
const MANAGER_KEYS = ACTION_KEYS.filter(
  (key) => !key.startsWith("admin.") && key !== "user.view" && key !== "user.create" && key !== "user.edit.role" && key !== "user.deactivate" && key !== "customer.archive" && key !== "job.archive" && key !== "backup.manage",
);
const ENGINEER_KEYS: readonly ActionKey[] = [
  "customer.view.own",
  "job.view.assigned",
  "job.status.advance",
  "job.note.add",
  "document.job.pdf",
  "insight.timeline",
];
const CUSTOMER_KEYS: readonly ActionKey[] = [
  "customer.view.own",
  "job.view.own",
  "invoice.view.own",
  "document.job.pdf",
  "document.invoice.pdf",
];

export const DEFAULT_MATRIX: Record<RoleKey, Record<ActionKey, boolean>> = {
  ADMIN: role(ADMIN_ALL),
  MANAGER: role(MANAGER_KEYS),
  ENGINEER: role(ENGINEER_KEYS),
  CUSTOMER: role(CUSTOMER_KEYS),
};

export function can(user: Pick<AuthUser, "permissions"> | null | undefined, key: ActionKey): boolean {
  return Boolean(user?.permissions?.has(key));
}

/** The matrix cannot remove these safety rails. */
export const SAFEGUARDED_ACTIONS: readonly ActionKey[] = ["admin.permissions.edit", "admin.audit.view", "backup.manage"];

export function canViewAdmin(user: AuthUser): boolean {
  return can(user, "admin.roles.manage") || can(user, "admin.permissions.edit") || can(user, "admin.settings.manage") || can(user, "admin.audit.view") || can(user, "user.view") || can(user, "backup.manage");
}

export interface NavEntry {
  label: string;
  href: string;
  actionKey?: ActionKey;
  customerOnly?: boolean;
  engineerOnly?: boolean;
  adminOnly?: boolean;
}

export const NAV_GROUPS: ReadonlyArray<{ label: string; entries: readonly NavEntry[] }> = [
  {
    label: "Work",
    entries: [
      { label: "Operations", href: "/dashboard/operations", actionKey: "insight.operational" },
      { label: "My jobs", href: "/my-jobs", actionKey: "job.view.assigned" },
      { label: "My jobs", href: "/portal/jobs", actionKey: "job.view.own", customerOnly: true },
      { label: "Jobs", href: "/jobs", actionKey: "job.view.all" },
      { label: "Customers", href: "/customers", actionKey: "customer.view.all" },
      { label: "Invoices", href: "/invoices", actionKey: "invoice.view.all" },
    ],
  },
  {
    label: "Insights",
    entries: [
      { label: "Timeline", href: "/insights/timeline", actionKey: "insight.timeline" },
      { label: "Workload", href: "/insights/workload", actionKey: "insight.workload" },
      { label: "Financials", href: "/insights/financials", actionKey: "insight.financial" },
      { label: "Needs invoicing", href: "/insights/needs-invoicing", actionKey: "insight.operational" },
    ],
  },
  {
    label: "Account",
    entries: [
      { label: "Appearance", href: "/account/appearance" },
      { label: "Change password", href: "/account/password" },
    ],
  },
  {
    label: "Admin",
    entries: [
      { label: "Users", href: "/admin/users", actionKey: "user.view" },
      { label: "Roles & permissions", href: "/admin/roles", actionKey: "admin.roles.manage" },
      { label: "Company settings", href: "/admin/settings", actionKey: "admin.settings.manage" },
      { label: "Audit log", href: "/admin/audit", actionKey: "admin.audit.view" },
      { label: "Archive", href: "/admin/archive", actionKey: "job.archive" },
      { label: "Backups", href: "/admin/backups", actionKey: "backup.manage" },
    ],
  },
];

export function navGroupsFor(user: AuthUser): Array<{ label: string; entries: NavEntry[] }> {
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    entries: group.entries.filter((entry) => {
      if (entry.customerOnly && user.role_key !== "CUSTOMER") return false;
      if (!entry.actionKey) return !entry.customerOnly || user.role_key === "CUSTOMER";
      if (!can(user, entry.actionKey)) return false;
      if (entry.actionKey === "job.view.own" && user.role_key !== "CUSTOMER") return false;
      if (entry.actionKey === "job.view.assigned" && !user.can_engineer) return false;
      return true;
    }),
  })).filter((group) => group.entries.length > 0);
}
