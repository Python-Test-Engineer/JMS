# JMS — Job Management System

A TypeScript, mobile-first job management app for **Acme Windows** (a fictional
window-installation company). Managers create customers and jobs, assign
field-capable staff, engineers update work on site, customers track their own
jobs, and invoices/job sheets are generated as PDFs.

This is the implementation of [`_PLAN.md`](_PLAN.md) and [`_TECH.md`](_TECH.md).

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22+ (tested on Node 24), ES modules |
| Language | TypeScript 5.9, strict compiler settings |
| HTTP | Express 5 |
| Templates | Nunjucks, server-rendered HTML |
| Interactivity | HTMX 2 (vendored; every form works without JS) |
| Database | SQLite via `better-sqlite3`, WAL, foreign keys on |
| Passwords | Argon2id via `@node-rs/argon2` |
| Validation | Zod at configuration and HTTP boundaries |
| Dates / money | Luxon; integer pence and integer thousandths |
| PDFs | PDFKit |
| Logs | Pino structured JSON |
| Tests | Node test runner + `tsx` |

The UI is **mobile first**: base styles target a 360px phone, the navigation is
a slide-over, form controls are 48px high, and tables become stacked cards below
720px. Wider layouts add the sticky contents pane, multi-column forms and real
tables progressively.

## Quick start

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run build
npm run reset                 # creates data/jms.sqlite and loads demo data
npm start
# open http://localhost:3000
```

For live reload during development:

```bash
npm run dev
```

`npm run dev` uses `tsx` and seeds an empty database automatically in
development. `npm start` runs compiled JavaScript from `dist/`, so run
`npm run build` after pulling changes.

### Sample accounts

Every seeded account starts with password **`JMS123`** and is forced to choose a
new password on first sign-in.

| Role | Email |
|---|---|
| Admin | `admin@acme.example` |
| Admin | `admin2@acme.example` |
| Manager (field-capable) | `manager@acme.example` |
| Manager (field-capable) | `manager2@acme.example` |
| Engineer | `engineer1@acme.example` … `engineer8@acme.example` |
| Customer | `customer1@example.com` … `customer10@example.com` |

The seed creates **2 admins, 2 field-capable managers, 8 engineers, 10 customers
and 20 jobs — 2 per customer — spread across the next six calendar weeks** from
the seed anchor date. The anchor defaults to today (UTC) and can be pinned with
`SEED_DATE=YYYY-MM-DD` for reproducible tests.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` and copy views, assets and migrations |
| `npm start` | Run the compiled server |
| `npm run dev` | Watch TypeScript directly with `tsx` |
| `npm run typecheck` | Strict type check without emitting |
| `npm test` | Domain tests with the Node test runner |
| `npm run check` | Typecheck + tests |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:check` | Integrity, foreign-key and migration checks |
| `npm run seed` | Load demo data if the database is empty |
| `npm run seed:force` | Replace demo data (takes a backup first) |
| `npm run reset` | Delete the database and re-seed from scratch |
| `npm run backup` | Create and verify a manual snapshot |
| `npm run backup:verify` | Verify the newest snapshot |
| `npm run backup:prune` | Apply GFS retention |
| `npm run restore -- --from <name> --force` | Restore a verified snapshot |

Operational commands run `dist/cli/jms.js`; build first.

## Backups and restore

The database is a single SQLite file, so backups are a first-class feature.

```bash
npm run backup
npm run backup:verify
npm run backup:prune
```

A backup:

1. Takes an **online SQLite snapshot** while the app keeps running.
2. Runs `integrity_check` and `foreign_key_check` against the snapshot.
3. Writes a checksum (`.sha256`) and a JSON manifest with row counts.
4. Can copy the snapshot offsite with `BACKUP_OFFSITE_CMD`.

Snapshots live in `backups/` as:

```
jms-20261118T021500Z-nightly.db
jms-20261118T021500Z-nightly.db.sha256
jms-20261118T021500Z-nightly.json
```

Retention keeps the newest snapshot plus 30 daily, 12 weekly and 12 monthly
copies. Broken or unverified manifests are never pruned automatically.

### Cron

Install as `/etc/cron.d/jms-backup` (run as the unprivileged service user):

```cron
SHELL=/bin/sh
PATH=/usr/local/bin:/usr/bin:/bin
TZ=UTC

# Nightly snapshot at 02:15. flock prevents overlap with restore/migrate.
15 2 * * * jms cd /srv/jms && /usr/bin/flock -n /srv/jms/data/jms.ops.lock \
  /usr/bin/node dist/cli/jms.js backup --tag nightly >> /var/log/jms/backup.log 2>&1

# Verify the newest snapshot at 03:15.
15 3 * * * jms cd /srv/jms && /usr/bin/node dist/cli/jms.js verify --latest \
  >> /var/log/jms/backup.log 2>&1

# Prune at 03:45.
45 3 * * * jms cd /srv/jms && /usr/bin/node dist/cli/jms.js prune --apply \
  >> /var/log/jms/backup.log 2>&1
```

A systemd timer works equally well. A non-zero exit is the alert signal; point
cron mail or a dead-man's-switch monitor at the job. `/healthz` reports the age
and verification state of the newest backup.

### Restore

Stop the app, then:

```bash
npm run backup                         # safety copy of current data
npm run restore -- --from jms-20261118T021500Z-nightly --force
npm start
```

Restore refuses an unverified snapshot, keeps a pre-restore copy, removes stale
WAL sidecars, and revokes every session by default (`--keep-sessions` overrides).
After a restore, sign in again, open one job, one invoice and the audit log.

## Configuration

Copy `.env.example` to `.env`. Important variables:

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | dev fallback | Required in production; 32+ random characters |
| `DATABASE_FILE` | `data/jms.sqlite` | SQLite database path |
| `DOCUMENTS_DIR` | `storage/documents` | Generated PDFs |
| `BACKUP_DIR` | `backups` | Snapshots and manifests |
| `BACKUP_KEEP_DAILY/WEEKLY/MONTHLY` | `30/12/12` | GFS retention |
| `BACKUP_MAX_AGE_HOURS` | `36` | `/healthz` degrades above this |
| `BACKUP_OFFSITE_CMD` | — | Command run after a verified local backup |
| `SESSION_IDLE_MINUTES` | `60` | Idle session expiry |
| `SESSION_ABSOLUTE_HOURS` | `12` | Absolute session lifetime |
| `COOKIE_SECURE` | production | Secure cookie flag |
| `AUTO_SEED` | `false` | Seed an empty database on boot |
| `SEED_DATE` | today (UTC) | Pin the six-week seed horizon |
| `SQLITE_SYNCHRONOUS` | `FULL` in production | SQLite durability |

Configuration is parsed once with Zod in `src/config.ts`. No other module reads
`process.env`.

## Architecture

```
src/
  server.ts              HTTP listener + graceful shutdown
  app.ts                 Express app factory
  config.ts              Zod-parsed, frozen configuration
  db/
    migrations/          numbered, checksummed SQL
    connection.ts        SQLite pragmas and factory
    migrator.ts          forward-only migrations
    seed.ts              deterministic 20-job demo dataset
    rows.ts              row -> domain decoding
  domain/                permissions, status machine, money, dates
  auth/                  Argon2id, sessions, rate limits
  middleware/            request id, cookies, auth, CSRF, errors
  services/              jobs, invoices, customers, documents, admin
  routes/                thin controllers
  views/                 Nunjucks layouts/pages/partials
  public/                mobile-first CSS, progressive JS, HTMX
  backup/                snapshot, verify, retention, restore, status
  cli/jms.ts             migrate/seed/backup/verify/prune/restore/check
```

Rules that matter:

- Every write goes through a service and a SQLite transaction; the audit row is
  written in the same transaction.
- Routes never query the database directly and templates never mutate data.
- Object scoping is enforced server-side: cross-customer and cross-engineer
  requests return 404, not a hidden button.
- Mutable records use a `version` column; stale edits fail with a conflict instead
  of overwriting a colleague.
- Status changes use an exhaustive transition table; `INVOICED`/`PAID` are driven
  by the invoice service, not a free-form status button.
- Every write is validated with Zod or explicit service validation; SQL is always
  parameterised.

## Security notes

- Argon2id password hashing with OWASP-baseline parameters.
- Session tokens are random, HMAC-signed in the cookie, and stored only as
  SHA-256 hashes. Idle and absolute expiry are independent.
- CSRF tokens are checked on every unsafe request; session rotation happens on
  password change and sign-in.
- Login attempts are rate-limited in SQLite, so a restart does not reset the
  budget.
- Helmet CSP allows only local scripts/styles; HTMX is vendored.
- Audit log is append-only; password hashes, tokens and full request bodies are
  never recorded.
- Backups contain personal data: keep `backups/` mode `0700` and encrypt offsite
  copies (restic/rclone).

## Testing

```bash
npm run check
```

The suite covers the permission matrix defaults, the status machine, money and
quantity arithmetic. Add HTTP/workflow tests under `tests/` as the app grows;
the app factory in `src/app.ts` is designed for Supertest-style tests.

## Deployment sketch

```ini
[Service]
Type=simple
User=jms
WorkingDirectory=/srv/jms
EnvironmentFile=/srv/jms/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
TimeoutStopSec=15
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/jms/data /srv/jms/backups /srv/jms/storage
```

- Keep `data/`, `storage/` and `backups/` on persistent storage.
- Run `npm ci --omit=dev`, `npm run build`, `npm run db:migrate` (app stopped),
  then start the service.
- Health check: `GET /healthz`.
- Graceful shutdown drains requests, checkpoints WAL, optimises and closes the
  database.

## Notes

- Google sign-in is not part of v2; the app uses email/password only.
- Demo data is intentionally synthetic. `npm run reset -- --force` deletes the
  database and generated PDFs before re-seeding.
- Documentation pages (`_PLAN.html`, `_TECH.html`) are built separately with the
  `make-jms-html` skill.
