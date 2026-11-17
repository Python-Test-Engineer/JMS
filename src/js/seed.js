/* JMS Demo Lite — deterministic demo dataset.
   Browser-only: this replaces the Node seed script from _TECH.md §15.
   The reference shape is kept (2 admins, 2 managers, 8 engineers, 10 customers,
   26 jobs, 1–4 jobs per customer). Dates are relative to first load so the
   dashboard has meaningful "today" and "next week" data. */
(function () {
  "use strict";

  var ACTION_KEYS = [
    ["Customers", "customer.view.all"],
    ["Customers", "customer.view.own"],
    ["Customers", "customer.create"],
    ["Customers", "customer.edit"],
    ["Customers", "customer.invite"],
    ["Customers", "customer.archive"],
    ["Jobs", "job.view.all"],
    ["Jobs", "job.view.assigned"],
    ["Jobs", "job.view.own"],
    ["Jobs", "job.create"],
    ["Jobs", "job.edit"],
    ["Jobs", "job.assign"],
    ["Jobs", "job.schedule"],
    ["Jobs", "job.status.advance"],
    ["Jobs", "job.status.override"],
    ["Jobs", "job.note.add"],
    ["Jobs", "job.cancel"],
    ["Jobs", "job.archive"],
    ["Users", "user.view"],
    ["Users", "user.create"],
    ["Users", "user.edit.role"],
    ["Users", "user.reset.password"],
    ["Users", "user.deactivate"],
    ["Invoices", "invoice.view.all"],
    ["Invoices", "invoice.view.own"],
    ["Invoices", "invoice.create"],
    ["Invoices", "invoice.issue"],
    ["Invoices", "invoice.mark.paid"],
    ["Documents", "document.job.pdf"],
    ["Documents", "document.invoice.pdf"],
    ["Insights", "insight.operational"],
    ["Insights", "insight.financial"],
    ["Insights", "insight.workload"],
    ["Insights", "insight.timeline"],
    ["Admin", "admin.roles.manage"],
    ["Admin", "admin.permissions.edit"],
    ["Admin", "admin.settings.manage"],
    ["Admin", "admin.audit.view"],
    ["Admin", "admin.theme.default"]
  ];

  var DEFAULT_MATRIX = {
    "customer.view.all": ["ADMIN", "MANAGER"],
    "customer.view.own": ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"],
    "customer.create": ["ADMIN", "MANAGER"],
    "customer.edit": ["ADMIN", "MANAGER"],
    "customer.invite": ["ADMIN", "MANAGER"],
    "customer.archive": ["ADMIN"],
    "job.view.all": ["ADMIN", "MANAGER"],
    "job.view.assigned": ["ADMIN", "MANAGER", "ENGINEER"],
    "job.view.own": ["ADMIN", "MANAGER", "CUSTOMER"],
    "job.create": ["ADMIN", "MANAGER"],
    "job.edit": ["ADMIN", "MANAGER"],
    "job.assign": ["ADMIN", "MANAGER"],
    "job.schedule": ["ADMIN", "MANAGER"],
    "job.status.advance": ["ADMIN", "MANAGER", "ENGINEER"],
    "job.status.override": ["ADMIN", "MANAGER"],
    "job.note.add": ["ADMIN", "MANAGER", "ENGINEER"],
    "job.cancel": ["ADMIN", "MANAGER"],
    "job.archive": ["ADMIN"],
    "user.view": ["ADMIN"],
    "user.create": ["ADMIN"],
    "user.edit.role": ["ADMIN"],
    "user.reset.password": ["ADMIN", "MANAGER"],
    "user.deactivate": ["ADMIN"],
    "invoice.view.all": ["ADMIN", "MANAGER"],
    "invoice.view.own": ["ADMIN", "MANAGER", "CUSTOMER"],
    "invoice.create": ["ADMIN", "MANAGER"],
    "invoice.issue": ["ADMIN", "MANAGER"],
    "invoice.mark.paid": ["ADMIN", "MANAGER"],
    "document.job.pdf": ["ADMIN", "MANAGER", "ENGINEER", "CUSTOMER"],
    "document.invoice.pdf": ["ADMIN", "MANAGER", "CUSTOMER"],
    "insight.operational": ["ADMIN", "MANAGER"],
    "insight.financial": ["ADMIN", "MANAGER"],
    "insight.workload": ["ADMIN", "MANAGER"],
    "insight.timeline": ["ADMIN", "MANAGER", "ENGINEER"],
    "admin.roles.manage": ["ADMIN"],
    "admin.permissions.edit": ["ADMIN"],
    "admin.settings.manage": ["ADMIN"],
    "admin.audit.view": ["ADMIN"],
    "admin.theme.default": ["ADMIN"]
  };

  var ROLES = [
    { key: "ADMIN", label: "Admin", description: "Full access, users, permissions and settings.", is_system: true, sort_order: 1 },
    { key: "MANAGER", label: "Manager", description: "Runs customers, jobs, scheduling and invoices.", is_system: true, sort_order: 2 },
    { key: "ENGINEER", label: "Engineer", description: "Sees assigned jobs and updates field progress.", is_system: true, sort_order: 3 },
    { key: "CUSTOMER", label: "Customer", description: "Sees only their own jobs, updates and documents.", is_system: true, sort_order: 4 }
  ];

  var STAFF = [
    ["Alex Morgan", "admin@acme.example", "ADMIN", false, "07700 900001"],
    ["Priya Shah", "admin2@acme.example", "ADMIN", false, "07700 900002"],
    ["Morgan Lee", "manager@acme.example", "MANAGER", true, "07700 900003"],
    ["Rita Patel", "manager2@acme.example", "MANAGER", true, "07700 900004"],
    ["Dan Walker", "engineer1@acme.example", "ENGINEER", true, "07700 900005"],
    ["Sam Okafor", "engineer2@acme.example", "ENGINEER", true, "07700 900006"],
    ["Luis García", "engineer3@acme.example", "ENGINEER", true, "07700 900007"],
    ["Hannah Brooks", "engineer4@acme.example", "ENGINEER", true, "07700 900008"],
    ["Tomasz Nowak", "engineer5@acme.example", "ENGINEER", true, "07700 900009"],
    ["Aisha Khan", "engineer6@acme.example", "ENGINEER", true, "07700 900010"],
    ["Ben Carter", "engineer7@acme.example", "ENGINEER", true, "07700 900011"],
    ["Grace Miller", "engineer8@acme.example", "ENGINEER", true, "07700 900012"]
  ];

  var CUSTOMERS = [
    ["Meadow House Ltd", "Elaine Foster", "customer1@example.com", "0161 555 0101", "12 Meadow Lane", "Didsbury", "Manchester", "M20 2AB"],
    ["Northgate Dental", "Dr James Hill", "customer2@example.com", "0161 555 0102", "4 Northgate", "", "Stockport", "SK1 1AA"],
    ["Willow Court Management", "Susan Reed", "customer3@example.com", "0161 555 0103", "Willow Court, 88 Wilmslow Road", "", "Manchester", "M14 5TP"],
    ["Brookside School", "Mark Evans", "customer4@example.com", "0161 555 0104", "Brookside School, 2 Brook Street", "", "Altrincham", "WA14 1AA"],
    ["Harbour View Flats", "Nina Patel", "customer5@example.com", "0161 555 0105", "19 Harbour View", "", "Salford", "M50 3UB"],
    ["Orchard Barn", "Tom Whitfield", "customer6@example.com", "0161 555 0106", "Orchard Barn, Church Lane", "", "Wilmslow", "SK9 1AA"],
    ["Kingsway Hotel", "Chloe Adams", "customer7@example.com", "0161 555 0107", "120 Kingsway", "", "Manchester", "M19 2AA"],
    ["Fernhill Surgery", "Dr A. Rahman", "customer8@example.com", "0161 555 0108", "Fernhill Surgery, 7 Fern Road", "", "Stockport", "SK2 2BB"],
    ["Regent Street Offices", "Laura Green", "customer9@example.com", "0161 555 0109", "44 Regent Street", "", "Manchester", "M1 2AB"],
    ["Stonebridge Villa", "Peter Jones", "customer10@example.com", "0161 555 0110", "Stonebridge Villa, 3 Stonebridge Lane", "", "Cheshire", "SK8 3AA"]
  ];

  var JOB_COUNTS = [3, 4, 2, 1, 3, 4, 3, 2, 2, 2];
  var STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "INVOICED", "PAID", "CANCELLED"];
  var TITLES = {
    WINDOW_INSTALL: ["Replace casement windows", "Install bay window", "Fit French doors", "Replace bedroom windows", "Install sliding sash windows"],
    REPAIR: ["Repair failed sealed unit", "Replace broken hinge", "Fix draughty window", "Replace window handle and lock", "Repair conservatory roof glazing"],
    SURVEY: ["Site survey for window replacement", "Measure for conservatory glazing", "Survey for door replacement"]
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function iso(date) { return date ? new Date(date).toISOString() : null; }
  function addDays(base, days) { var d = new Date(base); d.setUTCDate(d.getUTCDate() + days); return d; }
  function withHour(base, hour) { var d = new Date(base); d.setUTCHours(hour, 0, 0, 0); return d; }
  function roundNow() { var d = new Date(); d.setUTCHours(8, 0, 0, 0); return d; }

  function create(now) {
    now = now || roundNow();
    var rng = mulberry32(20260316);
    var year = String(now.getUTCFullYear());
    var companyId = "co-acme";
    var createdAt = iso(addDays(now, -120));
    var staff = [];
    var customerUsers = [];
    var customers = [];
    var jobs = [];
    var assignments = [];
    var events = [];
    var invoices = [];
    var audit = [];
    var documents = [];
    var jobSeq = 0;
    var invoiceSeq = 0;

    STAFF.forEach(function (row, i) {
      staff.push({
        id: "usr-staff-" + (i + 1),
        company_id: companyId,
        email: row[1],
        password: "JMS123",
        display_name: row[0],
        role_key: row[2],
        customer_id: null,
        can_engineer: row[3],
        phone: row[4],
        status: "ACTIVE",
        must_change_password: false,
        theme_prefs: null,
        last_login_at: null,
        created_at: createdAt,
        updated_at: createdAt
      });
    });

    CUSTOMERS.forEach(function (row, i) {
      var id = "cus-" + (i + 1);
      var contact = row[1], email = row[2], phone = row[3];
      customers.push({
        id: id,
        company_id: companyId,
        name: row[0],
        contact_name: contact,
        email: email,
        phone: phone,
        address: { line1: row[4], line2: row[5], town: row[6], postcode: row[7], country: "GB" },
        notes: i % 3 === 0 ? "Key safe by the side gate. Please ring 15 minutes before arrival." : "",
        status: "ACTIVE",
        created_at: createdAt,
        created_by: "usr-staff-3",
        archived_at: null
      });
      customerUsers.push({
        id: "usr-cus-" + (i + 1),
        company_id: companyId,
        email: email,
        password: "JMS123",
        display_name: contact,
        role_key: "CUSTOMER",
        customer_id: id,
        can_engineer: false,
        phone: phone,
        status: "ACTIVE",
        must_change_password: false,
        theme_prefs: null,
        last_login_at: null,
        created_at: createdAt,
        updated_at: createdAt
      });
    });

    var pool = staff.filter(function (u) { return u.can_engineer; });
    var jobIndex = 0;

    CUSTOMERS.forEach(function (row, ci) {
      var customer = customers[ci];
      var count = JOB_COUNTS[ci];
      for (var n = 0; n < count; n++) {
        jobIndex++;
        var status;
        if (jobIndex <= 8) {
          status = STATUSES[jobIndex - 1];
        } else {
          var r = rng();
          status = r < 0.35 ? "SCHEDULED" : r < 0.60 ? "COMPLETED" : r < 0.75 ? "IN_PROGRESS" : r < 0.85 ? "PAID" : r < 0.95 ? "INVOICED" : "ON_HOLD";
        }
        var workType = rng() < 0.50 ? "WINDOW_INSTALL" : rng() < 0.70 ? "REPAIR" : "SURVEY";
        var title = pick(rng, TITLES[workType]);
        var priority = rng() < 0.15 ? "URGENT" : "NORMAL";
        var created = addDays(now, -Math.floor(20 + rng() * 70));
        var plannedStart = null, plannedEnd = null, slot = pick(rng, ["AM", "PM", "ALL_DAY"]);
        if (status === "SCHEDULED" || status === "IN_PROGRESS" || status === "ON_HOLD") {
          var offset = Math.floor(-7 + rng() * 28);
          plannedStart = withHour(addDays(now, offset), slot === "PM" ? 13 : 8);
          plannedEnd = addDays(plannedStart, rng() < 0.5 ? 0 : 1);
          plannedEnd = withHour(plannedEnd, 17);
        } else if (status !== "DRAFT") {
          var back = Math.floor(14 + rng() * 46);
          plannedStart = withHour(addDays(now, -back), slot === "PM" ? 13 : 8);
          plannedEnd = withHour(addDays(plannedStart, rng() < 0.5 ? 0 : 1), 17);
        }
        var actualStart = null, actualEnd = null;
        if (status === "IN_PROGRESS") actualStart = iso(addDays(plannedStart || now, 0));
        if (["COMPLETED", "INVOICED", "PAID"].indexOf(status) >= 0) {
          actualStart = iso(addDays(plannedStart || now, 0));
          actualEnd = iso(addDays(plannedEnd || now, 0));
        }
        var net = Math.floor((450 + rng() * 6050) * 100);
        var vatRate = 2000;
        var vat = Math.round(net * vatRate / 10000);
        var ref = "JOB-" + year + "-" + String(jobIndex).padStart(4, "0");
        var jobId = "job-" + jobIndex;
        var job = {
          id: jobId,
          company_id: companyId,
          reference: ref,
          customer_id: customer.id,
          title: title,
          description: workType === "REPAIR"
            ? "Attend and make good the reported fault at " + customer.name + ". Access via the main entrance."
            : workType === "SURVEY"
              ? "Carry out a detailed survey at " + customer.name + " and record measurements and access notes."
              : "Supply and install replacement glazing at " + customer.name + ". Make good and clear all waste on completion.",
          work_type: workType,
          status: status,
          priority: priority,
          site_address: Object.assign({}, customer.address),
          planned_start: iso(plannedStart),
          planned_end: iso(plannedEnd),
          planned_slot: slot,
          actual_start: actualStart,
          actual_end: actualEnd,
          price_net: net,
          vat_rate_bp: vatRate,
          price_gross: net + vat,
          internal_notes: rng() < 0.45 ? "Parking permit required. Check the key safe before leaving." : "",
          customer_notes: rng() < 0.55 ? "Our team will arrive in the morning. Please clear access to the windows." : "",
          created_by: "usr-staff-3",
          created_at: iso(created),
          updated_at: iso(created),
          archived_at: null
        };
        jobs.push(job);

        events.push({
          id: "evt-" + jobIndex + "-created", job_id: jobId, actor_user_id: "usr-staff-3",
          type: "CREATED", from_value: null, to_value: "DRAFT",
          message: "Job created for " + customer.name + ".",
          visibility: "CUSTOMER", at: iso(created)
        });
        if (status !== "DRAFT") {
          events.push({
            id: "evt-" + jobIndex + "-status", job_id: jobId, actor_user_id: "usr-staff-3",
            type: "STATUS_CHANGE", from_value: "DRAFT", to_value: status,
            message: "Status set to " + status + ".",
            visibility: status === "CANCELLED" ? "INTERNAL" : "CUSTOMER",
            at: iso(addDays(created, 1))
          });
        }
        if (status === "CANCELLED") {
          events.push({
            id: "evt-" + jobIndex + "-cancel", job_id: jobId, actor_user_id: "usr-staff-3",
            type: "STATUS_CHANGE", from_value: "SCHEDULED", to_value: "CANCELLED",
            message: "Cancelled: customer postponed the installation.",
            visibility: "INTERNAL", at: iso(addDays(created, 2))
          });
        }
        if (job.customer_notes) {
          events.push({
            id: "evt-" + jobIndex + "-note", job_id: jobId, actor_user_id: "usr-staff-3",
            type: "NOTE", from_value: null, to_value: null,
            message: job.customer_notes, visibility: "CUSTOMER", at: iso(addDays(created, 1))
          });
        }

        var assignCount = rng() < 0.55 ? 1 : 2;
        var used = {};
        for (var a = 0; a < assignCount; a++) {
          var idx = Math.floor(rng() * pool.length);
          while (used[idx]) idx = (idx + 1) % pool.length;
          used[idx] = true;
          var engineer = pool[idx];
          assignments.push({
            id: "asg-" + jobIndex + "-" + (a + 1), job_id: jobId, user_id: engineer.id,
            is_lead: a === 0, assigned_at: iso(addDays(created, 1)),
            assigned_by: "usr-staff-3", removed_at: null
          });
          events.push({
            id: "evt-" + jobIndex + "-asg-" + (a + 1), job_id: jobId, actor_user_id: "usr-staff-3",
            type: "ASSIGNMENT", from_value: null, to_value: engineer.display_name,
            message: engineer.display_name + " assigned" + (a === 0 ? " as lead." : "."),
            visibility: "CUSTOMER", at: iso(addDays(created, 1))
          });
        }

        if (status === "INVOICED" || status === "PAID") {
          invoiceSeq++;
          var issued = status === "PAID" ? addDays(now, -(15 + Math.floor(rng() * 30))) : addDays(now, -(1 + Math.floor(rng() * 10)));
          var paid = status === "PAID" ? addDays(issued, 1 + Math.floor(rng() * 10)) : null;
          invoices.push({
            id: "inv-" + invoiceSeq,
            company_id: companyId,
            number: "INV-" + year + "-" + String(invoiceSeq).padStart(4, "0"),
            job_id: jobId,
            status: status === "PAID" ? "PAID" : "ISSUED",
            issued_at: iso(issued),
            due_at: iso(addDays(issued, 14)),
            paid_at: paid ? iso(paid) : null,
            net: net, vat_rate_bp: vatRate, vat: vat, gross: net + vat,
            lines: [{ description: job.title, qty: 1, unit_pence: net, amount_pence: net }],
            notes: "Payment by bank transfer. Please quote the invoice number.",
            created_by: "usr-staff-3",
            created_at: iso(addDays(issued, -1)),
            voided_at: null, void_reason: null
          });
        }
      }
    });

    audit.push({
      id: "aud-seed", company_id: companyId, actor_user_id: null,
      action: "seed.create", entity_type: "SETTING", entity_id: null,
      before: null, after: { jobs: jobs.length, customers: customers.length, users: staff.length + customerUsers.length },
      at: iso(now), ip: "127.0.0.1", user_agent: "demo seed", request_id: "seed"
    });

    return {
      _meta: {
        schema_version: 1,
        seed_version: "demo-lite-1",
        created_at: iso(now),
        updated_at: iso(now),
        sequences: { job: {}, invoice: {} }
      },
      companies: [{
        id: companyId,
        name: "Acme Windows",
        trading_name: "Acme Windows",
        email: "hello@acme.example",
        phone: "0161 555 0000",
        address: { line1: "Unit 4, Acme Works", line2: "12 Trade Street", town: "Manchester", postcode: "M1 1AA", country: "GB" },
        vat_number: "GB 123 4567 89",
        logo_path: null,
        currency: "GBP",
        timezone: "Europe/London",
        default_theme: { mode: "system", fs_content: 20, fs_ui: 18 },
        invoice_due_days: 14,
        pdf_footer: "Acme Windows · Thank you for your business. Payment by bank transfer, quoting the invoice number.",
        created_at: createdAt
      }],
      roles: ROLES,
      permissions: (function () {
        var rows = [];
        ACTION_KEYS.forEach(function (pair) {
          ROLES.forEach(function (r) {
            rows.push({ role_key: r.key, action_key: pair[1], allowed: (DEFAULT_MATRIX[pair[1]] || []).indexOf(r.key) >= 0 });
          });
        });
        return rows;
      })(),
      users: staff.concat(customerUsers),
      customers: customers,
      jobs: jobs,
      job_assignments: assignments,
      job_events: events,
      invoices: invoices,
      documents: documents,
      settings: [
        { key: "company.vat_rate_bp", value: 2000, updated_at: iso(now), updated_by: "usr-staff-1" },
        { key: "company.invoice_due_days", value: 14, updated_at: iso(now), updated_by: "usr-staff-1" },
        { key: "company.default_theme", value: { mode: "system" }, updated_at: iso(now), updated_by: "usr-staff-1" },
        { key: "company.pdf_footer", value: "Acme Windows · Thank you for your business.", updated_at: iso(now), updated_by: "usr-staff-1" },
        { key: "security.password_min_length", value: 8, updated_at: iso(now), updated_by: "usr-staff-1" },
        { key: "security.session_idle_minutes", value: 60, updated_at: iso(now), updated_by: "usr-staff-1" }
      ],
      audit_log: audit
    };
  }

  window.JMS_SEED = {
    ACTION_KEYS: ACTION_KEYS,
    DEFAULT_MATRIX: DEFAULT_MATRIX,
    ROLES: ROLES,
    STATUSES: STATUSES,
    create: create
  };
})();
