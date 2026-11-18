/**
 * Restore a verified snapshot.
 *
 * The restore works on a copy, never on the snapshot itself. It keeps a
 * pre-restore copy, removes stale WAL sidecars, and revokes all sessions by
 * default so an old cookie cannot authenticate against rolled-back data.
 */
import Database from "better-sqlite3";
import { copyFileSync, existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { openDatabase } from "../db/connection.js";
import { verifySnapshot } from "./verify.js";

export function restoreSnapshot(
  config: AppConfig,
  base: string,
  options: { keepSessions?: boolean } = {},
): { preRestore: string } {
  const verification = verifySnapshot(config, base);
  if (!verification.ok) {
    throw new Error(`Refusing to restore an unverified snapshot: ${verification.problems.join("; ")}`);
  }
  const source = path.join(config.backupDir, `${base.replace(/\.db$/, "")}.db`);
  if (!existsSync(config.databaseFile)) throw new Error("The live database does not exist; use migrate/seed instead.");

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const preRestore = `${config.databaseFile}.pre-restore-${stamp}`;
  copyFileSync(config.databaseFile, preRestore);
  const temp = `${config.databaseFile}.restore-${stamp}`;
  copyFileSync(source, temp);

  const check = new Database(temp, { readonly: true });
  try {
    const integrity = check.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (!integrity.every((row) => row.integrity_check === "ok")) {
      throw new Error("Restored copy failed integrity_check.");
    }
  } finally {
    check.close();
  }

  renameSync(config.databaseFile, `${config.databaseFile}.replaced-${stamp}`);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${config.databaseFile}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
  renameSync(temp, config.databaseFile);

  const db = openDatabase(config);
  try {
    if (!options.keepSessions) {
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL").run(new Date().toISOString());
    }
    db.prepare(
      `INSERT INTO audit_log
        (id, company_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, at, ip, user_agent, request_id)
       SELECT lower(hex(randomblob(16))), id, NULL, 'backup.restore', 'SYSTEM', NULL, NULL, ?, ?, NULL, NULL, NULL
       FROM companies LIMIT 1`,
    ).run(JSON.stringify({ source: base }), new Date().toISOString());
    db.pragma("optimize");
  } finally {
    db.close();
  }
  writeFileSync(
    path.join(config.backupDir, `last-restore-${stamp}.json`),
    JSON.stringify({ source: base, at: new Date().toISOString(), keepSessions: Boolean(options.keepSessions) }, null, 2),
  );
  return { preRestore };
}
