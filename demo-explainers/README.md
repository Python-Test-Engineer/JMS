# JMS · Animated workflow explainers

Short, animated HTML explainers for **Acme Windows' Job Management System**, written for
business owners rather than developers. Each workflow shows what the app does, then what it
saves in time and money.

Open **[`index.html`](index.html)** in any modern browser. No server, build step or network
request is needed.

## Pages

| Page | Workflow | The pitch |
|---|---|---|
| [`index.html`](index.html) | Overview | The whole job, from first call to cash. |
| [`w1-add-customer.html`](w1-add-customer.html) | 01 · Add a customer | One form creates the contact and their portal login. |
| [`w2-create-job.html`](w2-create-job.html) | 02 · Create a job | A searchable reference that follows the work to the invoice. |
| [`w3-assign-and-plan.html`](w3-assign-and-plan.html) | 03 · Assign & plan dates | The right engineers, the right days, clash warnings. |
| [`w4-engineer-on-site.html`](w4-engineer-on-site.html) | 04 · Engineer updates the job | Start, note and complete from a phone, with live actual times. |
| [`w5-close-and-invoice.html`](w5-close-and-invoice.html) | 05 · Close out & invoice | Completed jobs become numbered invoices in a few clicks. |
| [`w6-customer-progress.html`](w6-customer-progress.html) | 06 · Customer checks progress | Dates, status and documents without a phone call. |
| [`w7-instant-pdfs.html`](w7-instant-pdfs.html) | 07 · Instant PDFs | Branded, current job sheets and invoices from live data. |
| [`w8-permissions.html`](w8-permissions.html) | 08 · Roles & permissions | Change access policy in seconds, with safeguards and an audit trail. |
| [`w9-appearance.html`](w9-appearance.html) | 09 · Make it comfortable | Dark mode, bigger type and preferences that follow the user. |
| [`w10-find-and-plan.html`](w10-find-and-plan.html) | 10 · Find & plan ahead | Search, timeline, workload and financials. |

The left-hand contents on every page lists all workflows, so a reader can move between
them like chapters of a document. **What it saves** opens a drawer with the three benefits
and the four real-app steps for that workflow.

## Player controls

Each page has the same animation player:

- **Pause / Play** — the animation starts automatically, then waits for the reader.
- **← / →** — previous or next step.
- **↺ Replay** — back to step one.
- **Speed** — 0.75×, 1×, 1.5× or 2×. Changing speed mid-scene keeps the remaining time proportional.
- **Step pills** — jump directly to any step.
- **Keyboard** — when the stage is focused or hovered: `Space` play/pause, `←`/`→` step, `R` replay.
- **`?step=N`** — deep-link to a step, e.g. `w4-engineer-on-site.html?step=3`.

The player respects `prefers-reduced-motion`, and all mock screens are plain semantic HTML
so they remain readable without animation.

## How it is built

```
demo-explainers/
  index.html                 overview and workflow hub
  w*.html                    one page per workflow (thin shells)
  assets/explainer.css       house style, app mock-up, player and responsive layout
  assets/explainer.js        page composition, animation player, drawer, mobile TOC
  assets/stories.js          all workflow copy and every animation scene
  README.md                  this file
```

Every page loads the same three assets. A page is just a shell:

```html
<body data-page="w1">
  <div id="site-header"></div>
  <div class="layout">
    <aside id="site-toc"></aside>
    <main id="site-main" class="content" tabindex="-1"></main>
  </div>
  <script src="assets/stories.js"></script>
  <script src="assets/explainer.js"></script>
</body>
```

`data-page` selects the workflow. `stories.js` holds the narrative, the hero copy, the
savings, the steps and each scene's mock screen. The engine in `explainer.js` builds the
header, TOC, stage, controls, drawer and previous/next links.

### Editing a workflow

1. Open `assets/stories.js`.
2. Find the workflow's entry in `workflows` to change its title, pitch, hero, savings or steps.
3. Find the matching `stories.wN` to change the scenes. A scene needs a `label`, a
   `caption`, a `tip` and an `html` string; `role`, `active`, `url`, `aim`, `types`
   (typing), `pops` (highlight) and `duration` are optional.
4. Reload the page. There is no build step.

The mock UI classes (`m-panel`, `m-row`, `m-pill`, `m-table`, `m-paper`, `m-aa`, …) live in
`assets/explainer.css` and mirror the real JMS Demo Lite in [`../src`](../src).

## Design notes

- House palette and type from the JMS guides: warm paper, terracotta accent, serif headings.
- Workflow pages are a one-screen presenter on desktop: the animation is the main event,
  and the benefits live in the drawer.
- On phones and small tablets the page becomes scrollable and the animated frame keeps a
  readable height, rather than shrinking the mock to nothing.
- The overview page is a normal scrolling document: hero, animated story, ten workflow
  cards, role summary and a link to the live demo.
- All figures in the benefits are illustrative sales estimates for the explainer, not
  measured production analytics.
