import fs from "node:fs";
import { config } from "../src/config.js";

const confirmed = process.argv.includes("--force");
if (!confirmed) {
  console.error("Refusing to delete the database without --force. Run: npm run reset");
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${config.databaseFile}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`Removed ${file}`);
  }
}

if (fs.existsSync(config.pdfDir)) {
  for (const file of fs.readdirSync(config.pdfDir)) {
    if (file.endsWith(".pdf") || file.endsWith(".tmp")) {
      fs.rmSync(`${config.pdfDir}/${file}`);
    }
  }
  console.log(`Cleared generated PDFs in ${config.pdfDir}`);
}

const { seedDatabase } = await import("../src/db/seed.js");
const { DatabaseSync } = await import("node:sqlite");
const { SCHEMA_SQL } = await import("../src/db/schema.js");

const db = new DatabaseSync(config.databaseFile);
db.exec(SCHEMA_SQL);
const result = seedDatabase(db, { seed: config.SEED, force: true });
console.log(`Created ${config.databaseFile} with ${result.jobs} jobs and ${result.invoices} invoices.`);
db.close();
