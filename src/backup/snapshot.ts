/**
 * Online SQLite backup.
 *
 * SQLite's backup API copies a consistent snapshot while the app keeps writing.
 * The result is verified and checksummed before a manifest is written. A
 * missing manifest means the file is not eligible for restore-by-latest or
 * retention decisions.
 */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { backupBaseName, ManifestSchema, type BackupManifest } from "./manifest.js";

function sha256File(file: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex");
}

async function fsyncFile(file: string): Promise<void> {
  const handle = await open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function createSnapshot(config: AppConfig, options: { tag: string; keep?: number }): Promise<BackupManifest> {
  mkdirSync(config.backupDir, { recursive: true });
  const started = Date.now();
  const base = backupBaseName(options.tag);
  const finalPath = path.join(config.backupDir, `${base}.db`);
  const tempPath = path.join(config.backupDir, `.tmp-${base}.db`);
  const source = new Database(config.databaseFile, { readonly: true });

  try {
    const liveCheck = source.pragma("quick_check") as Array<{ quick_check: string }>;
    if (!liveCheck.every((row) => row.quick_check === "ok")) {
      throw new Error("Live database failed quick_check; refusing to back up a corrupt source.");
    }
    await source.backup(tempPath);
  } finally {
    source.close();
  }

  await fsyncFile(tempPath);
  // Rename only after fsync so readers never see a partial final name.
  renameSync(tempPath, finalPath);

  const snapshot = new Database(finalPath, { readonly: true });
  let integrity = "ok";
  let fk = "ok";
  let userVersion = 0;
  let sqliteVersion = "";
  const counts: Record<string, number> = {};
  try {
    const integrityRows = snapshot.pragma("integrity_check") as Array<{ integrity_check: string }>;
    integrity = integrityRows.every((row) => row.integrity_check === "ok") ? "ok" : "failed";
    const fkRows = snapshot.pragma("foreign_key_check") as unknown[];
    fk = fkRows.length === 0 ? "ok" : "failed";
    userVersion = Number(snapshot.pragma("user_version", { simple: true }));
    sqliteVersion = (snapshot.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v;
    for (const table of ["users", "customers", "jobs", "invoices"]) {
      const row = snapshot.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      counts[table] = Number(row.n);
    }
  } finally {
    snapshot.close();
  }
  // Opening a WAL-mode snapshot read-only can create empty sidecars. They are
  // not part of the backup and would confuse restore-by-latest.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${finalPath}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
  if (integrity !== "ok" || fk !== "ok") throw new Error("Snapshot verification failed.");
  if (!sqliteVersion) sqliteVersion = "unknown";

  const sha256 = sha256File(finalPath);
  const size = statSync(finalPath).size;
  writeFileSync(`${finalPath}.sha256`, `${sha256}  ${path.basename(finalPath)}\n`);
  const manifest: BackupManifest = {
    schema: 1,
    file: path.basename(finalPath),
    tag: options.tag,
    created_at: new Date().toISOString(),
    sqlite_version: sqliteVersion,
    user_version: userVersion,
    size_bytes: size,
    sha256,
    integrity: "ok",
    foreign_key_check: "ok",
    counts,
    duration_ms: Date.now() - started,
    host: process.env["HOSTNAME"] ?? "unknown",
  };
  ManifestSchema.parse(manifest);
  writeFileSync(path.join(config.backupDir, `${base}.json`), JSON.stringify(manifest, null, 2));

  if (config.backupOffsiteCmd) {
    await new Promise<void>((resolve, reject) => {
      exec(`${config.backupOffsiteCmd} ${JSON.stringify(finalPath)}`, (error) => {
        if (error) reject(new Error(`Offsite copy failed: ${error.message}`));
        else resolve();
      });
    });
  }

  logger.info({ file: manifest.file, size, duration_ms: manifest.duration_ms, counts }, "backup verified");
  return manifest;
}
