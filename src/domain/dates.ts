/**
 * All date handling goes through this module.
 *
 * Storage is UTC ISO 8601; display is the company timezone (Europe/London by
 * default). Form fields accept `datetime-local` values, which are interpreted
 * in the company timezone and then stored as UTC.
 */
import { DateTime } from "luxon";
import { config } from "../config.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function displayZone(): string {
  return config.companyTimezone;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(displayZone());
  return dt.isValid ? dt.toFormat("ccc d LLL yyyy") : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(displayZone());
  return dt.isValid ? dt.toFormat("ccc d LLL yyyy, HH:mm") : "—";
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(displayZone());
  return dt.isValid ? dt.toFormat("HH:mm") : "—";
}

/** Convert a datetime-local form value (company timezone) to UTC ISO. */
export function inputToIso(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = DateTime.fromFormat(raw, "yyyy-LL-dd'T'HH:mm", { zone: displayZone() });
  return dt.isValid ? dt.toUTC().toISO({ suppressMilliseconds: false }) : null;
}

/** Convert a stored instant to a datetime-local value. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(displayZone());
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : "";
}

/** The year used for JOB/INV references, in company-local time. */
export function companyYear(iso: string): number {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(displayZone()).year;
}

/** Start of the anchor day in UTC, used by the deterministic seed. */
export function utcStartOfDay(date: string): string {
  return DateTime.fromISO(date, { zone: "utc" }).startOf("day").toUTC().toISO({ suppressMilliseconds: false }) ?? "";
}
