/**
 * Customer services: create, edit, invite a portal login, archive and restore.
 *
 * Duplicate email/name errors come from SQLite's unique indexes and are turned
 * into form-level messages. A customer record and its optional CUSTOMER login
 * are written in one transaction.
 */
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "../db/index.js";
import { mapCustomer, mapJob, mapUser } from "../db/rows.js";
import type { AuthUser, Customer, Job, WriteMeta } from "../contracts/types.js";
import { hashPassword } from "../auth/passwords.js";
import { config } from "../config.js";
import { nowIso } from "../domain/dates.js";
import { audit } from "./audit.js";
import { revokeAllSessionsForUser } from "../auth/sessions.js";

export interface CustomerInput {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  country: string;
  notes: string | null;
}

export function validateCustomerInput(body: Record<string, unknown>): { values: CustomerInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: CustomerInput = {
    name: String(body["name"] ?? "").trim(),
    contact_name: String(body["contact_name"] ?? "").trim(),
    email: String(body["email"] ?? "").trim().toLowerCase(),
    phone: String(body["phone"] ?? "").trim(),
    line1: String(body["line1"] ?? "").trim(),
    line2: String(body["line2"] ?? "").trim(),
    town: String(body["town"] ?? "").trim(),
    postcode: String(body["postcode"] ?? "").trim().toUpperCase(),
    country: String(body["country"] ?? "GB").trim().toUpperCase() || "GB",
    notes: String(body["notes"] ?? "").trim() || null,
  };
  if (!values.name) errors["name"] = "Add the customer name.";
  if (!values.contact_name) errors["contact_name"] = "Add a contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors["email"] = "Enter a valid email address.";
  if (!values.phone) errors["phone"] = "Add a phone number.";
  if (!values.line1) errors["line1"] = "Add the first address line.";
  if (!values.town) errors["town"] = "Add the town or city.";
  if (!values.postcode) errors["postcode"] = "Add the postcode.";
  return { values, errors };
}

export function listCustomers(query: string): Customer[] {
  const search = query.trim();
  const rows = search
    ? all(
        `SELECT c.*,
           (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id AND j.archived_at IS NULL) AS job_count,
           (SELECT COUNT(*) FROM users u WHERE u.customer_id = c.id) AS login_count
         FROM customers c
         WHERE c.archived_at IS NULL AND (c.name LIKE ? OR c.email LIKE ? OR c.contact_name LIKE ? OR c.postcode = ?)
         ORDER BY c.name`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        search.toUpperCase(),
      )
    : all(
        `SELECT c.*,
           (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id AND j.archived_at IS NULL) AS job_count,
           (SELECT COUNT(*) FROM users u WHERE u.customer_id = c.id) AS login_count
         FROM customers c WHERE c.archived_at IS NULL ORDER BY c.name`,
      );
  return rows.map(mapCustomer);
}

export function createCustomer(
  user: AuthUser,
  values: CustomerInput,
  invite: boolean,
  meta: WriteMeta,
): { customer: Customer; loginEmail?: string } {
  const id = randomUUID();
  const now = nowIso();
  const companyId = one<{ id: string }>("SELECT id FROM companies LIMIT 1")?.id;
  if (!companyId) throw new Error("Company is missing.");

  return transaction(() => {
    run(
      `INSERT INTO customers
        (id, company_id, name, contact_name, email, phone, address_line1, address_line2, address_town,
         address_postcode, address_country, notes, status, version, created_at, updated_at, created_by, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, NULL)`,
      id,
      companyId,
      values.name,
      values.contact_name,
      values.email,
      values.phone,
      values.line1,
      values.line2 || null,
      values.town,
      values.postcode,
      values.country,
      values.notes,
      now,
      now,
      user.id,
    );
    let loginEmail: string | undefined;
    if (invite) {
      loginEmail = values.email;
      // The default password hash is computed by the caller's async route and
      // passed through the same transaction helper in `inviteCustomer`.
    }
    audit({ action: "customer.create", entityType: "CUSTOMER", entityId: id, after: { name: values.name, email: values.email }, meta });
    const created = one("SELECT * FROM customers WHERE id = ?", id);
    if (!created) throw new Error("Created customer could not be read back.");
    return { customer: mapCustomer(created), loginEmail };
  });
}

export async function createCustomerWithInvite(
  user: AuthUser,
  values: CustomerInput,
  invite: boolean,
  meta: WriteMeta,
): Promise<{ customer: Customer; loginEmail?: string }> {
  const passwordHash = invite ? await hashPassword(config.defaultPassword) : null;
  const id = randomUUID();
  const now = nowIso();
  const companyId = one<{ id: string }>("SELECT id FROM companies LIMIT 1")?.id;
  if (!companyId) throw new Error("Company is missing.");

  return transaction(() => {
    run(
      `INSERT INTO customers
        (id, company_id, name, contact_name, email, phone, address_line1, address_line2, address_town,
         address_postcode, address_country, notes, status, version, created_at, updated_at, created_by, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, NULL)`,
      id,
      companyId,
      values.name,
      values.contact_name,
      values.email,
      values.phone,
      values.line1,
      values.line2 || null,
      values.town,
      values.postcode,
      values.country,
      values.notes,
      now,
      now,
      user.id,
    );

    if (invite && passwordHash) {
      run(
        `INSERT INTO users
          (id, company_id, email, password_hash, display_name, role_key, customer_id, can_engineer, phone,
           status, must_change_password, theme_prefs_json, last_login_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'CUSTOMER', ?, 0, ?, 'INVITED', 1, NULL, NULL, 1, ?, ?)`,
        randomUUID(),
        companyId,
        values.email,
        passwordHash,
        values.contact_name,
        id,
        values.phone,
        now,
        now,
      );
      audit({ action: "customer.invite", entityType: "CUSTOMER", entityId: id, after: { email: values.email }, meta });
    }

    audit({ action: "customer.create", entityType: "CUSTOMER", entityId: id, after: { name: values.name, email: values.email }, meta });
    const created = one("SELECT * FROM customers WHERE id = ?", id);
    if (!created) throw new Error("Created customer could not be read back.");
    return { customer: mapCustomer(created), loginEmail: invite ? values.email : undefined };
  });
}

export function updateCustomer(user: AuthUser, customer: Customer, values: CustomerInput, meta: WriteMeta): Customer {
  const result = run(
    `UPDATE customers SET name = ?, contact_name = ?, email = ?, phone = ?, address_line1 = ?, address_line2 = ?,
       address_town = ?, address_postcode = ?, address_country = ?, notes = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ?`,
    values.name,
    values.contact_name,
    values.email,
    values.phone,
    values.line1,
    values.line2 || null,
    values.town,
    values.postcode,
    values.country,
    values.notes,
    nowIso(),
    customer.id,
    customer.version,
  );
  if (result.changes === 0) throw new Error("This customer changed in another tab. Reload and try again.");
  audit({ action: "customer.update", entityType: "CUSTOMER", entityId: customer.id, after: { name: values.name }, meta });
  const updated = one("SELECT * FROM customers WHERE id = ?", customer.id);
  if (!updated) throw new Error("Updated customer could not be read back.");
  return mapCustomer(updated);
}

export async function inviteCustomer(user: AuthUser, customer: Customer, meta: WriteMeta): Promise<void> {
  const existing = one<{ id: string }>("SELECT id FROM users WHERE customer_id = ?", customer.id);
  const passwordHash = await hashPassword(config.defaultPassword);
  transaction(() => {
    const now = nowIso();
    if (existing) {
      run(
        "UPDATE users SET password_hash = ?, must_change_password = 1, status = 'INVITED', version = version + 1, updated_at = ? WHERE id = ?",
        passwordHash,
        now,
        existing.id,
      );
      revokeAllSessionsForUser(existing.id);
    } else {
      const companyId = one<{ id: string }>("SELECT id FROM companies LIMIT 1")?.id ?? "";
      run(
        `INSERT INTO users
          (id, company_id, email, password_hash, display_name, role_key, customer_id, can_engineer, phone,
           status, must_change_password, theme_prefs_json, last_login_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'CUSTOMER', ?, 0, ?, 'INVITED', 1, NULL, NULL, 1, ?, ?)`,
        randomUUID(),
        companyId,
        customer.email,
        passwordHash,
        customer.contact_name,
        customer.id,
        customer.phone,
        now,
        now,
      );
    }
    audit({ action: "customer.invite", entityType: "CUSTOMER", entityId: customer.id, after: { email: customer.email }, meta });
  });
}

export function archiveCustomer(user: AuthUser, customer: Customer, meta: WriteMeta): void {
  const now = nowIso();
  run("UPDATE customers SET status = 'ARCHIVED', archived_at = ?, version = version + 1, updated_at = ? WHERE id = ?", now, now, customer.id);
  audit({ action: "customer.archive", entityType: "CUSTOMER", entityId: customer.id, meta });
}

export function restoreCustomer(user: AuthUser, customerId: string, meta: WriteMeta): void {
  run("UPDATE customers SET status = 'ACTIVE', archived_at = NULL, version = version + 1, updated_at = ? WHERE id = ?", nowIso(), customerId);
  audit({ action: "customer.restore", entityType: "CUSTOMER", entityId: customerId, meta });
}

export function loginsForCustomer(customerId: string): ReturnType<typeof mapUser>[] {
  return all("SELECT * FROM users WHERE customer_id = ? ORDER BY created_at", customerId).map(mapUser);
}

export function customerJobs(customerId: string): Job[] {
  return all(
    `SELECT j.*, c.name AS customer_name,
       (SELECT u.display_name FROM job_assignments a JOIN users u ON u.id = a.user_id
         WHERE a.job_id = j.id AND a.removed_at IS NULL AND a.is_lead = 1 LIMIT 1) AS lead_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.customer_id = ? AND j.archived_at IS NULL
      ORDER BY j.planned_start IS NULL, j.planned_start DESC`,
    customerId,
  ).map(mapJob);
}
