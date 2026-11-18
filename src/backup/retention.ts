/**
 * Grandfather-father-son retention.
 *
 * Safety: never delete the newest verified snapshot, a snapshot with a broken
 * manifest, or a pre-restore/pre-migrate snapshot younger than seven days.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { ManifestSchema, type BackupManifest } from "./manifest.js";

export interface Entry {
  base: string;
  manifest: BackupManifest;
}

export function listSnapshots(config: AppConfig): Entry[] {
  if (!existsSync(config.backupDir)) return [];
  const entries: Entry[] = [];
  for (const name of readdirSync(config.backupDir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const manifest = ManifestSchema.parse(JSON.parse(readFileSync(path.join(config.backupDir, name), "utf8")));
      entries.push({ base: name.replace(/\.json$/, ""), manifest });
    } catch {
      // A broken manifest is never pruned automatically.
    }
  }
  return entries.sort((a, b) => b.manifest.created_at.localeCompare(a.manifest.created_at));
}

export function planRetention(config: AppConfig): { keep: Entry[]; remove: Entry[] } {
  const entries = listSnapshots(config);
  if (entries.length === 0) return { keep: [], remove: [] };
  const keep = new Set<string>();
  keep.add(entries[0]!.base);
  const now = Date.now();
  const daily = new Map<string, string>();
  const weekly = new Map<string, string>();
  const monthly = new Map<string, string>();
  for (const entry of entries) {
    const date = new Date(entry.manifest.created_at);
    const day = date.toISOString().slice(0, 10);
    const week = `${date.getUTCFullYear()}-${Math.ceil((date.getUTCDate() + 6) / 7)}`;
    const month = date.toISOString().slice(0, 7);
    if (!daily.has(day)) daily.set(day, entry.base);
    if (!weekly.has(week)) weekly.set(week, entry.base);
    if (!monthly.has(month)) monthly.set(month, entry.base);
  }
  for (const [index, base] of [...daily.values()].entries()) if (index < config.backupKeepDaily) keep.add(base);
  for (const [index, base] of [...weekly.values()].entries()) if (index < config.backupKeepWeekly) keep.add(base);
  for (const [index, base] of [...monthly.values()].entries()) if (index < config.backupKeepMonthly) keep.add(base);
  for (const entry of entries) {
    const ageDays = (now - new Date(entry.manifest.created_at).getTime()) / 86_400_000;
    if (["pre-restore", "pre-migrate"].includes(entry.manifest.tag) && ageDays < 7) keep.add(entry.base);
  }
  return { keep: entries.filter((entry) => keep.has(entry.base)), remove: entries.filter((entry) => !keep.has(entry.base)) };
}

export function applyRetention(config: AppConfig, remove: Entry[]): void {
  for (const entry of remove) {
    for (const suffix of [".db", ".db.sha256", ".json"]) {
      const file = path.join(config.backupDir, `${entry.base}${suffix}`);
      if (existsSync(file)) unlinkSync(file);
    }
  }
}
