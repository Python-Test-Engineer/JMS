/**
 * Session loading and authentication gates.
 *
 * The cookie is only an opaque token. Every request re-reads the session and
 * user rows, so a revoked session, deactivated user or changed role takes
 * effect immediately rather than at the next sign-in.
 */
import type { NextFunction, Request, Response } from "express";
import { all, one, run } from "../db/index.js";
import { mapSession, mapUser } from "../db/rows.js";
import { takeFlash } from "../auth/sessions.js";
import { COOKIE_NAME, hashToken, touchSession, verifySignedToken } from "../auth/sessions.js";
import { withPermissions } from "../services/access.js";
import { forbidden, unauthorised } from "../errors.js";

export function loadSession(req: Request, res: Response, next: NextFunction): void {
  const signed = req.cookies[COOKIE_NAME];
  if (!signed) return next();
  const token = verifySignedToken(signed);
  if (!token) return next();

  const row = one(
    `SELECT s.*, u.id AS u_id FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ? AND s.revoked_at IS NULL`,
    hashToken(token),
  );
  if (!row) return next();

  const session = mapSession(row);
  const now = Date.now();
  if (Date.parse(session.expires_at) <= now || Date.parse(session.absolute_expires_at) <= now) {
    run("UPDATE sessions SET revoked_at = ? WHERE id_hash = ?", new Date().toISOString(), session.id_hash);
    return next();
  }

  const userRow = one("SELECT u.*, c.name AS customer_name FROM users u LEFT JOIN customers c ON c.id = u.customer_id WHERE u.id = ?", session.user_id);
  if (!userRow) return next();
  const user = mapUser(userRow);
  if (user.status !== "ACTIVE" && user.status !== "INVITED") {
    run("UPDATE sessions SET revoked_at = ? WHERE id_hash = ?", new Date().toISOString(), session.id_hash);
    return next();
  }

  const touched = touchSession(session, req, session.absolute_expires_at);
  req.session = touched;
  req.user = withPermissions(user);
  res.locals["user"] = req.user;
  res.locals["csrfToken"] = session.csrf_token;
  res.locals["flash"] = takeFlash(touched);
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorised("Please sign in to continue."));
  next();
}

export function requirePermission(key: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorised("Please sign in to continue."));
    if (!req.user.permissions.has(key)) return next(forbidden("You do not have permission to do that."));
    next();
  };
}

/** Restrict a field-capable user (ENGINEER or a MANAGER with can_engineer). */
export function requireFieldCapable(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.can_engineer) return next(forbidden("This screen is for field engineers."));
  next();
}

export function forcePasswordChange(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.must_change_password) return next();
  const allowed = ["/account/password", "/signout", "/healthz", "/readyz"];
  if (allowed.includes(req.path) || req.path.startsWith("/assets/")) return next();
  if (req.isHtmx) {
    res.setHeader("HX-Redirect", "/account/password");
    res.status(200).send("");
    return;
  }
  res.redirect("/account/password");
}

export function currentUser(req: Request): NonNullable<Request["user"]> {
  if (!req.user) throw unauthorised();
  return req.user;
}

export function permissionsForRequest(roleKey: string): Set<string> {
  return new Set(
    all<{ action_key: string }>("SELECT action_key FROM permissions WHERE role_key = ? AND allowed = 1", roleKey).map((r) => r.action_key),
  );
}

export function guard(key: string): ReturnType<typeof requirePermission> {
  return requirePermission(key);
}
