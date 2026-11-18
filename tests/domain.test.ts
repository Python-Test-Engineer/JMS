import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grossFromNet, lineAmount, parsePoundsToPence, parseQtyToMilli, vatFromNet } from "../src/domain/money.js";
import { DEFAULT_MATRIX, ACTION_KEYS, can } from "../src/domain/permissions.js";
import { availableTransitions, canTransition, TRANSITIONS } from "../src/domain/status.js";
import type { AuthUser, Job, RoleKey } from "../src/contracts/types.js";

const baseJob: Job = {
  id: "job-1",
  company_id: "co-1",
  reference: "JOB-2026-0001",
  customer_id: "cus-1",
  title: "Replace windows",
  description: "Installation",
  work_type: "WINDOW_INSTALL",
  status: "SCHEDULED",
  priority: "NORMAL",
  site_address: { line1: "1 Road", line2: "", town: "Manchester", postcode: "M1 1AA", country: "GB" },
  planned_start: "2026-11-20T08:00:00.000Z",
  planned_end: "2026-11-20T17:00:00.000Z",
  planned_slot: "ALL_DAY",
  actual_start: null,
  actual_end: null,
  price_net: 10000,
  vat_rate_bp: 2000,
  price_gross: 12000,
  internal_notes: null,
  customer_notes: null,
  version: 1,
  created_by: "user-1",
  created_at: "2026-11-01T08:00:00.000Z",
  updated_at: "2026-11-01T08:00:00.000Z",
  archived_at: null,
};

function user(role: RoleKey): AuthUser {
  return {
    id: "u1",
    company_id: "co-1",
    email: "x@example.com",
    password_hash: "",
    display_name: "Test",
    role_key: role,
    customer_id: role === "CUSTOMER" ? "cus-1" : null,
    can_engineer: role === "ENGINEER",
    phone: null,
    status: "ACTIVE",
    must_change_password: false,
    theme_prefs_json: null,
    last_login_at: null,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    permissions: new Set(Object.entries(DEFAULT_MATRIX[role]).filter(([, allowed]) => allowed).map(([key]) => key)),
  };
}

describe("money", () => {
  it("computes VAT and gross in integer pence", () => {
    assert.equal(vatFromNet(10000, 2000), 2000);
    assert.equal(grossFromNet(10000, 2000), 12000);
    assert.equal(grossFromNet(999, 1750), 1174);
  });
  it("parses pounds and quantities without floats", () => {
    assert.equal(parsePoundsToPence("4,250.50"), 425050);
    assert.equal(parseQtyToMilli("1.5"), 1500);
    assert.equal(lineAmount(1500, 1000), 1500);
  });
  it("rejects bad money input", () => {
    assert.throws(() => parsePoundsToPence("12.345"));
    assert.throws(() => parseQtyToMilli("-1"));
  });
});

describe("permissions", () => {
  it("has a default for every role x action", () => {
    for (const role of ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"] as const) {
      for (const key of ACTION_KEYS) assert.ok(Object.hasOwn(DEFAULT_MATRIX[role], key));
    }
  });
  it("keeps admin audit access away from field roles by default", () => {
    assert.equal(can(user("ENGINEER"), "admin.audit.view"), false);
    assert.equal(can(user("CUSTOMER"), "admin.audit.view"), false);
    assert.equal(can(user("ADMIN"), "admin.audit.view"), true);
  });
});

describe("status machine", () => {
  it("is exhaustive", () => {
    for (const status of Object.keys(TRANSITIONS)) assert.ok(TRANSITIONS[status as keyof typeof TRANSITIONS]);
  });
  it("allows an assigned engineer to start a scheduled job", () => {
    const result = canTransition({ user: user("ENGINEER"), job: baseJob, to: "IN_PROGRESS", assigned: true, hasAssignee: true });
    assert.equal(result.ok, true);
  });
  it("blocks an unassigned engineer", () => {
    const result = canTransition({ user: user("ENGINEER"), job: baseJob, to: "IN_PROGRESS", assigned: false, hasAssignee: true });
    assert.equal(result.ok, false);
  });
  it("requires a reason for hold", () => {
    const result = canTransition({ user: user("MANAGER"), job: baseJob, to: "ON_HOLD", assigned: false, hasAssignee: true, note: "" });
    assert.equal(result.ok, false);
  });
  it("offers only allowed transitions", () => {
    assert.ok(availableTransitions(user("MANAGER"), baseJob, { assigned: false, hasAssignee: true }).some((t) => t.to === "IN_PROGRESS"));
  });
});
