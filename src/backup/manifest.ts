/** Backup manifest schema and file naming. */
import { z } from "zod";

export const ManifestSchema = z.object({
  schema: z.literal(1),
  file: z.string(),
  tag: z.string(),
  created_at: z.string(),
  sqlite_version: z.string(),
  user_version: z.number().int(),
  size_bytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  integrity: z.literal("ok"),
  foreign_key_check: z.literal("ok"),
  counts: z.record(z.number()),
  duration_ms: z.number().int().nonnegative(),
  host: z.string(),
});

export type BackupManifest = z.infer<typeof ManifestSchema>;

export function backupBaseName(tag: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `jms-${stamp}-${tag.replace(/[^a-z0-9-]/gi, "_")}`;
}

export function manifestPath(configBackupDir: string, base: string): string {
  return `${configBackupDir}/${base}.json`;
}
