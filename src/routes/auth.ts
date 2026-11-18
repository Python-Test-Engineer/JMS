/** Sign-in, sign-out, forced password change and appearance preferences. */
import { Router } from "express";
import { config } from "../config.js";
import { renderPage } from "../render.js";
import { COOKIE_NAME, revokeSessionByHash, signToken } from "../auth/sessions.js";
import { changePassword, saveThemePreferences, signIn } from "../services/auth.js";
import { requireUser } from "../middleware/auth.js";
import { flash } from "../middleware/session-flash.js";
import { layout, landingFor, current, safeNext } from "./helpers.js";

export const authRouter = Router();

authRouter.get("/signin", (req, res) => {
  if (req.user) return res.redirect(landingFor(req.user));
  renderPage(res, "pages/auth/signin.njk", {
    title: "Sign in",
    email: "",
    next: safeNext(req.query["next"]) ?? "",
    error: null,
    user: undefined,
    csrfToken: req.csrfToken,
  });
});

authRouter.post("/signin", async (req, res) => {
  const result = await signIn(req, req.body["email"], req.body["password"]);
  if (!result.ok || !result.token) {
    res.status(result.retryAfterSeconds ? 429 : 400);
    if (result.retryAfterSeconds) res.setHeader("Retry-After", String(result.retryAfterSeconds));
    return renderPage(res, "pages/auth/signin.njk", {
      title: "Sign in",
      email: String(req.body["email"] ?? ""),
      next: safeNext(req.body["next"]) ?? "",
      error: result.message ?? "Sign-in failed.",
      csrfToken: req.csrfToken,
    });
  }
  res.cookie(COOKIE_NAME, signToken(result.token), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionAbsoluteHours * 3_600_000,
  });
  return res.redirect(result.user?.must_change_password ? "/account/password" : landingFor(result.user!));
});

authRouter.post("/signout", requireUser, (req, res) => {
  if (req.session) revokeSessionByHash(req.session.id_hash);
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.redirect("/signin");
});

authRouter.get("/account/password", requireUser, (req, res) => {
  layout(req, res);
  renderPage(res, "pages/account/password.njk", {
    title: req.user?.must_change_password ? "Choose a new password" : "Change password",
    user: req.user,
    error: null,
  });
});

authRouter.post("/account/password", requireUser, async (req, res) => {
  const user = current(req);
  if (!req.session) throw new Error("Session missing.");
  const result = await changePassword(
    user,
    req.session,
    String(req.body["current_password"] ?? ""),
    String(req.body["new_password"] ?? ""),
  );
  if (!result.ok || !result.token) {
    layout(req, res);
    res.status(400);
    return renderPage(res, "pages/account/password.njk", { title: "Change password", user, error: result.message });
  }
  res.cookie(COOKIE_NAME, signToken(result.token), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionAbsoluteHours * 3_600_000,
  });
  flash(req, "success", "Password changed. Other sessions have been signed out.");
  return res.redirect(landingFor(user));
});

authRouter.get("/account/appearance", requireUser, (req, res) => {
  layout(req, res);
  renderPage(res, "pages/account/appearance.njk", {
    title: "Appearance",
    user: req.user,
    personalised: Boolean(req.user?.theme_prefs_json),
  });
});

authRouter.post("/account/appearance", requireUser, (req, res) => {
  const user = current(req);
  saveThemePreferences(user, req.body);
  flash(req, "success", "Appearance saved.");
  res.redirect("/account/appearance");
});
