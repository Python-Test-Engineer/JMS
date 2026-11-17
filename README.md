# JMS — Job Management System

A CMS + job tracker for **Acme Windows**, a window-installation company. JMS replaces
paper, spreadsheets and phone calls with one place where managers create customers and
jobs, engineers report what happened on site, and customers watch their own installation
progress — each seeing only what their role allows.

> **Status: planning.** There is no application code yet. This repository currently holds
> the idea brief, the product plan and their rendered HTML guides. `_TECH.md` turns the
> plan into a technical specification, and only then does the app get written in `src/`.

---

## How this repo is built (the process)

The repository is a chain of four artefacts. Each one is the **only** input to the next,
and each one is finished and reviewed before the next begins. Nothing downstream is
started early — in particular, no application code is written until `_TECH.md` exists.

```
_IDEA.md  ──►  _PLAN.md  ──►  _TECH.md  ──►  src/
 (ideas)      (product)      (technical)     (app)
```

`_PLAN.html` and `_TECH.html` are not a fifth stage — they are the same two documents
rendered as single-file, house-styled pages by the `make-jms-html` skill, so the plan and
spec can be read, searched and shared without an editor.

| # | Stage | Source | Produces | Rule |
|---|---|---|---|---|
| 1 | **Ideas** | human | [`_IDEA.md`](_IDEA.md) | Loose brief. Rough notes, wishes, constraints. **No** structure required. |
| 2 | **Plan** | `_IDEA.md` | [`_PLAN.md`](_PLAN.md) → [`_PLAN.html`](_PLAN.html) | Product/business view. **No code.** Goals, roles, permissions, domain model, workflows, screens, UX rules, milestones, acceptance criteria, open decisions. Traceable back to every idea. |
| 3 | **Tech spec** | `_PLAN.md` only | `_TECH.md` → `_TECH.html` | Technical view: schema, migrations, routes, templates, auth, components, tests, task list. Every plan requirement must map to a schema/route/template/test. Decisions in `_PLAN.md` §13 are resolved here. |
| 4 | **Application** | `_TECH.md` only | `src/` (+ tests, `package.json`) | Implementation. Built milestone by milestone in the order `_PLAN.md` §11 sets. No feature that is not in `_TECH.md`. |

### Stage rules

1. **One direction only.** `_IDEA.md` → `_PLAN.md` → `_TECH.md` → `src/`. If a later stage
   needs something the earlier one does not have, the earlier document is amended first
   (and re-rendered), never patched around in code.
2. **`_PLAN.md` says what and why.** It must not contain code, schema or framework
   choices beyond the agreed stack note (browser app, HTMX, Node, SQLite → Postgres).
   It **may** say "the tech spec must decide X" — those are the §13 decisions.
3. **`_TECH.md` says how.** It owns file layout, schema, route table, permission
   enforcement points, template inventory, test plan and the ordered task list. If a plan
   requirement is missing from it, `_TECH.md` is incomplete.
4. **`src/` says nothing new.** Code implements the tech spec; a deviation is a spec
   change first, then a code change.
5. **The prose is rendered.** `_PLAN.md` and `_TECH.md` are also published as single-file
   HTML guides (same shell, theme and Aa panel) so they can be read, searched and handed
   to someone who does not use an editor. The authoring format stays Markdown; the HTML
   is generated, never hand-edited.
6. **Each document is versioned in git** with the stage it belongs to
   (`v0.0.1-idea-to-plan`, `v0.0.1-plan`, `v0.0.1-tech`, then `v0.1.0-m1` … for
   milestones), so the chain of thought is auditable.
7. **Cost is logged per stage** in [`COSTS.md`](COSTS.md): what prompt produced what
   artefact and what it cost.

### Where we are now

- Stage 1 — done: [`_IDEA.md`](_IDEA.md).
- Stage 2 — done: [`_PLAN.md`](_PLAN.md) plus its rendered [`_PLAN.html`](_PLAN.html).
- Stage 3 — **next**: `_TECH.md`. The twelve questions in `_PLAN.md` §13 are the first
  thing to answer.
- Stage 4 — not started: `src/` stays empty until stage 3 is signed off.

---

## Documentation

| File | What it is |
|---|---|
| [`_IDEA.md`](_IDEA.md) | The original brief and ideas that seeded the plan. |
| [`_PLAN.md`](_PLAN.md) | **The product plan** — goals, roles, permissions, domain model, workflows, screens, UX rules, milestones and acceptance criteria. |
| [`_PLAN.html`](_PLAN.html) | The plan rendered as a self-contained two-pane guide (house style, filterable contents, Aa appearance panel). |
| [`COSTS.md`](COSTS.md) | Running log of the prompt used and the cost incurred at each stage. |
| `docs.toml` | Build config — per-document page titles, eyebrow, subtitle and footer. |
| `jms_theme.toml` | Theme tokens for the rendered pages (25px page text, sidebar 20% larger). |
| `skills/make-jms-html/` | The skill that builds these pages: generator, theme, batch builder, conventions. |
| `_TECH.md` | **Next deliverable** (stage 3) — schema, routes, templates, tests and implementation tasks derived from the plan. |
| `src/` | **Not started** (stage 4) — the application itself, written only after `_TECH.md` is signed off. |

The plan is written deliberately **without code**: it states what the business needs, who
may do it, what each screen does, and how we will know a stage is finished. Every
requirement is phrased so that `_TECH.md` can answer it with a schema, a route, a template
or a test.

---

## What JMS does

- **Customers** — staff add customers and, optionally, issue a portal login (email + the
  default password `JMS123`, which must be changed at first sign-in).
- **Jobs** — one job per piece of work, with a reference (`JOB-YYYY-NNNN`), customer, site,
  work type, priority, planned and actual dates, status and price.
- **Assignments** — a job may have many engineers; one is marked lead. Booking conflicts
  are warned about, not blocked, in v1.
- **Status tracking** — a controlled state machine from `DRAFT` through `SCHEDULED`,
  `IN_PROGRESS`, `COMPLETED`, `INVOICED` and `PAID`, with `ON_HOLD` and `CANCELLED`.
- **Invoices and PDFs** — gapless invoice numbering, a job sheet and invoice PDF generated
  from live data, downloadable by managers and by the customer once issued.
- **Insights** — global search, operations and engineer dashboards, a timeline of planned
  dates, workload per engineer, and financial summaries.
- **Administration** — data-driven role → action permissions, user management, company
  settings, an audit log, and a company default theme.

### Roles

| Role | Summary |
|---|---|
| **ADMIN** | Full access, including users, permissions, settings and the audit log. |
| **MANAGER** | Creates and schedules jobs, manages customers and invoices, sees all operations. |
| **ENGINEER** | Sees only assigned jobs (plus recent history) and may advance their status forward. |
| **CUSTOMER** | Sees only their own jobs, dates, customer-visible updates and documents. |

Permissions are stored as a role × action-key matrix in the database and enforced
server-side on every request. Admins can change what a role may do without a redeploy;
those cells that cannot be removed (for example, the last admin) are safeguarded.

---

## Core workflows

The full detail is in [`_PLAN.md`](_PLAN.md) §4. In brief:

1. **Add a customer and give them a login** — `W1`
2. **Create a job** — `W2`
3. **Assign engineers and plan dates** — `W3`
4. **Engineer updates a job on site** — `W4`
5. **Manager closes out and invoices** — `W5`
6. **Customer checks progress** — `W6`
7. **Generate the job sheet and invoice PDFs** — `W7`
8. **Admin adjusts what a role can do** — `W8`
9. **A user changes how the app looks** — `W9`
10. **Find things and see the plan** — `W10`

---

## Design principles

1. **One obvious next action per screen.**
2. **Visibility is not security** — every rule is enforced on the server.
3. **The job is the centre of the universe** — customers, engineers, invoices, documents and
   events all hang off a job.
4. **Nothing is deleted** — records are archived and audited.
5. **Data-driven permissions** — roles are rows, not `if` statements.
6. **One design system** — the same warm paper, terracotta accent and serif headings used by
   our published guides, with a floating **Aa** panel for personal appearance settings.

The app targets plain language, large type and generous hit areas, WCAG 2.2 AA contrast,
keyboard access, and layouts that work from a 360 px phone upward.

---

## Delivery milestones

| # | Milestone | Outcome |
|---|---|---|
| **M0** | Contract | Plan signed off; `_TECH.md` written and decisions in §13 resolved. |
| **M1** | Foundations | App shell, auth, sessions, role seed, permission matrix, audit skeleton, theme tokens, Aa panel. |
| **M2** | People | Customers CRUD + invite login, users admin, password change, company settings. |
| **M3** | Jobs | Job create/edit, references, detail, assignments, scheduling, conflict warnings, filters. |
| **M4** | Field | My jobs, allowed status transitions, actual timestamps, notes, job timeline. |
| **M5** | Customer portal | Scoped "My jobs", job detail, documents list. |
| **M6** | Money & paper | Invoices, numbering, issue/void/paid, job sheet and invoice PDFs, print styles. |
| **M7** | Insight | Global search, dashboards, timeline, workload, financials. |
| **M8** | Hardening | Audit view, backups and restore drill, accessibility and performance passes, seed data, help pages. |

Milestones are vertical slices: each one can be demonstrated and accepted before the next
begins. See `_PLAN.md` §11 for the dependency order and §12 for the v1 definition of done.

---

## Out of scope for v1

Email/SMS delivery of PDFs, online payments and accounting sync, stock and route planning,
multi-company tenancy, native mobile apps, and customer self-registration. The data model is
designed not to block these later.

---

## Viewing and rebuilding the plan

Open `_PLAN.html` in any modern browser for the readable guide edition, or `_PLAN.md` as
plain Markdown. The HTML is self-contained (no server needed) and includes sticky two-pane
contents with filter and scroll-spy plus the **Aa** appearance panel.

The pages are generated by the [`make-jms-html`](skills/make-jms-html/SKILL.md) skill from
`docs.toml` and `jms_theme.toml`:

```bash
python skills/make-jms-html/scripts/build_jms_docs.py             # all pages
python skills/make-jms-html/scripts/build_jms_docs.py --only _PLAN.md  # one page
```

Type defaults are **25px** page text and **20.4px** sidebar/chrome (20% larger than the
upstream guide base). Edit `jms_theme.toml` to restyle these pages, or use the Aa panel and
**Copy TOML** to paste a look back into the theme. Never hand-edit generated HTML — change
the Markdown or the theme and rebuild.

Documentation is delivered as HTML only: Markdown is converted to HTML (or the HTML is
authored directly), with no PDF build step for the plan, tech spec or help pages. The
application itself still generates job-sheet and invoice PDFs as a product feature (see
`_PLAN.md` §8).

When stage 3 begins, add a `[docs."_TECH.md"]` block to `docs.toml` (there is a
commented stub) and rerun the builder — the spec then gets the same page shell, theme and
Aa panel as this plan, with no extra tooling.
