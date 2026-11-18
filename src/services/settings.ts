/** Company, settings and theme helpers. */
import { all, one, run, transaction } from "../db/index.js";
import { mapCompany } from "../db/rows.js";
import type { Company, SettingRow } from "../contracts/types.js";
import { nowIso } from "../domain/dates.js";

export function company(): Company {
  const row = one("SELECT * FROM companies ORDER BY created_at LIMIT 1");
  if (!row) throw new Error("No company exists. Seed the database first.");
  return mapCompany(row);
}

export function settingsMap(): Record<string, unknown> {
  const rows = all<SettingRow>("SELECT * FROM settings");
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value_json);
    } catch {
      result[row.key] = null;
    }
  }
  return result;
}

export function setting<T>(key: string, fallback: T): T {
  const row = one<SettingRow>("SELECT * FROM settings WHERE key = ?", key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function updateSettings(
  values: Record<string, unknown>,
  userId: string,
  meta: { requestId: string | null },
): void {
  const now = nowIso();
  transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      const existing = one("SELECT key FROM settings WHERE key = ?", key);
      if (existing) {
        run(
          "UPDATE settings SET value_json = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE key = ?",
          JSON.stringify(value),
          now,
          userId,
          key,
        );
      } else {
        run(
          "INSERT INTO settings (key, value_json, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)",
          key,
          JSON.stringify(value),
          now,
          userId,
        );
      }
    }
    void meta;
  });
}

export function updateCompanyTheme(themeJson: string, userId: string, meta: { requestId: string | null }): void {
  transaction(() => {
    run(
      "UPDATE companies SET default_theme_json = ?, version = version + 1, updated_at = ? WHERE id = ?",
      themeJson,
      nowIso(),
      company().id,
    );
    void userId;
    void meta;
  });
}
