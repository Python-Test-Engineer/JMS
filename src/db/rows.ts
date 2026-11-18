/**
 * Row decoding.
 *
 * SQLite gives us primitives. This is the single place that turns `0/1` into
 * booleans, a record of address columns into an `Address`, and an invoice line
 * quantity in thousandths into a display number. Services never see raw rows.
 */
import type {
  Address,
  Assignment,
  AuditRow,
  Company,
  Customer,
  DocumentRecord,
  Invoice,
  InvoiceLine,
  Job,
  JobEvent,
  RoleKey,
  SessionRecord,
  User,
} from "../contracts/types.js";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
function number(value: unknown): number {
  return Number(value ?? 0);
}
function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
function bool(value: unknown): boolean {
  return Number(value) === 1;
}

function address(_prefix: "address" | "site"): Address {
  return {
    line1: "",
    line2: "",
    town: "",
    postcode: "",
    country: "GB",
  } as Address;
}

export function decodeAddress(row: Row, prefix: string): Address {
  return {
    line1: text(row[`${prefix}line1`]),
    line2: text(row[`${prefix}line2`]),
    town: text(row[`${prefix}town`]),
    postcode: text(row[`${prefix}postcode`]),
    country: text(row[`${prefix}country`]) || "GB",
  };
}

export function mapCompany(row: Row): Company {
  return {
    id: text(row["id"]),
    name: text(row["name"]),
    trading_name: nullableText(row["trading_name"]),
    email: text(row["email"]),
    phone: text(row["phone"]),
    address: decodeAddress(row, "address_"),
    vat_number: nullableText(row["vat_number"]),
    logo_path: nullableText(row["logo_path"]),
    currency: text(row["currency"]) || "GBP",
    timezone: text(row["timezone"]) || "Europe/London",
    default_theme_json: text(row["default_theme_json"]) || "{}",
    invoice_due_days: number(row["invoice_due_days"]) || 14,
    pdf_footer: text(row["pdf_footer"]),
    version: number(row["version"]) || 1,
    created_at: text(row["created_at"]),
    updated_at: text(row["updated_at"]),
  };
}

export function mapUser(row: Row): User {
  return {
    id: text(row["id"]),
    company_id: text(row["company_id"]),
    email: text(row["email"]),
    password_hash: text(row["password_hash"]),
    display_name: text(row["display_name"]),
    role_key: text(row["role_key"]) as RoleKey,
    customer_id: nullableText(row["customer_id"]),
    can_engineer: bool(row["can_engineer"]),
    phone: nullableText(row["phone"]),
    status: text(row["status"]) as User["status"],
    must_change_password: bool(row["must_change_password"]),
    theme_prefs_json: nullableText(row["theme_prefs_json"]),
    last_login_at: nullableText(row["last_login_at"]),
    version: number(row["version"]) || 1,
    created_at: text(row["created_at"]),
    updated_at: text(row["updated_at"]),
    customer_name: nullableText(row["customer_name"]),
  };
}

export function mapSession(row: Row): SessionRecord {
  return {
    id_hash: text(row["id_hash"]),
    user_id: text(row["user_id"]),
    csrf_token: text(row["csrf_token"]),
    created_at: text(row["created_at"]),
    last_seen_at: text(row["last_seen_at"]),
    expires_at: text(row["expires_at"]),
    absolute_expires_at: text(row["absolute_expires_at"]),
    revoked_at: nullableText(row["revoked_at"]),
    ip: nullableText(row["ip"]),
    user_agent: nullableText(row["user_agent"]),
    flash_json: nullableText(row["flash_json"]),
  };
}

export function mapCustomer(row: Row): Customer {
  return {
    id: text(row["id"]),
    company_id: text(row["company_id"]),
    name: text(row["name"]),
    contact_name: text(row["contact_name"]),
    email: text(row["email"]),
    phone: text(row["phone"]),
    address: decodeAddress(row, "address_"),
    notes: nullableText(row["notes"]),
    status: text(row["status"]) as Customer["status"],
    version: number(row["version"]) || 1,
    created_at: text(row["created_at"]),
    updated_at: text(row["updated_at"]),
    created_by: text(row["created_by"]),
    archived_at: nullableText(row["archived_at"]),
    job_count: row["job_count"] === undefined ? undefined : number(row["job_count"]),
    login_count: row["login_count"] === undefined ? undefined : number(row["login_count"]),
  };
}

export function mapJob(row: Row): Job {
  return {
    id: text(row["id"]),
    company_id: text(row["company_id"]),
    reference: text(row["reference"]),
    customer_id: text(row["customer_id"]),
    title: text(row["title"]),
    description: text(row["description"]),
    work_type: text(row["work_type"]) as Job["work_type"],
    status: text(row["status"]) as Job["status"],
    priority: text(row["priority"]) as Job["priority"],
    site_address: decodeAddress(row, "site_"),
    planned_start: nullableText(row["planned_start"]),
    planned_end: nullableText(row["planned_end"]),
    planned_slot: text(row["planned_slot"]) as Job["planned_slot"],
    actual_start: nullableText(row["actual_start"]),
    actual_end: nullableText(row["actual_end"]),
    price_net: nullableNumber(row["price_net"]),
    vat_rate_bp: number(row["vat_rate_bp"]) || 2000,
    price_gross: nullableNumber(row["price_gross"]),
    internal_notes: nullableText(row["internal_notes"]),
    customer_notes: nullableText(row["customer_notes"]),
    version: number(row["version"]) || 1,
    created_by: text(row["created_by"]),
    created_at: text(row["created_at"]),
    updated_at: text(row["updated_at"]),
    archived_at: nullableText(row["archived_at"]),
    customer_name: row["customer_name"] === undefined ? undefined : text(row["customer_name"]),
    lead_name: row["lead_name"] === undefined ? null : nullableText(row["lead_name"]),
  };
}

export function mapAssignment(row: Row): Assignment {
  return {
    id: text(row["id"]),
    job_id: text(row["job_id"]),
    user_id: text(row["user_id"]),
    is_lead: bool(row["is_lead"]),
    assigned_at: text(row["assigned_at"]),
    assigned_by: text(row["assigned_by"]),
    removed_at: nullableText(row["removed_at"]),
    display_name: text(row["display_name"]),
    email: text(row["email"]),
    role_key: text(row["role_key"]) as RoleKey,
    phone: nullableText(row["phone"]),
  };
}

export function mapEvent(row: Row): JobEvent {
  return {
    id: text(row["id"]),
    job_id: text(row["job_id"]),
    actor_user_id: text(row["actor_user_id"]),
    type: text(row["type"]) as JobEvent["type"],
    from_value: nullableText(row["from_value"]),
    to_value: nullableText(row["to_value"]),
    message: nullableText(row["message"]),
    visibility: text(row["visibility"]) as JobEvent["visibility"],
    at: text(row["at"]),
    actor_name: row["actor_name"] === undefined ? undefined : text(row["actor_name"]),
  };
}

export function mapInvoice(row: Row): Invoice {
  return {
    id: text(row["id"]),
    company_id: text(row["company_id"]),
    number: text(row["number"]),
    job_id: text(row["job_id"]),
    status: text(row["status"]) as Invoice["status"],
    issued_at: nullableText(row["issued_at"]),
    due_at: nullableText(row["due_at"]),
    paid_at: nullableText(row["paid_at"]),
    net: number(row["net"]),
    vat_rate_bp: number(row["vat_rate_bp"]),
    vat: number(row["vat"]),
    gross: number(row["gross"]),
    notes: nullableText(row["notes"]),
    version: number(row["version"]) || 1,
    created_by: text(row["created_by"]),
    created_at: text(row["created_at"]),
    voided_at: nullableText(row["voided_at"]),
    void_reason: nullableText(row["void_reason"]),
    customer_name: row["customer_name"] === undefined ? undefined : text(row["customer_name"]),
    job_reference: row["job_reference"] === undefined ? undefined : text(row["job_reference"]),
    job_title: row["job_title"] === undefined ? undefined : text(row["job_title"]),
  };
}

export function mapInvoiceLine(row: Row): InvoiceLine {
  const qtyMilli = number(row["qty_milli"]);
  return {
    id: text(row["id"]),
    invoice_id: text(row["invoice_id"]),
    line_no: number(row["line_no"]),
    description: text(row["description"]),
    qty_milli: qtyMilli,
    unit_pence: number(row["unit_pence"]),
    amount_pence: number(row["amount_pence"]),
    qty: qtyMilli / 1000,
  };
}

export function mapDocument(row: Row): DocumentRecord {
  return {
    id: text(row["id"]),
    type: text(row["type"]) as DocumentRecord["type"],
    entity_type: text(row["entity_type"]) as DocumentRecord["entity_type"],
    entity_id: text(row["entity_id"]),
    version: number(row["version"]),
    generated_at: text(row["generated_at"]),
    generated_by: text(row["generated_by"]),
    file_path: text(row["file_path"]),
    checksum: text(row["checksum"]),
    size_bytes: number(row["size_bytes"]),
    mime: text(row["mime"]),
  };
}

export function mapAudit(row: Row): AuditRow {
  return {
    id: text(row["id"]),
    company_id: text(row["company_id"]),
    actor_user_id: nullableText(row["actor_user_id"]),
    action: text(row["action"]),
    entity_type: text(row["entity_type"]),
    entity_id: nullableText(row["entity_id"]),
    before_json: nullableText(row["before_json"]),
    after_json: nullableText(row["after_json"]),
    at: text(row["at"]),
    ip: nullableText(row["ip"]),
    user_agent: nullableText(row["user_agent"]),
    request_id: nullableText(row["request_id"]),
    actor_name: row["actor_name"] === undefined ? null : nullableText(row["actor_name"]),
  };
}

/** Retained for type completeness when a caller only needs an empty Address. */
export const EMPTY_ADDRESS: Address = address("address");
