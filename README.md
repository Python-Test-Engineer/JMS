# JMS — Job Management System

A CMS + job tracker for **Acme Windows**, a window-installation company. JMS replaces
paper, spreadsheets and phone calls with one place where managers create customers and
jobs, engineers report what happened on site, and customers watch their own installation
progress — each seeing only what their role allows.

> **Status: planning.** There is no application code yet. This repository currently holds
> the product plan and its rendered HTML guides. `_TECH.md` will turn the plan into a
> technical specification, and implementation follows that.

---

## Documentation

| File | What it is |
|---|---|
| [`_IDEA.md`](_IDEA.md) | The original brief and ideas that seeded the plan. |
| [`_PLAN.md`](_PLAN.md) | **The product plan** — goals, roles, permissions, domain model, workflows, screens, UX rules, milestones and acceptance criteria. |
| [`_PLAN.html`](_PLAN.html) | The plan rendered as a self-contained two-pane guide (house style, filterable contents, Aa appearance panel). |
| `docs.toml` | Build config — per-document page titles, eyebrow, subtitle and footer. |
| `jms_theme.toml` | Theme tokens for the rendered pages (25px page text, sidebar 20% larger). |
| `skills/make-jms-html/` | The skill that builds these pages: generator, theme, batch builder, conventions. |
| `_TECH.md` | **Next deliverable** — schema, routes, templates, tests and implementation tasks derived from the plan. |

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
python skills/make-jms-html/scripts/build_jms_docs.py --pdf     # all pages + PDFs
python skills/make-jms-html/scripts/build_jms_docs.py --no-pdf  # fast HTML iteration
```

Type defaults are **25px** page text and **20.4px** sidebar/chrome (20% larger than the
make-book base). Edit `jms_theme.toml` to restyle these pages, or use the Aa panel and
**Copy TOML** to paste a look back into the theme. Never hand-edit generated HTML — change
the Markdown or the theme and rebuild.

Documentation is delivered as HTML only: Markdown is converted to HTML (or the HTML is
authored directly), with no PDF build step for the plan, tech spec or help pages. The
application itself still generates job-sheet and invoice PDFs as a product feature (see
`_PLAN.md` §8).
