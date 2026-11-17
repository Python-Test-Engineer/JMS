import crypto from "node:crypto";
import pinoHttp from "pino-http";
import { logger } from "../logger.js";

export const requestId = (req, res, next) => {
  req.id = req.get("x-request-id") || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  res.locals.requestId = req.id;
  next();
};

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
