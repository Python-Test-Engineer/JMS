import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config.js";
import { one } from "./db/index.js";
import { requestId, httpLogger } from "./middleware/request-id.js";
import { loadSession, loadUser, forcePasswordChange } from "./middleware/auth.js";
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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(requestId);
  app.use(httpLogger);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
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
  }));
  app.use(compression());
  app.use("/assets", express.static(path.resolve(config.root, "src/public"), {
    maxAge: config.isProduction ? "7d" : 0,
  }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  app.get("/healthz", (req, res) => {
    let dbOk = false;
    try { dbOk = Boolean(one("SELECT 1 AS ok")); } catch { dbOk = false; }
    res.status(dbOk ? 200 : 500).json({ status: dbOk ? "ok" : "error", db: dbOk ? "ok" : "error", version: "1.0.0" });
  });

  app.use(loadSession);
  app.use(loadUser);
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

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
