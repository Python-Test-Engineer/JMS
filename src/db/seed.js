import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { ACTION_KEYS, DEFAULT_MATRIX, ROLES, ROLE_LABELS } from "../domain/permissions.js";
import { grossFromNet, vatFromNet } from "../domain/money.js";

export const SEED_NOW = "2026-03-16T08:00:00.000Z";
export const DEFAULT_PASSWORD = "JMS123";
const DAY = 86_400_000;

export function isSeeded(db) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM companies").get();
  return row.n > 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(random, choices) {
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of choices) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return choices[choices.length - 1][0];
}

function isoAt(daysOffset, hour = 8) {
  const date = new Date(Date.parse(SEED_NOW) + daysOffset * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const CUSTOMERS = [
  ["Meadow House Ltd", "Elaine Foster", "customer1@example.com", "0161 555 0101", "12 Meadow Lane", "Didsbury", "Manchester", "M20 2AB"],
  ["Northgate Dental", "Dr James Hill", "customer2@example.com", "0161 555 0102", "4 Northgate", "", "Stockport", "SK1 1AA"],
  ["Willow Court Management", "Susan Reed", "customer3@example.com", "0161 555 0103", "Willow Court, 88 Wilmslow Road", "", "Manchester", "M14 5TP"],
  ["Brookside School", "Mark Evans", "customer4@example.com", "0161 555 0104", "Brookside School, 2 Brook Street", "", "Altrincham", "WA14 1AA"],
  ["Harbour View Flats", "Nina Patel", "customer5@example.com", "0161 555 0105", "19 Harbour View", "", "Salford", "M50 3UB"],
  ["Orchard Barn", "Tom Whitfield", "customer6@example.com", "0161 555 0106", "Orchard Barn, Church Lane", "", "Wilmslow", "SK9 1AA"],
  ["Kingsway Hotel", "Chloe Adams", "customer7@example.com", "0161 555 0107", "120 Kingsway", "", "Manchester", "M19 2AA"],
  ["Fernhill Surgery", "Dr A. Rahman", "customer8@example.com", "0161 555 0108", "Fernhill Surgery, 7 Fern Road", "", "Stockport", "SK2 2BB"],
  ["Regent Street Offices", "Laura Green", "customer9@example.com", "0161 555 0109", "44 Regent Street", "", "Manchester", "M1 2AB"],
  ["Stonebridge Villa", "Peter Jones", "customer10@example.com", "0161 555 0110", "Stonebridge Villa, 3 Stonebridge Lane", "", "Cheshire", "SK8 3AA"],
];

const STAFF = [
  ["Alex Morgan", "admin@example.com", "ADMIN", false, "07700 900001"],
  ["Priya Shah", "admin2@example.com", "ADMIN", false, "07700 900002"],
  ["Morgan Lee", "manager@example.com", "MANAGER", true, "07700 900003"],
  ["Rita Patel", "manager2@example.com", "MANAGER", true, "07700 900004"],
  ["Dan Walker", "engineer1@example.com", "ENGINEER", true, "07700 900005"],
  ["Sam Okafor", "engineer2@example.com", "ENGINEER", true, "07700 900006"],
  ["Luis García", "engineer3@example.com", "ENGINEER", true, "07700 900007"],
  ["Hannah Brooks", "engineer4@example.com", "ENGINEER", true, "07700 900008"],
  ["Tomasz Nowak", "engineer5@example.com", "ENGINEER", true, "07700 900009"],
  ["Aisha Khan", "engineer6@example.com", "ENGINEER", true, "07700 900010"],
  ["Ben Carter", "engineer7@example.com", "ENGINEER", true, "07700 900011"],
  ["Grace Miller", "engineer8@example.com", "ENGINEER", true, "07700 900012"],
];

const TITLES = {
  WINDOW_INSTALL: ["Replace casement windows", "Install bay window", "Fit French doors", "Replace bedroom windows", "Install sliding sash windows"],
  REPAIR: ["Repair failed sealed unit", "Replace broken hinge", "Fix draughty window", "Replace window handle and lock", "Repair conservatory roof glazing"],
  SURVEY: ["Site survey for window replacement", "Measure for conservatory glazing", "Survey for door replacement"],
};

const DESCRIPTIONS = {
  WINDOW_INSTALL: (name) => `Supply and fit new glazing for ${name}. Make good surrounds and remove old units.`,
  REPAIR: (name) => `Attend site at ${name} and repair the reported fault. Parts to be confirmed on inspection.`,
  SURVEY: (name) => `Survey the property at ${name} and record measurements and access requirements.`,
};

const JOB_COUNTS = [3, 4, 2, 1, 3, 4, 3, 2, 2, 2];

function addressJson([line1, line2, town, postcode]) {
  return JSON.stringify({ line1, line2, town, postcode, country: "GB" });
}

export function seedDatabase(db, { seed = 20260316, force = false } = {}) {
  const numericSeed = Number(seed) >>> 0 || 20260316;

  if (isSeeded(db)) {
    if (!force) return { seeded: false, reason: "already seeded" };
    db.exec("PRAGMA foreign_keys = OFF");
    for (const table of [
      "sessions", "audit_log", "documents", "invoice_lines", "invoices", "job_events",
      "job_assignments", "jobs", "users", "customers", "permissions", "roles", "settings",
      "sequences", "companies", "meta",
    ]) {
      db.exec(`DELETE FROM ${table}`);
    }
    db.exec("PRAGMA foreign_keys = ON");
  }

  const random = mulberry32(numericSeed);
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 12);
  const now = SEED_NOW;
  const companyId = crypto.randomUUID();
  const companyAddress = {
    line1: "Unit 4, Acme Works",
    line2: "12 Trafford Park Road",
    town: "Manchester",
    postcode: "M17 1AA",
    country: "GB",
  };

  const insertCompany = db.prepare(`
    INSERT INTO companies (id,name,trading_name,email,phone,address_json,vat_number,logo_path,currency,timezone,default_theme_json,invoice_due_days,pdf_footer,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertRole = db.prepare("INSERT INTO roles (key,label,description,is_system,sort_order) VALUES (?,?,?,?,?)");
  const insertPermission = db.prepare("INSERT INTO permissions (role_key,action_key,allowed) VALUES (?,?,?)");
  const insertUser = db.prepare(`
    INSERT INTO users (id,company_id,email,password_hash,display_name,role_key,customer_id,can_engineer,phone,status,must_change_password,theme_prefs_json,last_login_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id,company_id,name,contact_name,email,phone,address_json,notes,status,created_at,created_by,archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertJob = db.prepare(`
    INSERT INTO jobs (id,company_id,reference,customer_id,title,description,work_type,status,priority,site_address_json,planned_start,planned_end,planned_slot,actual_start,actual_end,price_net,vat_rate_bp,price_gross,internal_notes,customer_notes,created_by,created_at,updated_at,archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertAssignment = db.prepare(`
    INSERT INTO job_assignments (id,job_id,user_id,is_lead,assigned_at,assigned_by,removed_at) VALUES (?,?,?,?,?,?,?)`);
  const insertEvent = db.prepare(`
    INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (id,company_id,number,job_id,status,issued_at,due_at,paid_at,net,vat_rate_bp,vat,gross,notes,created_by,created_at,voided_at,void_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertLine = db.prepare(`
    INSERT INTO invoice_lines (id,invoice_id,description,qty,unit_pence,amount_pence,sort_order) VALUES (?,?,?,?,?,?,?)`);
  const insertSetting = db.prepare("INSERT INTO settings (key,value_json,updated_at,updated_by) VALUES (?,?,?,?)");
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (id,company_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,at,ip,user_agent,request_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertSequence = db.prepare("INSERT INTO sequences (kind,year,value) VALUES (?,?,?)");

  let jobIndex = 0;
  let invoiceSequence = 0;

  db.exec("BEGIN");
  try {
    insertCompany.run(
      companyId, "Acme Windows", null, "hello@example.com", "0161 555 0000",
      JSON.stringify(companyAddress), "GB123456789", null, "GBP", "Europe/London",
      JSON.stringify({ mode: "system" }), 14,
      "Acme Windows · thank you for your business", now,
    );

    const roleDescriptions = {
      ADMIN: "Full access to configuration, users, permissions and company settings.",
      MANAGER: "Runs customers, jobs, scheduling, invoices and operational insight.",
      ENGINEER: "Field access to assigned jobs, status updates and customer-visible notes.",
      CUSTOMER: "Portal access to their own jobs, updates, invoices and documents.",
    };
    ROLES.forEach((key, index) => {
      insertRole.run(key, ROLE_LABELS[key], roleDescriptions[key], 1, index + 1);
    });

    for (const role of ROLES) {
      for (const action of ACTION_KEYS) {
        insertPermission.run(role, action, DEFAULT_MATRIX[action].has(role) ? 1 : 0);
      }
    }

    const staffIds = [];
    for (const [name, email, role, canEngineer, phone] of STAFF) {
      const id = crypto.randomUUID();
      staffIds.push(id);
      insertUser.run(
        id, companyId, email, passwordHash, name, role,
        null, canEngineer ? 1 : 0, phone, "ACTIVE", 1, null, null, now, now,
      );
    }
    const adminUserId = staffIds[0];

    const customerIds = [];
    const customerAddresses = [];
    for (const [name, contact, email, phone, line1, line2, town, postcode] of CUSTOMERS) {
      const id = crypto.randomUUID();
      customerIds.push(id);
      const address = { line1, line2, town, postcode, country: "GB" };
      customerAddresses.push(address);
      insertCustomer.run(
        id, companyId, name, contact, email, phone, JSON.stringify(address),
        null, "ACTIVE", now, adminUserId, null,
      );
    }

    for (let i = 0; i < CUSTOMERS.length; i += 1) {
      const [name, contact, email, phone] = CUSTOMERS[i];
      insertUser.run(
        crypto.randomUUID(), companyId, email, passwordHash, contact, "CUSTOMER",
        customerIds[i], 0, phone, "ACTIVE", 1, null, null, now, now,
      );
    }

    const fieldPool = staffIds.filter((_, index) => {
      const role = STAFF[index][2];
      const canEngineer = STAFF[index][3];
      return canEngineer && (role === "ENGINEER" || role === "MANAGER");
    });

    const forcedStatuses = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "INVOICED", "PAID", "CANCELLED"];
    const statusWeights = [["SCHEDULED", 35], ["COMPLETED", 25], ["IN_PROGRESS", 15], ["PAID", 10], ["INVOICED", 10], ["ON_HOLD", 5]];
    const jobCounts = numericSeed === 20260316 ? JOB_COUNTS : JOB_COUNTS.map(() => 1 + Math.floor(random() * 4));

    const jobs = [];

    for (let customerIndex = 0; customerIndex < customerIds.length; customerIndex += 1) {
      for (let n = 0; n < jobCounts[customerIndex]; n += 1) {
        const jobId = crypto.randomUUID();
        const customerId = customerIds[customerIndex];
        const customerName = CUSTOMERS[customerIndex][0];
        const reference = `JOB-2026-${String(jobIndex + 1).padStart(4, "0")}`;
        const workType = weighted(random, [["WINDOW_INSTALL", 50], ["REPAIR", 35], ["SURVEY", 15]]);
        const titles = TITLES[workType];
        const title = titles[Math.floor(random() * titles.length)];
        const description = DESCRIPTIONS[workType](customerName);
        const priority = random() < 0.15 ? "URGENT" : "NORMAL";
        const status = jobIndex < 8 ? forcedStatuses[jobIndex] : weighted(random, statusWeights);

        const createdDays = -(60 + Math.floor(random() * 120));
        const createdAt = isoAt(createdDays, 9);
        let plannedStart = null;
        let plannedEnd = null;
        let actualStart = null;
        let actualEnd = null;

        if (status !== "DRAFT") {
          if (["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].includes(status)) {
            const offset = -7 + Math.floor(random() * 29);
            plannedStart = isoAt(offset, random() < 0.5 ? 8 : 12);
            plannedEnd = isoAt(offset + (random() < 0.5 ? 0 : 1), 16);
          } else {
            const offset = -14 - Math.floor(random() * 47);
            plannedStart = isoAt(offset, random() < 0.5 ? 8 : 12);
            plannedEnd = isoAt(offset + (random() < 0.5 ? 0 : 1), 16);
          }
        }
        if (status === "IN_PROGRESS") actualStart = plannedStart;
        if (["COMPLETED", "INVOICED", "PAID"].includes(status)) {
          actualStart = plannedStart;
          actualEnd = plannedEnd;
        }

        const priceNet = (450 + Math.floor(random() * 6051)) * 100;
        const vatRateBp = 2000;
        const priceGross = grossFromNet(priceNet, vatRateBp);
        const plannedSlot = random() < 0.4 ? "ALL_DAY" : random() < 0.5 ? "AM" : "PM";
        const internalNotes = random() < 0.35 ? "Access via the side gate. Check parking restrictions before the visit." : null;
        const customerNotes = random() < 0.4 ? "Our team will confirm the arrival window the day before." : null;

        insertJob.run(
          jobId, companyId, reference, customerId, title, description, workType, status, priority,
          JSON.stringify(customerAddresses[customerIndex]), plannedStart, plannedEnd, plannedSlot,
          actualStart, actualEnd, priceNet, vatRateBp, priceGross, internalNotes, customerNotes,
          adminUserId, createdAt, createdAt, null,
        );
        jobs.push({ id: jobId, reference, status, customerId, title, priceNet, vatRateBp, createdAt, plannedStart, plannedEnd });

        // Assignments: 1–2 distinct field-capable people, first is lead.
        const assigneeCount = random() < 0.5 ? 1 : 2;
        const chosen = [];
        while (chosen.length < assigneeCount && chosen.length < fieldPool.length) {
          const candidate = fieldPool[Math.floor(random() * fieldPool.length)];
          if (!chosen.includes(candidate)) chosen.push(candidate);
        }
        const assignedAt = new Date(Date.parse(createdAt) + (1 + Math.floor(random() * 6)) * 3_600_000).toISOString();
        chosen.forEach((userId, index) => {
          insertAssignment.run(crypto.randomUUID(), jobId, userId, index === 0 ? 1 : 0, assignedAt, adminUserId, null);
          insertEvent.run(crypto.randomUUID(), jobId, adminUserId, "ASSIGNMENT", null, index === 0 ? "Lead" : "Engineer", "Engineer assigned", "INTERNAL", assignedAt);
        });

        insertEvent.run(crypto.randomUUID(), jobId, adminUserId, "CREATED", null, "DRAFT", "Job created", "INTERNAL", createdAt);
        if (status !== "DRAFT") {
          const changeAt = new Date(Date.parse(createdAt) + 2 * 3_600_000).toISOString();
          insertEvent.run(crypto.randomUUID(), jobId, adminUserId, "STATUS_CHANGE", "DRAFT", status, `Status set to ${status}`, "CUSTOMER", changeAt);
          if (status === "CANCELLED") {
            insertEvent.run(crypto.randomUUID(), jobId, adminUserId, "NOTE", null, null, "Cancelled: customer requested a later date.", "CUSTOMER", changeAt);
          }
        }

        if (status === "INVOICED" || status === "PAID") {
          invoiceSequence += 1;
          const invoiceId = crypto.randomUUID();
          const issuedDays = status === "PAID" ? -(15 + Math.floor(random() * 31)) : -(1 + Math.floor(random() * 10));
          const issuedAt = isoAt(issuedDays, 10);
          const dueAt = new Date(Date.parse(issuedAt) + 14 * DAY).toISOString();
          const paidAt = status === "PAID"
            ? new Date(Date.parse(issuedAt) + (1 + Math.floor(random() * 10)) * DAY).toISOString()
            : null;
          const vat = vatFromNet(priceNet, vatRateBp);
          insertInvoice.run(
            invoiceId, companyId, `INV-2026-${String(invoiceSequence).padStart(4, "0")}`, jobId,
            status === "PAID" ? "PAID" : "ISSUED", issuedAt, dueAt, paidAt, priceNet, vatRateBp, vat,
            priceNet + vat, "Payment due within 14 days.", adminUserId, issuedAt, null, null,
          );
          insertLine.run(crypto.randomUUID(), invoiceId, title, 1, priceNet, priceNet, 0);
        }

        jobIndex += 1;
      }
    }

    const settingsNow = now;
    const settings = [
      ["company.vat_rate_bp", 2000],
      ["company.invoice_due_days", 14],
      ["company.default_theme", { mode: "system" }],
      ["company.pdf_footer", "Acme Windows · thank you for your business"],
      ["security.password_min_length", 10],
      ["security.session_idle_minutes", 60],
    ];
    for (const [key, value] of settings) {
      insertSetting.run(key, JSON.stringify(value), settingsNow, adminUserId);
    }

    insertSequence.run("job", 2026, jobIndex);
    if (invoiceSequence > 0) insertSequence.run("invoice", 2026, invoiceSequence);

    insertAudit.run(
      crypto.randomUUID(), companyId, adminUserId, "seed.create", "SYSTEM", null, null,
      JSON.stringify({ jobs: jobIndex, invoices: invoiceSequence, users: STAFF.length + CUSTOMERS.length }),
      now, "127.0.0.1", "seed-script", "seed",
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const problems = validateSeed(db);
  if (problems.length) throw new Error("Seed validation failed:\n - " + problems.join("\n - "));
  return { seeded: true, jobs: jobIndex, invoices: invoiceSequence };
}

export function validateSeed(db, { expectedJobs = null } = {}) {
  const problems = [];
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const byRole = (role) => count("SELECT COUNT(*) AS n FROM users WHERE role_key = ?", role);
  if (byRole("ADMIN") !== 2) problems.push(`expected 2 admins, found ${byRole("ADMIN")}`);
  if (byRole("MANAGER") !== 2) problems.push(`expected 2 managers, found ${byRole("MANAGER")}`);
  if (byRole("ENGINEER") !== 8) problems.push(`expected 8 engineers, found ${byRole("ENGINEER")}`);
  if (byRole("CUSTOMER") !== 10) problems.push(`expected 10 customer logins, found ${byRole("CUSTOMER")}`);
  if (count("SELECT COUNT(*) AS n FROM customers") !== 10) problems.push("expected 10 customers");
  if (count("SELECT COUNT(*) AS n FROM users WHERE role_key='MANAGER' AND can_engineer=1") !== 2) {
    problems.push("both managers must be field-capable");
  }
  const jobs = count("SELECT COUNT(*) AS n FROM jobs");
  if (expectedJobs !== null && jobs !== expectedJobs) {
    problems.push(`expected ${expectedJobs} jobs for the reference seed, found ${jobs}`);
  }
  const badDistribution = count(`
    SELECT COUNT(*) AS n FROM (
      SELECT customer_id, COUNT(*) AS n FROM jobs GROUP BY customer_id HAVING n < 1 OR n > 4
    )`);
  if (badDistribution) problems.push(`${badDistribution} customers have a job count outside 1–4`);
  const missingAssignments = count(`
    SELECT COUNT(*) AS n FROM jobs j
    WHERE NOT EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.removed_at IS NULL)`);
  if (missingAssignments) problems.push(`${missingAssignments} jobs have no active assignment`);
  const badAssignees = count(`
    SELECT COUNT(*) AS n FROM job_assignments a JOIN users u ON u.id=a.user_id
    WHERE a.removed_at IS NULL AND (u.can_engineer=0 OR u.status<>'ACTIVE')`);
  if (badAssignees) problems.push(`${badAssignees} assignments use a non-field-capable user`);
  const statusCount = count("SELECT COUNT(DISTINCT status) AS n FROM jobs");
  if (statusCount !== 8) problems.push(`expected all 8 statuses, found ${statusCount}`);
  const badInvoices = count(`
    SELECT COUNT(*) AS n FROM jobs j
    WHERE j.status IN ('INVOICED','PAID') AND (SELECT COUNT(*) FROM invoices i WHERE i.job_id=j.id AND i.status<>'VOID') <> 1`);
  if (badInvoices) problems.push(`${badInvoices} invoiced/paid jobs do not have exactly one live invoice`);
  const paidMissing = count("SELECT COUNT(*) AS n FROM invoices WHERE status='PAID' AND paid_at IS NULL");
  if (paidMissing) problems.push(`${paidMissing} paid invoices have no paid_at`);
  const dupInvoices = count("SELECT COUNT(*) AS n FROM (SELECT number FROM invoices GROUP BY number HAVING COUNT(*) > 1)");
  if (dupInvoices) problems.push("duplicate invoice numbers");
  const noForcedChange = count("SELECT COUNT(*) AS n FROM users WHERE must_change_password=0");
  if (noForcedChange) problems.push("seed users must be forced to change password");
  const orphanJobs = count("SELECT COUNT(*) AS n FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE c.id IS NULL");
  if (orphanJobs) problems.push(`${orphanJobs} jobs reference a missing customer`);
  return problems;
}
