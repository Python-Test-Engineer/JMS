# JMS — Technical Specification

> **What this is.** The implementation contract for JMS v1. It turns `_PLAN.md` into
> a browser application: Node service, HTMX-rendered templates, a JSON document store
> with table-like collections, server-side authorisation, PDF job sheets/invoices and a
> reproducible seed dataset.
>
> **Status.** Draft v0.1 — ready to build. `_PLAN.md` remains the product authority; this
> document is the engineering authority. Where the two differ, §1.3 records the change
> explicitly.
>
> **Documentation rule.** `_PLAN.md`, `_TECH.md` and help pages are HTML-only. Markdown is
> converted to HTML or authored directly. The application itself does generate PDF job
> sheets and invoices.

---

## 1. Scope, decisions and conventions

### 1.1 What v1 builds

A single deployable Node web application for Acme Windows that provides:

- sign-in, first-sign-in password change, sessions and server-side authorisation;
- an editable role × action permission matrix;
- customers, customer portal logins, jobs, assignments, scheduling and status tracking;
- a customer portal limited to the customer's own jobs, updates and documents;
- invoices with gapless numbering and server-generated PDFs;
- global search, operations/engineer dashboards, timeline, workload and financial views;
- an admin area for users, roles, permissions, company settings, themes and audit;
- a JSON data store that behaves like a small relational database and can be replaced by
  SQLite/Postgres without rewriting routes or templates.

### 1.2 Fixed technical decisions

| # | Decision | Choice |
|---|---|---|
| D13 | Server runtime | Node.js 22 LTS, ES modules, one process |
| D14 | HTTP framework | Express 4 |
| D15 | Templates | Nunjucks, server-rendered HTML |
| D16 | Interactivity | HTMX 2, vendored locally; no SPA, no CDN at runtime |
| D17 | Initial database | JSON document store with table-like collections |
| D18 | Password hashing | bcrypt, cost 12 (`bcryptjs` for portability) |
| D19 | Validation | Zod schemas at every write boundary |
| D20 | Dates/timezone | Luxon; store UTC ISO 8601; display `Europe/London` |
| D21 | Money | integer pence; VAT as integer basis points; never floats |
| D22 | PDF engine | PDFKit, server-side, A4 |
| D23 | Logging | Pino structured JSON logs |
| D24 | Tests | Node built-in test runner + Supertest; HTTP-level workflow tests |
| D25 | Managers as engineers | `user.can_engineer = true` capability on MANAGER accounts |
| D26 | Seed data | 2 admins, 2 managers (field-capable), 8 engineers, 10 customers, 1–4 jobs each |
| D27 | Docs build | Markdown → HTML only; no PDF build for docs |

### 1.3 Deliberate changes from `_PLAN.md`

| Plan reference | Change | Reason |
|---|---|---|
| §10 N3 | v1 starts on the JSON store, not SQLite | User decision; a repository boundary keeps a later SQL adapter cheap |
| §2.1 | Managers may be field-capable via `can_engineer` | User decision; they keep the MANAGER role and may be assigned to jobs |
| §10 N6 | Seed is 2 admins / 2 managers / 8 engineers / 10 customers / 1–4 jobs each | User decision; replaces the earlier 1/2/5/20/60 seed |
| §11.2 | Documentation is HTML-only | Docs no longer need PDFs; product PDFs remain |

Everything else follows `_PLAN.md`, including the action keys in §2.3, the invariants in
§2.4, the status machine in §3.3, the UX rules in §6 and the security rules in §9.

### 1.4 Data and code conventions

- **IDs:** UUID v4 strings generated with `crypto.randomUUID()`.
- **Timestamps:** UTC ISO 8601 strings (`2026-03-16T08:00:00.000Z`). Render in the company
  timezone. Never store local-time strings.
- **Dates:** business dates use `YYYY-MM-DD` only where a time is meaningless (invoice due
  date is stored as an instant; display is local).
- **Money:** integer minor units (`price_net: 425000` means £4,250.00).
- **VAT:** integer basis points (`vat_rate_bp: 2000` means 20.00%).
- **Percentages:** basis points unless stated otherwise.
- **Emails:** lower-cased and trimmed before uniqueness checks.
- **Soft deletion:** jobs and customers use `archived_at`; invoices use `VOID`; audit and
  events are append-only and never deleted.
- **Validation:** reject unknown fields on writes; coerce only form strings explicitly.
- **Escaping:** Nunjucks autoescape on. Notes are plain text, never HTML.
- **No secrets in code:** configuration comes from environment variables.

---

## 2. Architecture

### 2.1 Runtime shape

```
Browser (HTMX + progressive forms)
        │  HTTP, cookies, HTML fragments
        ▼
Express app
  ├─ middleware: request id, logging, sessions, CSRF, auth, permissions
  ├─ routes/controllers: parse, authorise, call services, render
  ├─ services: jobs, invoices, permissions, PDFs, audit
  ├─ repositories: typed access to collections
  └─ templates: Nunjucks layouts, pages, partials, macros
        │
        ├─ data/jms.json          domain collections (single writer)
        ├─ data/sessions.json     session records (separate write-heavy store)
        ├─ storage/documents/     generated PDFs
        └─ backups/               timestamped copies
```

### 2.2 Request lifecycle

1. Express assigns a request ID and starts a Pino child logger.
2. Security headers are set; static files are served with cache headers.
3. The session cookie is read; the session record is loaded and idleness expiry checked.
4. The authenticated user is loaded; deactivated/archived users are signed out.
5. CSRF is verified for every unsafe method (`POST`, `PUT`, `PATCH`, `DELETE`).
6. The route guard runs `requirePermission(actionKey)`.
7. The controller calls a service, which applies object scoping and domain rules.
8. The service writes domain changes and audit rows inside one store transaction.
9. The controller renders a full page or an HTMX fragment and sets flash data.
10. The store persists the new snapshot atomically before the response is considered
    successful.

### 2.3 Concurrency and process model

- **One Node process only.** The JSON store is not safe for multiple writers. Do not run
  PM2 cluster mode, multiple containers or multiple replicas against the same data file.
- A lock file (`data/jms.lock`) contains the PID. Startup refuses to run if another live
  process owns the lock; stale locks are removed only after an explicit check.
- All domain writes go through `store.transaction()`, which serialises writers with a
  promise queue. Reads use the in-memory snapshot and do not queue.
- Session writes go to a separate store and are throttled: `last_seen_at` is persisted at
  most once per minute per session.

---

## 3. Stack, dependencies and scripts

### 3.1 Dependencies

| Package | Purpose | Notes |
|---|---|---|
| `express` | HTTP routing, middleware | 4.x |
| `nunjucks` | Server templates | autoescape, async filters off |
| `bcryptjs` | Password hashing | cost 12; no native build step |
| `zod` | Request/schema validation | fail fast on config and writes |
| `luxon` | Timezone-aware dates | `Europe/London` |
| `pdfkit` | Job sheet and invoice PDFs | A4, streams to file |
| `helmet` | Security headers/CSP | configure for local HTMX assets |
| `compression` | Gzip/Brotli | static + HTML |
| `pino`, `pino-http` | Structured logs | request IDs, redaction |
| `cookie` | Cookie parsing | signed session cookie |
| `htmx.org` | UI behaviour | vendored in `public/vendor/` |
| `supertest` (dev) | HTTP tests | with Node test runner |
| `pdf-parse` (dev) | Assert PDF text in tests | no production dependency |
| `eslint` (dev) | Lint | flat config |

No build step. No CDN. Static assets are served from `public/`.

### 3.2 `package.json` scripts

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "seed": "node scripts/seed.js",
    "seed:force": "node scripts/seed.js --force",
    "reset": "node scripts/reset.js --force",
    "backup": "node scripts/backup.js",
    "restore": "node scripts/restore.js",
    "test": "node --test",
    "test:watch": "node --test --watch",
    "lint": "eslint .",
    "check": "npm run lint && npm test"
  }
}
```

### 3.3 Version policy

- `package-lock.json` is committed.
- Engines: `"node": ">=22.11"`.
- Production installs use `npm ci --omit=dev`.
- Dependency updates are a deliberate commit; no automatic major upgrades.

---

## 4. Repository layout

```
JMS/
  _PLAN.md  _TECH.md  README.md
  docs.toml  jms_theme.toml
  skills/make-jms-html/
  package.json  package-lock.json  .env.example  .gitignore
  data/
    jms.json                 # created by seed; ignored by git
    sessions.json            # created at runtime; ignored
    jms.lock
  backups/                   # ignored
  storage/documents/         # ignored
  scripts/
    seed.js
    reset.js
    backup.js
    restore.js
  src/
    server.js                # listen, graceful shutdown
    app.js                   # express app factory (testable)
    config.js                # env parsing + Zod validation
    logger.js
    db/
      store.js               # atomic JSON store, transactions, lock
      indexes.js
      schemas.js             # Zod schemas per collection
      migrations/
      repositories/
        users.js
        customers.js
        jobs.js
        invoices.js
        documents.js
        audit.js
        permissions.js
    auth/
      passwords.js
      sessions.js
      csrf.js
      rate-limit.js
    domain/
      status.js              # transition table + guards
      permissions.js         # action keys, matrix helpers, scoping
      references.js          # JOB/INV numbering
      money.js
      dates.js
    services/
      users.js
      customers.js
      jobs.js
      invoices.js
      documents.js
      dashboard.js
      audit.js
      settings.js
    routes/
      public.js
      account.js
      dashboards.js
      jobs.js
      customers.js
      invoices.js
      portal.js
      insights.js
      admin.js
      search.js
      partials.js
    middleware/
      auth.js
      permissions.js
      csrf.js
      errors.js
      htmx.js
      request-id.js
    forms/
      auth.js
      customers.js
      jobs.js
      invoices.js
      users.js
      settings.js
    views/
      layouts/
        app.njk
        auth.njk
        print.njk
      pages/…
      partials/…
      macros/…
    public/
      css/tokens.css
      css/app.css
      css/print.css
      js/app.js
      js/appearance.js
      js/theme-boot.js
      vendor/htmx.min.js
  tests/
    helpers/
    unit/
    http/
    workflows/
```

---

## 5. Configuration

### 5.1 Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test`, `production` |
| `PORT` | no | `3000` | HTTP port |
| `APP_URL` | production | `http://localhost:3000` | absolute links and cookie decisions |
| `SESSION_SECRET` | production | — | 32+ random bytes, signs session IDs |
| `DATA_FILE` | no | `data/jms.json` | domain store path |
| `SESSION_FILE` | no | `data/sessions.json` | session store path |
| `BACKUP_DIR` | no | `backups` | backup destination |
| `PDF_DIR` | no | `storage/documents` | generated PDFs |
| `SESSION_IDLE_MINUTES` | no | `60` | inactivity expiry |
| `COOKIE_SECURE` | production | `true` in production | Secure cookie flag |
| `TRUST_PROXY` | no | `false` | set when behind a trusted proxy |
| `DEFAULT_PASSWORD` | no | `JMS123` | seed/invite starting password only |
| `COMPANY_TIMEZONE` | no | `Europe/London` | display timezone |
| `CURRENCY` | no | `GBP` | display currency |
| `VAT_RATE_BP` | no | `2000` | default VAT (20%) |
| `LOG_LEVEL` | no | `info` | pino level |
| `SEED` | no | `20260316` | deterministic seed value |

`.env.example` documents every variable. `.env` is ignored. Production validation fails
startup if `SESSION_SECRET` is missing/weak, `COOKIE_SECURE` is false, or `NODE_ENV` is not
`production`.

### 5.2 Validation

`src/config.js` parses `process.env` with a Zod object, applies defaults and exports a
frozen config. No module reads `process.env` directly. Tests inject config overrides.

### 5.3 Directories

On boot the app ensures `data/`, `backups/` and `storage/documents/` exist and are
writable. Failure is fatal with a clear log line. The data directory must be on persistent
storage in production.

---

## 6. HTTP conventions

### 6.1 Responses and status codes

| Situation | Response |
|---|---|
| Page render | `200 text/html` |
| Successful unsafe request | `302` redirect to the next screen, with flash |
| Successful HTMX mutation | `200` fragment + `HX-Trigger: jms:flash` |
| Validation failure | `400` with the form and field errors |
| Not signed in | `302` to `/signin?next=…` |
| Permission denied | `403` friendly page/fragment |
| Object out of scope / not found | `404` (do not reveal existence) |
| Conflict (duplicate email, lead clash) | `409` with explanation |
| Server error | `500` friendly page, request ID shown, details only logged |

### 6.2 HTMX rules

- The server sets `HX-Request: true` on HTMX calls; controllers branch on it.
- HTMX responses return a fragment, never a full document.
- Full-page forms are the baseline. Every create/edit form works without JavaScript.
- Lists, search, filters, status control and timeline refresh use HTMX.
- After a mutation, return the updated fragment and trigger a flash event.
- Set `HX-Redirect` only when a full navigation is genuinely needed.
- Disable submit buttons on submit (`app.js`); show an inline busy state within 300 ms.
- Never rely on client-side checks for authorisation or validation.

### 6.3 CSRF and flash

- A random CSRF token is created per session and exposed as `csrfToken`.
- Full forms include `<input type="hidden" name="_csrf" value="…">`.
- HTMX requests send `X-CSRF-Token` from a `<meta>` tag.
- Missing/invalid token → `403`, no state change.
- Flash messages are stored in the session as `{type, message}` and rendered once.

### 6.4 Errors and not-found behaviour

- Signed-in users never see a raw stack trace.
- Out-of-scope records return the friendly not-found page, not a 403, to avoid ID probing.
- A friendly 403 explains the missing permission and links to the user's landing screen.
- Validation errors re-render the form with values preserved and focus on the first error.

### 6.5 Pagination, filtering and sorting

- Default page size 25; maximum 100.
- `?page=2&per_page=25`; invalid values fall back to defaults.
- Sort/filter parameters are allow-listed per list; unknown keys are ignored.
- Search requires at least 2 characters.
- Lists show a count and the active filters as removable pills.

---

## 7. JSON database

### 7.1 File shape

`data/jms.json` is one JSON object. Each top-level key except `_meta` is a "table": an array
of records. This is deliberately relational in spirit, not a free-form document dump.

```json
{
  "_meta": {
    "schema_version": 1,
    "seed_version": "2026-03-16.1",
    "created_at": "2026-03-16T08:00:00.000Z",
    "updated_at": "2026-03-16T08:00:00.000Z",
    "sequences": {
      "job": { "2026": 26 },
      "invoice": { "2026": 2 }
    }
  },
  "companies": [],
  "roles": [],
  "permissions": [],
  "users": [],
  "customers": [],
  "jobs": [],
  "job_assignments": [],
  "job_events": [],
  "invoices": [],
  "documents": [],
  "settings": [],
  "audit_log": []
}
```

`sessions` live in `data/sessions.json`:

```json
{
  "_meta": { "schema_version": 1 },
  "sessions": []
}
```

### 7.2 Store API

`src/db/store.js` exposes a small, table-oriented interface. Routes and services never
read the file directly.

```js
const store = await createStore({
  file,
  schemas,          // Zod schema per collection
  empty,            // initial data factory
  lockFile,
});

store.all("jobs");
store.get("jobs", id);
store.findOne("users", (u) => u.email === email);
store.insert("jobs", record);
store.update("jobs", id, (job) => ({ ...job, status: "SCHEDULED" }));
store.transaction(async (tx) => {
  tx.insert("job_events", event);
  tx.update("jobs", jobId, patch);
});
store.snapshot();
store.backup("pre-migration");
```

Repositories wrap these methods with domain-specific functions, so replacing JSON with SQL
means replacing repositories, not controllers.

### 7.3 Transactions, locking and atomic writes

- A transaction clones the current data object (small dataset), applies mutations to the
  clone, validates the affected records, then swaps it in and persists.
- On any thrown error, the clone is discarded; memory and disk keep the previous snapshot.
- Writers are serialised through a promise queue. Read requests continue against the
  current committed snapshot.
- Persistence writes `data/jms.json.tmp`, `fsync`s it where supported, renames it over the
  target, and keeps the previous file as `data/jms.json.bak`.
- A failed write returns 500 and logs the request ID. The in-memory state is rolled back to
  the last persisted snapshot, not left ahead of disk.
- A process-level lock prevents two writers on one data file.

### 7.4 Schema validation and migrations

- Every collection has a Zod schema in `src/db/schemas.js`.
- Boot validates `_meta.schema_version`, then every record. Invalid data refuses startup
  with a clear message and a path to the backup.
- Migrations live in `src/db/migrations/NNN-description.js` and export
  `{ from, to, up(data) }`. They run in order inside a transaction, after a backup.
- v1 starts at `schema_version: 1`; no migrations are required on first release.
- Seed idempotency is tracked by `_meta.seed_version`.

### 7.5 Indexes

On boot, build in-memory maps:

| Index | Key |
|---|---|
| users by id/email | `Map<string, User>` |
| users by role | `Map<roleKey, Set<userId>>` |
| customers by id/email | `Map<string, Customer>` |
| jobs by id/reference | `Map<string, Job>` |
| jobs by customer | `Map<customerId, Set<jobId>>` |
| assignments by job/user/active | `Map<string, Set<Assignment>>` |
| invoices by number/job/status | `Map<string, Invoice>` |
| documents by entity | `Map<"TYPE:id", Document[]>` |

Indexes are rebuilt after every committed mutation that affects their keys. For the v1
dataset (under 100 jobs) this is cheaper and simpler than query planners.

### 7.6 Future SQL adapter

The repository contract is the seam:

| JSON collection | Future table | Notes |
|---|---|---|
| `companies` | `companies` | one row |
| `users` | `users` | `can_engineer` boolean |
| `roles`, `permissions` | `roles`, `permissions` | permission composite key |
| `customers` | `customers` | address columns or JSONB |
| `jobs` | `jobs` | money as integer, timestamps as `timestamptz` |
| `job_assignments` | `job_assignments` | partial unique index for active lead |
| `job_events` | `job_events` | append-only |
| `invoices` | `invoices` + `invoice_lines` | line items normalised |
| `documents` | `documents` | file path/checksum |
| `settings` | `settings` | key/value JSONB |
| `audit_log` | `audit_log` | append-only, indexed by time |

No route may contain a JSON-file assumption or an in-memory array query.

---

## 8. Data model

### 8.1 Shared value objects

**Address**

| Field | Type | Required | Notes |
|---|---|---|---|
| `line1` | string(1–120) | yes | |
| `line2` | string(0–120) | no | |
| `town` | string(1–80) | yes | |
| `postcode` | string(3–12) | yes | normalise upper case |
| `country` | string(2) | no | default `GB` |

### 8.2 `companies`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `name` | string | yes | `Acme Windows` in seed |
| `trading_name` | string/null | no | |
| `email` | string | yes | valid email |
| `phone` | string | yes | |
| `address` | Address | yes | |
| `vat_number` | string/null | no | |
| `logo_path` | string/null | no | relative to `public/` |
| `currency` | string | yes | `GBP` |
| `timezone` | string | yes | `Europe/London` |
| `default_theme` | object | yes | mode + token overrides |
| `invoice_due_days` | int | yes | default 14 |
| `pdf_footer` | string | yes | plain text |
| `created_at` | iso8601 | yes | |

### 8.3 `users`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `company_id` | uuid | yes | FK company |
| `email` | string | yes | lower-case, unique |
| `password_hash` | string | yes | bcrypt |
| `display_name` | string | yes | |
| `role_key` | enum | yes | `ADMIN`, `MANAGER`, `ENGINEER`, `CUSTOMER` |
| `customer_id` | uuid/null | conditional | required iff `role_key = CUSTOMER` |
| `can_engineer` | boolean | yes | true for ENGINEER; optional for MANAGER; false otherwise |
| `phone` | string/null | no | |
| `status` | enum | yes | `INVITED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED` |
| `must_change_password` | boolean | yes | true for invited/default-password accounts |
| `theme_prefs` | object/null | no | user overrides |
| `last_login_at` | iso8601/null | no | |
| `created_at` | iso8601 | yes | |
| `updated_at` | iso8601 | yes | |

Rules:

- Email uniqueness is global within the company; the JSON store enforces it in the user
  repository before insert/update.
- `CUSTOMER` users must point at exactly one customer. No other role may set `customer_id`.
- `ENGINEER` users have `can_engineer: true`. `MANAGER` users may be seeded/edited to
  `can_engineer: true`. `ADMIN`/`CUSTOMER` users may not.
- A field-capable user is one with `can_engineer: true` and `status: ACTIVE`.
- Deactivation revokes all sessions and removes active assignments from future jobs but
  keeps historical assignments.

### 8.4 `roles`

| Field | Type | Required | Notes |
|---|---|---|---|
| `key` | enum | yes | PK: `ADMIN`, `MANAGER`, `ENGINEER`, `CUSTOMER` |
| `label` | string | yes | display label |
| `description` | string | yes | plain-language summary |
| `is_system` | boolean | yes | true for v1 roles |
| `sort_order` | int | yes | navigation order |

System roles cannot be created or deleted in v1; only their permissions are editable.

### 8.5 `permissions`

| Field | Type | Required | Notes |
|---|---|---|---|
| `role_key` | enum | yes | composite PK part |
| `action_key` | string | yes | composite PK part |
| `allowed` | boolean | yes | default from §10.2 |

Composite uniqueness is `(role_key, action_key)`. Every action key in §10.2 has a row for
every role, so the matrix is explicit rather than "missing means denied".

### 8.6 `customers`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `company_id` | uuid | yes | |
| `name` | string | yes | unique per company (case-insensitive) |
| `contact_name` | string | yes | |
| `email` | string | yes | unique per company |
| `phone` | string | yes | |
| `address` | Address | yes | |
| `notes` | string | no | internal only |
| `status` | enum | yes | `ACTIVE`, `ARCHIVED` |
| `created_at` | iso8601 | yes | |
| `created_by` | uuid | yes | user id |
| `archived_at` | iso8601/null | no | |

### 8.7 `jobs`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `company_id` | uuid | yes | |
| `reference` | string | yes | `JOB-YYYY-NNNN`, unique |
| `customer_id` | uuid | yes | FK customer |
| `title` | string | yes | 1–140 chars |
| `description` | string | yes | plain text |
| `work_type` | enum | yes | `WINDOW_INSTALL`, `REPAIR`, `SURVEY` |
| `status` | enum | yes | §11.1 |
| `priority` | enum | yes | `NORMAL`, `URGENT` |
| `site_address` | Address | yes | defaults to customer address |
| `planned_start` | iso8601/null | conditional | required before leaving `DRAFT` |
| `planned_end` | iso8601/null | conditional | ≥ `planned_start` |
| `planned_slot` | enum | yes | `AM`, `PM`, `ALL_DAY` |
| `actual_start` | iso8601/null | no | stamped on `IN_PROGRESS` |
| `actual_end` | iso8601/null | no | stamped on `COMPLETED` |
| `price_net` | int/null | no | pence; manager/admin only |
| `vat_rate_bp` | int | yes | default company VAT |
| `price_gross` | int/null | no | derived and stored at write time |
| `internal_notes` | string | no | never customer-visible |
| `customer_notes` | string | no | customer-visible |
| `created_by` | uuid | yes | |
| `created_at` | iso8601 | yes | |
| `updated_at` | iso8601 | yes | |
| `archived_at` | iso8601/null | no | |

Rules:

- `planned_end` must not be before `planned_start`.
- `actual_end` must not be before `actual_start`.
- `price_gross = price_net + round(price_net * vat_rate_bp / 10000)`.
- A job may have at most one active lead assignment.
- A job may have one live invoice (`status != VOID`).

### 8.8 `job_assignments`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `job_id` | uuid | yes | |
| `user_id` | uuid | yes | field-capable user |
| `is_lead` | boolean | yes | exactly one active lead per job |
| `assigned_at` | iso8601 | yes | |
| `assigned_by` | uuid | yes | |
| `removed_at` | iso8601/null | no | soft removal |

Rules:

- `user_id` must satisfy `can_engineer && status === "ACTIVE"`.
- `(job_id, user_id)` may have only one active assignment (`removed_at: null`).
- Every active lead change writes an assignment event and an audit row.
- Historical assignments remain after removal; "assigned at the time" is reconstructable.

### 8.9 `job_events`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `job_id` | uuid | yes | |
| `actor_user_id` | uuid | yes | |
| `type` | enum | yes | `STATUS_CHANGE`, `ASSIGNMENT`, `SCHEDULE_CHANGE`, `NOTE`, `DOCUMENT`, `PRICE_CHANGE`, `CREATED`, `ARCHIVED` |
| `from_value` | string/null | no | |
| `to_value` | string/null | no | |
| `message` | string | no | plain text |
| `visibility` | enum | yes | `INTERNAL`, `CUSTOMER` |
| `at` | iso8601 | yes | |

Append-only. The customer timeline includes only `visibility: CUSTOMER`. Internal notes and
price changes are internal unless explicitly published as a customer note.

### 8.10 `invoices`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `company_id` | uuid | yes | |
| `number` | string | yes | `INV-YYYY-NNNN`, gapless, unique |
| `job_id` | uuid | yes | |
| `status` | enum | yes | `DRAFT`, `ISSUED`, `PAID`, `VOID` |
| `issued_at` | iso8601/null | no | required when `ISSUED`/`PAID` |
| `due_at` | iso8601/null | no | issued + company due days |
| `paid_at` | iso8601/null | no | required when `PAID` |
| `net` | int | yes | pence |
| `vat_rate_bp` | int | yes | |
| `vat` | int | yes | derived |
| `gross` | int | yes | derived |
| `lines` | array | yes | see below |
| `notes` | string | no | |
| `created_by` | uuid | yes | |
| `created_at` | iso8601 | yes | |
| `voided_at` | iso8601/null | no | |
| `void_reason` | string/null | no | |

Invoice line:

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | yes | |
| `qty` | number | yes | positive, up to 3 decimals |
| `unit_pence` | int | yes | |
| `amount_pence` | int | yes | `round(qty * unit_pence)` |

Rules:

- `net` must equal the sum of line `amount_pence`.
- `vat = round(net * vat_rate_bp / 10000)`; `gross = net + vat`.
- Number allocation happens inside the invoice transaction; voiding keeps the number.
- One job has at most one invoice with `status != VOID`. Re-issue = void old + create new.
- `ISSUED`/`PAID` invoices are customer-visible; `DRAFT` is not.

### 8.11 `documents`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `type` | enum | yes | `JOB_SHEET`, `INVOICE` |
| `entity_type` | enum | yes | `JOB`, `INVOICE` |
| `entity_id` | uuid | yes | |
| `version` | int | yes | increments per generation |
| `generated_at` | iso8601 | yes | |
| `generated_by` | uuid | yes | |
| `file_path` | string | yes | server-controlled, never from user input |
| `checksum` | string | yes | SHA-256 of the file |
| `size_bytes` | int | yes | |
| `mime` | string | yes | `application/pdf` |

No stale cache: every download regenerates from live data and appends a new document row.
The previous file remains for audit; retention can prune old versions later.

### 8.12 `settings`

| Field | Type | Required | Notes |
|---|---|---|---|
| `key` | string | yes | PK, e.g. `company.vat_rate_bp` |
| `value` | JSON | yes | scalar/object validated by setting key |
| `updated_at` | iso8601 | yes | |
| `updated_by` | uuid | yes | |

Required keys: `company.vat_rate_bp`, `company.invoice_due_days`, `company.default_theme`,
`company.pdf_footer`, `security.password_min_length`, `security.session_idle_minutes`.

### 8.13 `sessions` (separate file)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id_hash` | string | yes | SHA-256 of the cookie value; never store the raw token |
| `user_id` | uuid | yes | |
| `csrf_token` | string | yes | random, per session |
| `created_at` | iso8601 | yes | |
| `last_seen_at` | iso8601 | yes | persisted at most once per minute |
| `expires_at` | iso8601 | yes | |
| `ip` | string | no | for logs |
| `user_agent` | string | no | for logs |
| `revoked_at` | iso8601/null | no | |

### 8.14 `audit_log`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `company_id` | uuid | yes | |
| `actor_user_id` | uuid/null | no | null for failed anonymous sign-in |
| `action` | string | yes | e.g. `permission.update` |
| `entity_type` | string | yes | `JOB`, `USER`, `INVOICE`, `PERMISSION`, `SETTING`, `AUTH` |
| `entity_id` | string/null | no | |
| `before` | JSON/null | no | changed fields only, redacted |
| `after` | JSON/null | no | changed fields only, redacted |
| `at` | iso8601 | yes | |
| `ip` | string | no | |
| `user_agent` | string | no | |
| `request_id` | string | no | correlates with logs |

Append-only. Never store password hashes, raw session tokens, CSRF tokens or full request
bodies.

### 8.15 Relationships

```
Company 1─n User           Company 1─n Customer 1─n Job n─n User (assignments)
Company 1─n Job            Job 1─n JobEvent        Job 1─0..1 Invoice
Role    1─n User           Role 1─n Permission     Job 1─n Document
Customer 1─0..1 User (portal login)
Invoice 1─n Document
```

---

## 9. Authentication and sessions

### 9.1 Sign-in

`POST /signin` accepts `email`, `password`, `_csrf`, optional `next`.

1. Normalise email; rate-limit by IP + email.
2. Find an active user. A missing user and a wrong password produce the same generic error.
3. Compare with bcrypt. On failure: audit `auth.signin.failed`, increment limiter, re-render
   the sign-in form with a plain-language message.
4. On success: rotate the session ID, clear the old session, set `last_login_at`, audit
   `auth.signin.success`.
5. If `must_change_password`, redirect to `/account/password` and allow only password change,
   sign-out and static assets until it is cleared.
6. Otherwise redirect to `next` if it is a safe same-origin path, else to the role landing
   page: ADMIN/MANAGER → `/dashboard/operations`; ENGINEER → `/my-jobs`;
   CUSTOMER → `/portal/jobs`.

### 9.2 Session lifecycle

- Cookie name: `jms_sid` in development; `__Host-jms_sid` in production.
- Value: 32 random bytes, base64url. The store holds only its SHA-256 hash.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production.
- Idle expiry 60 minutes (configurable). `expires_at` slides on activity; persistence is
  throttled to once per minute.
- Absolute expiry 12 hours from sign-in.
- Sign-out deletes/revokes the session and clears the cookie.
- Password change, role change, deactivation or archive revokes all sessions for the user.
- A revoked or expired cookie redirects to sign-in with an explanation; the original form
  state is not promised.

### 9.3 Password rules

- Hash with bcrypt cost 12.
- Minimum 10 characters, at least one letter and one digit; maximum 200 characters.
- Reject the user's email, display name and `JMS123` as a new password.
- `DEFAULT_PASSWORD` is only for invites/seed and always sets `must_change_password`.
- Password change requires the current password (unless the account is in forced-change
  mode, where the session already proves the default password).
- Password hashes are never logged, rendered or audited.

### 9.4 First sign-in / change password

- `/account/password` is available to every authenticated user.
- Forced-change mode is a middleware gate: any other page redirects there.
- Success clears `must_change_password`, revokes all other sessions, keeps the current
  session (with a rotated ID), audits `auth.password.change`.

### 9.5 Rate limiting

In-memory sliding window, single process:

| Scope | Limit | Window | Action |
|---|---|---|---|
| Sign-in by IP + email | 5 failures | 15 min | block 15 min |
| Sign-in by IP | 20 failures | 15 min | block 15 min |
| Password reset by user | 3 | 60 min | block |
| Search | 60 requests | 1 min | 429 with retry hint |

Limiter keys are cleaned up on a timer. Successful sign-in clears the email key.

### 9.6 Password reset and invites

- Staff with `user.reset.password` can issue a new temporary password. It is displayed once,
  stored hashed, and sets `must_change_password`.
- `customer.invite` creates or repairs a CUSTOMER login for a customer record: default
  password, `INVITED`, `must_change_password`, audit.
- No email delivery in v1; the screen states the temporary password and asks staff to pass
  it on securely.

---

## 10. Authorization

### 10.1 Middleware order

```js
app.use(requestId);
app.use(securityHeaders);
app.use(compression());
app.use(staticAssets);
app.use(cookieParser);
app.use(loadSession);
app.use(loadUser);
app.use(csrfProtection);
app.use(flash);
app.use(routeGuards);
app.use(routes);
app.use(errorHandler);
```

`loadSession` never trusts a user ID from a cookie. `loadUser` re-reads the user on every
request so role/permission changes take effect immediately.

### 10.2 Action keys and default matrix

The canonical keys and defaults. `allowed` is seeded into `permissions`; an Admin can
toggle the non-safeguarded cells later.

| Area | Action key | Allowed roles by default |
|---|---|---|
| Customers | `customer.view.all` | ADMIN, MANAGER |
| Customers | `customer.view.own` | ADMIN, MANAGER, ENGINEER, CUSTOMER |
| Customers | `customer.create` | ADMIN, MANAGER |
| Customers | `customer.edit` | ADMIN, MANAGER |
| Customers | `customer.invite` | ADMIN, MANAGER |
| Customers | `customer.archive` | ADMIN |
| Jobs | `job.view.all` | ADMIN, MANAGER |
| Jobs | `job.view.assigned` | ADMIN, MANAGER, ENGINEER |
| Jobs | `job.view.own` | ADMIN, MANAGER, CUSTOMER |
| Jobs | `job.create` | ADMIN, MANAGER |
| Jobs | `job.edit` | ADMIN, MANAGER |
| Jobs | `job.assign` | ADMIN, MANAGER |
| Jobs | `job.schedule` | ADMIN, MANAGER |
| Jobs | `job.status.advance` | ADMIN, MANAGER, ENGINEER |
| Jobs | `job.status.override` | ADMIN, MANAGER |
| Jobs | `job.note.add` | ADMIN, MANAGER, ENGINEER |
| Jobs | `job.cancel` | ADMIN, MANAGER |
| Jobs | `job.archive` | ADMIN |
| Users | `user.view` | ADMIN |
| Users | `user.create` | ADMIN |
| Users | `user.edit.role` | ADMIN |
| Users | `user.reset.password` | ADMIN, MANAGER |
| Users | `user.deactivate` | ADMIN |
| Invoices | `invoice.view.all` | ADMIN, MANAGER |
| Invoices | `invoice.view.own` | ADMIN, MANAGER, CUSTOMER |
| Invoices | `invoice.create` | ADMIN, MANAGER |
| Invoices | `invoice.issue` | ADMIN, MANAGER |
| Invoices | `invoice.mark.paid` | ADMIN, MANAGER |
| Documents | `document.job.pdf` | ADMIN, MANAGER, ENGINEER, CUSTOMER |
| Documents | `document.invoice.pdf` | ADMIN, MANAGER, CUSTOMER |
| Insights | `insight.operational` | ADMIN, MANAGER |
| Insights | `insight.financial` | ADMIN, MANAGER |
| Insights | `insight.workload` | ADMIN, MANAGER |
| Insights | `insight.timeline` | ADMIN, MANAGER, ENGINEER |
| Admin | `admin.roles.manage` | ADMIN |
| Admin | `admin.permissions.edit` | ADMIN |
| Admin | `admin.settings.manage` | ADMIN |
| Admin | `admin.audit.view` | ADMIN |
| Admin | `admin.theme.default` | ADMIN |

`src/domain/permissions.js` exports `ACTION_KEYS`, `DEFAULT_MATRIX` and `can(user, key)`.
The same matrix drives navigation, buttons, route guards and tests.

### 10.3 Object-level scoping

These are code invariants, not permission cells.

**Customer scope**

- A CUSTOMER user has exactly one `customer_id`.
- Every job query adds `job.customer_id === user.customer_id`.
- Direct access to another customer's job, invoice or document returns 404.
- Customer responses use a customer presenter that removes `price_net`, `price_gross`,
  `internal_notes`, internal events, other customers and engineer phone numbers.

**Engineer scope**

- An ENGINEER sees jobs with an active assignment (`removed_at: null`) plus jobs they
  completed in the last 90 days.
- Direct access to another engineer's job returns 404.
- Engineer responses remove price, invoice and internal-note fields.
- A field-capable MANAGER assigned to a job gets the same field affordances, but their
  role also grants broader visibility.

**Manager/Admin scope**

- See all jobs, customers, invoices and insights.
- Admin-only areas remain gated by the admin action keys.

**Customer records for engineers**

- `customer.view.own` for an ENGINEER means the customer record of a job they are
  assigned to, including phone (needed on site), but not other customers and not exports.

### 10.4 UI visibility is not enforcement

- `res.locals.can` is a function bound to the current user.
- Nav pills and buttons render only when `can` is true.
- Every route and every HTMX partial repeats the check server-side.
- Hidden fields never carry role, owner or permission decisions.
- A permission change applies on the next request because the matrix is read from the store
  and the user is reloaded per request.

### 10.5 Safeguards the matrix cannot remove

1. At least one ACTIVE ADMIN must exist at all times.
2. The last Admin cannot remove their own `admin.permissions.edit`, deactivate themselves
   or change their own role.
3. `admin.audit.view` cannot be granted to CUSTOMER or ENGINEER; the save endpoint rejects
   it with a validation error and an explanation.
4. Every matrix edit writes an audit row with role, action key, before and after.
5. System roles cannot be deleted or renamed in v1.

These are enforced in `services/permissions.js`, not only in the UI.

---

## 11. Domain services and rules

### 11.1 Status machine

| From | Allowed next | Who may enter | Guards / side effects |
|---|---|---|---|
| `DRAFT` | `SCHEDULED`, `CANCELLED` | Manager/Admin | leaving DRAFT needs planned dates and ≥1 field-capable assignment |
| `SCHEDULED` | `IN_PROGRESS`, `ON_HOLD`, `CANCELLED`, `SCHEDULED` | Manager/Admin; assigned field user for `IN_PROGRESS` | reschedule stays SCHEDULED and writes a schedule event |
| `IN_PROGRESS` | `COMPLETED`, `ON_HOLD` | assigned field user, Manager/Admin | stamps `actual_start` on entry if blank |
| `ON_HOLD` | `IN_PROGRESS`, `CANCELLED` | assigned field user for `IN_PROGRESS`; Manager/Admin for `CANCELLED` | reason note required |
| `COMPLETED` | `INVOICED`, `IN_PROGRESS` | Manager/Admin | stamps `actual_end`; reopen needs override |
| `INVOICED` | `PAID`, `COMPLETED` | Manager/Admin | `PAID` only via invoice paid; `COMPLETED` only after void |
| `PAID` | — | — | terminal |
| `CANCELLED` | — | — | terminal |

`INVOICED` and `PAID` are **not** selectable in the generic status control. The invoice
service performs those transitions so an invoice always exists.

### 11.2 Transition algorithm

`src/domain/status.js` exports:

```js
canTransition({ user, job, to, action }) -> { ok, code, message }
```

Checks in order:

1. `to` is in the transition table for `job.status`.
2. The user has `job.status.override`, or is an assigned field-capable user taking one of
   the forward field transitions (`SCHEDULED → IN_PROGRESS`, `IN_PROGRESS → COMPLETED`,
   `IN_PROGRESS → ON_HOLD`, `ON_HOLD → IN_PROGRESS`).
3. DRAFT exit guards are met.
4. Required note/reason is present where the transition demands it.
5. The target is not invoice-controlled (`INVOICED`, `PAID`).

On success, in one transaction: update job, stamp actual timestamps, append `JobEvent`,
append audit row. Return the updated job.

### 11.3 Assignments

- Only field-capable active users may be assigned.
- The assign screen shows active ENGINEERs and field-capable MANAGERs.
- Saving replaces the active assignment set: new rows inserted, removed rows get
  `removed_at` (never deleted), lead changes recorded.
- At most one active lead. If the lead is removed, the manager must choose a new lead or
  the save is rejected with a clear message.
- Assignment changes append `ASSIGNMENT` events and audit rows. A newly assigned field user
  sees the job immediately under My jobs.
- Removing an engineer from a `SCHEDULED` job is allowed but shows a warning if it would
  leave no active assignee while dates are set.

### 11.4 Scheduling and conflicts

`POST /jobs/:id/schedule` accepts `planned_start`, `planned_end`, `planned_slot`.

- Validate start/end and timezone conversion.
- Find overlapping active assignments for each selected field user where the other job is
  `SCHEDULED`, `IN_PROGRESS` or `ON_HOLD` and its planned range overlaps.
- Conflicts are advisory: return a warning naming the engineer and the clashing job. The
  form offers **Save anyway**; the save records a `SCHEDULE_CHANGE` event mentioning the
  accepted conflict.
- Rescheduling a SCHEDULED job keeps the status SCHEDULED and writes an event; it does not
  use the status endpoint.
- Leaving DRAFT is offered once dates and an assignee exist; the UI defaults to yes.

### 11.5 References and numbering

- Job reference: `JOB-${year}-${String(seq).padStart(4, "0")}`, year from the company-local
  creation date.
- Invoice number: `INV-${year}-${String(seq).padStart(4, "0")}`.
- Sequences live in `_meta.sequences.job[year]` and `_meta.sequences.invoice[year]` and are
  incremented inside the creating transaction.
- Invoice numbers are gapless: voiding keeps the number, re-issuing takes the next one.
- References are immutable after creation.
- Duplicate references are impossible because allocation and insert share one transaction.

### 11.6 Notes and visibility

- `internal_notes` is a single internal field on the job and is never rendered to
  customers or engineers? — Engineers may see operational internal notes required for the
  work, but not pricing notes. In v1, engineers see internal notes; customers never do.
- `customer_notes` is customer-visible.
- Timeline notes choose `INTERNAL` or `CUSTOMER` visibility; the UI labels the choice
  plainly and never defaults to customer-visible.
- A note is plain text; line breaks are preserved, HTML is escaped.

### 11.7 Invoices

- Create from a COMPLETED job or from the invoice list with a job selector.
- Default lines from the job title and `price_net`; manager can edit lines.
- Save as DRAFT, then preview the PDF, then Issue.
- Issue: allocate number if not already allocated, set `issued_at`, `due_at` from company
  terms, set invoice `ISSUED`, set job `INVOICED`, write events/audit.
- Mark paid: `ISSUED → PAID`, stamp `paid_at`, set job `PAID`, event/audit.
- Void: `ISSUED → VOID`, stamp reason, set job back to `COMPLETED`, keep number and record.
- Re-issue after void creates a new DRAFT with the next number.
- Financial views use invoice net for invoiced and paid amounts.

### 11.8 Documents and PDFs

- Job sheet and invoice PDFs are generated on demand by `services/documents.js`.
- Every generation appends a `documents` row with version, checksum, size and path.
- The file path is derived from the document ID, never from user input.
- A missing file is regenerated; a stale file is never served by a cached URL.
- Access rules are evaluated before generation, not after.

### 11.9 Archive and audit

- Archive job/customer sets `archived_at`; it disappears from normal lists but remains
  searchable by admins in the archive view.
- Restore clears `archived_at`.
- Delete is not exposed for jobs, customers or invoices.
- Every state change in §16.3 writes an audit row in the same transaction.

---

## 12. Routes

All paths below are relative to the app root. `A/M/E/C` mean ADMIN/MANAGER/ENGINEER/CUSTOMER.
A route guard is mandatory even when an object check also exists.

### 12.1 Public and account

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/healthz` | liveness + data file check | public |
| GET | `/signin` | sign-in form | public |
| POST | `/signin` | authenticate | public, rate-limited |
| POST | `/signout` | revoke session | authenticated |
| GET | `/account/password` | change password form | authenticated |
| POST | `/account/password` | save password | authenticated |
| GET | `/account/appearance` | Aa panel page | authenticated |
| POST | `/account/appearance` | save theme prefs | authenticated |
| GET | `/` | redirect to role landing | authenticated |

### 12.2 Dashboards

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/dashboard/operations` | today, week, exceptions | `insight.operational` |
| GET | `/dashboard/engineer` | today's jobs, next 7 days | field-capable + `job.view.assigned` |
| GET | `/my-jobs` | assigned jobs, today first | `job.view.assigned` + field-capable |
| GET | `/portal/jobs` | customer's own jobs | `job.view.own` + CUSTOMER scope |

### 12.3 Jobs

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/jobs` | all jobs, filters | `job.view.all` |
| GET | `/jobs/new` | create form | `job.create` |
| POST | `/jobs` | create job | `job.create` |
| GET | `/jobs/:id` | job detail + timeline | `job.view.all` or field-assigned scope (staff route; customers use `/portal/jobs/:id`) |
| GET | `/jobs/:id/edit` | edit form | `job.edit` |
| POST | `/jobs/:id` | save job | `job.edit` |
| GET | `/jobs/:id/assign` | assignment screen | `job.assign` |
| POST | `/jobs/:id/assign` | save assignments | `job.assign` |
| GET | `/jobs/:id/schedule` | schedule screen | `job.schedule` |
| POST | `/jobs/:id/schedule` | save schedule | `job.schedule` |
| POST | `/jobs/:id/status` | transition status | `job.status.advance` / `job.status.override` + transition guard |
| POST | `/jobs/:id/notes` | add timeline note | `job.note.add` |
| POST | `/jobs/:id/cancel` | cancel with reason | `job.cancel` |
| POST | `/jobs/:id/archive` | archive | `job.archive` |
| GET | `/jobs/:id/documents` | generated documents | `document.job.pdf` + (`job.view.all` or field-assigned scope) |
| GET | `/jobs/:id/job-sheet.pdf` | download/generate job sheet | `document.job.pdf` + (`job.view.all` or field-assigned scope) |
| GET | `/jobs/:id/timeline` | HTMX timeline fragment | scoped job view |

### 12.4 Customers

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/customers` | list/search | `customer.view.all` |
| GET | `/customers/new` | create form | `customer.create` |
| POST | `/customers` | create customer + optional login | `customer.create` |
| GET | `/customers/:id` | detail, jobs, logins | `customer.view.all` |
| GET | `/customers/:id/edit` | edit form | `customer.edit` |
| POST | `/customers/:id` | save customer | `customer.edit` |
| POST | `/customers/:id/invite` | create/reset portal login | `customer.invite` |
| POST | `/customers/:id/archive` | archive | `customer.archive` |

### 12.5 Invoices

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/invoices` | list/filter/totals | `invoice.view.all` |
| GET | `/invoices/new` | create form, optional `job_id` | `invoice.create` |
| POST | `/invoices` | create draft | `invoice.create` |
| GET | `/invoices/:id` | detail + PDF preview | `invoice.view.all` (staff route; customers use `/portal/invoices/:id`) |
| POST | `/invoices/:id/issue` | issue | `invoice.issue` |
| POST | `/invoices/:id/void` | void with reason | `invoice.issue` |
| POST | `/invoices/:id/paid` | mark paid | `invoice.mark.paid` |
| GET | `/invoices/:id/pdf` | download/generate invoice PDF | `document.invoice.pdf` + `invoice.view.all` (customers use portal) |

### 12.6 Customer portal

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/portal/jobs` | own jobs | `job.view.own` + CUSTOMER |
| GET | `/portal/jobs/:id` | own job detail | `job.view.own` + CUSTOMER scope |
| GET | `/portal/jobs/:id/job-sheet.pdf` | own job sheet | `document.job.pdf` + CUSTOMER scope |
| GET | `/portal/invoices` | own issued/paid/void invoices | `invoice.view.own` + CUSTOMER |
| GET | `/portal/invoices/:id` | own invoice detail | `invoice.view.own` + CUSTOMER scope |
| GET | `/portal/invoices/:id/pdf` | own invoice PDF | `document.invoice.pdf` + CUSTOMER scope |

### 12.7 Insights and search

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/insights/timeline` | week/month planned jobs | `insight.timeline` |
| GET | `/insights/workload` | jobs per field user | `insight.workload` |
| GET | `/insights/financials` | quoted/invoiced/paid | `insight.financial` |
| GET | `/insights/needs-invoicing` | completed jobs without live invoice | `insight.operational` + `invoice.create` |
| GET | `/search` | grouped global search | scoped by role |
| GET | `/search/partial` | search fragment | scoped by role |

### 12.8 Admin

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/admin/users` | user list | `user.view` |
| GET | `/admin/users/new` | create user form | `user.create` |
| POST | `/admin/users` | create user | `user.create` |
| GET | `/admin/users/:id` | user detail | `user.view` |
| POST | `/admin/users/:id/role` | change role / `can_engineer` | `user.edit.role` |
| POST | `/admin/users/:id/reset-password` | temporary password | `user.reset.password` |
| POST | `/admin/users/:id/deactivate` | suspend/archive | `user.deactivate` |
| GET | `/admin/roles` | role × action matrix | `admin.roles.manage` |
| POST | `/admin/roles/permissions` | save matrix changes | `admin.permissions.edit` |
| GET | `/admin/settings` | company settings form | `admin.settings.manage` |
| POST | `/admin/settings` | save settings | `admin.settings.manage` |
| GET | `/admin/audit` | filterable audit list | `admin.audit.view` |
| GET | `/admin/archive` | archived jobs/customers | `job.archive` |
| POST | `/admin/archive/:type/:id/restore` | restore | `job.archive` / `customer.archive` |

### 12.9 HTMX partials

| Method | Path | Fragment |
|---|---|---|
| GET | `/partials/jobs/list` | job table/cards |
| GET | `/partials/jobs/:id/status` | allowed status control |
| GET | `/partials/jobs/:id/timeline` | event timeline |
| GET | `/partials/customers/list` | customer list |
| GET | `/partials/invoices/list` | invoice list |
| GET | `/partials/users/list` | user list |
| GET | `/partials/insights/timeline` | timeline rows |
| GET | `/partials/insights/workload` | workload rows |
| GET | `/partials/insights/financials` | financial summary |
| GET | `/partials/search` | grouped search results |
| POST | `/partials/account/appearance` | save theme, return panel state |

Every partial repeats the same guard and scope as its full page.

### 12.10 Controller pattern

```js
router.post(
  "/jobs/:id/status",
  requirePermission("job.status.advance"),
  asyncHandler(async (req, res) => {
    const job = await jobs.getVisibleOr404(req.user, req.params.id);
    const result = await jobs.transition({ user: req.user, job, ...req.body });
    if (req.isHtmx) return res.render("partials/jobs/status.njk", result);
    setFlash(req, "success", "Job status updated.");
    return res.redirect(`/jobs/${job.id}`);
  }),
);
```

Controllers stay thin: parse, guard, call service, render/redirect. Business rules live in
services/domain modules and are independently testable.

---

## 13. Templates and UI

### 13.1 Template inventory

| Area | Templates |
|---|---|
| Layouts | `layouts/app.njk`, `layouts/auth.njk`, `layouts/print.njk` |
| Auth | `pages/auth/signin.njk`, `pages/auth/password.njk` |
| Dashboards | `pages/dashboard/operations.njk`, `engineer.njk`, `portal.njk` |
| Jobs | `list.njk`, `detail.njk`, `form.njk`, `assign.njk`, `schedule.njk` |
| Customers | `list.njk`, `detail.njk`, `form.njk` |
| Invoices | `list.njk`, `detail.njk`, `form.njk` |
| Portal | `portal/jobs.njk`, `portal/job.njk`, `portal/invoices.njk`, `portal/invoice.njk` |
| Insights | `timeline.njk`, `workload.njk`, `financials.njk`, `needs-invoicing.njk` |
| Admin | `users/list.njk`, `users/detail.njk`, `roles.njk`, `settings.njk`, `audit.njk`, `archive.njk` |
| Account | `appearance.njk` |
| Partial macros | `macros/pill.njk`, `status.njk`, `field.njk`, `button.njk`, `table.njk`, `timeline.njk`, `empty.njk`, `flash.njk`, `pagination.njk`, `aa-panel.njk` |

### 13.2 Layout and shared context

`app.njk` renders:

- top bar: brand, global search, `Dashboard`, `Jobs`, `Customers`, `Insights`, `Admin`
  (only when the user has any admin permission), user menu;
- left TOC: grouped pills filtered by `can()`;
- content: page title, breadcrumb, one primary action, flash region, content block;
- Aa panel include and theme boot script.

`res.locals` provides `user`, `can`, `csrfToken`, `flash`, `currentPath`, `navGroups`,
`theme`, `company`, `formatMoney`, `formatDate`, `formatDateTime`.

### 13.3 Navigation rules

- Top bar contains only the fixed few items from the plan.
- Left TOC entries are generated from a declarative nav definition; each entry has
  `label`, `href`, `actionKey` and optional `scope`.
- A CUSTOMER sees only portal entries: My jobs, My invoices, Documents, Appearance.
- An ENGINEER sees My jobs, Timeline, Appearance.
- A field-capable MANAGER sees manager entries plus My jobs.
- An ADMIN sees everything plus Admin.
- Active state comes from the path prefix. Pills are large, 48px high, with a visible focus
  ring.

### 13.4 Forms

- Single column, labels above fields, no placeholder-only labels.
- Every form has a hidden CSRF field.
- Required fields marked with text, not only an asterisk.
- Field errors appear next to the field and in a summary at the top; focus goes to the
  first invalid field.
- Values survive a validation failure.
- Primary action is a 48px button; secondary actions are quieter pills.
- Destructive actions show a confirmation naming the record and its reference.
- No client-only validation is trusted.

### 13.5 Status control

- Shows only transitions the current user may take.
- Full-width button row on mobile; thumb-reachable.
- Each button names the outcome (`Start job`, `Complete job`, `Put on hold`), not the status
  code.
- The status pill always shows word + colour, never colour alone.
- `INVOICED`/`PAID` never appear as manual status buttons.
- After an HTMX transition, replace the status block and timeline, and announce the change
  with `aria-live="polite"`.

### 13.6 Lists, tables and mobile

- Lists use semantic tables on wide screens and stacked cards under 720px.
- Tables scroll inside their own wrapper, never the page.
- Pagination is visible when there are more than 25 rows.
- Empty state: one sentence saying what would appear plus the create action if permitted.
- Status pills use text + colour token.

### 13.7 Theme and Aa panel

- `public/css/tokens.css` defines one set of CSS custom properties for light and dark.
- App defaults: `--fs-content: 20px`, `--fs-ui: 17px`, line-height 1.55. This satisfies
  plan U1 (18–20px body text) while the documentation theme uses 25px for long-form
  reading. The same token names are used everywhere.
- `theme-boot.js` applies the user's saved theme before first paint, from a JSON data block
  rendered into the page. Resolution order: user prefs → company default → built-in.
- `appearance.js` implements System/Light/Dark, type size, line height, layout width,
  font stacks and colour tokens. Changes preview live; Save posts to the server.
- Font selections are curated `<select>` options; an unknown saved stack appears as
  `Custom`.
- Reset restores company defaults; Copy TOML exports values using the same key names as
  `jms_theme.toml`.
- The panel is hidden in print and on small screens; it never changes permissions or
  content.
- No per-page CSS forks. Page-specific overrides are scoped classes, not new palettes.

### 13.8 Empty, error and edge states

- Empty list: explanation + permitted create action.
- Permission denied: plain explanation + "back to my work" link.
- Not found/archived: say the record exists but is archived, with reference, if allowed.
- Save success: inline confirmation near the action; changed values visible.
- Validation: field-level plain language, preserved input, focus on first error.
- Session expiry: sign-in with explanation; no raw error.
- No JS: full-page forms and links still work.
- Slow request: busy state within 300ms; no double submit.

### 13.9 Accessibility implementation

- Landmarks: `header`, `nav`, `main`, `aside`; skip link to main.
- Every interactive element is a real button/link with keyboard access and visible focus.
- Hit areas at least 44×44px; primary buttons 48px high.
- Focus management on HTMX swaps: keep focus on the triggering control or move it to the
  updated status region with an accessible announcement.
- `aria-current="page"` on the active nav pill; `aria-live` for status changes and flash.
- Contrast meets WCAG 2.2 AA in both themes; tokens are checked with a contrast script in
  CI.
- Reduced motion honoured; no animation is required to understand a change.
- Dates always include weekday, day, month, year and time where relevant:
  `Tue 17 Mar 2026, 09:00`.
- Language is plain and active; jargon belongs only in admin screens.

### 13.10 Print

- `print.css` hides top bar, TOC, filters, Aa panel and actions.
- Job sheet and invoice print on A4 with page numbers.
- Customer-facing print output excludes internal notes and prices where the screen does.
- Print styles are shared with the PDF layout tokens (same fonts, colours, spacing scale).

---

## 14. PDF generation

### 14.1 Job sheet

Contents:

- company name, address, logo, VAT number if present;
- job reference, status as words, priority;
- customer and site address;
- work type, title, description;
- assigned engineers (names, lead marker);
- planned dates and slot;
- customer-visible notes;
- generation timestamp and page number.

Rules:

- A4 portrait; printable in monochrome.
- No internal notes.
- No prices for CUSTOMER/ENGINEER downloads.
- Manager/Admin downloads may include the price block.

### 14.2 Invoice

Contents:

- company header/logo and VAT number;
- `INVOICE` title, number, issue and due dates;
- customer and site address, job reference;
- line items: description, qty, unit, amount;
- net, VAT, gross;
- payment terms and company PDF footer;
- `VOID` watermark when voided;
- page numbers.

Rules:

- A4 portrait; gapless number displayed.
- Customer download allowed only for `ISSUED`/`PAID`/`VOID`; `DRAFT` is staff-only.
- Voided invoices remain downloadable by staff and show the watermark.

### 14.3 Generation flow

`services/documents.js`:

```js
async function generateJobSheet({ user, job, requestId }) {
  const visible = presentJobForPdf(user, job);  // removes forbidden fields
  const doc = await documents.createRecord({ type: "JOB_SHEET", entityType: "JOB", ... });
  await renderJobSheetPdf({ doc, data: visible });  // writes storage/documents/{id}.pdf
  await documents.finalise(doc);                    // checksum, size, audit
  return doc;
}
```

- Output path: `storage/documents/{document_id}.pdf`.
- Stream to a temp file, then rename; never leave partial files.
- SHA-256 checksum and size recorded.
- A download served by document ID re-checks permission and entity scope every time.
- If the file is missing, regenerate and update the document row; if generation fails,
  return a friendly error and log the request ID.
- No long-lived signed URLs; access is session-based.

### 14.4 Layout tokens

PDF layout uses the same house tokens as the app print styles:

- A4: 595.28 × 841.89 pt; margins 48pt.
- Serif for headings, sans for body, mono for references.
- Terracotta accent for rules and labels, but safe in grayscale.
- Footer: company name, page `n of m`, generation timestamp.
- Logo is optional; a missing logo must not fail generation.

### 14.5 Tests

- Generated buffer starts with `%PDF`.
- `pdf-parse` text contains the reference, customer name and total.
- Customer job-sheet text never contains internal notes or price words.
- Customer invoice download is blocked for DRAFT and allowed after ISSUE.
- Void invoice contains `VOID`.
- Document row has a checksum that matches the file.

---

## 15. Seed data

### 15.1 Command and determinism

```bash
npm run seed          # create data/jms.json if absent
npm run seed:force    # replace existing data (after backup)
```

- `SEED=20260316` by default.
- Use a documented PRNG (mulberry32) seeded with the numeric seed; all choices must be
  reproducible.
- `SEED_NOW = 2026-03-16T08:00:00.000Z`.
- Seeding writes one transaction; it either produces the complete dataset or nothing.
- The script prints counts and fails if any acceptance check in §15.7 fails.
- Seed users share a precomputed bcrypt hash of `JMS123` (cost 12) to keep seeding fast;
  all are `must_change_password: true`. Real provisioning hashes per user.

### 15.2 Staff accounts

All staff are `ACTIVE`, role as below, default password `JMS123`.

| # | Display name | Email | Role | `can_engineer` |
|---|---|---|---|---|
| 1 | Alex Morgan | `admin@acme.example` | ADMIN | false |
| 2 | Priya Shah | `admin2@acme.example` | ADMIN | false |
| 3 | Morgan Lee | `manager@acme.example` | MANAGER | true |
| 4 | Rita Patel | `manager2@acme.example` | MANAGER | true |
| 5 | Dan Walker | `engineer1@acme.example` | ENGINEER | true |
| 6 | Sam Okafor | `engineer2@acme.example` | ENGINEER | true |
| 7 | Luis García | `engineer3@acme.example` | ENGINEER | true |
| 8 | Hannah Brooks | `engineer4@acme.example` | ENGINEER | true |
| 9 | Tomasz Nowak | `engineer5@acme.example` | ENGINEER | true |
| 10 | Aisha Khan | `engineer6@acme.example` | ENGINEER | true |
| 11 | Ben Carter | `engineer7@acme.example` | ENGINEER | true |
| 12 | Grace Miller | `engineer8@acme.example` | ENGINEER | true |

Phones use fictional UK ranges (`07700 9000xx`). The two managers are the "managers who can
be engineers"; the assignment picker must include them.

### 15.3 Customer accounts

Each customer gets a CUSTOMER login with the same email, `status: ACTIVE`, `INVITED`-style
forced password change, and `customer_id` pointing at the record.

| # | Customer | Contact | Email | Phone | Address |
|---|---|---|---|---|---|
| 1 | Meadow House Ltd | Elaine Foster | `customer1@example.com` | 0161 555 0101 | 12 Meadow Lane, Didsbury, Manchester M20 2AB |
| 2 | Northgate Dental | Dr James Hill | `customer2@example.com` | 0161 555 0102 | 4 Northgate, Stockport SK1 1AA |
| 3 | Willow Court Management | Susan Reed | `customer3@example.com` | 0161 555 0103 | Willow Court, 88 Wilmslow Road, Manchester M14 5TP |
| 4 | Brookside School | Mark Evans | `customer4@example.com` | 0161 555 0104 | Brookside School, 2 Brook Street, Altrincham WA14 1AA |
| 5 | Harbour View Flats | Nina Patel | `customer5@example.com` | 0161 555 0105 | 19 Harbour View, Salford M50 3UB |
| 6 | Orchard Barn | Tom Whitfield | `customer6@example.com` | 0161 555 0106 | Orchard Barn, Church Lane, Wilmslow SK9 1AA |
| 7 | Kingsway Hotel | Chloe Adams | `customer7@example.com` | 0161 555 0107 | 120 Kingsway, Manchester M19 2AA |
| 8 | Fernhill Surgery | Dr A. Rahman | `customer8@example.com` | 0161 555 0108 | Fernhill Surgery, 7 Fern Road, Stockport SK2 2BB |
| 9 | Regent Street Offices | Laura Green | `customer9@example.com` | 0161 555 0109 | 44 Regent Street, Manchester M1 2AB |
| 10 | Stonebridge Villa | Peter Jones | `customer10@example.com` | 0161 555 0110 | Stonebridge Villa, 3 Stonebridge Lane, Cheshire SK8 3AA |

### 15.4 Jobs

For each customer, draw a job count of 1–4 from the seeded PRNG **before** drawing job
fields. With `SEED=20260316` and the algorithm in this section, the reference counts are
`[3, 4, 2, 1, 3, 4, 3, 2, 2, 2]`, giving **26 jobs**.

For each job:

1. Reference: allocate `JOB-2026-NNNN` in sequence.
2. Work type: weighted `WINDOW_INSTALL` 50%, `REPAIR` 35%, `SURVEY` 15%.
3. Title: pick a matching title from a fixed table.
4. Description: 1–2 sentences built from the work type and customer name.
5. Priority: 15% `URGENT`, else `NORMAL`.
6. Status: force the first eight jobs to cover all eight statuses exactly once (in the
   order DRAFT, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED, INVOICED, PAID, CANCELLED);
   remaining jobs use weights SCHEDULED 35%, COMPLETED 25%, IN_PROGRESS 15%, PAID 10%,
   INVOICED 10%, ON_HOLD 5%.
7. Planned dates:
   - DRAFT: `planned_start`/`planned_end` null.
   - SCHEDULED/IN_PROGRESS/ON_HOLD: within 7 days before to 21 days after `SEED_NOW`.
   - COMPLETED/INVOICED/PAID/CANCELLED: 14–60 days before `SEED_NOW`.
   - Duration 0 (same-day) or 1 day; slot AM/PM/ALL_DAY.
8. Actual dates: IN_PROGRESS has `actual_start`; COMPLETED/INVOICED/PAID have both.
9. Price: net £450–£6,500 in pence; VAT 20%; gross derived.
10. Notes: some jobs get an internal note and a separate customer-visible note.
11. Create a `CREATED` event, plus a `STATUS_CHANGE` event for the current status.
12. Archive: none in seed.

Fixed title pools:

- WINDOW_INSTALL: "Replace casement windows", "Install bay window", "Fit French doors",
  "Replace bedroom windows", "Install sliding sash windows".
- REPAIR: "Repair failed sealed unit", "Replace broken hinge", "Fix draughty window",
  "Replace window handle and lock", "Repair conservatory roof glazing".
- SURVEY: "Site survey for window replacement", "Measure for conservatory glazing",
  "Survey for door replacement".

### 15.5 Assignments

- Field-capable pool = 8 ENGINEERs + 2 field-capable MANAGERs (10 users).
- For every job, choose 1–2 distinct users from the pool using the seeded PRNG.
- The first chosen is lead; the rest are non-lead.
- Assignment dates: `created_at` plus a small deterministic offset.
- A field-capable manager may appear as lead or member, proving the `can_engineer` path.
- Do not assign to the same user twice on one job.
- Every assignment writes an `ASSIGNMENT` event.

### 15.6 Events, invoices and documents

- Jobs with `INVOICED` or `PAID` get one invoice:
  - `INVOICED`: status ISSUED, issued 1–10 days before `SEED_NOW`, due +14 days.
  - `PAID`: status PAID, issued 15–45 days before `SEED_NOW`, paid 1–10 days after issue.
  - Number allocation is sequential in job creation order.
  - Invoice net equals the job net; one line with the job title and amount.
- `CANCELLED` jobs get a cancellation event with a reason.
- No PDFs are pre-generated in seed; first download creates the document row and file.
- No audit rows for seed provisioning except a single `seed.create` row; seeded records are
  demo data, not user actions.

### 15.7 Acceptance checks

The seed script must assert:

- ☐ exactly 2 ADMIN users, 2 MANAGER users, 8 ENGINEER users, 10 CUSTOMER users;
- ☐ both managers have `can_engineer: true`;
- ☐ exactly 10 customer records, each with one CUSTOMER login;
- ☐ exactly 26 jobs for the reference seed, each customer having 1–4 jobs;
- ☐ every job has at least one active assignment from the field-capable pool;
- ☐ every assignment user satisfies `can_engineer && ACTIVE`;
- ☐ at least one job in each of the eight statuses;
- ☐ every INVOICED/PAID job has exactly one live invoice; PAID has `paid_at`;
- ☐ invoice numbers are unique and gapless for the year;
- ☐ all default accounts have `must_change_password: true`;
- ☐ `_meta.sequences.job["2026"]` equals the number of jobs;
- ☐ no record references a missing foreign key.

---

## 16. Security and audit

### 16.1 Headers and transport

- Helmet with:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self';
    img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self';
    frame-ancestors 'none'; form-action 'self'; base-uri 'self'`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
    `X-Frame-Options: DENY`.
- HTTPS terminates at the reverse proxy in production; `TRUST_PROXY` is enabled only then.
- Cookies are `Secure` in production. No secrets in URLs.

### 16.2 Input and output

- Validate every request body/query with Zod; reject unknown fields.
- Escape all output; notes are plain text.
- No dynamic `require`, no `eval`, no shell commands with user input.
- PDF file paths come from generated document IDs only.
- Uploads are not part of v1.
- Rate limits cover sign-in, password reset and search.

### 16.3 Audit events

Every mutation writes an audit row in the same transaction. Required actions:

`auth.signin.success`, `auth.signin.failed`, `auth.signout`, `auth.password.change`,
`user.create`, `user.update.role`, `user.reset.password`, `user.deactivate`,
`permission.update`, `customer.create`, `customer.update`, `customer.invite`,
`customer.archive`, `customer.restore`, `job.create`, `job.update`, `job.assign`,
`job.schedule`, `job.status.change`, `job.note.add`, `job.cancel`, `job.archive`,
`job.restore`, `invoice.create`, `invoice.issue`, `invoice.void`, `invoice.paid`,
`document.generate`, `settings.update`, `theme.default.update`.

Audit `before`/`after` contains only changed fields and never secrets. Permission edits
record `role_key`, `action_key`, `before`, `after`.

### 16.4 Logging

- Pino JSON to stdout; request ID on every line.
- Log method, path, status, duration, user ID (if signed in) and error code.
- Redact cookies, `authorization`, `password`, `_csrf`, session IDs, tokens.
- Do not log request bodies or personal notes.
- Error logs include stack traces; client responses do not.

### 16.5 Backups

- `npm run backup` copies `data/jms.json` and `data/sessions.json` to
  `backups/jms-YYYYMMDD-HHmmss/`.
- Keep 30 daily backups by default; pruning is configurable.
- The backup script verifies JSON parseability and checksums.
- A restore drill is required before go-live and recorded in the ops log.

### 16.6 Threat tests

Automated tests must cover:

- cross-customer job/invoice/document access returns 404;
- cross-engineer job access returns 404;
- missing/invalid CSRF is rejected;
- hidden role/owner fields cannot escalate or reassign;
- last-admin safeguards reject demotion/deactivation/permission removal;
- `admin.audit.view` cannot be granted to CUSTOMER or ENGINEER;
- session revocation after password change/role change/deactivation;
- login rate limiting;
- malformed JSON/store corruption refuses startup safely;
- no price/internal-note leakage in customer/engineer HTML or PDF.

---

## 17. Testing

### 17.1 Test setup

- `tests/helpers/app.js` builds the Express app with a temporary `DATA_FILE` and
  `SESSION_FILE`, runs the seed builder with a fixed clock, and returns a Supertest agent.
- Each test file creates its own temp directory; cleanup removes it.
- No network access. Fonts/HTMX are local fixtures.
- `npm test` runs all `*.test.js` with the Node test runner.

### 17.2 Unit tests

| Module | Tests |
|---|---|
| `db/store` | insert/update/transaction rollback, atomic write, concurrent writers, migration, corruption |
| `domain/status` | every allowed/denied transition and guard |
| `domain/permissions` | matrix defaults, safeguards, `can()` |
| `domain/references` | year rollover, gapless invoice numbers |
| `domain/money` | VAT rounding, line totals, no floats |
| `services/jobs` | assignment validation, conflict detection, scoping |
| `services/invoices` | issue/void/paid/re-issue, one live invoice |
| `services/documents` | checksum, version, regeneration |

### 17.3 HTTP and workflow tests

For each workflow W1–W10, one end-to-end HTTP test:

- W1: create customer + login; duplicate email explains the existing record.
- W2: create job; reference allocated; DRAFT.
- W3: assign engineers + dates; DRAFT→SCHEDULED; conflict warning appears.
- W4: engineer signs in, sees only own jobs, starts/completes; forbidden transition
  rejected.
- W5: completed job → invoice → issue → paid; PDFs downloadable.
- W6: customer sees only own job/invoice/document; guessed URL returns 404.
- W7: job sheet/invoice PDFs generated from live data; no internal notes/prices for
  customers.
- W8: admin toggles a permission; nav pill and route effect change on next request; audit
  row written; safeguards hold.
- W9: user changes appearance; prefs persist across sessions; company default applies.
- W10: search/timeline/workload/financials respect role scope and date ranges.

### 17.4 Permission matrix test

A generated test iterates every role × action key × representative route:

- allowed → not 403;
- denied → 403 or 404 according to scope rules;
- nav markup contains the pill only when allowed.

This test is the primary defence against a hidden button being the only control.

### 17.5 Seed test

Asserts every check in §15.7, plus idempotent `seed:force` with a backup.

### 17.6 Accessibility and performance

- Automated: `axe-core` in a Playwright smoke suite for sign-in, jobs list, job detail,
  portal and appearance panel; fail on serious/critical.
- Manual: keyboard-only walkthrough, 200% zoom, 360px viewport, light/dark contrast.
- Performance: request p95 < 300ms on the seed dataset; list queries use indexes; no
  N+1 rendering; response size under 500KB for normal pages.

### 17.7 CI order

```bash
npm ci
npm run lint
npm test
```

A separate `npm run test:a11y` runs the Playwright suite where browsers are available.

---

## 18. Operations

### 18.1 Local development

```bash
cp .env.example .env
npm ci
npm run seed
npm run dev
# http://localhost:3000
```

Sign in with `admin@acme.example` / `JMS123`; the app forces a password change, then lands
on the operations dashboard.

### 18.2 Production

- One Node process behind a reverse proxy (Caddy/Nginx) with HTTPS.
- Persistent volume for `data/`, `storage/` and `backups/`.
- `NODE_ENV=production`, `COOKIE_SECURE=true`, strong `SESSION_SECRET`, `TRUST_PROXY=true`.
- Run `npm ci --omit=dev`, `npm run seed` only on first deploy, then `npm start`.
- Health check: `GET /healthz` returns `200 {"status":"ok","db":"ok","version":"…"}`.
- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, finish in-flight requests,
  persist pending store writes, close the store, exit.
- No horizontal scaling against one JSON file. A future SQL adapter can lift this.

### 18.3 Backup and restore drill

1. `npm run backup` while the app is running.
2. Stop the app.
3. Move `data/jms.json` aside; restore the backup file.
4. `npm start`; verify sign-in, a job, an invoice and an audit row.
5. Record date, backup name, verifier and result.

### 18.4 Performance budgets

| Area | Budget |
|---|---|
| Page p95 | < 300ms |
| JSON write | < 50ms for the v1 dataset |
| Seed | < 10s |
| PDF generation | < 2s per document |
| List page | 25 rows default |
| Search | < 100ms for 100 jobs |

### 18.5 Observability

- Structured logs for requests, errors and slow operations (> 500ms).
- In-app audit view for admins.
- No external monitoring required for v1; a log drain is recommended.
- Error responses show the request ID so a log line can be found.

---

## 19. Implementation order

Each phase is a demonstrable vertical slice. Do not start a phase before its dependencies
are green.

| Phase | Build | Acceptance |
|---|---|---|
| **T0** | Scaffold, config, logging, health, JSON store, schemas, seed skeleton | `npm test` runs; `/healthz` returns ok; empty store boots |
| **T1** | Auth, sessions, CSRF, password change, roles/permissions seed, app shell, nav | Four seeded roles sign in; denied routes are friendly; matrix hides pills |
| **T2** | Customers CRUD, invite login, users admin, company settings | W1 and user admin work; duplicate emails explained; audit rows written |
| **T3** | Jobs CRUD, references, detail, assignments, scheduling, conflict warning, list filters | W2/W3 work; DRAFT exit guards enforced; `can_engineer` managers assignable |
| **T4** | My jobs, status control, actual timestamps, notes, timeline | W4 works on a phone; forbidden transitions rejected; timeline renders |
| **T5** | Customer portal, scoped queries, portal invoices/documents | W6 works; guessed cross-customer URLs return 404 |
| **T6** | Invoices, numbering, issue/void/paid, job sheet/invoice PDFs, print CSS | W5/W7 work; numbering gapless; PDFs pass content tests |
| **T7** | Search, dashboards, timeline, workload, financials | W10 works; all views respect scope and dates |
| **T8** | Full audit view, archive/restore, appearance panel, backups, seed polish | Matrix editable and audited; theme persists; restore drill passes |
| **T9** | Accessibility/performance pass, help pages, final docs | §17 green; §12 checklist from the plan met |

### 19.1 Definition of done

- ☐ All `_PLAN.md` §12 checklist items pass.
- ☐ All §10 action keys have server enforcement and tests.
- ☐ Cross-customer and cross-engineer access tests fail closed with 404.
- ☐ JSON store writes are atomic, backed up and restorable.
- ☐ Seed produces the exact counts in §15.7.
- ☐ Job sheet and invoice PDFs contain the right fields and no forbidden data.
- ☐ Light/dark/system themes persist per user; company default applies.
- ☐ 360px layout, keyboard walkthrough and WCAG AA contrast pass.
- ☐ `_PLAN.html` and `_TECH.html` build from Markdown with no PDF step.

---

## 20. Traceability and open questions

### 20.1 Plan to technical spec

| `_PLAN.md` | Implemented in |
|---|---|
| §1 goals, non-goals | §1, §19 |
| §2 roles, permissions, safeguards | §8.3–8.5, §10 |
| §3 domain model, status machine | §8, §11.1–11.2 |
| §4 workflows W1–W10 | §12, §17.3 |
| §5 screens/navigation | §13.1–13.3 |
| §6 UX/accessibility | §13.4–13.10 |
| §7 visual system/Aa panel | §13.7 |
| §8 PDF requirements | §14 |
| §9 security/audit | §16 |
| §10 non-functional | §7, §18 |
| §11 milestones | §19 |
| §12 definition of done | §19.1 |
| §13 decisions | §1.2, §1.3, §20.2 |

### 20.2 Open questions for build sign-off

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Should engineers see internal job notes? | Yes, operational notes only; never pricing. |
| Q2 | Should a manager with `can_engineer` see the customer price on their assigned job? | Yes, because the MANAGER role already grants price visibility. |
| Q3 | Should COMPLETED require a completion note? | Ask for it in the UI; keep it optional. |
| Q4 | Should customer portal show VOID invoices? | Yes, with the VOID state, for transparency. |
| Q5 | Should archive restore be Admin-only? | Yes, via `job.archive` / `customer.archive`. |
| Q6 | Should PDFs be retained forever? | Keep all versions for v1; add pruning later. |
| Q7 | Should sessions survive a server restart? | Yes, via `data/sessions.json`; revoke expired on boot. |
| Q8 | Should the JSON store use one file or one per collection? | One domain file plus one sessions file; simpler transactions. |
