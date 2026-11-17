// Canonical action keys and the default role × action matrix (_TECH.md §10.2).

export const ROLES = ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"];

export const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  ENGINEER: "Engineer",
  CUSTOMER: "Customer",
};

export const ACTIONS = [
  ["Customers", "customer.view.all", ["ADMIN", "MANAGER"]],
  ["Customers", "customer.view.own", ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"]],
  ["Customers", "customer.create", ["ADMIN", "MANAGER"]],
  ["Customers", "customer.edit", ["ADMIN", "MANAGER"]],
  ["Customers", "customer.invite", ["ADMIN", "MANAGER"]],
  ["Customers", "customer.archive", ["ADMIN"]],
  ["Jobs", "job.view.all", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.view.assigned", ["ADMIN", "MANAGER", "ENGINEER"]],
  ["Jobs", "job.view.own", ["ADMIN", "MANAGER", "CUSTOMER"]],
  ["Jobs", "job.create", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.edit", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.assign", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.schedule", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.status.advance", ["ADMIN", "MANAGER", "ENGINEER"]],
  ["Jobs", "job.status.override", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.note.add", ["ADMIN", "MANAGER", "ENGINEER"]],
  ["Jobs", "job.cancel", ["ADMIN", "MANAGER"]],
  ["Jobs", "job.archive", ["ADMIN"]],
  ["Users", "user.view", ["ADMIN"]],
  ["Users", "user.create", ["ADMIN"]],
  ["Users", "user.edit.role", ["ADMIN"]],
  ["Users", "user.reset.password", ["ADMIN", "MANAGER"]],
  ["Users", "user.deactivate", ["ADMIN"]],
  ["Invoices", "invoice.view.all", ["ADMIN", "MANAGER"]],
  ["Invoices", "invoice.view.own", ["ADMIN", "MANAGER", "CUSTOMER"]],
  ["Invoices", "invoice.create", ["ADMIN", "MANAGER"]],
  ["Invoices", "invoice.issue", ["ADMIN", "MANAGER"]],
  ["Invoices", "invoice.mark.paid", ["ADMIN", "MANAGER"]],
  ["Documents", "document.job.pdf", ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"]],
  ["Documents", "document.invoice.pdf", ["ADMIN", "MANAGER", "CUSTOMER"]],
  ["Insights", "insight.operational", ["ADMIN", "MANAGER"]],
  ["Insights", "insight.financial", ["ADMIN", "MANAGER"]],
  ["Insights", "insight.workload", ["ADMIN", "MANAGER"]],
  ["Insights", "insight.timeline", ["ADMIN", "MANAGER", "ENGINEER"]],
  ["Admin", "admin.roles.manage", ["ADMIN"]],
  ["Admin", "admin.permissions.edit", ["ADMIN"]],
  ["Admin", "admin.settings.manage", ["ADMIN"]],
  ["Admin", "admin.audit.view", ["ADMIN"]],
  ["Admin", "admin.theme.default", ["ADMIN"]],
];

export const ACTION_KEYS = ACTIONS.map(([, key]) => key);

export const DEFAULT_MATRIX = Object.fromEntries(
  ACTIONS.map(([, key, roles]) => [key, new Set(roles)]),
);

export const ACTION_GROUPS = ACTIONS.reduce((groups, [group, key]) => {
  (groups[group] ||= []).push(key);
  return groups;
}, {});

// Cells that the matrix editor may never grant to the named roles (§10.5).
export const SAFEGUARDED_DENIALS = {
  "admin.audit.view": ["CUSTOMER", "ENGINEER"],
};

export function isActionKey(key) {
  return ACTION_KEYS.includes(key);
}

export function can(user, key) {
  if (!user) return false;
  return Boolean(user.permissions && user.permissions.has(key));
}

export function navGroups(user) {
  if (!user) return [];
  const groups = [];
  const add = (label, entries) => {
    const visible = entries.filter((e) => !e.actionKey || can(user, e.actionKey));
    if (visible.length) groups.push({ label, entries: visible });
  };

  if (user.role_key === "CUSTOMER") {
    add("My account", [
      { label: "My jobs", href: "/portal/jobs", actionKey: "job.view.own" },
      { label: "My invoices", href: "/portal/invoices", actionKey: "invoice.view.own" },
      { label: "Appearance", href: "/account/appearance" },
    ]);
    return groups;
  }

  add("Work", [
    { label: "Operations", href: "/dashboard/operations", actionKey: "insight.operational" },
    { label: "My jobs", href: "/my-jobs", actionKey: "job.view.assigned" },
    { label: "Jobs", href: "/jobs", actionKey: "job.view.all" },
    { label: "Customers", href: "/customers", actionKey: "customer.view.all" },
    { label: "Invoices", href: "/invoices", actionKey: "invoice.view.all" },
  ]);
  add("Insights", [
    { label: "Timeline", href: "/insights/timeline", actionKey: "insight.timeline" },
    { label: "Workload", href: "/insights/workload", actionKey: "insight.workload" },
    { label: "Financials", href: "/insights/financials", actionKey: "insight.financial" },
    { label: "Needs invoicing", href: "/insights/needs-invoicing", actionKey: "insight.operational" },
  ]);
  add("Admin", [
    { label: "Users", href: "/admin/users", actionKey: "user.view" },
    { label: "Roles & permissions", href: "/admin/roles", actionKey: "admin.roles.manage" },
    { label: "Settings", href: "/admin/settings", actionKey: "admin.settings.manage" },
    { label: "Site theme", href: "/admin/theme", actionKey: "admin.settings.manage" },
    { label: "Audit log", href: "/admin/audit", actionKey: "admin.audit.view" },
    { label: "Archive", href: "/admin/archive", actionKey: "job.archive" },
  ]);
  add("Account", [{ label: "Appearance", href: "/account/appearance" }]);
  return groups;
}

export function landingFor(user) {
  if (!user) return "/signin";
  if (user.role_key === "CUSTOMER") return "/portal/jobs";
  if (user.role_key === "ENGINEER") return "/my-jobs";
  if (user.role_key === "ADMIN") return "/dashboard/operations";
  return "/dashboard/operations";
}
