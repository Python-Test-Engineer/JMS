/**
 * CSRF protection.
 *
 * Authenticated requests use the token stored on the session. Anonymous forms
 * (sign-in) use a double-submit cookie. Both comparisons are constant-time.
 * Missing or mismatched tokens are rejected before any state can change.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

const CSRF_COOKIE = config.isProduction ? "__Host-jms_csrf" : "jms_csrf";

export function newCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  let token = req.session?.csrf_token;
  if (!token) {
    token = req.cookies[CSRF_COOKIE];
    if (!token) {
      token = newCsrfToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        path: "/",
        maxAge: 24 * 60 * 60 * 1000,
      });
    }
  }
  req.csrfToken = token;
  res.locals["csrfToken"] = token;

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const provided = String(req.body?.["_csrf"] ?? req.get("x-csrf-token") ?? "");
  if (!token || !provided || !safeEqual(token, provided)) {
    res.status(403);
    if (req.isHtmx) { res.type("text").send("Your form session expired. Reload the page and try again."); return; }
    res.type("html").send("<!doctype html><title>Request blocked</title><h1>Request blocked</h1><p>Your form session expired. Go back, reload the page and try again.</p>");
    return;
  }
  next();
}
