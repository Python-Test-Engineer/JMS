/**
 * Deterministic demo seed.
 *
 * Anchor date: `SEED_DATE` when supplied, otherwise the UTC date of the first
 * seed run. The resolved anchor is stored in settings, so a later re-run does
 * not silently re-date an existing dataset. Tests pin SEED_DATE.
 *
 * Dataset: 2 admins, 2 field-capable managers, 8 engineers, 10 customers and
 * exactly 20 jobs (2 per customer) spread across the next six calendar weeks.
 * The first eight jobs cover all eight statuses; the rest are realistic
 * upcoming work. Two invoices demonstrate issued and paid states.
 */
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { all, one, run, transaction } from "../db/index.js";
import type { JobStatus, RoleKey, WorkType } from "../contracts/types.js";
import { hashPassword } from "../auth/passwords.js";
import { config } from "../config.js";
import { companyYear, utcStartOfDay } from "../domain/dates.js";
import { grossFromNet, roundPence } from "../domain/money.js";
import { ACTION_KEYS, DEFAULT_MATRIX, ROLE_LABELS } from "../domain/permissions.js";
import { statusSeedLabel } from "./seed-labels.js";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, values: readonly T[]): T {
  const value = values[Math.floor(rand() * values.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty list.");
  return value;
}

function weighted<T>(rand: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  const last = entries.at(-1);
  if (!last) throw new Error("Cannot choose from an empty weight list.");
  return last[0];
}

const FIRST_NAMES = ["Alex", "Priya", "Morgan", "Rita", "Dan", "Sam", "Luis", "Hannah", "Tomasz", "Aisha", "Ben", "Grace"];
const LAST_NAMES = ["Morgan", "Shah", "Lee", "Patel", "Walker", "Okafor", "García", "Brooks", "Nowak", "Khan", "Carter", "Miller"];
const STAFF: Array<{ name: string; email: string; role: RoleKey; canEngineer: boolean }> = [
  { name: "Alex Morgan", email: "admin@acme.example", role: "ADMIN", canEngineer: false },
  { name: "Priya Shah", email: "admin2@acme.example", role: "ADMIN", canEngineer: false },
  { name: "Morgan Lee", email: "manager@acme.example", role: "MANAGER", canEngineer: true },
  { name: "Rita Patel", email: "manager2@acme.example", role: "MANAGER", canEngineer: true },
  ...Array.from({ length: 8 }, (_, index) => ({
    name: `${FIRST_NAMES[index + 4] ?? "Engineer"} ${LAST_NAMES[index + 4] ?? String(index + 1)}`,
    email: `engineer${index + 1}@acme.example`,
    role: "ENGINEER" as const,
    canEngineer: true,
  })),
];

const CUSTOMERS = [
  ["Meadow House Ltd", "Elaine Foster", "customer1@example.com", "0161 555 0101", "12 Meadow Lane", "Didsbury", "M20 2AB", "Manchester"],
  ["Northgate Dental", "Dr James Hill", "customer2@example.com", "0161 555 0102", "4 Northgate", "", "SK1 1AA", "Stockport"],
  ["Willow Court Management", "Susan Reed", "customer3@example.com", "0161 555 0103", "Willow Court, 88 Wilmslow Road", "", "M14 5TP", "Manchester"],
  ["Brookside School", "Mark Evans", "customer4@example.com", "0161 555 0104", "2 Brook Street", "", "WA14 1AA", "Altrincham"],
  ["Harbour View Flats", "Nina Patel", "customer5@example.com", "0161 555 0105", "19 Harbour View", "", "M50 3UB", "Salford"],
  ["Orchard Barn", "Tom Whitfield", "customer6@example.com", "0161 555 0106", "Church Lane", "", "SK9 1AA", "Wilmslow"],
  ["Kingsway Hotel", "Chloe Adams", "customer7@example.com", "0161 555 0107", "120 Kingsway", "", "M19 2AA", "Manchester"],
  ["Fernhill Surgery", "Dr A. Rahman", "customer8@example.com", "0161 555 0108", "7 Fern Road", "", "SK2 2BB", "Stockport"],
  ["Regent Street Offices", "Laura Green", "customer9@example.com", "0161 555 0109", "44 Regent Street", "", "M1 2AB", "Manchester"],
  ["Stonebridge Villa", "Peter Jones", "customer10@example.com", "0161 555 0110", "3 Stonebridge Lane", "", "SK8 3AA", "Cheshire"],
] as const;

const TITLES: Record<WorkType, readonly string[]> = {
  WINDOW_INSTALL: ["Replace casement windows", "Install bay window", "Fit French doors", "Replace bedroom windows", "Install sliding sash windows"],
  REPAIR: ["Repair failed sealed unit", "Replace broken hinge", "Fix draughty window", "Replace window handle and lock", "Repair conservatory roof glazing"],
  SURVEY: ["Site survey for window replacement", "Measure for conservatory glazing", "Survey for door replacement"],
};

const REMAINING_OFFSETS = [3, 5, 8, 11, 15, 18, 22, 25, 29, 32, 36, 40] as const;

export function seedAnchor(configSeedDate: string | undefined): string {
  if (configSeedDate) return utcStartOfDay(configSeedDate);
  const stored = one<{ value_json: string }>("SELECT value_json FROM settings WHERE key = 'seed.anchor'")?.value_json;
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through to the current date.
    }
  }
  return utcStartOfDay(DateTime.utc().toFormat("yyyy-LL-dd"));
}

export interface SeedResult {
  anchor: string;
  users: number;
  customers: number;
  jobs: number;
  invoices: number;
  skipped: boolean;
}

export async function seedDatabase(force = false): Promise<SeedResult> {
  const existing = one<{ id: string }>("SELECT id FROM companies LIMIT 1");
  if (existing && !force) {
    return { anchor: seedAnchor(config.seedDate), users: 0, customers: 0, jobs: 0, invoices: 0, skipped: true };
  }

  const anchor = seedAnchor(config.seedDate);
  const rand = mulberry32(config.seed);
  const passwordHash = await hashPassword(config.defaultPassword);
  const now = new Date().toISOString();
  const companyId = randomUUID();
  const year = companyYear(anchor);
  const anchorUtc = DateTime.fromISO(anchor, { zone: "utc" });

  if (force && existing) {
    transaction(() => {
      for (const table of [
        "idempotency_keys",
        "rate_limits",
        "audit_log",
        "documents",
        "invoice_lines",
        "invoices",
        "job_events",
        "job_assignments",
        "jobs",
        "sessions",
        "permissions",
        "settings",
        "users",
        "customers",
        "sequences",
        "companies",
      ]) {
        run(`DELETE FROM ${table}`);
      }
    });
  }

  // Precompute structure outside the transaction; the writes are one atomic block.
  const users: Array<{ id: string; email: string; role: RoleKey; canEngineer: boolean; name: string }> = [];
  const customers: Array<{ id: string; name: string; email: string; contact: string; phone: string; line1: string; line2: string; town: string; postcode: string; country: string }> = [];
  const jobs: Array<Record<string, unknown>> = [];

  for (const [index, staff] of STAFF.entries()) {
    users.push({ id: randomUUID(), email: staff.email, role: staff.role, canEngineer: staff.canEngineer, name: staff.name });
    void index;
  }
  const admin = users.find((user) => user.role === "ADMIN");
  if (!admin) throw new Error("Seed needs an admin user.");

  for (const [index, customer] of CUSTOMERS.entries()) {
    const [name, contact, email, phone, line1, line2, postcode, town] = customer;
    customers.push({
      id: randomUUID(),
      name,
      contact,
      email,
      phone,
      line1,
      line2,
      town,
      postcode,
      country: "GB",
    });
    void index;
  }

  const forced: Array<{ status: JobStatus; offset: number }> = [
    { status: "DRAFT", offset: 14 },
    { status: "SCHEDULED", offset: 7 },
    { status: "IN_PROGRESS", offset: 0 },
    { status: "ON_HOLD", offset: 0 },
    { status: "COMPLETED", offset: 0 },
    { status: "INVOICED", offset: 0 },
    { status: "PAID", offset: 0 },
    { status: "CANCELLED", offset: 7 },
  ];

  for (let index = 0; index < 20; index += 1) {
    const customer = customers[index % customers.length];
    if (!customer) throw new Error("Seed customer missing.");
    let status: JobStatus;
    let offset: number;
    if (index < forced.length) {
      const entry = forced[index];
      if (!entry) throw new Error("Forced status missing.");
      status = entry.status;
      offset = entry.offset;
    } else {
      const remainingIndex = index - forced.length;
      offset = REMAINING_OFFSETS[remainingIndex] ?? 40;
      const drawn = weighted(rand, [
        ["SCHEDULED", 50],
        ["DRAFT", 40],
        ["CANCELLED", 10],
      ] as const);
      status = drawn === "DRAFT" && offset < 14 ? "SCHEDULED" : drawn;
    }

    const workType = weighted(rand, [
      ["WINDOW_INSTALL", 50],
      ["REPAIR", 35],
      ["SURVEY", 15],
    ] as const);
    const title = pick(rand, TITLES[workType]);
    const description = `${workType === "SURVEY" ? "Survey and measure" : workType === "REPAIR" ? "Repair work" : "Supply and install"} at ${customer.name}. ${pick(rand, ["Access via the main entrance.", "Please call ahead on arrival.", "Parking is available on site.", "Customer will be on site."])}`;
    const priority = rand() < 0.15 ? "URGENT" : "NORMAL";
    const start = anchorUtc.plus({ days: offset, hours: 8 });
    const end = anchorUtc.plus({ days: offset, hours: workType === "SURVEY" ? 12 : 17 });
    const priceNet = 45000 + Math.floor(rand() * (650000 - 45000));
    const vat = 2000;
    const priceGross = grossFromNet(priceNet, vat);
    const createdAt = anchorUtc.minus({ days: 14 }).plus({ hours: index * 3 });
    const actualStart = ["IN_PROGRESS", "COMPLETED", "INVOICED", "PAID"].includes(status)
      ? anchorUtc.plus({ hours: 8 }).toISO()
      : null;
    const actualEnd = ["COMPLETED", "INVOICED", "PAID"].includes(status)
      ? anchorUtc.plus({ hours: 12 }).toISO()
      : null;

    jobs.push({
      id: randomUUID(),
      reference: `JOB-${year}-${String(index + 1).padStart(4, "0")}`,
      customer,
      title,
      description,
      workType,
      status,
      priority,
      start: start.toISO(),
      end: end.toISO(),
      priceNet,
      vat,
      priceGross,
      createdAt: createdAt.toISO(),
      actualStart,
      actualEnd,
      offset,
    });
  }

  const fieldUsers = users.filter((user) => user.canEngineer);
  const invoiceIndices = jobs
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job["status"] === "INVOICED" || job["status"] === "PAID");

  transaction(() => {
    run(
      `INSERT INTO companies
        (id, name, trading_name, email, phone, address_line1, address_line2, address_town, address_postcode,
         address_country, vat_number, logo_path, currency, timezone, default_theme_json, invoice_due_days,
         pdf_footer, version, created_at, updated_at)
       VALUES (?, 'Acme Windows', NULL, 'office@acme.example', '0161 555 0000', '1 Acme Yard', NULL,
         'Manchester', 'M1 1AA', 'GB', 'GB123456789', NULL, 'GBP', 'Europe/London',
         '{"mode":"system"}', 14, 'Thank you for choosing Acme Windows.', 1, ?, ?)`,
      companyId,
      now,
      now,
    );

    for (const user of users) {
      run(
        `INSERT INTO users
          (id, company_id, email, password_hash, display_name, role_key, customer_id, can_engineer, phone,
           status, must_change_password, theme_prefs_json, last_login_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'ACTIVE', 1, NULL, NULL, 1, ?, ?)`,
        user.id,
        companyId,
        user.email,
        passwordHash,
        user.name,
        user.role,
        user.canEngineer ? 1 : 0,
        `07700 9000${String(users.indexOf(user) + 10).slice(-2)}`,
        now,
        now,
      );
    }

    for (const customer of customers) {
      run(
        `INSERT INTO customers
          (id, company_id, name, contact_name, email, phone, address_line1, address_line2, address_town,
           address_postcode, address_country, notes, status, version, created_at, updated_at, created_by, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 1, ?, ?, ?, NULL)`,
        customer.id,
        companyId,
        customer.name,
        customer.contact,
        customer.email,
        customer.phone,
        customer.line1,
        customer.line2 || null,
        customer.town,
        customer.postcode,
        customer.country,
        now,
        now,
        admin.id,
      );
    }

    for (const customer of customers) {
      run(
        `INSERT INTO users
          (id, company_id, email, password_hash, display_name, role_key, customer_id, can_engineer, phone,
           status, must_change_password, theme_prefs_json, last_login_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'CUSTOMER', ?, 0, ?, 'ACTIVE', 1, NULL, NULL, 1, ?, ?)`,
        randomUUID(),
        companyId,
        customer.email,
        passwordHash,
        customer.contact,
        customer.id,
        customer.phone,
        now,
        now,
      );
    }

    for (const role of Object.keys(DEFAULT_MATRIX) as RoleKey[]) {
      for (const action of ACTION_KEYS) {
        run(
          "INSERT INTO permissions (role_key, action_key, allowed, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)",
          role,
          action,
          DEFAULT_MATRIX[role][action] ? 1 : 0,
          now,
          admin.id,
        );
      }
    }

    for (const [index, job] of jobs.entries()) {
      const customer = job["customer"] as (typeof customers)[number];
      const status = job["status"] as JobStatus;
      run(
        `INSERT INTO jobs
          (id, company_id, reference, customer_id, title, description, work_type, status, priority,
           site_line1, site_line2, site_town, site_postcode, site_country, planned_start, planned_end,
           planned_slot, actual_start, actual_end, price_net, vat_rate_bp, price_gross, internal_notes,
           customer_notes, version, created_by, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)`,
        job["id"],
        companyId,
        job["reference"],
        customer.id,
        job["title"],
        job["description"],
        job["workType"],
        status,
        job["priority"],
        customer.line1,
        customer.line2 || null,
        customer.town,
        customer.postcode,
        customer.country,
        job["start"],
        job["end"],
        index % 3 === 0 ? "AM" : index % 3 === 1 ? "PM" : "ALL_DAY",
        job["actualStart"],
        job["actualEnd"],
        job["priceNet"],
        job["vat"],
        job["priceGross"],
        index % 4 === 0 ? "Access code held by the office." : null,
        index % 3 === 0 ? "Please make sure the driveway is clear." : null,
        admin.id,
        job["createdAt"],
        job["createdAt"],
      );

      run(
        `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
         VALUES (?, ?, ?, 'CREATED', NULL, 'DRAFT', 'Job created', 'INTERNAL', ?)`,
        randomUUID(),
        job["id"],
        admin.id,
        job["createdAt"],
      );

      const assigned = new Set<string>();
      const count = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < count; i += 1) {
        const person = pick(rand, fieldUsers);
        if (assigned.has(person.id)) continue;
        assigned.add(person.id);
        const isLead = assigned.size === 1;
        const assignedAt = DateTime.fromISO(String(job["createdAt"]), { zone: "utc" }).plus({ hours: 2 + i }).toISO();
        run(
          `INSERT INTO job_assignments (id, job_id, user_id, is_lead, assigned_at, assigned_by, removed_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          randomUUID(),
          job["id"],
          person.id,
          isLead ? 1 : 0,
          assignedAt,
          admin.id,
        );
        run(
          `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
           VALUES (?, ?, ?, 'ASSIGNMENT', NULL, ?, 'Engineer assigned', 'INTERNAL', ?)`,
          randomUUID(),
          job["id"],
          admin.id,
          isLead ? "Lead" : "Engineer",
          assignedAt,
        );
      }

      if (status !== "DRAFT") {
        const movedAt = DateTime.fromISO(String(job["actualStart"] ?? job["createdAt"]), { zone: "utc" }).toISO();
        run(
          `INSERT INTO job_events (id, job_id, actor_user_id, type, from_value, to_value, message, visibility, at)
           VALUES (?, ?, ?, 'STATUS_CHANGE', 'DRAFT', ?, ?, 'CUSTOMER', ?)`,
          randomUUID(),
          job["id"],
          admin.id,
          status,
          statusSeedLabel(status),
          movedAt,
        );
      }
    }

    for (const { job, index } of invoiceIndices) {
      const invoiceId = randomUUID();
      const number = `INV-${year}-${String(invoiceIndices.findIndex((entry) => entry.index === index) + 1).padStart(4, "0")}`;
      const issuedAt = anchorUtc.plus({ hours: 9 }).toISO();
      const dueAt = anchorUtc.plus({ days: 14, hours: 9 }).toISO();
      const isPaid = job["status"] === "PAID";
      const paidAt = isPaid ? anchorUtc.plus({ hours: 15 }).toISO() : null;
      const net = Number(job["priceNet"]);
      const vat = roundPence((net * Number(job["vat"])) / 10000);
      run(
        `INSERT INTO invoices
          (id, company_id, number, job_id, status, issued_at, due_at, paid_at, net, vat_rate_bp, vat, gross,
           notes, version, created_by, created_at, voided_at, void_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, NULL)`,
        invoiceId,
        companyId,
        number,
        job["id"],
        isPaid ? "PAID" : "ISSUED",
        issuedAt,
        dueAt,
        paidAt,
        net,
        job["vat"],
        vat,
        net + vat,
        admin.id,
        issuedAt,
      );
      run(
        `INSERT INTO invoice_lines (id, invoice_id, line_no, description, qty_milli, unit_pence, amount_pence)
         VALUES (?, ?, 1, ?, 1000, ?, ?)`,
        randomUUID(),
        invoiceId,
        job["title"],
        net,
        net,
      );
    }

    const settings: Record<string, unknown> = {
      "company.vat_rate_bp": 2000,
      "company.invoice_due_days": 14,
      "company.default_theme": { mode: "system" },
      "company.pdf_footer": "Thank you for choosing Acme Windows.",
      "security.password_min_length": 10,
      "security.session_idle_minutes": 60,
      "seed.anchor": anchor,
      "seed.version": `${year}.1`,
    };
    for (const [key, value] of Object.entries(settings)) {
      run(
        "INSERT INTO settings (key, value_json, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)",
        key,
        JSON.stringify(value),
        now,
        admin.id,
      );
    }

    run("INSERT INTO sequences (kind, year, value) VALUES ('job', ?, ?)", year, jobs.length);
    run("INSERT INTO sequences (kind, year, value) VALUES ('invoice', ?, ?)", year, invoiceIndices.length);

    run(
      `INSERT INTO audit_log
        (id, company_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, at, ip, user_agent, request_id)
       VALUES (?, ?, ?, 'seed.create', 'SYSTEM', NULL, NULL, ?, ?, NULL, NULL, NULL)`,
      randomUUID(),
      companyId,
      admin.id,
      JSON.stringify({ anchor, jobs: jobs.length }),
      now,
    );
  });

  verifySeed(anchor, jobs.length);
  return { anchor, users: users.length + customers.length, customers: customers.length, jobs: jobs.length, invoices: invoiceIndices.length, skipped: false };
}

function verifySeed(anchor: string, expectedJobs: number): void {
  const problems: string[] = [];
  const jobs = one<{ n: number }>("SELECT COUNT(*) AS n FROM jobs")?.n ?? 0;
  if (jobs !== expectedJobs) problems.push(`expected ${expectedJobs} jobs, found ${jobs}`);
  const customers = one<{ n: number }>("SELECT COUNT(*) AS n FROM customers")?.n ?? 0;
  if (customers !== 10) problems.push(`expected 10 customers, found ${customers}`);
  const admins = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ADMIN'")?.n ?? 0;
  if (admins !== 2) problems.push(`expected 2 admins, found ${admins}`);
  const managers = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'MANAGER' AND can_engineer = 1")?.n ?? 0;
  if (managers !== 2) problems.push(`expected 2 field-capable managers, found ${managers}`);
  const engineers = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'ENGINEER'")?.n ?? 0;
  if (engineers !== 8) problems.push(`expected 8 engineers, found ${engineers}`);
  const portal = one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role_key = 'CUSTOMER'")?.n ?? 0;
  if (portal !== 10) problems.push(`expected 10 customer logins, found ${portal}`);

  const statuses = all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status");
  const statusSet = new Set(statuses.map((row) => row.status));
  for (const status of ["DRAFT", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "INVOICED", "PAID", "CANCELLED"]) {
    if (!statusSet.has(status)) problems.push(`missing status ${status}`);
  }

  const windowStart = anchor;
  const windowEnd = DateTime.fromISO(anchor, { zone: "utc" }).plus({ days: 42 }).toISO();
  const outside = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM jobs WHERE planned_start IS NULL OR planned_start < ? OR planned_start >= ?",
    windowStart,
    windowEnd,
  )?.n ?? 0;
  if (outside > 0) problems.push(`${outside} jobs fall outside the six-week window`);

  const uninvoicedPaid = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM jobs j WHERE j.status IN ('INVOICED','PAID') AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status <> 'VOID')",
  )?.n ?? 0;
  if (uninvoicedPaid > 0) problems.push(`${uninvoicedPaid} invoiced/paid jobs have no live invoice`);

  const fk = all("PRAGMA foreign_key_check");
  if (fk.length > 0) problems.push("foreign key check failed");

  if (problems.length > 0) throw new Error(`Seed acceptance failed: ${problems.join("; ")}`);
}

export { ROLE_LABELS };
