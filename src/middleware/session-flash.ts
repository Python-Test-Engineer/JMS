/** Small helper used by routes after a successful redirect. */
import type { Request } from "express";
import { setFlash } from "../auth/sessions.js";

export function flash(req: Request, type: "success" | "error" | "info", message: string): void {
  setFlash(req.session, type, message);
}
