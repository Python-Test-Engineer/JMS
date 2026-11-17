# Job Management System — Product Plan

> **What this is.** A product and business plan for **JMS**, a CMS + job tracker for
> *Acme Windows* (a fictional window-installation company). It is deliberately
> written **without code**: it says *what* the business needs, *who* may do it,
> *what* the screens do, and *how* we will know each stage is finished.
>
> **What happens next.** `_TECH.md` turns this into a technical specification —
> browser app, HTMX UI, Node service, SQLite first and Postgres later. Every
> requirement here is written so `_TECH.md` can answer it with a schema, a route,
> a template, or a test.
>
> **What "done" mimics.** The web edition of this plan, and the app's own
> documentation pages, reuse the house explainer system already used by the
> mini-js-coder site and book: one self-contained HTML file, two-pane sticky
> contents with filter and scroll-spy, terracotta/serif house style, and the
> floating **Aa** appearance panel.

---

## 1. Product frame

### 1.1 Problem

Acme Windows runs on paper, spreadsheets and phone calls. Managers juggle a
whiteboard of installations, engineers ring the office to say a job slipped, and
customers ring the office to ask when someone is coming. Nobody can answer
"what is happening next week, and with whom?" without three conversations.

### 1.2 Product in one sentence

JMS is one place where managers create customers and jobs, assign engineers and
dates, engineers report what happened on site, and customers watch their own
installation progress — with each person seeing only the parts of the app their
role allows.

### 1.3 Goals (v1)

| # | Goal | Success looks like |
|---|---|---|
| G1 | Single source of truth for jobs | Every scheduled job exists in JMS with dates, status and engineers |
| G2 | Engineers self-serve their day | An engineer opens JMS on a phone or laptop and sees only their jobs, with one obvious "update status" button |
| G3 | Customers stop ringing the office | A customer can log in and see status, dates and their documents for their own jobs |
| G4 | Managers see the plan | A week-forward timeline and workload view answers "who is where, when" |
| G5 | Paperwork is generated, not typed | Job sheet and invoice PDFs are produced from the same data |
| G6 | Admins change access without a developer | Role → action permissions are editable in the app and take effect immediately |
| G7 | The app is comfortable to use | Large type, large buttons, few steps, readable by office and field staff alike |

### 1.4 Non-goals for v1 (explicitly deferred)

- Email or SMS delivery of PDFs (download only in v1; the data model must not block it).
- Online payments, card processing, accounting-system sync.
- Stock/materials inventory, van tracking, route optimisation.
- Multi-company tenancy (but every core table carries a `company_id` so it can be added).
- Native mobile apps (responsive web only).
- Customer self-registration (invite-only, created by staff).

### 1.5 Guiding principles

1. **One obvious next action per screen.** Large primary button, plain verb.
2. **Visibility is not security.** Hiding a pill is a convenience; every rule is
   enforced on the server on every request.
3. **The job is the centre of the universe.** Customers, engineers, invoices,
   documents and events all hang off a job.
4. **Nothing is deleted, everything is archived and audited.** History answers
   "who changed this and when".
5. **Data-driven permissions.** Roles are rows, not `if` statements.
6. **Same design system as our published guides.** No second visual language.

---

## 2. Actors, roles and permissions

### 2.1 Roles

| Role | Who they are | What they care about | Default land-on screen |
|---|---|---|---|
| **ADMIN** | The system owner / office IT | Access, correctness, configuration | Admin dashboard |
| **MANAGER** | Office staff who sell and schedule | Pipeline, dates, engineers, money | Operations dashboard |
| **ENGINEER** | Field installers | Today's jobs, status, notes | My jobs |
| **CUSTOMER** | Acme's clients | When is my installation, what's happening | My jobs (portal) |

Each user has exactly **one** role in v1 (role assignment is per user, not per
job). A job may have **many** engineers.

### 2.2 Permission model (must be data-driven)

- Permissions are named **action keys** in the form `<area>.<verb>[.<scope>]`,
  e.g. `job.create`, `job.view.assigned`, `invoice.view.own`.
- A **role → action key → allowed** matrix is stored in the database and seeded
  with the defaults below.
- An **Admin** can toggle any cell except the safeguards listed in §2.5, and the
  change applies to the next request (no redeploy, no logout).
- The UI renders navigation pills and buttons from the same matrix, so an action
  the user cannot perform is never shown.
- Server-side authorisation is mandatory for every route and every HTMX partial;
  a hidden button is never the only defence.
- Every matrix change is written to the audit log with before/after values.

### 2.3 Default capability matrix

`✅` allowed, `—` denied by default. The **Action key** column is the literal
string used in the database and in `_TECH.md`.

| Area | Action key | ADMIN | MANAGER | ENGINEER | CUSTOMER |
|---|---|:--:|:--:|:--:|:--:|
| Customers | `customer.view.all` | ✅ | ✅ | — | — |
| Customers | `customer.view.own` | ✅ | ✅ | ✅ | ✅ |
| Customers | `customer.create` | ✅ | ✅ | — | — |
| Customers | `customer.edit` | ✅ | ✅ | — | — |
| Customers | `customer.invite` | ✅ | ✅ | — | — |
| Customers | `customer.archive` | ✅ | — | — | — |
| Jobs | `job.view.all` | ✅ | ✅ | — | — |
| Jobs | `job.view.assigned` | ✅ | ✅ | ✅ | — |
| Jobs | `job.view.own` | ✅ | ✅ | — | ✅ |
| Jobs | `job.create` | ✅ | ✅ | — | — |
| Jobs | `job.edit` | ✅ | ✅ | — | — |
| Jobs | `job.assign` | ✅ | ✅ | — | — |
| Jobs | `job.schedule` | ✅ | ✅ | — | — |
| Jobs | `job.status.advance` | ✅ | ✅ | ✅ | — |
| Jobs | `job.status.override` | ✅ | ✅ | — | — |
| Jobs | `job.note.add` | ✅ | ✅ | ✅ | — |
| Jobs | `job.cancel` | ✅ | ✅ | — | — |
| Jobs | `job.archive` | ✅ | — | — | — |
| Users | `user.view` | ✅ | — | — | — |
| Users | `user.create` | ✅ | — | — | — |
| Users | `user.edit.role` | ✅ | — | — | — |
| Users | `user.reset.password` | ✅ | ✅ | — | — |
| Users | `user.deactivate` | ✅ | — | — | — |
| Invoices | `invoice.view.all` | ✅ | ✅ | — | — |
| Invoices | `invoice.view.own` | ✅ | ✅ | — | ✅ |
| Invoices | `invoice.create` | ✅ | ✅ | — | — |
| Invoices | `invoice.issue` | ✅ | ✅ | — | — |
| Invoices | `invoice.mark.paid` | ✅ | ✅ | — | — |
| Documents | `document.job.pdf` | ✅ | ✅ | ✅ | ✅ |
| Documents | `document.invoice.pdf` | ✅ | ✅ | — | ✅ |
| Insights | `insight.operational` | ✅ | ✅ | — | — |
| Insights | `insight.financial` | ✅ | ✅ | — | — |
| Insights | `insight.workload` | ✅ | ✅ | — | — |
| Insights | `insight.timeline` | ✅ | ✅ | ✅ | — |
| Admin | `admin.roles.manage` | ✅ | — | — | — |
| Admin | `admin.permissions.edit` | ✅ | — | — | — |
| Admin | `admin.settings.manage` | ✅ | — | — | — |
| Admin | `admin.audit.view` | ✅ | — | — | — |
| Admin | `admin.theme.default` | ✅ | — | — | — |

### 2.4 Object-level scoping rules (hard rules, not toggles)

These are business invariants. Changing them would be a code change, not a
permission cell:

1. A **Customer** user resolves to exactly one `customer_id`; every query they
   make is filtered by it. They can never address another customer's job by ID.
2. An **Engineer** sees only jobs where they have an active assignment, plus
   jobs they completed in the last 90 days (for "what did I do" questions).
3. A **Customer** never sees: other customers, cost/price breakdowns of any job,
   company financial dashboards, engineer phone numbers or internal notes marked
   internal.
4. An **Engineer** never sees: customer pricing, invoices, other engineers'
   schedules beyond their own jobs, admin screens.
5. An **Engineer** may only advance status **forward** on their own assigned
   jobs. Overriding, reverting, cancelling or reopening is a Manager/Admin act.
6. **Managers and Admins** see everything except the permission matrix and user
   administration, which are Admin-only by default.

### 2.5 Safeguards the matrix may not remove

- At least one active **ADMIN** must always exist.
- An Admin cannot remove their own `admin.permissions.edit` if they are the last Admin.
- `admin.audit.view` cannot be granted to CUSTOMER or ENGINEER.
- Every matrix edit is audited and cannot be silently reverted without a new audit row.

---

## 3. Domain model (conceptual)

`_TECH.md` will translate these into tables, keys and constraints. The model is
stated in business language first, with the attributes v1 needs.

### 3.1 Entities

**Company** — `id`, `name` ("Acme Windows"), `trading_name`, `email`, `phone`,
`address`, `vat_number`, `logo_path`, `currency` (GBP), `timezone`
(Europe/London), `default_theme`.

**User** — `id`, `company_id`, `email` (unique, login name), `password_hash`,
`display_name`, `role_id`, `customer_id` (nullable; set only for CUSTOMER),
`phone`, `status` (INVITED / ACTIVE / SUSPENDED / ARCHIVED),
`must_change_password`, `theme_prefs` (JSON: mode, type, fonts, colours),
`last_login_at`, `created_at`.

**Role** — `id`, `key` (ADMIN, MANAGER, ENGINEER, CUSTOMER), `label`,
`description`, `is_system` (system roles cannot be deleted, only re-permissioned).

**Permission** — `role_id`, `action_key`, `allowed`. Composite primary key.

**Customer** — `id`, `company_id`, `name`, `contact_name`, `email` (unique per
company), `phone`, `address_line1/2`, `town`, `postcode`, `notes`,
`status` (ACTIVE / ARCHIVED), `created_at`, `created_by`.
A Customer is both a *record* and, optionally, a *login* (one User with the
CUSTOMER role pointing at it).

**Job** — `id`, `company_id`, `reference` (human-readable, e.g. `JOB-2026-0042`,
unique), `customer_id`, `title`, `description`, `work_type`
(e.g. WINDOW_INSTALL, REPAIR, SURVEY), `status` (see §3.3),
`priority` (NORMAL / URGENT), `site_address` (defaults to the customer's),
`planned_start`, `planned_end`, `actual_start`, `actual_end`,
`price_net`, `vat_rate`, `price_gross` (Manager-only; hidden from Engineer and
Customer), `internal_notes`, `customer_notes`, `created_by`, `created_at`,
`updated_at`, `archived_at`.

**JobAssignment** — `job_id`, `user_id` (must hold ENGINEER role), `is_lead`,
`assigned_at`, `assigned_by`, `removed_at` (soft removal keeps history).

**JobEvent** — `id`, `job_id`, `actor_user_id`, `type`
(STATUS_CHANGE / ASSIGNMENT / SCHEDULE_CHANGE / NOTE / DOCUMENT / PRICE_CHANGE),
`from_value`, `to_value`, `message`, `visibility` (INTERNAL / CUSTOMER), `at`.
This single log powers the job timeline, the customer-visible history and the
audit trail.

**Invoice** — `id`, `company_id`, `number` (`INV-2026-0007`, gapless per year),
`job_id`, `status` (DRAFT / ISSUED / PAID / VOID), `issued_at`, `due_at`,
`paid_at`, `net`, `vat_rate`, `vat`, `gross`, `notes`, `created_by`.
One job has at most one live invoice in v1 (re-issue = void + new).

**Document** — `id`, `type` (JOB_SHEET / INVOICE), `entity_type`, `entity_id`,
`version`, `generated_at`, `generated_by`, `file_path`, `checksum`.
Documents are regenerable; the row records that a PDF was produced and from
which version of the data.

**Setting** — `key`, `value` (company defaults: VAT rate, invoice due days,
default password policy flags, theme defaults, PDF footer text).

**Session / AuthToken** — server-side session record (`_TECH.md` decides cookie
vs token), with expiry, user agent, and revocation for password resets.

### 3.2 Relationships at a glance

```
Company 1─n User          Company 1─n Customer 1─n Job n─n User (assignments)
Company 1─n Job           Job 1─n JobEvent        Job 1─0..1 Invoice
Role    1─n User          Role 1─n Permission     Job 1─n Document
Customer 1─0..1 User (the customer's login)
```

### 3.3 Job status machine

| Status | Meaning | Entered by | Allowed next |
|---|---|---|---|
| `DRAFT` | Being prepared, not committed | Manager, Admin | SCHEDULED, CANCELLED |
| `SCHEDULED` | Dates and at least one engineer set | Manager, Admin | IN_PROGRESS, ON_HOLD, CANCELLED, SCHEDULED (reschedule) |
| `IN_PROGRESS` | Engineer on site / work started | Engineer (own job), Manager, Admin | COMPLETED, ON_HOLD |
| `ON_HOLD` | Blocked (parts, weather, access) | Engineer (own job), Manager, Admin | IN_PROGRESS, CANCELLED |
| `COMPLETED` | Work finished | Engineer (own job), Manager, Admin | INVOICED, IN_PROGRESS (reopen: Manager/Admin only) |
| `INVOICED` | Invoice issued | Manager, Admin | PAID, COMPLETED (void invoice: Manager/Admin) |
| `PAID` | Invoice settled | Manager, Admin | — (terminal) |
| `CANCELLED` | Job abandoned | Manager, Admin | — (terminal) |

Rules attached to the machine:

- Leaving `DRAFT` requires `planned_start`, `planned_end` and ≥ 1 engineer.
- Entering `IN_PROGRESS` stamps `actual_start` if empty; entering `COMPLETED`
  stamps `actual_end`. Manager/Admin may correct actual dates afterwards
  (`job.status.override`).
- Every transition writes a `JobEvent` with actor, from, to and optional note.
- A status a user may not set is not rendered for that user.

---

## 4. Workflows

Each workflow is written as a numbered path with a clear end state and the
screens involved. `_TECH.md` should be able to derive routes, forms, validation
and tests from these.

### W1 — Add a customer and give them a login

1. Manager opens **Customers → New customer**.
2. Fills name, contact, email, phone, address (single column, large fields).
3. Chooses *Create customer login* (on by default). Email becomes the login name;
   the default password `JMS123` is set and flagged `must_change_password`.
4. Saves → customer record created, User (CUSTOMER role) created, status `INVITED`,
   audit event recorded, confirmation shows the login email and the fact that
   the password must be changed at first sign-in.
5. If the email already exists, the form explains which record uses it and how to
   open that customer instead (no duplicate customers, no silent merge).

**End state:** customer exists, can sign in, sees an empty "My jobs" page and a
prompt to change their password.

### W2 — Create a job

1. Manager opens **Jobs → New job** (or **New job** from a customer page, which
   pre-fills the customer).
2. Enters title, work type, description, priority, site address, price
   (Manager/Admin only), customer notes.
3. Saves as `DRAFT` → job reference is allocated and shown immediately.
4. The job page offers the next steps as large pills: *Assign engineers*,
   *Set dates*, *Publish schedule*.

**End state:** a `DRAFT` job with a reference that anyone can search for.

### W3 — Assign engineers and plan dates

1. On the job page, Manager opens **Assign engineers** (multi-select of active
   ENGINEERs, one marked lead).
2. Sets `planned_start` / `planned_end` (date + time block: morning/afternoon/all day).
3. Saves → status may move to `SCHEDULED` (system asks once, defaulting to yes).
4. Booking conflict check: warn if an engineer already has an overlapping job;
   warning is advisory in v1, not a hard block.
5. Engineers see the job under **My jobs** immediately, with a "dates set"
   notification marker in the app (no email in v1).

**End state:** job is `SCHEDULED`, appears on the timeline and in each
engineer's list.

### W4 — Engineer updates a job on site

1. Engineer signs in on a phone → lands on **My jobs**, today first.
2. Opens a job → big status control showing only the transitions they may take
   (*Start job*, *Hold*, *Complete*).
3. Optionally adds a note and a customer-visible message.
4. Tapping *Start job* sets `IN_PROGRESS` and stamps the actual start; *Complete*
   asks for a short completion note, then stamps the actual end.
5. The job's timeline shows the change, and the customer sees the new status
   (and the customer-visible note) on their next visit.

**End state:** status, actual times and notes are recorded by the person who did
the work, from the place where it happened.

### W5 — Manager closes out and invoices

1. Manager sees `COMPLETED` jobs needing invoices under **Insights → Needs invoicing**.
2. Opens the job → **Create invoice**. Net/VAT/gross default from the job price
   and company VAT setting; invoice number is allocated.
3. Saves as `DRAFT`, reviews the PDF preview, then **Issue** → status `INVOICED`,
   job moves to `INVOICED`, invoice PDF becomes downloadable to the customer.
4. When payment lands, Manager marks **Paid** → job `PAID`.

**End state:** one invoice, one PDF, one audit trail, and a customer who can
download the invoice without asking.

### W6 — Customer checks progress

1. Customer signs in (email + `JMS123`, forced to change on first login).
2. Lands on **My jobs**: cards with reference, title, status pill, planned dates,
   assigned lead engineer's first name, and a link to details.
3. Job detail shows a plain-language status, planned and actual dates, the
   customer-visible timeline, and a **Documents** list (job sheet, invoice).
4. No prices beyond their own invoice, no other customers, no company dashboards.

**End state:** the customer's question is answered without a phone call.

### W7 — Generate the job sheet and invoice PDFs

1. Any user with `document.job.pdf` opens a job → **Job sheet (PDF)**.
2. The PDF is generated from live data on demand, branded with company name,
   address and logo, and stamped with the generation time.
3. Invoice PDFs are downloadable once the invoice is `ISSUED` (or to
   Manager/Admin while `DRAFT`).
4. If the job changes after generation, the next download reflects the new data;
   the `Document` row records version and time (no stale cached PDFs in v1).

**End state:** printable artefacts with zero retyping. Emailing them is a later
milestone that only needs a delivery service, not a data change.

### W8 — Admin adjusts what a role can do

1. Admin opens **Admin → Roles & permissions**.
2. Sees the role × action matrix from §2.3 with the current state, grouped by area.
3. Toggles a cell, sees a one-line explanation of the effect and its blast radius
   ("Engineers will be able to cancel their own jobs"), saves.
4. Change takes effect on the next request; affected nav pills appear/disappear;
   an audit row records actor, role, action key, before, after, timestamp.
5. Admin cannot break the safeguards in §2.5; those cells are disabled with a reason.

**End state:** access policy is an office decision, not a release.

### W9 — A user changes how the app looks

1. Any signed-in user clicks the **Aa** button (same control as our published guides).
2. Panel offers **System / Light / Dark**, type size, line height, layout width,
   font stacks and colour tokens; changes preview live.
3. Saving stores the preferences on the user record, so the look follows them to
   any device.
4. Admin sets the company default theme (used for users who never customise).
5. Only design tokens change; layout, permissions and content never do.

**End state:** comfortable reading for a 55-year-old installer in sunlight and an
office manager in a dark room, without a second stylesheet.

### W10 — Find things and see the plan

1. Global search box in the header: type a job reference, customer name,
   postcode, engineer name, or invoice number → grouped results, each opening the
   right record.
2. **Insights → Timeline** shows a horizontal week/month view of jobs by planned
   dates, filtered by engineer and status.
3. **Insights → Workload** shows jobs per engineer for a chosen week.
4. **Insights → Financials** (Manager/Admin) shows quoted vs invoiced vs paid,
   with a date range.

**End state:** "what is happening next week and with whom" answered in one screen.

---

## 5. Screens and navigation

### 5.1 App shell

- **Top bar (few horizontal items only):** brand, global search, `Dashboard`,
  `Jobs`, `Customers`, `Insights`, `Admin` (only if the user has any admin
  permission), user menu (name, appearance, change password, sign out).
- **Left table of contents:** grouped sections, each action as a **pill**. Pills
  are filtered by permission — a Customer sees three or four pills in total.
- **Content pane:** one primary action per screen, large controls, generous
  whitespace; a breadcrumb for context.
- **Mobile:** top bar collapses to brand + search + menu; the left TOC becomes a
  slide-over; tables become stacked cards; the status control is a full-width
  button row (thumb-reachable).

### 5.2 Screen inventory

| Screen | Route intent | Primary action | Visible to |
|---|---|---|---|
| Sign in | email + password | Sign in | all |
| First sign-in / change password | forced password change | Save new password | all |
| Operations dashboard | today, this week, exceptions | Open today's jobs | ADMIN, MANAGER |
| Engineer dashboard | today's jobs, next 7 days | Update status | ENGINEER |
| Customer dashboard ("My jobs") | own jobs by status | Open job | CUSTOMER |
| Jobs list | filter by status, engineer, date, customer | New job | ADMIN, MANAGER |
| My jobs | assigned jobs, today first | Update status | ENGINEER |
| Job detail | everything about one job + timeline | context-dependent (next status / edit / invoice) | all, scoped |
| Job create / edit | single-column form | Save job | ADMIN, MANAGER |
| Job assign | engineers + lead | Save assignments | ADMIN, MANAGER |
| Job schedule | planned dates + slot | Save schedule | ADMIN, MANAGER |
| Customer list | search + status filter | New customer | ADMIN, MANAGER |
| Customer detail | contact, jobs, logins | New job for this customer | ADMIN, MANAGER |
| Customer create / edit | single-column form + "create login" | Save customer | ADMIN, MANAGER |
| Invoice list | status filter, totals | New invoice | ADMIN, MANAGER |
| Invoice detail | line summary, PDF, actions | Issue / Mark paid | ADMIN, MANAGER |
| Invoice detail (customer) | own invoice, PDF | Download PDF | CUSTOMER |
| Documents | generated PDFs for a job | Download | scoped |
| Insights: timeline | week/month Gantt-like list | Filter | ADMIN, MANAGER, ENGINEER (own) |
| Insights: workload | jobs per engineer | Change week | ADMIN, MANAGER |
| Insights: financials | quoted/invoiced/paid | Change range | ADMIN, MANAGER |
| Search results | grouped jobs/customers/invoices | Open record | all, scoped |
| Users | all users, role, status | New user | ADMIN |
| User detail | role, status, reset password, theme reset | Save | ADMIN |
| Roles & permissions | the §2.3 matrix | Save changes | ADMIN |
| Company settings | name, VAT, invoice terms, default theme, PDF footer | Save | ADMIN |
| Appearance (Aa panel) | type, layout, fonts, colours | Save / Copy theme | all |
| Audit log | filterable event list | Filter by job/user | ADMIN |
| Archived customers/jobs | restore | Restore | ADMIN |

### 5.3 Empty, error and edge states (must be designed, not left blank)

- **Empty list:** one sentence explaining what would appear, plus the primary
  create action (only if the user may create).
- **Permission denied:** a plain explanation and a "back to my work" link — never
  a raw 403 page.
- **Not found / archived:** say it exists but is archived, with the reference.
- **Save success:** inline confirmation near the action, plus the changed value
  visible; no silent saves.
- **Validation failure:** field-level message in plain language, existing input
  preserved, focus moved to the first problem.
- **Session expiry:** return to sign-in with an explanation; the form is not lost
  where avoidable (draft job data in the browser for create forms only).

---

## 6. UX and accessibility requirements

These are testable requirements, not aspirations.

| # | Requirement |
|---|---|
| U1 | Body text is **18–20px** at default zoom; never below 16px for any interface text. |
| U2 | Primary buttons are at least **48px** tall, with a minimum 44×44px hit area everywhere. |
| U3 | Forms are **single column**, labels above fields, no placeholder-only labels. |
| U4 | One **primary** action per screen; secondary actions are visually quieter pills. |
| U5 | Common tasks fit a **three-step** budget: from sign-in to updating a status is ≤ 3 taps/links. |
| U6 | Status is always shown as **word + colour pill** (not colour alone). |
| U7 | Contrast meets **WCAG 2.2 AA** (4.5:1 body, 3:1 large text) in both light and dark modes. |
| U8 | Every interactive element is reachable by keyboard with a visible focus ring; the Aa panel closes on `Escape`. |
| U9 | Works from **360px** wide upwards; no horizontal page scroll; tables scroll inside their own container. |
| U10 | Dates are unambiguous (`Tue 17 Mar 2026, 09:00`) and honour the company timezone. |
| U11 | Language is plain and active ("Complete job", not "Submit"); no jargon on customer screens. |
| U12 | Destructive or irreversible actions (cancel job, void invoice, archive) ask for confirmation that names the record. |
| U13 | Loading states are visible within 300ms for any action that takes longer; no double-submits. |
| U14 | Respects `prefers-reduced-motion`; no animation is required to understand a state change. |
| U15 | Print stylesheets hide navigation, filters and the Aa panel; job sheet and invoice print on A4 with page numbers. |

---

## 7. Visual design, theming and the guide system

### 7.1 House style

The app, this plan and the generated PDFs share the design system already used by
the mini-js-coder explainers and book — warm paper, terracotta accent, serif
headings, sans interface text, mono for references and code.

- Palette sources: `skills/anthropic-html-style/references/anthropic-ui.css`
  (tokens, components) and `skills/make-book/assets/book_theme.toml` (book/guide
  theme keys, light and dark).
- Typography: serif display for page and section titles; system sans for
  controls and prose; mono for job references, invoice numbers and dates in
  tables.
- Surfaces: ivory cards on paper, 1px `--line` borders, 12–16px radii, soft
  shadows; no gradients, no heavy borders, no competing accent colours.
- Do not fork the palette per screen. One set of CSS custom properties, scoped
  page overrides only.

### 7.2 Appearance ("Aa") panel — parity with the guides

The in-app appearance panel must behave like the one shipped in our generated
book pages:

- Round **Aa** button fixed top-right; panel opens directly below it.
- Exactly three colour modes: **System**, **Light**, **Dark**; System resolves
  through `prefers-color-scheme` and writes the resolved mode to
  `html[data-theme]` so sidebar and content switch together.
- Controls for **Type** (`--fs-content`, `--lh-content`, `--fs-ui`), **Layout**
  (`--sidebar`, `--measure`), **Fonts** (curated dropdowns for serif, sans,
  mono) and every colour token, grouped by Light/Dark.
- Font choices are `<select>` dropdowns, never free text; an unknown saved stack
  survives as a `Custom` option.
- **Reset** restores company defaults; **Copy theme** exports the current values
  as TOML in the same key names as `book_theme.toml`, so a user’s favourite look
  can be pasted into the company theme file.
- State persists on the **user record** (not only in the browser) and re-applies
  before first paint to avoid a flash of the wrong theme.
- Panel is hidden in print and on small screens; it never affects permissions,
  layout structure or content.

### 7.3 Company default theme

An Admin can set the default mode, type scale and palette in **Company settings**.
Resolution order: user preference → company default → built-in house theme.

---

## 8. Documents (PDF) requirements

| Document | Contents | Rules |
|---|---|---|
| **Job sheet** | Company header/logo, job reference, customer and site address, work description, assigned engineers, planned dates, status, customer-visible notes, generation timestamp | A4, printable in monochrome, no internal notes, no prices for customers |
| **Invoice** | Company header/logo and VAT number, invoice number, issue and due dates, customer and site address, job reference, line items (description, qty, unit, amount), net/VAT/gross, payment terms and footer text | A4, gapless numbering, `VOID` watermark when voided, downloadable by the customer once issued |

Design rules: reuse the print styles from the guide system; page numbers in the
footer; a printed contents page is not needed (both documents are short); PDF
generation is server-side and recorded in `Document`.

---

## 9. Security, audit and data protection

| # | Requirement |
|---|---|
| S1 | Passwords hashed with a modern adaptive algorithm; default `JMS123` is only a starting value and must be changed at first sign-in. |
| S2 | Sessions expire after inactivity (default 60 minutes) and are revoked on password change, role change or deactivation. |
| S3 | Authorisation is checked server-side on every request and every partial; object scoping per §2.4 is tested, not assumed. |
| S4 | CSRF protection on all state-changing requests; the app never trusts hidden form fields for role or ownership. |
| S5 | Login rate-limited; repeated failures logged with IP and user agent. |
| S6 | Every job status change, assignment change, price change, permission change, invoice action and user change writes an audit record (actor, when, before, after). |
| S7 | Customer-visible notes and internal notes are different fields with different visibility; the UI states which is which. |
| S8 | Backups: daily database backup with a documented restore drill; restore is verified before go-live. |
| S9 | Archiving replaces deletion for jobs and customers; invoices are never deleted, only voided. |
| S10 | Personal data is limited to what the job needs; a customer can view their own contact details and ask the office to correct them (v1: no self-service edit). |
| S11 | No secrets in the repository; configuration comes from environment variables (`.env` locally, host config in production). |

---

## 10. Non-functional requirements

| # | Area | Requirement |
|---|---|---|
| N1 | Performance | Server-rendered pages respond in < 300ms at p95 with the seeded dataset (see N6); lists paginate at 25 rows. |
| N2 | Availability | Single-host deployment is acceptable for v1; a restart must not lose committed data. |
| N3 | Portability | SQLite in development, Postgres in production, **one schema, no SQLite-only SQL**; migrations are versioned and reversible. |
| N4 | Accessibility | WCAG 2.2 AA target verified with keyboard-only walkthroughs and automated checks. |
| N5 | Browser support | Current Chrome, Edge, Firefox, Safari; iOS Safari and Android Chrome for field use. |
| N6 | Seed data | A reproducible demo dataset: Acme Windows, 1 admin, 2 managers, 5 engineers, 20 customers, 60 jobs spanning past/present/future, 15 invoices. |
| N7 | Testability | Every workflow in §4 has an automated test at the HTTP level, including negative permission tests. |
| N8 | Observability | Structured request logs, an error log, and an audit view in-app; no personal data or secrets in logs. |
| N9 | Maintainability | One styling system, no per-page CSS forks; components documented in `_TECH.md`. |
| N10 | Time | All timestamps stored in UTC, rendered in the company timezone. |
| N11 | Money | Stored as integer minor units or fixed-precision decimals — never floats; VAT rate configurable. |

---

## 11. Delivery milestones

Each milestone is a vertical slice that can be demonstrated. `_TECH.md` should
turn these into a task list with schema, routes, templates and tests.

| # | Milestone | Includes | Acceptance |
|---|---|---|---|
| **M0** | Contract | This plan signed off; `_TECH.md` written; decisions in §13 answered | Tech spec covers every action key, entity, workflow and acceptance row |
| **M1** | Foundations | Project scaffold, config, app shell (top bar + left TOC pills), auth, sessions, role seed, permission matrix, audit skeleton, theme tokens, Aa panel | Four seeded users of each role can sign in and see role-appropriate pills; denied routes return a friendly page; a matrix change hides/shows a pill without restart |
| **M2** | People | Customers CRUD + invite-login, Users admin, password reset, first-sign-in change flow, company settings | W1 works end to end; default password forces change; audit rows written |
| **M3** | Jobs | Job create/edit, references, job detail, assignments, schedule, conflict warning, jobs list with filters | W2 + W3 work; `DRAFT → SCHEDULED` blocked without dates and an engineer |
| **M4** | Field | My jobs, status control with allowed transitions only, actual timestamps, notes (internal vs customer), job timeline | W4 works on a phone; engineer cannot take a disallowed transition; timeline renders events |
| **M5** | Customer portal | My jobs, job detail, documents list, scoped queries | W6 works; a customer cannot reach another customer's job even by guessing the URL |
| **M6** | Money & paper | Invoices, numbering, issue/void/paid, job sheet + invoice PDFs, print styles | W5 + W7 work; PDFs match the spec in §8; numbers are gapless |
| **M7** | Insight | Global search, operations/engineer dashboards, timeline, workload, financials | W10 works; every dashboard respects role scoping and date ranges |
| **M8** | Hardening | Full audit view, backups and restore drill, accessibility pass, performance pass, seed dataset, documentation pages built from Markdown | §12 checklist passes; restore drill recorded; a11y walkthrough clean |

### 11.1 Sequence and dependencies

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8
              └────────┴──── M5 depends on M3, M4 (status + timeline)
                        └──── M6 depends on M3 (job price) and M5 (customer downloads)
```

### 11.2 Documentation deliverables (same system as the book)

- `_PLAN.md` → plan page (this document) rendered as a two-pane guide.
- `_TECH.md` → technical spec page, same shell and Aa panel.
- App help pages (per role) authored in Markdown, built into the same guide
  shell so a Customer, Engineer and Manager each get a short "how to use JMS"
  page with the same typography.
- Optional PDF export of `_PLAN.md` / `_TECH.md` through the print stylesheet.

---

## 12. Definition of done (v1 acceptance checklist)

- ☐ All four roles can sign in, change password, and see only their permitted navigation.
- ☐ Permission matrix is editable in-app, enforced server-side, and every change is audited.
- ☐ A manager can add a customer, create a job, assign engineers, set dates and schedule it (W1–W3).
- ☐ An engineer can see only assigned jobs and advance allowed statuses from a phone (W4).
- ☐ A customer sees only their own jobs, statuses, dates and documents (W6).
- ☐ Job sheet and invoice PDFs generate from live data and print cleanly on A4 (§8).
- ☐ Invoice numbering is gapless and voiding works without deleting records.
- ☐ Search, timeline, workload and financial dashboards work within role scope (W10).
- ☐ Audit log answers "who changed this job and when" for status, assignment, price and permissions.
- ☐ Light, dark and system modes work; user preferences persist and follow the user; admin default applies.
- ☐ All §6 UX rules verified: type sizes, hit areas, contrast, keyboard, 360px layout.
- ☐ All §9 security rules tested, including cross-customer and cross-engineer access attempts.
- ☐ Seed dataset loads from scratch; SQLite and Postgres both pass the same test suite.
- ☐ Backup taken and restored successfully on a clean machine.
- ☐ Plan, tech spec and help pages published in the house guide style.

---

## 13. Decisions needed before `_TECH.md`

| # | Question | Recommendation | Impact if unanswered |
|---|---|---|---|
| D1 | Invite-only customers, or self-registration? | Invite-only (staff create the login) | Auth and onboarding flows |
| D2 | Can an engineer see the customer's phone number? | Yes (needed on site), but not in exports | Field usability |
| D3 | Can an engineer see job price? | No | Job detail template, queries |
| D4 | VAT: include in v1? | Yes, single configurable rate (default 20%) | Invoice schema, PDF |
| D5 | Currency and locale | GBP, `en-GB`, Europe/London | Formatting, tests |
| D6 | Job reference format | `JOB-YYYY-NNNN`, per-year sequence | Numbering service |
| D7 | Email delivery of PDFs | Deferred to v1.1; keep a delivery table stub | Scope, data model |
| D8 | Photo attachments from site | Deferred; storage approach chosen now to avoid schema churn | Future migration |
| D9 | Permission granularity beyond §2.3 | Start with §2.3 exactly; add keys only when a real need appears | Matrix size, UI |
| D10 | HTMX partial vs full-page rendering strategy | Progressive enhancement: full-page forms, HTMX for filters, lists, status control | Templating split |
| D11 | Session strategy (cookie + server session vs signed token) | Server-side session with an HTTP-only cookie | Auth implementation |
| D12 | Audit retention | Keep indefinitely in v1; revisit at scale | Storage, export |

---

## 14. Traceability — idea to plan

| `_IDEA.md` requirement | Where it is handled |
|---|---|
| CMS + job tracker | §1.2, §3, §5 |
| Company, engineers, managers, admins | §2.1 |
| Customers added, users added, permissions changed | W1, W8, §2.2 |
| Customers get a login (email + default `JMS123`) | W1, §9 S1 |
| All users log in with restricted access and component visibility | §2.3–2.5, §5.1 |
| Workflows: add customer, job ticket, assign engineers, work date, status, customer view | W1–W6 |
| PDF job and invoice download before email | W7, §8, D7 |
| Dashboards by user rights | §5.2, W10, M7 |
| Search customers, jobs, by job, by engineer | W10, N1 |
| Timeline dashboard for start/end dates | W10, §5.2 |
| Job fields: details, customer, engineers, status, planned and actual dates | §3.1 Job, §3.3 |
| Permissions: ADMIN, MANAGER, ENGINEER, CUSTOMER | §2.1–2.3 |
| Anthropic styling + user-changeable appearance | §7 |
| Few horizontal nav items + left TOC pills by user level | §5.1 |
| Editable table of access level → action visibility | §2.2–2.3, W8 |
| Simple UX, larger fonts and buttons, easy steps | §6 |
| Browser app, HTMX, Node, SQLite then Postgres | §10 N3, D10, D11 |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Job** | One piece of work for one customer at one site, from draft to paid. |
| **Assignment** | The link between a job and an engineer, with a lead flag. |
| **Pill** | A rounded navigation/action control in the left table of contents. |
| **Action key** | A stable permission string such as `job.assign`. |
| **Scoping** | Filtering rows by the signed-in user's customer or assignment, not by the URL. |
| **Actual vs planned** | Planned dates are promised; actual dates are what happened. |
| **Gapless numbering** | Invoice numbers have no missing values; voids stay in the sequence. |
| **Aa panel** | The floating appearance customiser shared with our published guides. |
| **House style** | Warm paper, terracotta accent, serif headings — the guide design system. |

---

> **Reminder of scope.** JMS v1 is a small-business job tracker. It is not a
> production-grade platform for thousands of users, and it makes no claims about
> compliance beyond the practices listed in §9. Anything not in §1.3 is out of
> scope until a later plan says otherwise.
