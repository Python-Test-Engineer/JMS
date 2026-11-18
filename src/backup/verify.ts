/** Verify a snapshot's checksum, manifest, integrity and core counts. */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { ManifestSchema, type BackupManifest } from "./manifest.js";

export function verifySnapshot(config: AppConfig, baseOrFile: string): { ok: boolean; manifest?: BackupManifest; problems: string[] } {
  const base = baseOrFile.replace(/\.db$/, "");
  const dbPath = path.join(config.backupDir, `${base}.db`);
  const manifestPath = path.join(config.backupDir, `${base}.json`);
  const problems: string[] = [];
  if (!existsSync(dbPath)) problems.push("database file missing");
  if (!existsSync(manifestPath)) problems.push("manifest missing");
  if (problems.length > 0) return { ok: false, problems };

  let manifest: BackupManifest;
  try {
    manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  } catch (error) {
    return { ok: false, problems: [`manifest invalid: ${error instanceof Error ? error.message : "unknown"}`] };
  }
  const checksum = createHash("sha256").update(readFileSync(dbPath)).digest("hex");
  if (checksum !== manifest.sha256) problems.push("checksum mismatch");

  const db = new Database(dbPath, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (!integrity.every((row) => row.integrity_check === "ok")) problems.push("integrity_check failed");
    const fk = db.pragma("foreign_key_check") as unknown[];
    if (fk.length > 0) problems.push("foreign_key_check failed");
    const company = db.prepare("SELECT COUNT(*) AS n FROM companies").get() as { n: number };
    if (Number(company.n) === 0) problems.push("no company row");
    const admin = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ADMIN'").get() as { n: number };
    if (Number(admin.n) === 0) problems.push("no admin user");
  } finally {
    db.close();
  }
  return { ok: problems.length === 0, manifest, problems };
}
