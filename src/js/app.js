/* JMS Demo Lite — router, views and interactions.
   Plain browser JavaScript. No build step, no framework, no network calls. */
(function () {
  "use strict";

  var J = window.JMS;
  var app = document.getElementById("app");
  var modalRoot = document.getElementById("modal-root");
  var toastRoot = document.getElementById("toast-region");
  var currentFilters = {};

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qs(name) {
    var hash = location.hash || "";
    var q = hash.indexOf("?") >= 0 ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(q).get(name) || "";
  }
  function routeParts() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var path = h.split("?")[0];
    return path.split("/").filter(Boolean);
  }
  function go(path, replace) {
    if (replace) location.replace("#" + path); else location.hash = path;
  }
  function landing(user) {
    if (!user) return "/signin";
    return user.role_key === "ADMIN" || user.role_key === "MANAGER" ? "/dashboard" : "/my-jobs";
  }
  function todayISO() { return J.isoDay(new Date()); }
  function localInput(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fromLocalInput(value) { return value ? new Date(value).toISOString() : null; }
  function initials(name) {
    return String(name || "?").split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
  }
  function statusPill(status) {
    return '<span class="status-pill ' + J.statusClass(status) + '">' + esc(J.statusLabel(status)) + "</span>";
  }
  function priorityBadge(p) {
    return p === "URGENT" ? '<span class="badge badge-urgent">Urgent</span>' : '<span class="badge">Normal</span>';
  }
  function roleLabel(key) {
    var r = J.all("roles").find(function (x) { return x.key === key; });
    return r ? r.label : key;
  }
  function workLabel(key) {
    return ({ WINDOW_INSTALL: "Window install", REPAIR: "Repair", SURVEY: "Survey" })[key] || key;
  }
  function emptyState(title, message, action) {
    return '<div class="empty-state"><div class="empty-mark">○</div><h3>' + esc(title) + "</h3><p>" + esc(message) + "</p>" + (action || "") + "</div>";
  }
  function toast(message, type) {
    var node = document.createElement("div");
    node.className = "toast toast-" + (type || "success");
    node.innerHTML = '<span class="toast-dot"></span><span>' + esc(message) + "</span>";
    toastRoot.appendChild(node);
    setTimeout(function () { node.classList.add("is-out"); }, 3800);
    setTimeout(function () { node.remove(); }, 4300);
  }
  function field(label, name, opts) {
    opts = opts || {};
    var required = opts.required ? ' required' : "";
    var help = opts.help ? '<span class="field-help">' + esc(opts.help) + "</span>" : "";
    return '<label class="field"><span class="field-label">' + esc(label) + (opts.required ? ' <span class="req">required</span>' : "") + "</span>" +
      '<input class="input" type="' + (opts.type || "text") + '" name="' + esc(name) + '" value="' + esc(opts.value == null ? "" : opts.value) + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + required + (opts.step ? ' step="' + opts.step + '"' : "") + ">" + help + "</label>";
  }
  function textarea(label, name, value, help) {
    return '<label class="field"><span class="field-label">' + esc(label) + "</span><textarea class=\"input textarea\" name=\"" + esc(name) + '" rows="4">' + esc(value || "") + "</textarea>" + (help ? '<span class="field-help">' + esc(help) + "</span>" : "") + "</label>";
  }
  function selectField(label, name, options, value, help) {
    return '<label class="field"><span class="field-label">' + esc(label) + '</span><select class="input" name="' + esc(name) + '">' +
      options.map(function (o) {
        var v = typeof o === "string" ? o : o.value;
        var l = typeof o === "string" ? o : o.label;
        return '<option value="' + esc(v) + '"' + (String(v) === String(value == null ? "" : value) ? " selected" : "") + ">" + esc(l) + "</option>";
      }).join("") + "</select>" + (help ? '<span class="field-help">' + esc(help) + "</span>" : "") + "</label>";
  }

  /* ------------------------------------------------------------------ */
  /* theme                                                               */
  /* ------------------------------------------------------------------ */
  var FONT_CHOICES = {
    serif: [
      ['"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', "Iowan / Palatino"],
      ['Georgia, "Times New Roman", serif', "Georgia"],
      ['Charter, "Bitstream Charter", "Sitka Text", serif', "Charter"],
      ["serif", "System serif"]
    ],
    sans: [
      ['-apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif', "System sans"],
      ['"Segoe UI", Tahoma, Verdana, sans-serif', "Segoe UI"],
      ['Verdana, Geneva, sans-serif', "Verdana"],
      ['"Trebuchet MS", Helvetica, sans-serif', "Trebuchet"]
    ],
    mono: [
      ['"Cascadia Mono", Consolas, ui-monospace, monospace', "Cascadia / Consolas"],
      ['"Courier New", Courier, monospace', "Courier"],
      ['ui-monospace, "SF Mono", Menlo, monospace', "System mono"]
    ]
  };
  function defaultTheme() {
    return {
      mode: "system", fs_content: 20, fs_ui: 18, lh_content: 1.55, sidebar: 300,
      font_serif: FONT_CHOICES.serif[0][0], font_sans: FONT_CHOICES.sans[0][0], font_mono: FONT_CHOICES.mono[0][0],
      colors: {}
    };
  }
  function currentTheme() {
    var company = J.company() || {};
    var base = Object.assign(defaultTheme(), company.default_theme || {});
    var saved = J.savedTheme();
    return Object.assign(base, saved || {});
  }
  function resolvedMode(mode) {
    return mode === "system" ? (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  }
  function applyTheme(t) {
    t = Object.assign(defaultTheme(), t || {});
    var mode = resolvedMode(t.mode);
    document.documentElement.setAttribute("data-theme", mode);
    var r = document.documentElement.style;
    r.setProperty("--fs-content", Number(t.fs_content || 20) + "px");
    r.setProperty("--fs-ui", Number(t.fs_ui || 18) + "px");
    r.setProperty("--lh-content", String(t.lh_content || 1.55));
    r.setProperty("--sidebar", Number(t.sidebar || 300) + "px");
    r.setProperty("--font-serif", t.font_serif || defaultTheme().font_serif);
    r.setProperty("--font-sans", t.font_sans || defaultTheme().font_sans);
    r.setProperty("--font-mono", t.font_mono || defaultTheme().font_mono);
    var colors = (t.colors && t.colors[mode]) || {};
    ["paper", "surface", "ivory", "ink", "muted", "line", "terra", "accent-strong"].forEach(function (key) {
      r.removeProperty("--" + key);
      if (colors[key]) r.setProperty("--" + key, colors[key]);
    });
  }
  function themeFromPanel() {
    var form = document.getElementById("aa-form");
    if (!form) return currentTheme();
    var t = currentTheme();
    t.mode = form.elements.mode.value;
    t.fs_content = Number(form.elements.fs_content.value);
    t.fs_ui = Number(form.elements.fs_ui.value);
    t.lh_content = Number(form.elements.lh_content.value);
    t.sidebar = Number(form.elements.sidebar.value);
    t.font_serif = form.elements.font_serif.value;
    t.font_sans = form.elements.font_sans.value;
    t.font_mono = form.elements.font_mono.value;
    t.colors = t.colors || {};
    ["light", "dark"].forEach(function (mode) {
      t.colors[mode] = t.colors[mode] || {};
      ["paper", "ink", "terra"].forEach(function (key) {
        var input = form.elements[mode + "_" + key];
        if (input && input.value) t.colors[mode][key] = input.value;
      });
    });
    return t;
  }
  function aaPanel() {
    var t = currentTheme();
    var color = function (mode, key) {
      var c = (t.colors && t.colors[mode]) || {};
      var fallback = mode === "light"
        ? ({ paper: "#f0eee6", ink: "#1f1e1d", terra: "#d97757" })[key]
        : ({ paper: "#1b1a18", ink: "#f2ece1", terra: "#e18a69" })[key];
      return c[key] || fallback;
    };
    var fontOptions = function (kind, selected) {
      var list = FONT_CHOICES[kind].slice();
      if (!list.some(function (f) { return f[0] === selected; })) list.push([selected, "Custom"]);
      return list.map(function (f) { return '<option value="' + esc(f[0]) + '"' + (f[0] === selected ? " selected" : "") + ">" + esc(f[1]) + "</option>"; }).join("");
    };
    return '<div class="aa-backdrop" data-action="aa-close"></div>' +
      '<aside class="aa-panel" aria-label="Appearance settings">' +
      '<div class="aa-head"><div><strong>Appearance</strong><span class="aa-sub">Changes preview live</span></div><button class="icon-btn" data-action="aa-close" aria-label="Close appearance panel">×</button></div>' +
      '<form id="aa-form">' +
      '<div class="aa-group"><span class="aa-label">Colour mode</span><div class="segmented">' +
      ["system", "light", "dark"].map(function (m) { return '<label><input type="radio" name="mode" value="' + m + '"' + (t.mode === m ? " checked" : "") + "><span>" + m[0].toUpperCase() + m.slice(1) + "</span></label>"; }).join("") +
      "</div></div>" +
      '<div class="aa-group"><span class="aa-label">Type</span>' +
      '<label class="aa-row"><span>Reading size <em id="aa-fs-content-val">' + t.fs_content + "px</em></span><input type=\"range\" name=\"fs_content\" min=\"18\" max=\"32\" step=\"1\" value=\"" + t.fs_content + '"></label>' +
      '<label class="aa-row"><span>Interface size <em id="aa-fs-ui-val">' + t.fs_ui + "px</em></span><input type=\"range\" name=\"fs_ui\" min=\"16\" max=\"26\" step=\"0.5\" value=\"" + t.fs_ui + '"></label>' +
      '<label class="aa-row"><span>Line height <em id="aa-lh-val">' + t.lh_content + "</em></span><input type=\"range\" name=\"lh_content\" min=\"1.3\" max=\"2\" step=\"0.05\" value=\"" + t.lh_content + '"></label>' +
      '<label class="aa-row"><span>Sidebar width <em id="aa-sidebar-val">' + t.sidebar + "px</em></span><input type=\"range\" name=\"sidebar\" min=\"240\" max=\"420\" step=\"10\" value=\"" + t.sidebar + '"></label></div>' +
      '<div class="aa-group"><span class="aa-label">Fonts</span>' +
      '<label class="field compact"><span class="field-label">Headings</span><select class="input" name="font_serif">' + fontOptions("serif", t.font_serif) + "</select></label>" +
      '<label class="field compact"><span class="field-label">Interface</span><select class="input" name="font_sans">' + fontOptions("sans", t.font_sans) + "</select></label>" +
      '<label class="field compact"><span class="field-label">References</span><select class="input" name="font_mono">' + fontOptions("mono", t.font_mono) + "</select></label></div>" +
      '<div class="aa-group"><span class="aa-label">Key colours</span><div class="aa-colours">' +
      ["light", "dark"].map(function (mode) {
        return '<div class="aa-colour-col"><span>' + mode[0].toUpperCase() + mode.slice(1) + "</span>" +
          ["paper", "ink", "terra"].map(function (key) {
            return '<label class="colour-row"><span>' + key + '</span><input type="color" name="' + mode + "_" + key + '" value="' + esc(color(mode, key)) + '"></label>';
          }).join("") + "</div>";
      }).join("") + "</div></div>" +
      '<div class="aa-actions"><button type="button" class="btn btn-primary" data-action="aa-save">Save appearance</button>' +
      '<button type="button" class="btn btn-quiet" data-action="aa-reset">Reset</button>' +
      '<button type="button" class="btn btn-quiet" data-action="aa-copy">Copy theme</button></div>' +
      '<p class="aa-note">Saved to your user record in this browser. Only design tokens change — never permissions or content.</p>' +
      "</form></aside>";
  }
  function ensureThemePanel() {
    var existing = document.getElementById("aa-root");
    if (existing) return;
    var root = document.createElement("div");
    root.id = "aa-root";
    root.className = "aa-root";
    root.innerHTML = aaPanel();
    document.body.appendChild(root);
    root.addEventListener("input", function (e) {
      if (e.target.closest("#aa-form")) {
        applyTheme(themeFromPanel());
        var f = document.getElementById("aa-form");
        var set = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = v; };
        set("aa-fs-content-val", f.elements.fs_content.value + "px");
        set("aa-fs-ui-val", f.elements.fs_ui.value + "px");
        set("aa-lh-val", f.elements.lh_content.value);
        set("aa-sidebar-val", f.elements.sidebar.value + "px");
      }
    });
  }
  function openAA() {
    ensureThemePanel();
    var root = document.getElementById("aa-root");
    root.innerHTML = aaPanel();
    root.classList.add("is-open");
    root.querySelector("#aa-form").addEventListener("input", function () {
      applyTheme(themeFromPanel());
    });
  }
  function closeAA() {
    var root = document.getElementById("aa-root");
    if (root) root.classList.remove("is-open");
  }

  /* ------------------------------------------------------------------ */
  /* shell                                                               */
  /* ------------------------------------------------------------------ */
  function navGroups(user) {
    var groups = [];
    if (J.can(user, "insight.operational")) {
      groups.push({ label: "Overview", items: [["Operations dashboard", "#/dashboard", "insight.operational"]] });
    }
    var work = [];
    if ((J.isFieldCapable(user) && J.can(user, "job.view.assigned")) || user.role_key === "CUSTOMER") work.push(["My jobs", "#/my-jobs", null]);
    if (J.can(user, "job.view.all")) work.push(["All jobs", "#/jobs", "job.view.all"]);
    if (J.can(user, "job.create")) work.push(["New job", "#/jobs/new", "job.create"]);
    if (work.length) groups.push({ label: user.role_key === "CUSTOMER" ? "My work" : "Work", items: work });

    var people = [];
    if (J.can(user, "customer.view.all")) people.push(["Customers", "#/customers", "customer.view.all"]);
    if (J.can(user, "customer.create")) people.push(["New customer", "#/customers/new", "customer.create"]);
    if (people.length) groups.push({ label: "People", items: people });

    var money = [];
    if (J.can(user, "invoice.view.all")) money.push(["Invoices", "#/invoices", "invoice.view.all"]);
    if (J.can(user, "invoice.create")) money.push(["Needs invoicing", "#/insights/needs-invoicing", "invoice.create"]);
    if (user.role_key === "CUSTOMER") money.push(["My invoices", "#/portal/invoices", "invoice.view.own"]);
    if (money.length) groups.push({ label: "Money", items: money });

    var insight = [];
    if (J.can(user, "insight.timeline")) insight.push(["Timeline", "#/insights/timeline", "insight.timeline"]);
    if (J.can(user, "insight.workload")) insight.push(["Workload", "#/insights/workload", "insight.workload"]);
    if (J.can(user, "insight.financial")) insight.push(["Financials", "#/insights/financials", "insight.financial"]);
    if (insight.length) groups.push({ label: "Insights", items: insight });

    var admin = [];
    if (J.can(user, "user.view")) admin.push(["Users", "#/admin/users", "user.view"]);
    if (J.can(user, "admin.roles.manage")) admin.push(["Roles & permissions", "#/admin/roles", "admin.roles.manage"]);
    if (J.can(user, "admin.settings.manage")) admin.push(["Company settings", "#/admin/settings", "admin.settings.manage"]);
    if (J.can(user, "admin.audit.view")) admin.push(["Audit log", "#/admin/audit", "admin.audit.view"]);
    if (J.can(user, "job.archive")) admin.push(["Archive", "#/admin/archive", "job.archive"]);
    if (admin.length) groups.push({ label: "Admin", items: admin });

    groups.push({ label: "Account", items: [["Appearance", "#/account/appearance", null]] });
    return groups;
  }

  function shell(user, page) {
    var groups = navGroups(user);
    var path = "#/" + routeParts().join("/");
    var sidebar = groups.map(function (g) {
      return '<div class="toc-group"><div class="toc-label">' + esc(g.label) + "</div>" +
        g.items.map(function (i) {
          var active = path === i[1] || (i[1] !== "#/" && path.indexOf(i[1]) === 0);
          return '<a class="toc-pill' + (active ? " is-active" : "") + '" href="' + i[1] + '"' + (active ? ' aria-current="page"' : "") + ">" + esc(i[0]) + "</a>";
        }).join("") + "</div>";
    }).join("");
    var body = '<div class="app-shell">' +
      '<header class="topbar">' +
      '<button class="menu-btn" data-action="toggle-menu" aria-label="Open navigation" aria-expanded="false">☰</button>' +
      '<a class="brand" href="#' + landing(user) + '"><span class="brand-mark small">J</span><span class="brand-text">JMS<em>Acme Windows</em></span></a>' +
      '<form class="global-search" data-form="search" role="search"><input class="input" name="q" type="search" placeholder="Search jobs, customers, invoices…" value="' + esc(qs("q")) + '" aria-label="Search JMS"><button class="btn btn-quiet search-btn" type="submit">Search</button></form>' +
      '<div class="top-actions">' +
      '<button class="aa-btn" data-action="aa-open" aria-label="Appearance settings" title="Appearance">Aa</button>' +
      '<div class="user-chip" title="' + esc(user.display_name) + ' · ' + esc(roleLabel(user.role_key)) + '"><span class="avatar">' + esc(initials(user.display_name)) + "</span><span class=\"user-name\">" + esc(user.display_name) + "<em>" + esc(roleLabel(user.role_key)) + "</em></span></div>" +
      '<form data-form="signout" class="signout-form"><button class="btn btn-quiet small-btn" type="submit">Sign out</button></form>' +
      "</div></header>" +
      '<div class="body-grid"><aside class="toc" id="toc"><div class="toc-inner">' + sidebar + "</div></aside>" +
      '<main id="main" class="main" tabindex="-1">' +
      '<div class="breadcrumb">' + (page.breadcrumb || "") + "</div>" +
      '<div class="page-head"><div><div class="eyebrow">' + esc(page.eyebrow || "Acme Windows · JMS") + "</div><h1" + (page.titleClass ? ' class="' + page.titleClass + '"' : "") + ">" + esc(page.title) + "</h1>" +
      (page.intro ? '<p class="page-intro">' + esc(page.intro) + "</p>" : "") + "</div>" +
      (page.actions ? '<div class="page-actions">' + page.actions + "</div>" : "") + "</div>" +
      (page.body || "") + "</main></div></div>";
    app.innerHTML = body;
    ensureThemePanel();
    if (page.after) page.after();
  }

  /* ------------------------------------------------------------------ */
  /* auth                                                                */
  /* ------------------------------------------------------------------ */
  function renderSignin() {
    var demo = [
      ["Admin", "Alex Morgan", "admin@acme.example"],
      ["Manager", "Morgan Lee", "manager@acme.example"],
      ["Engineer", "Dan Walker", "engineer1@acme.example"],
      ["Customer", "Elaine Foster", "customer1@example.com"]
    ];
    app.innerHTML = '<main class="auth-page">' +
      '<section class="auth-card">' +
      '<div class="auth-brand"><span class="brand-mark">J</span><div><div class="eyebrow">Acme Windows</div><h1>Job Management System</h1></div></div>' +
      '<p class="auth-lead">One place for customers, jobs, engineers and invoices. Sign in to see the demo as each role.</p>' +
      '<form data-form="signin" class="auth-form" novalidate>' +
      field("Email address", "email", { type: "email", required: true, placeholder: "you@acme.example" }) +
      field("Password", "password", { type: "password", required: true, placeholder: "JMS123" }) +
      '<button class="btn btn-primary btn-block" type="submit">Sign in</button>' +
      '<p class="auth-note">Demo password for every account: <code>JMS123</code></p>' +
      "</form></section>" +
      '<section class="demo-card"><div class="eyebrow">Try the demo</div><h2>One-click sign in</h2><p>Each role sees a different app. You can switch at any time.</p>' +
      '<div class="demo-list">' + demo.map(function (d) {
        return '<button class="demo-login" data-action="demo-login" data-email="' + d[2] + '"><span class="avatar">' + initials(d[1]) + '</span><span><strong>' + d[0] + "</strong><em>" + esc(d[1]) + " · " + esc(d[2]) + "</em></span><span class=\"arrow\">→</span></button>";
      }).join("") + "</div>" +
      '<div class="auth-foot"><strong>Demo notes</strong><p>Data is stored in this browser only. Reset it from Company settings. PDFs are produced through your browser\'s Print → Save as PDF dialog.</p></div>' +
      "</section></main>";
  }

  /* ------------------------------------------------------------------ */
  /* dashboard                                                           */
  /* ------------------------------------------------------------------ */
  function statCard(label, value, note, tone) {
    return '<div class="stat-card' + (tone ? " tone-" + tone : "") + '"><span class="stat-label">' + esc(label) + "</span><strong>" + esc(value) + "</strong><span class=\"stat-note\">" + esc(note || "") + "</span></div>";
  }
  function renderDashboard(user) {
    var jobs = J.visibleJobs(user);
    var today = jobs.filter(function (j) { return J.isToday(j.planned_start) && ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].indexOf(j.status) >= 0; });
    var week = jobs.filter(function (j) { return J.isThisWeek(j.planned_start) && ["SCHEDULED", "IN_PROGRESS"].indexOf(j.status) >= 0; });
    var holds = jobs.filter(function (j) { return j.status === "ON_HOLD"; });
    var needs = jobs.filter(function (j) { return j.status === "COMPLETED" && !J.liveInvoiceForJob(j.id); });
    var upcoming = jobs.filter(function (j) { return j.planned_start && new Date(j.planned_start) >= J.startOfDay() && ["SCHEDULED", "IN_PROGRESS"].indexOf(j.status) >= 0; })
      .sort(function (a, b) { return a.planned_start.localeCompare(b.planned_start); }).slice(0, 8);
    var recent = jobs.filter(function (j) { return ["COMPLETED", "INVOICED", "PAID"].indexOf(j.status) >= 0; })
      .sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); }).slice(0, 6);
    var totalWeek = week.reduce(function (s, j) { return s + (j.price_net || 0); }, 0);
    var body = '<div class="stats-grid">' +
      statCard("Today", today.length, "jobs on site today", "accent") +
      statCard("Next 7 days", week.length, J.fmtMoney(totalWeek) + " quoted", "") +
      statCard("On hold", holds.length, holds.length ? "needs attention" : "nothing blocked", holds.length ? "warn" : "") +
      statCard("Needs invoicing", needs.length, "completed, no invoice", needs.length ? "info" : "") +
      "</div>" +
      '<div class="split-grid"><section class="panel"><div class="panel-head"><div><h2>Next on the plan</h2><p>Planned jobs from today forward.</p></div><a class="btn btn-quiet" href="#/insights/timeline">Open timeline</a></div>' +
      (upcoming.length ? '<div class="stack-list">' + upcoming.map(jobRowCard).join("") + "</div>" : emptyState("No upcoming jobs", "Scheduled jobs will appear here once dates are set.")) +
      "</section>" +
      '<section class="panel"><div class="panel-head"><div><h2>Exceptions</h2><p>Jobs that may need a manager.</p></div></div>' +
      ((holds.length + needs.length) ? '<div class="stack-list">' + holds.concat(needs).slice(0, 6).map(jobRowCard).join("") + "</div>" : emptyState("All clear", "No jobs are on hold and nothing is waiting for an invoice.")) +
      "</section></div>" +
      '<section class="panel"><div class="panel-head"><div><h2>Recently completed</h2><p>The latest field updates.</p></div><a class="btn btn-quiet" href="#/jobs">All jobs</a></div>' +
      (recent.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
        recent.map(function (j) {
          return '<tr><td><a class="ref" href="#/jobs/' + j.id + '">' + esc(j.reference) + "</a></td><td>" + esc(j.title) + "</td><td>" + esc(J.customerName(j.customer_id)) + "</td><td>" + statusPill(j.status) + "</td><td>" + esc(J.fmtDateShort(j.updated_at)) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : emptyState("No completed jobs yet", "Completed jobs will appear here.")) + "</section>";
    shell(user, {
      title: "Operations dashboard", eyebrow: "Today · " + J.fmtDate(new Date()),
      intro: "What is happening today, what is coming next, and what needs a decision.",
      actions: '<a class="btn btn-primary" href="#/jobs/new">New job</a><a class="btn btn-quiet" href="#/jobs?status=SCHEDULED">View scheduled jobs</a>',
      body: body
    });
  }

  function jobRowCard(j) {
    var engineers = J.assignedUsers(j.id).map(function (u) { return u.display_name; }).join(", ") || "Unassigned";
    return '<a class="job-card" href="#/jobs/' + j.id + '"><div class="job-card-main"><div class="job-card-title"><span class="ref">' + esc(j.reference) + "</span>" + statusPill(j.status) + "</div><strong>" + esc(j.title) + "</strong><span class=\"job-card-sub\">" + esc(J.customerName(j.customer_id)) + " · " + esc(J.fmtRange(j.planned_start, j.planned_end)) + "</span></div><div class=\"job-card-side\"><span class=\"mini-label\">Engineers</span><span>" + esc(engineers) + "</span><span class=\"arrow\">→</span></div></a>";
  }

  /* ------------------------------------------------------------------ */
  /* my jobs                                                             */
  /* ------------------------------------------------------------------ */
  function renderMyJobs(user) {
    var jobs = user.role_key === "CUSTOMER" ? J.jobsForCustomer(user.customer_id) : J.jobsForFieldUser(user);
    var active = jobs.filter(function (j) { return ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].indexOf(j.status) >= 0; });
    var today = active.filter(function (j) { return J.isToday(j.planned_start); });
    var next = active.filter(function (j) { return !J.isToday(j.planned_start) && j.planned_start && new Date(j.planned_start) >= J.startOfDay(); });
    var done = jobs.filter(function (j) { return ["COMPLETED", "INVOICED", "PAID", "CANCELLED", "DRAFT"].indexOf(j.status) >= 0; });
    var cards = function (list, emptyTitle, emptyMsg) {
      return list.length ? '<div class="stack-list">' + list.map(jobRowCard).join("") + "</div>" : emptyState(emptyTitle, emptyMsg);
    };
    var body = '<div class="stats-grid compact-stats">' +
      statCard("Today", today.length, "jobs to visit", "accent") +
      statCard("Active", active.length, "scheduled or in progress") +
      statCard("Next", next.length, "coming up") +
      statCard("History", done.length, "completed or closed") +
      "</div>" +
      '<section class="panel"><div class="panel-head"><div><h2>Today</h2><p>Your work for today, in plan order.</p></div></div>' + cards(today, "Nothing booked today", "Your scheduled jobs for today will appear here.") + "</section>" +
      '<section class="panel"><div class="panel-head"><div><h2>Coming up</h2><p>Future scheduled jobs.</p></div></div>' + cards(next, "No future jobs", "New assignments will appear here immediately.") + "</section>" +
      '<section class="panel"><div class="panel-head"><div><h2>History</h2><p>Completed, invoiced and closed jobs.</p></div></div>' + cards(done, "No history yet", "Completed jobs remain visible for 90 days.") + "</section>";
    shell(user, {
      title: "My jobs", eyebrow: user.role_key === "CUSTOMER" ? "Customer portal" : "Field work",
      intro: user.role_key === "CUSTOMER" ? "Your installations, dates and updates — only your jobs are shown." : "Only jobs assigned to you. Open a job to update its status from site.",
      body: body
    });
  }

  /* ------------------------------------------------------------------ */
  /* jobs                                                                */
  /* ------------------------------------------------------------------ */
  function renderJobs(user) {
    if (!J.can(user, "job.view.all")) return renderForbidden(user);
    var q = qs("q").toLowerCase();
    var status = qs("status");
    var engineer = qs("engineer");
    var customerId = qs("customer");
    var jobs = J.all("jobs").filter(function (j) { return !j.archived_at; });
    if (q) jobs = jobs.filter(function (j) {
      return [j.reference, j.title, J.customerName(j.customer_id), j.site_address.postcode].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    if (status) jobs = jobs.filter(function (j) { return j.status === status; });
    if (engineer) jobs = jobs.filter(function (j) { return J.activeAssignments(j.id).some(function (a) { return a.user_id === engineer; }); });
    if (customerId) jobs = jobs.filter(function (j) { return j.customer_id === customerId; });
    jobs.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
    var statuses = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "INVOICED", "PAID", "CANCELLED"].map(function (s) { return { value: s, label: J.statusLabel(s) }; });
    var engineers = J.fieldUsers().map(function (u) { return { value: u.id, label: u.display_name }; });
    var customers = J.all("customers").filter(function (c) { return c.status === "ACTIVE"; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) { return { value: c.id, label: c.name }; });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="job-filters">' +
      '<label class="field compact"><span class="field-label">Search</span><input class="input" name="q" value="' + esc(qs("q")) + '" placeholder="Reference, title, postcode"></label>' +
      selectField("Status", "status", [{ value: "", label: "All statuses" }].concat(statuses), status) +
      selectField("Engineer", "engineer", [{ value: "", label: "All engineers" }].concat(engineers), engineer) +
      selectField("Customer", "customer", [{ value: "", label: "All customers" }].concat(customers), customerId) +
      '<button class="btn btn-primary" type="submit">Apply filters</button><a class="btn btn-quiet" href="#/jobs">Clear</a></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>' + jobs.length + " job" + (jobs.length === 1 ? "" : "s") + "</h2><p>Newest updates first. Open a job for its timeline and actions.</p></div><a class=\"btn btn-primary\" href=\"#/jobs/new\">New job</a></div>" +
      (jobs.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Status</th><th>Planned</th><th>Engineers</th><th>Priority</th></tr></thead><tbody>' +
        jobs.map(function (j) {
          var engineers = J.assignedUsers(j.id).map(function (u) { return u.display_name; }).join(", ") || "Unassigned";
          return '<tr><td><a class="ref" href="#/jobs/' + j.id + '">' + esc(j.reference) + "</a></td><td><strong>" + esc(j.title) + "</strong><br><span class=\"muted small\">" + esc(workLabel(j.work_type)) + "</span></td><td>" + esc(J.customerName(j.customer_id)) + "</td><td>" + statusPill(j.status) + "</td><td class=\"nowrap\">" + esc(J.fmtRange(j.planned_start, j.planned_end)) + "</td><td>" + esc(engineers) + "</td><td>" + priorityBadge(j.priority) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : emptyState("No jobs match", "Try clearing the filters, or create a new job.", '<a class="btn btn-primary" href="#/jobs/new">New job</a>')) + "</section>";
    shell(user, { title: "Jobs", eyebrow: "Work", intro: "Every job, across every customer, with its status and planned dates.", actions: '<a class="btn btn-primary" href="#/jobs/new">New job</a>', body: body });
  }

  function renderJobDetail(user, id) {
    var job = J.getJob(id);
    if (!job || (job.archived_at && !J.can(user, "job.archive"))) return renderNotFound(user, "Job");
    if (!J.visibleJob(user, job)) return renderNotFound(user, "Job");
    var customer = J.getCustomer(job.customer_id);
    var customerView = user.role_key === "CUSTOMER";
    var canEdit = J.can(user, "job.edit");
    var canAssign = J.can(user, "job.assign");
    var canSchedule = J.can(user, "job.schedule");
    var canOverride = J.can(user, "job.status.override");
    var assigned = J.assignedUsers(job.id);
    var lead = J.activeAssignments(job.id).filter(function (a) { return a.is_lead; }).map(function (a) { return J.getUser(a.user_id); })[0];
    var invoice = J.liveInvoiceForJob(job.id);
    var events = J.all("job_events").filter(function (e) { return e.job_id === job.id && (!customerView || e.visibility === "CUSTOMER"); })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var options = J.transitionOptions(user, job);
    var statusButtons = options.map(function (o) {
      return '<button class="btn ' + (o.status === "CANCELLED" ? "btn-danger" : o.status === "COMPLETED" ? "btn-primary" : "btn-primary") + '" data-action="job-status" data-job="' + job.id + '" data-status="' + o.status + '">' + esc(o.label) + "</button>";
    }).join("");
    var actions = [];
    if (canEdit) actions.push('<a class="btn btn-quiet" href="#/jobs/' + job.id + '/edit">Edit job</a>');
    if (canAssign) actions.push('<a class="btn btn-quiet" href="#/jobs/' + job.id + '/assign">Assign engineers</a>');
    if (canSchedule) actions.push('<a class="btn btn-quiet" href="#/jobs/' + job.id + '/schedule">Set dates</a>');
    if (J.can(user, "document.job.pdf")) actions.push('<button class="btn btn-quiet" data-action="print-job" data-job="' + job.id + '">Print / Save PDF</button>');
    if (!customerView && J.can(user, "invoice.create") && ["COMPLETED", "INVOICED"].indexOf(job.status) >= 0) {
      actions.push(invoice ? '<a class="btn btn-quiet" href="#/invoices/' + invoice.id + '">Open invoice</a>' : '<a class="btn btn-primary" href="#/invoices/new?job=' + job.id + '">Create invoice</a>');
    }
    var details = '<section class="panel"><div class="panel-head"><div><h2>Job details</h2><p>' + esc(workLabel(job.work_type)) + " · " + esc(job.priority === "URGENT" ? "Urgent" : "Normal priority") + "</p></div>" + statusPill(job.status) + "</div>" +
      '<dl class="detail-grid">' +
      "<div><dt>Customer</dt><dd>" + (J.visibleCustomer(user, customer) && !customerView ? '<a href="#/customers/' + customer.id + '">' + esc(customer.name) + "</a>" : esc(customer.name)) + "</dd></div>" +
      "<div><dt>Site</dt><dd>" + esc([job.site_address.line1, job.site_address.line2, job.site_address.town, job.site_address.postcode].filter(Boolean).join(", ")) + "</dd></div>" +
      "<div><dt>Planned</dt><dd>" + esc(J.fmtRange(job.planned_start, job.planned_end)) + " · " + esc(job.planned_slot.replace("_", " ")) + "</dd></div>" +
      "<div><dt>Actual</dt><dd>" + esc(J.fmtRange(job.actual_start, job.actual_end)) + "</dd></div>" +
      "<div><dt>Engineers</dt><dd>" + (assigned.length ? assigned.map(function (u) { return esc(u.display_name) + (lead && lead.id === u.id ? ' <span class="badge">Lead</span>' : ""); }).join("<br>") : "Unassigned") + "</dd></div>" +
      (!customerView ? "<div><dt>Contact</dt><dd>" + esc(customer.contact_name) + "<br>" + esc(customer.phone) + "</dd></div>" : "") +
      (!customerView && (canEdit || user.role_key === "ENGINEER") ? "<div><dt>Price</dt><dd>" + (J.can(user, "job.edit") ? esc(J.fmtMoney(job.price_net)) + ' <span class="muted">net</span><br><span class="muted small">' + esc(J.fmtMoney(job.price_gross)) + " gross</span>" : '<span class="muted">Not shown for your role</span>') + "</dd></div>" : "") +
      "</dl>" +
      '<div class="prose-block"><h3>Description</h3><p>' + esc(job.description) + "</p></div>" +
      (customerView && job.customer_notes ? '<div class="notice notice-info"><strong>Update for you</strong><p>' + esc(job.customer_notes) + "</p></div>" : "") +
      (!customerView && job.internal_notes ? '<div class="notice notice-warn"><strong>Internal notes (staff only)</strong><p>' + esc(job.internal_notes) + "</p></div>" : "") +
      "</section>";
    var statusPanel = !customerView ? '<section class="panel status-panel"><div class="panel-head"><div><h2>Update status</h2><p>Only transitions your role can make are shown.</p></div>' + statusPill(job.status) + "</div>" +
      (options.length ? '<div class="button-row">' + statusButtons + "</div>" : '<p class="muted">No status changes are available to you. A manager can move this job.</p>') +
      (J.can(user, "job.note.add") ? '<form class="inline-form" data-form="job-note" data-job="' + job.id + '"><label class="field"><span class="field-label">Add a timeline note</span><textarea class="input textarea" name="note" rows="2" placeholder="What changed? Keep customer-visible notes plain and helpful."></textarea></label>' +
        selectField("Visible to", "visibility", [{ value: "INTERNAL", label: "Staff only" }, { value: "CUSTOMER", label: "Customer can see this" }], "INTERNAL") +
        '<button class="btn btn-quiet" type="submit">Add note</button></form>' : "") + "</section>" : "";
    var timeline = '<section class="panel"><div class="panel-head"><div><h2>Timeline</h2><p>' + (customerView ? "Updates written for you." : "Every status, assignment and note.") + "</p></div></div>" +
      (events.length ? '<ol class="timeline">' + events.map(function (e) {
        var actor = J.getUser(e.actor_user_id);
        return '<li><span class="timeline-dot"></span><div><div class="timeline-head"><strong>' + esc(e.message || e.type) + "</strong><span class=\"muted small\">" + esc(J.fmtDateTime(e.at)) + "</span></div>" +
          '<span class="timeline-meta">' + esc(e.type.replace(/_/g, " ").toLowerCase()) + (actor ? " · " + esc(actor.display_name) : "") + (e.visibility === "CUSTOMER" && !customerView ? ' · <span class="badge badge-customer">Customer visible</span>' : "") + "</span></div></li>";
      }).join("") + "</ol>" : emptyState("No updates yet", "Status changes and notes will appear here.")) + "</section>";
    var adminActions = "";
    if (J.can(user, "job.archive") || J.can(user, "job.cancel")) {
      adminActions = '<section class="panel danger-zone"><div class="panel-head"><div><h2>Job administration</h2><p>Archive keeps the record and its history.</p></div></div><div class="button-row">' +
        (job.status !== "CANCELLED" && J.can(user, "job.cancel") ? '<button class="btn btn-danger-quiet" data-action="cancel-job" data-job="' + job.id + '">Cancel job</button>' : "") +
        (J.can(user, "job.archive") ? '<button class="btn btn-danger-quiet" data-action="archive-job" data-job="' + job.id + '">Archive job</button>' : "") +
        "</div></section>";
    }
    var body = '<div class="detail-layout"><div class="detail-main">' + details + statusPanel + timeline + adminActions + "</div>" +
      '<aside class="detail-side">' +
      '<section class="panel compact-panel"><h3>At a glance</h3><dl class="mini-details"><div><dt>Status</dt><dd>' + statusPill(job.status) + "</dd></div><div><dt>Planned start</dt><dd>" + esc(J.fmtDate(job.planned_start)) + "</dd></div><div><dt>Planned end</dt><dd>" + esc(J.fmtDate(job.planned_end)) + "</dd></div><div><dt>Lead</dt><dd>" + esc(lead ? lead.display_name : "—") + "</dd></div><div><dt>Invoice</dt><dd>" + (invoice ? '<a href="#/invoices/' + invoice.id + '">' + esc(invoice.number) + "</a>" : "—") + "</dd></div></dl></section>" +
      '<section class="panel compact-panel"><h3>Documents</h3><p class="muted small">Generated from live data.</p><button class="btn btn-quiet btn-block" data-action="print-job" data-job="' + job.id + '">Job sheet PDF</button>' +
      (invoice ? '<a class="btn btn-quiet btn-block" href="#/invoices/' + invoice.id + '">Invoice ' + esc(invoice.number) + "</a>" : "") + "</section>" +
      "</aside></div>";
    shell(user, {
      title: job.reference, titleClass: "ref-title", eyebrow: customerView ? "Customer portal · Job" : "Job detail", intro: job.title,
      breadcrumb: '<a href="#/jobs">Jobs</a> <span>/</span> ' + esc(job.reference),
      actions: '<span class="status-inline">' + statusPill(job.status) + "</span>" + actions.join(""),
      body: body
    });
  }

  function renderJobForm(user, id, presetCustomer) {
    if (!J.can(user, "job.create") && !J.can(user, "job.edit")) return renderForbidden(user);
    var job = id ? J.getJob(id) : null;
    if (id && !job) return renderNotFound(user, "Job");
    var customerId = job ? job.customer_id : (presetCustomer || "");
    var customers = J.all("customers").filter(function (c) { return c.status === "ACTIVE"; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var c = customers.find(function (x) { return x.id === customerId; }) || customers[0] || {};
    var site = job ? job.site_address : (c.address || {});
    var body = '<section class="panel form-panel"><form data-form="job" data-job="' + (job ? job.id : "") + '" class="single-form">' +
      '<label class="field"><span class="field-label">Customer</span><select class="input" name="customer_id">' +
      customers.map(function (x) { return '<option value="' + x.id + '"' + (x.id === (customerId || c.id) ? " selected" : "") + ">" + esc(x.name) + " · " + esc(x.contact_name) + "</option>"; }).join("") + "</select></label>" +
      field("Job title", "title", { required: true, value: job ? job.title : "", placeholder: "e.g. Replace casement windows" }) +
      '<div class="form-row">' +
      selectField("Work type", "work_type", [{ value: "WINDOW_INSTALL", label: "Window install" }, { value: "REPAIR", label: "Repair" }, { value: "SURVEY", label: "Survey" }], job ? job.work_type : "WINDOW_INSTALL") +
      selectField("Priority", "priority", [{ value: "NORMAL", label: "Normal" }, { value: "URGENT", label: "Urgent" }], job ? job.priority : "NORMAL") +
      "</div>" +
      textarea("Job description", "description", job ? job.description : "", "Plain text. It will appear on the job sheet without internal notes.") +
      '<fieldset class="form-section"><legend>Site address</legend><p class="muted small">Defaults to the customer address. Change it if the work is at another site.</p>' +
      field("Address line 1", "site_line1", { value: site.line1 || "" }) +
      field("Address line 2", "site_line2", { value: site.line2 || "" }) +
      '<div class="form-row">' + field("Town", "site_town", { value: site.town || "" }) + field("Postcode", "site_postcode", { value: site.postcode || "" }) + "</div></fieldset>" +
      (J.isManagerial(user) ? '<fieldset class="form-section"><legend>Commercial</legend><div class="form-row">' +
        field("Price net (£)", "price_net", { type: "number", step: "0.01", value: job && job.price_net != null ? (job.price_net / 100).toFixed(2) : "", help: "Manager-only. VAT is added from company settings." }) +
        selectField("Planned slot", "planned_slot", [{ value: "ALL_DAY", label: "All day" }, { value: "AM", label: "Morning" }, { value: "PM", label: "Afternoon" }], job ? job.planned_slot : "ALL_DAY") + "</div></fieldset>" : "") +
      textarea("Customer-visible notes", "customer_notes", job ? job.customer_notes : "", "The customer will see this on their portal.") +
      (J.isManagerial(user) ? textarea("Internal notes", "internal_notes", job ? job.internal_notes : "", "Staff only. Never shown to customers.") : "") +
      '<div class="button-row"><button class="btn btn-primary" type="submit">' + (job ? "Save job" : "Create draft job") + "</button>" +
      '<a class="btn btn-quiet" href="' + (job ? "#/jobs/" + job.id : "#/jobs") + '">Cancel</a></div>' +
      "</form></section>";
    shell(user, {
      title: job ? "Edit job" : "New job", eyebrow: job ? job.reference : "Work",
      intro: job ? "Update the job details. Planned dates are set on the schedule screen." : "Create a draft job first, then assign engineers and set the dates.",
      body: body,
      after: function () {
        var form = app.querySelector('[data-form="job"]');
        var select = form && form.elements.customer_id;
        if (!select || job) return;
        select.addEventListener("change", function () {
          var cust = J.getCustomer(select.value);
          if (!cust) return;
          form.elements.site_line1.value = cust.address.line1;
          form.elements.site_line2.value = cust.address.line2 || "";
          form.elements.site_town.value = cust.address.town;
          form.elements.site_postcode.value = cust.address.postcode;
        });
      }
    });
  }

  function renderAssign(user, id) {
    if (!J.can(user, "job.assign")) return renderForbidden(user);
    var job = J.getJob(id);
    if (!job) return renderNotFound(user, "Job");
    var active = J.activeAssignments(job.id);
    var activeIds = active.map(function (a) { return a.user_id; });
    var leadId = (active.find(function (a) { return a.is_lead; }) || {}).user_id;
    var users = J.fieldUsers();
    var body = '<section class="panel"><div class="panel-head"><div><h2>Assign engineers</h2><p>Only active field-capable users can be assigned. Choose exactly one lead.</p></div>' + statusPill(job.status) + "</div>" +
      '<form data-form="assign" data-job="' + job.id + '" class="single-form">' +
      '<div class="assign-grid">' + users.map(function (u) {
        var checked = activeIds.indexOf(u.id) >= 0;
        return '<div class="assign-card"><label class="check-line"><input type="checkbox" name="user" value="' + u.id + '"' + (checked ? " checked" : "") + "><span><strong>" + esc(u.display_name) + "</strong><em>" + esc(roleLabel(u.role_key)) + (u.can_engineer ? " · field-capable" : "") + "</em></span></label>" +
          '<label class="radio-line"><input type="radio" name="lead" value="' + u.id + '"' + (leadId === u.id ? " checked" : "") + "> Lead</label></div>";
      }).join("") + "</div>" +
      (job.status === "DRAFT" ? '<label class="check-line block-check"><input type="checkbox" name="promote" value="yes" checked><span>Move this job to <strong>Scheduled</strong> when dates and an engineer are set.</span></label>' : "") +
      '<div class="button-row"><button class="btn btn-primary" type="submit">Save assignments</button><a class="btn btn-quiet" href="#/jobs/' + job.id + '">Cancel</a></div></form></section>';
    shell(user, {
      title: "Assign engineers", eyebrow: job.reference, intro: job.title,
      breadcrumb: '<a href="#/jobs">Jobs</a> <span>/</span> <a href="#/jobs/' + job.id + '">' + esc(job.reference) + "</a> <span>/</span> Assign",
      body: body
    });
  }

  function renderSchedule(user, id) {
    if (!J.can(user, "job.schedule")) return renderForbidden(user);
    var job = J.getJob(id);
    if (!job) return renderNotFound(user, "Job");
    var body = '<section class="panel"><div class="panel-head"><div><h2>Plan the work</h2><p>Dates use the company timezone (Europe/London).</p></div>' + statusPill(job.status) + "</div>" +
      '<form data-form="schedule" data-job="' + job.id + '" class="single-form">' +
      '<div class="form-row">' +
      '<label class="field"><span class="field-label">Planned start</span><input class="input" type="datetime-local" name="planned_start" value="' + esc(localInput(job.planned_start)) + '" required></label>' +
      '<label class="field"><span class="field-label">Planned end</span><input class="input" type="datetime-local" name="planned_end" value="' + esc(localInput(job.planned_end)) + '" required></label></div>' +
      selectField("Slot", "planned_slot", [{ value: "ALL_DAY", label: "All day" }, { value: "AM", label: "Morning (AM)" }, { value: "PM", label: "Afternoon (PM)" }], job.planned_slot) +
      (job.status === "DRAFT" ? '<label class="check-line block-check"><input type="checkbox" name="promote" value="yes" checked><span>Move this job to <strong>Scheduled</strong> once dates and at least one engineer are set.</span></label>' : "") +
      '<div class="notice notice-info"><strong>Booking conflict check</strong><p>If an assigned engineer already has an overlapping job, JMS will warn you after saving. Conflicts are advisory in v1 and do not block the save.</p></div>' +
      '<div class="button-row"><button class="btn btn-primary" type="submit">Save dates</button><a class="btn btn-quiet" href="#/jobs/' + job.id + '">Cancel</a></div></form></section>';
    shell(user, {
      title: "Set dates", eyebrow: job.reference, intro: job.title,
      breadcrumb: '<a href="#/jobs">Jobs</a> <span>/</span> <a href="#/jobs/' + job.id + '">' + esc(job.reference) + "</a> <span>/</span> Dates",
      body: body
    });
  }

  /* ------------------------------------------------------------------ */
  /* customers                                                           */
  /* ------------------------------------------------------------------ */
  function renderCustomers(user) {
    if (!J.can(user, "customer.view.all")) return renderForbidden(user);
    var q = qs("q").toLowerCase();
    var status = qs("status") || "ACTIVE";
    var list = J.all("customers").filter(function (c) { return status === "ALL" || c.status === status; });
    if (q) list = list.filter(function (c) { return [c.name, c.contact_name, c.email, c.phone, c.address.postcode].join(" ").toLowerCase().indexOf(q) >= 0; });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="customer-filters">' +
      '<label class="field compact"><span class="field-label">Search</span><input class="input" name="q" value="' + esc(qs("q")) + '" placeholder="Name, contact, postcode"></label>' +
      selectField("Status", "status", [{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }, { value: "ALL", label: "All" }], status) +
      '<button class="btn btn-primary" type="submit">Apply</button><a class="btn btn-quiet" href="#/customers">Clear</a></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>' + list.length + " customer" + (list.length === 1 ? "" : "s") + "</h2><p>Each customer can have a portal login and any number of jobs.</p></div><a class=\"btn btn-primary\" href=\"#/customers/new\">New customer</a></div>" +
      (list.length ? '<div class="customer-grid">' + list.map(function (c) {
        var jobs = J.jobsForCustomer(c.id);
        var active = jobs.filter(function (j) { return ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].indexOf(j.status) >= 0; }).length;
        return '<a class="customer-card" href="#/customers/' + c.id + '"><div class="customer-card-head"><span class="avatar">' + initials(c.name) + "</span><span class=\"badge " + (c.status === "ARCHIVED" ? "badge-muted" : "badge-ok") + '">' + esc(c.status) + "</span></div><strong>" + esc(c.name) + "</strong><span class=\"muted\">" + esc(c.contact_name) + "</span><span class=\"small muted\">" + esc(c.address.town) + " · " + esc(c.address.postcode) + "</span><span class=\"customer-card-foot\">" + jobs.length + " job" + (jobs.length === 1 ? "" : "s") + " · " + active + " active</span></a>";
      }).join("") + "</div>" : emptyState("No customers match", "Try a different search or create a customer.", '<a class="btn btn-primary" href="#/customers/new">New customer</a>')) + "</section>";
    shell(user, { title: "Customers", eyebrow: "People", intro: "Customer records, contact details and the jobs attached to them.", actions: '<a class="btn btn-primary" href="#/customers/new">New customer</a>', body: body });
  }

  function renderCustomerDetail(user, id) {
    var c = J.getCustomer(id);
    if (!c) return renderNotFound(user, "Customer");
    if (!J.visibleCustomer(user, c)) return renderNotFound(user, "Customer");
    var jobs = J.jobsForCustomer(c.id);
    var login = J.findOne("users", function (u) { return u.role_key === "CUSTOMER" && u.customer_id === c.id; });
    var canEdit = J.can(user, "customer.edit");
    var actions = (canEdit ? '<a class="btn btn-quiet" href="#/customers/' + c.id + '/edit">Edit customer</a>' : "") +
      (J.can(user, "job.create") ? '<a class="btn btn-primary" href="#/jobs/new?customer=' + c.id + '">New job</a>' : "") +
      (J.can(user, "customer.invite") ? '<button class="btn btn-quiet" data-action="invite-login" data-customer="' + c.id + '">' + (login ? "Reset portal password" : "Create portal login") + "</button>" : "") +
      (J.can(user, "customer.archive") && c.status !== "ARCHIVED" ? '<button class="btn btn-danger-quiet" data-action="archive-customer" data-customer="' + c.id + '">Archive</button>' : "");
    var body = '<div class="detail-layout"><div class="detail-main">' +
      '<section class="panel"><div class="panel-head"><div><h2>Contact</h2><p>' + esc(c.contact_name) + " · " + esc(c.status) + "</p></div>" + (login ? '<span class="badge badge-ok">Portal login active</span>' : '<span class="badge badge-muted">No portal login</span>') + "</div>" +
      '<dl class="detail-grid"><div><dt>Email</dt><dd><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></dd></div><div><dt>Phone</dt><dd>' + esc(c.phone) + "</dd></div>" +
      "<div><dt>Address</dt><dd>" + esc([c.address.line1, c.address.line2, c.address.town, c.address.postcode].filter(Boolean).join(", ")) + "</dd></div>" +
      "<div><dt>Customer since</dt><dd>" + esc(J.fmtDate(c.created_at)) + "</dd></div></dl>" +
      (c.notes ? '<div class="notice notice-warn"><strong>Internal notes</strong><p>' + esc(c.notes) + "</p></div>" : "") + "</section>" +
      '<section class="panel"><div class="panel-head"><div><h2>Jobs</h2><p>' + jobs.length + " job" + (jobs.length === 1 ? "" : "s") + " for this customer.</p></div>" + (J.can(user, "job.create") ? '<a class="btn btn-primary" href="#/jobs/new?customer=' + c.id + '">New job</a>' : "") + "</div>" +
      (jobs.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Job</th><th>Status</th><th>Planned</th><th>Engineers</th></tr></thead><tbody>' + jobs.map(function (j) {
        return '<tr><td><a class="ref" href="#/jobs/' + j.id + '">' + esc(j.reference) + "</a></td><td>" + esc(j.title) + "</td><td>" + statusPill(j.status) + "</td><td>" + esc(J.fmtRange(j.planned_start, j.planned_end)) + "</td><td>" + esc(J.assignedUsers(j.id).map(function (u) { return u.display_name; }).join(", ") || "Unassigned") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : emptyState("No jobs yet", "Create the first job for this customer.", J.can(user, "job.create") ? '<a class="btn btn-primary" href="#/jobs/new?customer=' + c.id + '">New job</a>' : "")) + "</section></div>" +
      '<aside class="detail-side"><section class="panel compact-panel"><h3>Portal login</h3>' +
      (login ? '<dl class="mini-details"><div><dt>Email</dt><dd>' + esc(login.email) + '</dd></div><div><dt>Status</dt><dd>' + esc(login.status) + '</dd></div><div><dt>Last signed in</dt><dd>' + esc(login.last_login_at ? J.fmtDate(login.last_login_at) : "Never") + '</dd></div><div><dt>Default password</dt><dd><code>JMS123</code></dd></div></dl>' : '<p class="muted">This customer cannot sign in yet.</p>') +
      "</section><section class=\"panel compact-panel\"><h3>Address</h3><p>" + esc(c.address.line1) + (c.address.line2 ? "<br>" + esc(c.address.line2) : "") + "<br>" + esc(c.address.town) + "<br>" + esc(c.address.postcode) + "</p></section></aside></div>";
    shell(user, { title: c.name, eyebrow: "Customer", intro: c.contact_name, breadcrumb: '<a href="#/customers">Customers</a> <span>/</span> ' + esc(c.name), actions: actions, body: body });
  }

  function renderCustomerForm(user, id) {
    if (id ? !J.can(user, "customer.edit") : !J.can(user, "customer.create")) return renderForbidden(user);
    var c = id ? J.getCustomer(id) : null;
    if (id && !c) return renderNotFound(user, "Customer");
    var a = c ? c.address : {};
    var body = '<section class="panel form-panel"><form data-form="customer" data-customer="' + (c ? c.id : "") + '" class="single-form">' +
      field("Customer name", "name", { required: true, value: c ? c.name : "", placeholder: "e.g. Meadow House Ltd" }) +
      field("Main contact", "contact_name", { required: true, value: c ? c.contact_name : "" }) +
      field("Email address", "email", { type: "email", required: true, value: c ? c.email : "" }) +
      field("Phone", "phone", { required: true, value: c ? c.phone : "" }) +
      '<fieldset class="form-section"><legend>Address</legend>' + field("Address line 1", "line1", { required: true, value: a.line1 || "" }) + field("Address line 2", "line2", { value: a.line2 || "" }) +
      '<div class="form-row">' + field("Town", "town", { required: true, value: a.town || "" }) + field("Postcode", "postcode", { required: true, value: a.postcode || "" }) + "</div></fieldset>" +
      textarea("Internal notes", "notes", c ? c.notes : "", "Staff only — access details, key safe, parking.") +
      (!c ? '<label class="check-line block-check"><input type="checkbox" name="make_login" value="yes" checked><span>Create a customer portal login with this email and the default password <code>JMS123</code>.</span></label>' : "") +
      '<div class="button-row"><button class="btn btn-primary" type="submit">' + (c ? "Save customer" : "Create customer") + "</button><a class=\"btn btn-quiet\" href=\"" + (c ? "#/customers/" + c.id : "#/customers") + '">Cancel</a></div></form></section>';
    shell(user, { title: c ? "Edit customer" : "New customer", eyebrow: "People", intro: c ? c.name : "Add the contact details and, if needed, a portal login.", body: body });
  }

  /* ------------------------------------------------------------------ */
  /* invoices                                                            */
  /* ------------------------------------------------------------------ */
  function invoiceRows(user, portal) {
    var list = J.all("invoices").slice();
    if (portal) {
      var cust = J.getCustomer(user.customer_id);
      list = list.filter(function (i) {
        var job = J.getJob(i.job_id);
        return job && job.customer_id === (cust && cust.id) && ["ISSUED", "PAID", "VOID"].indexOf(i.status) >= 0;
      });
    }
    return list.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  }
  function renderInvoices(user, portal) {
    if (portal ? !J.can(user, "invoice.view.own") : !J.can(user, "invoice.view.all")) return renderForbidden(user);
    var status = qs("status");
    var list = invoiceRows(user, portal);
    if (status) list = list.filter(function (i) { return i.status === status; });
    var totals = list.reduce(function (t, i) { t.net += i.net; t.vat += i.vat; t.gross += i.gross; return t; }, { net: 0, vat: 0, gross: 0 });
    var body = (portal ? "" : '<section class="panel filters-panel"><form class="filters" data-form="invoice-filters">' + selectField("Status", "status", [{ value: "", label: "All statuses" }, { value: "DRAFT", label: "Draft" }, { value: "ISSUED", label: "Issued" }, { value: "PAID", label: "Paid" }, { value: "VOID", label: "Void" }], status) + '<button class="btn btn-primary" type="submit">Apply</button><a class="btn btn-quiet" href="#/invoices">Clear</a></form></section>') +
      '<div class="stats-grid compact-stats"><div class="stat-card"><span class="stat-label">Net</span><strong>' + J.fmtMoney(totals.net) + '</strong><span class="stat-note">' + list.length + " invoice" + (list.length === 1 ? "" : "s") + '</span></div><div class="stat-card"><span class="stat-label">VAT</span><strong>' + J.fmtMoney(totals.vat) + '</strong><span class="stat-note">20% configured rate</span></div><div class="stat-card tone-accent"><span class="stat-label">Gross</span><strong>' + J.fmtMoney(totals.gross) + '</strong><span class="stat-note">total value</span></div></div>' +
      '<section class="panel"><div class="panel-head"><div><h2>Invoices</h2><p>' + (portal ? "Your issued and paid invoices." : "Draft, issued, paid and void invoices.") + "</p></div>" + (!portal && J.can(user, "invoice.create") ? '<a class="btn btn-primary" href="#/invoices/new">New invoice</a>' : "") + "</div>" +
      (list.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Number</th><th>Job</th><th>Customer</th><th>Status</th><th>Issued</th><th class="right">Net</th><th class="right">Gross</th></tr></thead><tbody>' + list.map(function (i) {
        var job = J.getJob(i.job_id);
        return '<tr><td><a class="ref" href="#' + (portal ? "/portal/invoices/" : "/invoices/") + i.id + '">' + esc(i.number) + "</a></td><td>" + (job ? '<a href="#/jobs/' + job.id + '">' + esc(job.reference) + "</a>" : "—") + "</td><td>" + esc(job ? J.customerName(job.customer_id) : "—") + "</td><td>" + statusPill(i.status) + "</td><td>" + esc(J.fmtDateShort(i.issued_at)) + '</td><td class="right mono">' + J.fmtMoney(i.net) + '</td><td class="right mono">' + J.fmtMoney(i.gross) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : emptyState(portal ? "No invoices yet" : "No invoices match", portal ? "Invoices issued to you will appear here." : "Create an invoice from a completed job.", (!portal && J.can(user, "invoice.create")) ? '<a class="btn btn-primary" href="#/invoices/new">New invoice</a>' : "")) + "</section>";
    shell(user, { title: portal ? "My invoices" : "Invoices", eyebrow: portal ? "Customer portal" : "Money", intro: portal ? "Invoices Acme Windows has issued to you." : "Draft, issued and paid invoices with gapless numbering.", body: body });
  }

  function renderInvoiceNew(user) {
    if (!J.can(user, "invoice.create")) return renderForbidden(user);
    var preset = qs("job");
    var jobs = J.all("jobs").filter(function (j) {
      return !j.archived_at && j.status !== "CANCELLED" && !J.liveInvoiceForJob(j.id) && (j.status === "COMPLETED" || j.status === "INVOICED");
    });
    var selected = jobs.find(function (j) { return j.id === preset; }) || jobs[0];
    var body = '<section class="panel form-panel"><form data-form="invoice" class="single-form">' +
      '<label class="field"><span class="field-label">Job</span><select class="input" name="job_id">' +
      (jobs.length ? jobs.map(function (j) { return '<option value="' + j.id + '"' + (selected && selected.id === j.id ? " selected" : "") + ">" + esc(j.reference) + " · " + esc(j.title) + " · " + esc(J.customerName(j.customer_id)) + "</option>"; }).join("") : '<option value="">No completed jobs without an invoice</option>') +
      "</select></label>" +
      '<div class="notice notice-info"><strong>Invoice lines</strong><p>The first line is filled from the job price. Edit the description, quantity or unit price, or add another line.</p></div>' +
      '<div id="invoice-lines">' + invoiceLineRow(0, selected ? selected.title : "", selected && selected.price_net != null ? selected.price_net / 100 : "") + "</div>" +
      '<button class="btn btn-quiet" type="button" data-action="add-line">Add another line</button>' +
      '<div class="button-row"><button class="btn btn-primary" type="submit"' + (jobs.length ? "" : " disabled") + ">Save draft invoice</button><a class=\"btn btn-quiet\" href=\"#/invoices\">Cancel</a></div></form></section>" +
      (!jobs.length ? '<section class="panel">' + emptyState("No jobs need an invoice", "Complete a job first, or void its existing invoice before re-issuing.") + "</section>" : "");
    shell(user, {
      title: "New invoice", eyebrow: "Money", intro: "Create a draft from a completed job. You can review it before issuing.",
      body: body,
      after: function () {
        var form = app.querySelector('[data-form="invoice"]');
        if (!form) return;
        var select = form.elements.job_id;
        select.addEventListener("change", function () {
          var job = J.getJob(select.value);
          var first = form.querySelector(".invoice-line");
          if (job && first) {
            first.querySelector('[name="description"]').value = job.title;
            first.querySelector('[name="unit"]').value = job.price_net != null ? (job.price_net / 100).toFixed(2) : "";
          }
        });
      }
    });
  }
  function invoiceLineRow(i, desc, unit) {
    return '<div class="invoice-line"><label class="field"><span class="field-label">Description</span><input class="input" name="description" value="' + esc(desc || "") + '" required></label><div class="form-row three"><label class="field"><span class="field-label">Qty</span><input class="input" name="qty" type="number" min="0.001" step="0.001" value="1" required></label><label class="field"><span class="field-label">Unit (£)</span><input class="input" name="unit" type="number" min="0" step="0.01" value="' + esc(unit || "") + '" required></label><button class="btn btn-danger-quiet line-remove" type="button" data-action="remove-line" aria-label="Remove line">Remove</button></div></div>';
  }
  function renderInvoiceDetail(user, id, portal) {
    var inv = J.getInvoice(id);
    if (!inv) return renderNotFound(user, "Invoice");
    var job = J.getJob(inv.job_id);
    if (!job) return renderNotFound(user, "Invoice");
    if (portal) {
      if (user.role_key !== "CUSTOMER" || job.customer_id !== user.customer_id || ["ISSUED", "PAID", "VOID"].indexOf(inv.status) < 0) return renderNotFound(user, "Invoice");
    } else if (!J.can(user, "invoice.view.all")) return renderForbidden(user);
    var company = J.company();
    var customer = J.getCustomer(job.customer_id);
    var actions = '<button class="btn btn-quiet" data-action="print-invoice" data-invoice="' + inv.id + '">Print / Save PDF</button>';
    if (!portal && J.can(user, "invoice.issue")) {
      if (inv.status === "DRAFT") actions = '<button class="btn btn-primary" data-action="invoice-issue" data-invoice="' + inv.id + '">Issue invoice</button>' + actions;
      if (inv.status === "ISSUED") actions += '<button class="btn btn-primary" data-action="invoice-paid" data-invoice="' + inv.id + '">Mark paid</button><button class="btn btn-danger-quiet" data-action="invoice-void" data-invoice="' + inv.id + '">Void</button>';
    }
    var body = '<div class="invoice-paper" id="invoice-paper">' +
      '<div class="invoice-head"><div><span class="brand-mark small">J</span><strong>' + esc(company.name) + "</strong><p>" + esc([company.address.line1, company.address.line2, company.address.town, company.address.postcode].filter(Boolean).join(", ")) + "<br>" + esc(company.email) + " · " + esc(company.phone) + "<br>VAT " + esc(company.vat_number || "") + '</p></div><div class="invoice-title"><div class="eyebrow">Invoice</div><h2>' + esc(inv.number) + "</h2>" + statusPill(inv.status) + "</div></div>" +
      '<div class="invoice-parties"><div><span class="mini-label">Invoice to</span><strong>' + esc(customer.name) + "</strong><p>" + esc(customer.contact_name) + "<br>" + esc([customer.address.line1, customer.address.line2, customer.address.town, customer.address.postcode].filter(Boolean).join(", ")) + "<br>" + esc(customer.email) + "</p></div>" +
      '<div><span class="mini-label">Job</span><strong>' + esc(job.reference) + "</strong><p>" + esc(job.title) + "<br>Issued: " + esc(J.fmtDateShort(inv.issued_at)) + "<br>Due: " + esc(J.fmtDateShort(inv.due_at)) + (inv.paid_at ? "<br>Paid: " + esc(J.fmtDateShort(inv.paid_at)) : "") + "</p></div></div>" +
      '<table class="invoice-table"><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Amount</th></tr></thead><tbody>' +
      inv.lines.map(function (l) { return "<tr><td>" + esc(l.description) + '</td><td class="right">' + l.qty + '</td><td class="right mono">' + J.fmtMoney(l.unit_pence) + '</td><td class="right mono">' + J.fmtMoney(l.amount_pence) + "</td></tr>"; }).join("") +
      '</tbody></table><div class="invoice-totals"><div><span>Net</span><strong>' + J.fmtMoney(inv.net) + '</strong></div><div><span>VAT (' + (inv.vat_rate_bp / 100) + '%)</span><strong>' + J.fmtMoney(inv.vat) + '</strong></div><div class="grand"><span>Total</span><strong>' + J.fmtMoney(inv.gross) + "</strong></div></div>" +
      (inv.status === "VOID" ? '<div class="void-mark">VOID' + (inv.void_reason ? " · " + esc(inv.void_reason) : "") + "</div>" : "") +
      '<p class="invoice-foot">' + esc(inv.notes || "") + "<br>" + esc(company.pdf_footer || "") + "</p></div>" +
      '<section class="panel compact-panel"><h3>Invoice record</h3><dl class="mini-details"><div><dt>Job</dt><dd><a href="#/jobs/' + job.id + '">' + esc(job.reference) + "</a></dd></div><div><dt>Status</dt><dd>" + statusPill(inv.status) + "</dd></div><div><dt>Created</dt><dd>" + esc(J.fmtDate(inv.created_at)) + "</dd></div>" + (inv.void_reason ? "<div><dt>Void reason</dt><dd>" + esc(inv.void_reason) + "</dd></div>" : "") + "</dl></section>";
    shell(user, { title: inv.number, eyebrow: portal ? "Customer portal · Invoice" : "Invoice", intro: customer.name + " · " + job.reference, breadcrumb: '<a href="#' + (portal ? "/portal/invoices" : "/invoices") + '">Invoices</a> <span>/</span> ' + esc(inv.number), actions: actions, body: body });
  }

  /* ------------------------------------------------------------------ */
  /* insights                                                            */
  /* ------------------------------------------------------------------ */
  function renderTimeline(user) {
    if (!J.can(user, "insight.timeline")) return renderForbidden(user);
    var days = Number(qs("days") || 14);
    var engineer = qs("engineer");
    var from = J.startOfDay();
    var to = J.addDays(from, days);
    var jobs = J.visibleJobs(user).filter(function (j) { return j.planned_start && new Date(j.planned_start) >= from && new Date(j.planned_start) < to; });
    if (engineer) jobs = jobs.filter(function (j) { return J.isAssigned(J.getUser(engineer), j.id); });
    jobs.sort(function (a, b) { return a.planned_start.localeCompare(b.planned_start); });
    var groups = {};
    jobs.forEach(function (j) { var k = J.isoDay(j.planned_start); (groups[k] = groups[k] || []).push(j); });
    var engineers = J.fieldUsers().map(function (u) { return { value: u.id, label: u.display_name }; });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="timeline-filters">' +
      selectField("Window", "days", [{ value: "7", label: "Next 7 days" }, { value: "14", label: "Next 14 days" }, { value: "30", label: "Next 30 days" }], String(days)) +
      (J.isManagerial(user) ? selectField("Engineer", "engineer", [{ value: "", label: "All engineers" }].concat(engineers), engineer) : "") +
      '<button class="btn btn-primary" type="submit">Apply</button><a class="btn btn-quiet" href="#/insights/timeline">Reset</a></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Timeline</h2><p>Planned jobs from ' + esc(J.fmtDate(from)) + " to " + esc(J.fmtDate(to)) + ".</p></div><span class=\"badge\">" + jobs.length + " jobs</span></div>" +
      (jobs.length ? Object.keys(groups).sort().map(function (day) {
        return '<div class="timeline-day"><div class="timeline-day-label"><strong>' + esc(J.fmtDate(day + "T09:00:00")) + '</strong><span class="muted small">' + groups[day].length + " job" + (groups[day].length === 1 ? "" : "s") + "</span></div><div class=\"timeline-day-jobs\">" +
          groups[day].map(function (j) {
            return '<a class="timeline-job ' + J.statusClass(j.status) + '" href="#/jobs/' + j.id + '"><span class="ref">' + esc(j.reference) + "</span><strong>" + esc(j.title) + "</strong><span class=\"small muted\">" + esc(J.customerName(j.customer_id)) + " · " + esc(J.assignedUsers(j.id).map(function (u) { return u.display_name; }).join(", ") || "Unassigned") + "</span></a>";
          }).join("") + "</div></div>";
      }).join("") : emptyState("Nothing in this window", "Try a wider date range or clear the engineer filter.")) + "</section>";
    shell(user, { title: "Timeline", eyebrow: "Insights", intro: "Who is where, when — planned jobs by day.", body: body });
  }

  function renderWorkload(user) {
    if (!J.can(user, "insight.workload")) return renderForbidden(user);
    var start = qs("week") || todayISO();
    var monday = J.startOfDay(start);
    var dow = monday.getDay(); monday = J.addDays(monday, dow === 0 ? -6 : 1 - dow);
    var end = J.addDays(monday, 7);
    var jobs = J.all("jobs").filter(function (j) { return j.planned_start && new Date(j.planned_start) >= monday && new Date(j.planned_start) < end && !j.archived_at; });
    var rows = J.fieldUsers().map(function (u) {
      var mine = jobs.filter(function (j) { return J.isAssigned(u, j.id); });
      return { user: u, jobs: mine, days: new Set(mine.map(function (j) { return J.isoDay(j.planned_start); })).size };
    }).sort(function (a, b) { return b.jobs.length - a.jobs.length; });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="workload-filters"><label class="field compact"><span class="field-label">Week beginning</span><input class="input" type="date" name="week" value="' + esc(J.isoDay(monday)) + '"></label><button class="btn btn-primary" type="submit">Apply</button></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Workload</h2><p>Week of ' + esc(J.fmtDate(monday)) + " — " + jobs.length + " scheduled visits.</p></div></div>" +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Engineer</th><th>Jobs</th><th>Days on site</th><th>Planned work</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td><strong>" + esc(r.user.display_name) + '</strong><br><span class="small muted">' + esc(roleLabel(r.user.role_key)) + "</span></td><td class=\"big-number\">" + r.jobs.length + "</td><td>" + r.days + "</td><td>" + (r.jobs.length ? r.jobs.sort(function (a, b) { return a.planned_start.localeCompare(b.planned_start); }).map(function (j) { return '<a class="inline-link" href="#/jobs/' + j.id + '">' + esc(J.fmtDateShort(j.planned_start)) + " · " + esc(j.reference) + "</a>"; }).join("<br>") : '<span class="muted">Available</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
    shell(user, { title: "Workload", eyebrow: "Insights", intro: "Jobs per engineer for the chosen week.", body: body });
  }

  function renderFinancials(user) {
    if (!J.can(user, "insight.financial")) return renderForbidden(user);
    var days = Number(qs("days") || 90);
    var from = J.addDays(J.startOfDay(), -days);
    var invoices = J.all("invoices");
    var inRange = function (d) { return d && new Date(d) >= from; };
    var quoted = J.all("jobs").filter(function (j) { return inRange(j.created_at) && j.price_net != null; }).reduce(function (s, j) { return s + j.price_net; }, 0);
    var issued = invoices.filter(function (i) { return inRange(i.issued_at); }).reduce(function (s, i) { return s + i.net; }, 0);
    var paid = invoices.filter(function (i) { return inRange(i.paid_at) && i.status === "PAID"; }).reduce(function (s, i) { return s + i.net; }, 0);
    var outstanding = invoices.filter(function (i) { return i.status === "ISSUED"; }).reduce(function (s, i) { return s + i.gross; }, 0);
    var recent = invoices.filter(function (i) { return inRange(i.issued_at) || inRange(i.paid_at); }).sort(function (a, b) { return String(b.issued_at).localeCompare(String(a.issued_at)); });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="financial-filters">' + selectField("Range", "days", [{ value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }], String(days)) + '<button class="btn btn-primary" type="submit">Apply</button></form></section>' +
      '<div class="stats-grid"><div class="stat-card"><span class="stat-label">Quoted</span><strong>' + J.fmtMoney(quoted) + '</strong><span class="stat-note">jobs created in range</span></div><div class="stat-card"><span class="stat-label">Invoiced</span><strong>' + J.fmtMoney(issued) + '</strong><span class="stat-note">net issued in range</span></div><div class="stat-card tone-accent"><span class="stat-label">Paid</span><strong>' + J.fmtMoney(paid) + '</strong><span class="stat-note">net settled in range</span></div><div class="stat-card tone-warn"><span class="stat-label">Outstanding</span><strong>' + J.fmtMoney(outstanding) + '</strong><span class="stat-note">issued, not paid</span></div></div>' +
      '<section class="panel"><div class="panel-head"><div><h2>Invoice activity</h2><p>Issued and paid invoices in the selected range.</p></div></div>' +
      (recent.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Issued</th><th>Paid</th><th class="right">Net</th><th class="right">Gross</th></tr></thead><tbody>' + recent.map(function (i) {
        var job = J.getJob(i.job_id);
        return '<tr><td><a class="ref" href="#/invoices/' + i.id + '">' + esc(i.number) + "</a></td><td>" + esc(job ? J.customerName(job.customer_id) : "—") + "</td><td>" + statusPill(i.status) + "</td><td>" + esc(J.fmtDateShort(i.issued_at)) + "</td><td>" + esc(J.fmtDateShort(i.paid_at)) + '</td><td class="right mono">' + J.fmtMoney(i.net) + '</td><td class="right mono">' + J.fmtMoney(i.gross) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : emptyState("No invoices in range", "Choose a wider date range.")) + "</section>";
    shell(user, { title: "Financials", eyebrow: "Insights", intro: "Quoted, invoiced and paid work, with outstanding invoices.", body: body });
  }

  function renderNeedsInvoicing(user) {
    if (!J.can(user, "invoice.create")) return renderForbidden(user);
    var jobs = J.all("jobs").filter(function (j) { return !j.archived_at && j.status === "COMPLETED" && !J.liveInvoiceForJob(j.id); });
    var body = '<section class="panel"><div class="panel-head"><div><h2>Needs invoicing</h2><p>Completed jobs without a live invoice.</p></div><span class="badge">' + jobs.length + "</span></div>" +
      (jobs.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Completed</th><th class="right">Net</th><th></th></tr></thead><tbody>' + jobs.map(function (j) {
        return '<tr><td><a class="ref" href="#/jobs/' + j.id + '">' + esc(j.reference) + "</a></td><td>" + esc(j.title) + "</td><td>" + esc(J.customerName(j.customer_id)) + "</td><td>" + esc(J.fmtDateShort(j.actual_end || j.updated_at)) + '</td><td class="right mono">' + J.fmtMoney(j.price_net) + '</td><td><a class="btn btn-primary small-btn" href="#/invoices/new?job=' + j.id + '">Create invoice</a></td></tr>';
      }).join("") + "</tbody></table></div>" : emptyState("Nothing to invoice", "Every completed job has an invoice.")) + "</section>";
    shell(user, { title: "Needs invoicing", eyebrow: "Money", intro: "Completed work that is ready to be billed.", body: body });
  }

  /* ------------------------------------------------------------------ */
  /* admin                                                               */
  /* ------------------------------------------------------------------ */
  function renderUsers(user) {
    if (!J.can(user, "user.view")) return renderForbidden(user);
    var q = qs("q").toLowerCase();
    var role = qs("role");
    var list = J.all("users").slice();
    if (q) list = list.filter(function (u) { return [u.display_name, u.email, roleLabel(u.role_key)].join(" ").toLowerCase().indexOf(q) >= 0; });
    if (role) list = list.filter(function (u) { return u.role_key === role; });
    list.sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
    var body = '<section class="panel filters-panel"><form class="filters" data-form="user-filters"><label class="field compact"><span class="field-label">Search</span><input class="input" name="q" value="' + esc(qs("q")) + '" placeholder="Name, email, role"></label>' +
      selectField("Role", "role", [{ value: "", label: "All roles" }, { value: "ADMIN", label: "Admin" }, { value: "MANAGER", label: "Manager" }, { value: "ENGINEER", label: "Engineer" }, { value: "CUSTOMER", label: "Customer" }], role) +
      '<button class="btn btn-primary" type="submit">Apply</button></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>' + list.length + " user" + (list.length === 1 ? "" : "s") + "</h2><p>Staff and customer portal accounts.</p></div><a class=\"btn btn-primary\" href=\"#/admin/users/new\">New user</a></div>" +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Field</th><th>Status</th><th>Last sign-in</th></tr></thead><tbody>' +
      list.map(function (u) {
        return '<tr><td><a class="ref" href="#/admin/users/' + u.id + '">' + esc(u.display_name) + "</a></td><td>" + esc(u.email) + "</td><td>" + esc(roleLabel(u.role_key)) + "</td><td>" + (u.can_engineer ? "Yes" : "—") + "</td><td>" + esc(u.status) + "</td><td>" + esc(u.last_login_at ? J.fmtDateShort(u.last_login_at) : "Never") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
    shell(user, { title: "Users", eyebrow: "Admin", intro: "Accounts, roles and field capability.", actions: '<a class="btn btn-primary" href="#/admin/users/new">New user</a>', body: body });
  }

  function renderUserForm(user, id) {
    if (id ? !J.can(user, "user.view") : !J.can(user, "user.create")) return renderForbidden(user);
    var u = id ? J.getUser(id) : null;
    if (id && !u) return renderNotFound(user, "User");
    var customers = J.all("customers").filter(function (c) { return c.status === "ACTIVE"; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var body = '<section class="panel form-panel"><form data-form="user" data-user="' + (u ? u.id : "") + '" class="single-form">' +
      field("Display name", "display_name", { required: true, value: u ? u.display_name : "" }) +
      field("Email address", "email", { type: "email", required: true, value: u ? u.email : "", help: "Used as the sign-in name." }) +
      field("Phone", "phone", { value: u ? u.phone || "" : "" }) +
      '<div class="form-row">' +
      selectField("Role", "role_key", [{ value: "ADMIN", label: "Admin" }, { value: "MANAGER", label: "Manager" }, { value: "ENGINEER", label: "Engineer" }, { value: "CUSTOMER", label: "Customer" }], u ? u.role_key : "ENGINEER") +
      selectField("Status", "status", [{ value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "SUSPENDED", label: "Suspended" }, { value: "ARCHIVED", label: "Archived" }], u ? u.status : "ACTIVE") + "</div>" +
      '<label class="check-line block-check"><input type="checkbox" name="can_engineer" value="yes"' + (u && u.can_engineer ? " checked" : "") + "><span>Field-capable — can be assigned to jobs (engineers, and managers who still install).</span></label>" +
      '<label class="field"><span class="field-label">Customer record (only for CUSTOMER role)</span><select class="input" name="customer_id"><option value="">— none —</option>' + customers.map(function (c) { return '<option value="' + c.id + '"' + (u && u.customer_id === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></label>" +
      (!u ? '<div class="notice notice-info"><strong>Starting password</strong><p>The new account starts with <code>JMS123</code>. In the full app this forces a password change at first sign-in.</p></div>' : "") +
      '<div class="button-row"><button class="btn btn-primary" type="submit">' + (u ? "Save user" : "Create user") + '</button><a class="btn btn-quiet" href="#/admin/users">Cancel</a></div></form>' +
      (u ? '<div class="admin-user-actions"><h3>Account actions</h3><div class="button-row"><button class="btn btn-quiet" data-action="reset-user-password" data-user="' + u.id + '">Reset password to JMS123</button>' + (u.status === "ACTIVE" ? '<button class="btn btn-danger-quiet" data-action="deactivate-user" data-user="' + u.id + '">Suspend account</button>' : "") + "</div></div>" : "") +
      "</section>";
    shell(user, { title: u ? u.display_name : "New user", eyebrow: "Admin · Users", intro: u ? u.email : "Create a staff or customer portal account.", breadcrumb: '<a href="#/admin/users">Users</a> <span>/</span> ' + esc(u ? u.display_name : "New"), body: body });
  }

  function renderRoles(user) {
    if (!J.can(user, "admin.roles.manage")) return renderForbidden(user);
    var roles = J.all("roles").slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    var permissions = J.all("permissions");
    var groups = {};
    window.JMS_SEED.ACTION_KEYS.forEach(function (pair) { (groups[pair[0]] = groups[pair[0]] || []).push(pair[1]); });
    var isAllowed = function (role, key) {
      var p = permissions.find(function (x) { return x.role_key === role && x.action_key === key; });
      return !!(p && p.allowed);
    };
    var body = '<section class="panel"><div class="panel-head"><div><h2>Role permissions</h2><p>Tick a cell to grant an action. Changes apply immediately after saving and are written to the audit log.</p></div></div>' +
      '<form data-form="roles"><div class="table-wrap"><table class="matrix"><thead><tr><th>Area</th><th>Action key</th>' + roles.map(function (r) { return "<th>" + esc(r.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      Object.keys(groups).map(function (g) {
        return '<tr class="matrix-group"><td colspan="' + (roles.length + 2) + '">' + esc(g) + "</td></tr>" +
          groups[g].map(function (key) {
            return "<tr><td></td><td><code>" + esc(key) + "</code></td>" + roles.map(function (r) {
              var safeguard = (key === "admin.permissions.edit" && r.key === "ADMIN") ||
                (key === "admin.audit.view" && (r.key === "CUSTOMER" || r.key === "ENGINEER"));
              var checked = isAllowed(r.key, key);
              return '<td class="cell"><input type="checkbox" name="' + r.key + "|" + key + '"' + (checked ? " checked" : "") + (safeguard ? " disabled" : "") + ' aria-label="' + esc(r.label + " " + key) + '"></td>';
            }).join("") + "</tr>";
          }).join("");
      }).join("") + "</tbody></table></div>" +
      '<p class="muted small">Disabled cells are safeguards: an admin always keeps permission editing, and the audit log cannot be granted to customers or engineers.</p>' +
      '<div class="button-row"><button class="btn btn-primary" type="submit">Save permissions</button></div></form></section>';
    shell(user, { title: "Roles & permissions", eyebrow: "Admin", intro: "The role × action matrix that drives navigation, buttons and access.", body: body });
  }

  function renderSettings(user) {
    if (!J.can(user, "admin.settings.manage")) return renderForbidden(user);
    var company = J.company();
    var due = J.setting("company.invoice_due_days", 14);
    var vat = J.setting("company.vat_rate_bp", 2000);
    var theme = J.setting("company.default_theme", { mode: "system" });
    var footer = J.setting("company.pdf_footer", company.pdf_footer || "");
    var body = '<section class="panel form-panel"><form data-form="settings" class="single-form">' +
      '<fieldset class="form-section"><legend>Company</legend>' + field("Company name", "name", { required: true, value: company.name }) + field("Email", "email", { type: "email", value: company.email }) + field("Phone", "phone", { value: company.phone }) +
      field("Address line 1", "line1", { value: company.address.line1 }) + field("Address line 2", "line2", { value: company.address.line2 || "" }) + '<div class="form-row">' + field("Town", "town", { value: company.address.town }) + field("Postcode", "postcode", { value: company.address.postcode }) + "</div>" + field("VAT number", "vat_number", { value: company.vat_number || "" }) + "</fieldset>" +
      '<fieldset class="form-section"><legend>Invoicing</legend><div class="form-row">' + field("VAT rate (%)", "vat_rate", { type: "number", step: "0.01", value: (vat / 100).toFixed(2) }) + field("Invoice due days", "due_days", { type: "number", step: "1", value: due }) + "</div>" +
      selectField("Company default theme", "default_theme", [{ value: "system", label: "Follow system" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], theme.mode || "system") +
      textarea("PDF footer text", "pdf_footer", footer) + "</fieldset>" +
      '<div class="button-row"><button class="btn btn-primary" type="submit">Save settings</button></div></form></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Demo data</h2><p>Everything is stored in this browser. Export a JSON snapshot, import one, or start again.</p></div></div><div class="button-row">' +
      '<button class="btn btn-quiet" data-action="export-demo">Export JSON</button>' +
      '<label class="btn btn-quiet file-btn">Import JSON<input type="file" accept="application/json" data-action="import-demo"></label>' +
      '<button class="btn btn-danger-quiet" data-action="reset-demo">Reset demo data</button></div>' +
      '<p class="muted small">Reset restores the seeded 12 staff, 10 customers and 26 jobs. Any changes you made are lost.</p></section>';
    shell(user, { title: "Company settings", eyebrow: "Admin", intro: "Company identity, invoicing defaults and the theme everyone starts with.", body: body });
  }

  function renderAudit(user) {
    if (!J.can(user, "admin.audit.view")) return renderForbidden(user);
    var logs = J.all("audit_log").slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, 250);
    var body = '<section class="panel"><div class="panel-head"><div><h2>Audit log</h2><p>Newest first. Job, invoice, permission and account changes are recorded.</p></div><span class="badge">' + logs.length + " shown</span></div>" +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>' +
      logs.map(function (l) {
        var actor = l.actor_user_id ? J.getUser(l.actor_user_id) : null;
        var details = l.after ? JSON.stringify(l.after) : "";
        if (details.length > 90) details = details.slice(0, 90) + "…";
        return "<tr><td>" + esc(J.fmtDateTime(l.at)) + "</td><td>" + esc(actor ? actor.display_name : "System / anonymous") + "</td><td><code>" + esc(l.action) + "</code></td><td>" + esc(l.entity_type) + (l.entity_id ? ' <span class="muted small">' + esc(String(l.entity_id).slice(0, 8)) + "</span>" : "") + "</td><td class=\"small muted\">" + esc(details) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
    shell(user, { title: "Audit log", eyebrow: "Admin", intro: "Who changed what, and when.", body: body });
  }

  function renderArchive(user) {
    if (!J.can(user, "job.archive") && !J.can(user, "customer.archive")) return renderForbidden(user);
    var jobs = J.all("jobs").filter(function (j) { return j.archived_at; });
    var customers = J.all("customers").filter(function (c) { return c.archived_at || c.status === "ARCHIVED"; });
    var body = '<section class="panel"><div class="panel-head"><div><h2>Archived jobs</h2><p>Records stay intact and can be restored.</p></div><span class="badge">' + jobs.length + "</span></div>" +
      (jobs.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Job</th><th>Customer</th><th>Archived</th><th></th></tr></thead><tbody>' + jobs.map(function (j) {
        return '<tr><td><a class="ref" href="#/jobs/' + j.id + '">' + esc(j.reference) + "</a></td><td>" + esc(j.title) + "</td><td>" + esc(J.customerName(j.customer_id)) + "</td><td>" + esc(J.fmtDateShort(j.archived_at)) + '</td><td><button class="btn btn-quiet small-btn" data-action="restore-job" data-job="' + j.id + '">Restore</button></td></tr>';
      }).join("") + "</tbody></table></div>" : emptyState("No archived jobs", "Archived jobs will appear here.")) + "</section>" +
      '<section class="panel"><div class="panel-head"><div><h2>Archived customers</h2><p>Their history and jobs remain linked.</p></div><span class="badge">' + customers.length + "</span></div>" +
      (customers.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th></th></tr></thead><tbody>' + customers.map(function (c) {
        return '<tr><td><a class="ref" href="#/customers/' + c.id + '">' + esc(c.name) + "</a></td><td>" + esc(c.contact_name) + "</td><td>" + esc(c.email) + '</td><td><button class="btn btn-quiet small-btn" data-action="restore-customer" data-customer="' + c.id + '">Restore</button></td></tr>';
      }).join("") + "</tbody></table></div>" : emptyState("No archived customers", "Archived customers will appear here.")) + "</section>";
    shell(user, { title: "Archive", eyebrow: "Admin", intro: "Restore archived jobs and customers.", body: body });
  }

  /* ------------------------------------------------------------------ */
  /* search, account, errors                                             */
  /* ------------------------------------------------------------------ */
  function renderSearch(user) {
    var q = qs("q").trim();
    var low = q.toLowerCase();
    if (q.length < 2) {
      shell(user, { title: "Search", eyebrow: "Find anything", intro: "Type at least two characters in the search box.", body: '<section class="panel">' + emptyState("Search JMS", "Search by job reference, customer name, postcode, engineer name or invoice number.") + "</section>" });
      return;
    }
    var jobs = J.visibleJobs(user).filter(function (j) {
      return [j.reference, j.title, J.customerName(j.customer_id), j.site_address.postcode, J.assignedUsers(j.id).map(function (u) { return u.display_name; }).join(" ")].join(" ").toLowerCase().indexOf(low) >= 0;
    }).slice(0, 20);
    var customerPool;
    if (J.can(user, "customer.view.all")) customerPool = J.all("customers");
    else if (user.role_key === "CUSTOMER") customerPool = [J.getCustomer(user.customer_id)];
    else if (J.can(user, "customer.view.own")) {
      var seenCustomers = {};
      customerPool = J.visibleJobs(user).map(function (j) { return J.getCustomer(j.customer_id); }).filter(function (c) {
        if (!c || seenCustomers[c.id]) return false;
        seenCustomers[c.id] = true; return true;
      });
    } else customerPool = [];
    var customers = customerPool.filter(Boolean).filter(function (c) {
      return [c.name, c.contact_name, c.email, c.address.postcode].join(" ").toLowerCase().indexOf(low) >= 0;
    }).slice(0, 20);
    var invoices = J.all("invoices").filter(function (i) {
      var job = J.getJob(i.job_id);
      if (!job) return false;
      if (user.role_key === "CUSTOMER" && job.customer_id !== user.customer_id) return false;
      if (user.role_key === "CUSTOMER" && ["ISSUED", "PAID", "VOID"].indexOf(i.status) < 0) return false;
      if (user.role_key === "ENGINEER") return false;
      return [i.number, job.reference, J.customerName(job.customer_id)].join(" ").toLowerCase().indexOf(low) >= 0;
    }).slice(0, 20);
    var users = J.can(user, "user.view") ? J.all("users").filter(function (u) { return [u.display_name, u.email, roleLabel(u.role_key)].join(" ").toLowerCase().indexOf(low) >= 0; }).slice(0, 20) : [];
    var section = function (title, rows, href, label) {
      return rows.length ? '<section class="panel"><div class="panel-head"><div><h2>' + esc(title) + "</h2><p>" + rows.length + " match" + (rows.length === 1 ? "" : "es") + "</p></div></div><div class=\"stack-list\">" + rows.map(function (r) { return '<a class="search-row" href="' + href(r) + '"><strong>' + esc(label(r)) + "</strong><span class=\"arrow\">→</span></a>"; }).join("") + "</div></section>" : "";
    };
    var body = '<div class="search-summary">Results for <strong>“' + esc(q) + '”</strong></div>' +
      section("Jobs", jobs, function (j) { return "#/jobs/" + j.id; }, function (j) { return j.reference + " · " + j.title + " · " + J.customerName(j.customer_id); }) +
      section("Customers", customers, function (c) { return "#/customers/" + c.id; }, function (c) { return c.name + " · " + c.contact_name + " · " + c.address.postcode; }) +
      section("Invoices", invoices, function (i) { return "#/" + (user.role_key === "CUSTOMER" ? "portal/" : "") + "invoices/" + i.id; }, function (i) { return i.number + " · " + J.statusLabel(i.status) + " · " + J.fmtMoney(i.gross); }) +
      section("Users", users, function (u) { return "#/admin/users/" + u.id; }, function (u) { return u.display_name + " · " + roleLabel(u.role_key) + " · " + u.email; });
    if (!jobs.length && !customers.length && !invoices.length && !users.length) body += '<section class="panel">' + emptyState("No matches", "Try a job reference such as JOB-, a customer name, a postcode or an invoice number.") + "</section>";
    shell(user, { title: "Search", eyebrow: "Results", intro: "Grouped results, scoped to what your role can see.", body: body });
  }

  function renderAppearance(user) {
    var t = currentTheme();
    var body = '<section class="panel"><div class="panel-head"><div><h2>Your appearance</h2><p>Same controls as the floating Aa panel. Saved to your user record in this browser.</p></div><button class="btn btn-primary" data-action="aa-open">Open Aa panel</button></div>' +
      '<div class="appearance-preview"><div class="preview-card"><div class="eyebrow">Preview</div><h3>Job JOB-2026-0042</h3><p>Window installation at Meadow House Ltd. Scheduled for Tuesday morning.</p><div class="button-row"><span class="btn btn-primary">Complete job</span><span class="btn btn-quiet">Add note</span></div></div>' +
      '<dl class="mini-details"><div><dt>Mode</dt><dd>' + esc(t.mode) + "</dd></div><div><dt>Reading size</dt><dd>" + esc(t.fs_content) + "px</dd></div><div><dt>Interface size</dt><dd>" + esc(t.fs_ui) + "px</dd></div><div><dt>Sidebar</dt><dd>" + esc(t.sidebar) + "px</dd></div></dl></div>" +
      '<p class="muted small">Only design tokens change. Layout, permissions and content never do. The panel is hidden in print.</p></section>';
    shell(user, { title: "Appearance", eyebrow: "Account", intro: "Comfortable reading for the office, the van and everything between.", body: body });
  }

  function renderForbidden(user) {
    shell(user, {
      title: "That area is not available to your role", eyebrow: "Permission",
      intro: "The navigation only shows what your role can use, and every screen checks again.",
      body: '<section class="panel">' + emptyState("Permission denied", "You do not have the permission for this screen. Nothing has changed.", '<a class="btn btn-primary" href="#' + landing(user) + '">Back to my work</a>') + "</section>"
    });
  }
  function renderNotFound(user, what) {
    shell(user, {
      title: what + " not found", eyebrow: "Not found",
      intro: "It may have been archived, or it may belong to someone else.",
      body: '<section class="panel">' + emptyState(what + " not found", "The record does not exist, is archived, or is outside your access. Check the reference and try again.", '<a class="btn btn-primary" href="#' + landing(user) + '">Back to my work</a>') + "</section>"
    });
  }

  /* ------------------------------------------------------------------ */
  /* dialogs                                                             */
  /* ------------------------------------------------------------------ */
  function dialog(opts) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "modal-backdrop";
      wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">' + esc(opts.title) + "</h2><button class=\"icon-btn\" data-modal-close aria-label=\"Close\">×</button></div>" +
        '<div class="modal-body">' + (opts.body || "") + '</div><div class="modal-actions"><button class="btn btn-quiet" data-modal-close>Cancel</button><button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-modal-ok>' + esc(opts.confirmLabel || "Confirm") + '</button></div></div>';
      modalRoot.appendChild(wrap);
      var close = function (value) { wrap.remove(); resolve(value); };
      wrap.querySelector("[data-modal-ok]").addEventListener("click", function () {
        if (opts.input) {
          var input = wrap.querySelector("[name='" + opts.input + "']");
          if (opts.required && input && !input.value.trim()) { input.focus(); return; }
          close(input ? input.value.trim() : "");
        } else close(true);
      });
      wrap.querySelectorAll("[data-modal-close]").forEach(function (b) { b.addEventListener("click", function () { close(false); }); });
      wrap.addEventListener("click", function (e) { if (e.target === wrap) close(false); });
      var first = wrap.querySelector("input,textarea,button");
      if (first) setTimeout(function () { first.focus(); }, 40);
    });
  }
  function promptDialog(title, label, opts) {
    opts = opts || {};
    return dialog({ title: title, confirmLabel: opts.confirmLabel || "Save", danger: opts.danger, required: opts.required, input: "value", body: '<label class="field"><span class="field-label">' + esc(label) + "</span><textarea class=\"input textarea\" name=\"value\" rows=\"3\"></textarea>" + (opts.help ? '<span class="field-help">' + esc(opts.help) + "</span>" : "") + "</label>" });
  }
  function confirmDialog(title, body, opts) {
    opts = opts || {};
    return dialog({ title: title, body: "<p>" + esc(body) + "</p>", confirmLabel: opts.confirmLabel || "Confirm", danger: opts.danger });
  }

  /* ------------------------------------------------------------------ */
  /* print documents                                                     */
  /* ------------------------------------------------------------------ */
  function openPrint(html, title) {
    var w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast("Allow pop-ups to print or save a PDF.", "error"); return; }
    w.document.open();
    w.document.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>" + esc(title) + "</title><style>" +
      "body{font-family:Georgia,serif;color:#1f1e1d;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.5;font-size:13px}" +
      "h1,h2,h3{font-family:Georgia,serif;margin:0 0 8px}h1{font-size:26px}h2{font-size:20px}h3{font-size:15px;text-transform:uppercase;letter-spacing:.08em}" +
      ".doc-head{display:flex;justify-content:space-between;border-bottom:2px solid #d97757;padding-bottom:16px;margin-bottom:22px}.doc-head p{margin:4px 0;color:#55524c}" +
      ".doc-ref{font-family:Consolas,monospace;font-size:20px}.doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:18px 0}" +
      ".box{border:1px solid #e2ddd2;padding:14px;border-radius:8px}.box p{margin:4px 0}.label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#7c766b}" +
      "table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border-bottom:1px solid #e2ddd2;padding:8px 6px;text-align:left;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#55524c}" +
      ".right{text-align:right}.mono{font-family:Consolas,monospace}.totals{margin-left:auto;width:300px}.totals div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ece8df}.totals .grand{font-weight:bold;font-size:16px;border-bottom:2px solid #d97757}" +
      ".foot{margin-top:30px;padding-top:12px;border-top:1px solid #e2ddd2;color:#55524c;font-size:11px}.notice{background:#f8eee8;border:1px solid #e7cec2;padding:12px;border-radius:8px;margin:16px 0}" +
      "@page{size:A4;margin:18mm}@media print{body{margin:0}.no-print{display:none}}</style></head><body>" + html + '<div class="foot">Generated ' + esc(J.fmtDateTime(new Date())) + " · Page 1</div></body></html>");
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 350);
  }
  function printJob(job) {
    var company = J.company();
    var customer = J.getCustomer(job.customer_id);
    var engineers = J.assignedUsers(job.id).map(function (u) { return u.display_name; }).join(", ") || "Unassigned";
    var html = '<div class="doc-head"><div><h1>' + esc(company.name) + "</h1><p>" + esc([company.address.line1, company.address.line2, company.address.town, company.address.postcode].filter(Boolean).join(", ")) + "<br>" + esc(company.email) + " · " + esc(company.phone) + '</p></div><div class="right"><div class="label">Job sheet</div><div class="doc-ref">' + esc(job.reference) + "</div><p>" + esc(J.statusLabel(job.status)) + "</p></div></div>" +
      '<div class="doc-grid"><div class="box"><div class="label">Customer</div><p><strong>' + esc(customer.name) + "</strong><br>" + esc(customer.contact_name) + "<br>" + esc(customer.phone) + "<br>" + esc(customer.email) + "</p></div>" +
      '<div class="box"><div class="label">Site address</div><p>' + esc([job.site_address.line1, job.site_address.line2, job.site_address.town, job.site_address.postcode].filter(Boolean).join("<br>")) + "</p></div></div>" +
      '<h3>Work</h3><p><strong>' + esc(job.title) + "</strong><br>" + esc(job.description) + "</p>" +
      '<div class="doc-grid"><div class="box"><div class="label">Planned</div><p>' + esc(J.fmtRange(job.planned_start, job.planned_end)) + "<br>Slot: " + esc(job.planned_slot.replace("_", " ")) + "</p></div>" +
      '<div class="box"><div class="label">Assigned engineers</div><p>' + esc(engineers) + "</p></div></div>" +
      (job.customer_notes ? '<div class="notice"><strong>Notes for the customer</strong><br>' + esc(job.customer_notes) + "</div>" : "") +
      '<p style="margin-top:24px;font-size:11px;color:#7c766b">Internal notes and commercial values are not printed on the customer job sheet.</p>';
    openPrint(html, job.reference + " · Job sheet");
    J.audit("document.job_sheet", "JOB", job.id, null, { format: "browser-print" });
    toast("Print dialog opened — choose Save as PDF.", "success");
  }
  function printInvoice(inv) {
    var company = J.company();
    var job = J.getJob(inv.job_id);
    var customer = J.getCustomer(job.customer_id);
    var html = '<div class="doc-head"><div><h1>' + esc(company.name) + "</h1><p>" + esc([company.address.line1, company.address.line2, company.address.town, company.address.postcode].filter(Boolean).join(", ")) + "<br>" + esc(company.email) + " · " + esc(company.phone) + "<br>VAT " + esc(company.vat_number || "") + '</p></div><div class="right"><div class="label">Invoice</div><div class="doc-ref">' + esc(inv.number) + "</div><p>" + esc(J.statusLabel(inv.status)) + "</p></div></div>" +
      '<div class="doc-grid"><div class="box"><div class="label">Invoice to</div><p><strong>' + esc(customer.name) + "</strong><br>" + esc(customer.contact_name) + "<br>" + esc([customer.address.line1, customer.address.line2, customer.address.town, customer.address.postcode].filter(Boolean).join(", ")) + "<br>" + esc(customer.email) + "</p></div>" +
      '<div class="box"><div class="label">Job</div><p><strong>' + esc(job.reference) + "</strong><br>" + esc(job.title) + "<br>Issued: " + esc(J.fmtDateShort(inv.issued_at)) + "<br>Due: " + esc(J.fmtDateShort(inv.due_at)) + (inv.paid_at ? "<br>Paid: " + esc(J.fmtDateShort(inv.paid_at)) : "") + "</p></div></div>" +
      '<table><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit</th><th class="right">Amount</th></tr></thead><tbody>' + inv.lines.map(function (l) { return "<tr><td>" + esc(l.description) + '</td><td class="right">' + l.qty + '</td><td class="right mono">' + J.fmtMoney(l.unit_pence) + '</td><td class="right mono">' + J.fmtMoney(l.amount_pence) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="totals"><div><span>Net</span><strong>' + J.fmtMoney(inv.net) + '</strong></div><div><span>VAT (' + (inv.vat_rate_bp / 100) + '%)</span><strong>' + J.fmtMoney(inv.vat) + '</strong></div><div class="grand"><span>Total</span><strong>' + J.fmtMoney(inv.gross) + "</strong></div></div>" +
      '<p class="foot">' + esc(inv.notes || "") + "<br>" + esc(company.pdf_footer || "") + "</p>" + (inv.status === "VOID" ? '<div style="font-size:40px;color:#a52a2a;text-align:center;border:3px solid #a52a2a;padding:8px;margin-top:20px">VOID</div>' : "");
    openPrint(html, inv.number + " · Invoice");
    J.audit("document.invoice_pdf", "INVOICE", inv.id, null, { format: "browser-print" });
    toast("Print dialog opened — choose Save as PDF.", "success");
  }

  /* ------------------------------------------------------------------ */
  /* actions and forms                                                   */
  /* ------------------------------------------------------------------ */
  function findJob(id) { return J.getJob(id); }

  async function handleStatusClick(user, job, to) {
    var note = "";
    if (to === "ON_HOLD") {
      note = await promptDialog("Put job on hold", "Reason for the hold", { required: true, confirmLabel: "Put on hold", help: "This is recorded on the job timeline." });
      if (note === false) return;
    } else if (to === "CANCELLED") {
      note = await promptDialog("Cancel job", "Why is this job being cancelled?", { required: true, confirmLabel: "Cancel job", danger: true });
      if (note === false) return;
    } else if (to === "COMPLETED") {
      note = await promptDialog("Complete job", "Completion note (optional)", { confirmLabel: "Complete job" });
      if (note === false) return;
    }
    var result = J.transitionJob(user, job, to, note);
    if (!result.ok) { toast(result.message, "error"); return; }
    toast("Job status updated to " + J.statusLabel(to) + ".", "success");
    renderRoute();
  }

  async function handleClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var user = J.currentUser();

    if (action === "aa-open") { e.preventDefault(); openAA(); return; }
    if (action === "aa-close") { closeAA(); return; }
    if (action === "aa-save") {
      e.preventDefault();
      var t = themeFromPanel();
      J.saveTheme(t); applyTheme(t); closeAA();
      toast("Appearance saved to your user record.", "success");
      return;
    }
    if (action === "aa-reset") {
      e.preventDefault();
      if (user) { user.theme_prefs = null; J.save(); }
      var d = defaultTheme();
      applyTheme(d); closeAA(); toast("Appearance reset to the company default.", "success");
      return;
    }
    if (action === "aa-copy") {
      e.preventDefault();
      var tt = themeFromPanel();
      var toml = '# JMS appearance — paste into jms_theme.toml\nmode = "' + tt.mode + '"\n\n[type]\nfs_content = ' + tt.fs_content + "\nlh_content = " + tt.lh_content + "\nfs_ui = " + tt.fs_ui + "\n\n[layout]\nsidebar = " + tt.sidebar + "\n\n[fonts]\nserif = '" + tt.font_serif + "'\nsans = '" + tt.font_sans + "'\nmono = '" + tt.font_mono + "'\n";
      if (navigator.clipboard) navigator.clipboard.writeText(toml).then(function () { toast("Theme TOML copied.", "success"); }, function () { toast("Could not copy. Your browser blocked clipboard access.", "error"); });
      return;
    }
    if (action === "toggle-menu") {
      var toc = document.getElementById("toc");
      var open = toc.classList.toggle("is-open");
      el.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (action === "demo-login") {
      e.preventDefault();
      var result = J.signIn(el.getAttribute("data-email"), "JMS123");
      if (!result.ok) { toast(result.message, "error"); return; }
      applyTheme(currentTheme());
      go(landing(result.user), true);
      return;
    }
    if (!user) return;
    if (action === "job-status") {
      var job = findJob(el.getAttribute("data-job"));
      if (job) await handleStatusClick(user, job, el.getAttribute("data-status"));
      return;
    }
    if (action === "print-job") {
      var pj = findJob(el.getAttribute("data-job"));
      if (pj && J.visibleJob(user, pj)) printJob(pj);
      return;
    }
    if (action === "print-invoice") {
      var pi = J.getInvoice(el.getAttribute("data-invoice"));
      if (pi) printInvoice(pi);
      return;
    }
    if (action === "archive-job") {
      var aj = findJob(el.getAttribute("data-job"));
      if (!aj) return;
      if (await confirmDialog("Archive " + aj.reference + "?", "The job disappears from normal lists. Its timeline, assignments and invoices are kept. You can restore it from Admin → Archive.", { confirmLabel: "Archive job", danger: true })) {
        aj.archived_at = J.nowISO(); J.addEvent(aj.id, "ARCHIVED", null, null, "Job archived.", "INTERNAL");
        J.audit("job.archive", "JOB", aj.id, null, { reference: aj.reference }); J.save();
        toast(aj.reference + " archived.", "success"); go("/jobs");
      }
      return;
    }
    if (action === "cancel-job") {
      var cj = findJob(el.getAttribute("data-job"));
      if (!cj) return;
      var reason = await promptDialog("Cancel " + cj.reference + "?", "Reason for cancellation", { required: true, confirmLabel: "Cancel job", danger: true });
      if (reason) {
        var res = J.transitionJob(user, cj, "CANCELLED", reason);
        if (res.ok) { toast("Job cancelled.", "success"); renderRoute(); } else toast(res.message, "error");
      }
      return;
    }
    if (action === "archive-customer") {
      var ac = J.getCustomer(el.getAttribute("data-customer"));
      if (!ac) return;
      if (await confirmDialog("Archive " + ac.name + "?", "The customer and their jobs remain in the database but disappear from normal lists. Restore from Admin → Archive.", { confirmLabel: "Archive customer", danger: true })) {
        ac.status = "ARCHIVED"; ac.archived_at = J.nowISO();
        J.audit("customer.archive", "CUSTOMER", ac.id, null, { name: ac.name }); J.save();
        toast(ac.name + " archived.", "success"); go("/customers");
      }
      return;
    }
    if (action === "restore-job") {
      var rj = findJob(el.getAttribute("data-job"));
      if (rj) { rj.archived_at = null; J.audit("job.restore", "JOB", rj.id, { archived_at: rj.archived_at }, null); J.save(); toast(rj.reference + " restored.", "success"); renderRoute(); }
      return;
    }
    if (action === "restore-customer") {
      var rc = J.getCustomer(el.getAttribute("data-customer"));
      if (rc) { rc.archived_at = null; rc.status = "ACTIVE"; J.audit("customer.restore", "CUSTOMER", rc.id, null, { name: rc.name }); J.save(); toast(rc.name + " restored.", "success"); renderRoute(); }
      return;
    }
    if (action === "invite-login") {
      var ic = J.getCustomer(el.getAttribute("data-customer"));
      if (!ic) return;
      var login = J.findOne("users", function (u) { return u.role_key === "CUSTOMER" && u.customer_id === ic.id; });
      if (login) { login.password = "JMS123"; login.status = "ACTIVE"; login.updated_at = J.nowISO(); toast("Portal password reset to JMS123.", "success"); }
      else {
        if (J.userByEmail(ic.email)) { toast("That email is already used by another login.", "error"); return; }
        J.insert("users", { id: J.uid(), company_id: J.company().id, email: ic.email, password: "JMS123", display_name: ic.contact_name, role_key: "CUSTOMER", customer_id: ic.id, can_engineer: false, phone: ic.phone, status: "ACTIVE", must_change_password: false, theme_prefs: null, last_login_at: null, created_at: J.nowISO(), updated_at: J.nowISO() });
        toast("Portal login created for " + ic.email + ".", "success");
      }
      J.audit("customer.invite", "CUSTOMER", ic.id, null, { email: ic.email }); J.save(); renderRoute();
      return;
    }
    if (action === "invoice-issue") {
      var ii = J.getInvoice(el.getAttribute("data-invoice"));
      if (!ii) return;
      if (await confirmDialog("Issue " + ii.number + "?", "The invoice becomes downloadable by the customer and the job moves to Invoiced. Numbers cannot be reused.", { confirmLabel: "Issue invoice" })) {
        var ir = J.issueInvoice(user, ii);
        if (ir.ok) { toast("Invoice issued.", "success"); renderRoute(); } else toast(ir.message, "error");
      }
      return;
    }
    if (action === "invoice-paid") {
      var ip = J.getInvoice(el.getAttribute("data-invoice"));
      if (!ip) return;
      if (await confirmDialog("Mark " + ip.number + " paid?", "This records the payment date and moves the job to Paid. Paid is terminal.", { confirmLabel: "Mark paid" })) {
        var pr = J.markInvoicePaid(user, ip);
        if (pr.ok) { toast("Invoice marked paid.", "success"); renderRoute(); } else toast(pr.message, "error");
      }
      return;
    }
    if (action === "invoice-void") {
      var iv = J.getInvoice(el.getAttribute("data-invoice"));
      if (!iv) return;
      var vreason = await promptDialog("Void " + iv.number + "?", "Reason for voiding", { required: true, confirmLabel: "Void invoice", danger: true, help: "The number stays in the sequence. Re-issue a new invoice from the job." });
      if (vreason) {
        var vr = J.voidInvoice(user, iv, vreason);
        if (vr.ok) { toast("Invoice voided.", "success"); renderRoute(); } else toast(vr.message, "error");
      }
      return;
    }
    if (action === "add-line") {
      e.preventDefault();
      var lines = document.getElementById("invoice-lines");
      if (lines) lines.insertAdjacentHTML("beforeend", invoiceLineRow(lines.children.length, "", ""));
      return;
    }
    if (action === "remove-line") {
      e.preventDefault();
      var line = el.closest(".invoice-line");
      var container = document.getElementById("invoice-lines");
      if (line && container && container.children.length > 1) line.remove();
      else toast("An invoice needs at least one line.", "error");
      return;
    }
    if (action === "reset-user-password") {
      var ru = J.getUser(el.getAttribute("data-user"));
      if (!ru) return;
      if (await confirmDialog("Reset " + ru.display_name + "'s password?", "The password becomes JMS123 and they must change it at next sign-in.", { confirmLabel: "Reset password" })) {
        ru.password = "JMS123"; ru.must_change_password = true; ru.updated_at = J.nowISO();
        J.audit("user.reset_password", "USER", ru.id, null, { email: ru.email }); J.save(); toast("Password reset to JMS123.", "success");
      }
      return;
    }
    if (action === "deactivate-user") {
      var du = J.getUser(el.getAttribute("data-user"));
      if (!du) return;
      if (du.id === user.id) { toast("You cannot suspend your own account.", "error"); return; }
      var activeAdmins = J.all("users").filter(function (u) { return u.role_key === "ADMIN" && u.status === "ACTIVE"; });
      if (du.role_key === "ADMIN" && activeAdmins.length <= 1) { toast("At least one active admin must remain.", "error"); return; }
      if (await confirmDialog("Suspend " + du.display_name + "?", "They will be signed out and cannot sign in until reactivated.", { confirmLabel: "Suspend account", danger: true })) {
        du.status = "SUSPENDED"; du.updated_at = J.nowISO(); J.audit("user.deactivate", "USER", du.id, null, { status: "SUSPENDED" }); J.save(); toast("Account suspended.", "success"); renderRoute();
      }
      return;
    }
    if (action === "export-demo") {
      var blob = new Blob([J.exportData()], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "jms-demo-export-" + todayISO() + ".json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      toast("Demo data exported.", "success"); return;
    }
    if (action === "reset-demo") {
      if (await confirmDialog("Reset all demo data?", "Every change you made will be lost. The seeded 12 staff, 10 customers and 26 jobs will be recreated. You will be signed out.", { confirmLabel: "Reset demo", danger: true })) {
        J.reset(); applyTheme(defaultTheme()); go("/signin", true);
      }
      return;
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-action]")) handleClick(e).catch(function (err) { console.error(err); toast(err.message || "Something went wrong.", "error"); });
    else if (document.getElementById("toc") && document.getElementById("toc").classList.contains("is-open") && !e.target.closest("#toc") && !e.target.closest("[data-action='toggle-menu']")) {
      document.getElementById("toc").classList.remove("is-open");
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-action='import-demo']")) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { J.importData(reader.result); toast("Demo data imported. Reloading…", "success"); setTimeout(function () { location.reload(); }, 700); }
        catch (err) { toast(err.message || "Import failed.", "error"); }
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    var type = form.getAttribute("data-form");
    var user = J.currentUser();
    try {
      if (type === "signin") {
        var fd = new FormData(form);
        var result = J.signIn(fd.get("email"), fd.get("password"));
        if (!result.ok) { toast(result.message, "error"); return; }
        applyTheme(currentTheme());
        go(landing(result.user), true);
        return;
      }
      if (type === "signout") { J.signOut(); go("/signin", true); return; }
      if (type === "search") {
        var q = new FormData(form).get("q").trim();
        go("/search?q=" + encodeURIComponent(q)); return;
      }
      if (!user) return;
      if (type === "job-filters" || type === "customer-filters" || type === "invoice-filters" || type === "user-filters") {
        var params = new URLSearchParams();
        new FormData(form).forEach(function (v, k) { if (v) params.set(k, v); });
        var base = type === "job-filters" ? "/jobs" : type === "customer-filters" ? "/customers" : type === "invoice-filters" ? "/invoices" : "/admin/users";
        go(base + (params.toString() ? "?" + params.toString() : ""));
        return;
      }
      if (type === "timeline-filters") {
        var tp = new URLSearchParams(); new FormData(form).forEach(function (v, k) { if (v) tp.set(k, v); });
        go("/insights/timeline?" + tp.toString()); return;
      }
      if (type === "workload-filters") {
        var wp = new FormData(form).get("week");
        go("/insights/workload?week=" + encodeURIComponent(wp)); return;
      }
      if (type === "financial-filters") {
        var fp = new FormData(form).get("days");
        go("/insights/financials?days=" + encodeURIComponent(fp)); return;
      }
      if (type === "job") {
        var jf = formDataObject(form);
        if (!jf.title.trim() || !jf.description.trim()) { toast("Add a title and description.", "error"); return; }
        if (!jf.customer_id) { toast("Choose a customer.", "error"); return; }
        var jobId = form.getAttribute("data-job");
        if (jobId) {
          var job = J.getJob(jobId);
          if (!job) { toast("Job not found.", "error"); return; }
          J.updateJob(user, job, jf); toast("Job saved.", "success"); go("/jobs/" + job.id);
        } else {
          var created = J.createJob(user, jf); toast("Draft job " + created.reference + " created.", "success"); go("/jobs/" + created.id);
        }
        return;
      }
      if (type === "assign") {
        var jobA = J.getJob(form.getAttribute("data-job"));
        if (!jobA) return;
        var fda = new FormData(form);
        var selected = fda.getAll("user");
        var lead = fda.get("lead");
        if (!selected.length) { toast("Choose at least one engineer.", "error"); return; }
        if (lead && selected.indexOf(lead) < 0) { toast("The lead must also be selected.", "error"); return; }
        if (!lead) lead = selected[0];
        var existing = J.activeAssignments(jobA.id);
        existing.forEach(function (a) { if (selected.indexOf(a.user_id) < 0) a.removed_at = J.nowISO(); });
        selected.forEach(function (uid) {
          var activeRow = existing.find(function (a) { return a.user_id === uid && !a.removed_at; });
          if (activeRow) { activeRow.is_lead = uid === lead; }
          else {
            var fresh = J.all("job_assignments").find(function (a) { return a.job_id === jobA.id && a.user_id === uid && a.removed_at; });
            if (fresh) { fresh.removed_at = null; fresh.is_lead = uid === lead; fresh.assigned_at = J.nowISO(); fresh.assigned_by = user.id; }
            else J.insert("job_assignments", { id: J.uid(), job_id: jobA.id, user_id: uid, is_lead: uid === lead, assigned_at: J.nowISO(), assigned_by: user.id, removed_at: null });
          }
        });
        J.addEvent(jobA.id, "ASSIGNMENT", null, null, "Engineers updated: " + selected.map(function (id) { return (J.getUser(id) || {}).display_name; }).join(", ") + ".", "CUSTOMER");
        J.audit("job.assign", "JOB", jobA.id, null, { users: selected, lead: lead });
        var promote = fda.get("promote") === "yes";
        if (promote && jobA.status === "DRAFT" && jobA.planned_start && jobA.planned_end) {
          jobA.status = "SCHEDULED"; jobA.updated_at = J.nowISO();
          J.addEvent(jobA.id, "STATUS_CHANGE", "DRAFT", "SCHEDULED", "Job scheduled with assigned engineers.", "CUSTOMER");
          J.audit("job.status.change", "JOB", jobA.id, { status: "DRAFT" }, { status: "SCHEDULED" });
          toast("Assignments saved and job scheduled.", "success");
        } else {
          if (promote && jobA.status === "DRAFT" && (!jobA.planned_start || !jobA.planned_end)) toast("Assignments saved. Set dates before scheduling.", "success");
          else toast("Assignments saved.", "success");
        }
        J.save(); go("/jobs/" + jobA.id); return;
      }
      if (type === "schedule") {
        var jobS = J.getJob(form.getAttribute("data-job"));
        if (!jobS) return;
        var fds = new FormData(form);
        var start = fromLocalInput(fds.get("planned_start"));
        var end = fromLocalInput(fds.get("planned_end"));
        if (!start || !end) { toast("Choose both planned dates.", "error"); return; }
        if (new Date(end) < new Date(start)) { toast("The planned end cannot be before the start.", "error"); return; }
        jobS.planned_start = start; jobS.planned_end = end; jobS.planned_slot = fds.get("planned_slot");
        var conflicts = [];
        J.assignedUsers(jobS.id).forEach(function (u) {
          J.all("jobs").forEach(function (other) {
            if (other.id === jobS.id || ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].indexOf(other.status) < 0 || !other.planned_start || !J.isAssigned(u, other.id)) return;
            if (new Date(other.planned_start) <= new Date(end) && new Date(other.planned_end || other.planned_start) >= new Date(start)) conflicts.push(u.display_name + " also has " + other.reference);
          });
        });
        var eventMessage = "Planned for " + J.fmtRange(start, end) + ".";
        if (conflicts.length) eventMessage += " Accepted conflict: " + conflicts.join("; ") + ".";
        J.addEvent(jobS.id, "SCHEDULE_CHANGE", null, null, eventMessage, "CUSTOMER");
        J.audit("job.schedule", "JOB", jobS.id, null, { planned_start: start, planned_end: end, conflicts: conflicts });
        if (fds.get("promote") === "yes" && jobS.status === "DRAFT" && J.activeAssignments(jobS.id).length) {
          jobS.status = "SCHEDULED";
          J.addEvent(jobS.id, "STATUS_CHANGE", "DRAFT", "SCHEDULED", "Job scheduled.", "CUSTOMER");
        }
        jobS.updated_at = J.nowISO(); J.save();
        if (conflicts.length) toast("Dates saved with a warning: " + conflicts[0] + (conflicts.length > 1 ? " and " + (conflicts.length - 1) + " more" : ""), "error");
        else toast("Dates saved.", "success");
        go("/jobs/" + jobS.id); return;
      }
      if (type === "job-note") {
        var jobN = J.getJob(form.getAttribute("data-job"));
        if (!jobN) return;
        var fdn = new FormData(form);
        var note = String(fdn.get("note") || "").trim();
        if (!note) { toast("Write a note first.", "error"); return; }
        J.addEvent(jobN.id, "NOTE", null, null, note, fdn.get("visibility"));
        J.audit("job.note", "JOB", jobN.id, null, { visibility: fdn.get("visibility") });
        J.save(); toast("Note added to the timeline.", "success"); renderRoute(); return;
      }
      if (type === "customer") {
        var cf = formDataObject(form);
        if (!cf.name.trim() || !cf.contact_name.trim() || !cf.email.trim()) { toast("Name, contact and email are required.", "error"); return; }
        if (J.userByEmail(cf.email) && !form.getAttribute("data-customer")) { toast("That email already has a login. Use a different email or open the existing customer.", "error"); return; }
        var custId = form.getAttribute("data-customer");
        if (custId) { J.updateCustomer(user, J.getCustomer(custId), cf); toast("Customer saved.", "success"); go("/customers/" + custId); }
        else { var cc = J.createCustomer(user, cf); toast("Customer created" + (cf.make_login ? " with a portal login" : "") + ".", "success"); go("/customers/" + cc.id); }
        return;
      }
      if (type === "invoice") {
        var fdi = new FormData(form);
        var jobId2 = fdi.get("job_id");
        var job2 = J.getJob(jobId2);
        if (!job2) { toast("Choose a job.", "error"); return; }
        if (J.liveInvoiceForJob(job2.id)) { toast("That job already has a live invoice.", "error"); return; }
        var descs = fdi.getAll("description"), qtys = fdi.getAll("qty"), units = fdi.getAll("unit");
        var lines = [];
        for (var i = 0; i < descs.length; i++) {
          var qty = Number(qtys[i]) || 0, unit = Math.round(Number(units[i]) * 100) || 0;
          if (!String(descs[i]).trim() || qty <= 0) continue;
          lines.push({ description: String(descs[i]).trim(), qty: qty, unit_pence: unit, amount_pence: Math.round(qty * unit) });
        }
        if (!lines.length) { toast("Add at least one complete invoice line.", "error"); return; }
        var inv = J.createInvoice(user, job2, lines);
        toast("Draft invoice " + inv.number + " created.", "success"); go("/invoices/" + inv.id); return;
      }
      if (type === "settings") {
        var fs = formDataObject(form);
        var company = J.company();
        company.name = fs.name.trim(); company.email = fs.email.trim(); company.phone = fs.phone.trim();
        company.address = { line1: fs.line1.trim(), line2: (fs.line2 || "").trim(), town: fs.town.trim(), postcode: fs.postcode.trim().toUpperCase(), country: "GB" };
        company.vat_number = fs.vat_number.trim();
        J.setSetting("company.vat_rate_bp", Math.round(Number(fs.vat_rate) * 100));
        J.setSetting("company.invoice_due_days", Number(fs.due_days));
        J.setSetting("company.default_theme", { mode: fs.default_theme });
        J.setSetting("company.pdf_footer", fs.pdf_footer.trim());
        J.audit("setting.update", "SETTING", null, null, { company: company.name, vat_rate: fs.vat_rate, due_days: fs.due_days });
        J.save(); applyTheme(currentTheme()); toast("Company settings saved.", "success"); renderRoute(); return;
      }
      if (type === "roles") {
        var changed = [];
        J.all("permissions").forEach(function (p) {
          var key = p.role_key + "|" + p.action_key;
          var input = form.querySelector('[name="' + key + '"]');
          if (!input || input.disabled) return;
          if (input.checked !== p.allowed) { changed.push({ role: p.role_key, action: p.action_key, before: p.allowed, after: input.checked }); p.allowed = input.checked; }
        });
        if (!changed.length) { toast("No permission changes.", "success"); return; }
        J.audit("permission.update", "PERMISSION", null, changed.map(function (c) { return c.role + "/" + c.action + "=" + c.before; }), changed.map(function (c) { return c.role + "/" + c.action + "=" + c.after; }));
        J.save(); toast(changed.length + " permission change" + (changed.length === 1 ? "" : "s") + " saved. Navigation updates now.", "success"); renderRoute(); return;
      }
      if (type === "user") {
        var fu = formDataObject(form);
        var userId = form.getAttribute("data-user");
        if (!fu.display_name.trim() || !fu.email.trim()) { toast("Name and email are required.", "error"); return; }
        if (fu.role_key === "CUSTOMER" && !fu.customer_id) { toast("Choose the customer record for a customer login.", "error"); return; }
        if (fu.role_key !== "CUSTOMER" && fu.customer_id) fu.customer_id = "";
        if (fu.role_key !== "ENGINEER" && fu.role_key !== "MANAGER") fu.can_engineer = false;
        if (fu.role_key === "ENGINEER") fu.can_engineer = true;
        if (userId) {
          var uu = J.getUser(userId);
          if (!uu) return;
          if (uu.role_key === "ADMIN" && fu.role_key !== "ADMIN") {
            var activeAdmins = J.all("users").filter(function (x) { return x.role_key === "ADMIN" && x.status === "ACTIVE"; });
            if (activeAdmins.length <= 1) { toast("At least one active admin must remain.", "error"); return; }
          }
          var other = J.userByEmail(fu.email);
          if (other && other.id !== uu.id) { toast("That email is already used by another user.", "error"); return; }
          uu.display_name = fu.display_name.trim(); uu.email = fu.email.toLowerCase().trim(); uu.phone = fu.phone.trim();
          uu.role_key = fu.role_key; uu.status = fu.status; uu.can_engineer = !!fu.can_engineer; uu.customer_id = fu.customer_id || null; uu.updated_at = J.nowISO();
          J.audit("user.update", "USER", uu.id, null, { role: uu.role_key, status: uu.status }); J.save();
          toast("User saved.", "success"); go("/admin/users/" + uu.id);
        } else {
          if (J.userByEmail(fu.email)) { toast("That email is already used by another user.", "error"); return; }
          var nu = { id: J.uid(), company_id: J.company().id, email: fu.email.toLowerCase().trim(), password: "JMS123", display_name: fu.display_name.trim(), role_key: fu.role_key, customer_id: fu.customer_id || null, can_engineer: !!fu.can_engineer, phone: fu.phone.trim(), status: fu.status || "ACTIVE", must_change_password: true, theme_prefs: null, last_login_at: null, created_at: J.nowISO(), updated_at: J.nowISO() };
          J.insert("users", nu); J.audit("user.create", "USER", nu.id, null, { email: nu.email, role: nu.role_key });
          toast("User created with password JMS123.", "success"); go("/admin/users/" + nu.id);
        }
        return;
      }
    } catch (err) {
      console.error(err);
      toast(err.message || "Something went wrong.", "error");
    }
  });

  function formDataObject(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) {
      if (out[k] !== undefined) { if (!Array.isArray(out[k])) out[k] = [out[k]]; out[k].push(v); }
      else out[k] = v;
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* router                                                              */
  /* ------------------------------------------------------------------ */
  function renderRoute() {
    var parts = routeParts();
    var user = J.currentUser();
    if (!user) {
      if (parts[0] !== "signin") { renderSignin(); return; }
      renderSignin(); return;
    }
    if (!parts.length || parts[0] === "signin") { go(landing(user), true); return; }
    applyTheme(currentTheme());
    try {
      if (parts[0] === "dashboard") return renderDashboard(user);
      if (parts[0] === "my-jobs") return renderMyJobs(user);
      if (parts[0] === "jobs") {
        if (parts[1] === "new") return renderJobForm(user, null, qs("customer"));
        if (parts[1] && parts[2] === "edit") return renderJobForm(user, parts[1]);
        if (parts[1] && parts[2] === "assign") return renderAssign(user, parts[1]);
        if (parts[1] && parts[2] === "schedule") return renderSchedule(user, parts[1]);
        if (parts[1]) return renderJobDetail(user, parts[1]);
        return renderJobs(user);
      }
      if (parts[0] === "customers") {
        if (parts[1] === "new") return renderCustomerForm(user, null);
        if (parts[1] && parts[2] === "edit") return renderCustomerForm(user, parts[1]);
        if (parts[1]) return renderCustomerDetail(user, parts[1]);
        return renderCustomers(user);
      }
      if (parts[0] === "invoices") {
        if (parts[1] === "new") return renderInvoiceNew(user);
        if (parts[1]) return renderInvoiceDetail(user, parts[1], false);
        return renderInvoices(user, false);
      }
      if (parts[0] === "portal" && parts[1] === "invoices") {
        if (parts[2]) return renderInvoiceDetail(user, parts[2], true);
        return renderInvoices(user, true);
      }
      if (parts[0] === "insights") {
        if (parts[1] === "timeline") return renderTimeline(user);
        if (parts[1] === "workload") return renderWorkload(user);
        if (parts[1] === "financials") return renderFinancials(user);
        if (parts[1] === "needs-invoicing") return renderNeedsInvoicing(user);
        return renderTimeline(user);
      }
      if (parts[0] === "admin") {
        if (parts[1] === "users") {
          if (parts[2] === "new") return renderUserForm(user, null);
          if (parts[2]) return renderUserForm(user, parts[2]);
          return renderUsers(user);
        }
        if (parts[1] === "roles") return renderRoles(user);
        if (parts[1] === "settings") return renderSettings(user);
        if (parts[1] === "audit") return renderAudit(user);
        if (parts[1] === "archive") return renderArchive(user);
        return renderUsers(user);
      }
      if (parts[0] === "search") return renderSearch(user);
      if (parts[0] === "account" && parts[1] === "appearance") return renderAppearance(user);
      if (parts[0] === "account" && parts[1] === "password") { toast("Password changes are simplified in this demo — use Admin → Users to reset a password.", "success"); return go(landing(user), true); }
      return renderNotFound(user, "Page");
    } catch (err) {
      console.error(err);
      shell(user, { title: "Something went wrong", eyebrow: "Error", intro: "The demo hit an unexpected problem. Your data is still in this browser.", body: '<section class="panel">' + emptyState("Unexpected error", err.message || "Reload the page to continue.", '<a class="btn btn-primary" href="#' + landing(user) + '">Back to my work</a>') + "</section>" });
    }
  }

  window.addEventListener("hashchange", function () {
    closeAA();
    renderRoute();
    var main = document.getElementById("main");
    if (main) main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", function () { if (currentTheme().mode === "system") applyTheme(currentTheme()); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    J.load();
    applyTheme(currentTheme());
    if (!location.hash) location.replace("#" + (J.currentUser() ? landing(J.currentUser()) : "/signin"));
    renderRoute();
  });
})();
