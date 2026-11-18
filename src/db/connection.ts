/**
 * SQLite connection factory.
 *
 * The pragmas are part of correctness, not tuning:
 *   WAL lets cron take a consistent online backup while the app writes.
 *   foreign_keys makes every reference real.
 *   synchronous=FULL refuses to acknowledge a commit the disk may not hold.
 *   busy_timeout waits for a short lock instead of throwing immediately.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";

export type Db = Database.Database;

export function openDatabase(config: AppConfig): Db {
  mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  const db = new Database(config.databaseFile);
  applyPragmas(db, config);
  return db;
}

export function applyPragmas(db: Db, config: AppConfig): void {
  db.pragma("journal_mode = WAL");
  db.pragma(`synchronous = ${config.sqliteSynchronous}`);
  db.pragma("foreign_keys = ON");
  db.pragma(`busy_timeout = ${config.sqliteBusyTimeoutMs}`);
  db.pragma("trusted_schema = OFF");
  db.pragma("temp_store = MEMORY");
  db.pragma("wal_autocheckpoint = 1000");

  // Verify the settings actually took effect. A read-only volume or a database
  // opened in a surprising mode should fail the boot rather than run unsafe.
  const journal = db.pragma("journal_mode", { simple: true });
  if (String(journal).toLowerCase() !== "wal") {
    throw new Error(`SQLite refused WAL mode (got ${String(journal)}).`);
  }
  const foreignKeys = db.pragma("foreign_keys", { simple: true });
  if (Number(foreignKeys) !== 1) {
    throw new Error("SQLite foreign keys could not be enabled.");
  }
}

export function closeDatabase(db: Db): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.pragma("optimize");
  } finally {
    db.close();
  }
}
