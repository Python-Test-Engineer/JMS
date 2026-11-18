/**
 * Forward-only, checksummed SQL migrations.
 *
 * Applied files are immutable: a changed checksum is a startup failure, not a
 * silent re-run. A backup is taken by the CLI before this module applies any
 * pending migration (see `cli/jms.ts`).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { Db } from "./connection.js";

interface Migration {
  version: number;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

export function listMigrations(config: AppConfig): Migration[] {
  const files = readdirSync(config.migrationsDir)
    .filter((name) => /^\d{4}[-_].+\.sql$/.test(name))
    .sort();
  return files.map((name) => {
    const version = Number.parseInt(name.slice(0, 4), 10);
    const sql = readFileSync(path.join(config.migrationsDir, name), "utf8");
    return {
      version,
      name,
      file: path.join(config.migrationsDir, name),
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  });
}

export function migrate(config: AppConfig, db: Db): { applied: number; version: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db
    .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number; checksum: string }>;
  const appliedByVersion = new Map(applied.map((row) => [row.version, row.checksum]));
  const migrations = listMigrations(config);

  for (const migration of migrations) {
    const recorded = appliedByVersion.get(migration.version);
    if (recorded !== undefined && recorded !== migration.checksum) {
      throw new Error(
        `Migration ${migration.name} has changed since it was applied. ` +
          `Migrations are immutable; add a new migration instead.`,
      );
    }
  }

  let count = 0;
  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
      ).run(migration.version, migration.name, migration.checksum, new Date().toISOString());
      db.pragma(`user_version = ${migration.version}`);
    });
    run.immediate();
    count += 1;
  }

  const highest = migrations.at(-1)?.version ?? 0;
  const actual = Number(db.pragma("user_version", { simple: true }));
  if (actual !== highest) {
    throw new Error(`Database schema version ${actual} does not match packaged schema ${highest}.`);
  }
  db.pragma("optimize");
  return { applied: count, version: highest };
}

export function verifyMigrations(config: AppConfig, db: Db): void {
  const migrations = listMigrations(config);
  const applied = db
    .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number; checksum: string }>;
  for (const row of applied) {
    const migration = migrations.find((item) => item.version === row.version);
    if (!migration) throw new Error(`Applied migration ${row.version} is missing from this build.`);
    if (migration.checksum !== row.checksum) {
      throw new Error(`Checksum mismatch for applied migration ${migration.name}.`);
    }
  }
}
