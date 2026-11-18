/** HTTP listener and graceful shutdown. */
import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db/index.js";
import { logger } from "./logger.js";

const app = await createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env, db: config.databaseFile }, "JMS listening");
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.warn({ signal }, "second shutdown signal — exiting immediately");
    process.exit(1);
  }
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  const force = setTimeout(() => {
    logger.error("graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    closeDb();
    clearTimeout(force);
    logger.info("shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection");
});
