import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "../src/db/schema.js";
import { seedDatabase, validateSeed } from "../src/db/seed.js";

test("reference seed meets every acceptance check", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-seed-"));
  const file = path.join(dir, "jms.db");
  const db = new DatabaseSync(file);
  db.exec(SCHEMA_SQL);
  const result = seedDatabase(db, { seed: 20260316 });
  assert.equal(result.jobs, 26);
  assert.deepEqual(validateSeed(db, { expectedJobs: 26 }), []);

  const counts = db.prepare("SELECT customer_id, COUNT(*) AS n FROM jobs GROUP BY customer_id ORDER BY MIN(rowid)").all().map((r) => r.n);
  assert.deepEqual(counts, [3, 4, 2, 1, 3, 4, 3, 2, 2, 2]);

  const statuses = db.prepare("SELECT COUNT(DISTINCT status) AS n FROM jobs").get().n;
  assert.equal(statuses, 8);

  const invoices = db.prepare("SELECT number FROM invoices ORDER BY number").all().map((r) => r.number);
  assert.deepEqual(invoices, invoices.map((_, i) => `INV-2026-${String(i + 1).padStart(4, "0")}`));

  const badAssignments = db.prepare(`
    SELECT COUNT(*) AS n FROM job_assignments a JOIN users u ON u.id=a.user_id
    WHERE a.removed_at IS NULL AND (u.can_engineer=0 OR u.status<>'ACTIVE')`).get().n;
  assert.equal(badAssignments, 0);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("seed is idempotent without force and replaceable with force", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jms-seed2-"));
  const file = path.join(dir, "jms.db");
  const db = new DatabaseSync(file);
  db.exec(SCHEMA_SQL);
  seedDatabase(db, { seed: 20260316 });
  const again = seedDatabase(db, { seed: 20260316 });
  assert.equal(again.seeded, false);
  const replaced = seedDatabase(db, { seed: 20260316, force: true });
  assert.equal(replaced.seeded, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 26);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
