/**
 * Shared domain types.
 *
 * SQLite rows are decoded at the repository boundary into these shapes. Views
 * and services therefore never deal with `0/1` booleans or split address
 * columns. Optional business state (for example `price_net` on a job) is
 * explicit rather than implied by a missing property.
 */

export const ROLE_KEYS = ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const JOB_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "INVOICED",
  "PAID",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_TYPES = ["WINDOW_INSTALL", "REPAIR", "SURVEY"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const PRIORITIES = ["NORMAL", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PLANNED_SLOTS = ["AM", "PM", "ALL_DAY"] as const;
export type PlannedSlot = (typeof PLANNED_SLOTS)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type IsoInstant = string;

export interface Address {
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  country: string;
}

export interface User {
  id: string;
  company_id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role_key: RoleKey;
  customer_id: string | null;
  can_engineer: boolean;
  phone: string | null;
  status: UserStatus;
  must_change_password: boolean;
  theme_prefs_json: string | null;
  last_login_at: IsoInstant | null;
  version: number;
  created_at: IsoInstant;
  updated_at: IsoInstant;
  customer_name?: string | null;
}

export interface AuthUser extends User {
  permissions: ReadonlySet<string>;
  customer_name?: string | null;
}

export interface SessionRecord {
  id_hash: string;
  user_id: string;
  csrf_token: string;
  created_at: IsoInstant;
  last_seen_at: IsoInstant;
  expires_at: IsoInstant;
  absolute_expires_at: IsoInstant;
  revoked_at: IsoInstant | null;
  ip: string | null;
  user_agent: string | null;
  flash_json: string | null;
}

export interface Company {
  id: string;
  name: string;
  trading_name: string | null;
  email: string;
  phone: string;
  address: Address;
  vat_number: string | null;
  logo_path: string | null;
  currency: string;
  timezone: string;
  default_theme_json: string;
  invoice_due_days: number;
  pdf_footer: string;
  version: number;
  created_at: IsoInstant;
  updated_at: IsoInstant;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: Address;
  notes: string | null;
  status: "ACTIVE" | "ARCHIVED";
  version: number;
  created_at: IsoInstant;
  updated_at: IsoInstant;
  created_by: string;
  archived_at: IsoInstant | null;
  job_count?: number;
  login_count?: number;
}

export interface Job {
  id: string;
  company_id: string;
  reference: string;
  customer_id: string;
  title: string;
  description: string;
  work_type: WorkType;
  status: JobStatus;
  priority: Priority;
  site_address: Address;
  planned_start: IsoInstant | null;
  planned_end: IsoInstant | null;
  planned_slot: PlannedSlot;
  actual_start: IsoInstant | null;
  actual_end: IsoInstant | null;
  price_net: number | null;
  vat_rate_bp: number;
  price_gross: number | null;
  internal_notes: string | null;
  customer_notes: string | null;
  version: number;
  created_by: string;
  created_at: IsoInstant;
  updated_at: IsoInstant;
  archived_at: IsoInstant | null;
  customer_name?: string;
  lead_name?: string | null;
}

export interface Assignment {
  id: string;
  job_id: string;
  user_id: string;
  is_lead: boolean;
  assigned_at: IsoInstant;
  assigned_by: string;
  removed_at: IsoInstant | null;
  display_name: string;
  email: string;
  role_key: RoleKey;
  phone: string | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  actor_user_id: string;
  type:
    | "STATUS_CHANGE"
    | "ASSIGNMENT"
    | "SCHEDULE_CHANGE"
    | "NOTE"
    | "DOCUMENT"
    | "PRICE_CHANGE"
    | "CREATED"
    | "ARCHIVED";
  from_value: string | null;
  to_value: string | null;
  message: string | null;
  visibility: "INTERNAL" | "CUSTOMER";
  at: IsoInstant;
  actor_name?: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  number: string;
  job_id: string;
  status: InvoiceStatus;
  issued_at: IsoInstant | null;
  due_at: IsoInstant | null;
  paid_at: IsoInstant | null;
  net: number;
  vat_rate_bp: number;
  vat: number;
  gross: number;
  notes: string | null;
  version: number;
  created_by: string;
  created_at: IsoInstant;
  voided_at: IsoInstant | null;
  void_reason: string | null;
  customer_name?: string;
  job_reference?: string;
  job_title?: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  line_no: number;
  description: string;
  qty_milli: number;
  unit_pence: number;
  amount_pence: number;
  /** Display quantity (converted from thousandths). */
  qty: number;
}

export interface DocumentRecord {
  id: string;
  type: "JOB_SHEET" | "INVOICE";
  entity_type: "JOB" | "INVOICE";
  entity_id: string;
  version: number;
  generated_at: IsoInstant;
  generated_by: string;
  file_path: string;
  checksum: string;
  size_bytes: number;
  mime: string;
}

export interface SettingRow {
  key: string;
  value_json: string;
  version: number;
  updated_at: IsoInstant;
  updated_by: string;
}

export interface AuditRow {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  at: IsoInstant;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  actor_name?: string | null;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

/** Metadata attached to every write, so audit rows never invent request data. */
export interface WriteMeta {
  actorUserId: string;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface DomainError {
  code: string;
  message: string;
  field?: string;
  status?: number;
}
