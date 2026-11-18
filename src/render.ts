/**
 * Nunjucks setup and view helpers.
 *
 * Templates receive plain view models. They never query the database and never
 * decide authorisation beyond calling the `can` helper that the server put in
 * locals. Autoescape is always on; notes are plain text.
 */
import path from "node:path";
import nunjucks from "nunjucks";
import type { Response } from "express";
import { config } from "./config.js";
import { formatMoney } from "./domain/money.js";
import { formatDate, formatDateTime, formatTime } from "./domain/dates.js";
import { ROLE_LABELS } from "./domain/permissions.js";
import { STATUS_LABELS, WORK_TYPE_LABELS } from "./domain/status.js";
import type { AuthUser } from "./contracts/types.js";
import { company, settingsMap } from "./services/settings.js";

export const nunjucksEnv = nunjucks.configure(config.viewsDir, {
  autoescape: true,
  noCache: !config.isProduction,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
  express: undefined,
});

nunjucksEnv.addFilter("money", (value: unknown) => formatMoney(typeof value === "number" ? value : null, config.currency));
nunjucksEnv.addFilter("date", (value: unknown) => formatDate(value ? String(value) : null));
nunjucksEnv.addFilter("datetime", (value: unknown) => formatDateTime(value ? String(value) : null));
nunjucksEnv.addFilter("time", (value: unknown) => formatTime(value ? String(value) : null));
nunjucksEnv.addFilter("statusLabel", (value: unknown) => STATUS_LABELS[String(value) as keyof typeof STATUS_LABELS] ?? String(value ?? "—"));
nunjucksEnv.addFilter("workType", (value: unknown) => WORK_TYPE_LABELS[String(value)] ?? String(value ?? "—"));
nunjucksEnv.addFilter("roleLabel", (value: unknown) => ROLE_LABELS[String(value) as keyof typeof ROLE_LABELS] ?? String(value ?? "—"));
nunjucksEnv.addFilter("json", (value: unknown) => JSON.stringify(value));
nunjucksEnv.addFilter("nl2br", (value: unknown) => String(value ?? "").replace(/\r?\n/g, "<br>"));
nunjucksEnv.addFilter("pounds", (value: unknown) => (value === null || value === undefined ? "" : (Number(value) / 100).toFixed(2)));
nunjucksEnv.addFilter("initials", (value: unknown) =>
  String(value ?? "?")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase(),
);
nunjucksEnv.addFilter("capitalize", (value: unknown) => {
  const text = String(value ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
});
nunjucksEnv.addFilter("title", (value: unknown) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
);

nunjucksEnv.addGlobal("appName", "JMS");
nunjucksEnv.addGlobal("companyName", "Acme Windows");

export interface ThemeState {
  mode: "system" | "light" | "dark";
  text: "small" | "normal" | "large";
  leading: "tight" | "normal" | "airy";
}

function resolveTheme(user: AuthUser | undefined): ThemeState {
  let mode: ThemeState["mode"] = "system";
  let text: ThemeState["text"] = "normal";
  let leading: ThemeState["leading"] = "normal";
  try {
    const defaults = settingsMap()["company.default_theme"] as { mode?: string } | undefined;
    if (defaults?.mode === "light" || defaults?.mode === "dark") mode = defaults.mode;
  } catch {
    // The sign-in page can render before settings exist.
  }
  if (user?.theme_prefs_json) {
    try {
      const prefs = JSON.parse(user.theme_prefs_json) as Record<string, unknown>;
      if (prefs["mode"] === "light" || prefs["mode"] === "dark" || prefs["mode"] === "system") mode = prefs["mode"];
      if (prefs["text"] === "small" || prefs["text"] === "large" || prefs["text"] === "normal") text = prefs["text"];
      if (prefs["leading"] === "tight" || prefs["leading"] === "airy" || prefs["leading"] === "normal") {
        leading = prefs["leading"];
      }
    } catch {
      // Ignore malformed preferences; defaults win.
    }
  }
  return { mode, text, leading };
}

export interface RenderContext {
  title: string;
  user?: AuthUser;
  can?: (key: string) => boolean;
  navGroups?: unknown;
  csrfToken?: string;
  flash?: { type: string; message: string } | null;
  currentPath?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function baseContext(res: Response, context: RenderContext): Record<string, unknown> {
  const user = (context.user ?? res.locals["user"]) as AuthUser | undefined;
  let house: ReturnType<typeof company> | null = null;
  try {
    house = company();
  } catch {
    house = null;
  }
  return {
    appName: "JMS",
    company: house ?? { name: "Acme Windows", timezone: config.companyTimezone, currency: config.currency },
    theme: resolveTheme(user),
    themeCss: "",
    cspNonce: res.locals["cspNonce"] ?? "",
    csrfToken: context.csrfToken ?? res.locals["csrfToken"] ?? "",
    flash: context.flash ?? res.locals["flash"] ?? null,
    currentPath: context.currentPath ?? res.locals["currentPath"] ?? "",
    requestId: context.requestId ?? res.locals["requestId"] ?? "",
    navGroups: context.navGroups ?? res.locals["navGroups"] ?? [],
    can: context.can ?? res.locals["can"] ?? (() => false),
    user,
    ...context,
  };
}

export function renderPage(res: Response, template: string, context: RenderContext): void {
  res.type("html").send(nunjucksEnv.render(template, baseContext(res, context)));
}

export function renderFragment(res: Response, template: string, context: RenderContext): void {
  res.type("html").send(nunjucksEnv.render(template, baseContext(res, context)));
}

export function viewPath(...parts: string[]): string {
  return path.join(...parts);
}
