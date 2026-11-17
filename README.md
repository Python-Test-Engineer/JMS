# JMS — Job Management System

> ## Branch: `node`
>
> This branch contains the **Node.js + SQLite edition** of JMS. The application lives in
> [`src/`](src/), data is stored in [`jms.db`](jms.db), and server-rendered views are in
> [`src/views/`](src/views/).
>
> **Run it from the repository root:**
>
> ```bash
> npm install
> npm start
> # open http://localhost:3000
> ```
>
> The database is created and seeded automatically on first boot. To recreate the sample
> data from scratch, run `npm run reset`. For live-reload during development, use
> `npm run dev`.
>
> Sign in with `admin@acme.example` and password `JMS123` (every seeded account uses the
> same temporary password and must change it on first sign-in). See
> [Sample accounts](#sample-accounts) for the other roles.
>
> Requirements: Node.js 22.11+ (tested on Node 24). No build step is required.

A Node.js web application for **Acme Windows**, a fictional window-installation company.
It is built from [`_TECH.md`](_TECH.md): customers, jobs, scheduling, assignments, field
status updates, invoices, generated PDFs, a customer portal, insights, an editable
role × action permission matrix and an append-only audit log.

**Database:** SQLite in a single file, [`jms.db`](jms.db), created and seeded on first boot.
The original static browser demo (`src/index.html`, `src/js`, `src/css`) has been removed;
this is the server-rendered Node edition.

## Quick start

From the repository root:

```bash
npm install
npm start
# http://localhost:3000
```

The first boot creates `jms.db` and loads the sample dataset. To manage the database
separately:

```bash
npm run seed        # create the database if it does not exist
npm run seed:force  # replace existing sample data
npm run reset       # delete jms.db, clear generated PDFs and re-seed
npm run dev         # start with node --watch
```

Requirements: Node.js 22.11+ (tested on Node 24). SQLite uses the built-in `node:sqlite`
module, so there is no native build step.

## Sample accounts

Every seeded account starts with the password **`JMS123`** and must choose a new password
on first sign-in.

| Role | Email |
|---|---|
| Admin | `admin@acme.example` |
| Admin | `admin2@acme.example` |
| Manager (field-capable) | `manager@acme.example` |
| Manager (field-capable) | `manager2@acme.example` |
| Engineer | `engineer1@acme.example` … `engineer8@acme.example` |
| Customer | `customer1@example.com` … `customer10@example.com` |

The sample data matches the reference seed in `_TECH.md` §15:

- 2 admins, 2 field-capable managers, 8 engineers and 10 customer portal logins;
- 10 customers with 26 jobs in the reference distribution `[3,4,2,1,3,4,3,2,2,2]`;
- all eight job statuses represented;
- active assignments on every job, timeline events and sequential invoices;
- 7 seeded invoices across `INVOICED` and `PAID` states.

## What works

- **Authentication and sessions** — bcrypt cost 12, hashed session IDs in SQLite,
  HttpOnly cookies, CSRF tokens, forced first-sign-in password change, idle expiry and
  sign-out revocation.
- **Data-driven permissions** — 39 action keys × 4 roles, editable in
  **Admin → Roles & permissions**, enforced on every route and reflected in navigation.
  Safeguards protect the last active admin and block `admin.audit.view` for Customer and
  Engineer roles.
- **Jobs** — list with filters, create/edit, reference allocation (`JOB-YYYY-NNNN`),
  assignment with one lead, scheduling with advisory conflict warnings, controlled status
  transitions, internal/customer-visible notes and a timeline.
- **Customers** — create/edit, optional portal login, invite/reset and archive.
- **Invoices** — draft → issue → paid, void with a reason, gapless numbering
  (`INV-YYYY-NNNN`), one live invoice per job, PDF download.
- **PDFs** — job sheets and invoices generated on demand with PDFKit, versioned document
  rows with SHA-256 checksums. Customer/engineer job sheets omit prices and internal notes.
- **Customer portal** — only the customer's own jobs and non-draft invoices; guessed URLs
  return 404.
- **Insights** — operations dashboard, timeline, workload, financials and needs-invoicing.
- **Admin** — users, roles/permissions, company settings, audit log and archive/restore.
- **Appearance** — per-user light/dark/system mode, text size and line height.

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | Start the app on `PORT` (default 3000). |
| `npm run dev` | Start with `node --watch`. |
| `npm run seed` | Create data if the database is empty. |
| `npm run seed:force` | Replace the sample data (keeps the same schema). |
| `npm run reset` | Delete `jms.db`, clear generated PDFs and re-seed. |
| `npm test` | Domain and seed acceptance tests with the Node test runner. |

## Configuration

Copy `.env.example` to `.env` and adjust if needed. The app works with defaults in
development.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_FILE` | `jms.db` | SQLite file path |
| `PDF_DIR` | `storage/documents` | Generated PDFs |
| `SESSION_SECRET` | dev fallback | Required and 32+ characters in production |
| `SESSION_IDLE_MINUTES` | `60` | Idle expiry |
| `COOKIE_SECURE` | `false` | Must be `true` in production |
| `DEFAULT_PASSWORD` | `JMS123` | Temporary password for seed/invites |
| `COMPANY_TIMEZONE` | `Europe/London` | Display timezone; dates stored UTC |
| `VAT_RATE_BP` | `2000` | Default VAT in basis points |
| `SEED` | `20260316` | Deterministic seed value |

Production validation refuses to start if `SESSION_SECRET` is weak, `COOKIE_SECURE` is
false, or `NODE_ENV` is not `production`.

## Project layout

```
jms.db                      SQLite database (generated, ignored by git)
scripts/seed.js             seed / seed:force
scripts/reset.js            reset and re-seed
src/
  app.js                    Express app factory
  server.js                 listen and graceful shutdown
  config.js                 environment parsing with Zod
  db/
    schema.js               SQLite schema
    seed.js                 deterministic sample data and acceptance checks
    index.js                connection, helpers, transactions, audit
  domain/                   permissions, status machine, money, dates
  auth/                     passwords, sessions, rate limiting
  middleware/               auth, CSRF, permissions, errors, request IDs
  routes/                   auth, dashboards, jobs, customers, invoices, portal,
                            insights, admin, search
  services/                 access/scoping, jobs, invoices, documents
  views/                    Nunjucks layouts, pages, partials and macros
  public/                   CSS and progressive-enhancement JavaScript
tests/                      domain and seed tests
```

## Notes and deliberate limits

- **One process, one SQLite file.** Do not run multiple app instances against the same
  database file without moving to a client/server database.
- SQLite uses WAL mode and foreign keys. Money is stored as integer pence and VAT as
  integer basis points; timestamps are UTC ISO 8601.
- PDFs are generated on demand from live data; every download creates a new document
  version and audit row.
- The UI defaults to full-page forms and works without JavaScript. A small script adds a
  busy state and focuses the first invalid field.
- HTMX is not vendored in this build; the server still exposes a timeline fragment route
  and branches on `HX-Request` for small errors, so adding HTMX later is straightforward.
- Email/SMS delivery, online payments, uploads and multi-company tenancy remain out of
  scope for v1, matching `_PLAN.md`.

## Documentation

- [`_PLAN.md`](_PLAN.md) / [`_PLAN.html`](_PLAN.html) — product plan.
- [`_TECH.md`](_TECH.md) / [`_TECH.html`](_TECH.html) — technical specification.
- [`demo-explainers/index.html`](demo-explainers/index.html) — animated workflow explainers.
