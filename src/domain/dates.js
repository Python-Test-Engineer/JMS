import { DateTime } from "luxon";
import { config } from "../config.js";

const ZONE = config.COMPANY_TIMEZONE;

export function nowIso() {
  return new Date().toISOString();
}

export function formatDate(iso) {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE);
  return dt.isValid ? dt.toFormat("ccc d LLL yyyy") : "—";
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE);
  return dt.isValid ? dt.toFormat("ccc d LLL yyyy, HH:mm") : "—";
}

export function formatTime(iso) {
  if (!iso) return "—";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE);
  return dt.isValid ? dt.toFormat("HH:mm") : "—";
}

export function isoToLocalInput(iso) {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE);
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : "";
}

export function localInputToIso(value) {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: ZONE });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO({ suppressMilliseconds: false });
}

export function dateInputToIso(value) {
  if (!value) return null;
  const dt = DateTime.fromISO(value, { zone: ZONE }).startOf("day");
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export function inputToIso(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateInputToIso(value);
  return localInputToIso(value);
}

export function addDaysIso(iso, days) {
  return DateTime.fromISO(iso, { zone: "utc" }).plus({ days }).toISO();
}

export function companyYear(iso = nowIso()) {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE).year;
}

export function isPast(iso) {
  return Boolean(iso) && DateTime.fromISO(iso) < DateTime.now();
}

export function todayRange() {
  const start = DateTime.now().setZone(ZONE).startOf("day");
  return {
    start: start.toUTC().toISO(),
    end: start.plus({ days: 1 }).toUTC().toISO(),
    endWeek: start.plus({ days: 7 }).toUTC().toISO(),
  };
}

export function dayKey(iso) {
  if (!iso) return "";
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE).toFormat("yyyy-LL-dd");
}
