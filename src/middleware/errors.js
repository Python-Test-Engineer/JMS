import { renderPage } from "../render.js";
import { logger } from "../logger.js";

export function notFound(req, res) {
  res.status(404);
  renderPage(req, res, "pages/error.njk", {
    title: "Not found",
    status: 404,
    message: "That record could not be found, or you do not have access to it.",
  });
}

export function forbidden(req, res, message = "You do not have permission to do that.") {
  res.status(403);
  renderPage(req, res, "pages/error.njk", { title: "Not available", status: 403, message });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) {
    logger.error({ err: error, requestId: req.id, path: req.path }, "request failed");
  }
  if (req.get("HX-Request") === "true" && status < 500) {
    return res.status(status).send(`<div class="alert alert-error" role="alert">${escapeHtml(error.message)}</div>`);
  }
  res.status(status);
  renderPage(req, res, "pages/error.njk", {
    title: status === 403 ? "Not available" : status === 404 ? "Not found" : "Something went wrong",
    status,
    message: status >= 500
      ? "The request could not be completed. Quote the request ID when you contact support."
      : error.message,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
