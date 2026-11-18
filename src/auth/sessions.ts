/**
 * Server-side sessions.
 *
 * The cookie contains a random token plus an HMAC. The database stores only
 * SHA-256(token), so a database leak does not hand over live sessions. Idle
 * expiry slides; absolute expiry does not. `flash_json` rides along with the
 * session so a redirect can show a one-time message.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { config } from "../config.js";
import type { SessionRecord } from "../contracts/types.js";
import { run } from "../db/index.js";

export const COOKIE_NAME = config.isProduction ? "__Host-jms_sid" : "jms_sid";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signToken(token: string, secret = config.sessionSecret): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${signature}`;
}

export function verifySignedToken(value: string, secret = config.sessionSecret): string | null {
  const index = value.lastIndexOf(".");
  if (index <= 0) return null;
  const token = value.slice(0, index);
  const provided = value.slice(index + 1);
  const expected = createHmac("sha256", secret).update(token).digest("base64url");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? token : null;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export function createSession(userId: string, req: Request): CreatedSession {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const now = new Date();
  const idle = new Date(now.getTime() + config.sessionIdleMinutes * 60_000);
  const absolute = new Date(now.getTime() + config.sessionAbsoluteHours * 3_600_000);
  run(
    `INSERT INTO sessions
      (id_hash, user_id, csrf_token, created_at, last_seen_at, expires_at, absolute_expires_at, revoked_at, ip, user_agent, flash_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    hashToken(token),
    userId,
    csrfToken,
    now.toISOString(),
    now.toISOString(),
    idle.toISOString(),
    absolute.toISOString(),
    req.ip ?? null,
    req.get("user-agent") ?? null,
  );
  return {
    token,
    csrfToken,
    expiresAt: idle.toISOString(),
    absoluteExpiresAt: absolute.toISOString(),
  };
}

export function revokeSessionByHash(idHash: string): void {
  run("UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL", new Date().toISOString(), idHash);
}

export function revokeAllSessionsForUser(userId: string): void {
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", new Date().toISOString(), userId);
}

export function touchSession(session: SessionRecord, req: Request, absoluteExpiresAt: string): SessionRecord {
  const now = new Date();
  const lastSeen = new Date(session.last_seen_at).getTime();
  const shouldPersist = now.getTime() - lastSeen > 60_000;
  const idleExpiry = new Date(now.getTime() + config.sessionIdleMinutes * 60_000).toISOString();
  const expiresAt = idleExpiry < absoluteExpiresAt ? idleExpiry : absoluteExpiresAt;
  if (shouldPersist) {
    run(
      "UPDATE sessions SET last_seen_at = ?, expires_at = ?, ip = ?, user_agent = ? WHERE id_hash = ?",
      now.toISOString(),
      expiresAt,
      req.ip ?? null,
      req.get("user-agent") ?? null,
      session.id_hash,
    );
    return { ...session, last_seen_at: now.toISOString(), expires_at: expiresAt };
  }
  return { ...session, expires_at: expiresAt };
}

export function setFlash(session: SessionRecord | undefined, type: "success" | "error" | "info", message: string): void {
  if (!session) return;
  run("UPDATE sessions SET flash_json = ? WHERE id_hash = ?", JSON.stringify({ type, message }), session.id_hash);
}

export function takeFlash(session: SessionRecord | undefined): { type: string; message: string } | null {
  if (!session?.flash_json) return null;
  run("UPDATE sessions SET flash_json = NULL WHERE id_hash = ?", session.id_hash);
  try {
    const parsed = JSON.parse(session.flash_json) as { type?: unknown; message?: unknown };
    return { type: String(parsed.type ?? "info"), message: String(parsed.message ?? "") };
  } catch {
    return null;
  }
}
