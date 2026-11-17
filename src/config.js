import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// Load .env without a dependency. Existing environment wins.
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const key = match[1];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const bool = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().default("dev-only-insecure-session-secret-change-me"),
  DATABASE_FILE: z.string().default("jms.db"),
  PDF_DIR: z.string().default("storage/documents"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),
  COOKIE_SECURE: bool(false),
  TRUST_PROXY: bool(false),
  DEFAULT_PASSWORD: z.string().default("JMS123"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),
  GOOGLE_ADMIN_EMAILS: z.string().optional().default(""),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  COMPANY_TIMEZONE: z.string().default("Europe/London"),
  CURRENCY: z.string().default("GBP"),
  VAT_RATE_BP: z.coerce.number().int().min(0).max(10000).default(2000),
  LOG_LEVEL: z.string().default("info"),
  SEED: z.coerce.number().int().default(20260316),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const googleAdminEmails = parsed.data.GOOGLE_ADMIN_EMAILS
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Show only the provider prefix and the first four characters of the key: sk-or-v1-a9ee****
function maskApiKey(key) {
  if (!key) return "not configured";
  const prefix = key.startsWith("sk-or-v1-") ? "sk-or-v1-" : key.startsWith("sk-") ? "sk-" : "";
  const body = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return `${prefix}${body.slice(0, 4)}****`;
}

export const config = Object.freeze({
  ...parsed.data,
  openRouterKeyMasked: maskApiKey(parsed.data.OPENROUTER_API_KEY),
  isProduction: parsed.data.NODE_ENV === "production",
  root: process.cwd(),
  databaseFile: path.resolve(process.cwd(), parsed.data.DATABASE_FILE),
  pdfDir: path.resolve(process.cwd(), parsed.data.PDF_DIR),
  googleEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
  googleRedirectUri: parsed.data.GOOGLE_REDIRECT_URI
    || `${parsed.data.APP_URL.replace(/\/$/, "")}/auth/google/callback`,
  googleAdminEmails,
});

if (config.isProduction) {
  const problems = [];
  if (config.SESSION_SECRET.length < 32) problems.push("SESSION_SECRET must be at least 32 characters");
  if (!config.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true in production");
  if (problems.length) {
    console.error("Production configuration refused:\n - " + problems.join("\n - "));
    process.exit(1);
  }
}
