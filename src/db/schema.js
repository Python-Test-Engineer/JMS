export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trading_name TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_json TEXT NOT NULL,
  vat_number TEXT,
  logo_path TEXT,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  default_theme_json TEXT NOT NULL,
  invoice_due_days INTEGER NOT NULL DEFAULT 14,
  pdf_footer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  role_key TEXT NOT NULL REFERENCES roles(key),
  action_key TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (role_key, action_key)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_key TEXT NOT NULL REFERENCES roles(key),
  customer_id TEXT REFERENCES customers(id),
  can_engineer INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  theme_prefs_json TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL COLLATE NOCASE,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL,
  address_json TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (company_id, name),
  UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  work_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  site_address_json TEXT NOT NULL,
  planned_start TEXT,
  planned_end TEXT,
  planned_slot TEXT NOT NULL DEFAULT 'ALL_DAY',
  actual_start TEXT,
  actual_end TEXT,
  price_net INTEGER,
  vat_rate_bp INTEGER NOT NULL DEFAULT 2000,
  price_gross INTEGER,
  internal_notes TEXT,
  customer_notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_planned ON jobs(planned_start);

CREATE TABLE IF NOT EXISTS job_assignments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  is_lead INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  removed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON job_assignments(user_id);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  actor_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  message TEXT,
  visibility TEXT NOT NULL DEFAULT 'INTERNAL',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, at);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  number TEXT UNIQUE,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL,
  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,
  net INTEGER NOT NULL,
  vat_rate_bp INTEGER NOT NULL,
  vat INTEGER NOT NULL,
  gross INTEGER NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  voided_at TEXT,
  void_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_job ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_pence INTEGER NOT NULL,
  amount_pence INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS sequences (
  kind TEXT NOT NULL,
  year INTEGER NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (kind, year)
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  flash_json TEXT
);
`;
