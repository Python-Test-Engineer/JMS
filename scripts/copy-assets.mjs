// Copy the non-TypeScript runtime assets into dist so `node dist/server.js` is
// self-contained. Source-checkout development can still run from src/.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pairs = [
  ["src/views", "dist/views"],
  ["src/public", "dist/public"],
  ["src/db/migrations", "dist/db/migrations"],
];

for (const [from, to] of pairs) {
  const target = path.join(root, to);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, from), target, { recursive: true });
}
console.log("copied views, public assets and migrations to dist/");
