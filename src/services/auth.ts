/**
 * Sign-in, password change and appearance preferences.
 *
 * Failed sign-ins are rate-limited by IP+email and by IP. Timing is equalised
 * with a dummy Argon2id hash when the account does not exist.
 */
import type { Request } from "express";
import { one, run } from "../db/index.js";
import { mapUser } from "../db/rows.js";
import type { AuthUser, SessionRecord, User, WriteMeta } from "../contracts/types.js";
import { dummyPasswordHash, hashPassword, passwordProblems, verifyPassword } from "../auth/passwords.js";
import {
  clearLimit,
  isBlocked,
  recordFailure,
  type LimitSpec,
} from "../auth/rate-limit.js";
import { createSession, revokeAllSessionsForUser, revokeSessionByHash } from "../auth/sessions.js";
import { config } from "../config.js";
import { nowIso } from "../domain/dates.js";
import { audit } from "./audit.js";
import { withPermissions } from "./access.js";

export interface SignInResult {
  ok: boolean;
  message?: string;
  retryAfterSeconds?: number;
  token?: string;
  csrfToken?: string;
  user?: AuthUser;
}

function limits(req: Request, email: string): LimitSpec[] {
  const ip = req.ip ?? "unknown";
  return [
    { scope: "signin.email", identity: `${ip}:${email}`, limit: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
    { scope: "signin.ip", identity: ip, limit: 20, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  ];
}

export async function signIn(req: Request, emailRaw: unknown, passwordRaw: unknown): Promise<SignInResult> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const password = String(passwordRaw ?? "");
  const specs = limits(req, email);
  for (const spec of specs) {
    const blocked = isBlocked(spec);
    if (blocked.blocked) {
      return { ok: false, message: "Too many attempts. Wait a few minutes and try again.", retryAfterSeconds: blocked.retryAfterSeconds };
    }
  }

  const row = one("SELECT * FROM users WHERE email = ? COLLATE NOCASE", email);
  const user = row ? mapUser(row) : null;
  const hashToCheck = user?.password_hash ?? (await dummyPasswordHash());
  const valid = await verifyPassword(hashToCheck, password);
  if (!user || !valid || user.status !== "ACTIVE") {
    for (const spec of specs) recordFailure(spec);
    audit({
      action: "auth.signin.failed",
      entityType: "AUTH",
      entityId: user?.id ?? null,
      after: { email },
      actorId: user?.id ?? null,
      meta: { actorUserId: user?.id ?? "", requestId: req.id, ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null },
    });
    return { ok: false, message: "Email or password not recognised." };
  }

  for (const spec of specs) clearLimit(spec);
  const session = createSession(user.id, req);
  run("UPDATE users SET last_login_at = ?, version = version + 1 WHERE id = ?", nowIso(), user.id);
  audit({
    action: "auth.signin.success",
    entityType: "AUTH",
    entityId: user.id,
    actorId: user.id,
    meta: { actorUserId: user.id, requestId: req.id, ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null },
  });
  return { ok: true, token: session.token, csrfToken: session.csrfToken, user: withPermissions({ ...user, last_login_at: nowIso() }) };
}

export async function changePassword(
  user: AuthUser,
  session: SessionRecord,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; message?: string; token?: string; csrfToken?: string }> {
  if (!user.must_change_password) {
    const valid = await verifyPassword(user.password_hash, currentPassword);
    if (!valid) return { ok: false, message: "Your current password is not correct." };
  }
  const problems = passwordProblems(newPassword, user.email, user.display_name);
  if (problems.length > 0) return { ok: false, message: problems.join(" ") };
  if (newPassword === currentPassword) return { ok: false, message: "Choose a password different from your current one." };

  const passwordHash = await hashPassword(newPassword);
  const now = nowIso();
  run(
    "UPDATE users SET password_hash = ?, must_change_password = 0, version = version + 1, updated_at = ? WHERE id = ?",
    passwordHash,
    now,
    user.id,
  );
  revokeAllSessionsForUser(user.id);
  revokeSessionByHash(session.id_hash);
  const replacement = createSession(user.id, { ip: null, get: () => undefined } as unknown as Request);
  audit({
    action: "auth.password.change",
    entityType: "AUTH",
    entityId: user.id,
    actorId: user.id,
    meta: { actorUserId: user.id, requestId: null, ip: null, userAgent: null },
  });
  return { ok: true, token: replacement.token, csrfToken: replacement.csrfToken };
}

export function saveThemePreferences(user: AuthUser, prefs: Record<string, unknown>): void {
  const safe = {
    mode: ["system", "light", "dark"].includes(String(prefs["mode"])) ? String(prefs["mode"]) : "system",
    text: ["small", "normal", "large"].includes(String(prefs["text"])) ? String(prefs["text"]) : "normal",
    leading: ["tight", "normal", "airy"].includes(String(prefs["leading"])) ? String(prefs["leading"]) : "normal",
  };
  run("UPDATE users SET theme_prefs_json = ?, version = version + 1, updated_at = ? WHERE id = ?", JSON.stringify(safe), nowIso(), user.id);
}

export function revokeAllForUser(user: User): void {
  revokeAllSessionsForUser(user.id);
}

export { createSession };
