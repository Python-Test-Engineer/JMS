/**
 * SQLite-backed fixed-window rate limits.
 *
 * Storing attempts in the database means a restart cannot reset an attacker's
 * budget. Keys are HMACed so a table dump does not reveal email addresses or
 * IPs. Rows expire and are purged by the nightly maintenance command.
 */
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { one, run } from "../db/index.js";

export interface LimitSpec {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  blockMs: number;
}

function keyFor(spec: LimitSpec): string {
  return createHmac("sha256", config.sessionSecret).update(`${spec.scope}:${spec.identity}`).digest("hex");
}

export function isBlocked(spec: LimitSpec): { blocked: boolean; retryAfterSeconds: number } {
  const row = one<{ blocked_until: string | null }>(
    "SELECT blocked_until FROM rate_limits WHERE key = ?",
    keyFor(spec),
  );
  if (!row?.blocked_until) return { blocked: false, retryAfterSeconds: 0 };
  const remaining = new Date(row.blocked_until).getTime() - Date.now();
  return { blocked: remaining > 0, retryAfterSeconds: Math.max(0, Math.ceil(remaining / 1000)) };
}

export function recordFailure(spec: LimitSpec): void {
  const key = keyFor(spec);
  const now = Date.now();
  const row = one<{ count: number; window_start: string }>(
    "SELECT count, window_start FROM rate_limits WHERE key = ?",
    key,
  );
  if (!row || now - new Date(row.window_start).getTime() > spec.windowMs) {
    run(
      `INSERT INTO rate_limits (key, count, window_start, blocked_until, expires_at)
       VALUES (?, 1, ?, NULL, ?)
       ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start, blocked_until = NULL, expires_at = excluded.expires_at`,
      key,
      new Date(now).toISOString(),
      new Date(now + spec.windowMs).toISOString(),
    );
    return;
  }
  const count = row.count + 1;
  const blockedUntil = count >= spec.limit ? new Date(now + spec.blockMs).toISOString() : null;
  run(
    "UPDATE rate_limits SET count = ?, blocked_until = ?, expires_at = ? WHERE key = ?",
    count,
    blockedUntil,
    new Date(now + Math.max(spec.windowMs, spec.blockMs)).toISOString(),
    key,
  );
}

export function clearLimit(spec: LimitSpec): void {
  run("DELETE FROM rate_limits WHERE key = ?", keyFor(spec));
}
