/** Central error and 404 handling. Never leak a stack trace to a signed-in user. */
import type { NextFunction, Request, Response } from "express";
import { AppError, toAppError } from "../errors.js";
import { renderPage } from "../render.js";
import { logger } from "../logger.js";

export function notFound(req: Request, res: Response): void {
  res.status(404);
  renderPage(res, "pages/error.njk", {
    title: "Not found",
    status: 404,
    message: "That record could not be found, or it is outside your access.",
    user: req.user,
    requestId: req.id,
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = toAppError(error);
  if (appError.status >= 500) {
    logger.error({ err: error, request_id: req.id, code: appError.code }, "request failed");
  } else {
    req.log?.warn({ code: appError.code, status: appError.status }, appError.message);
  }
  if (res.headersSent) return;
  const status = appError.status || 500;
  res.status(status);
  if (req.isHtmx) {
    res.type("html").send(
      `<div class="alert alert-error" role="alert">${escapeHtml(appError.expose ? appError.message : "Something went wrong.")}</div>`,
    );
    return;
  }
  renderPage(res, "pages/error.njk", {
    title: status === 404 ? "Not found" : status === 403 ? "Not allowed" : "Something went wrong",
    status,
    message: appError.expose ? appError.message : "Something went wrong. The request id is shown below.",
    user: req.user,
    requestId: req.id,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character] ?? character;
  });
}
