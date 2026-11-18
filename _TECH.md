# JMS — Technical Specification

> **What this is.** The implementation contract for JMS v1. It turns `_PLAN.md` into a
> browser application: a TypeScript Node service, HTMX-rendered templates, a SQLite
> database with typed repositories, server-side authorisation, PDF job sheets/invoices,
> a reproducible seed dataset and verified, scheduled backups.
>
> **Status.** Draft v0.2.0 — ready to build. `_PLAN.md` remains the product authority;
> this document is the engineering authority. Where the two differ, §1.3 records the
> change explicitly.
>
> **Documentation rule.** `_PLAN.md`, `_TECH.md` and help pages are HTML-only. Markdown is
> converted to HTML or authored directly. The application itself does generate PDF job
> sheets and invoices.

---

## 1. Scope, decisions and conventions

### 1.1 What v1 builds

A single deployable TypeScript web application for Acme Windows that provides:

- sign-in, first-sign-in password change, sessions and server-side authorisation;
- an editable role × action permission matrix;
- customers, customer portal logins, jobs, assignments, scheduling and status tracking;
- a customer portal limited to the customer's own jobs, updates and documents;
- invoices with gapless numbering and server-generated PDFs;
- global search, operations/engineer dashboards, timeline, workload and financial views;
- an admin area for users, roles, permissions, company settings, themes and audit;
- a SQLite database accessed only through typed repositories, with forward-only
  migrations, integrity checks and online backups;
- a cron-driven backup routine that produces verified snapshots, enforces retention and
  can be restored by one documented command.

### 1.2 Fixed technical decisions

| # | Decision | Choice |
|---|---|---|
| D13 | Language | TypeScript 5.9+, `strict` plus every extra safety flag (§3.2) |
| D14 | Server runtime | Node.js 22 LTS, ES modules, one process, compiled with `tsc` |
| D15 | HTTP framework | Express 5.1 (native async error propagation) |
| D16 | Templates | Nunjucks, server-rendered HTML, typed view models |
| D17 | Interactivity | HTMX 2, vendored locally; no SPA, no CDN at runtime |
| D18 | Database | SQLite via `better-sqlite3`, WAL journal, foreign keys on |
| D19 | Query layer | Kysely with a typed `DB` schema; no SQL in routes or services |
| D20 | Migrations | Numbered SQL files, checksummed, forward-only, transactional |
| D21 | Password hashing | Argon2id via `@node-rs/argon2` (prebuilt, memory-hard) |
| D22 | Validation | Zod schemas at every boundary: env, HTTP, DB rows, settings JSON, PDF input |
| D23 | Dates/timezone | Luxon; store UTC ISO 8601; display `Europe/London` |
| D24 | Money | integer pence; VAT as integer basis points; quantities as integer thousandths |
| D25 | PDF engine | PDFKit, server-side, A4 |
| D26 | Logging | Pino structured JSON logs, request IDs, redaction |
| D27 | Tests | Vitest + Supertest + `fast-check`; HTTP-level workflow tests |
| D28 | Managers as engineers | `user.can_engineer = true` capability on MANAGER accounts |
| D29 | Seed data | 2 admins, 2 managers (field-capable), 8 engineers, 10 customers, 20 jobs (2 each) scheduled over the next 6 weeks |
| D30 | Backups | Online SQLite backup + integrity verification + GFS retention, run by cron |
| D31 | Docs build | Markdown → HTML only; no PDF build for docs |

### 1.3 Deliberate changes from `_PLAN.md`

| Plan reference | Change | Reason |
|---|---|---|
| §10 N3 | v1 uses SQLite directly instead of a JSON document store | User decision; relational constraints, transactions and online backups are required |
| §2.1 | Managers may be field-capable via `can_engineer` | User decision; they keep the MANAGER role and may be assigned to jobs |
| §10 N6 | Seed is 2 admins / 2 managers / 8 engineers / 10 customers / 20 jobs over the next 6 weeks | User decision; replaces the earlier 1/2/5/20/60 seed and the earlier 1–4 jobs per customer |
| §11.2 | Documentation is HTML-only | Docs no longer need PDFs; product PDFs remain |
| §9 security | Argon2id replaces bcrypt; sessions and rate limits live in SQLite | Modern password hashing and restart-safe throttling |
| §7 data | Invoice lines are normalised, addresses are columns, quantities are integer thousandths | Avoid JSON blobs and floating-point totals |
| §10 non-functional | Backups are a scheduled, verified, monitored part of v1 | User decision; a single SQLite file is a single point of loss |

Everything else follows `_PLAN.md`, including the action keys in §10.2, the invariants in
§10.3, the status machine in §11.1, the UX rules in §13 and the security rules in §16.

### 1.4 Data and code conventions

- **IDs:** UUID v4 strings generated with `crypto.randomUUID()`, branded at the type level
  (§1.5). SQL columns are `TEXT PRIMARY KEY`.
- **Timestamps:** UTC ISO 8601 strings (`2026-03-16T08:00:00.000Z`). Render in the company
  timezone. Never store local-time strings. ISO strings sort chronologically.
- **Dates:** business dates use `YYYY-MM-DD` only where a time is meaningless; invoice due
  dates are stored as instants and displayed locally.
- **Money:** integer minor units (`price_net: 425000` means £4,250.00).
- **VAT:** integer basis points (`vat_rate_bp: 2000` means 20.00%).
- **Percentages:** basis points unless stated otherwise.
- **Quantities:** integer thousandths (`qty_milli: 1500` means 1.500).
- **Emails:** lower-cased and trimmed before uniqueness checks; the database also uses
  `COLLATE NOCASE` for the unique indexes.
- **Soft deletion:** jobs and customers use `archived_at`; invoices use `VOID`; audit,
  events and migrations are append-only and never deleted.
- **Validation:** reject unknown fields on writes; coerce only form strings explicitly.
- **Escaping:** Nunjucks autoescape on. Notes are plain text, never HTML.
- **No secrets in code:** configuration comes from environment variables.
- **No `any`:** `unknown` at boundaries, Zod to narrow, `assertNever` for exhaustiveness.
- **No floating promises:** every promise is awaited, returned or explicitly voided with a
  comment; ESLint enforces this.

### 1.5 Robustness rules (non-negotiable)

These apply to every module, including scripts and tests.

1. **Parse, do not cast.** Data from HTTP, environment, SQLite, settings JSON and files is
   `unknown` and must pass a Zod schema before it is used. `as` is permitted only in
   brand constructors and migration adapters, each with a comment.
2. **Branded identifiers.** `UserId`, `CustomerId`, `JobId`, `InvoiceId` and `CompanyId`
   are branded strings. Mixing them is a compile error. Constructors validate UUID shape.
3. **Typed errors.** Expected failures return a discriminated `Result<T, DomainError>`;
   unexpected failures throw `AppError` subclasses with a stable `code` and HTTP `status`.
   Routes never format error text; the central handler does.
4. **Exhaustive unions.** Status, role and event enums are unions derived from `as const`
   arrays; every `switch` ends in `assertNever(value)`. The status transition table is
   `satisfies Record<JobStatus, ...>`, so a new status cannot be forgotten.
5. **One writer path.** All mutations go through a service and a repository inside a
   SQLite transaction. Controllers never issue queries; repositories never render.
6. **Optimistic concurrency.** Mutable records carry `version INTEGER NOT NULL DEFAULT 1`.
   Updates use `WHERE id = ? AND version = ?`; a zero-row update returns `409 CONFLICT`,
   never a silent overwrite.
7. **Idempotent mutations.** Every unsafe form carries a hidden `_idempotency` token.
   `idempotency_keys` records `(key, user_id, route)` inside the mutation transaction; a
   replay returns the recorded outcome instead of creating a second record.
8. **Transactions are short.** No PDF rendering, filesystem sync, network call or logging
   I/O happens inside a transaction. Long work is staged outside, then committed.
9. **Fail closed.** Missing permissions, missing records, malformed sessions and unknown
   scopes return the safe response. Startup refuses to serve on failed migration checks,
   failed integrity checks or a missing production secret.
10. **Atomic files.** Generated files are written to a temp name in the same directory,
    `fsync`ed, renamed, then checksum-verified. Partial files are never served.
11. **Tests prove the invariant.** Every rule in §16.6 and every backup rule in §17.11 has
    an automated test that fails if the rule is removed.
12. **Boring dependencies.** No runtime dependency without a maintained release, TypeScript
    types and a documented purpose in §3.1.

---

## 2. Architecture

### 2.1 Runtime shape

```
Browser (HTMX + progressive forms)
        │  HTTP, cookies, HTML fragments
        ▼
Express 5 app (TypeScript, compiled to dist/)
  ├─ middleware: request id, logging, security headers, sessions, CSRF, auth, permissions
  ├─ routes/controllers: parse (Zod), authorise, call services, render typed view models
  ├─ services: jobs, invoices, permissions, documents, audit — domain rules live here
  ├─ repositories: typed Kysely queries, row decoding, optimistic concurrency
  └─ templates: Nunjucks layouts, pages, partials, macros
        │
        ├─ data/jms.sqlite       domain + sessions + audit (one WAL database)
        ├─ storage/documents/    generated PDFs (regenerable, not authoritative)
        └─ backups/              verified snapshots, manifests, checksums
```

### 2.2 Layers and the dependency rule

Dependencies point inward only:

```
routes ──▶ services ──▶ repositories ──▶ db (Kysely)
   │           │             │
   └──▶ views  └──▶ domain   └──▶ contracts (Zod schemas + inferred types)
```

- `src/domain/` is pure: no Express, no SQL, no filesystem, no clock reads (time is passed
  in). It is unit-testable in isolation.
- `src/contracts/` holds Zod schemas and the types inferred from them. These are the only
  shared shapes between HTTP, services and persistence.
- `src/repositories/` owns SQL. It decodes rows with Zod into domain records and returns
  branded IDs. It never returns Kysely row types to callers.
- `src/services/` owns transactions and business rules. It returns `Result` values for
  expected failures and throws `AppError` only for infrastructure failures.
- `src/routes/` is thin: parse, guard, call, render/redirect.
- `src/views/` receives view models typed in `src/views/view-models.ts`; templates do not
  call services and do not query.

The dependency rule is enforced in CI by an import-boundary lint rule
(`eslint-plugin-import-x` with zone rules): routes may import services/contracts/domain;
services may not import routes or views; domain may import nothing but contracts and
utility modules; repositories may not import services.

### 2.3 Request lifecycle

1. Express assigns a request ID (or validates an incoming `X-Request-Id`) and starts a
   Pino child logger.
2. Security headers are set; static files are served with immutable cache headers.
3. The session cookie is read, its HMAC verified and its SHA-256 looked up. Idle and
   absolute expiry are checked in one query.
4. The authenticated user is loaded; deactivated/archived users have all sessions revoked
   and are signed out.
5. CSRF is verified for every unsafe method (`POST`, `PUT`, `PATCH`, `DELETE`) with a
   constant-time comparison.
6. The route guard runs `requirePermission(actionKey)`.
7. The controller parses the body/query with a Zod schema, rejecting unknown keys.
8. The controller calls a service, which applies object scoping, domain rules and
   optimistic concurrency.
9. The service writes domain changes, events and audit rows inside one transaction.
10. The controller renders a full page or an HTMX fragment and sets flash data.
11. The response is sent only after the transaction has committed. A failed commit is a
    `500` with the request ID; no in-memory state is left ahead of disk.

### 2.4 Process model and concurrency

- **One application process.** SQLite WAL allows safe concurrent backups and read-only
  inspection, but the in-process rate limiter, session throttling and single-writer
  assumptions make multiple app replicas unsupported in v1.
- A startup lock (`data/jms.lock`, PID + boot time) prevents an accidental second
  instance. Stale locks are removed only after checking the PID is dead or belongs to a
  different boot.
- SQLite is configured with `busy_timeout`; write transactions use `BEGIN IMMEDIATE` and a
  bounded retry for `SQLITE_BUSY`/`SQLITE_LOCKED` (§7.4).
- Cron backups run in a separate process against the same file using SQLite's online
  backup API. They do not stop the app and do not produce torn copies.
- `restore`, `migrate` and `seed --force` take an exclusive advisory lock (`flock` on
  `data/jms.ops.lock`) and refuse to run while the app is serving, unless `--offline` is
  explicitly confirmed.

---

## 3. Stack, dependencies and build

### 3.1 Dependencies

| Package | Purpose | Notes |
|---|---|---|
| `express` | HTTP routing, middleware | 5.1; async errors reach the handler |
| `nunjucks` | Server templates | autoescape; no async filters |
| `@node-rs/argon2` | Password hashing | Argon2id, prebuilt binaries, no compiler needed |
| `zod` | Boundary validation | env, HTTP, DB rows, settings, PDF input |
| `luxon` | Timezone-aware dates | `Europe/London` |
| `pdfkit` | Job sheet and invoice PDFs | A4, streamed to temp file |
| `helmet` | Security headers/CSP | local HTMX assets only |
| `compression` | Gzip/Brotli | static + HTML |
| `pino`, `pino-http` | Structured logs | request IDs, redaction |
| `cookie`, `cookie-signature` | Signed session cookie | raw token never stored |
| `better-sqlite3` | SQLite driver | synchronous, prepared statements, `.backup()` |
| `kysely` | Type-safe SQL builder | compiled SQL, parameters only |
| `commander` | CLI for migrate/seed/backup/restore/verify | stable exit codes |
| `htmx.org` | UI behaviour | vendored in `public/vendor/` |
| `tsx` (dev) | Run TypeScript directly in development | not used in production |
| `vitest` (dev) | Test runner, coverage | `@vitest/coverage-v8` |
| `supertest` (dev) | HTTP tests | app factory, no listening socket |
| `fast-check` (dev) | Property tests | money, quantities, transitions, backup naming |
| `pdf-parse` (dev) | Assert PDF text | no production dependency |
| `eslint`, `typescript-eslint` (dev) | Type-aware lint | flat config |
| `prettier` (dev) | Formatting | no semantic rewrites |
| `@types/*` (dev) | Types for Express, Nunjucks, better-sqlite3 | pinned |

No CDN is used at runtime. Static assets are served from `public/`. `npm ci` is the only
supported install for CI and production.

### 3.2 TypeScript configuration

`tsconfig.json` (base) and `tsconfig.build.json` (emits `dist/`) share these settings:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false,
    "sourceMap": true,
    "declaration": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"]
}
```

Rules that the compiler cannot express are enforced by ESLint:
`@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`,
`strict-boolean-expressions`, `switch-exhaustiveness-check`, `consistent-type-imports`,
`no-non-null-assertion` and `import-x/no-cycle`. A PR fails on any new violation; existing
violations are not grandfathered.

### 3.3 `package.json` scripts

```json
{
  "type": "module",
  "engines": { "node": ">=22.11" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json && node scripts/copy-assets.mjs",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check": "npm run typecheck && npm run lint && npm run test",
    "db:migrate": "node dist/cli/jms.js migrate",
    "db:check": "node dist/cli/jms.js check",
    "seed": "node dist/cli/jms.js seed",
    "seed:force": "node dist/cli/jms.js seed --force",
    "reset": "node dist/cli/jms.js reset --force",
    "backup": "node dist/cli/jms.js backup --tag manual",
    "backup:verify": "node dist/cli/jms.js verify --latest",
    "backup:prune": "node dist/cli/jms.js prune",
    "restore": "node dist/cli/jms.js restore"
  }
}
```

Development scripts use `tsx`; every operational command runs compiled JavaScript from
`dist/`. `scripts/copy-assets.mjs` copies `src/views` to `dist/views` and verifies that
`public/` exists.

### 3.4 Version policy

- `package-lock.json` is committed; production installs use `npm ci --omit=dev`.
- Node engines: `">=22.11"`. CI runs the current 22 LTS and the newest LTS.
- Dependency updates are deliberate commits; no automatic major upgrades.
- `better-sqlite3` is pinned to a minor range and tested against the SQLite version it
  bundles. The runtime reports the SQLite version in `/healthz`.
- Migrations are immutable once applied; a checksum mismatch is a startup failure.

---

## 4. Repository layout

```
JMS/
  _PLAN.md  _TECH.md  README.md
  docs.toml  jms_theme.toml
  skills/make-jms-html/
  package.json  package-lock.json
  tsconfig.json  tsconfig.build.json
  eslint.config.js  .prettierrc  vitest.config.ts
  .env.example  .gitignore
  data/
    jms.sqlite               # created by migrate/seed; ignored by git
    jms.sqlite-wal           # runtime; ignored
    jms.sqlite-shm           # runtime; ignored
    jms.lock                 # application single-instance lock
    jms.ops.lock             # flock target for backup/restore/migrate/seed
  backups/                   # ignored; verified snapshots + manifests
  storage/documents/         # ignored; generated PDFs
  ops/
    cron/jms-backup          # /etc/cron.d example
    systemd/jms.service
    systemd/jms-backup.service
    systemd/jms-backup.timer
  scripts/
    copy-assets.mjs
  src/
    server.ts                # listen, graceful shutdown
    app.ts                   # Express app factory (testable, no listen)
    config.ts                # env parsing + Zod validation, frozen config
    logger.ts
    errors.ts                # AppError hierarchy, Result helpers, assertNever
    db/
      connection.ts          # better-sqlite3 + pragmas + Kysely
      schema.ts              # Kysely DB interface (table types)
      transaction.ts         # immediate transaction + busy retry
      migrator.ts            # checksummed SQL migrations
      row-codecs.ts          # JSON/boolean/integer row decoding
      migrations/
        0001_init.sql
        0002_indexes.sql
    contracts/
      ids.ts                 # branded IDs and constructors
      common.ts              # Address, Money, IsoInstant, Pagination
      auth.ts  users.ts  customers.ts  jobs.ts  invoices.ts  settings.ts
    repositories/
      users.ts  sessions.ts  customers.ts  jobs.ts  assignments.ts
      events.ts  invoices.ts  documents.ts  audit.ts  permissions.ts
      settings.ts  sequences.ts  rate-limits.ts  idempotency.ts
    auth/
      passwords.ts
      sessions.ts
      csrf.ts
      rate-limit.ts
    domain/
      status.ts              # transition table + guards
      permissions.ts         # action keys, matrix defaults, can()
      references.ts          # JOB/INV numbering
      money.ts
      dates.ts
      scoping.ts
    services/
      users.ts  customers.ts  jobs.ts  invoices.ts  documents.ts
      dashboard.ts  audit.ts  settings.ts  search.ts
    routes/
      public.ts  account.ts  dashboards.ts  jobs.ts  customers.ts
      invoices.ts  portal.ts  insights.ts  admin.ts  search.ts  partials.ts
    middleware/
      request-id.ts  auth.ts  permissions.ts  csrf.ts  errors.ts
      htmx.ts  idempotency.ts  security.ts
    views/
      view-models.ts
      filters.ts
      layouts/app.njk  layouts/auth.njk  layouts/print.njk
      pages/…  partials/…  macros/…
    public/
      css/tokens.css  css/app.css  css/print.css
      js/app.js  js/appearance.js  js/theme-boot.js
      vendor/htmx.min.js
    cli/
      jms.ts                 # commander entry point, exit codes
      commands/migrate.ts  commands/seed.ts  commands/backup.ts
      commands/verify.ts   commands/prune.ts  commands/restore.ts
      commands/check.ts
    backup/
      snapshot.ts            # online backup, fsync, checksum, manifest
      verify.ts              # integrity + FK + restore-to-temp checks
      retention.ts           # GFS pruning
      lock.ts                # flock-style advisory lock
      manifest.ts            # Zod schema for backup manifests
  tests/
    helpers/  unit/  http/  workflows/  backup/
```

---

## 5. Configuration

### 5.1 Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test`, `production` |
| `PORT` | no | `3000` | HTTP port |
| `APP_URL` | production | `http://localhost:3000` | absolute links and cookie decisions |
| `SESSION_SECRET` | production | — | 32+ random bytes; HMACs session cookies |
| `DATABASE_FILE` | no | `data/jms.sqlite` | SQLite database path |
| `DOCUMENTS_DIR` | no | `storage/documents` | generated PDFs |
| `BACKUP_DIR` | no | `backups` | verified snapshots and manifests |
| `BACKUP_KEEP_DAILY` | no | `30` | daily snapshots retained |
| `BACKUP_KEEP_WEEKLY` | no | `12` | weekly snapshots retained |
| `BACKUP_KEEP_MONTHLY` | no | `12` | monthly snapshots retained |
| `BACKUP_MAX_AGE_HOURS` | no | `36` | `/healthz` degrades above this |
| `BACKUP_MIN_FREE_MB` | no | `512` | refuse a backup below this free space |
| `BACKUP_LOCK_FILE` | no | `data/jms.ops.lock` | advisory lock for cron and restore |
| `SESSION_IDLE_MINUTES` | no | `60` | inactivity expiry |
| `SESSION_ABSOLUTE_HOURS` | no | `12` | absolute session lifetime |
| `COOKIE_SECURE` | production | `true` in production | Secure cookie flag |
| `TRUST_PROXY` | no | `false` | set only behind a trusted proxy |
| `DEFAULT_PASSWORD` | no | `JMS123` | seed/invite starting password only |
| `COMPANY_TIMEZONE` | no | `Europe/London` | display timezone |
| `CURRENCY` | no | `GBP` | display currency |
| `VAT_RATE_BP` | no | `2000` | default VAT (20%) |
| `LOG_LEVEL` | no | `info` | pino level |
| `SEED` | no | `20260316` | deterministic seed value |
| `SEED_DATE` | no | UTC date at first seed | anchor date for the six-week job horizon (`YYYY-MM-DD`); tests pin it |
| `SQLITE_BUSY_TIMEOUT_MS` | no | `5000` | lock wait before failing a write |
| `SQLITE_SYNCHRONOUS` | no | `FULL` | `FULL` in production; `NORMAL` allowed in dev |
| `BACKUP_OFFSITE_CMD` | no | — | optional command run after a verified local backup |

`.env.example` documents every variable. `.env` is ignored. Production validation fails
startup if `SESSION_SECRET` is missing/weak, `COOKIE_SECURE` is false, `NODE_ENV` is not
`production`, the database path is not writable, or the backup directory is not writable.

### 5.2 Validation

`src/config.ts` parses `process.env` with a strict Zod object, applies defaults and exports
a deeply frozen `config` object. Unknown or malformed values abort startup with a single
error listing every problem. No module reads `process.env` directly except `config.ts`.
Tests inject a parsed config object into the app factory.

```ts
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SESSION_SECRET: z.string().min(32).optional(),
  DATABASE_FILE: z.string().min(1).default("data/jms.sqlite"),
  BACKUP_DIR: z.string().min(1).default("backups"),
  BACKUP_KEEP_DAILY: z.coerce.number().int().min(1).max(365).default(30),
  // …
}).strict();

export const config = Object.freeze(EnvSchema.parse(process.env));
```

### 5.3 Directories and boot checks

On boot the app:

1. ensures `data/`, `backups/` and `storage/documents/` exist and are writable;
2. opens SQLite read-write and applies pragmas (§7.1);
3. verifies the migration checksum table and refuses to start on a mismatch;
4. runs `PRAGMA quick_check` and `PRAGMA foreign_key_check`; failures are fatal and name
   the latest verified backup;
5. acquires the application lock and writes its PID;
6. starts the HTTP listener only after all checks pass.

A failed boot logs one structured line with the failing check, the database path and the
latest backup name. It never prints row contents or secrets.

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
| Optimistic concurrency conflict | `409` with a reload-and-retry explanation |
| Duplicate email/reference/idempotency replay | `409` or the stored prior response |
| Rate limited | `429` with `Retry-After` |
| Server error | `500` friendly page, request ID shown, details only logged |

### 6.2 HTMX rules

- The client sends `HX-Request: true`; the server exposes a typed `req.isHtmx` boolean.
- HTMX responses return a fragment, never a full document.
- Full-page forms are the baseline. Every create/edit form works without JavaScript.
- Lists, search, filters, status control and timeline refresh use HTMX.
- After a mutation, return the updated fragment and trigger a flash event.
- Set `HX-Redirect` only when a full navigation is genuinely needed.
- Disable submit buttons on submit (`app.js`); show an inline busy state within 300 ms.
- Never rely on client-side checks for authorisation or validation.

### 6.3 CSRF and flash

- A 32-byte random CSRF token is created per session and stored with the session row.
- Full forms include `<input type="hidden" name="_csrf" value="…">`.
- HTMX requests send `X-CSRF-Token` from a `<meta>` tag.
- Comparison uses `crypto.timingSafeEqual` on equal-length buffers.
- Missing/invalid token → `403`, no state change.
- Flash messages are stored in the session as `{ type, message }` and rendered once.

### 6.4 Errors and not-found behaviour

- Signed-in users never see a raw stack trace.
- Out-of-scope records return the friendly not-found page, not a 403, to avoid ID probing.
- A friendly 403 explains the missing permission and links to the user's landing screen.
- Validation errors re-render the form with values preserved and focus on the first error.
- Every error response carries `X-Request-Id`; the same ID appears in the log line.

### 6.5 Pagination, filtering and sorting

- Default page size 25; maximum 100.
- `?page=2&per_page=25`; invalid values fall back to defaults (Zod coercion, bounded).
- Sort/filter parameters are allow-listed per list; unknown keys are rejected with `400`.
- Search requires at least 2 characters.
- Lists show a count and the active filters as removable pills.
- All list queries are parameterised and capped by `LIMIT/OFFSET`; no unbounded scans.

### 6.6 Typed request context

`src/middleware/auth.ts` augments Express's `Request` with a narrow, non-optional context
after the guard runs:

```ts
declare global {
  namespace Express {
    interface Request {
      readonly id: string;
      readonly log: Logger;
      readonly isHtmx: boolean;
      readonly user?: AuthenticatedUser;
      readonly session?: SessionRecord;
      readonly csrfToken?: string;
    }
  }
}
```

Helpers `requireUser(req)` and `requireSession(req)` throw `AppError("AUTH_REQUIRED")` if
the middleware order was violated, so a route can never accidentally use
`req.user!`. Non-null assertions are lint errors.

---

## 7. SQLite database

### 7.1 File and pragmas

One database file holds domain data, sessions, rate limits, idempotency keys and audit. The
database is authoritative; generated PDFs are regenerable and are not part of the
consistency boundary.

`src/db/connection.ts` opens `better-sqlite3` and applies, in order:

```sql
PRAGMA journal_mode = WAL;          -- readers never block the writer
PRAGMA synchronous = FULL;          -- production; NORMAL allowed in dev only
PRAGMA foreign_keys = ON;           -- every FK enforced
PRAGMA busy_timeout = 5000;         -- wait, then fail with a typed error
PRAGMA trusted_schema = OFF;        -- no schema-embedded code
PRAGMA temp_store = MEMORY;         -- no temp files in the data directory
PRAGMA wal_autocheckpoint = 1000;   -- bound WAL growth
PRAGMA optimize;                    -- after migrations and on graceful shutdown
```

`journal_mode`, `synchronous` and `foreign_keys` are asserted at boot; a database that
cannot honour them refuses to open. `better-sqlite3` runs statements synchronously, so a
query cannot be interleaved with a half-applied transaction in the same process.

### 7.2 Schema conventions

- Every table has an explicit `PRIMARY KEY`; join tables use a composite primary key.
- Every foreign key declares `ON DELETE RESTRICT` (default) or `ON UPDATE CASCADE` only
  where documented. Nothing is `ON DELETE CASCADE` except `invoice_lines`, which belongs
  to its invoice and is deleted with it inside a transaction.
- Enumerations are `TEXT` with `CHECK (column IN (...))`, generated from the same constant
  arrays used by TypeScript.
- Every timestamp is `TEXT NOT NULL` ISO 8601 UTC; nullable timestamps are explicitly
  nullable. `CHECK` guards format where practical.
- Money is `INTEGER` with `CHECK (value >= 0)`; quantities are `INTEGER` thousandths.
- Booleans are `INTEGER NOT NULL CHECK (value IN (0,1))`.
- Uniqueness that is case-insensitive uses `COLLATE NOCASE` or a unique index on
  `lower(column)`.
- Mutable tables carry `version INTEGER NOT NULL DEFAULT 1`; updates increment it.
- Partial unique indexes express "at most one active" rules (lead assignment, live
  invoice).

### 7.3 Query layer

Kysely is configured with the `SqliteDialect` over the same `better-sqlite3` handle, so
pragmas and the online backup API use the raw driver while queries are typed.

```ts
export interface DB {
  companies: CompanyTable;
  users: UserTable;
  customers: CustomerTable;
  jobs: JobTable;
  job_assignments: JobAssignmentTable;
  job_events: JobEventTable;
  invoices: InvoiceTable;
  invoice_lines: InvoiceLineTable;
  documents: DocumentTable;
  settings: SettingTable;
  audit_log: AuditTable;
  sequences: SequenceTable;
  sessions: SessionTable;
  rate_limits: RateLimitTable;
  idempotency_keys: IdempotencyTable;
  schema_migrations: MigrationTable;
}
```

Rules:

- Routes and services never import Kysely or the driver; only repositories and the db
  module do.
- Queries are composed with the expression builder. Where an aggregate needs raw SQL, it
  uses Kysely's `sql` template with bound parameters; string interpolation of values is
  forbidden and linted.
- Every `select` lists columns explicitly; `selectAll()` is reserved for internal
  maintenance queries.
- Rows are decoded through `rowSchema.parse(row)` at the repository boundary, converting
  `0/1` to booleans and JSON text to parsed objects. A malformed row fails loudly with the
  table, column and record ID.
- Repository methods take and return domain types and branded IDs, never `unknown` rows.

### 7.4 Transactions, retries and isolation

`src/db/transaction.ts` exposes one write helper:

```ts
export function writeTx<T>(db: Database, fn: (tx: Kysely<DB>) => T): T {
  const run = db.transaction(() => fn(tx));
  return withBusyRetry(() => run.immediate(), { attempts: 5, baseDelayMs: 20 });
}
```

- Writes use `BEGIN IMMEDIATE`, acquiring the write lock before reading mutable state.
- Nested calls use `SAVEPOINT`/`RELEASE` via `better-sqlite3`'s transaction nesting; a
  service may compose repository calls inside one outer transaction.
- `withBusyRetry` retries only `SQLITE_BUSY` and `SQLITE_LOCKED`, with exponential backoff
  plus jitter, and gives up with `AppError("DB_BUSY", 503)`.
- Transactions never exceed 100 ms of work in the v1 dataset. Anything slower is staged
  outside the transaction and committed in a short second step.
- Reads use the Kysely handle directly; WAL gives them a consistent snapshot.

### 7.5 Migrations

Migrations are numbered SQL files applied in order:

```
src/db/migrations/0001_init.sql
src/db/migrations/0002_indexes.sql
```

The runner:

1. takes the ops lock (§17.3) and writes a pre-migration backup;
2. creates `schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL,
   checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`;
3. verifies every applied file's SHA-256 matches the recorded checksum — mismatch is fatal;
4. applies pending files each inside one transaction, recording version, name, checksum and
   timestamp, then sets `PRAGMA user_version`;
5. runs `PRAGMA foreign_key_check`, `PRAGMA quick_check` and `PRAGMA optimize`;
6. refuses to run if the app holds the live lock, unless `--offline` is passed.

Rules:

- Applied migrations are immutable. Fixes are new migrations.
- Migrations are forward-only. A down migration is not shipped; restoring a verified
  backup is the rollback path.
- `seed --force` and `reset` also require the ops lock and write a backup first.
- Boot compares `user_version` with the highest packaged migration and exits with a clear
  "run npm run db:migrate" message when they differ.

### 7.6 Repository contract

Each repository exports a factory receiving the db handle and returning an interface:

```ts
export interface JobsRepository {
  findById(id: JobId): Job | null;
  findVisibleTo(scope: JobScope, filter: JobFilter): Page<Job>;
  insert(input: NewJob, meta: WriteMeta): Job;
  update(input: UpdateJob, expectedVersion: number, meta: WriteMeta): Result<Job, Conflict>;
  setStatus(id: JobId, next: JobStatus, expectedVersion: number, meta: WriteMeta): Result<Job, Conflict>;
  addEvent(event: NewJobEvent): JobEvent;
}
```

- `WriteMeta` carries `actorUserId`, `requestId`, `ip`, `userAgent` and `now` (an injected
  clock). Repositories never call `Date.now()` directly.
- `update` throws/rejects with `Conflict` when `version` does not match; the service maps it
  to a `409` and a friendly reload message.
- Repository tests run against a migrated temp database, not mocks, so SQL constraints and
  indexes are exercised.

### 7.7 Indexes

Indexes are created in `0002_indexes.sql` and justified here:

| Index | Purpose |
|---|---|
| `users(email)` unique | sign-in lookup |
| `users(role_key, status)` | admin lists, field-capable pool |
| `users(customer_id)` unique where not null | one portal login per customer |
| `customers(company_id, name)` unique | duplicate-name rule |
| `customers(company_id, email)` unique | duplicate-email rule |
| `jobs(reference)` unique | references |
| `jobs(customer_id, status)` | customer and portal lists |
| `jobs(status, planned_start)` | dashboards, needs-invoicing |
| `job_assignments(job_id) WHERE removed_at IS NULL` | active assignments |
| `job_assignments(user_id, removed_at)` | My jobs |
| `job_assignments(job_id) UNIQUE WHERE is_lead = 1 AND removed_at IS NULL` | one active lead |
| `job_events(job_id, at)` | timeline |
| `invoices(number)` unique | gapless numbering |
| `invoices(job_id) UNIQUE WHERE status <> 'VOID'` | one live invoice per job |
| `invoice_lines(invoice_id, line_no)` unique | stable line order |
| `documents(entity_type, entity_id, version)` | document history |
| `audit_log(at)`, `audit_log(entity_type, entity_id)` | admin audit filters |
| `sessions(id_hash)` unique, `sessions(expires_at)` | session lookup and cleanup |
| `rate_limits(expires_at)` | purging |
| `idempotency_keys(created_at)` | pruning |

After migrations the runner executes `ANALYZE` once. Query plans for the list and dashboard
queries are asserted in tests with `EXPLAIN QUERY PLAN` and must use an index, not a full
scan of `jobs`/`audit_log`.

### 7.8 Integrity and health

`/healthz` performs cheap checks: `SELECT 1`, current `user_version`, WAL size and last
successful backup age. It returns `200` with `{status, db, schema, backup, version}` when
healthy and `503` when the database is unreadable or the last backup is older than
`BACKUP_MAX_AGE_HOURS`.

`jms check` runs the expensive checks: `PRAGMA integrity_check`, `PRAGMA foreign_key_check`,
migration checksums and a sample row decode per table. It is run nightly by cron after the
backup and before retention pruning.

---

## 8. Data model

### 8.1 Shared value objects

**Address** (stored as columns, not JSON)

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `line1` | `TEXT` | yes | 1–120 chars |
| `line2` | `TEXT` | no | 0–120 chars |
| `town` | `TEXT` | yes | 1–80 chars |
| `postcode` | `TEXT` | yes | 3–12 chars, upper-cased |
| `country` | `TEXT` | yes | ISO 3166-1 alpha-2, default `GB` |

**Money and quantities**

- `price_net`, `price_gross`, `unit_pence`, `amount_pence`, `net`, `vat`, `gross` are
  integer pence. Never floats.
- `vat_rate_bp` is integer basis points.
- `qty_milli` is integer thousandths. `amount_pence = Math.round(qty_milli * unit_pence /
  1000)` using integer math (`Math.round` on a safe integer).
- All monetary arithmetic is centralised in `src/domain/money.ts` and property-tested.

**Timestamps**

- `created_at`, `updated_at`, `at`, `issued_at`, `due_at`, `paid_at`, `voided_at`,
  `archived_at`, `assigned_at`, `removed_at`, `last_seen_at`, `expires_at` are ISO 8601 UTC
  `TEXT`.
- Validation rejects offsets other than `Z` and dates before 2000 or after 2100.

### 8.2 `schema_migrations`

| Field | SQL type | Constraints |
|---|---|---|
| `version` | `INTEGER` | PK |
| `name` | `TEXT` | not null |
| `checksum` | `TEXT` | not null, SHA-256 |
| `applied_at` | `TEXT` | not null |

### 8.3 `companies`

| Field | SQL type | Required | Constraints |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `name` | `TEXT` | yes | `Acme Windows` in seed |
| `trading_name` | `TEXT` | no | |
| `email` | `TEXT` | yes | valid email |
| `phone` | `TEXT` | yes | |
| `address_line1`, `address_line2`, `address_town`, `address_postcode`, `address_country` | `TEXT` | yes except line2 | §8.1 |
| `vat_number` | `TEXT` | no | |
| `logo_path` | `TEXT` | no | relative to `public/` |
| `currency` | `TEXT` | yes | `GBP` |
| `timezone` | `TEXT` | yes | IANA zone, `Europe/London` |
| `default_theme_json` | `TEXT` | yes | parsed by a Zod theme schema |
| `invoice_due_days` | `INTEGER` | yes | `CHECK BETWEEN 0 AND 365`, default 14 |
| `pdf_footer` | `TEXT` | yes | plain text |
| `version` | `INTEGER` | yes | default 1 |
| `created_at`, `updated_at` | `TEXT` | yes | |

### 8.4 `users`

| Field | SQL type | Required | Constraints |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `company_id` | `TEXT` | yes | FK company |
| `email` | `TEXT` | yes | lower-case, `UNIQUE COLLATE NOCASE` |
| `password_hash` | `TEXT` | yes | Argon2id PHC string |
| `display_name` | `TEXT` | yes | 1–120 |
| `role_key` | `TEXT` | yes | `CHECK IN ('ADMIN','MANAGER','ENGINEER','CUSTOMER')` |
| `customer_id` | `TEXT` | conditional | FK customer; required iff `role_key = 'CUSTOMER'` |
| `can_engineer` | `INTEGER` | yes | boolean |
| `phone` | `TEXT` | no | |
| `status` | `TEXT` | yes | `CHECK IN ('INVITED','ACTIVE','SUSPENDED','ARCHIVED')` |
| `must_change_password` | `INTEGER` | yes | boolean |
| `theme_prefs_json` | `TEXT` | no | user overrides, Zod-validated |
| `last_login_at` | `TEXT` | no | |
| `version` | `INTEGER` | yes | default 1 |
| `created_at`, `updated_at` | `TEXT` | yes | |

Table-level checks:

```sql
CHECK ((role_key = 'CUSTOMER' AND customer_id IS NOT NULL)
    OR (role_key <> 'CUSTOMER' AND customer_id IS NULL)),
CHECK ((role_key = 'ENGINEER' AND can_engineer = 1)
    OR role_key IN ('ADMIN','MANAGER','CUSTOMER')),
CHECK (role_key <> 'ADMIN' OR can_engineer = 0)
```

Rules:

- Email uniqueness is global within the company; lower-case before insert and again in the
  unique index.
- `CUSTOMER` users point at exactly one customer. No other role may set `customer_id`.
- `ENGINEER` users have `can_engineer: true`. `MANAGER` users may be seeded/edited to
  `can_engineer: true`. `ADMIN`/`CUSTOMER` users may not.
- A field-capable user has `can_engineer = 1` and `status = 'ACTIVE'`.
- Deactivation revokes all sessions and removes active assignments from future jobs but
  keeps historical assignments.

### 8.5 `roles`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `key` | `TEXT` | yes | PK: `ADMIN`, `MANAGER`, `ENGINEER`, `CUSTOMER` |
| `label` | `TEXT` | yes | display label |
| `description` | `TEXT` | yes | plain-language summary |
| `is_system` | `INTEGER` | yes | boolean; true for v1 roles |
| `sort_order` | `INTEGER` | yes | navigation order |

System roles cannot be created or deleted in v1; only their permissions are editable.

### 8.6 `permissions`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `role_key` | `TEXT` | yes | FK role, composite PK part |
| `action_key` | `TEXT` | yes | composite PK part |
| `allowed` | `INTEGER` | yes | boolean, default from §10.2 |
| `updated_at` | `TEXT` | yes | |
| `updated_by` | `TEXT` | yes | FK user |

Composite PK `(role_key, action_key)`. Every action key in §10.2 has a row for every role,
so the matrix is explicit rather than "missing means denied". Permission edits are audited
and the service refuses unsafe cells (§10.5).

### 8.7 `sessions`

Sessions live in SQLite, never in the DB file's JSON or in an unsigned cookie.

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id_hash` | `TEXT` | yes | PK; SHA-256 of the cookie token |
| `user_id` | `TEXT` | yes | FK user |
| `csrf_token` | `TEXT` | yes | random, per session |
| `created_at` | `TEXT` | yes | |
| `last_seen_at` | `TEXT` | yes | written at most once per minute |
| `expires_at` | `TEXT` | yes | idle expiry, slides |
| `absolute_expires_at` | `TEXT` | yes | fixed at sign-in + 12 h |
| `revoked_at` | `TEXT` | no | |
| `ip` | `TEXT` | no | logs only |
| `user_agent` | `TEXT` | no | logs only |

Indexes: unique `id_hash`, `user_id`, `expires_at`. Expired rows are deleted by a cleanup
query on sign-in and by the nightly maintenance job.

### 8.8 `customers`

| Field | SQL type | Required | Constraints |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `company_id` | `TEXT` | yes | FK company |
| `name` | `TEXT` | yes | `COLLATE NOCASE`; unique per company |
| `contact_name` | `TEXT` | yes | |
| `email` | `TEXT` | yes | unique per company, lower-case |
| `phone` | `TEXT` | yes | |
| `address_*` | `TEXT` | yes except line2 | §8.1 |
| `notes` | `TEXT` | no | internal only |
| `status` | `TEXT` | yes | `CHECK IN ('ACTIVE','ARCHIVED')` |
| `version` | `INTEGER` | yes | default 1 |
| `created_at`, `updated_at` | `TEXT` | yes | |
| `created_by` | `TEXT` | yes | FK user |
| `archived_at` | `TEXT` | no | |

Unique constraints: `(company_id, name)` and `(company_id, email)` both `COLLATE NOCASE`.
Archiving does not free the name/email; a restore or an explicit edit is required.

### 8.9 `jobs`

| Field | SQL type | Required | Constraints |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `company_id` | `TEXT` | yes | FK company |
| `reference` | `TEXT` | yes | `JOB-YYYY-NNNN`, unique |
| `customer_id` | `TEXT` | yes | FK customer |
| `title` | `TEXT` | yes | 1–140 chars |
| `description` | `TEXT` | yes | plain text |
| `work_type` | `TEXT` | yes | `CHECK IN ('WINDOW_INSTALL','REPAIR','SURVEY')` |
| `status` | `TEXT` | yes | §11.1, `CHECK IN (...)` |
| `priority` | `TEXT` | yes | `CHECK IN ('NORMAL','URGENT')` |
| `site_address_*` | `TEXT` | yes except line2 | defaults to customer address |
| `planned_start` | `TEXT` | conditional | required before leaving `DRAFT` |
| `planned_end` | `TEXT` | conditional | `CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)` |
| `planned_slot` | `TEXT` | yes | `CHECK IN ('AM','PM','ALL_DAY')` |
| `actual_start` | `TEXT` | no | stamped on `IN_PROGRESS` |
| `actual_end` | `TEXT` | no | stamped on `COMPLETED` |
| `price_net` | `INTEGER` | no | pence, `CHECK (price_net IS NULL OR price_net >= 0)`; manager/admin only |
| `vat_rate_bp` | `INTEGER` | yes | `CHECK BETWEEN 0 AND 10000`, default company VAT |
| `price_gross` | `INTEGER` | no | derived at write time |
| `internal_notes` | `TEXT` | no | never customer-visible |
| `customer_notes` | `TEXT` | no | customer-visible |
| `version` | `INTEGER` | yes | optimistic concurrency |
| `created_by` | `TEXT` | yes | FK user |
| `created_at`, `updated_at` | `TEXT` | yes | |
| `archived_at` | `TEXT` | no | |

Rules:

- `planned_end` must not be before `planned_start`.
- `actual_end` must not be before `actual_start` (validated in the service; SQL check is
  added once both columns exist).
- `price_gross = price_net + round(price_net * vat_rate_bp / 10000)`, computed in
  `domain/money.ts` and stored.
- A job has at most one active lead assignment and at most one live invoice (partial unique
  indexes).
- `reference` is immutable. The sequence row is incremented in the same transaction as the
  insert.

### 8.10 `job_assignments`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `job_id` | `TEXT` | yes | FK job |
| `user_id` | `TEXT` | yes | FK user, field-capable |
| `is_lead` | `INTEGER` | yes | boolean |
| `assigned_at` | `TEXT` | yes | |
| `assigned_by` | `TEXT` | yes | FK user |
| `removed_at` | `TEXT` | no | soft removal |

Indexes and rules:

- `UNIQUE (job_id, user_id) WHERE removed_at IS NULL` — one active row per pair.
- `UNIQUE (job_id) WHERE is_lead = 1 AND removed_at IS NULL` — one active lead.
- `user_id` must satisfy `can_engineer = 1 AND status = 'ACTIVE'`; the service re-checks
  inside the transaction because a user could be deactivated concurrently.
- Every active lead change writes an assignment event and an audit row.
- Historical assignments remain after removal; "assigned at the time" is reconstructable.

### 8.11 `job_events`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `job_id` | `TEXT` | yes | FK job |
| `actor_user_id` | `TEXT` | yes | FK user |
| `type` | `TEXT` | yes | `CHECK IN ('STATUS_CHANGE','ASSIGNMENT','SCHEDULE_CHANGE','NOTE','DOCUMENT','PRICE_CHANGE','CREATED','ARCHIVED')` |
| `from_value` | `TEXT` | no | |
| `to_value` | `TEXT` | no | |
| `message` | `TEXT` | no | plain text |
| `visibility` | `TEXT` | yes | `CHECK IN ('INTERNAL','CUSTOMER')` |
| `at` | `TEXT` | yes | |

Append-only: no update or delete methods exist. The customer timeline includes only
`visibility = 'CUSTOMER'`. Internal notes and price changes are internal unless explicitly
published as a customer note.

### 8.12 `invoices` and `invoice_lines`

`invoices`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `company_id` | `TEXT` | yes | FK company |
| `number` | `TEXT` | yes | `INV-YYYY-NNNN`, unique, gapless |
| `job_id` | `TEXT` | yes | FK job |
| `status` | `TEXT` | yes | `CHECK IN ('DRAFT','ISSUED','PAID','VOID')` |
| `issued_at` | `TEXT` | no | required when `ISSUED`/`PAID`/`VOID` |
| `due_at` | `TEXT` | no | issued + company due days |
| `paid_at` | `TEXT` | no | required when `PAID` |
| `net` | `INTEGER` | yes | pence, `>= 0` |
| `vat_rate_bp` | `INTEGER` | yes | `BETWEEN 0 AND 10000` |
| `vat` | `INTEGER` | yes | derived |
| `gross` | `INTEGER` | yes | derived |
| `notes` | `TEXT` | no | |
| `version` | `INTEGER` | yes | optimistic concurrency |
| `created_by` | `TEXT` | yes | FK user |
| `created_at` | `TEXT` | yes | |
| `voided_at`, `void_reason` | `TEXT` | no | both set together |

`invoice_lines`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `invoice_id` | `TEXT` | yes | FK invoice, `ON DELETE CASCADE` |
| `line_no` | `INTEGER` | yes | 1-based, `UNIQUE (invoice_id, line_no)` |
| `description` | `TEXT` | yes | 1–200 |
| `qty_milli` | `INTEGER` | yes | `> 0`, thousandths |
| `unit_pence` | `INTEGER` | yes | `>= 0` |
| `amount_pence` | `INTEGER` | yes | `round(qty_milli * unit_pence / 1000)` |

Rules:

- `net` equals the sum of line `amount_pence`; the service recomputes it in the transaction.
- `vat = round(net * vat_rate_bp / 10000)`; `gross = net + vat`.
- Number allocation happens inside the invoice transaction; voiding keeps the number.
- One job has at most one invoice with `status <> 'VOID'`. Re-issue = void old + create new.
- `ISSUED`/`PAID`/`VOID` invoices are customer-visible; `DRAFT` is not.
- Invoice lines are copied into the document snapshot at PDF generation; later edits to a
  DRAFT change the PDF, issued invoices are immutable except for void/paid transitions.

### 8.13 `documents`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `type` | `TEXT` | yes | `CHECK IN ('JOB_SHEET','INVOICE')` |
| `entity_type` | `TEXT` | yes | `CHECK IN ('JOB','INVOICE')` |
| `entity_id` | `TEXT` | yes | |
| `version` | `INTEGER` | yes | increments per generation |
| `generated_at` | `TEXT` | yes | |
| `generated_by` | `TEXT` | yes | FK user |
| `file_path` | `TEXT` | yes | server-controlled, never from user input |
| `checksum` | `TEXT` | yes | SHA-256 of the file |
| `size_bytes` | `INTEGER` | yes | `>= 0` |
| `mime` | `TEXT` | yes | `application/pdf` |

No stale cache: every download regenerates from live data and appends a new document row.
The previous file remains for audit; retention can prune old versions later. A document row
is inserted only after the file is fully written, `fsync`ed, renamed and checksum-verified.

### 8.14 `settings`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `key` | `TEXT` | yes | PK, e.g. `company.vat_rate_bp` |
| `value_json` | `TEXT` | yes | scalar/object validated by a per-key Zod schema |
| `version` | `INTEGER` | yes | optimistic concurrency |
| `updated_at` | `TEXT` | yes | |
| `updated_by` | `TEXT` | yes | FK user |

Required keys: `company.vat_rate_bp`, `company.invoice_due_days`,
`company.default_theme`, `company.pdf_footer`, `security.password_min_length`,
`security.session_idle_minutes`. Reads parse the JSON and re-validate; a corrupt setting is
a startup failure, not a silent fallback.

### 8.15 `audit_log`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | PK, UUID |
| `company_id` | `TEXT` | yes | FK company |
| `actor_user_id` | `TEXT` | no | null for failed anonymous sign-in |
| `action` | `TEXT` | yes | e.g. `permission.update` |
| `entity_type` | `TEXT` | yes | `JOB`, `USER`, `INVOICE`, `PERMISSION`, `SETTING`, `AUTH` |
| `entity_id` | `TEXT` | no | |
| `before_json`, `after_json` | `TEXT` | no | changed fields only, redacted |
| `at` | `TEXT` | yes | |
| `ip`, `user_agent` | `TEXT` | no | |
| `request_id` | `TEXT` | no | correlates with logs |

Append-only. Never store password hashes, raw session tokens, CSRF tokens or full request
bodies. `before`/`after` are written by a redactor that allow-lists fields per entity.

### 8.16 `sequences`, `rate_limits`, `idempotency_keys`

`sequences`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `kind` | `TEXT` | yes | `CHECK IN ('job','invoice')`, composite PK |
| `year` | `INTEGER` | yes | composite PK |
| `value` | `INTEGER` | yes | last allocated number, `>= 0` |

`rate_limits`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `key` | `TEXT` | yes | PK, HMAC of scope + IP/email |
| `count` | `INTEGER` | yes | `>= 0` |
| `window_start` | `TEXT` | yes | |
| `blocked_until` | `TEXT` | no | |
| `expires_at` | `TEXT` | yes | purge after this |

`idempotency_keys`

| Field | SQL type | Required | Notes |
|---|---|---|---|
| `key` | `TEXT` | yes | PK, client token |
| `user_id` | `TEXT` | yes | FK user |
| `route` | `TEXT` | yes | method + path template |
| `status_code` | `INTEGER` | yes | recorded response status |
| `response_ref` | `TEXT` | no | created entity ID or redirect |
| `created_at` | `TEXT` | yes | |
| `expires_at` | `TEXT` | yes | pruned after 24 h |

### 8.17 Relationships

```
Company 1─n User           Company 1─n Customer 1─n Job n─n User (assignments)
Company 1─n Job            Job 1─n JobEvent        Job 1─0..1 Invoice 1─n InvoiceLine
Role    1─n User           Role 1─n Permission     Job 1─n Document
Customer 1─0..1 User (portal login)
Invoice 1─n Document       User 1─n Session
```

### 8.18 Representative DDL

The full schema is in `0001_init.sql`; this excerpt fixes the style and the invariants:

```sql
CREATE TABLE jobs (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id),
  reference        TEXT NOT NULL UNIQUE,
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  title            TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  description      TEXT NOT NULL,
  work_type        TEXT NOT NULL CHECK (work_type IN ('WINDOW_INSTALL','REPAIR','SURVEY')),
  status           TEXT NOT NULL CHECK (status IN
                     ('DRAFT','SCHEDULED','IN_PROGRESS','ON_HOLD','COMPLETED',
                      'INVOICED','PAID','CANCELLED')),
  priority         TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','URGENT')),
  planned_start    TEXT,
  planned_end      TEXT,
  planned_slot     TEXT NOT NULL DEFAULT 'ALL_DAY' CHECK (planned_slot IN ('AM','PM','ALL_DAY')),
  actual_start     TEXT,
  actual_end       TEXT,
  price_net        INTEGER CHECK (price_net IS NULL OR price_net >= 0),
  vat_rate_bp      INTEGER NOT NULL DEFAULT 2000 CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  price_gross      INTEGER CHECK (price_gross IS NULL OR price_gross >= 0),
  internal_notes   TEXT,
  customer_notes   TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  archived_at      TEXT,
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);

CREATE UNIQUE INDEX jobs_reference_uq ON jobs(reference);
CREATE INDEX jobs_customer_status_ix ON jobs(customer_id, status);
CREATE INDEX jobs_status_start_ix ON jobs(status, planned_start);
```

---

## 9. Authentication and sessions

### 9.1 Sign-in

`POST /signin` accepts `email`, `password`, `_csrf`, optional `next`.

1. Normalise email; rate-limit by IP + email using the SQLite-backed limiter.
2. Find an active user. A missing user and a wrong password produce the same generic error
   and comparable timing (verify against a dummy Argon2id hash when the user is missing).
3. Verify with Argon2id. On failure: audit `auth.signin.failed`, increment the limiter,
   re-render the form with a plain-language message.
4. On success: create a new session row, set the signed cookie, clear old sessions for the
   same browser only if one is presented, update `last_login_at`, audit
   `auth.signin.success`, clear the email limiter key.
5. If `must_change_password`, redirect to `/account/password` and allow only password
   change, sign-out and static assets until it is cleared.
6. Otherwise redirect to `next` if it is a safe same-origin path, else to the role landing
   page: ADMIN/MANAGER → `/dashboard/operations`; ENGINEER → `/my-jobs`;
   CUSTOMER → `/portal/jobs`.

### 9.2 Session lifecycle

- Cookie name: `jms_sid` in development; `__Host-jms_sid` in production.
- Value: 32 random bytes, base64url, signed with HMAC-SHA-256 using `SESSION_SECRET`.
- The database stores only SHA-256 of the raw token. The raw token is never logged or
  persisted.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production.
- Idle expiry 60 minutes (configurable). `expires_at` slides on activity; persistence is
  throttled to once per minute per session.
- Absolute expiry 12 hours from sign-in, checked independently of the idle window.
- Sign-out marks the row `revoked_at` and clears the cookie.
- Password change, role change, deactivation, archive or a support "revoke sessions" action
  revokes all sessions for the user inside the same transaction.
- A revoked or expired cookie redirects to sign-in with an explanation; the original form
  state is not promised.
- On boot, expired sessions are deleted and rows for non-active users are revoked.

### 9.3 Password rules

- Hash with Argon2id: memory 19 MiB, iterations 2, parallelism 1, 16-byte salt, 32-byte
  output. Parameters are constants in `auth/passwords.ts` and recorded in the PHC string
  so they can be raised later without breaking existing hashes.
- Rehash on successful sign-in when the stored parameters are below the current policy.
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
  session (with a rotated token and row), audits `auth.password.change`.
- Rotation is one transaction: insert the new session, revoke the old, update the user.
  The response sets the new cookie only after commit.

### 9.5 Rate limiting

SQLite-backed fixed windows survive restarts and do not grow without bound:

| Scope | Limit | Window | Action |
|---|---|---|---|
| Sign-in by IP + email | 5 failures | 15 min | block 15 min |
| Sign-in by IP | 20 failures | 15 min | block 15 min |
| Password reset by user | 3 | 60 min | block |
| Search | 60 requests | 1 min | 429 with retry hint |

Keys are HMACs of the scope plus the IP/email so raw addresses are not stored in a table
that outlives the window. Expired rows are pruned on write and by nightly maintenance.
Successful sign-in clears the email key. Limiter checks happen before password
verification and before any database write that could leak timing.

### 9.6 Password reset and invites

- Staff with `user.reset.password` can issue a new temporary password. It is displayed once,
  stored hashed, and sets `must_change_password`.
- `customer.invite` creates or repairs a CUSTOMER login for a customer record: default
  password, `INVITED`, `must_change_password`, audit.
- No email delivery in v1; the screen states the temporary password and asks staff to pass
  it on securely.
- Issuing a reset revokes every session for that user before the new hash is stored.

---

## 10. Authorization

### 10.1 Middleware order

```ts
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

`loadSession` never trusts a user ID from a cookie. `loadUser` re-reads the user and the
permission matrix on every request so role/permission changes take effect immediately.
`errorHandler` is the only place that turns `AppError` into HTML/HTMX responses.

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

`src/domain/permissions.ts` exports:

```ts
export const ACTION_KEYS = [/* … */] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];
export const DEFAULT_MATRIX = { /* role → { action: boolean } */ } as const
  satisfies Record<RoleKey, Record<ActionKey, boolean>>;

export function can(user: AuthenticatedUser, key: ActionKey): boolean;
```

The same matrix drives navigation, buttons, route guards and tests. A unit test asserts
that every `ActionKey` has a default for every role.

### 10.3 Object-level scoping

These are code invariants, not permission cells.

**Customer scope**

- A CUSTOMER user has exactly one `customer_id`.
- Every job query adds `job.customer_id = :customerId`.
- Direct access to another customer's job, invoice or document returns 404.
- Customer responses use a customer presenter that removes `price_net`, `price_gross`,
  `internal_notes`, internal events, other customers and engineer phone numbers.

**Engineer scope**

- An ENGINEER sees jobs with an active assignment (`removed_at IS NULL`) plus jobs they
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

`src/domain/scoping.ts` builds a `JobScope` union (`AllScope`, `AssignedScope`,
`CustomerScope`) and the repository turns it into a parameterised `WHERE` clause. A route
cannot pass a raw user ID into SQL; it passes a scope object.

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

These are enforced in `services/permissions.ts` inside a transaction, not only in the UI.
The last-admin check uses `SELECT count(*) … WHERE role_key = 'ADMIN' AND status = 'ACTIVE'`
with the write lock held.

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

`src/domain/status.ts` exports a fully typed table and guard:

```ts
export const TRANSITIONS = {
  DRAFT:       { allowed: ["SCHEDULED", "CANCELLED"], /* … */ },
  SCHEDULED:   { allowed: ["IN_PROGRESS", "ON_HOLD", "CANCELLED", "SCHEDULED"], /* … */ },
  IN_PROGRESS: { allowed: ["COMPLETED", "ON_HOLD"], /* … */ },
  ON_HOLD:     { allowed: ["IN_PROGRESS", "CANCELLED"], /* … */ },
  COMPLETED:   { allowed: ["INVOICED", "IN_PROGRESS"], /* … */ },
  INVOICED:    { allowed: ["PAID", "COMPLETED"], /* … */ },
  PAID:        { allowed: [], /* … */ },
  CANCELLED:   { allowed: [], /* … */ },
} as const satisfies Record<JobStatus, TransitionRule>;

export function canTransition(input: TransitionInput): Result<TransitionPlan, DomainError>;
```

Checks in order:

1. `to` is in the transition table for `job.status`.
2. The user has `job.status.override`, or is an assigned field-capable user taking one of
   the forward field transitions (`SCHEDULED → IN_PROGRESS`, `IN_PROGRESS → COMPLETED`,
   `IN_PROGRESS → ON_HOLD`, `ON_HOLD → IN_PROGRESS`).
3. DRAFT exit guards are met.
4. Required note/reason is present where the transition demands it.
5. The target is not invoice-controlled (`INVOICED`, `PAID`) for the generic route.

On success, in one transaction: update the job with `version` check, stamp actual
timestamps, append `JobEvent`, append audit row. Return the updated job. A failed version
check returns `409` and changes nothing.

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
- The whole save is one transaction; the partial unique indexes are the final backstop.

### 11.4 Scheduling and conflicts

`POST /jobs/:id/schedule` accepts `planned_start`, `planned_end`, `planned_slot`.

- Validate start/end and timezone conversion with Luxon; reject `Invalid DateTime`.
- Find overlapping active assignments for each selected field user where the other job is
  `SCHEDULED`, `IN_PROGRESS` or `ON_HOLD` and its planned range overlaps. The overlap query
  is `other.planned_start < :end AND other.planned_end > :start` and is indexed.
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
- `sequences(kind, year)` is updated with `UPDATE … RETURNING value` inside the creating
  transaction (`BEGIN IMMEDIATE`), so two creates cannot read the same number.
- Invoice numbers are gapless: voiding keeps the number, re-issuing takes the next one.
- References are immutable after creation.
- Duplicate references are impossible because allocation and insert share one transaction
  and the unique index is the backstop.

### 11.6 Notes and visibility

- `internal_notes` is a single internal field on the job, visible to staff and assigned
  engineers, never to customers.
- `customer_notes` is customer-visible.
- Timeline notes choose `INTERNAL` or `CUSTOMER` visibility; the UI labels the choice
  plainly and never defaults to customer-visible.
- A note is plain text; line breaks are preserved, HTML is escaped.
- Pricing notes must not be placed in `internal_notes` if engineers should not see them;
  use the internal timeline with a manager-only audience. In v1, engineers see internal
  notes; customers never do.

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
- All monetary totals are recomputed from `invoice_lines` in the transaction; a mismatch
  with the submitted total is a validation error, not a silent correction.

### 11.8 Documents and PDFs

- Job sheet and invoice PDFs are generated on demand by `services/documents.ts`.
- Every generation appends a `documents` row with version, checksum, size and path.
- The file path is derived from the document ID, never from user input.
- A missing file is regenerated; a stale file is never served by a cached URL.
- Access rules are evaluated before generation, not after.
- Generation is staged: render to a temp file, `fsync`, rename to
  `storage/documents/{id}.pdf`, compute SHA-256, then insert the document row. If the insert
  fails, the file is deleted and the error is returned.

### 11.9 Archive and audit

- Archive job/customer sets `archived_at`; it disappears from normal lists but remains
  searchable by admins in the archive view.
- Restore clears `archived_at`.
- Delete is not exposed for jobs, customers or invoices.
- Every state change in §16.3 writes an audit row in the same transaction.
- Archived records remain visible to the customer portal only if the plan says so; v1 hides
  archived jobs from customers but keeps invoice history.

---

## 12. Routes

All paths below are relative to the app root. `A/M/E/C` mean ADMIN/MANAGER/ENGINEER/CUSTOMER.
A route guard is mandatory even when an object check also exists. Every unsafe route also
runs the idempotency middleware and the CSRF check.

### 12.1 Public and account

| Method | Path | Purpose | Guard |
|---|---|---|---|
| GET | `/healthz` | liveness + data/backup check | public |
| GET | `/readyz` | migration + integrity readiness | public, localhost only |
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
| GET | `/jobs/:id` | job detail + timeline | `job.view.all` or field-assigned scope |
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
| GET | `/jobs/:id/documents` | generated documents | `document.job.pdf` + scoped view |
| GET | `/jobs/:id/job-sheet.pdf` | download/generate job sheet | `document.job.pdf` + scoped view |
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
| GET | `/invoices/:id` | detail + PDF preview | `invoice.view.all` |
| POST | `/invoices/:id/issue` | issue | `invoice.issue` |
| POST | `/invoices/:id/void` | void with reason | `invoice.issue` |
| POST | `/invoices/:id/paid` | mark paid | `invoice.mark.paid` |
| GET | `/invoices/:id/pdf` | download/generate invoice PDF | `document.invoice.pdf` + `invoice.view.all` |

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
| GET | `/admin/backups` | backup status, latest verified snapshot | `admin.audit.view` |
| POST | `/admin/backups/run` | run a manual backup (CLI-equivalent, audited) | `admin.settings.manage` |

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

```ts
router.post(
  "/jobs/:id/status",
  requirePermission("job.status.advance"),
  idempotent(),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const job = await jobs.getVisibleOr404(user, JobId.parse(req.params.id));
    const result = await jobs.transition({
      user,
      job,
      to: StatusBody.parse(req.body),
      meta: writeMeta(req),
    });

    if (!result.ok) return res.status(statusFor(result.error)).render(
      "pages/jobs/detail.njk",
      jobDetailView({ user, job, errors: [result.error] }),
    );

    if (req.isHtmx) return res.render("partials/jobs/status.njk", statusView(result.value));
    setFlash(req, "success", "Job status updated.");
    return res.redirect(`/jobs/${job.id}`);
  }),
);
```

Controllers stay thin: parse, guard, call service, render/redirect. Business rules live in
services/domain modules and are independently testable. `asyncHandler` is unnecessary in
Express 5 for rejections, but is kept to attach the request ID and logger to unexpected
errors consistently.

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
| Admin | `users/list.njk`, `users/detail.njk`, `roles.njk`, `settings.njk`, `audit.njk`, `archive.njk`, `backups.njk` |
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
`theme`, `company`, `formatMoney`, `formatDate`, `formatDateTime`. All locals are typed in
`views/view-models.ts`; Nunjucks templates are checked by a compile-time render test that
renders every page with a fixture view model.

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
- Every form has a hidden CSRF field and a hidden `_idempotency` token.
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
- Conflict: "Someone else changed this record" with a reload link and the current values.
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

`services/documents.ts`:

```ts
async function generateJobSheet(input: GenerateInput): Promise<Document> {
  const visible = presentJobForPdf(input.user, input.job); // removes forbidden fields
  const documentId = DocumentId.generate();
  const tempPath = path.join(documentsDir, `${documentId}.pdf.tmp`);
  const finalPath = path.join(documentsDir, `${documentId}.pdf`);

  await renderJobSheetPdf({ output: tempPath, data: visible }); // never inside a tx
  await fsyncAndRename(tempPath, finalPath);
  const { checksum, size } = await hashAndSize(finalPath);

  return writeTx(db, (tx) =>
    documentsRepo.insert(tx, {
      id: documentId,
      type: "JOB_SHEET",
      entityType: "JOB",
      entityId: input.job.id,
      version: nextVersion,
      filePath: finalPath,
      checksum,
      size,
      generatedBy: input.user.id,
      generatedAt: input.now,
    }),
  );
}
```

- Output path: `storage/documents/{document_id}.pdf`; temp files use `.pdf.tmp`.
- Stream to a temp file, `fsync`, rename; never leave partial files.
- SHA-256 checksum and size recorded.
- A download served by document ID re-checks permission and entity scope every time.
- If the file is missing, regenerate and update the document row; if generation fails,
  return a friendly error and log the request ID.
- No long-lived signed URLs; access is session-based.
- A failed rename or checksum mismatch deletes the temp file and writes no document row.

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
- Document row has a checksum that matches the file on disk.
- A simulated rename failure leaves no document row and no partial file.

---

## 15. Seed data

### 15.1 Command and determinism

```bash
npm run db:migrate     # apply schema
npm run seed           # create data if absent
npm run seed:force     # replace existing data (after a verified backup)
npm run reset          # delete the database and generated PDFs, migrate and seed
```

- `SEED=20260316` by default.
- Use a documented PRNG (mulberry32) seeded with the numeric seed; all choices must be
  reproducible.
- **Anchor date.** `SEED_DATE` defaults to the UTC date on which the seed is first run
  (`YYYY-MM-DD`). The resolved anchor is stored in `meta.seed_anchor` and reused, so the
  dataset is reproducible on that day and testable with a pinned date. Seeding does not
  silently shift an existing dataset when the clock advances.
- **Horizon.** The anchor day starts at `00:00:00Z`; jobs are scheduled from the anchor day
  through `anchor + 41 days`, i.e. **20 jobs across the next six calendar weeks (42 days)**.
  The injected clock is `anchor at 08:00:00Z` for events and actual timestamps.
- Seeding writes one transaction; it either produces the complete dataset or nothing.
- The script prints the anchor, the date range and the status counts, and fails if any
  acceptance check in §15.7 fails.
- `seed:force` and `reset` require the ops lock and write a verified backup first.
- Seed users share a precomputed Argon2id hash of `JMS123` (same parameters) to keep
  seeding fast; all are `must_change_password: true`. Real provisioning hashes per user.
- Seeding sets `meta.seed_version` (which includes `meta.seed_anchor`) so an identical
  re-run on the same anchor is a no-op unless `--force`.

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

Create exactly **2 jobs per customer = 20 jobs**. Assign the two jobs to customers in
customer order (customer 1 gets jobs 1 and 11, customer 2 gets jobs 2 and 12, and so on), so
every customer has work in the six-week window and the deterministic reference counts are
`[2, 2, 2, 2, 2, 2, 2, 2, 2, 2]`.

All 20 jobs have a `planned_start` inside the six-week horizon. Day offset `0` is the
anchor day; offset `41` is the last day of week six. The 12 non-forced jobs use the
shuffled offsets `[3, 5, 8, 11, 15, 18, 22, 25, 29, 32, 36, 40]`, guaranteeing at least one
job in every week of the window.

For each job:

1. Reference: allocate `JOB-${anchorYear}-NNNN` in sequence, using the anchor year.
2. Work type: weighted `WINDOW_INSTALL` 50%, `REPAIR` 35%, `SURVEY` 15%.
3. Title: pick a matching title from a fixed table.
4. Description: 1–2 sentences built from the work type and customer name.
5. Priority: 15% `URGENT`, else `NORMAL`.
6. Status: force the first eight jobs to cover all eight statuses exactly once, with
   legal offsets: DRAFT `14`, SCHEDULED `7`, IN_PROGRESS `0`, ON_HOLD `0`, COMPLETED `0`,
   INVOICED `0`, PAID `0`, CANCELLED `7`. The remaining 12 use weights SCHEDULED 50%,
   DRAFT 40%, CANCELLED 10%; a drawn DRAFT at an offset below `14` becomes SCHEDULED, so
   every status keeps its legal offset.
   A status is only legal for its date offset:
   - `IN_PROGRESS`, `COMPLETED`, `INVOICED`, `PAID`: offset `0` (work is happening or has
     just finished today); actual times are today.
   - `ON_HOLD`: offset `0–7`; the job is blocked in the current week.
   - `SCHEDULED`: offset `1–41`.
   - `DRAFT`: offset `14–41` (tentative dates, not yet confirmed).
   - `CANCELLED`: offset `1–41`.
   The acceptance checks in §15.7 verify the distribution.
7. Planned dates:
   - Start time: `08:00Z` for `AM`, `12:30Z` for `PM`, `08:00Z` for `ALL_DAY`, on the
     chosen day offset.
   - End time: `17:00Z` the same day, except a `SURVEY` may end at `12:00Z`.
   - `planned_slot` follows the chosen start time; the end is never before the start.
   - DRAFT jobs keep tentative dates inside the window so the six-week workload is visible;
     the status still blocks any work until dates and an assignee are confirmed.
8. Actual dates: IN_PROGRESS has `actual_start = anchor + 08:00Z`; COMPLETED, INVOICED and
   PAID have `actual_start = anchor + 08:00Z` and `actual_end = anchor + 12:00Z` (same-day
   work on the anchor day).
9. Price: net £450–£6,500 in pence; VAT 20%; gross derived.
10. Notes: some jobs get an internal note and a separate customer-visible note.
11. Create a `CREATED` event, plus a `STATUS_CHANGE` event for the current status.
12. Archive: none in seed.
13. Creation and assignment timestamps are at or before the planned start; no job is
    created after its own scheduled date.

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

- Jobs with `INVOICED` or `PAID` get one invoice (exactly two seeded invoices):
  - `INVOICED`: status ISSUED, issued at `anchor + 09:00Z`, due at `+14 days`.
  - `PAID`: status PAID, issued at `anchor + 09:00Z`, paid at `anchor + 15:00Z`.
  - Number allocation is sequential in job creation order, `INV-${anchorYear}-NNNN`.
  - Invoice net equals the job net; one line with the job title and amount; `vat` and
    `gross` are derived and checked against the line total.
- `CANCELLED` jobs get a cancellation event with a reason; cancelled jobs retain their
  planned date inside the six-week window for operational reporting.
- No PDFs are pre-generated in seed; first download creates the document row and file.
- No audit rows for seed provisioning except a single `seed.create` row; seeded records are
  demo data, not user actions.
- After seeding, `ANALYZE` runs and the acceptance checks execute inside the transaction;
  any failure rolls the whole seed back.

### 15.7 Acceptance checks

The seed script must assert:

- ☐ exactly 2 ADMIN users, 2 MANAGER users, 8 ENGINEER users, 10 CUSTOMER users;
- ☐ both managers have `can_engineer: true`;
- ☐ exactly 10 customer records, each with one CUSTOMER login;
- ☐ exactly 20 jobs, 2 for each of the 10 customers;
- ☐ every `planned_start` is within `[anchor 00:00Z, anchor + 42 days)`; no job falls
  outside the six-week window;
- ☐ at least one job starts in each of the six 7-day weeks;
- ☐ every job has at least one active assignment from the field-capable pool;
- ☐ every assignment user satisfies `can_engineer && ACTIVE`;
- ☐ at least one job in each of the eight statuses;
- ☐ exactly one ISSUED and one PAID invoice (two total); every INVOICED/PAID job has
  exactly one live invoice; PAID has `paid_at` after `issued_at`;
- ☐ invoice numbers are unique and gapless for the anchor year;
- ☐ all default accounts have `must_change_password: true`;
- ☐ `sequences.job` for the anchor year equals 20;
- ☐ `invoice_lines.amount_pence` sums to `invoices.net` for every invoice;
- ☐ no record references a missing foreign key;
- ☐ `PRAGMA foreign_key_check` returns no rows.

---

## 16. Security and audit

### 16.1 Headers and transport

- Helmet with:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self';
    img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';
    form-action 'self'; base-uri 'self'`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
    `X-Frame-Options: DENY`.
- HTTPS terminates at the reverse proxy in production; `TRUST_PROXY` is enabled only then.
- Cookies are `Secure` in production. No secrets in URLs.
- Request bodies are capped at 1 MB; URL-encoded and JSON parsers have explicit limits.

### 16.2 Input and output

- Validate every request body/query with Zod; reject unknown fields.
- Escape all output; notes are plain text.
- No dynamic `require`, no `eval`, no shell commands with user input. The one shell call is
  the optional `BACKUP_OFFSITE_CMD`, which is a fixed command from the environment, never
  built from request data.
- PDF file paths come from generated document IDs only.
- Uploads are not part of v1.
- Rate limits cover sign-in, password reset and search.
- All SQL is parameterised; identifiers are compile-time constants.

### 16.3 Audit events

Every mutation writes an audit row in the same transaction. Required actions:

`auth.signin.success`, `auth.signin.failed`, `auth.signout`, `auth.password.change`,
`user.create`, `user.update.role`, `user.reset.password`, `user.deactivate`,
`permission.update`, `customer.create`, `customer.update`, `customer.invite`,
`customer.archive`, `customer.restore`, `job.create`, `job.update`, `job.assign`,
`job.schedule`, `job.status.change`, `job.note.add`, `job.cancel`, `job.archive`,
`job.restore`, `invoice.create`, `invoice.issue`, `invoice.void`, `invoice.paid`,
`document.generate`, `settings.update`, `theme.default.update`, `backup.run`,
`backup.restore`, `db.migrate`.

Audit `before`/`after` contains only changed fields and never secrets. Permission edits
record `role_key`, `action_key`, `before`, `after`. Audit rows are never updated or deleted;
retention is out of scope for v1.

### 16.4 Logging

- Pino JSON to stdout; request ID on every line.
- Log method, path, status, duration, user ID (if signed in) and error code.
- Redact cookies, `authorization`, `password`, `_csrf`, `_idempotency`, session IDs, tokens.
- Do not log request bodies or personal notes.
- Error logs include stack traces; client responses do not.
- Backup and restore commands log to stdout/stderr with an exit code and a one-line summary;
  cron redirects them to a log file (§17.5).

### 16.5 Backup security

- Backups contain personal data and password hashes. The `backups/` directory is mode
  `0700`, files `0600`, owned by the service account.
- Offsite copies are encrypted by restic/rclone; the encryption key is not stored on the
  application host.
- A backup manifest records counts, checksums and the SQLite `user_version`, never secrets
  or row contents.
- Restoring a backup revokes every session by default (§17.8), so an old cookie cannot
  resurrect access.

### 16.6 Threat tests

Automated tests must cover:

- cross-customer job/invoice/document access returns 404;
- cross-engineer job access returns 404;
- missing/invalid CSRF is rejected, including a token of the wrong length;
- hidden role/owner fields cannot escalate or reassign;
- last-admin safeguards reject demotion/deactivation/permission removal;
- `admin.audit.view` cannot be granted to CUSTOMER or ENGINEER;
- session revocation after password change/role change/deactivation;
- concurrent updates with a stale `version` return 409 and do not overwrite;
- replayed `_idempotency` tokens do not duplicate jobs/invoices;
- login rate limiting survives a process restart (SQLite-backed);
- a corrupted database refuses startup safely and names a backup;
- a tampered migration checksum refuses startup;
- restore refuses to run while the app lock is held;
- no price/internal-note leakage in customer/engineer HTML or PDF;
- SQL injection attempts in filters are parameterised and cannot change the query shape.

---

## 17. Backups, restore and cron

Backup is a product feature, not an afterthought. The database is one file; the loss of
that file is the loss of the business record. The following rules are mandatory.

### 17.1 Objectives

| Measure | Target |
|---|---|
| RPO (maximum data loss) | 24 hours with nightly cron; 15 minutes if the optional hourly job is enabled |
| RTO (time to restore) | under 30 minutes for the v1 dataset |
| Backup retention | 30 daily, 12 weekly, 12 monthly (GFS) |
| Verification | every backup is integrity-checked; latest is restore-tested nightly |
| Offsite | encrypted copy after every successful local backup |
| Monitoring | `/healthz` and an external dead-man's switch |

### 17.2 Backup format and naming

```
backups/
  jms-20260316T021500Z-nightly.db
  jms-20260316T021500Z-nightly.db.sha256
  jms-20260316T021500Z-nightly.json
  jms-20260317T021500Z-nightly.db
  ...
```

- Timestamp is UTC, sortable (`YYYYMMDDTHHmmssZ`).
- `tag` is `nightly`, `hourly`, `manual`, `pre-migrate`, `pre-seed` or `pre-restore`.
- `.db` is a complete, consistent SQLite snapshot (online backup API), not a zip and not a
  `-wal` sidecar.
- `.sha256` contains the hex digest and filename in `sha256sum` format.
- `.json` is a manifest validated by a Zod schema:

```json
{
  "schema": 1,
  "file": "jms-20260316T021500Z-nightly.db",
  "tag": "nightly",
  "created_at": "2026-03-16T02:15:00.000Z",
  "sqlite_version": "3.49.1",
  "user_version": 2,
  "size_bytes": 912345,
  "sha256": "…",
  "integrity": "ok",
  "foreign_key_check": "ok",
  "counts": { "users": 22, "customers": 10, "jobs": 26, "invoices": 6 },
  "duration_ms": 84,
  "host": "jms-prod-1"
}
```

The manifest is written last, after the checksum and verification pass. A `.db` without a
manifest is treated as unverified and is not eligible for pruning or restore-by-latest.

### 17.3 Online snapshot procedure

`src/backup/snapshot.ts` runs in the CLI process:

1. Acquire the ops lock with `flock -n` semantics; if another backup/migration/restore
   holds it, exit `0` with "skipped: lock held" (for cron) or `3` for manual runs.
2. Check free space in `BACKUP_DIR`; refuse below `BACKUP_MIN_FREE_MB`.
3. Open the live database **read-only** and run `PRAGMA quick_check` first; a failing live
   database aborts the backup and raises a critical log line.
4. Use SQLite's online backup API (`better-sqlite3` `db.backup(destination)`) to write
   `backups/.tmp-<name>.db`. The API copies pages consistently while writers continue.
5. `fsync` the temp file and its directory, then rename to the final name.
6. Open the snapshot read-only and run:
   - `PRAGMA integrity_check` (must return `ok`);
   - `PRAGMA foreign_key_check` (must return no rows);
   - a count of core tables for the manifest.
7. Compute SHA-256 and write `.sha256`.
8. Write the manifest atomically (temp + rename), then log one JSON line with name, size,
   duration and counts.
9. If `BACKUP_OFFSITE_CMD` is set, run it with the snapshot path as a fixed argument; a
   non-zero exit marks the backup `offsite_failed` in a sidecar status file but does not
   delete the local copy.
10. Release the lock.

Failure at any step leaves the previous verified backups untouched and deletes the temp
file. The command exits non-zero so cron/monitoring can alert.

### 17.4 Verification

`jms verify --latest` and `jms verify --file <name>`:

1. Verify the `.sha256` matches the file.
2. Parse and validate the manifest.
3. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on a copy (never the only
   copy).
4. Open the snapshot in a temp directory, apply no migrations, and run a read-only smoke
   query: company exists, an admin exists, counts are non-zero, `user_version` matches the
   manifest.
5. For `--full`, run the test suite's restore smoke test against the temp copy.
6. Print a single summary and exit `0`/`1`.

The nightly cron runs `verify --latest` after the backup. A weekly drill restores the latest
snapshot into a throwaway directory and starts the app on a spare port with
`NODE_ENV=test`, then fetches `/healthz` and `/signin`.

### 17.5 Schedule and cron

The recommended deployment uses **system cron**, not an in-process timer. Cron survives an
application crash, runs even when the app is down, and keeps backup code out of the request
process. If a host has no cron, the systemd timer in `ops/systemd/` is equivalent. An
in-process scheduler is not provided in v1.

`ops/cron/jms-backup` (install as `/etc/cron.d/jms-backup`, owned by root, mode `0644`):

```cron
# JMS verified database backups. Times are server-local; log lines are UTC.
SHELL=/bin/sh
PATH=/usr/local/bin:/usr/bin:/bin
TZ=UTC

# Nightly snapshot + verification at 02:15.
15 2 * * * jms cd /srv/jms && /usr/bin/flock -n /srv/jms/data/jms.ops.lock \
  /usr/bin/node dist/cli/jms.js backup --tag nightly >> /var/log/jms/backup.log 2>&1

# Verify the newest snapshot at 03:15 (after the backup finishes).
15 3 * * * jms cd /srv/jms && /usr/bin/node dist/cli/jms.js verify --latest \
  >> /var/log/jms/backup.log 2>&1

# Prune by GFS at 03:45, but never remove an unverified or most recent snapshot.
45 3 * * * jms cd /srv/jms && /usr/bin/node dist/cli/jms.js prune \
  >> /var/log/jms/backup.log 2>&1

# Optional 15-minute snapshots for a tighter RPO. Keep only 96 of them.
*/15 * * * * jms cd /srv/jms && /usr/bin/flock -n /srv/jms/data/jms.ops.lock \
  /usr/bin/node dist/cli/jms.js backup --tag hourly --keep 96 \
  >> /var/log/jms/backup.log 2>&1
```

Rules for the cron entry:

- Run as the unprivileged service user (`jms`), never root.
- Use `flock -n` on the same lock file the app uses for restore/migrate, so jobs cannot
  overlap or race a restore.
- Redirect both streams to a log file that is rotated by logrotate (daily, keep 14,
  compress).
- Use an absolute working directory and absolute Node path; cron has a minimal `PATH`.
- Do not put secrets on the command line; the CLI reads the same validated environment
  file/config as the app.
- Set `TZ=UTC` so filenames and logs are unambiguous.
- A non-zero exit is alertable. The log line is JSON so a log shipper can parse it.

`ops/systemd/jms-backup.timer` is the alternative:

```ini
[Unit]
Description=JMS nightly database backup

[Timer]
OnCalendar=*-*-* 02:15:00 UTC
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
```

The matching service runs
`/usr/bin/flock -n /srv/jms/data/jms.ops.lock /usr/bin/node /srv/jms/dist/cli/jms.js backup --tag nightly`
with `User=jms`, `WorkingDirectory=/srv/jms` and `ProtectSystem=strict` plus a writable
`ReadWritePaths=/srv/jms/data /srv/jms/backups /srv/jms/storage`.

### 17.6 Retention (GFS)

`jms prune` applies:

- keep every snapshot from the last 24 hours;
- keep the newest snapshot per day for 30 days;
- keep the newest snapshot per ISO week for 12 weeks;
- keep the newest snapshot per calendar month for 12 months;
- never delete the newest verified snapshot, a `pre-migrate`/`pre-restore` snapshot younger
  than 7 days, or any snapshot whose manifest is missing/failed;
- delete the `.db`, `.sha256` and `.json` as a unit, and only after a dry-run count is
  logged.

`--dry-run` is the default for manual use; cron passes `--apply`. The retention job writes
an audit row (`backup.prune`) with the count and names removed (names only, no contents).

### 17.7 Offsite copies

Local backups do not survive disk loss. Production must copy snapshots off the host:

```bash
# In BACKUP_OFFSITE_CMD, run after the local backup is verified.
restic -r s3:s3.example.com/jms backup /srv/jms/backups \
  --tag jms --host jms-prod-1
```

or

```bash
rclone copy /srv/jms/backups remote:jms-backups --immutable
```

Rules:

- Offsite storage is encrypted at rest and in transit; restic handles both.
- The offsite job runs only after the manifest is written.
- Verify a random offsite snapshot monthly by restoring it to a scratch host.
- Keep the restic/rclone credentials out of the application environment; use the service
  user's credential file with mode `0600`.
- The generated PDFs in `storage/documents/` are regenerable and are not required for
  disaster recovery. They are included in an optional weekly archive if storage permits.

### 17.8 Restore procedure

`jms restore --from <name> --force` is the only supported path. It is destructive and
requires confirmation.

1. Acquire the ops lock; refuse if the app is running (detect the app lock PID) unless
   `--offline` is passed and the app is confirmed stopped.
2. Verify the chosen snapshot: checksum, manifest, `integrity_check`, `foreign_key_check`
   and a smoke query. Refuse an unverified file.
3. Write a `pre-restore` snapshot of the current database if it is readable.
4. Copy the snapshot to `data/.restore-<timestamp>.db`, `fsync`, then:
   - stop accepting new writes (the app must already be stopped);
   - rename the current database to `data/jms.sqlite.pre-restore-<timestamp>`;
   - remove any stale `jms.sqlite-wal` and `jms.sqlite-shm` (they belong to the old file);
   - rename the restored file to `data/jms.sqlite`.
5. Open the restored database, run `PRAGMA integrity_check`, `PRAGMA foreign_key_check`,
   `PRAGMA optimize`, and set `PRAGMA user_version` to the packaged version if the manifest
   matches.
6. **Revoke every session** (`UPDATE sessions SET revoked_at = :now WHERE revoked_at IS
   NULL`) unless `--keep-sessions` is explicitly passed. This prevents an old cookie from
   authenticating against rolled-back data.
7. Delete idempotency keys and rate-limit rows older than the snapshot horizon.
8. Write an audit row `backup.restore` with the source name, checksum and operator.
9. Print the restored counts and the next step: start the app, run `/healthz`, sign in, open
   one job, one invoice and the audit view.
10. Release the lock.

The restore command never edits the snapshot in place. It works on a copy, so a failed
restore leaves the original snapshot intact.

### 17.9 Restore drills

- Before go-live, perform a full drill and record date, backup name, verifier, duration and
  result in the ops log.
- Monthly thereafter, restore the latest offsite snapshot to a scratch environment and run
  the smoke checks.
- The drill is not complete until a user can sign in, open a job, open an invoice, download
  a PDF and see a new audit row.
- A failed drill is a release blocker, not a backlog item.

### 17.10 Monitoring

- `/healthz` returns `backup: { last_ok_at, age_hours, last_file, verified }`.
- `503` when `age_hours > BACKUP_MAX_AGE_HOURS`; the page names the last verified file.
- The exit code of the cron command is the primary alert signal. Configure cron mail or a
  monitoring agent to alert on non-zero.
- A dead-man's switch (healthchecks.io, Cronitor or a self-hosted equivalent) is pinged
  after a successful backup and verification; a missed ping alerts.
- Disk space is checked before every backup and exposed in `/healthz` as a warning below
  1 GB.
- `backups/last-success.json` (written atomically) lets an external check run without the
  app.

### 17.11 Backup tests

Automated tests in `tests/backup/` must prove:

- a backup runs while a writer is active and the snapshot passes `integrity_check`;
- the snapshot's counts match the live database at commit time;
- a tampered `.db` fails checksum verification;
- a truncated `.db` fails `integrity_check` and is never restorable;
- a missing manifest makes a snapshot ineligible for pruning and restore-by-latest;
- `prune --dry-run` removes nothing; `--apply` removes exactly the GFS set;
- restore to a temp path succeeds, revokes sessions, and a sign-in is required;
- restore refuses while the app lock is held;
- a failed restore leaves the original database and snapshot untouched;
- retention never deletes the newest verified snapshot;
- the backup CLI exits non-zero on a failing integrity check.

The HTTP workflow suite includes a test that starts the app on a backup/restore round-trip
and asserts the seed counts and a readable job.

---

## 18. Testing

### 18.1 Test setup

- `tests/helpers/app.ts` builds the Express app with a temporary `DATABASE_FILE`,
  `BACKUP_DIR` and `DOCUMENTS_DIR`, runs migrations and the seed builder with a fixed
  clock, and returns a Supertest agent.
- Each test file creates its own temp directory; cleanup removes it, including `-wal` and
  `-shm`.
- No network access. Fonts/HTMX are local fixtures.
- `vitest run` runs all `*.test.ts`; `npm run test:coverage` enforces thresholds:
  statements 85%, branches 80%, functions 85%, lines 85%, with 100% on
  `domain/money.ts`, `domain/status.ts`, `domain/references.ts` and `backup/retention.ts`.

### 18.2 Unit tests

| Module | Tests |
|---|---|
| `db/connection` | pragmas applied, foreign keys enforced, typed busy retry |
| `db/migrator` | checksum mismatch, forward-only order, transactional failure |
| `db/repositories` | row decoding, optimistic conflict, partial unique indexes |
| `domain/status` | every allowed/denied transition and guard, exhaustive table |
| `domain/permissions` | matrix defaults, safeguards, `can()` |
| `domain/references` | year rollover, gapless invoice numbers, concurrent allocation |
| `domain/money` | VAT rounding, line totals, no floats, property tests |
| `services/jobs` | assignment validation, conflict detection, scoping |
| `services/invoices` | issue/void/paid/re-issue, one live invoice, total recomputation |
| `services/documents` | checksum, version, regeneration, failed rename |
| `backup/snapshot` | online copy under load, manifest validation |
| `backup/retention` | GFS selection, safety rules, dry run |

Property tests:

- money: for any pence and basis points in range, `gross = net + vat` and all values are
  safe integers;
- quantities: `amount_pence` equals the documented rounded integer for random thousandths;
- backup names: generated names are unique, sortable and match the parser;
- status: random sequences of transitions never reach a state outside the table.

### 18.3 HTTP and workflow tests

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

Each workflow test uses a fresh database and asserts the audit row, the event row and the
HTTP status, not just the rendered text.

### 18.4 Permission matrix test

A generated test iterates every role × action key × representative route:

- allowed → not 403;
- denied → 403 or 404 according to scope rules;
- nav markup contains the pill only when allowed.

This test is the primary defence against a hidden button being the only control.

### 18.5 Seed test

Asserts every check in §15.7 with a pinned `SEED_DATE`, plus idempotent `seed:force` with a
backup, and a deterministic re-run on the same anchor producing byte-identical domain data
(ignoring timestamps). A separate test advances the clock and asserts that an existing seed
is not silently re-dated.

### 18.6 Accessibility and performance

- Automated: `axe-core` in a Playwright smoke suite for sign-in, jobs list, job detail,
  portal and appearance panel; fail on serious/critical.
- Manual: keyboard-only walkthrough, 200% zoom, 360px viewport, light/dark contrast.
- Performance: request p95 < 300ms on the seed dataset; list queries use indexes; no
  N+1 rendering; response size under 500KB for normal pages.
- Query plans: `EXPLAIN QUERY PLAN` assertions for jobs list, portal list, timeline and
  audit filters must show index use.

### 18.7 CI order

```bash
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run build
```

A separate `npm run test:a11y` runs the Playwright suite where browsers are available.
The backup round-trip test runs in the normal suite and requires no external services.

---

## 19. Operations and deployment

### 19.1 Local development

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run seed
npm run dev
# http://localhost:3000
```

Sign in with `admin@acme.example` / `JMS123`; the app forces a password change, then lands
on the operations dashboard. `npm run check` must pass before a commit.

### 19.2 Production

- One Node process behind a reverse proxy (Caddy/Nginx) with HTTPS.
- Persistent volume for `data/`, `storage/` and `backups/`; `backups/` mode `0700`.
- `NODE_ENV=production`, `COOKIE_SECURE=true`, a strong `SESSION_SECRET`,
  `TRUST_PROXY=true`, `SQLITE_SYNCHRONOUS=FULL`.
- Build on deploy: `npm ci --omit=dev`, `npm run build`, `npm run db:migrate` (with the app
  stopped), then `npm start` under systemd.
- Run `npm run seed` only on first deploy.
- Health check: `GET /healthz` returns `200 {"status":"ok","db":"ok","schema":2,
  "backup":{"age_hours":6.2,"verified":true},"sqlite":"3.49.1"}`.
- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, drain in-flight requests with a
  10-second cap, run `PRAGMA wal_checkpoint(TRUNCATE)`, `PRAGMA optimize`, close the
  database, release the app lock, exit `0`. A forced second signal exits `1`.
- No horizontal scaling against one database in v1. A future move to a server database
  would revisit the rate limiter, sessions and single-writer assumptions.
- Log rotation: systemd/journald or logrotate; application logs are JSON lines.

### 19.3 systemd unit (summary)

```ini
[Service]
Type=simple
User=jms
WorkingDirectory=/srv/jms
EnvironmentFile=/srv/jms/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=2
TimeoutStopSec=15
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/jms/data /srv/jms/backups /srv/jms/storage
```

### 19.4 Performance budgets

| Area | Budget |
|---|---|
| Page p95 | < 300ms |
| SQLite write | < 20ms for the v1 dataset |
| Seed + migrate | < 10s |
| PDF generation | < 2s per document |
| List page | 25 rows default |
| Search | < 100ms for 100 jobs |
| Backup snapshot | < 2s for the v1 dataset |
| Restore (incl. verification) | < 30 minutes end to end |

### 19.5 Observability

- Structured logs for requests, errors and slow operations (> 500ms).
- In-app audit view for admins, plus a backup status page.
- `/healthz` covers liveness, database readability, schema version and backup freshness.
- No external monitoring required for v1; a log drain and a cron dead-man's switch are
  strongly recommended.
- Error responses show the request ID so a log line can be found.

---

## 20. Implementation order

Each phase is a demonstrable vertical slice. Do not start a phase before its dependencies
are green.

| Phase | Build | Acceptance |
|---|---|---|
| **T0** | TypeScript scaffold, strict config, config/logging, health, SQLite connection/pragmas, migration runner, Kysely types, seed skeleton | `npm run check` passes; `/healthz` ok; empty migrated DB boots; checksum mismatch refuses boot |
| **T1** | Auth, Argon2id, sessions, CSRF, password change, roles/permissions seed, app shell, nav | Four seeded roles sign in; denied routes are friendly; matrix hides pills; sessions survive restart |
| **T2** | Customers CRUD, invite login, users admin, company settings, optimistic concurrency | W1 and user admin work; duplicate emails explained; stale edits 409; audit rows written |
| **T3** | Jobs CRUD, references, detail, assignments, scheduling, conflict warning, list filters | W2/W3 work; DRAFT exit guards enforced; `can_engineer` managers assignable |
| **T4** | My jobs, status control, actual timestamps, notes, timeline | W4 works on a phone; forbidden transitions rejected; timeline renders |
| **T5** | Customer portal, scoped queries, portal invoices/documents | W6 works; guessed cross-customer URLs return 404 |
| **T6** | Invoices + lines, numbering, issue/void/paid, job sheet/invoice PDFs, print CSS | W5/W7 work; numbering gapless; totals match lines; PDFs pass content tests |
| **T7** | Search, dashboards, timeline, workload, financials | W10 works; all views respect scope and dates; query plans use indexes |
| **T8** | Full audit view, archive/restore, appearance panel, seed polish | Matrix editable and audited; theme persists; archive rules hold |
| **T9** | Backup CLI, cron install, verification, retention, restore drill, backup admin page | §17.11 green; a drill restores and serves the app; `/healthz` reports freshness |
| **T10** | Accessibility/performance pass, help pages, final docs | §18 green; §12 checklist from the plan met |

### 20.1 Definition of done

- ☐ All `_PLAN.md` §12 checklist items pass.
- ☐ All §10 action keys have server enforcement and tests.
- ☐ Cross-customer and cross-engineer access tests fail closed with 404.
- ☐ Every write is transactional, version-checked and idempotent where applicable.
- ☐ SQLite runs in WAL with foreign keys on and `synchronous=FULL` in production.
- ☐ Migrations are checksummed and forward-only; a tampered migration blocks startup.
- ☐ Seed produces the exact counts in §15.7.
- ☐ Cron backups are verified, retained by GFS and copied offsite.
- ☐ A documented restore drill passes from a cold host.
- ☐ Job sheet and invoice PDFs contain the right fields and no forbidden data.
- ☐ Light/dark/system themes persist per user; company default applies.
- ☐ 360px layout, keyboard walkthrough and WCAG AA contrast pass.
- ☐ `_PLAN.html` and `_TECH.html` build from Markdown with no PDF step.

---

## 21. Traceability and open questions

### 21.1 Plan to technical spec

| `_PLAN.md` | Implemented in |
|---|---|
| §1 goals, non-goals | §1, §20 |
| §2 roles, permissions, safeguards | §8.4–8.6, §10 |
| §3 domain model, status machine | §8, §11.1–11.2 |
| §4 workflows W1–W10 | §12, §18.3 |
| §5 screens/navigation | §13.1–13.3 |
| §6 UX/accessibility | §13.4–13.10 |
| §7 visual system/Aa panel | §13.7 |
| §8 PDF requirements | §14 |
| §9 security/audit | §16 |
| §10 non-functional | §7, §17, §19 |
| §11 milestones | §20 |
| §12 definition of done | §20.1 |
| §13 decisions | §1.2, §1.3, §21.2 |

### 21.2 Open questions for build sign-off

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Should engineers see internal job notes? | Yes, operational notes only; never pricing. |
| Q2 | Should a manager with `can_engineer` see the customer price on their assigned job? | Yes, because the MANAGER role already grants price visibility. |
| Q3 | Should COMPLETED require a completion note? | Ask for it in the UI; keep it optional. |
| Q4 | Should customer portal show VOID invoices? | Yes, with the VOID state, for transparency. |
| Q5 | Should archive restore be Admin-only? | Yes, via `job.archive` / `customer.archive`. |
| Q6 | Should PDFs be retained forever? | Keep all versions for v1; add pruning later. |
| Q7 | Should sessions survive a server restart? | Yes, they are rows in SQLite; expired/revoked rows are cleaned on boot. |
| Q8 | Should the database be one file or one per domain? | One SQLite file; sessions, audit and rate limits share the transaction boundary. |
| Q9 | Nightly or hourly backups? | Nightly by default; the optional 15-minute cron is enabled when the RPO demands it. |
| Q10 | Should backups be encrypted locally? | Local files are `0600`; offsite copies are encrypted. Add local encryption if the host is shared. |
| Q11 | Who is alerted when a backup fails? | The ops owner via cron mail/dead-man's switch; the backup page shows the failure in-app. |
| Q12 | Is `backup.restore` an Admin action? | Yes, CLI-only in v1; the admin page can run a backup but not a restore. |
