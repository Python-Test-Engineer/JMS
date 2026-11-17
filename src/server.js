import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { logger } from "./logger.js";

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV, database: config.databaseFile }, "JMS listening");
});

function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "unhandled rejection");
  process.exit(1);
});
