import crypto from "node:crypto";
import { config } from "../config.js";
import { one, run } from "../db/index.js";

export const COOKIE_NAME = config.isProduction ? "__Host-jms_sid" : "jms_sid";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createSession({ userId = null, ip = null, userAgent = null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const idleMs = config.SESSION_IDLE_MINUTES * 60_000;
  const absoluteMs = 12 * 60 * 60_000;
  const values = {
    id_hash: sha256(token),
    user_id: userId,
    csrf_token: csrfToken,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: new Date(now.getTime() + idleMs).toISOString(),
    absolute_expires_at: new Date(now.getTime() + absoluteMs).toISOString(),
    ip,
    user_agent: userAgent,
    revoked_at: null,
    flash_json: null,
  };
  run(
    `INSERT INTO sessions (id_hash,user_id,csrf_token,created_at,last_seen_at,expires_at,absolute_expires_at,ip,user_agent,revoked_at,flash_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    values.id_hash, values.user_id, values.csrf_token, values.created_at, values.last_seen_at,
    values.expires_at, values.absolute_expires_at, values.ip, values.user_agent, null, null,
  );
  return { token, csrfToken, session: values };
}

export function getSessionByToken(token) {
  if (!token) return null;
  return one("SELECT * FROM sessions WHERE id_hash=?", sha256(token));
}

export function touchSession(session) {
  const now = new Date();
  const idleMs = config.SESSION_IDLE_MINUTES * 60_000;
  const lastSeen = Date.parse(session.last_seen_at);
  if (Number.isFinite(lastSeen) && now.getTime() - lastSeen < 60_000) return;
  const expiresAt = new Date(now.getTime() + idleMs).toISOString();
  run("UPDATE sessions SET last_seen_at=?, expires_at=? WHERE id_hash=?", now.toISOString(), expiresAt, session.id_hash);
}

export function sessionExpired(session, now = Date.now()) {
  return session.revoked_at !== null ||
    Date.parse(session.expires_at) < now ||
    Date.parse(session.absolute_expires_at) < now;
}

export function revokeSession(session) {
  if (!session) return;
  run("UPDATE sessions SET revoked_at=? WHERE id_hash=?", new Date().toISOString(), session.id_hash);
}

export function revokeAllForUser(userId, exceptHash = null) {
  const now = new Date().toISOString();
  if (exceptHash) run("UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash<>?", now, userId, exceptHash);
  else run("UPDATE sessions SET revoked_at=? WHERE user_id=?", now, userId);
}

export function setUserOnSession(session, userId) {
  run("UPDATE sessions SET user_id=? WHERE id_hash=?", userId, session.id_hash);
}

export function setFlash(session, type, message) {
  if (!session) return;
  run("UPDATE sessions SET flash_json=? WHERE id_hash=?", JSON.stringify({ type, message }), session.id_hash);
}

export function takeFlash(session) {
  if (!session?.flash_json) return null;
  try {
    const flash = JSON.parse(session.flash_json);
    run("UPDATE sessions SET flash_json=NULL WHERE id_hash=?", session.id_hash);
    return flash;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.COOKIE_SECURE,
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  };
}

export function clearCookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: config.COOKIE_SECURE, path: "/" };
}

export function hashToken(token) {
  return sha256(token);
}
