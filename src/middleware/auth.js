import { parse } from "cookie";
import { config } from "../config.js";
import { all, one } from "../db/index.js";
import { COOKIE_NAME, clearCookieOptions, getSessionByToken, sessionExpired, takeFlash, touchSession } from "../auth/sessions.js";
import { formatDate, formatDateTime, formatTime, todayRange } from "../domain/dates.js";
import { formatMoney } from "../domain/money.js";
import { navGroups } from "../domain/permissions.js";
import { resolveTheme, themeCss } from "../domain/theme.js";

export function loadSession(req, res, next) {
  const cookies = parse(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  req.session = null;
  req.sessionExpired = false;
  if (token) {
    const session = getSessionByToken(token);
    if (session && sessionExpired(session)) {
      req.sessionExpired = true;
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
    } else if (session) {
      req.session = session;
      touchSession(session);
    }
  }
  next();
}

export function loadUser(req, res, next) {
  req.user = null;
  if (req.session?.user_id) {
    const user = one("SELECT * FROM users WHERE id=?", req.session.user_id);
    if (!user || user.status !== "ACTIVE") {
      req.session = null;
      res.clearCookie(COOKIE_NAME, clearCookieOptions());
    } else {
      user.can_engineer = Boolean(user.can_engineer);
      user.must_change_password = Boolean(user.must_change_password);
      user.permissions = new Set(
        all("SELECT action_key FROM permissions WHERE role_key=? AND allowed=1", user.role_key)
          .map((row) => row.action_key),
      );
      req.user = user;
    }
  }

  const company = one("SELECT * FROM companies LIMIT 1");
  if (company) {
    try { company.address = JSON.parse(company.address_json); } catch { company.address = {}; }
    try { company.default_theme = JSON.parse(company.default_theme_json); } catch { company.default_theme = { mode: "system" }; }
  }

  res.locals.user = req.user;
  res.locals.company = company;
  res.locals.can = (key) => Boolean(req.user?.permissions?.has(key));
  res.locals.csrfToken = req.session?.csrf_token ?? "";
  res.locals.openRouterKeyMasked = config.openRouterKeyMasked;
  res.locals.currentPath = req.path;
  res.locals.navGroups = navGroups(req.user);
  res.locals.flash = req.session ? takeFlash(req.session) : null;
  req.session && (req.session.flash_json = null);
  res.locals.formatMoney = (pence) => formatMoney(pence, config.CURRENCY);
  res.locals.formatDate = formatDate;
  res.locals.formatDateTime = formatDateTime;
  res.locals.formatTime = formatTime;
  res.locals.todayRange = todayRange();
  res.locals.isHtmx = req.get("HX-Request") === "true";
  res.locals.query = req.query;

  let prefs = null;
  if (req.user?.theme_prefs_json) {
    try { prefs = JSON.parse(req.user.theme_prefs_json); } catch { prefs = null; }
  }
  const theme = resolveTheme(company?.default_theme, prefs);
  res.locals.theme = theme;
  res.locals.themeMode = theme.mode;
  res.locals.themeCss = themeCss(theme);
  res.locals.themeJson = JSON.stringify(theme).replace(/</g, "\\u003c");

  next();
}

const ALLOWED_WHEN_FORCED = new Set(["/account/password", "/signout", "/healthz"]);
export function forcePasswordChange(req, res, next) {
  if (!req.user?.must_change_password) return next();
  if (ALLOWED_WHEN_FORCED.has(req.path) || req.path.startsWith("/public/")) return next();
  if (req.path === "/account/password" ) return next();
  return res.redirect("/account/password");
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  const nextPath = req.method === "GET" ? req.originalUrl : "/";
  return res.redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
}
