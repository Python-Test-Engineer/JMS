/**
 * One structured logger for the whole process.
 *
 * Request logs add `request_id`, never cookies, bodies, passwords or tokens.
 * The redaction list is deliberately broad because Pino's redaction applies to
 * nested keys as well as top-level ones.
 */
import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.isTest ? "silent" : config.logLevel,
  base: { service: "jms" },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "password",
      "*.password",
      "password_hash",
      "*.password_hash",
      "_csrf",
      "*.csrf_token",
      "token",
      "*.token",
      "session",
    ],
    censor: "[redacted]",
  },
});
