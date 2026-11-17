import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import { isSeeded, seedDatabase } from "./seed.js";

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
fs.mkdirSync(config.pdfDir, { recursive: true });

export const db = new DatabaseSync(config.databaseFile);
db.exec(SCHEMA_SQL);

db.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
db.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('database_file', ?)").run(path.basename(config.databaseFile));

if (!isSeeded(db)) {
  const started = Date.now();
  const result = seedDatabase(db, { seed: config.SEED });
  logger.info({ ...result, ms: Date.now() - started }, "database seeded with sample data");
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function one(sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* ignore rollback failure */ }
    throw error;
  }
}

export function nextSequence(kind, year) {
  const row = one("SELECT value FROM sequences WHERE kind=? AND year=?", kind, year);
  const value = (row?.value ?? 0) + 1;
  if (row) run("UPDATE sequences SET value=? WHERE kind=? AND year=?", value, kind, year);
  else run("INSERT INTO sequences (kind,year,value) VALUES (?,?,?)", kind, year, value);
  return value;
}

export function audit({ actorId = null, action, entityType, entityId = null, before = null, after = null, req = null }) {
  run(
    `INSERT INTO audit_log
      (id,company_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,at,ip,user_agent,request_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    one("SELECT id FROM companies LIMIT 1")?.id ?? "unknown",
    actorId,
    action,
    entityType,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    new Date().toISOString(),
    req?.ip ?? null,
    req?.get?.("user-agent") ?? null,
    req?.id ?? null,
  );
}

export function setting(key, fallback = null) {
  const row = one("SELECT value_json FROM settings WHERE key=?", key);
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}
