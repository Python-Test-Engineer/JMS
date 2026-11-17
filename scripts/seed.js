import { config } from "../src/config.js";
import { db } from "../src/db/index.js";
import { isSeeded, seedDatabase, validateSeed } from "../src/db/seed.js";
import { addUpcomingJobs } from "../src/db/upcoming.js";

const force = process.argv.includes("--force");
const started = Date.now();
let seededThisRun = false;

if (isSeeded(db) && !force) {
  console.log(`Database ${config.databaseFile} is already seeded. Use "npm run seed:force" to replace it.`);
} else {
  const result = seedDatabase(db, { seed: config.SEED, force });
  seededThisRun = true;
  console.log(`Seeded ${config.databaseFile}: ${result.jobs} jobs, ${result.invoices} invoices in ${Date.now() - started}ms.`);
}

if (seededThisRun) {
  const problems = validateSeed(db, { expectedJobs: config.SEED === 20260316 ? 26 : null });
  if (problems.length) {
    console.error("Seed acceptance checks failed:\n - " + problems.join("\n - "));
    process.exitCode = 1;
  } else {
    console.log("Seed acceptance checks passed.");
  }
}

const upcoming = addUpcomingJobs(db);
if (upcoming.added) {
  console.log(`Added ${upcoming.added} upcoming jobs across the next 6 weeks.`);
} else if (upcoming.existing) {
  console.log(`Upcoming demo jobs already present (${upcoming.existing}).`);
}

for (const row of db.prepare("SELECT role_key, COUNT(*) AS n FROM users GROUP BY role_key ORDER BY role_key").all()) {
  console.log(`  ${row.role_key}: ${row.n}`);
}
db.close();
