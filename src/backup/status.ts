/** Latest backup status for /healthz and the admin backups page. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { ManifestSchema } from "./manifest.js";
import { verifySnapshot } from "./verify.js";

export interface BackupStatus {
  file: string | null;
  createdAt: string | null;
  ageHours: number | null;
  verified: boolean;
  sizeBytes: number | null;
  counts: Record<string, number> | null;
}

export function latestBackupStatus(): BackupStatus {
  if (!existsSync(config.backupDir)) {
    return { file: null, createdAt: null, ageHours: null, verified: false, sizeBytes: null, counts: null };
  }
  const manifests = readdirSync(config.backupDir)
    .filter((name) => name.startsWith("jms-") && name.endsWith(".json"))
    .map((name) => path.join(config.backupDir, name));
  if (manifests.length === 0) {
    return { file: null, createdAt: null, ageHours: null, verified: false, sizeBytes: null, counts: null };
  }
  const latest = manifests
    .map((file) => ({ file, manifest: ManifestSchema.parse(JSON.parse(readFileSync(file, "utf8"))) }))
    .sort((a, b) => b.manifest.created_at.localeCompare(a.manifest.created_at))[0];
  if (!latest) {
    return { file: null, createdAt: null, ageHours: null, verified: false, sizeBytes: null, counts: null };
  }
  const verified = verifySnapshot(config, latest.manifest.file.replace(/\.db$/, "")).ok;
  return {
    file: latest.manifest.file,
    createdAt: latest.manifest.created_at,
    ageHours: Math.round(((Date.now() - new Date(latest.manifest.created_at).getTime()) / 3_600_000) * 10) / 10,
    verified,
    sizeBytes: latest.manifest.size_bytes,
    counts: latest.manifest.counts,
  };
}
