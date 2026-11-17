import crypto from "node:crypto";
import { DateTime } from "luxon";
import { config } from "../config.js";
import { grossFromNet } from "../domain/money.js";

// Marker lets the demo schedule be refreshed without touching hand-made jobs.
export const UPCOMING_MARKER = "[UPCOMING-DEMO]";
const WEEKS = 6;
const VAT_RATE_BP = 2000;

const TEMPLATES = [
  {
    workType: "WINDOW_INSTALL",
    title: "Replace casement windows",
    description: (name) => `Supply and fit new casement windows for ${name}. Remove old units and make good surrounds.`,
  },
  {
    workType: "REPAIR",
    title: "Repair failed sealed unit",
    description: (name) => `Attend ${name} to replace the failed sealed unit and check the surrounding frame.`,
  },
  {
    workType: "SURVEY",
    title: "Site survey for window replacement",
    description: (name) => `Survey ${name}, record measurements and confirm access requirements for the installation team.`,
  },
];

function nextJobReference(db, year) {
  const row = db.prepare("SELECT value FROM sequences WHERE kind='job' AND year=?").get(year);
  const value = (row?.value ?? 0) + 1;
  if (row) db.prepare("UPDATE sequences SET value=? WHERE kind='job' AND year=?").run(value, year);
  else db.prepare("INSERT INTO sequences (kind,year,value) VALUES ('job',?,?)").run(year, value);
  return `JOB-${year}-${String(value).padStart(4, "0")}`;
}

function removeExisting(db) {
  const rows = db.prepare("SELECT id FROM jobs WHERE internal_notes LIKE ?").all(`%${UPCOMING_MARKER}%`);
  for (const { id } of rows) {
    db.prepare("DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE job_id=?)").run(id);
    db.prepare("DELETE FROM documents WHERE entity_type='JOB' AND entity_id=?").run(id);
    db.prepare("DELETE FROM invoices WHERE job_id=?").run(id);
    db.prepare("DELETE FROM job_events WHERE job_id=?").run(id);
    db.prepare("DELETE FROM job_assignments WHERE job_id=?").run(id);
    db.prepare("DELETE FROM jobs WHERE id=?").run(id);
  }
  return rows.length;
}

export function addUpcomingJobs(db, { now = new Date(), force = false } = {}) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE internal_notes LIKE ?")
    .get(`%${UPCOMING_MARKER}%`).n;
  if (existing && !force) return { added: 0, existing };

  const admin = db.prepare(
    "SELECT id, company_id FROM users WHERE role_key='ADMIN' AND status='ACTIVE' ORDER BY created_at LIMIT 1",
  ).get();
  const customers = db.prepare(
    "SELECT id, name, address_json FROM customers WHERE archived_at IS NULL ORDER BY name LIMIT 10",
  ).all();
  const fieldUsers = db.prepare(
    "SELECT id FROM users WHERE status='ACTIVE' AND can_engineer=1 ORDER BY display_name",
  ).all();

  if (!admin) throw new Error("Add upcoming jobs needs an active admin user. Seed the database first.");
  if (!customers.length) throw new Error("Add upcoming jobs needs at least one customer.");
  if (!fieldUsers.length) throw new Error("Add upcoming jobs needs at least one field-capable user.");

  const base = DateTime.fromISO(now.toISOString(), { zone: "utc" })
    .setZone(config.COMPANY_TIMEZONE)
    .startOf("day");
  const nowIso = now.toISOString();
  const added = [];

  db.exec("BEGIN");
  try {
    removeExisting(db);
    for (let index = 0; index < WEEKS * 2; index += 1) {
      const week = Math.floor(index / 2);
      const dayOffset = 1 + week * 7 + (index % 2) * 2;
      const hour = index % 2 === 0 ? 8 : 12;
      const start = base.plus({ days: dayOffset, hours: hour });
      const end = start.startOf("day").set({ hour: 16 });
      const plannedStart = start.toUTC().toISO();
      const plannedEnd = end.toUTC().toISO();
      const customer = customers[index % customers.length];
      const template = TEMPLATES[index % TEMPLATES.length];
      const year = start.year;
      const reference = nextJobReference(db, year);
      const id = crypto.randomUUID();
      const priceNet = (950 + index * 225) * 100;
      const priceGross = grossFromNet(priceNet, VAT_RATE_BP);
      const slot = hour < 12 ? "AM" : "PM";
      const assignedUser = fieldUsers[index % fieldUsers.length];

      db.prepare(`
        INSERT INTO jobs (id,company_id,reference,customer_id,title,description,work_type,status,priority,site_address_json,
          planned_start,planned_end,planned_slot,actual_start,actual_end,price_net,vat_rate_bp,price_gross,
          internal_notes,customer_notes,created_by,created_at,updated_at,archived_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, admin.company_id, reference, customer.id, template.title, template.description(customer.name),
        template.workType, "SCHEDULED", "NORMAL", customer.address_json,
        plannedStart, plannedEnd, slot, null, null, priceNet, VAT_RATE_BP, priceGross,
        `Scheduled demo work for the next six weeks. ${UPCOMING_MARKER}`,
        "Our team will confirm the arrival window the day before.", admin.id, nowIso, nowIso, null,
      );

      db.prepare(`
        INSERT INTO job_assignments (id,job_id,user_id,is_lead,assigned_at,assigned_by,removed_at)
        VALUES (?,?,?,?,?,?,NULL)`).run(
        crypto.randomUUID(), id, assignedUser.id, 1, nowIso, admin.id,
      );
      db.prepare(`
        INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        crypto.randomUUID(), id, admin.id, "CREATED", null, "DRAFT", "Job created", "INTERNAL", nowIso,
      );
      db.prepare(`
        INSERT INTO job_events (id,job_id,actor_user_id,type,from_value,to_value,message,visibility,at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        crypto.randomUUID(), id, admin.id, "STATUS_CHANGE", "DRAFT", "SCHEDULED",
        "Status set to SCHEDULED", "CUSTOMER", nowIso,
      );

      added.push({ reference, plannedStart });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { added: added.length, jobs: added };
}
