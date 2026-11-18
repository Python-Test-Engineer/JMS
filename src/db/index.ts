/**
 * Process-wide database access.
 *
 * Repositories call these helpers rather than opening their own handles. Every
 * query is parameterised; the statement cache avoids recompiling hot queries.
 */
import type { AppConfig } from "../config.js";
import { config } from "../config.js";
import { applyPragmas, openDatabase, type Db } from "./connection.js";
import { migrate } from "./migrator.js";

let handle: Db | null = null;
const statementCache = new Map<string, import("better-sqlite3").Statement>();

export function getDb(appConfig: AppConfig = config): Db {
  if (!handle) {
    handle = openDatabase(appConfig);
    migrate(appConfig, handle);
  }
  return handle;
}

export function setDbForTests(db: Db): void {
  handle = db;
  statementCache.clear();
}

export function closeDb(): void {
  if (handle) {
    try {
      handle.pragma("wal_checkpoint(TRUNCATE)");
      handle.pragma("optimize");
    } finally {
      handle.close();
      handle = null;
      statementCache.clear();
    }
  }
}

function statement(sql: string): import("better-sqlite3").Statement {
  let prepared = statementCache.get(sql);
  if (!prepared) {
    prepared = getDb().prepare(sql);
    statementCache.set(sql, prepared);
  }
  return prepared;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return statement(sql).all(...params) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | null {
  const row = statement(sql).get(...params);
  return (row as T | undefined) ?? null;
}

export function run(sql: string, ...params: unknown[]): import("better-sqlite3").RunResult {
  return statement(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn).immediate();
}

export { applyPragmas };
export type { Db };
