import crypto from "node:crypto";
import express from "express";
import { parse } from "cookie";
import { audit, one, run } from "../db/index.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import {
  COOKIE_NAME, clearCookieOptions, cookieOptions, createSession,
  revokeSession, setFlash,
} from "../auth/sessions.js";
import { hit, clear, blocked } from "../auth/rate-limit.js";
import {
  GOOGLE_STATE_COOKIE, clearGoogleCookieOptions, createGoogleState, exchangeGoogleCode,
  fetchGoogleProfile, googleAuthorizationUrl, googleConfigured, googleCookieOptions,
  googleStateMatches, isGoogleAdminEmail,
} from "../auth/google.js";
import { landingFor } from "../domain/permissions.js";
import {
  FONT_FIELDS, TYPE_FIELDS, fontOptions, mergeTheme, resolveTheme, userPreferencesFromForm,
} from "../domain/theme.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/permissions.js";
import { renderPage } from "../render.js";

export const authRouter = express.Router();

function safeNext(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

authRouter.get("/signin", (req, res) => {
  if (req.user) return res.redirect(landingFor(req.user));
  if (!req.session) {
    const created = createSession({ ip: req.ip, userAgent: req.get("user-agent") });
    req.session = { ...created.session, id_hash: created.session.id_hash, csrf_token: created.csrfToken };
    setSessionCookie(res, created.token);
  }
  res.locals.csrfToken = req.session.csrf_token;
  const googleErrors = {
    google_config: "Google sign-in is not configured yet. Add the Google client ID and secret to the server environment.",
    google_cancelled: "Google sign-in was cancelled.",
    google_state: "Your Google sign-in session expired. Please try again.",
    google_denied: "That Google account is not allowed to sign in.",
    google_failed: "Google sign-in could not be completed. Please try again.",
  };
  return renderPage(req, res, "pages/auth/signin.njk", {
    title: "Sign in",
    next: safeNext(req.query.next) || "",
    email: "",
    error: req.query.expired
      ? "Your session ended. Sign in again to continue."
      : googleErrors[req.query.error] || null,
  });
});

authRouter.get("/auth/google", (req, res) => {
  if (!googleConfigured()) return res.redirect("/signin?error=google_config");
  if (req.user) return res.redirect(landingFor(req.user));
  const state = createGoogleState();
  res.cookie(GOOGLE_STATE_COOKIE, state, googleCookieOptions());
  return res.redirect(googleAuthorizationUrl(state));
});

authRouter.get("/auth/google/callback", asyncHandler(async (req, res) => {
  const cookies = parse(req.headers.cookie || "");
  const expectedState = cookies[GOOGLE_STATE_COOKIE];
  res.clearCookie(GOOGLE_STATE_COOKIE, clearGoogleCookieOptions());

  if (!googleConfigured()) return res.redirect("/signin?error=google_config");
  if (req.query.error) return res.redirect("/signin?error=google_cancelled");
  if (!googleStateMatches(expectedState, req.query.state)) return res.redirect("/signin?error=google_state");
  if (typeof req.query.code !== "string" || !req.query.code) return res.redirect("/signin?error=google_failed");

  let profile;
  try {
    const tokens = await exchangeGoogleCode(req.query.code);
    if (!tokens.access_token) throw new Error("Google did not return an access token");
    profile = await fetchGoogleProfile(tokens.access_token);
  } catch (error) {
    audit({ action: "auth.google.failed", entityType: "AUTH", after: { reason: "token_exchange" }, req });
    return res.redirect("/signin?error=google_failed");
  }

  const email = String(profile.email || "").trim().toLowerCase();
  const verified = profile.email_verified === true || profile.email_verified === "true";
  if (!email || !verified) {
    audit({ action: "auth.google.failed", entityType: "AUTH", after: { email, reason: "unverified_email" }, req });
    return res.redirect("/signin?error=google_failed");
  }

  let user = one("SELECT * FROM users WHERE email=?", email);
  if (!user) {
    if (!isGoogleAdminEmail(email)) {
      audit({ action: "auth.google.failed", entityType: "AUTH", after: { email, reason: "not_allowed" }, req });
      return res.redirect("/signin?error=google_denied");
    }
    const company = one("SELECT id FROM companies LIMIT 1");
    if (!company) return res.redirect("/signin?error=google_failed");

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const displayName = String(profile.name || email.split("@")[0]).trim().slice(0, 120) || "Google Admin";
    run(
      `INSERT INTO users (id,company_id,email,password_hash,display_name,role_key,customer_id,can_engineer,phone,status,must_change_password,theme_prefs_json,last_login_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, company.id, email, hashPassword(crypto.randomBytes(32).toString("hex")), displayName,
      "ADMIN", null, 0, null, "ACTIVE", 0, null, null, now, now,
    );
    user = one("SELECT * FROM users WHERE id=?", id);
    audit({
      actorId: user.id, action: "auth.google.admin.create", entityType: "USER", entityId: user.id,
      after: { email, role: "ADMIN", source: "GOOGLE" }, req,
    });
  }

  if (user.status !== "ACTIVE") {
    audit({ actorId: user.id, action: "auth.google.failed", entityType: "AUTH", after: { email, reason: "inactive" }, req });
    return res.redirect("/signin?error=google_denied");
  }

  const oldSession = req.session;
  const { token } = createSession({ userId: user.id, ip: req.ip, userAgent: req.get("user-agent") });
  if (oldSession) revokeSession(oldSession);
  setSessionCookie(res, token);
  const now = new Date().toISOString();
  run("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", now, now, user.id);
  audit({ actorId: user.id, action: "auth.google.success", entityType: "AUTH", entityId: user.id, req });

  if (user.must_change_password) return res.redirect("/account/password");
  return res.redirect(landingFor(user));
}));

authRouter.post("/signin", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const next = safeNext(req.body.next);
  const ipKey = `signin-ip:${req.ip}`;
  const emailKey = `signin-email:${req.ip}:${email}`;

  if (blocked(ipKey, 20, 15 * 60_000) || blocked(emailKey, 5, 15 * 60_000)) {
    res.status(429);
    return renderPage(req, res, "pages/auth/signin.njk", {
      title: "Sign in", next, email,
      error: "Too many attempts. Wait 15 minutes before trying again.",
    });
  }

  const user = one("SELECT * FROM users WHERE email=?", email);
  const valid = user && user.status === "ACTIVE" && verifyPassword(password, user.password_hash);

  if (!valid) {
    hit(ipKey, 20, 15 * 60_000);
    hit(emailKey, 5, 15 * 60_000);
    audit({ actorId: user?.id ?? null, action: "auth.signin.failed", entityType: "AUTH", after: { email }, req });
    res.status(401);
    return renderPage(req, res, "pages/auth/signin.njk", {
      title: "Sign in", next, email,
      error: "Email or password not recognised. Check both and try again.",
    });
  }

  clear(emailKey);
  const oldSession = req.session;
  const { token } = createSession({ userId: user.id, ip: req.ip, userAgent: req.get("user-agent") });
  if (oldSession) revokeSession(oldSession);
  setSessionCookie(res, token);
  run("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", new Date().toISOString(), new Date().toISOString(), user.id);
  audit({ actorId: user.id, action: "auth.signin.success", entityType: "AUTH", entityId: user.id, req });

  if (user.must_change_password) return res.redirect("/account/password");
  return res.redirect(next || landingFor(user));
});

authRouter.post("/signout", (req, res) => {
  if (req.user) audit({ actorId: req.user.id, action: "auth.signout", entityType: "AUTH", entityId: req.user.id, req });
  revokeSession(req.session);
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  res.redirect("/signin");
});

authRouter.get("/account/password", requireAuth, (req, res) => {
  renderPage(req, res, "pages/account/password.njk", {
    title: req.user.must_change_password ? "Choose a new password" : "Change password",
    errors: {},
    values: {},
  });
});

authRouter.post("/account/password", requireAuth, (req, res) => {
  // Testing bypass: no password is ever written to the database, so every
  // account keeps the temporary password (JMS123). A forced first-sign-in is
  // cleared so the user can carry on into the app.
  if (req.user.must_change_password) {
    run("UPDATE users SET must_change_password=0, updated_at=? WHERE id=?",
      new Date().toISOString(), req.user.id);
    req.user.must_change_password = false;
  }
  audit({ actorId: req.user.id, action: "auth.password.change.bypassed", entityType: "USER", entityId: req.user.id, req });
  setFlash(req.session, "success", "Password change is being bypassed for testing. Your password is unchanged (JMS123).");
  return res.redirect(landingFor(req.user));
});

function savedUserPrefs(user) {
  try { return JSON.parse(user.theme_prefs_json || "null"); } catch { return null; }
}

// Overlay a partial prefs patch (topbar site settings) on the saved prefs
// without materialising company/default values into the user's own JSON.
function mergeUserPreferences(existing, patch) {
  const base = existing && typeof existing === "object" ? existing : {};
  const next = { ...base };
  if (patch.mode) next.mode = patch.mode;
  for (const section of ["type", "fonts", "colors", "dark"]) {
    const values = patch[section];
    if (values && Object.keys(values).length) next[section] = { ...(base[section] || {}), ...values };
  }
  return next;
}

function companyTheme() {
  const company = one("SELECT default_theme_json FROM companies LIMIT 1");
  try { return resolveTheme(JSON.parse(company?.default_theme_json || "{}")); } catch { return resolveTheme(null); }
}

authRouter.get("/account/appearance", requireAuth, (req, res) => {
  const prefs = savedUserPrefs(req.user);
  const theme = mergeTheme(companyTheme(), prefs);
  renderPage(req, res, "pages/account/appearance.njk", {
    title: "Appearance",
    theme,
    personalised: Boolean(prefs),
    typeFields: TYPE_FIELDS,
    fontFields: FONT_FIELDS.map((field) => ({ ...field, options: fontOptions(field.key, theme.fonts[field.key]) })),
  });
});

authRouter.post("/account/appearance", requireAuth, (req, res) => {
  if (req.body.reset === "1") {
    run("UPDATE users SET theme_prefs_json=NULL, updated_at=? WHERE id=?",
      new Date().toISOString(), req.user.id);
    setFlash(req.session, "success", "Appearance reset to the company default.");
    return res.redirect("/account/appearance");
  }
  const patch = userPreferencesFromForm(req.body);
  // Merge over the saved preferences so partial updates (the topbar site
  // settings panel) do not wipe fonts, colours or type set on the full page.
  const existing = savedUserPrefs(req.user);
  const nextPrefs = mergeUserPreferences(existing, patch);
  run("UPDATE users SET theme_prefs_json=?, updated_at=? WHERE id=?",
    JSON.stringify(nextPrefs), new Date().toISOString(), req.user.id);
  audit({ actorId: req.user.id, action: "theme.user.update", entityType: "USER", entityId: req.user.id, after: { mode: nextPrefs.mode }, req });
  setFlash(req.session, "success", "Appearance saved.");
  res.redirect("/account/appearance");
});

authRouter.get("/", requireAuth, (req, res) => res.redirect(landingFor(req.user)));
