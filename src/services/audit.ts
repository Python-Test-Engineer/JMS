/**
 * Append-only audit log.
 *
 * Every mutation calls `audit()` inside the same transaction as the change.
 * The `before`/`after` payloads are field-level and must never contain a
 * password hash, raw session token or CSRF token.
 */
import { randomUUID } from "node:crypto";
import { one, run } from "../db/index.js";
import { nowIso } from "../domain/dates.js";
import type { WriteMeta } from "../contracts/types.js";

export function audit(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorId?: string | null;
  meta: WriteMeta;
}): void {
  const companyId = one<{ id: string }>("SELECT id FROM companies LIMIT 1")?.id;
  if (!companyId) return;
  run(
    `INSERT INTO audit_log
      (id, company_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, at, ip, user_agent, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    companyId,
    input.actorId ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
    nowIso(),
    input.meta.ip,
    input.meta.userAgent,
    input.meta.requestId,
  );
}
