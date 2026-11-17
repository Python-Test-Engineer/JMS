import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MATRIX, ACTION_KEYS, can } from "../src/domain/permissions.js";
import { canTransition, TRANSITIONS } from "../src/domain/status.js";
import { grossFromNet, vatFromNet, lineAmount } from "../src/domain/money.js";

const permissions = new Set(["job.status.advance", "job.status.override"]);

test("money uses integer pence and rounds VAT", () => {
  assert.equal(vatFromNet(10000, 2000), 2000);
  assert.equal(vatFromNet(12345, 2000), 2469);
  assert.equal(grossFromNet(12345, 2000), 14814);
  assert.equal(lineAmount(2.5, 999), 2498);
});

test("default matrix has an explicit cell for every role and action", () => {
  assert.equal(ACTION_KEYS.length, 39);
  for (const [action, roles] of Object.entries(DEFAULT_MATRIX)) {
    assert.ok(roles instanceof Set, action);
    assert.ok(roles.size <= 4, action);
  }
  assert.equal(DEFAULT_MATRIX["admin.audit.view"].has("ENGINEER"), false);
  assert.equal(DEFAULT_MATRIX["admin.audit.view"].has("CUSTOMER"), false);
});

test("can() only allows actions in the loaded permission set", () => {
  const user = { permissions };
  assert.equal(can(user, "job.status.advance"), true);
  assert.equal(can(user, "job.edit"), false);
  assert.equal(can(null, "job.status.advance"), false);
});

test("status machine rejects unknown transitions", () => {
  const job = { status: "DRAFT", planned_start: "2026-03-20T09:00:00.000Z", planned_end: "2026-03-20T16:00:00.000Z" };
  const user = { permissions };
  assert.equal(canTransition({ user, job, to: "PAID" }).ok, false);
  assert.equal(canTransition({ user, job, to: "COMPLETED" }).ok, false);
  assert.equal(canTransition({ user, job, to: "SCHEDULED", hasAssignee: false }).ok, false);
  assert.equal(canTransition({ user, job, to: "SCHEDULED", hasAssignee: true }).ok, true);
});

test("field transitions require an assignment", () => {
  const user = { permissions: new Set(["job.status.advance"]) };
  const job = { status: "SCHEDULED" };
  assert.equal(canTransition({ user, job, to: "IN_PROGRESS", assigned: false }).ok, false);
  assert.equal(canTransition({ user, job, to: "IN_PROGRESS", assigned: true }).ok, true);
});

test("every status has a transition list", () => {
  for (const status of Object.keys(TRANSITIONS)) {
    assert.ok(Array.isArray(TRANSITIONS[status]));
  }
});
