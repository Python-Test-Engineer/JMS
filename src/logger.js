import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.password_hash", "*.csrf_token"],
    censor: "[redacted]",
  },
  base: undefined,
});
