/**
 * Express application factory.
 *
 * The factory does not listen; tests can build an app against a temporary
 * database. Middleware order matters and is documented in `_TECH.md`.
 */
import { randomBytes } from "node:crypto";
import express, { type Express } from "express";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config.js";
import { one } from "./db/index.js";
import { seedDatabase } from "./db/seed.js";
import { requestId } from "./middleware/request-id.js";
import { cookies } from "./middleware/cookies.js";
import { loadSession, forcePasswordChange } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { dashboardsRouter } from "./routes/dashboards.js";
import { jobsRouter } from "./routes/jobs.js";
import { customersRouter } from "./routes/customers.js";
import { invoicesRouter } from "./routes/invoices.js";
import { portalRouter } from "./routes/portal.js";
import { insightsRouter } from "./routes/insights.js";
import { adminRouter } from "./routes/admin.js";
import { searchRouter } from "./routes/search.js";
import { latestBackupStatus } from "./backup/status.js";

export async function createApp(): Promise<Express> {
  const hasCompany = one<{ id: string }>("SELECT id FROM companies LIMIT 1");
  if (!hasCompany && (!config.isProduction || config.autoSeed)) {
    await seedDatabase(false);
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);

  app.use(requestId);
  app.use((req, res, next) => {
    res.locals["cspNonce"] = randomBytes(16).toString("base64");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${String((res as unknown as { locals: Record<string, unknown> }).locals["cspNonce"])}'`],
          styleSrc: ["'self'", (_req, res) => `'nonce-${String((res as unknown as { locals: Record<string, unknown> }).locals["cspNonce"])}'`],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: config.isProduction,
    }),
  );
  app.use(compression());
  app.use("/assets", express.static(config.publicDir, { maxAge: config.isProduction ? "7d" : 0, fallthrough: false }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookies);

  app.get("/healthz", (_req, res) => {
    try {
      one("SELECT 1 AS ok");
      const backup = latestBackupStatus();
      const ok = backup.ageHours === null || backup.ageHours <= config.backupMaxAgeHours;
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        db: "ok",
        schema: one<{ user_version: number }>("PRAGMA user_version")?.["user_version"] ?? null,
        backup: { age_hours: backup.ageHours, verified: backup.verified, file: backup.file },
        version: "2.0.0",
      });
    } catch {
      res.status(503).json({ status: "error", db: "error" });
    }
  });

  app.use(loadSession);
  app.use(forcePasswordChange);
  app.use(csrfProtection);

  app.use(authRouter);
  app.use(dashboardsRouter);
  app.use(jobsRouter);
  app.use(customersRouter);
  app.use(invoicesRouter);
  app.use(portalRouter);
  app.use(insightsRouter);
  app.use(adminRouter);
  app.use(searchRouter);

  app.use((req, res) => notFound(req, res));
  app.use(errorHandler);
  return app;
}
