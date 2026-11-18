/**
 * Configuration is parsed once, at startup, with a strict Zod schema.
 *
 * Rule: no other module reads `process.env` directly. That makes the whole app
 * testable (inject a config object) and prevents a missing production secret
 * from being discovered halfway through a request.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z.string().url().default("http://localhost:3000"),
    SESSION_SECRET: z.string().min(32).optional(),
    DATABASE_FILE: z.string().min(1).default("data/jms.sqlite"),
    DOCUMENTS_DIR: z.string().min(1).default("storage/documents"),
    BACKUP_DIR: z.string().min(1).default("backups"),
    BACKUP_KEEP_DAILY: z.coerce.number().int().min(1).max(365).default(30),
    BACKUP_KEEP_WEEKLY: z.coerce.number().int().min(1).max(104).default(12),
    BACKUP_KEEP_MONTHLY: z.coerce.number().int().min(1).max(120).default(12),
    BACKUP_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(36),
    BACKUP_MIN_FREE_MB: z.coerce.number().int().min(0).default(512),
    BACKUP_LOCK_FILE: z.string().min(1).default("data/jms.ops.lock"),
    BACKUP_OFFSITE_CMD: z.string().optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    DEFAULT_PASSWORD: z.string().min(6).optional(),
    COMPANY_TIMEZONE: z.string().default("Europe/London"),
    CURRENCY: z.string().length(3).default("GBP"),
    VAT_RATE_BP: z.coerce.number().int().min(0).max(10000).default(2000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    SEED: z.coerce.number().int().default(20260316),
    SEED_DATE: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "SEED_DATE must be YYYY-MM-DD")
      .optional(),
    SQLITE_BUSY_TIMEOUT_MS: z.coerce.number().int().min(0).max(60000).default(5000),
    SQLITE_SYNCHRONOUS: z.enum(["FULL", "NORMAL"]).optional(),
    AUTO_SEED: z.enum(["true", "false"]).default("false"),
  })
  .passthrough();

export type Env = z.infer<typeof EnvSchema>;

export interface AppConfig {
  readonly env: Env["NODE_ENV"];
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly port: number;
  readonly appUrl: string;
  readonly sessionSecret: string;
  readonly databaseFile: string;
  readonly documentsDir: string;
  readonly backupDir: string;
  readonly backupKeepDaily: number;
  readonly backupKeepWeekly: number;
  readonly backupKeepMonthly: number;
  readonly backupMaxAgeHours: number;
  readonly backupMinFreeMb: number;
  readonly backupLockFile: string;
  readonly backupOffsiteCmd: string | undefined;
  readonly sessionIdleMinutes: number;
  readonly sessionAbsoluteHours: number;
  readonly cookieSecure: boolean;
  readonly trustProxy: boolean;
  readonly defaultPassword: string;
  readonly companyTimezone: string;
  readonly currency: string;
  readonly vatRateBp: number;
  readonly logLevel: string;
  readonly seed: number;
  readonly seedDate: string | undefined;
  readonly sqliteBusyTimeoutMs: number;
  readonly sqliteSynchronous: "FULL" | "NORMAL";
  readonly autoSeed: boolean;
  readonly root: string;
  readonly assetRoot: string;
  readonly viewsDir: string;
  readonly publicDir: string;
  readonly migrationsDir: string;
}

/** Build a frozen config from an environment-like object. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = EnvSchema.parse(source);
  const root = process.cwd();

  // In a built deployment, run from `dist/` and use the copied views/assets.
  // In development, run directly from `src/`.
  const distAssetRoot = path.join(root, "dist");
  const assetRoot = existsSync(path.join(distAssetRoot, "views")) ? distAssetRoot : path.join(root, "src");

  if (env.NODE_ENV === "production") {
    if (!env.SESSION_SECRET) {
      throw new Error("SESSION_SECRET is required in production (32+ random characters).");
    }
    if (env.COOKIE_SECURE === "false") {
      throw new Error("COOKIE_SECURE may not be false in production.");
    }
  }

  const sessionSecret =
    env.SESSION_SECRET ??
    // A deterministic development secret is convenient; production is blocked above.
    "development-only-session-secret-change-me-32+";

  const config: AppConfig = {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    port: env.PORT,
    appUrl: env.APP_URL,
    sessionSecret,
    databaseFile: path.resolve(root, env.DATABASE_FILE),
    documentsDir: path.resolve(root, env.DOCUMENTS_DIR),
    backupDir: path.resolve(root, env.BACKUP_DIR),
    backupKeepDaily: env.BACKUP_KEEP_DAILY,
    backupKeepWeekly: env.BACKUP_KEEP_WEEKLY,
    backupKeepMonthly: env.BACKUP_KEEP_MONTHLY,
    backupMaxAgeHours: env.BACKUP_MAX_AGE_HOURS,
    backupMinFreeMb: env.BACKUP_MIN_FREE_MB,
    backupLockFile: path.resolve(root, env.BACKUP_LOCK_FILE),
    backupOffsiteCmd: env.BACKUP_OFFSITE_CMD,
    sessionIdleMinutes: env.SESSION_IDLE_MINUTES,
    sessionAbsoluteHours: env.SESSION_ABSOLUTE_HOURS,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production",
    trustProxy: env.TRUST_PROXY === "true",
    defaultPassword: env.DEFAULT_PASSWORD || "JMS123",
    companyTimezone: env.COMPANY_TIMEZONE,
    currency: env.CURRENCY,
    vatRateBp: env.VAT_RATE_BP,
    logLevel: env.LOG_LEVEL,
    seed: env.SEED,
    seedDate: env.SEED_DATE,
    sqliteBusyTimeoutMs: env.SQLITE_BUSY_TIMEOUT_MS,
    sqliteSynchronous: env.SQLITE_SYNCHRONOUS ?? (env.NODE_ENV === "production" ? "FULL" : "NORMAL"),
    autoSeed: env.AUTO_SEED === "true",
    root,
    assetRoot,
    viewsDir: path.join(assetRoot, "views"),
    publicDir: path.join(assetRoot, "public"),
    migrationsDir: path.join(assetRoot, "db", "migrations"),
  };

  return Object.freeze(config);
}

/** The process-wide config. Tests should call `loadConfig` with explicit values. */
export const config = loadConfig();
