/**
 * Operational CLI: migrate, seed, backup, verify, prune, restore, check.
 *
 * Every command uses the same validated config as the web app. Cron should run
 * `node dist/cli/jms.js backup --tag nightly` under `flock`; see README.
 */
import { Command } from "commander";
import { existsSync, unlinkSync } from "node:fs";
import { config } from "../config.js";
import { closeDb, getDb, one, all } from "../db/index.js";
import { migrate, verifyMigrations } from "../db/migrator.js";
import { seedDatabase } from "../db/seed.js";
import { createSnapshot } from "../backup/snapshot.js";
import { verifySnapshot } from "../backup/verify.js";
import { applyRetention, planRetention } from "../backup/retention.js";
import { restoreSnapshot } from "../backup/restore.js";
import { latestBackupStatus } from "../backup/status.js";

const program = new Command();
program.name("jms").description("JMS operations").version("2.0.0");

program
  .command("migrate")
  .description("Apply pending migrations")
  .action(() => {
    const db = getDb();
    const result = migrate(config, db);
    console.log(JSON.stringify({ ok: true, ...result }));
  });

program
  .command("check")
  .description("Run integrity, foreign key and migration checks")
  .action(() => {
    const db = getDb();
    verifyMigrations(config, db);
    const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    const fk = db.pragma("foreign_key_check") as unknown[];
    const version = db.pragma("user_version", { simple: true });
    const problems: string[] = [];
    if (!integrity.every((row) => row.integrity_check === "ok")) problems.push("integrity_check failed");
    if (fk.length > 0) problems.push("foreign_key_check failed");
    console.log(JSON.stringify({ ok: problems.length === 0, schema: version, problems }));
    if (problems.length > 0) process.exitCode = 1;
  });

program
  .command("seed")
  .description("Load the deterministic demo dataset if the database is empty")
  .option("--force", "replace existing demo data (writes a backup first)")
  .action(async (options: { force?: boolean }) => {
    getDb();
    if (options.force) {
      const status = latestBackupStatus();
      if (status.file) {
        // A full backup before destructive seed replacement.
        await createSnapshot(config, { tag: "pre-seed" });
      }
    }
    const result = await seedDatabase(Boolean(options.force));
    console.log(JSON.stringify({ ok: true, ...result }));
  });

program
  .command("reset")
  .description("Delete the database and generated PDFs, then seed from scratch")
  .option("--force", "required confirmation")
  .action(async (options: { force?: boolean }) => {
    if (!options.force) throw new Error("Pass --force to reset the database.");
    closeDb();
    for (const file of [config.databaseFile, `${config.databaseFile}-wal`, `${config.databaseFile}-shm`]) {
      if (existsSync(file)) unlinkSync(file);
    }
    getDb();
    const result = await seedDatabase(true);
    console.log(JSON.stringify({ ok: true, ...result }));
  });

program
  .command("backup")
  .description("Create and verify an online SQLite snapshot")
  .option("--tag <tag>", "manifest tag", "manual")
  .action(async (options: { tag: string }) => {
    getDb();
    const manifest = await createSnapshot(config, { tag: options.tag });
    console.log(JSON.stringify({ ok: true, file: manifest.file, size: manifest.size_bytes, duration_ms: manifest.duration_ms }));
  });

program
  .command("verify")
  .description("Verify a snapshot by name, or the latest with --latest")
  .option("--latest", "verify the newest snapshot")
  .option("--file <base>", "snapshot base name or .db filename")
  .action((options: { latest?: boolean; file?: string }) => {
    let base = options.file;
    if (options.latest || !base) {
      const status = latestBackupStatus();
      if (!status.file) throw new Error("No snapshots exist.");
      base = status.file.replace(/\.db$/, "");
    }
    const result = verifySnapshot(config, base);
    console.log(JSON.stringify({ ok: result.ok, problems: result.problems, manifest: result.manifest ?? null }));
    if (!result.ok) process.exitCode = 1;
  });

program
  .command("prune")
  .description("Apply GFS retention (dry run unless --apply)")
  .option("--apply", "actually delete eligible snapshots")
  .action((options: { apply?: boolean }) => {
    const plan = planRetention(config);
    if (options.apply) applyRetention(config, plan.remove);
    console.log(JSON.stringify({ ok: true, apply: Boolean(options.apply), keep: plan.keep.map((entry) => entry.base), remove: plan.remove.map((entry) => entry.base) }));
  });

program
  .command("restore")
  .description("Restore a verified snapshot (destructive)")
  .requiredOption("--from <base>", "snapshot base name")
  .option("--force", "required confirmation")
  .option("--keep-sessions", "do not revoke sessions after restore")
  .action((options: { from: string; force?: boolean; keepSessions?: boolean }) => {
    if (!options.force) throw new Error("Pass --force to restore a snapshot.");
    const result = restoreSnapshot(config, options.from, { keepSessions: Boolean(options.keepSessions) });
    console.log(JSON.stringify({ ok: true, from: options.from, pre_restore: result.preRestore }));
  });

program
  .command("status")
  .description("Print database and backup status")
  .action(() => {
    getDb();
    console.log(JSON.stringify({ db: config.databaseFile, backup: latestBackupStatus(), jobs: one<{ n: number }>("SELECT COUNT(*) AS n FROM jobs")?.n ?? 0, tables: all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((row) => row.name) }));
  });

await program.parseAsync(process.argv);
closeDb();
