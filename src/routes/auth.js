import express from "express";
import { audit, one, run } from "../db/index.js";
import { hashPassword, passwordProblems, verifyPassword } from "../auth/passwords.js";
import {
  COOKIE_NAME, clearCookieOptions, cookieOptions, createSession, revokeAllForUser,
  revokeSession, setFlash,
} from "../auth/sessions.js";
import { hit, clear, blocked } from "../auth/rate-limit.js";
import { landingFor } from "../domain/permissions.js";
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
  return renderPage(req, res, "pages/auth/signin.njk", {
    title: "Sign in",
    next: safeNext(req.query.next) || "",
    email: "",
    error: req.query.expired ? "Your session ended. Sign in again to continue." : null,
  });
});

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
  const current = String(req.body.current_password || "");
  const next = String(req.body.new_password || "");
  const confirm = String(req.body.confirm_password || "");
  const errors = {};

  if (!req.user.must_change_password && !verifyPassword(current, req.user.password_hash)) {
    errors.current_password = "Your current password is not correct.";
  }
  for (const problem of passwordProblems(next, req.user)) errors.new_password = problem;
  if (next !== confirm) errors.confirm_password = "The two passwords do not match.";

  if (Object.keys(errors).length) {
    res.status(400);
    return renderPage(req, res, "pages/account/password.njk", {
      title: "Choose a new password", errors, values: {},
    });
  }

  run(
    "UPDATE users SET password_hash=?, must_change_password=0, updated_at=? WHERE id=?",
    hashPassword(next), new Date().toISOString(), req.user.id,
  );
  revokeAllForUser(req.user.id, req.session.id_hash);
  req.user.must_change_password = false;
  audit({ actorId: req.user.id, action: "auth.password.change", entityType: "USER", entityId: req.user.id, req });
  setFlash(req.session, "success", "Your password has been updated.");
  res.redirect(landingFor(req.user));
});

authRouter.get("/account/appearance", requireAuth, (req, res) => {
  let prefs = {};
  try { prefs = JSON.parse(req.user.theme_prefs_json || "{}"); } catch { prefs = {}; }
  renderPage(req, res, "pages/account/appearance.njk", {
    title: "Appearance",
    prefs: { mode: prefs.mode || "system", text_scale: prefs.text_scale || 1, line_height: prefs.line_height || 1.55 },
  });
});

authRouter.post("/account/appearance", requireAuth, (req, res) => {
  const mode = ["system", "light", "dark"].includes(req.body.mode) ? req.body.mode : "system";
  const textScale = Math.min(1.35, Math.max(0.9, Number(req.body.text_scale) || 1));
  const lineHeight = Math.min(1.9, Math.max(1.3, Number(req.body.line_height) || 1.55));
  const prefs = { mode, text_scale: textScale, line_height: lineHeight };
  run("UPDATE users SET theme_prefs_json=?, updated_at=? WHERE id=?",
    JSON.stringify(prefs), new Date().toISOString(), req.user.id);
  setFlash(req.session, "success", "Appearance saved.");
  res.redirect("/account/appearance");
});

authRouter.get("/", requireAuth, (req, res) => res.redirect(landingFor(req.user)));
