# JMS Demo Lite

A **non-Node, drag-and-drop** edition of the Acme Windows Job Management System.
Everything in this folder is static HTML, CSS and JavaScript. There is no build
step, no server and no external network request.

Built from [`../_TECH.md`](../_TECH.md) and [`../_PLAN.md`](../_PLAN.md). The full
technical spec describes a Node + HTMX + server-side application; this folder is
the browser-only demo that shows the product, workflows and permission model
without needing Node.

## Deploy to Netlify by drag and drop

1. Open <https://app.netlify.com/drop>.
2. Drag this **`src` folder** onto the page.
3. Open the generated URL.

`index.html` is at the folder root, so no build command, publish directory or
environment variables are needed. Hash routing means no redirect rules are
required.

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8123 --directory src
# http://localhost:8123
```

## Demo accounts

Every account uses the password **`JMS123`**. The sign-in screen also has
one-click role buttons.

| Role | Name | Email |
|---|---|---|
| Admin | Alex Morgan | `admin@acme.example` |
| Admin | Priya Shah | `admin2@acme.example` |
| Manager (field-capable) | Morgan Lee | `manager@acme.example` |
| Manager (field-capable) | Rita Patel | `manager2@acme.example` |
| Engineer | Dan Walker | `engineer1@acme.example` |
| Engineer | … | `engineer2…engineer8@acme.example` |
| Customer | Elaine Foster | `customer1@example.com` |
| Customer | … | `customer2…customer10@example.com` |

## Seeded dataset

- Acme Windows company record and house theme.
- 2 admins, 2 field-capable managers, 8 engineers, 30 customer logins.
- 30 customers with 46 jobs between them: the reference
  `[3,4,2,1,3,4,3,2,2,2]` distribution from `_TECH.md` §15.4 for customers 1–10
  (26 jobs), plus one job each for the 20 extra customers.
- 12 of the extra jobs are `SCHEDULED` across the next six weeks (2–41 days
  from first load), so the timeline, workload and dashboard always show
  upcoming work.
- All eight job statuses represented, plus assignments, timeline events,
  invoices and audit rows.
- Dates are generated relative to the first load so “today”, “this week” and
  “needs invoicing” are populated.
- List paging on jobs, customers, invoices and users: 10 rows per page by
  default, with 20 and 50 options selectable from the pager.

## What works

- Sign in, role-scoped navigation and sign out.
- Operations dashboard, field “My jobs”, customer portal.
- Jobs list with filters, job create/edit, assignment and scheduling with
  advisory conflict warnings, controlled status transitions and notes.
- Customers, portal logins and password resets.
- Invoices: draft → issued → paid, void with a reason, gapless numbering.
- Print-ready job sheets and invoices. Use the browser’s **Print → Save as PDF**
  to download an A4 PDF.
- Global search scoped by role.
- Timeline, workload, financials and needs-invoicing insights.
- Admin users, editable role × action permission matrix, company settings,
  audit log, archive and restore.
- Appearance panel: system/light/dark, type sizes, line height, sidebar width,
  fonts, key colours, reset and copy-theme TOML.
- JSON export/import and reset from **Admin → Company settings**.

## Demo simplifications

These are deliberate, to keep the demo a static drop-in:

- Data lives in `localStorage` (key `jms.demo.db.v1`), not in `data/jms.json`.
- Authorisation is enforced in the browser, not on a server. It demonstrates
  the same role × action matrix and object scoping, but is not a security
  boundary.
- Passwords are demo values (`JMS123`), not bcrypt hashes. First-sign-in forced
  password change is represented by the reset flow rather than blocking the
  demo.
- PDFs are produced by the browser print dialog rather than PDFKit.
- The dataset is recreated on first load and can be reset at any time.

## File map

```
index.html          shell and script order
css/tokens.css      one palette, light and dark
css/app.css         app shell, components, print and responsive rules
js/seed.js          deterministic demo dataset + default permission matrix
js/store.js         localStorage JSON store, sessions, scoping and domain rules
js/app.js           hash router, views, forms, dialogs and appearance panel
```

The source keeps the repository/service boundary from `_TECH.md`: views talk to
`JMS` in `store.js`, not directly to `localStorage`. That makes the demo easy to
swap for the real Node API later.
