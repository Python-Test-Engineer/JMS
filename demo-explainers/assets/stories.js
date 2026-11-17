/* JMS workflow explainers — all story data in one place.
   Every page reads window.JMS_DEMO. Scene HTML is mock UI only: spans and
   divs, no real links or forms. The player types into inputs marked by id. */
(function () {
  "use strict";

  /* ---------------------------- helpers ---------------------------- */
  function titleCase(s) {
    return String(s).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function initials(name) {
    return String(name).split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0); }).join("").toUpperCase();
  }
  function P(status, label) {
    var key = String(status).toLowerCase().replace(/_/g, "-");
    return '<span class="m-pill tone-' + key + '">' + (label || titleCase(status)) + "</span>";
  }
  function stat(label, value, note, tone) {
    return '<div class="m-stat' + (tone ? " tone-" + tone : "") + '"><span class="m-stat-label">' + label + "</span><strong>" + value + '</strong><span class="m-stat-note">' + (note || "") + "</span></div>";
  }
  function panel(inner, cls) {
    return '<section class="m-panel ' + (cls || "") + '">' + inner + "</section>";
  }
  function mBtn(label, cls, id) {
    return '<span class="m-btn ' + (cls || "m-btn-primary") + '"' + (id ? ' id="' + id + '"' : "") + ">" + label + "</span>";
  }
  function field(label, id, value, placeholder) {
    return '<label class="m-field"><span class="m-label">' + label + '</span><input class="m-input" id="' + id + '" value="' + (value || "") + '" placeholder="' + (placeholder || "") + '" aria-label="' + label + '"></label>';
  }
  function jobRow(o) {
    return '<div class="m-row"><div class="m-row-main"><div class="m-row-title"><span class="m-ref">' + o.ref + "</span>" + P(o.status) + "</div><strong>" + o.title + '</strong><span class="m-row-sub">' + o.sub + '</span></div>' + (o.side ? '<div class="m-row-side">' + o.side + "</div>" : "") + "</div>";
  }
  function customerCard(name, contact, place, jobs, active, status) {
    return '<div class="m-card"><div class="m-card-head"><span class="m-avatar" style="width:30px;height:30px;font-size:11px">' + initials(name) + '</span><span class="m-badge ' + (status === "ARCHIVED" ? "" : "m-badge-ok") + '">' + (status || "Active") + "</span></div><strong>" + name + '</strong><span class="m-row-sub">' + contact + '</span><div class="m-card-foot"><span>' + place + "</span><span>" + jobs + " jobs · " + active + " active</span></div></div>";
  }
  function tItem(title, meta) {
    return '<li><span class="dot"></span><div class="body"><strong>' + title + '</strong><span class="meta">' + meta + "</span></div></li>";
  }
  function docRow(name, meta) {
    return '<div class="m-doc-row"><span class="pdf">PDF</span><div class="m-row-main"><strong>' + name + '</strong><span class="m-row-sub">' + meta + '</span></div><span class="m-badge m-badge-info">Download</span></div>';
  }
  function flow(active) {
    var steps = ["Customer", "Job", "Schedule", "On site", "Invoice", "Paid"];
    return '<div class="m-flow">' + steps.map(function (s, i) {
      return (i ? '<span class="arrow">→</span>' : "") + '<span class="' + (i === active ? "on" : "") + '">' + s + "</span>";
    }).join("") + "</div>";
  }

  /* ---------------------------- navigation ---------------------------- */
  var workflows = [
    {
      id: "overview", n: "00", file: "index.html", nav: "Overview", group: "Start here",
      title: "Why JMS", pitch: "The whole job, from first phone call to money in the bank, in one place.",
      save: "Less admin · faster cash"
    },
    {
      id: "w1", n: "01", file: "w1-add-customer.html", nav: "Add a customer", group: "Win & set up work",
      title: "Add a customer and a login", pitch: "One short form creates the contact and their portal login — no spreadsheets.",
      save: "8 min saved per customer",
      hero: {
        eyebrow: "Workflow 01 · Customers",
        title: "Add a customer in one go — login included",
        lead: "One short form creates the customer, their contact record and a portal login. No spreadsheet to update, no separate password email, no duplicate records."
      },
      saves: [
        { icon: "⏱", value: "8 min", label: "saved per new customer", note: "Type the details once. JMS creates the customer record and the login together." },
        { icon: "🔐", value: "Zero", label: "password spreadsheets", note: "The email is the username and JMS123 is a temporary password they must change." },
        { icon: "🔎", value: "One record", label: "for every conversation", note: "Jobs, quotes, invoices and portal updates all hang off the same customer." }
      ],
      steps: [
        ["Open Customers → New customer", "One obvious action from the customer list."],
        ["Fill the contact details once", "Single column, large fields, labels above every input."],
        ["Leave the portal login switched on", "The email becomes the login; JMS123 is the temporary password."],
        ["Save", "Customer, login and audit record are created together, ready for the first job."]
      ]
    },
    {
      id: "w2", n: "02", file: "w2-create-job.html", nav: "Create a job", group: "Win & set up work",
      title: "Create a job", pitch: "A searchable reference and a clean handover to scheduling, field and invoicing.",
      save: "6 min saved per job",
      hero: {
        eyebrow: "Workflow 02 · Jobs",
        title: "Create a job that follows the work all the way to the invoice",
        lead: "One form captures the customer, the site, the price and the plan. JMS allocates the reference immediately, so nothing is lost between the quote, the visit and the bill."
      },
      saves: [
        { icon: "⏱", value: "6 min", label: "of admin per job", note: "No retyping the same details into a job sheet, a diary and an invoice." },
        { icon: "🧾", value: "One reference", label: "from quote to cash", note: "JOB-2026-0042 follows the work through scheduling, field updates and invoicing." },
        { icon: "📵", value: "None", label: "lost job sheets", note: "Every job is on screen, searchable and owned by a customer from the moment it is saved." }
      ],
      steps: [
        ["Open Jobs → New job", "Or start from a customer page and JMS pre-fills what it already knows."],
        ["Capture the job and the price", "Title, work type, description, site, priority and the agreed price."],
        ["Save as a draft", "The reference is allocated straight away and can be searched by anyone."],
        ["Take the next step from the job page", "Assign engineers, set dates and publish the schedule with big, obvious pills."]
      ]
    },
    {
      id: "w3", n: "03", file: "w3-assign-and-plan.html", nav: "Assign & plan dates", group: "Plan the week",
      title: "Assign engineers and plan dates", pitch: "The right people, the right days, and a warning before a double booking.",
      save: "30 min saved per week",
      hero: {
        eyebrow: "Workflow 03 · Scheduling",
        title: "Put the right engineers on the job — and see the week at a glance",
        lead: "Assign one or more engineers, mark the lead, set the dates and publish. JMS warns about clashes before they become missed appointments and unhappy customers."
      },
      saves: [
        { icon: "⏱", value: "30 min", label: "saved every week", note: "No more re-planning the diary across three screens and a phone call." },
        { icon: "🚫", value: "Fewer", label: "double bookings", note: "An advisory clash warning appears before the schedule is published." },
        { icon: "👀", value: "Same day", label: "visibility for the field", note: "The job appears in each engineer's My jobs the moment it is scheduled." }
      ],
      steps: [
        ["Open the job → Assign engineers", "Choose one or more active engineers and mark the lead."],
        ["Set the planned dates", "Start and end date, with a morning, afternoon or all-day block."],
        ["Publish the schedule", "JMS asks once, then moves the job from DRAFT to SCHEDULED."],
        ["Act on the clash warning", "Advisory in v1: the office is warned, but a deliberate decision is not blocked."]
      ]
    },
    {
      id: "w4", n: "04", file: "w4-engineer-on-site.html", nav: "Engineer updates the job", group: "On site",
      title: "Engineer updates the job", pitch: "Start, note and complete from a phone — where the work actually happens.",
      save: "10+ calls a day avoided",
      hero: {
        eyebrow: "Workflow 04 · Field work",
        title: "Engineers update the job from the doorstep — not from the office",
        lead: "On a phone, an engineer opens My jobs, taps Start, adds a plain-English note and taps Complete. The actual times and the customer update are recorded where the work happened."
      },
      saves: [
        { icon: "📞", value: "10+", label: "calls a day avoided", note: "The office stops phoning to ask whether the job started or finished." },
        { icon: "⏱", value: "Live", label: "actual times", note: "Real start and finish times replace guesses, improving payroll and invoicing." },
        { icon: "💬", value: "Same day", label: "customer updates", note: "A customer-visible note appears in the portal without anyone retyping it." }
      ],
      steps: [
        ["Engineer signs in on a phone", "They land on My jobs, with today's work first."],
        ["Open the job and read the plan", "Site address, customer contact, assigned lead and planned dates."],
        ["Tap Start job", "The status becomes In progress and the actual start time is stamped."],
        ["Add a note and tap Complete", "The completion note is saved, the actual end is stamped, and the customer sees the update."]
      ]
    },
    {
      id: "w5", n: "05", file: "w5-close-and-invoice.html", nav: "Close out & invoice", group: "Get paid",
      title: "Close out and invoice", pitch: "Completed jobs become numbered invoices in a couple of clicks.",
      save: "9 days faster to cash",
      hero: {
        eyebrow: "Workflow 05 · Money",
        title: "Bill the same day the job is finished",
        lead: "Completed jobs line up in Needs invoicing. Create an invoice from the job price, check the PDF, issue it and mark it paid — with gapless numbering throughout."
      },
      saves: [
        { icon: "💷", value: "9 days", label: "faster to get paid", note: "Invoicing on the day of completion shortens the whole cash cycle." },
        { icon: "⏱", value: "15 min", label: "saved per invoice", note: "The lines, VAT and totals are filled from the job. No retyping into Word or Excel." },
        { icon: "🧾", value: "Gapless", label: "invoice numbers", note: "Every invoice is numbered, audited and visible in the customer's portal once issued." }
      ],
      steps: [
        ["Find completed work in Needs invoicing", "The dashboard counts completed jobs that have no live invoice."],
        ["Create the invoice from the job", "Net, VAT and gross default from the agreed price and company settings."],
        ["Review the PDF and issue it", "The job moves to INVOICED and the customer can download their copy."],
        ["Mark it paid when the money lands", "The job closes as PAID and the financial dashboard updates immediately."]
      ]
    },
    {
      id: "w6", n: "06", file: "w6-customer-progress.html", nav: "Customer checks progress", group: "Customer service",
      title: "Customer checks progress", pitch: "Dates, status and documents in plain English — without a phone call.",
      save: "Calls down, trust up",
      hero: {
        eyebrow: "Workflow 06 · Customer portal",
        title: "Answer “where are you with my windows?” before they call",
        lead: "Customers sign in to see only their own jobs: plain-language status, planned dates, the lead engineer's first name and their documents. Nothing else is visible."
      },
      saves: [
        { icon: "📞", value: "Fewer", label: "status calls", note: "The answer is already on the customer's phone, updated by the engineer on site." },
        { icon: "😊", value: "Calmer", label: "customers", note: "Dates and progress are explicit. No chasing, no guessing, no broken promises." },
        { icon: "🔒", value: "Only", label: "their own work", note: "No other customers, no company financials and no internal notes ever appear." }
      ],
      steps: [
        ["Customer signs in", "Email plus the temporary password, changed at first sign-in."],
        ["They see My jobs", "Cards with reference, status, planned dates and the lead engineer."],
        ["Open a job for plain-English detail", "Status, planned and actual dates, and a customer-visible timeline."],
        ["Download documents", "The job sheet and any issued invoice are available without asking the office."]
      ]
    },
    {
      id: "w7", n: "07", file: "w7-instant-pdfs.html", nav: "Instant PDFs", group: "Get paid",
      title: "Job sheets and invoice PDFs", pitch: "Branded, timestamped PDFs from live data — never stale, never retyped.",
      save: "15 min per document",
      hero: {
        eyebrow: "Workflow 07 · Documents",
        title: "Professional PDFs from live data — zero retyping",
        lead: "The job sheet and invoice PDF are generated when you click: branded, timestamped and always current. Customers download their own copy from the portal."
      },
      saves: [
        { icon: "⏱", value: "15 min", label: "saved per document", note: "No copying into a template and no checking whether the details still match." },
        { icon: "🖨", value: "Always", label: "current and branded", note: "Each download is built from live data, with the company logo and generation time." },
        { icon: "📥", value: "Zero", label: "stale attachments", note: "If the job changes, the next PDF changes with it. No cached copies to chase." }
      ],
      steps: [
        ["Open the job and choose Job sheet (PDF)", "Any role with document permission can generate it on demand."],
        ["JMS builds the PDF from live data", "Company details, site, engineers, dates, notes and a generation timestamp."],
        ["Issue the invoice to release its PDF", "Customers can download their invoice as soon as it is issued."],
        ["Download again whenever needed", "The latest data is used every time — no version stored in a filing cabinet."]
      ]
    },
    {
      id: "w8", n: "08", file: "w8-permissions.html", nav: "Roles & permissions", group: "Run the business",
      title: "Change what a role can do", pitch: "Access policy as a table, not a development project.",
      save: "Days → seconds",
      hero: {
        eyebrow: "Workflow 08 · Administration",
        title: "Change what a role can do — without a developer",
        lead: "The role × action matrix is a table, not code. Toggle a right, read the blast radius, save, and it applies on the next click. Safeguards stop you locking yourself out."
      },
      saves: [
        { icon: "💷", value: "£0", label: "developer cost per change", note: "An office decision replaces a change request, a release and a bill." },
        { icon: "⚡", value: "Seconds", label: "not days to apply", note: "The next request uses the new policy; navigation and buttons update themselves." },
        { icon: "🧾", value: "Fully", label: "audited", note: "Every permission change records who, what, before, after and when." }
      ],
      steps: [
        ["Open Admin → Roles & permissions", "The whole policy is one matrix, grouped by area."],
        ["Toggle a cell", "A one-line explanation states the effect and who it affects."],
        ["Save", "The change applies immediately and an audit row is written."],
        ["Trust the safeguards", "Cells that would break administration stay disabled, with the reason shown."]
      ]
    },
    {
      id: "w9", n: "09", file: "w9-appearance.html", nav: "Make it comfortable", group: "Run the business",
      title: "Make the app comfortable", pitch: "Dark mode, bigger type and personal preferences — saved to the user, not the device.",
      save: "No second stylesheet",
      hero: {
        eyebrow: "Workflow 09 · Appearance",
        title: "Make the screen comfortable for every pair of eyes",
        lead: "The Aa panel changes mode, type size, line height, width and fonts, live. Preferences follow the user to any device, and admins set the company default."
      },
      saves: [
        { icon: "👓", value: "Readable", label: "for every age and light", note: "Big type in sunlight, dark mode in a dim office, one design system underneath." },
        { icon: "🎫", value: "Fewer", label: "support tickets", note: "Staff fix their own comfort instead of asking for a special screen or stylesheet." },
        { icon: "♿", value: "WCAG", label: "AA contrast built in", note: "Both modes meet the contrast requirements and respect reduced-motion settings." }
      ],
      steps: [
        ["Click the Aa button", "The same appearance panel used by the published JMS guides."],
        ["Pick System, Light or Dark", "The whole app switches together, including tables and the sidebar."],
        ["Adjust type and layout", "Type size, line height, width and font stacks preview live."],
        ["Save", "The preference is stored on the user and follows them to any device."]
      ]
    },
    {
      id: "w10", n: "10", file: "w10-find-and-plan.html", nav: "Find & plan ahead", group: "Run the business",
      title: "Find anything and plan ahead", pitch: "Search, timeline, workload and money — the questions an owner actually asks.",
      save: "One screen, not six",
      hero: {
        eyebrow: "Workflow 10 · Insight",
        title: "Find anything in two keystrokes, and see next week before it happens",
        lead: "Global search covers jobs, customers, postcodes, engineers and invoices. Timeline, workload and financial dashboards answer the questions owners actually ask."
      },
      saves: [
        { icon: "🔎", value: "Seconds", label: "to find any record", note: "Job reference, customer name, postcode, engineer or invoice number — one box." },
        { icon: "📅", value: "One screen", label: "for next week", note: "See who is where, spot gaps and move work before it becomes a problem." },
        { icon: "💷", value: "Live", label: "quoted vs paid", note: "Outstanding invoices are visible, so chasing money is a routine, not a surprise." }
      ],
      steps: [
        ["Type in the global search box", "Results are grouped by jobs, customers, invoices and users, scoped to the role."],
        ["Open Insights → Timeline", "A week or month view of planned jobs by day, filterable by engineer and status."],
        ["Check Insights → Workload", "Jobs per engineer for the chosen week, so capacity is obvious."],
        ["Review Insights → Financials", "Quoted, invoiced, paid and outstanding, for any date range."]
      ]
    }
  ];

  /* ---------------------------- stories ---------------------------- */
  var stories = {};

  /* ============================ OVERVIEW ============================ */
  stories.overview = {
    title: "One job's life in JMS",
    sub: "Watch a window installation move from first enquiry to money in the bank.",
    scenes: [
      {
        label: "The old way", url: "jms.acme.example", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Before JMS</div><h1 class="m-title">The work is real. The admin is scattered.</h1><p class="m-intro">A spreadsheet, a paper diary, a phone and a folder of invoices.</p></div></div>' +
          '<div class="m-chaos"><div class="m-card"><div class="icon">📊</div><strong>Spreadsheet</strong><span class="m-row-sub">Edited by three people, believed by none.</span></div>' +
          '<div class="m-card"><div class="icon">📞</div><strong>Phone calls</strong><span class="m-row-sub">“Where is the engineer?” asked all day.</span></div>' +
          '<div class="m-card"><div class="icon">🧾</div><strong>Paper invoices</strong><span class="m-row-sub">Typed at night, sent late, chased for weeks.</span></div></div>' +
          '<div class="m-notice m-notice-warn"><strong>The cost of scattered admin</strong><p>Hours a week in double entry, missed appointments and invoices sent days after the work.</p></div></div>',
        caption: "Most window companies lose hours every week joining up spreadsheets, calls and paperwork. JMS puts the whole job in one place.",
        tip: "Every screen that follows replaces a spreadsheet, a phone call or a retyped document."
      },
      {
        label: "One place", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Today · Operations</div><h1 class="m-title">Everything that matters, on one screen</h1><p class="m-intro">Today, next week, holds and work waiting to be invoiced.</p></div>' + mBtn("New job", "m-btn-primary", "aim-newjob") + '</div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "7", "jobs on site", "accent") + stat("Next 7 days", "18", "£42,600 quoted") + stat("On hold", "2", "needs attention", "warn") + stat("Needs invoicing", "4", "completed, no invoice", "info") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Next on the plan</h3><p>Planned jobs from today forward.</p></div><span class="m-badge">Timeline</span></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · Tue 09:00–12:00", side: "Dan Walker" }) +
            jobRow({ ref: "JOB-2026-0041", title: "Install bay window", status: "IN_PROGRESS", sub: "Northgate Dental · Today 08:00", side: "Sam Okafor" }) +
            jobRow({ ref: "JOB-2026-0039", title: "Repair failed sealed unit", status: "SCHEDULED", sub: "Harbour View Flats · Wed 13:00", side: "Luis García" }) + '</div>') + '</div>',
        aim: "#aim-newjob", click: true,
        caption: "Managers land on the work, not a menu. Today, next week, exceptions and unbilled jobs are all visible before the first coffee.",
        tip: "One dashboard answers the four questions that used to take four systems."
      },
      {
        label: "Customer + job", url: "jms.acme.example/#/customers/meadow", role: "MANAGER", active: "Customers",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">People</div><h1 class="m-title">Meadow House Ltd</h1><p class="m-intro">Contact, portal login and every job in one record.</p></div>' + mBtn("New job", "m-btn-primary", "aim-newjob2") + '</div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Contact</h3><p>Elaine Foster · Manchester</p></div><span class="m-badge m-badge-ok">Portal login active</span></div><div class="m-form-grid"><div><span class="m-label">Email</span><div class="m-small">customer1@example.com</div></div><div><span class="m-label">Phone</span><div class="m-small">0161 555 0101</div></div><div class="m-full"><span class="m-label">Address</span><div class="m-small">12 Meadow Lane, Didsbury, M20 2AB</div></div></div>') + '</div><div>' +
          panel('<div class="m-panel-head"><div><h3>Jobs</h3><p>3 jobs for this customer.</p></div></div><div class="m-list">' + jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Tue 09:00–12:00 · Dan Walker" }) + jobRow({ ref: "JOB-2025-0288", title: "Repair conservatory glazing", status: "PAID", sub: "Nov 2025 · £640" }) + '</div>') + '</div></div>' +
          '<div class="m-flow"><span class="on">Customer</span><span class="arrow">→</span><span class="on">Job</span><span class="arrow">→</span><span>Schedule</span><span class="arrow">→</span><span>On site</span><span class="arrow">→</span><span>Invoice</span><span class="arrow">→</span><span>Paid</span></div></div>',
        aim: "#aim-newjob2", click: true,
        caption: "A customer is created once. Their login, contact details, jobs, invoices and documents all stay attached to that record.",
        tip: "No duplicate customers and no searching three places for a phone number."
      },
      {
        label: "Plan the week", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("SCHEDULED") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>On the plan</h3><p>Dan Walker is lead, Sam Okafor supports.</p></div></div><div class="m-grid m-grid-3">' + stat("Planned start", "Tue 17 Mar", "09:00 · morning", "accent") + stat("Planned end", "Tue 17 Mar", "12:00") + stat("Engineers", "2", "1 lead + 1 support") + '</div>' +
          '<div class="m-flow"><span>Customer</span><span class="arrow">→</span><span>Job</span><span class="arrow">→</span><span class="on">Schedule</span><span class="arrow">→</span><span>On site</span><span class="arrow">→</span><span>Invoice</span><span class="arrow">→</span><span>Paid</span></div>') +
          panel('<div class="m-panel-head"><div><h3>Week at a glance</h3><p>Planned jobs by day.</p></div><span class="m-badge">Next 7 days</span></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0043", title: "Fit French doors", status: "SCHEDULED", sub: "Wed · Brookside School", side: "Hannah Brooks" }) +
            jobRow({ ref: "JOB-2026-0044", title: "Site survey", status: "SCHEDULED", sub: "Thu · Orchard Barn", side: "Tom Whitfield" }) + '</div>') + '</div>',
        caption: "Assign engineers, set dates and publish. JMS warns about clashes before a customer is let down, and the engineer's phone updates instantly.",
        tip: "The same record now drives the field visit and the invoice. Nothing is re-keyed."
      },
      {
        label: "On site", url: "jms.acme.example/#/my-jobs", role: "ENGINEER", active: "My jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Field work · Dan Walker</div><h1 class="m-title">My jobs</h1><p class="m-intro">Only jobs assigned to you, today first.</p></div></div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "1", "job to visit", "accent") + stat("Active", "3", "scheduled") + stat("Next", "2", "coming up") + stat("History", "14", "completed") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Today</h3><p>Your work for today, in plan order.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · 09:00 · Elaine Foster", side: "Start job →" }) + '</div>') +
          panel('<div class="m-panel-head"><div><h3>Update status</h3><p>Only the transitions your role can make are shown.</p></div>' + P("IN_PROGRESS") + '</div><div class="m-btn-row">' + mBtn("Complete job") + mBtn("Put on hold", "m-btn-quiet") + '</div><div class="m-notice m-notice-info"><strong>Actual start stamped</strong><p>09:04 · by Dan Walker · customer can see “In progress”.</p></div>') + '</div>',
        caption: "The engineer taps Start on their phone. The actual time is stamped and the customer sees “In progress” without a single office call.",
        tip: "The people doing the work update the record — from the place where it happened."
      },
      {
        label: "Customer view", url: "jms.acme.example/#/my-jobs", role: "CUSTOMER", active: "My jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Elaine Foster</div><h1 class="m-title">My jobs</h1><p class="m-intro">Your installations, dates and updates — only your jobs are shown.</p></div></div>' +
          panel('<div class="m-panel-head"><div><h3>Replace casement windows</h3><p>Meadow House Ltd · JOB-2026-0042</p></div>' + P("IN_PROGRESS") + '</div><div class="m-grid m-grid-3">' + stat("Planned", "Tue 17 Mar", "09:00–12:00") + stat("Lead engineer", "Dan", "on site now") + stat("Documents", "2", "job sheet, invoice") + '</div>' +
          '<div class="m-notice m-notice-info"><strong>Update for you</strong><p>Dan has started the installation. We expect to finish this morning and will update you here.</p></div>' +
          '<div class="m-timeline"><ul class="m-timeline">' + tItem("Job started on site", "Today 09:04 · customer visible") + tItem("Schedule published", "Fri 13 Mar · 09:00–12:00") + tItem("Job created", "Thu 12 Mar · JOB-2026-0042") + '</ul></div>') + '</div>',
        caption: "The customer opens their portal and gets a plain-English answer: who is coming, when, what is happening and what happens next.",
        tip: "This is the phone call that never has to happen."
      },
      {
        label: "Money", url: "jms.acme.example/#/insights/financials", role: "MANAGER", active: "Financials",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Insights · Money</div><h1 class="m-title">Financials</h1><p class="m-intro">Quoted, invoiced and paid work, with outstanding invoices.</p></div></div>' +
          '<div class="m-grid m-grid-4">' + stat("Quoted", "£128k", "jobs created in range") + stat("Invoiced", "£96k", "net issued") + stat("Paid", "£81k", "net settled", "accent") + stat("Outstanding", "£15k", "issued, not paid", "warn") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Invoice activity</h3><p>Issued and paid in the selected range.</p></div><span class="m-badge">Last 90 days</span></div><div class="m-table-wrap"><table class="m-table"><thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Issued</th><th class="m-right">Gross</th></tr></thead><tbody>' +
            '<tr><td class="m-ref">INV-2026-0118</td><td>Meadow House Ltd</td><td>' + P("PAID") + '</td><td>17 Mar</td><td class="m-right m-mono">£3,240</td></tr>' +
            '<tr><td class="m-ref">INV-2026-0117</td><td>Northgate Dental</td><td>' + P("ISSUED") + '</td><td>16 Mar</td><td class="m-right m-mono">£2,880</td></tr>' +
            '<tr><td class="m-ref">INV-2026-0116</td><td>Brookside School</td><td>' + P("ISSUED") + '</td><td>14 Mar</td><td class="m-right m-mono">£5,400</td></tr></tbody></table></div>') +
          '<div class="m-notice m-notice-ok"><strong>What this saves</strong><p>Invoice on the day of completion, see what is outstanding, and stop chasing paperwork at month end.</p></div></div>',
        caption: "Because the job, the status and the invoice are the same record, the owner can see quoted, invoiced and paid work without rebuilding a spreadsheet.",
        tip: "Fewer unbilled jobs, shorter payment cycles and a clear view of outstanding money."
      }
    ]
  };

  /* ============================== W1 ============================== */
  stories.w1 = {
    title: "Adding a customer",
    sub: "One form. One login. No spreadsheet.",
    scenes: [
      {
        label: "Customer list", url: "jms.acme.example/#/customers", role: "MANAGER", active: "Customers",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">People</div><h1 class="m-title">Customers</h1><p class="m-intro">Customer records, contact details and the jobs attached to them.</p></div>' + mBtn("New customer", "m-btn-primary", "aim-new") + '</div>' +
          '<div class="m-grid m-grid-3">' + customerCard("Meadow House Ltd", "Elaine Foster", "Manchester · M20 2AB", 3, 1) + customerCard("Northgate Dental", "Dr James Hill", "Stockport · SK1 1AA", 4, 2) + customerCard("Harbour View Flats", "Nina Patel", "Salford · M50 3UB", 3, 1) + '</div></div>',
        aim: "#aim-new", click: true,
        caption: "Everything starts from one customer list. Managers can see the contact, the place and how much live work each customer has.",
        tip: "Search by name, contact or postcode — no scrolling through a spreadsheet tab."
      },
      {
        label: "One short form", url: "jms.acme.example/#/customers/new", role: "MANAGER", active: "New customer",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">People</div><h1 class="m-title">New customer</h1><p class="m-intro">Add the contact details and, if needed, a portal login.</p></div></div>' +
          panel('<div class="m-form-grid">' + field("Customer name", "f-name", "", "e.g. Meadow House Ltd") + field("Main contact", "f-contact", "", "e.g. Elaine Foster") + field("Email address", "f-email", "", "customer@example.com") + field("Phone", "f-phone", "", "0161 555 0101") + field("Address line 1", "f-line1", "", "12 Meadow Lane") + field("Town", "f-town", "", "Didsbury") + field("Postcode", "f-postcode", "", "M20 2AB") + '</div>' +
          '<div class="m-switch-line"><span class="m-switch"></span><span><strong>Create a customer portal login</strong><br><span class="m-muted">Email is the username; JMS123 is the temporary password.</span></span></div>' +
          '<div class="m-btn-row">' + mBtn("Create customer") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        types: [
          { sel: "#f-name", text: "Meadow House Ltd", at: 500, per: 42 },
          { sel: "#f-contact", text: "Elaine Foster", at: 1250, per: 42 },
          { sel: "#f-email", text: "customer1@example.com", at: 1950, per: 36 },
          { sel: "#f-phone", text: "0161 555 0101", at: 2750, per: 40 }
        ],
        caption: "A single column of large fields with labels above them. No clever layout to learn — a busy office can fill this in under a minute.",
        tip: "Roughly eight minutes saved versus typing the same details into a spreadsheet and a separate login system."
      },
      {
        label: "Login included", url: "jms.acme.example/#/customers/new", role: "MANAGER", active: "New customer",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">People</div><h1 class="m-title">New customer</h1><p class="m-intro">The portal login is created at the same time.</p></div></div>' +
          panel('<div class="m-form-grid">' + field("Customer name", "f-name", "Meadow House Ltd") + field("Main contact", "f-contact", "Elaine Foster") + field("Email address", "f-email", "customer1@example.com") + field("Phone", "f-phone", "0161 555 0101") + '</div>' +
          '<div class="m-switch-line" id="aim-login"><span class="m-switch"></span><span><strong>Create a customer portal login</strong><br><span class="m-muted">Elaine signs in with customer1@example.com and must change JMS123 at first sign-in.</span></span></div>' +
          '<div class="m-notice m-notice-info"><strong>What the customer gets</strong><p>Their own My jobs page, dates, updates and documents. Nothing about other customers or company finances.</p></div>' +
          '<div class="m-btn-row">' + mBtn("Create customer", "m-btn-primary", "aim-save") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-login", click: true,
        pops: [{ sel: "#aim-login", at: 1500 }],
        caption: "The login is not a separate job. Leave the switch on and the email becomes the username, with a temporary password that must change.",
        tip: "No password spreadsheet and no “can you set me up?” email chain."
      },
      {
        label: "Saved and linked", url: "jms.acme.example/#/customers/meadow", role: "MANAGER", active: "Customers",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer</div><h1 class="m-title">Meadow House Ltd</h1><p class="m-intro">Contact, portal login and every job in one record.</p></div>' + mBtn("New job") + '</div>' +
          '<div class="m-toast" id="aim-toast"><span>✓</span><div><strong>Customer created</strong><span>Portal login active · Elaine Foster must change the temporary password at first sign-in.</span></div></div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Contact</h3><p>Elaine Foster · Active</p></div><span class="m-badge m-badge-ok">Portal login active</span></div><div class="m-form-grid"><div><span class="m-label">Email</span><div class="m-small">customer1@example.com</div></div><div><span class="m-label">Phone</span><div class="m-small">0161 555 0101</div></div><div class="m-full"><span class="m-label">Address</span><div class="m-small">12 Meadow Lane, Didsbury, Manchester, M20 2AB</div></div></div>') + '</div>' +
          '<div>' + panel('<div class="m-panel-head"><div><h3>Portal login</h3><p>The customer can sign in now.</p></div></div><div class="m-small"><span class="m-label">Email</span>customer1@example.com<br><span class="m-label" style="display:block;margin-top:6px">Status</span>Active · password change required<br><span class="m-label" style="display:block;margin-top:6px">Last signed in</span>Never</div>') + '</div></div></div>',
        aim: "#aim-toast",
        pops: [{ sel: "#aim-toast", at: 700 }],
        caption: "One save creates the customer, the login, the audit trail and the empty job list. Everything is linked from the first second.",
        tip: "One source of truth from day one, with a written record of who created it."
      },
      {
        label: "First sign-in", url: "jms.acme.example/#/my-jobs", role: "CUSTOMER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Elaine Foster</div><h1 class="m-title">Welcome to Acme Windows</h1><p class="m-intro">Your jobs, dates and documents — all in one place.</p></div>' + P("ACTIVE") + '</div>' +
          '<div class="m-notice m-notice-info"><strong>Change your temporary password</strong><p>Your first sign-in asks for a new password before you continue.</p></div>' +
          panel('<div class="m-panel-head"><div><h3>My jobs</h3><p>Your installations and updates.</p></div></div><div class="m-empty"><div class="mark">🏠</div><strong>No jobs yet</strong>Your installations will appear here as soon as Acme Windows creates them.</div>') +
          '<div class="m-small m-muted">You can see only your own jobs. Company dashboards, other customers and internal notes are never shown.</div></div>',
        caption: "The customer signs in, changes the password and lands on a calm, empty My jobs page. Every later conversation starts from this record.",
        tip: "The portal is ready before the first job — so the first update needs no setup."
      }
    ]
  };

  /* ============================== W2 ============================== */
  stories.w2 = {
    title: "Creating a job",
    sub: "A reference that follows the work to the invoice.",
    scenes: [
      {
        label: "Start from the dashboard", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Today · Operations</div><h1 class="m-title">Operations dashboard</h1><p class="m-intro">What is happening today, what is coming next, and what needs a decision.</p></div>' + mBtn("New job", "m-btn-primary", "aim-newjob") + '</div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "7", "jobs on site", "accent") + stat("Next 7 days", "18", "£42,600 quoted") + stat("On hold", "2", "needs attention", "warn") + stat("Needs invoicing", "4", "completed, no invoice", "info") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Next on the plan</h3><p>Planned jobs from today forward.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0041", title: "Install bay window", status: "IN_PROGRESS", sub: "Northgate Dental · Today 08:00", side: "Sam Okafor" }) +
            jobRow({ ref: "JOB-2026-0040", title: "Fit French doors", status: "SCHEDULED", sub: "Brookside School · Wed 13:00", side: "Hannah Brooks" }) + '</div>') + '</div>',
        aim: "#aim-newjob", click: true,
        caption: "Start a job from the dashboard, or from a customer page where JMS already knows the contact and address.",
        tip: "The button is always in the same place: one primary action per screen."
      },
      {
        label: "Describe the job", url: "jms.acme.example/#/jobs/new", role: "MANAGER", active: "New job",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Work</div><h1 class="m-title">New job</h1><p class="m-intro">Meadow House Ltd is pre-filled from the customer record.</p></div></div>' +
          panel('<div class="m-form-grid">' + field("Customer", "f-customer", "Meadow House Ltd") + field("Work type", "f-type", "Window installation") + '<div class="m-full">' + field("Job title", "f-title", "", "e.g. Replace casement windows") + '</div>' +
          '<div class="m-full"><label class="m-field"><span class="m-label">Description</span><div class="m-input" style="min-height:52px">Replace four casement windows to the rear of the property. Access via the side gate.</div></label></div>' +
          field("Priority", "f-priority", "Normal") + field("Price (net)", "f-price", "", "£2,700.00") +
          '<div class="m-full">' + field("Site address", "f-site", "12 Meadow Lane, Didsbury, M20 2AB") + '</div></div>' +
          '<div class="m-btn-row">' + mBtn("Save job", "m-btn-primary", "aim-savejob") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-savejob",
        types: [
          { sel: "#f-title", text: "Replace casement windows", at: 500, per: 40 },
          { sel: "#f-price", text: "2700.00", at: 1800, per: 60 }
        ],
        caption: "The customer and site are already known, so the manager only captures what is specific to this job: the work, the price and the plan.",
        tip: "The price is captured now, which means the invoice later needs no hunting through emails."
      },
      {
        label: "Reference allocated", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("DRAFT") + '</div>' +
          '<div class="m-toast" id="aim-toast"><span>✓</span><div><strong>Job saved as a draft</strong><span>Reference allocated: JOB-2026-0042. Anyone can search for it now.</span></div></div>' +
          panel('<div class="m-panel-head"><div><h3>What next?</h3><p>The job page offers the next steps as large pills.</p></div></div><div class="m-btn-row">' + mBtn("Assign engineers", "m-btn-primary", "aim-assign") + mBtn("Set dates", "m-btn-quiet") + mBtn("Publish schedule", "m-btn-quiet") + '</div>' +
          '<div class="m-notice m-notice-info"><strong>A draft is visible, not public</strong><p>The customer does not see this job until it is scheduled and has a date.</p></div>') + '</div>',
        aim: "#aim-assign", click: true,
        pops: [{ sel: "#aim-toast", at: 500 }],
        caption: "The reference is allocated on save. The job page then offers the next step as a big, obvious action rather than a hidden menu.",
        tip: "A draft is real and searchable, but the customer does not see it until it is scheduled."
      },
      {
        label: "Findable by anyone", url: "jms.acme.example/#/jobs", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Work</div><h1 class="m-title">Jobs</h1><p class="m-intro">Every job, across every customer, with its status and planned dates.</p></div>' + mBtn("New job") + '</div>' +
          panel('<div class="m-filters" style="display:flex;gap:7px;flex-wrap:wrap"><span class="m-badge">Search: JOB-2026</span><span class="m-badge">Status: All</span><span class="m-badge">Engineer: All</span><span class="m-badge">Customer: All</span></div>') +
          panel('<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Status</th><th>Planned</th><th>Engineers</th></tr></thead><tbody>' +
            '<tr id="aim-row"><td class="m-ref">JOB-2026-0042</td><td><strong>Replace casement windows</strong><br><span class="m-small m-muted">Window installation</span></td><td>Meadow House Ltd</td><td>' + P("DRAFT") + '</td><td class="m-nowrap">Not set</td><td class="m-muted">Unassigned</td></tr>' +
            '<tr><td class="m-ref">JOB-2026-0041</td><td><strong>Install bay window</strong><br><span class="m-small m-muted">Window installation</span></td><td>Northgate Dental</td><td>' + P("IN_PROGRESS") + '</td><td class="m-nowrap">Today 08:00</td><td>Sam Okafor</td></tr>' +
            '<tr><td class="m-ref">JOB-2026-0040</td><td><strong>Fit French doors</strong><br><span class="m-small m-muted">Window installation</span></td><td>Brookside School</td><td>' + P("SCHEDULED") + '</td><td class="m-nowrap">Wed 13:00</td><td>Hannah Brooks</td></tr></tbody></table></div>') + '</div>',
        aim: "#aim-row",
        pops: [{ sel: "#aim-row", at: 800 }],
        caption: "The new job appears in the list immediately, alongside live work. The reference is enough for anyone to find it.",
        tip: "No “which spreadsheet is that in?” — one list, filterable by status, engineer and customer."
      },
      {
        label: "Customer is linked", url: "jms.acme.example/#/customers/meadow", role: "MANAGER", active: "Customers",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer</div><h1 class="m-title">Meadow House Ltd</h1><p class="m-intro">Contact, portal login and every job in one record.</p></div>' + mBtn("New job") + '</div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Contact</h3><p>Elaine Foster · Active</p></div><span class="m-badge m-badge-ok">Portal login active</span></div><div class="m-form-grid"><div><span class="m-label">Email</span><div class="m-small">customer1@example.com</div></div><div><span class="m-label">Phone</span><div class="m-small">0161 555 0101</div></div><div class="m-full"><span class="m-label">Address</span><div class="m-small">12 Meadow Lane, Didsbury, M20 2AB</div></div></div>') + '</div>' +
          '<div>' + panel('<div class="m-panel-head"><div><h3>Jobs</h3><p>3 jobs for this customer.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "DRAFT", sub: "Just created · £2,700 net", side: "Assign →" }) +
            jobRow({ ref: "JOB-2025-0288", title: "Repair conservatory glazing", status: "PAID", sub: "Nov 2025 · £640", side: "View" }) + '</div>') + '</div></div></div>',
        caption: "The customer page already shows the new job. The office and the customer are looking at the same record, from the same moment.",
        tip: "When the customer rings, there is one page with the answer — not three systems to reconcile."
      }
    ]
  };

  /* ============================== W3 ============================== */
  stories.w3 = {
    title: "Assigning and planning",
    sub: "Right people, right days, warned about clashes.",
    scenes: [
      {
        label: "Open the job", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("DRAFT") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>What next?</h3><p>A draft needs engineers and dates before it can be scheduled.</p></div></div><div class="m-btn-row">' + mBtn("Assign engineers", "m-btn-primary", "aim-assign") + mBtn("Set dates", "m-btn-quiet") + mBtn("Publish schedule", "m-btn-quiet") + '</div>') +
          panel('<div class="m-panel-head"><div><h3>At a glance</h3><p>Where the job stands.</p></div></div><div class="m-grid m-grid-3">' + stat("Status", "Draft", "not yet public") + stat("Engineers", "None", "unassigned") + stat("Planned", "Not set", "needs a date") + '</div>') + '</div>',
        aim: "#aim-assign", click: true,
        caption: "A draft is not ready for the field. The job page makes the two missing pieces — engineers and dates — impossible to overlook.",
        tip: "The app asks for exactly what is missing, instead of leaving the office to remember."
      },
      {
        label: "Choose the team", url: "jms.acme.example/#/jobs/JOB-2026-0042/assign", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job · JOB-2026-0042</div><h1 class="m-title">Assign engineers</h1><p class="m-intro">Choose one or more active engineers. Mark one as lead.</p></div></div>' +
          panel('<div class="m-checks">' +
            '<div class="m-check on" id="aim-dan"><span class="box"></span><strong>Dan Walker</strong><span class="m-muted m-small">Manchester · available</span><span class="lead">Lead</span></div>' +
            '<div class="m-check on"><span class="box"></span><strong>Sam Okafor</strong><span class="m-muted m-small">Manchester · available</span></div>' +
            '<div class="m-check"><span class="box"></span><strong>Luis García</strong><span class="m-muted m-small">Stockport · booked that morning</span></div>' +
            '<div class="m-check"><span class="box"></span><strong>Hannah Brooks</strong><span class="m-muted m-small">Altrincham · available</span></div></div>' +
            '<div class="m-btn-row">' + mBtn("Save assignments", "m-btn-primary", "aim-save") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-dan", click: true,
        pops: [{ sel: "#aim-dan", at: 700 }, { sel: "#aim-save", at: 1400 }],
        caption: "Pick from active engineers, not a free-text box. Dan is marked lead, Sam supports, and the office can see who is already booked.",
        tip: "Assignment is instant: the job appears in each engineer's My jobs as soon as it is saved."
      },
      {
        label: "Set the dates", url: "jms.acme.example/#/jobs/JOB-2026-0042/schedule", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job · JOB-2026-0042</div><h1 class="m-title">Set dates</h1><p class="m-intro">Planned start and end, with a morning, afternoon or all-day block.</p></div></div>' +
          panel('<div class="m-form-grid">' + field("Planned start", "f-start", "Tue 17 Mar 2026, 09:00") + field("Planned end", "f-end", "Tue 17 Mar 2026, 12:00") + field("Slot", "f-slot", "Morning") + field("Lead engineer", "f-lead", "Dan Walker") + '</div>' +
          '<div class="m-notice m-notice-info"><strong>Dates are visible to the customer</strong><p>They see the planned window, not the internal schedule notes.</p></div>' +
          '<div class="m-btn-row">' + mBtn("Save and publish", "m-btn-primary", "aim-publish") + mBtn("Save dates only", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-publish", click: true,
        pops: [{ sel: "#aim-publish", at: 1000 }],
        caption: "Dates are entered once and used everywhere: the customer portal, the engineer's phone and the timeline dashboard.",
        tip: "No separate diary entry, no group message, no “can you put that in the calendar?”"
      },
      {
        label: "Clash warning", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("SCHEDULED") + '</div>' +
          '<div class="m-notice m-notice-warn" id="aim-warn"><strong>Heads up: Dan already has a job that morning</strong><p>JOB-2026-0039 at Harbour View Flats, 08:00–11:00. This is a warning, not a block — you can still publish if you have agreed it.</p></div>' +
          panel('<div class="m-panel-head"><div><h3>Published</h3><p>The job is now in the plan and on each engineer’s phone.</p></div>' + P("SCHEDULED") + '</div><div class="m-grid m-grid-3">' + stat("Planned start", "Tue 17 Mar", "09:00 · morning", "accent") + stat("Planned end", "Tue 17 Mar", "12:00") + stat("Engineers", "2", "Dan lead · Sam support") + '</div>') + '</div>',
        aim: "#aim-warn",
        pops: [{ sel: "#aim-warn", at: 700 }],
        caption: "JMS warns about the overlap before it becomes a missed appointment, but leaves the decision with the manager.",
        tip: "A warning costs nothing. A missed appointment costs a customer and a day's goodwill."
      },
      {
        label: "Field and plan updated", url: "jms.acme.example/#/insights/timeline", role: "MANAGER", active: "Timeline",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Insights</div><h1 class="m-title">Timeline</h1><p class="m-intro">Who is where, when — planned jobs by day.</p></div></div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Dan Walker · My jobs</h3><p>Assigned jobs, today first.</p></div></div><div class="m-list">' + jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Tue 17 Mar · Meadow House Ltd", side: "Dates set" }) + jobRow({ ref: "JOB-2026-0045", title: "Repair failed unit", status: "SCHEDULED", sub: "Wed 18 Mar · Willow Court", side: "Dates set" }) + '</div>') + '</div>' +
          '<div>' + panel('<div class="m-panel-head"><div><h3>This week</h3><p>Team capacity at a glance.</p></div></div><div class="m-list">' +
            jobRow({ ref: "Tue", title: "3 visits", status: "SCHEDULED", sub: "Dan, Sam, Hannah", side: "North" }) +
            jobRow({ ref: "Wed", title: "2 visits", status: "SCHEDULED", sub: "Luis, Hannah", side: "South" }) +
            jobRow({ ref: "Thu", title: "4 visits", status: "SCHEDULED", sub: "Dan, Sam, Luis, Ben", side: "All areas" }) + '</div>') + '</div></div>' +
          '<div class="m-notice m-notice-ok"><strong>One schedule, three audiences</strong><p>The office sees the plan, engineers see their own jobs, and customers see their own dates.</p></div></div>',
        caption: "The same schedule powers the timeline, the engineer's list and the customer's dates. Nobody maintains a second copy.",
        tip: "The office can see gaps and overloads before the week starts, not after it has gone wrong."
      }
    ]
  };

  /* ============================== W4 ============================== */
  stories.w4 = {
    title: "On site",
    sub: "The engineer updates the job from the doorstep.",
    scenes: [
      {
        label: "Today's jobs", url: "jms.acme.example/#/my-jobs", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Field work · Dan Walker</div><h1 class="m-title">My jobs</h1><p class="m-intro">Only jobs assigned to you. Today first.</p></div></div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "1", "job to visit", "accent") + stat("Active", "3", "scheduled") + stat("Next", "2", "coming up") + stat("History", "14", "completed") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Today</h3><p>Your work for today, in plan order.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · 09:00 · Elaine Foster · 0161 555 0101", side: '<span id="aim-open">Open →</span>' }) +
            jobRow({ ref: "JOB-2026-0043", title: "Fit French doors", status: "SCHEDULED", sub: "Brookside School · 13:00", side: "Open →" }) + '</div>') + '</div>',
        caption: "An engineer signs in on a phone and sees only their own work. The customer name, site and phone number are already there.",
        tip: "No printed run sheet, no “what's the address again?” call to the office."
      },
      {
        label: "Open the job", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("SCHEDULED") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Update status</h3><p>Only the transitions your role can make are shown.</p></div></div><div class="m-btn-row">' + mBtn("Start job", "m-btn-primary", "aim-start") + mBtn("Put on hold", "m-btn-quiet") + mBtn("Complete job", "m-btn-quiet") + '</div>') +
          panel('<div class="m-panel-head"><div><h3>Job details</h3><p>Window installation · Normal priority</p></div></div><div class="m-grid m-grid-2">' +
            '<div><span class="m-label">Customer</span><div class="m-small">Meadow House Ltd<br>Elaine Foster · 0161 555 0101</div></div>' +
            '<div><span class="m-label">Site</span><div class="m-small">12 Meadow Lane, Didsbury, Manchester, M20 2AB</div></div>' +
            '<div><span class="m-label">Planned</span><div class="m-small">Tue 17 Mar 2026 · 09:00–12:00 · Morning</div></div>' +
            '<div><span class="m-label">Lead</span><div class="m-small">Dan Walker (you)</div></div></div>') + '</div>',
        aim: "#aim-start", click: true,
        caption: "The status control shows only the actions an engineer is allowed to take. There is no way to cancel a job or edit the price by accident.",
        tip: "Three big buttons instead of a training course. The phone does the rest."
      },
      {
        label: "Start the job", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("IN_PROGRESS") + '</div>' +
          '<div class="m-notice m-notice-info" id="aim-start-ok"><strong>Job started · 09:04</strong><p>Actual start stamped by Dan Walker. The customer can see “In progress”.</p></div>' +
          panel('<div class="m-panel-head"><div><h3>Update status</h3><p>You are on site.</p></div>' + P("IN_PROGRESS") + '</div><div class="m-btn-row">' + mBtn("Complete job", "m-btn-primary", "aim-complete") + mBtn("Put on hold", "m-btn-quiet") + '</div>') +
          panel('<div class="m-panel-head"><div><h3>Timeline</h3><p>Every status, assignment and note.</p></div></div><div class="m-timeline"><ul class="m-timeline">' +
            tItem("Status changed to IN_PROGRESS", "Today 09:04 · Dan Walker") + tItem("Schedule published", "Fri 13 Mar · 09:00–12:00") + '</ul></div>') + '</div>',
        aim: "#aim-complete", click: true,
        pops: [{ sel: "#aim-start-ok", at: 400 }],
        caption: "One tap records the real start time and writes it to the timeline. The office and the customer see the change immediately.",
        tip: "Actual times are captured by the person doing the work, not reconstructed at the end of the week."
      },
      {
        label: "Leave a note", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("IN_PROGRESS") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Add a note</h3><p>Keep customer-visible notes plain and helpful.</p></div></div>' +
            '<label class="m-field"><span class="m-label">Note</span><textarea class="m-input" id="f-note" rows="2" placeholder="What changed?"></textarea></label>' +
            '<div class="m-form-grid"><div>' + field("Visible to", "f-vis", "Customer can see this") + '</div></div>' +
            '<div class="m-btn-row">' + mBtn("Add note", "m-btn-primary", "aim-note") + '</div>') +
          '<div class="m-notice m-notice-info" id="aim-note-ok" style="opacity:.35"><strong>Update for you</strong><p>All four windows are fitted and sealed. We are clearing up and will be finished by 11:30.</p></div>',
        aim: "#f-note", click: true,
        types: [{ sel: "#f-note", text: "All four windows are fitted and sealed. We are clearing up and will be finished by 11:30.", at: 500, per: 30 }],
        pops: [{ sel: "#aim-note-ok", at: 3400 }],
        caption: "The engineer chooses who can see the note. A customer-visible message appears in the portal; an internal note stays in the office.",
        tip: "This replaces the phone call to the office and the office's phone call to the customer."
      },
      {
        label: "Complete the job", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("COMPLETED") + '</div>' +
          '<div class="m-notice m-notice-ok"><strong>Job completed · 11:28</strong><p>Actual end stamped. The customer can see the completion note and the job is ready to invoice.</p></div>' +
          panel('<div class="m-panel-head"><div><h3>Times recorded</h3><p>Planned versus actual, from the field.</p></div></div><div class="m-grid m-grid-2">' +
            '<div><span class="m-label">Planned</span><div class="m-small">Tue 17 Mar · 09:00–12:00</div></div><div><span class="m-label">Actual</span><div class="m-small">Tue 17 Mar · 09:04–11:28</div></div></div>') +
          panel('<div class="m-panel-head"><div><h3>Timeline</h3><p>What the customer sees.</p></div></div><div class="m-timeline"><ul class="m-timeline">' +
            tItem("Job completed", "Today 11:28 · Dan Walker") + tItem("Update for you", "Today 11:10 · all windows fitted and sealed") + tItem("Job started", "Today 09:04") + '</ul></div>') + '</div>',
        caption: "Complete stamps the real finish time. The job is now ready for invoicing, and the customer's portal already tells the story.",
        tip: "Completed today means invoiced today, which means paid sooner."
      }
    ]
  };

  /* ============================== W5 ============================== */
  stories.w5 = {
    title: "Close out and invoice",
    sub: "From completed to paid in a few clicks.",
    scenes: [
      {
        label: "See what needs billing", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Today · Operations</div><h1 class="m-title">Operations dashboard</h1><p class="m-intro">What is happening today, what is coming next, and what needs a decision.</p></div></div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "7", "jobs on site", "accent") + stat("Next 7 days", "18", "£42,600 quoted") + stat("On hold", "2", "needs attention", "warn") + stat("Needs invoicing", "4", "completed, no invoice", "info") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Exceptions</h3><p>Jobs that may need a manager.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0039", title: "Repair failed sealed unit", status: "COMPLETED", sub: "Harbour View Flats · completed 2 days ago", side: '<span id="aim-needs">Create invoice →</span>' }) +
            jobRow({ ref: "JOB-2026-0038", title: "Replace window handles", status: "ON_HOLD", sub: "Kingsway Hotel · waiting on parts", side: "Review" }) + '</div>') + '</div>',
        aim: "#aim-needs", click: true,
        caption: "Completed jobs without an invoice are surfaced on the dashboard — not discovered at month end.",
        tip: "The gap between finishing work and sending the bill is often the biggest delay in getting paid."
      },
      {
        label: "Needs invoicing", url: "jms.acme.example/#/insights/needs-invoicing", role: "MANAGER", active: "Needs invoicing",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Money</div><h1 class="m-title">Needs invoicing</h1><p class="m-intro">Completed jobs without a live invoice.</p></div><span class="m-badge">4</span></div>' +
          panel('<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Completed</th><th class="m-right">Net</th><th></th></tr></thead><tbody>' +
            '<tr><td class="m-ref">JOB-2026-0042</td><td>Replace casement windows</td><td>Meadow House Ltd</td><td>Today</td><td class="m-right m-mono">£2,700</td><td>' + mBtn("Create invoice", "m-btn-primary", "aim-create") + '</td></tr>' +
            '<tr><td class="m-ref">JOB-2026-0039</td><td>Repair failed sealed unit</td><td>Harbour View Flats</td><td>15 Mar</td><td class="m-right m-mono">£420</td><td>' + mBtn("Create invoice", "m-btn-quiet") + '</td></tr>' +
            '<tr><td class="m-ref">JOB-2026-0036</td><td>Fit French doors</td><td>Brookside School</td><td>12 Mar</td><td class="m-right m-mono">£4,500</td><td>' + mBtn("Create invoice", "m-btn-quiet") + '</td></tr></tbody></table></div>') + '</div>',
        aim: "#aim-create", click: true,
        caption: "One list, one action. The price is already on the job, so there is nothing to look up before billing.",
        tip: "No spreadsheet of “jobs to invoice” and no Friday afternoon reconciliation."
      },
      {
        label: "Invoice from the job", url: "jms.acme.example/#/invoices/new", role: "MANAGER", active: "Needs invoicing",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Money</div><h1 class="m-title">New invoice</h1><p class="m-intro">Create a draft from a completed job. Review it before issuing.</p></div></div>' +
          panel('<label class="m-field"><span class="m-label">Job</span><input class="m-input" value="JOB-2026-0042 · Replace casement windows · Meadow House Ltd"></label>' +
            '<div class="m-notice m-notice-info"><strong>Lines filled from the job</strong><p>Edit the description, quantity or unit price, or add another line.</p></div>' +
            '<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Description</th><th>Qty</th><th class="m-right">Unit</th><th class="m-right">Amount</th></tr></thead><tbody>' +
            '<tr><td>Replace casement windows</td><td>1</td><td class="m-right m-mono">£2,700.00</td><td class="m-right m-mono">£2,700.00</td></tr></tbody></table></div>' +
            '<div class="m-grid m-grid-3" style="margin-top:10px">' + stat("Net", "£2,700", "from the job") + stat("VAT (20%)", "£540", "company rate") + stat("Gross", "£3,240", "customer pays", "accent") + '</div>' +
            '<div class="m-btn-row">' + mBtn("Save draft invoice", "m-btn-primary", "aim-savedraft") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-savedraft", click: true,
        caption: "The invoice is built from the agreed price. VAT and totals are calculated, and the numbering is handled by JMS.",
        tip: "A 15-minute retyping job becomes a review-and-click job."
      },
      {
        label: "Review and issue", url: "jms.acme.example/#/invoices/INV-2026-0119", role: "MANAGER", active: "Invoices",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Invoice · Draft</div><h1 class="m-title">INV-2026-0119</h1><p class="m-intro">Meadow House Ltd · JOB-2026-0042</p></div>' + P("DRAFT") + '</div>' +
          '<div class="m-paper"><div class="m-paper-head"><div class="who"><span class="mark">J</span><div><strong>Acme Windows</strong><p>Unit 4, Acme Works, Manchester<br>VAT 123 4567 89</p></div></div><div class="m-paper-title"><h3>INV-2026-0119</h3>' + P("DRAFT") + '</div></div>' +
            '<table><thead><tr><th>Description</th><th class="m-right">Qty</th><th class="m-right">Unit</th><th class="m-right">Amount</th></tr></thead><tbody><tr><td>Replace casement windows</td><td class="m-right">1</td><td class="m-right m-mono">£2,700.00</td><td class="m-right m-mono">£2,700.00</td></tr></tbody></table>' +
            '<div class="m-paper-totals"><div><span>Net</span><strong>£2,700.00</strong></div><div><span>VAT</span><strong>£540.00</strong></div><div class="grand"><span>Total</span><strong>£3,240.00</strong></div></div></div>' +
          '<div class="m-btn-row">' + mBtn("Issue invoice", "m-btn-primary", "aim-issue") + mBtn("Print / Save PDF", "m-btn-quiet") + mBtn("Void", "m-btn-danger") + '</div></div>',
        aim: "#aim-issue", click: true,
        caption: "The draft is a real invoice preview. Issue it when the details are right — then the customer can download it.",
        tip: "The review step prevents the classic mistake: invoicing the wrong customer or the wrong price."
      },
      {
        label: "Issued and paid", url: "jms.acme.example/#/invoices/INV-2026-0119", role: "MANAGER", active: "Invoices",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Invoice · Issued</div><h1 class="m-title">INV-2026-0119</h1><p class="m-intro">Meadow House Ltd · JOB-2026-0042</p></div>' + P("ISSUED") + '</div>' +
          '<div class="m-notice m-notice-ok" id="aim-issued"><strong>Invoice issued</strong><p>The job is now INVOICED. The customer can download their copy from the portal.</p></div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Payment</h3><p>Due Tue 31 Mar 2026.</p></div></div><div class="m-btn-row">' + mBtn("Mark paid", "m-btn-primary", "aim-paid") + mBtn("Print / Save PDF", "m-btn-quiet") + '</div>') + '</div>' +
          '<div>' + panel('<div class="m-panel-head"><div><h3>Job</h3><p>JOB-2026-0042</p></div></div><div class="m-small"><span class="m-label">Status</span>COMPLETED → INVOICED<br><span class="m-label" style="display:block;margin-top:5px">Customer sees</span>Issued invoice + PDF</div>') + '</div></div>' +
          '<div class="m-notice m-notice-info"><strong>Then the money lands</strong><p>Marking paid closes the job as PAID and updates the financial dashboard immediately.</p></div></div>',
        aim: "#aim-paid", click: true,
        pops: [{ sel: "#aim-issued", at: 500 }],
        caption: "Issue moves the job and the invoice together. Mark paid when the money lands, and the job closes cleanly.",
        tip: "One record carries the job, the invoice, the PDF and the audit trail. Nothing is stitched together later."
      }
    ]
  };

  /* ============================== W6 ============================== */
  stories.w6 = {
    title: "The customer portal",
    sub: "Plain answers without a phone call.",
    scenes: [
      {
        label: "Sign in", url: "jms.acme.example/#/signin", role: "CUSTOMER", active: "",
        html: '<div class="m-page" style="max-width:360px;margin:20px auto"><div class="m-card" style="padding:20px"><div style="display:flex;align-items:center;gap:9px;margin-bottom:12px"><span class="m-avatar" style="width:36px;height:36px;font-size:13px">J</span><div><div class="m-eyebrow" style="margin:0">Acme Windows</div><strong style="font-family:var(--font-serif);font-size:17px">Job Management System</strong></div></div>' +
          field("Email address", "f-email2", "customer1@example.com") + field("Password", "f-pass", "••••••••") +
          '<div class="m-btn-row">' + mBtn("Sign in", "m-btn-primary") + '</div><div class="m-small m-muted" style="margin-top:8px">Demo password for every account: JMS123</div></div></div>',
        caption: "Customers sign in with their email and a temporary password. On first use, they are asked to choose a new one.",
        tip: "No app to install and no training. The portal works in the browser on any phone."
      },
      {
        label: "My jobs", url: "jms.acme.example/#/my-jobs", role: "CUSTOMER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Elaine Foster</div><h1 class="m-title">My jobs</h1><p class="m-intro">Your installations, dates and updates — only your jobs are shown.</p></div></div>' +
          '<div class="m-grid m-grid-4">' + stat("Active", "1", "in progress", "accent") + stat("Coming up", "1", "scheduled") + stat("History", "2", "completed") + stat("Documents", "3", "ready to download") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Your installations</h3><p>Open a job for dates, updates and documents.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "IN_PROGRESS", sub: "Meadow House Ltd · Today 09:00–12:00 · Lead: Dan", side: '<span id="aim-openjob">Open →</span>' }) +
            jobRow({ ref: "JOB-2026-0043", title: "Fit French doors", status: "SCHEDULED", sub: "Brookside School · Wed 13:00 · Lead: Hannah", side: "Open →" }) + '</div>') + '</div>',
        aim: "#aim-openjob", click: true,
        caption: "The customer sees a short list of their own work with a clear status and the lead engineer's first name.",
        tip: "This one screen removes most “when are you coming?” calls."
      },
      {
        label: "Plain-English detail", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "CUSTOMER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Job</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows</p></div>' + P("IN_PROGRESS") + '</div>' +
          panel('<div class="m-grid m-grid-2"><div><span class="m-label">Planned</span><div class="m-small">Tue 17 Mar 2026<br>09:00–12:00 · morning</div></div><div><span class="m-label">Actual</span><div class="m-small">Started today at 09:04<br>On site now</div></div><div><span class="m-label">Lead engineer</span><div class="m-small">Dan · Acme Windows</div></div><div><span class="m-label">Status</span><div class="m-small">In progress</div></div></div>') +
          '<div class="m-notice m-notice-info"><strong>Update for you</strong><p>Dan has started the installation. We expect to finish this morning and will update you here.</p></div>' +
          '<div class="m-small m-muted">No prices beyond your own invoice, no other customers, no company dashboards.</div></div>',
        caption: "The detail page uses plain language: what is planned, what is actually happening, who is on site and what happens next.",
        tip: "No internal jargon, no technical status codes and no access to anything that is not theirs."
      },
      {
        label: "Documents", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "CUSTOMER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Job</div><h1 class="m-title">Documents</h1><p class="m-intro">Job sheet and invoices for this installation.</p></div></div>' +
          panel('<div class="m-list">' + docRow("Job sheet · JOB-2026-0042", "Generated from live data · updated today") + docRow("Invoice INV-2026-0119", "Issued · £3,240 gross") + docRow("Invoice INV-2025-0991", "Paid · Nov 2025") + '</div>' +
            '<div class="m-notice m-notice-info"><strong>Downloaded, not requested</strong><p>The customer gets their paperwork without emailing the office or waiting for a reply.</p></div>') +
          '<div class="m-notice m-notice-ok"><strong>The answer is already here</strong><p>Status, dates, engineer and documents — the four things customers call about.</p></div></div>',
        caption: "Documents are generated from live data and listed in the portal, so the customer can download them at any time.",
        tip: "Fewer “can you resend the invoice?” emails, and a more professional impression."
      },
      {
        label: "Scoped by design", url: "jms.acme.example/#/my-jobs", role: "CUSTOMER", active: "My jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Elaine Foster</div><h1 class="m-title">What you can see</h1><p class="m-intro">Only your own jobs, dates and documents.</p></div></div>' +
          '<div class="m-grid m-grid-3">' + stat("Your jobs", "4", "only Meadow House Ltd", "accent") + stat("Other customers", "0", "never visible") + stat("Company finances", "0", "never visible") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Your navigation</h3><p>A short list, not an admin console.</p></div></div><div class="m-list">' +
            '<div class="m-row"><div class="m-row-main"><strong>My jobs</strong><span class="m-row-sub">Status, dates, updates</span></div><span class="m-badge m-badge-ok">Allowed</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>My invoices</strong><span class="m-row-sub">Issued and paid invoices</span></div><span class="m-badge m-badge-ok">Allowed</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>Appearance</strong><span class="m-row-sub">Dark mode, text size</span></div><span class="m-badge m-badge-ok">Allowed</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>Customers, staff, financials</strong><span class="m-row-sub">Company records</span></div><span class="m-badge m-badge-warn">Hidden</span></div></div>') + '</div>',
        caption: "A customer's navigation is deliberately short. They see their own work and documents, and nothing else — even by guessing a web address.",
        tip: "Visibility is not security: the same rules are enforced on the server, not just hidden in the menu."
      }
    ]
  };

  /* ============================== W7 ============================== */
  stories.w7 = {
    title: "PDFs from live data",
    sub: "Branded paperwork, generated on demand.",
    scenes: [
      {
        label: "From the job", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("COMPLETED") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Documents</h3><p>Generated from live data.</p></div></div><div class="m-btn-row">' + mBtn("Job sheet PDF", "m-btn-primary", "aim-pdf") + mBtn("Invoice INV-2026-0119", "m-btn-quiet") + '</div>' +
            '<div class="m-notice m-notice-info"><strong>Always current</strong><p>If the job changes after generation, the next download reflects the new data.</p></div>') +
          panel('<div class="m-grid m-grid-3">' + stat("Customer", "Meadow House Ltd", "Elaine Foster") + stat("Engineers", "Dan, Sam", "lead + support") + stat("Actual", "09:04–11:28", "stamped on site") + '</div>') + '</div>',
        aim: "#aim-pdf", click: true,
        caption: "Any user with document permission opens the job and asks for the PDF. There is no template to find and no data to copy.",
        tip: "The job sheet uses exactly the same information the office and the customer are already looking at."
      },
      {
        label: "The job sheet", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Generated document</div><h1 class="m-title">Job sheet</h1><p class="m-intro">Built from live data at the moment you clicked.</p></div><span class="m-badge m-badge-ok">Ready</span></div>' +
          '<div class="m-paper"><div class="m-paper-head"><div class="who"><span class="mark">J</span><div><strong>Acme Windows</strong><p>Unit 4, Acme Works, Manchester<br>0161 555 0100 · VAT 123 4567 89</p></div></div><div class="m-paper-title"><h3>Job sheet</h3><span class="m-small m-muted">JOB-2026-0042</span></div></div>' +
            '<div class="m-grid m-grid-2" style="gap:10px;margin-bottom:8px"><div><span class="m-label">Customer</span><div class="m-small">Meadow House Ltd<br>Elaine Foster · 0161 555 0101</div></div><div><span class="m-label">Site</span><div class="m-small">12 Meadow Lane, Didsbury<br>Manchester, M20 2AB</div></div></div>' +
            '<table><thead><tr><th>Work</th><th>Planned</th><th>Actual</th><th>Engineers</th></tr></thead><tbody><tr><td>Replace casement windows</td><td>17 Mar 2026<br>09:00–12:00</td><td>17 Mar 2026<br>09:04–11:28</td><td>Dan Walker (lead)<br>Sam Okafor</td></tr></tbody></table>' +
            '<div class="m-stamp">Generated 17 Mar 2026, 11:31 · live data</div></div></div>',
        caption: "The job sheet includes the company identity, the site, the planned and actual times, and the engineers who did the work.",
        tip: "Professional paperwork without Word, without a template and without retyping."
      },
      {
        label: "The invoice", url: "jms.acme.example/#/invoices/INV-2026-0119", role: "MANAGER", active: "Invoices",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Generated document</div><h1 class="m-title">Invoice PDF</h1><p class="m-intro">Available once the invoice is issued.</p></div>' + P("ISSUED") + '</div>' +
          '<div class="m-paper"><div class="m-paper-head"><div class="who"><span class="mark">J</span><div><strong>Acme Windows</strong><p>Unit 4, Acme Works, Manchester<br>VAT 123 4567 89</p></div></div><div class="m-paper-title"><h3>INV-2026-0119</h3><span class="m-small m-muted">Issued 17 Mar 2026</span></div></div>' +
            '<div class="m-grid m-grid-2" style="gap:10px;margin-bottom:8px"><div><span class="m-label">Invoice to</span><div class="m-small">Meadow House Ltd<br>12 Meadow Lane, M20 2AB</div></div><div><span class="m-label">Job</span><div class="m-small">JOB-2026-0042<br>Replace casement windows</div></div></div>' +
            '<table><thead><tr><th>Description</th><th class="m-right">Qty</th><th class="m-right">Unit</th><th class="m-right">Amount</th></tr></thead><tbody><tr><td>Replace casement windows</td><td class="m-right">1</td><td class="m-right m-mono">£2,700.00</td><td class="m-right m-mono">£2,700.00</td></tr></tbody></table>' +
            '<div class="m-paper-totals"><div><span>Net</span><strong>£2,700.00</strong></div><div><span>VAT (20%)</span><strong>£540.00</strong></div><div class="grand"><span>Total</span><strong>£3,240.00</strong></div></div>' +
            '<div class="m-stamp">Generated 17 Mar 2026, 15:02 · gapless number</div></div></div>',
        caption: "The invoice PDF uses the same live invoice record: lines, VAT, totals, terms and a gapless number.",
        tip: "The customer gets a document that matches the job, the invoice and the accounts — every time."
      },
      {
        label: "Customer downloads", url: "jms.acme.example/#/my-jobs", role: "CUSTOMER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Customer portal · Elaine Foster</div><h1 class="m-title">Documents</h1><p class="m-intro">Your job sheet and invoice, ready to download.</p></div></div>' +
          panel('<div class="m-list">' + docRow("Job sheet · JOB-2026-0042", "Branded PDF · generated from live data") + docRow("Invoice INV-2026-0119", "Issued · £3,240 gross") + '</div>' +
            '<div class="m-notice m-notice-ok" id="aim-download"><strong>Download without asking</strong><p>The customer does not need to phone the office or wait for an email attachment.</p></div>') +
          '<div class="m-small m-muted">If the office updates the job, the next download shows the new data.</div></div>',
        aim: "#aim-download",
        pops: [{ sel: "#aim-download", at: 700 }],
        caption: "The same document appears in the customer's portal as soon as it is available. No attachment, no file size limit, no lost email.",
        tip: "Self-service paperwork is a quiet, constant time saver for the office."
      },
      {
        label: "Never stale", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">The record changes; the next PDF changes with it.</p></div>' + P("COMPLETED") + '</div>' +
          '<div class="m-notice m-notice-info"><strong>Corrected completion note</strong><p>The office added a note at 16:10. The job sheet downloaded now will include it.</p></div>' +
          panel('<div class="m-panel-head"><div><h3>Document history</h3><p>Version and time are recorded. No stale cached files.</p></div></div><div class="m-list">' +
            '<div class="m-row"><div class="m-row-main"><strong>Job sheet · JOB-2026-0042</strong><span class="m-row-sub">Version 3 · generated 17 Mar 2026, 16:12</span></div><span class="m-badge m-badge-ok">Current</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>Invoice INV-2026-0119</strong><span class="m-row-sub">Version 1 · issued 17 Mar 2026, 15:02</span></div><span class="m-badge m-badge-info">Issued</span></div></div>') + '</div>',
        caption: "Every download is built from the current record. If the job changes, the next PDF is correct without anyone remembering to regenerate it.",
        tip: "No “which version did I send?” and no outdated paperwork in a customer's inbox."
      }
    ]
  };

  /* ============================== W8 ============================== */
  stories.w8 = {
    title: "Roles and permissions",
    sub: "Access policy as a table, not a project.",
    scenes: [
      {
        label: "The matrix", url: "jms.acme.example/#/admin/roles", role: "ADMIN", active: "Roles & permissions",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Admin</div><h1 class="m-title">Roles & permissions</h1><p class="m-intro">The role × action matrix that drives navigation, buttons and access.</p></div></div>' +
          panel('<div class="m-table-wrap"><table class="m-matrix"><thead><tr><th>Area</th><th>Action key</th><th>Admin</th><th>Manager</th><th>Engineer</th><th>Customer</th></tr></thead><tbody>' +
            '<tr class="grp"><td colspan="6">Jobs</td></tr>' +
            '<tr><td></td><td class="m-mono">job.view.all</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td></td><td class="m-mono">job.create</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td></td><td class="m-mono">job.status.advance</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td></td><td class="m-mono">job.cancel</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick" id="aim-cell"></span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr class="grp"><td colspan="6">Money & admin</td></tr>' +
            '<tr><td></td><td class="m-mono">invoice.create</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td></td><td class="m-mono">admin.permissions.edit</td><td class="cell"><span class="m-tick locked">🔒</span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td></tr></tbody></table></div>') + '</div>',
        aim: "#aim-cell", click: true,
        caption: "One table holds the whole access policy. Each row is an action; each column is a role; every cell is a decision the office can make.",
        tip: "No hidden if-statements and no developer needed to answer “can engineers cancel jobs?”"
      },
      {
        label: "Toggle and understand", url: "jms.acme.example/#/admin/roles", role: "ADMIN", active: "Roles & permissions",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Admin</div><h1 class="m-title">Roles & permissions</h1><p class="m-intro">Toggle a cell and read the effect before saving.</p></div></div>' +
          panel('<div class="m-table-wrap"><table class="m-matrix"><thead><tr><th>Area</th><th>Action key</th><th>Admin</th><th>Manager</th><th>Engineer</th><th>Customer</th></tr></thead><tbody>' +
            '<tr class="grp"><td colspan="6">Jobs</td></tr>' +
            '<tr><td></td><td class="m-mono">job.status.advance</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td></td><td class="m-mono">job.cancel</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick on is-new" id="aim-toggle">✓</span></td><td class="cell"><span class="m-tick"></span></td></tr></tbody></table></div>' +
            '<div class="m-notice m-notice-warn" id="aim-explain"><strong>Engineers will be able to cancel their own jobs</strong><p>This removes a safeguard: a field engineer could cancel a job without a manager. The change is recorded in the audit log.</p></div>' +
            '<div class="m-btn-row">' + mBtn("Save permissions", "m-btn-primary", "aim-saveroles") + mBtn("Cancel", "m-btn-quiet") + '</div>') + '</div>',
        aim: "#aim-toggle", click: true,
        pops: [{ sel: "#aim-toggle", at: 900 }, { sel: "#aim-explain", at: 1500 }],
        caption: "Before saving, JMS explains the blast radius in plain language: who gains the ability, and what safeguard is being removed.",
        tip: "The office can make a policy decision with the consequences in front of them — not in a support ticket."
      },
      {
        label: "Saved and audited", url: "jms.acme.example/#/admin/audit", role: "ADMIN", active: "Audit log",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Admin</div><h1 class="m-title">Audit log</h1><p class="m-intro">Who changed what, and when.</p></div><span class="m-badge">Live</span></div>' +
          '<div class="m-toast" id="aim-audit"><span>✓</span><div><strong>Permissions saved</strong><span>Applies on the next request. Navigation and buttons update automatically.</span></div></div>' +
          panel('<div class="m-table-wrap"><table class="m-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>' +
            '<tr><td>Just now</td><td>Alex Morgan</td><td class="m-mono">permission.update</td><td class="m-small">ENGINEER · job.cancel · denied → allowed</td></tr>' +
            '<tr><td>Today 09:12</td><td>Alex Morgan</td><td class="m-mono">customer.create</td><td class="m-small">Meadow House Ltd · login invited</td></tr>' +
            '<tr><td>Yesterday 16:40</td><td>Priya Shah</td><td class="m-mono">invoice.issue</td><td class="m-small">INV-2026-0118 · £3,240</td></tr></tbody></table></div>') + '</div>',
        aim: "#aim-audit",
        pops: [{ sel: "#aim-audit", at: 700 }],
        caption: "Every permission change writes an audit row with the actor, the role, the action and the before/after values.",
        tip: "If someone asks “who changed that?”, the answer is already written down."
      },
      {
        label: "What the engineer sees", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "ENGINEER", active: "My jobs", phone: true,
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("IN_PROGRESS") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Update status</h3><p>Only the transitions your role can make are shown.</p></div></div><div class="m-btn-row">' + mBtn("Complete job") + mBtn("Put on hold", "m-btn-quiet") + '</div>' +
            '<div class="m-small m-muted" style="margin-top:8px">Cancel job is now available because the admin granted it. It appears immediately, with no release.</div>') +
          panel('<div class="m-panel-head"><div><h3>Navigation</h3><p>Pills are filtered by permission.</p></div></div><div class="m-list">' +
            '<div class="m-row"><div class="m-row-main"><strong>My jobs</strong></div><span class="m-badge m-badge-ok">Allowed</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>Timeline</strong></div><span class="m-badge m-badge-ok">Allowed</span></div>' +
            '<div class="m-row"><div class="m-row-main"><strong>Company settings</strong></div><span class="m-badge m-badge-warn">Hidden</span></div></div>') + '</div>',
        caption: "The new permission is live on the next request. The engineer's screen shows the action, and the menu still hides everything they cannot use.",
        tip: "Policy changes take seconds, not a deployment window."
      },
      {
        label: "Safeguards", url: "jms.acme.example/#/admin/roles", role: "ADMIN", active: "Roles & permissions",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Admin</div><h1 class="m-title">Safeguards</h1><p class="m-intro">Some cells cannot be switched off, with a reason.</p></div></div>' +
          panel('<div class="m-table-wrap"><table class="m-matrix"><thead><tr><th>Action key</th><th>Admin</th><th>Engineer</th><th>Customer</th></tr></thead><tbody>' +
            '<tr><td class="m-mono">admin.permissions.edit</td><td class="cell"><span class="m-tick locked">🔒</span></td><td class="cell"><span class="m-tick"></span></td><td class="cell"><span class="m-tick"></span></td></tr>' +
            '<tr><td class="m-mono">admin.audit.view</td><td class="cell"><span class="m-tick on">✓</span></td><td class="cell"><span class="m-tick locked">🔒</span></td><td class="cell"><span class="m-tick locked">🔒</span></td></tr></tbody></table></div>' +
            '<div class="m-notice m-notice-info"><strong>Why these are locked</strong><p>An admin must always keep permission editing, or nobody could undo a mistake. The audit log cannot be granted to customers or engineers.</p></div>' +
            '<div class="m-notice m-notice-warn"><strong>Also protected</strong><p>The last active admin cannot be suspended or demoted. JMS says why, instead of silently failing.</p></div>') + '</div>',
        caption: "The matrix has deliberate guard rails. The cells that would break administration are locked, and the app explains the reason.",
        tip: "Freedom to change policy, without the ability to accidentally lock everyone out."
      }
    ]
  };

  /* ============================== W9 ============================== */
  stories.w9 = {
    title: "Appearance",
    sub: "Comfortable screens for every user.",
    scenes: [
      {
        label: "Open the Aa panel", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page" style="position:relative"><div class="m-head"><div><div class="m-eyebrow">Today · Operations</div><h1 class="m-title">Operations dashboard</h1><p class="m-intro">What is happening today, and what needs a decision.</p></div><span class="mock-aa" id="aim-aa">Aa</span></div>' +
          '<div class="m-grid m-grid-4">' + stat("Today", "7", "jobs on site", "accent") + stat("Next 7 days", "18", "£42,600 quoted") + stat("On hold", "2", "needs attention", "warn") + stat("Needs invoicing", "4", "completed, no invoice", "info") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Next on the plan</h3><p>Planned jobs from today forward.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · Tue 09:00", side: "Dan Walker" }) + '</div>') +
          '<div class="m-aa" id="aim-panel"><h4>Appearance</h4><div class="seg"><span>System</span><span class="on">Light</span><span>Dark</span></div><label>Reading size</label><div class="slider"></div><label>Interface size</label><div class="slider s2"></div><label>Colour</label><div class="swatches"><span style="background:#d97757"></span><span style="background:#245c8a"></span><span style="background:#216e4e"></span><span style="background:#7b3f86"></span></div><div class="aa-foot">' + mBtn("Save", "m-btn-primary") + mBtn("Reset", "m-btn-quiet") + '</div></div></div>',
        aim: "#aim-aa", click: true,
        pops: [{ sel: "#aim-panel", at: 900 }],
        caption: "The Aa button opens the same appearance panel used by the JMS guides. It floats above the app and closes with Escape.",
        tip: "Every user can make the screen comfortable without asking for a special version."
      },
      {
        label: "Dark mode", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page" style="position:relative;background:#1b1a18;color:#f2ece1;padding:14px;border-radius:12px;margin:-6px"><div class="m-head"><div><div class="m-eyebrow" style="color:#e18a69">Today · Operations</div><h1 class="m-title" style="color:#f2ece1">Operations dashboard</h1><p class="m-intro" style="color:#c3bcae">What is happening today, and what needs a decision.</p></div><span class="mock-aa" style="background:#262420;border-color:#34312b;color:#f2ece1">Aa</span></div>' +
          '<div class="m-grid m-grid-4"><div class="m-stat" style="background:#262420;border-color:#34312b"><span class="m-stat-label" style="color:#a29a8b">Today</span><strong style="color:#f2ece1">7</strong><span class="m-stat-note" style="color:#c3bcae">jobs on site</span></div>' +
          '<div class="m-stat" style="background:#262420;border-color:#34312b"><span class="m-stat-label" style="color:#a29a8b">Next 7 days</span><strong style="color:#f2ece1">18</strong><span class="m-stat-note" style="color:#c3bcae">£42,600 quoted</span></div>' +
          '<div class="m-stat" style="background:#262420;border-color:#34312b"><span class="m-stat-label" style="color:#a29a8b">On hold</span><strong style="color:#f2ece1">2</strong><span class="m-stat-note" style="color:#c3bcae">needs attention</span></div>' +
          '<div class="m-stat" style="background:#262420;border-color:#34312b"><span class="m-stat-label" style="color:#a29a8b">Needs invoicing</span><strong style="color:#f2ece1">4</strong><span class="m-stat-note" style="color:#c3bcae">completed, no invoice</span></div></div>' +
          '<div class="m-panel" style="background:#262420;border-color:#34312b"><div class="m-panel-head"><div><h3 style="color:#f2ece1">Next on the plan</h3><p style="color:#c3bcae">Planned jobs from today forward.</p></div></div><div class="m-row" style="background:#201f1c;border-color:#2b2823"><div class="m-row-main"><div class="m-row-title"><span class="m-ref" style="color:#f0b49a">JOB-2026-0042</span>' + P("SCHEDULED") + '</div><strong style="color:#f2ece1">Replace casement windows</strong><span class="m-row-sub" style="color:#c3bcae">Meadow House Ltd · Tue 09:00</span></div></div></div>' +
          '<div class="m-notice" style="background:#3a3020;border-color:#8a5a00;color:#f0c46a"><strong style="color:#f0c46a">Dark mode for dim offices and early starts</strong><p style="color:#f0c46a">The palette, sidebar and content switch together.</p></div></div>',
        caption: "System, Light and Dark switch the whole app together. The same design tokens drive the sidebar, the tables and the print view.",
        tip: "Night shifts, dark offices and bright vans are all comfortable — from one token set."
      },
      {
        label: "Bigger type", url: "jms.acme.example/#/dashboard", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page" style="font-size:16.5px"><div class="m-head"><div><div class="m-eyebrow">Today · Operations</div><h1 class="m-title" style="font-size:28px">Operations dashboard</h1><p class="m-intro" style="font-size:14px">Bigger text, wider line spacing and a narrower reading column.</p></div><span class="mock-aa">Aa</span></div>' +
          '<div class="m-grid m-grid-2">' + stat("Today", "7", "jobs on site", "accent") + stat("Needs invoicing", "4", "completed, no invoice", "info") + '</div>' +
          panel('<div class="m-panel-head"><div><h3 style="font-size:18px">Next on the plan</h3><p style="font-size:12.5px">Planned jobs from today forward.</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · Tue 09:00 · Dan Walker", side: "Open →" }) + '</div>') +
          '<div class="m-notice m-notice-info"><strong>Your settings follow you</strong><p>Saved on your user record, not in this browser. Sign in on the office PC or the van phone and it looks the same.</p></div></div>',
        caption: "Type size, line height and reading width are sliders. Changes preview live, so the user sees the result before saving.",
        tip: "A 55-year-old installer in sunlight and an office manager at midnight can both read comfortably."
      },
      {
        label: "Saved to the user", url: "jms.acme.example/#/account/appearance", role: "MANAGER", active: "Appearance",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Account</div><h1 class="m-title">Appearance</h1><p class="m-intro">Comfortable reading for the office, the van and everything between.</p></div></div>' +
          '<div class="m-toast" id="aim-saved"><span>✓</span><div><strong>Saved for Morgan Lee</strong><span>Dark mode · 24px reading text · narrow column. It will follow you to any device.</span></div></div>' +
          panel('<div class="m-panel-head"><div><h3>Your preferences</h3><p>Only design tokens change.</p></div></div><div class="m-grid m-grid-2">' +
            '<div><span class="m-label">Mode</span><div class="m-small">Dark</div></div><div><span class="m-label">Reading size</span><div class="m-small">24px</div></div>' +
            '<div><span class="m-label">Interface size</span><div class="m-small">20px</div></div><div><span class="m-label">Sidebar</span><div class="m-small">280px</div></div></div>' +
            '<div class="m-notice m-notice-info"><strong>Content and permissions never change</strong><p>Appearance changes the look only. The same jobs, rules and data are underneath.</p></div>') + '</div>',
        aim: "#aim-saved",
        pops: [{ sel: "#aim-saved", at: 700 }],
        caption: "Saving stores the preference on the user. The next sign-in on any device uses the same look without redoing the setup.",
        tip: "No per-device fiddling and no separate stylesheet for the “big text” version."
      },
      {
        label: "Company default", url: "jms.acme.example/#/admin/settings", role: "ADMIN", active: "Company settings",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Admin</div><h1 class="m-title">Company settings</h1><p class="m-intro">Company identity, invoicing defaults and the theme everyone starts with.</p></div></div>' +
          panel('<div class="m-panel-head"><div><h3>Default appearance</h3><p>Used for anyone who has never customised their own.</p></div></div><div class="m-seg" style="display:flex;gap:5px;margin-bottom:9px"><span class="m-badge">System</span><span class="m-badge">Light</span><span class="m-badge m-badge-ok">Dark</span></div>' +
            '<div class="m-notice m-notice-info"><strong>A sensible starting point</strong><p>New users inherit the company default. Existing users keep their own choice.</p></div>' +
            '<div class="m-grid m-grid-3">' + stat("Company default", "Dark", "new users start here") + stat("Personal overrides", "12", "staff with a saved look") + stat("Stylesheets", "1", "one design system") + '</div>' +
            '<div class="m-btn-row">' + mBtn("Save settings", "m-btn-primary") + '</div>') + '</div>',
        caption: "Admins set the company default once. New users start comfortable, and anyone can still adjust their own view.",
        tip: "A single design system to maintain, with personal comfort on top."
      }
    ]
  };

  /* ============================== W10 ============================== */
  stories.w10 = {
    title: "Find and plan",
    sub: "Search, timeline, workload and money.",
    scenes: [
      {
        label: "Global search", url: "jms.acme.example/#/search?q=M20", role: "MANAGER", active: "Operations dashboard",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Find anything</div><h1 class="m-title">Global search</h1><p class="m-intro">Job reference, customer name, postcode, engineer or invoice number.</p></div></div>' +
          '<div class="m-search-hero" id="aim-search"><span>🔎</span><span id="f-search">M20</span><span class="m-kbd">Enter</span></div>' +
          panel('<div class="m-panel-head"><div><h3>Jobs</h3><p>2 matches</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · M20 2AB · Dan Walker" }) +
            jobRow({ ref: "JOB-2026-0031", title: "Repair failed sealed unit", status: "PAID", sub: "Meadow House Ltd · M20 2AB · Sam Okafor" }) + '</div>') +
          panel('<div class="m-panel-head"><div><h3>Customers</h3><p>1 match</p></div></div><div class="m-row"><div class="m-row-main"><strong>Meadow House Ltd</strong><span class="m-row-sub">Elaine Foster · 12 Meadow Lane · M20 2AB</span></div><span class="m-badge m-badge-ok">Open</span></div>') + '</div>',
        aim: "#aim-search", click: true,
        types: [{ sel: "#f-search", text: "M20", at: 400, per: 260 }],
        caption: "One box searches everything the role is allowed to see. Results are grouped so the right record is one click away.",
        tip: "The average lookup drops from “which system was that in?” to a couple of seconds."
      },
      {
        label: "Open the record", url: "jms.acme.example/#/jobs/JOB-2026-0042", role: "MANAGER", active: "All jobs",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Job detail</div><h1 class="m-title">JOB-2026-0042</h1><p class="m-intro">Replace casement windows · Meadow House Ltd</p></div>' + P("SCHEDULED") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Job details</h3><p>Window installation · Normal priority</p></div></div><div class="m-grid m-grid-2">' +
            '<div><span class="m-label">Customer</span><div class="m-small">Meadow House Ltd<br>Elaine Foster · 0161 555 0101</div></div>' +
            '<div><span class="m-label">Site</span><div class="m-small">12 Meadow Lane, Didsbury<br>M20 2AB</div></div>' +
            '<div><span class="m-label">Planned</span><div class="m-small">Tue 17 Mar · 09:00–12:00</div></div>' +
            '<div><span class="m-label">Engineers</span><div class="m-small">Dan Walker · Lead<br>Sam Okafor</div></div></div>') +
          '<div class="m-notice m-notice-info"><strong>From search to action in one click</strong><p>The record opens with its status, schedule, team and invoice link in one place.</p></div></div>',
        caption: "Search results are real records, not a report. Opening one shows the same job page the office uses every day.",
        tip: "No exporting a search to a spreadsheet and then looking the job up again."
      },
      {
        label: "Timeline", url: "jms.acme.example/#/insights/timeline", role: "MANAGER", active: "Timeline",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Insights</div><h1 class="m-title">Timeline</h1><p class="m-intro">Who is where, when — planned jobs by day.</p></div><span class="m-badge">Next 7 days</span></div>' +
          '<div class="m-grid m-grid-2"><div>' + panel('<div class="m-panel-head"><div><h3>Tue 17 Mar</h3><p>3 jobs</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0042", title: "Replace casement windows", status: "SCHEDULED", sub: "Meadow House Ltd · Dan, Sam" }) +
            jobRow({ ref: "JOB-2026-0045", title: "Repair failed unit", status: "SCHEDULED", sub: "Willow Court · Luis" }) + '</div>') + '</div>' +
          '<div>' + panel('<div class="m-panel-head"><div><h3>Wed 18 Mar</h3><p>2 jobs</p></div></div><div class="m-list">' +
            jobRow({ ref: "JOB-2026-0046", title: "Fit French doors", status: "SCHEDULED", sub: "Brookside School · Hannah" }) +
            jobRow({ ref: "JOB-2026-0047", title: "Site survey", status: "SCHEDULED", sub: "Orchard Barn · Tom" }) + '</div>') + '</div></div>' +
          '<div class="m-notice m-notice-warn"><strong>Thursday looks light</strong><p>Two engineers are free. A good day to pull forward a waiting job or book a survey.</p></div></div>',
        caption: "The timeline turns the schedule into a week you can read at a glance, filtered by engineer and status.",
        tip: "Gaps and clashes are visible before they cost a day, which is where the real money is saved."
      },
      {
        label: "Workload", url: "jms.acme.example/#/insights/workload", role: "MANAGER", active: "Workload",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Insights</div><h1 class="m-title">Workload</h1><p class="m-intro">Jobs per engineer for the chosen week.</p></div></div>' +
          panel('<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Engineer</th><th>Jobs</th><th>Days on site</th><th>Planned work</th></tr></thead><tbody>' +
            '<tr><td><strong>Dan Walker</strong><br><span class="m-small m-muted">Engineer</span></td><td class="m-title" style="font-size:16px">4</td><td>3</td><td class="m-small">Tue JOB-0042<br>Wed JOB-0048<br>Thu JOB-0051</td></tr>' +
            '<tr><td><strong>Sam Okafor</strong><br><span class="m-small m-muted">Engineer</span></td><td class="m-title" style="font-size:16px">3</td><td>2</td><td class="m-small">Tue JOB-0042<br>Wed JOB-0049</td></tr>' +
            '<tr><td><strong>Luis García</strong><br><span class="m-small m-muted">Engineer</span></td><td class="m-title" style="font-size:16px">1</td><td>1</td><td class="m-small">Tue JOB-0045</td></tr>' +
            '<tr><td><strong>Hannah Brooks</strong><br><span class="m-small m-muted">Engineer</span></td><td class="m-title" style="font-size:16px">2</td><td>2</td><td class="m-small">Wed JOB-0046<br>Fri JOB-0053</td></tr></tbody></table></div>') +
          '<div class="m-notice m-notice-info"><strong>Balance the week before it starts</strong><p>Move a job from an overloaded engineer to a free one while there is still time.</p></div></div>',
        caption: "Workload shows who is carrying the week. The office can rebalance before the phone starts ringing on Monday.",
        tip: "Less overtime, fewer stressed engineers and fewer jobs that slip to next week."
      },
      {
        label: "Financials", url: "jms.acme.example/#/insights/financials", role: "MANAGER", active: "Financials",
        html: '<div class="m-page"><div class="m-head"><div><div class="m-eyebrow">Insights · Money</div><h1 class="m-title">Financials</h1><p class="m-intro">Quoted, invoiced and paid work, with outstanding invoices.</p></div><span class="m-badge">Last 90 days</span></div>' +
          '<div class="m-grid m-grid-4">' + stat("Quoted", "£128k", "jobs created") + stat("Invoiced", "£96k", "net issued") + stat("Paid", "£81k", "net settled", "accent") + stat("Outstanding", "£15k", "issued, not paid", "warn") + '</div>' +
          panel('<div class="m-panel-head"><div><h3>Invoice activity</h3><p>Issued and paid in the selected range.</p></div></div><div class="m-table-wrap"><table class="m-table"><thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Issued</th><th>Paid</th><th class="m-right">Gross</th></tr></thead><tbody>' +
            '<tr><td class="m-ref">INV-2026-0119</td><td>Meadow House Ltd</td><td>' + P("ISSUED") + '</td><td>17 Mar</td><td>—</td><td class="m-right m-mono">£3,240</td></tr>' +
            '<tr><td class="m-ref">INV-2026-0118</td><td>Northgate Dental</td><td>' + P("PAID") + '</td><td>15 Mar</td><td>17 Mar</td><td class="m-right m-mono">£2,880</td></tr>' +
            '<tr><td class="m-ref">INV-2026-0117</td><td>Brookside School</td><td>' + P("ISSUED") + '</td><td>14 Mar</td><td>—</td><td class="m-right m-mono">£5,400</td></tr></tbody></table></div>') +
          '<div class="m-notice m-notice-ok"><strong>The owner’s view, without a spreadsheet</strong><p>Quoted, invoiced, paid and outstanding — filtered by date and always current.</p></div></div>',
        caption: "Because jobs and invoices are one record, quoted, invoiced and paid work can be seen together without exporting anything.",
        tip: "Chasing money becomes a routine part of the week, not a month-end surprise."
      }
    ]
  };

  window.JMS_DEMO = { workflows: workflows, stories: stories };
})();
