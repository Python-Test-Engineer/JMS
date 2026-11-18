/** Assign a request id and a child logger. The id appears in every response. */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  req.id = incoming && /^[A-Za-z0-9._-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  req.log = logger.child({ request_id: req.id });
  req.isHtmx = req.get("hx-request") === "true";
  res.setHeader("X-Request-Id", req.id);
  res.locals["requestId"] = req.id;
  const started = Date.now();
  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - started,
        user_id: req.user?.id ?? null,
      },
      "request",
    );
  });
  next();
}
