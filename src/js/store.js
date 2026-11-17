/* JMS Demo Lite — browser data store.
   A deliberately small JSON store with table-like collections, persisted to
   localStorage. All app reads/writes go through this file so the demo keeps the
   same repository boundary described in _TECH.md §7. */
(function () {
  "use strict";

  var DB_KEY = "jms.demo.db.v1";
  var SESSION_KEY = "jms.demo.session.v1";
  var THEME_KEY = "jms.demo.theme.v1";

  var db = null;

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }
  function nowISO() { return new Date().toISOString(); }
  function load() {
    if (db) return db;
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Rebuild the demo dataset when the bundled seed shape changes, so
        // existing browser storage picks up new customers, jobs and paging data.
        if (parsed && parsed._meta && parsed._meta.seed_version === window.JMS_SEED.SEED_VERSION) {
          db = parsed;
          return db;
        }
      }
    } catch (e) { /* fall through to a fresh seed */ }
    db = window.JMS_SEED.create();
    persist();
    return db;
  }
  function persist() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { console.warn("JMS demo could not persist data", e); }
  }
  function save() { if (db) db._meta.updated_at = nowISO(); persist(); }
  function reset() {
    db = window.JMS_SEED.create();
    persist();
    localStorage.removeItem(SESSION_KEY);
  }
  function importData(json) {
    var parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.jobs) || !Array.isArray(parsed.users)) throw new Error("That file does not look like a JMS export.");
    db = parsed;
    save();
  }
  function exportData() { return JSON.stringify(load(), null, 2); }

  function all(table) { return load()[table] || []; }
  function get(table, id) { return all(table).find(function (r) { return r.id === id || r.key === id; }); }
  function findOne(table, fn) { return all(table).find(fn); }
  function table(name) { return load()[name]; }
  function insert(name, record) { load()[name].push(record); save(); return record; }
  function update(name, id, patch) {
    var row = get(name, id);
    if (!row) return null;
    Object.assign(row, typeof patch === "function" ? patch(row) : patch);
    save();
    return row;
  }

  function audit(action, entityType, entityId, before, after) {
    var user = currentUser();
    load().audit_log.push({
      id: uid(), company_id: company().id, actor_user_id: user ? user.id : null,
      action: action, entity_type: entityType, entity_id: entityId || null,
      before: before || null, after: after || null, at: nowISO(),
      ip: "browser", user_agent: navigator.userAgent.slice(0, 120), request_id: uid()
    });
    save();
  }

  function setting(key, fallback) {
    var row = all("settings").find(function (s) { return s.key === key; });
    return row ? row.value : fallback;
  }
  function setSetting(key, value) {
    var row = all("settings").find(function (s) { return s.key === key; });
    if (row) { row.value = value; row.updated_at = nowISO(); row.updated_by = (currentUser() || {}).id || null; }
    else all("settings").push({ key: key, value: value, updated_at: nowISO(), updated_by: (currentUser() || {}).id || null });
    save();
  }

  function company() { return all("companies")[0]; }
  function getUser(id) { return get("users", id); }
  function getCustomer(id) { return get("customers", id); }
  function getJob(id) { return get("jobs", id); }
  function getInvoice(id) { return get("invoices", id); }
  function userByEmail(email) { return findOne("users", function (u) { return u.email.toLowerCase() === String(email || "").toLowerCase().trim(); }); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }
  function setSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }
  function currentUser() {
    var s = getSession();
    if (!s || !s.userId) return null;
    var u = getUser(s.userId);
    if (!u || u.status !== "ACTIVE") return null;
    return u;
  }
  function signIn(email, password) {
    var user = userByEmail(email);
    if (!user || user.status !== "ACTIVE") return { ok: false, message: "We could not sign you in. Check the email and password." };
    if ((user.password || "") !== password) return { ok: false, message: "We could not sign you in. Check the email and password." };
    user.last_login_at = nowISO();
    setSession({ userId: user.id, createdAt: nowISO() });
    audit("auth.signin.success", "USER", user.id, null, { email: user.email });
    return { ok: true, user: user };
  }
  function signOut() {
    var u = currentUser();
    if (u) audit("auth.signout", "USER", u.id, null, null);
    setSession(null);
  }

  function can(user, key) {
    if (!user) return false;
    return all("permissions").some(function (p) { return p.role_key === user.role_key && p.action_key === key && p.allowed; });
  }
  function hasAnyAdmin(user) {
    return all("permissions").some(function (p) {
      return p.role_key === (user && user.role_key) && p.allowed && p.action_key.indexOf("admin.") === 0;
    });
  }
  function isFieldCapable(user) { return !!(user && user.can_engineer && user.status === "ACTIVE"); }
  function isStaff(user) { return !!user && user.role_key !== "CUSTOMER"; }
  function isManagerial(user) { return !!user && (user.role_key === "ADMIN" || user.role_key === "MANAGER"); }

  function activeAssignments(jobId) {
    return all("job_assignments").filter(function (a) { return a.job_id === jobId && !a.removed_at; });
  }
  function assignedUsers(jobId) {
    return activeAssignments(jobId).map(function (a) { return getUser(a.user_id); }).filter(Boolean);
  }
  function isAssigned(user, jobId) {
    return !!user && activeAssignments(jobId).some(function (a) { return a.user_id === user.id; });
  }
  function fieldUsers() {
    return all("users").filter(function (u) { return u.status === "ACTIVE" && u.can_engineer; })
      .sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
  }
  function recentCompletedFor(user) {
    var cutoff = Date.now() - 90 * 86400000;
    return all("jobs").filter(function (j) {
      return isAssigned(user, j.id) && j.status === "COMPLETED" && new Date(j.actual_end || j.planned_end || 0).getTime() > cutoff;
    });
  }
  function jobsForFieldUser(user) {
    if (!user) return [];
    var seen = {};
    var rows = all("jobs").filter(function (j) { return isAssigned(user, j.id); });
    rows.forEach(function (j) { seen[j.id] = true; });
    recentCompletedFor(user).forEach(function (j) { if (!seen[j.id]) rows.push(j); });
    return rows.filter(function (j) { return !j.archived_at; })
      .sort(function (a, b) { return String(a.planned_start || a.created_at).localeCompare(String(b.planned_start || b.created_at)); });
  }
  function jobsForCustomer(customerId) {
    return all("jobs").filter(function (j) { return j.customer_id === customerId && !j.archived_at; })
      .sort(function (a, b) { return String(b.planned_start || b.created_at).localeCompare(String(a.planned_start || a.created_at)); });
  }
  function visibleJob(user, job) {
    if (!user || !job) return false;
    if (user.role_key === "CUSTOMER") return job.customer_id === user.customer_id;
    if (can(user, "job.view.all")) return true;
    return isAssigned(user, job.id);
  }
  function visibleJobs(user) {
    if (!user) return [];
    if (user.role_key === "CUSTOMER") return jobsForCustomer(user.customer_id);
    if (can(user, "job.view.all")) return all("jobs").filter(function (j) { return !j.archived_at; });
    return jobsForFieldUser(user);
  }
  function visibleCustomer(user, customer) {
    if (!user || !customer) return false;
    if (user.role_key === "CUSTOMER") return customer.id === user.customer_id;
    if (can(user, "customer.view.all")) return true;
    if (can(user, "customer.view.own") && isFieldCapable(user)) {
      return all("jobs").some(function (j) { return j.customer_id === customer.id && isAssigned(user, j.id); });
    }
    return false;
  }

  var NEXT = {
    DRAFT: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
    ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
    COMPLETED: ["INVOICED", "IN_PROGRESS"],
    INVOICED: ["PAID", "COMPLETED"],
    PAID: [],
    CANCELLED: []
  };
  var FIELD_TRANSITIONS = ["SCHEDULED>IN_PROGRESS", "IN_PROGRESS>COMPLETED", "IN_PROGRESS>ON_HOLD", "ON_HOLD>IN_PROGRESS"];
  var INVOICE_CONTROLLED = ["INVOICED", "PAID"];

  function canTransition(user, job, to) {
    if (!job || !user) return { ok: false, message: "Job not found." };
    if (job.status === to) return { ok: false, message: "The job is already " + statusLabel(to) + "." };
    if ((NEXT[job.status] || []).indexOf(to) < 0) return { ok: false, message: "A job cannot move from " + statusLabel(job.status) + " to " + statusLabel(to) + "." };
    if (INVOICE_CONTROLLED.indexOf(to) >= 0) return { ok: false, message: "Invoiced and paid are set by the invoice, not the status control." };
    if (job.status === "INVOICED" && to === "COMPLETED") return { ok: false, message: "Void the invoice to return the job to Completed." };
    var override = can(user, "job.status.override");
    var fieldUser = isFieldCapable(user) && isAssigned(user, job.id);
    var fieldAllowed = fieldUser && FIELD_TRANSITIONS.indexOf(job.status + ">" + to) >= 0;
    if (!override && !fieldAllowed) return { ok: false, message: "Your role cannot make that change. Ask a manager." };
    if (job.status === "DRAFT" && to === "SCHEDULED") {
      if (!job.planned_start || !job.planned_end) return { ok: false, message: "Set the planned dates before scheduling the job." };
      if (!activeAssignments(job.id).length) return { ok: false, message: "Assign at least one engineer before scheduling the job." };
    }
    return { ok: true };
  }
  function transitionOptions(user, job) {
    return (NEXT[job.status] || []).filter(function (to) { return to !== "INVOICED" && to !== "PAID" && canTransition(user, job, to).ok; })
      .map(function (to) {
        var label = transitionLabel(to);
        if (job.status === "COMPLETED" && to === "IN_PROGRESS") label = "Reopen job";
        if (job.status === "SCHEDULED" && to === "IN_PROGRESS") label = "Start job";
        if (job.status === "ON_HOLD" && to === "IN_PROGRESS") label = "Resume job";
        return { status: to, label: label };
      });
  }
  function transitionJob(user, job, to, note) {
    var check = canTransition(user, job, to);
    if (!check.ok) return check;
    var from = job.status;
    job.status = to;
    job.updated_at = nowISO();
    if (to === "IN_PROGRESS" && !job.actual_start) job.actual_start = nowISO();
    if (to === "COMPLETED") job.actual_end = job.actual_end || nowISO();
    addEvent(job.id, "STATUS_CHANGE", from, to, note || ("Status changed from " + statusLabel(from) + " to " + statusLabel(to) + "."), "CUSTOMER");
    audit("job.status.change", "JOB", job.id, { status: from }, { status: to, note: note || null });
    save();
    return { ok: true, job: job };
  }
  function addEvent(jobId, type, from, to, message, visibility) {
    var user = currentUser();
    var ev = {
      id: uid(), job_id: jobId, actor_user_id: user ? user.id : null, type: type,
      from_value: from || null, to_value: to || null, message: message || "",
      visibility: visibility || "INTERNAL", at: nowISO()
    };
    load().job_events.push(ev); save();
    return ev;
  }

  function statusLabel(status) {
    return ({ DRAFT: "Draft", SCHEDULED: "Scheduled", IN_PROGRESS: "In progress", ON_HOLD: "On hold", COMPLETED: "Completed", INVOICED: "Invoiced", PAID: "Paid", CANCELLED: "Cancelled" })[status] || status;
  }
  function transitionLabel(to) {
    return ({ SCHEDULED: "Schedule job", IN_PROGRESS: "Start job", COMPLETED: "Complete job", ON_HOLD: "Put on hold", CANCELLED: "Cancel job", DRAFT: "Return to draft" })[to] || statusLabel(to);
  }

  function nextJobReference() {
    var year = String(new Date().getFullYear());
    var seq = all("jobs").filter(function (j) { return j.reference.indexOf("JOB-" + year + "-") === 0; }).length + 1;
    return "JOB-" + year + "-" + String(seq).padStart(4, "0");
  }
  function nextInvoiceNumber() {
    var year = String(new Date().getFullYear());
    var seq = all("invoices").filter(function (i) { return i.number.indexOf("INV-" + year + "-") === 0; }).length + 1;
    return "INV-" + year + "-" + String(seq).padStart(4, "0");
  }

  function createJob(user, form) {
    var customer = getCustomer(form.customer_id);
    if (!customer) throw new Error("Choose a customer.");
    var net = form.price_net === "" || form.price_net == null ? null : Math.round(Number(form.price_net) * 100);
    var vatRate = Number(setting("company.vat_rate_bp", 2000));
    var job = {
      id: uid(), company_id: company().id, reference: nextJobReference(), customer_id: customer.id,
      title: form.title.trim(), description: form.description.trim(), work_type: form.work_type,
      status: "DRAFT", priority: form.priority || "NORMAL",
      site_address: {
        line1: (form.site_line1 || "").trim() || customer.address.line1,
        line2: (form.site_line2 || "").trim() || customer.address.line2 || "",
        town: (form.site_town || "").trim() || customer.address.town,
        postcode: ((form.site_postcode || "").trim() || customer.address.postcode).toUpperCase(),
        country: "GB"
      },
      planned_start: null, planned_end: null, planned_slot: form.planned_slot || "ALL_DAY",
      actual_start: null, actual_end: null,
      price_net: net, vat_rate_bp: vatRate, price_gross: net == null ? null : net + Math.round(net * vatRate / 10000),
      internal_notes: (form.internal_notes || "").trim(), customer_notes: (form.customer_notes || "").trim(),
      created_by: user.id, created_at: nowISO(), updated_at: nowISO(), archived_at: null
    };
    insert("jobs", job);
    addEvent(job.id, "CREATED", null, "DRAFT", "Job created for " + customer.name + ".", "CUSTOMER");
    audit("job.create", "JOB", job.id, null, { reference: job.reference, customer_id: customer.id });
    return job;
  }
  function updateJob(user, job, form) {
    var before = clone(job);
    job.title = form.title.trim();
    job.description = form.description.trim();
    job.work_type = form.work_type;
    job.priority = form.priority;
    job.site_address = {
      line1: form.site_line1.trim(), line2: (form.site_line2 || "").trim(),
      town: form.site_town.trim(), postcode: form.site_postcode.trim().toUpperCase(), country: "GB"
    };
    if (form.price_net !== "" && form.price_net != null) {
      var net = Math.round(Number(form.price_net) * 100);
      if (net !== job.price_net) {
        job.price_net = net;
        job.price_gross = net + Math.round(net * job.vat_rate_bp / 10000);
        addEvent(job.id, "PRICE_CHANGE", String(before.price_net), String(job.price_net), "Job price updated.", "INTERNAL");
      }
    }
    job.internal_notes = (form.internal_notes || "").trim();
    job.customer_notes = (form.customer_notes || "").trim();
    job.updated_at = nowISO();
    audit("job.update", "JOB", job.id, { title: before.title, status: before.status }, { title: job.title, status: job.status });
    save();
    return job;
  }
  function createCustomer(user, form) {
    var customer = {
      id: uid(), company_id: company().id, name: form.name.trim(), contact_name: form.contact_name.trim(),
      email: form.email.toLowerCase().trim(), phone: form.phone.trim(),
      address: {
        line1: form.line1.trim(), line2: (form.line2 || "").trim(), town: form.town.trim(),
        postcode: form.postcode.trim().toUpperCase(), country: "GB"
      },
      notes: (form.notes || "").trim(), status: "ACTIVE", created_at: nowISO(), created_by: user.id, archived_at: null
    };
    insert("customers", customer);
    if (form.make_login === "yes") {
      if (userByEmail(customer.email)) throw new Error("That email is already used by another login.");
      insert("users", {
        id: uid(), company_id: company().id, email: customer.email, password: "JMS123",
        display_name: customer.contact_name, role_key: "CUSTOMER", customer_id: customer.id,
        can_engineer: false, phone: customer.phone, status: "ACTIVE", must_change_password: false,
        theme_prefs: null, last_login_at: null, created_at: nowISO(), updated_at: nowISO()
      });
    }
    audit("customer.create", "CUSTOMER", customer.id, null, { name: customer.name, login: form.make_login === "yes" });
    return customer;
  }
  function updateCustomer(user, customer, form) {
    var before = clone(customer);
    customer.name = form.name.trim();
    customer.contact_name = form.contact_name.trim();
    customer.email = form.email.toLowerCase().trim();
    customer.phone = form.phone.trim();
    customer.address = { line1: form.line1.trim(), line2: (form.line2 || "").trim(), town: form.town.trim(), postcode: form.postcode.trim().toUpperCase(), country: "GB" };
    customer.notes = (form.notes || "").trim();
    audit("customer.update", "CUSTOMER", customer.id, { name: before.name }, { name: customer.name });
    save();
    return customer;
  }
  function createInvoice(user, job, lines) {
    var net = lines.reduce(function (s, l) { return s + l.amount_pence; }, 0);
    var vatRate = Number(setting("company.vat_rate_bp", 2000));
    var vat = Math.round(net * vatRate / 10000);
    var inv = {
      id: uid(), company_id: company().id, number: nextInvoiceNumber(), job_id: job.id,
      status: "DRAFT", issued_at: null, due_at: null, paid_at: null,
      net: net, vat_rate_bp: vatRate, vat: vat, gross: net + vat,
      lines: lines, notes: "Payment by bank transfer. Please quote the invoice number.",
      created_by: user.id, created_at: nowISO(), voided_at: null, void_reason: null
    };
    insert("invoices", inv);
    addEvent(job.id, "DOCUMENT", null, inv.number, "Invoice " + inv.number + " created as a draft.", "INTERNAL");
    audit("invoice.create", "INVOICE", inv.id, null, { number: inv.number, job_id: job.id, net: net });
    return inv;
  }
  function issueInvoice(user, inv) {
    if (inv.status !== "DRAFT") return { ok: false, message: "Only a draft invoice can be issued." };
    var due = new Date(); due.setDate(due.getDate() + Number(setting("company.invoice_due_days", 14)));
    inv.status = "ISSUED"; inv.issued_at = nowISO(); inv.due_at = due.toISOString();
    var job = getJob(inv.job_id);
    if (job) { job.status = "INVOICED"; job.updated_at = nowISO(); addEvent(job.id, "STATUS_CHANGE", "COMPLETED", "INVOICED", "Invoice " + inv.number + " issued.", "CUSTOMER"); }
    audit("invoice.issue", "INVOICE", inv.id, { status: "DRAFT" }, { status: "ISSUED", number: inv.number });
    save();
    return { ok: true };
  }
  function markInvoicePaid(user, inv) {
    if (inv.status !== "ISSUED") return { ok: false, message: "Only an issued invoice can be marked paid." };
    inv.status = "PAID"; inv.paid_at = nowISO();
    var job = getJob(inv.job_id);
    if (job) { job.status = "PAID"; job.updated_at = nowISO(); addEvent(job.id, "STATUS_CHANGE", "INVOICED", "PAID", "Invoice " + inv.number + " marked paid.", "CUSTOMER"); }
    audit("invoice.paid", "INVOICE", inv.id, { status: "ISSUED" }, { status: "PAID" });
    save();
    return { ok: true };
  }
  function voidInvoice(user, inv, reason) {
    if (inv.status === "VOID" || inv.status === "PAID") return { ok: false, message: "This invoice cannot be voided." };
    inv.status = "VOID"; inv.voided_at = nowISO(); inv.void_reason = reason || "Voided by manager";
    var job = getJob(inv.job_id);
    if (job) { job.status = "COMPLETED"; job.updated_at = nowISO(); addEvent(job.id, "STATUS_CHANGE", "INVOICED", "COMPLETED", "Invoice " + inv.number + " voided: " + inv.void_reason, "CUSTOMER"); }
    audit("invoice.void", "INVOICE", inv.id, { status: inv.status }, { status: "VOID", reason: inv.void_reason });
    save();
    return { ok: true };
  }
  function liveInvoiceForJob(jobId) {
    return all("invoices").find(function (i) { return i.job_id === jobId && i.status !== "VOID"; });
  }

  function fmtMoney(pence) {
    if (pence == null) return "—";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
  }
  function parseMoney(str) {
    var n = parseFloat(String(str).replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  function fmtDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
  }
  function fmtDateShort(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }
  function fmtDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  function fmtTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  function fmtRange(a, b) {
    if (!a && !b) return "Not scheduled";
    if (!b || String(a).slice(0, 10) === String(b).slice(0, 10)) return fmtDate(a);
    return fmtDate(a) + " → " + fmtDate(b);
  }
  function isoDay(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  function startOfDay(d) { var x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function isToday(value) { return !!value && isoDay(value) === isoDay(new Date()); }
  function isThisWeek(value) {
    if (!value) return false;
    var d = startOfDay(value).getTime();
    return d >= startOfDay().getTime() && d < addDays(startOfDay(), 7).getTime();
  }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function fullName(user) { return user ? user.display_name : "—"; }
  function customerName(id) { var c = getCustomer(id); return c ? c.name : "—"; }
  function statusClass(status) { return "status-" + String(status).toLowerCase().replace(/_/g, "-"); }

  function saveTheme(theme) {
    var user = currentUser();
    if (user) {
      user.theme_prefs = theme;
      user.updated_at = nowISO();
      save();
    } else {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    }
  }
  function savedTheme() {
    var u = currentUser();
    return (u && u.theme_prefs) || null;
  }

  window.JMS = {
    load: load, save: save, reset: reset, all: all, get: get, findOne: findOne, table: table,
    insert: insert, update: update, audit: audit, uid: uid, nowISO: nowISO, clone: clone,
    setting: setting, setSetting: setSetting, company: company,
    getUser: getUser, getCustomer: getCustomer, getJob: getJob, getInvoice: getInvoice, userByEmail: userByEmail,
    getSession: getSession, currentUser: currentUser, signIn: signIn, signOut: signOut,
    can: can, hasAnyAdmin: hasAnyAdmin, isFieldCapable: isFieldCapable, isStaff: isStaff, isManagerial: isManagerial,
    activeAssignments: activeAssignments, assignedUsers: assignedUsers, isAssigned: isAssigned,
    fieldUsers: fieldUsers, jobsForFieldUser: jobsForFieldUser, jobsForCustomer: jobsForCustomer,
    visibleJobs: visibleJobs, visibleJob: visibleJob, visibleCustomer: visibleCustomer,
    canTransition: canTransition, transitionOptions: transitionOptions, transitionJob: transitionJob,
    addEvent: addEvent, statusLabel: statusLabel, transitionLabel: transitionLabel,
    nextJobReference: nextJobReference, nextInvoiceNumber: nextInvoiceNumber,
    createJob: createJob, updateJob: updateJob, createCustomer: createCustomer, updateCustomer: updateCustomer,
    createInvoice: createInvoice, issueInvoice: issueInvoice, markInvoicePaid: markInvoicePaid,
    voidInvoice: voidInvoice, liveInvoiceForJob: liveInvoiceForJob,
    fmtMoney: fmtMoney, parseMoney: parseMoney, fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    fmtDateTime: fmtDateTime, fmtTime: fmtTime, fmtRange: fmtRange, isoDay: isoDay,
    startOfDay: startOfDay, addDays: addDays, isToday: isToday, isThisWeek: isThisWeek,
    daysBetween: daysBetween, fullName: fullName, customerName: customerName, statusClass: statusClass,
    saveTheme: saveTheme, savedTheme: savedTheme, exportData: exportData, importData: importData,
    DB_KEY: DB_KEY, SESSION_KEY: SESSION_KEY, THEME_KEY: THEME_KEY
  };
})();
