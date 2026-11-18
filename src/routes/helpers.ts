/** Small route helpers shared by every area. */
import type { Request, Response } from "express";
import type { AuthUser, WriteMeta } from "../contracts/types.js";
import { can, navGroupsFor } from "../domain/permissions.js";
import { writeMeta } from "../services/access.js";

export function layout(req: Request, res: Response): void {
  const user = req.user;
  res.locals["user"] = user;
  res.locals["can"] = (key: string) => (user ? can(user, key as never) : false);
  res.locals["navGroups"] = user ? navGroupsFor(user) : [];
  res.locals["currentPath"] = req.path;
  res.locals["csrfToken"] = req.csrfToken ?? "";
}

export function meta(req: Request): WriteMeta {
  return writeMeta(req);
}

export function current(req: Request): AuthUser {
  if (!req.user) throw new Error("Route reached without a user.");
  return req.user;
}

export function landingFor(user: AuthUser): string {
  if (user.role_key === "CUSTOMER") return "/portal/jobs";
  if (user.role_key === "ENGINEER") return "/my-jobs";
  return "/dashboard/operations";
}

export function safeNext(value: unknown): string | null {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}
