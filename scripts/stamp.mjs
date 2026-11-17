#!/usr/bin/env node
// Rewrites the ?v= cache-buster tokens in src/index.html to a fresh timestamp.
//
//   node scripts/stamp.mjs            stamp once
//   node scripts/stamp.mjs --watch    stamp now, then again on every asset change
//
// The token is a compact UTC timestamp (YYYYMMDDHHmmss) so it sorts and reads well.
// Safe to run repeatedly: only the query value after ?v= is replaced.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlFile = path.join(root, "src", "index.html");
const assetDirs = [path.join(root, "src", "css"), path.join(root, "src", "js")];

function stampToken(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "").slice(0, 14);
}

function stamp() {
  const html = fs.readFileSync(htmlFile, "utf8");
  const token = stampToken();
  let changed = 0;
  const next = html.replace(/(\?v=)[^"'\s>]+/g, (_, prefix) => {
    changed += 1;
    return prefix + token;
  });
  if (next !== html) fs.writeFileSync(htmlFile, next);
  console.log(`[stamp] ${changed} asset reference(s) -> v=${token}`);
  return token;
}

stamp();

if (process.argv.includes("--watch")) {
  let timer = null;
  const schedule = (event, file) => {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[stamp] change: ${path.relative(root, file)}`);
      stamp();
    }, 60);
  };
  for (const dir of assetDirs) {
    if (!fs.existsSync(dir)) continue;
    fs.watch(dir, { recursive: true }, schedule);
  }
  console.log("[stamp] watching src/css and src/js — Ctrl+C to stop");
}
