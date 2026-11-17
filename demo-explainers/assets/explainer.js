/* JMS workflow explainers — shell, page composition and animation player.
   Data lives in stories.js. No build step, no dependencies. */
(function () {
  "use strict";

  var D = window.JMS_DEMO;
  if (!D) return;

  var pageId = document.body.getAttribute("data-page") || "overview";
  var workflow = D.workflows.filter(function (w) { return w.id === pageId; })[0] || D.workflows[0];
  var isOverview = workflow.id === "overview";

  var USERS = {
    ADMIN: { name: "Alex Morgan", role: "Admin", initials: "AM" },
    MANAGER: { name: "Morgan Lee", role: "Manager", initials: "ML" },
    ENGINEER: { name: "Dan Walker", role: "Engineer", initials: "DW" },
    CUSTOMER: { name: "Elaine Foster", role: "Customer", initials: "EF" }
  };

  var NAV = {
    MANAGER: [
      ["Work", ["Operations dashboard", "All jobs", "New job", "Customers", "New customer"]],
      ["Money", ["Invoices", "Needs invoicing"]],
      ["Insights", ["Timeline", "Workload", "Financials"]]
    ],
    ADMIN: [
      ["Work", ["Operations dashboard", "All jobs", "New job", "Customers", "New customer"]],
      ["Money", ["Invoices", "Needs invoicing"]],
      ["Insights", ["Timeline", "Workload", "Financials"]],
      ["Admin", ["Users", "Roles & permissions", "Company settings", "Audit log"]]
    ],
    ENGINEER: [
      ["Work", ["My jobs", "Timeline"]],
      ["Account", ["Appearance"]]
    ],
    CUSTOMER: [
      ["My work", ["My jobs", "My invoices"]],
      ["Account", ["Appearance"]]
    ]
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function brandHeader() {
    return '<header class="topbar">' +
      '<button class="menu-btn" id="menu-btn" aria-label="Open workflow contents" aria-expanded="false">☰</button>' +
      '<a class="brand" href="index.html"><span class="brand-mark">J</span><span class="brand-text">JMS explainers<em>Acme Windows · Job Management</em></span></a>' +
      '<div class="top-actions"><span class="top-note">Animated workflow guides for business owners</span>' +
      '<a class="top-link" href="../src/index.html">See the live demo →</a></div></header>';
  }

  function toc() {
    var groups = [];
    D.workflows.forEach(function (w) {
      var g = groups.filter(function (x) { return x.label === w.group; })[0];
      if (!g) { g = { label: w.group, items: [] }; groups.push(g); }
      g.items.push(w);
    });
    var body = groups.map(function (g) {
      return '<div class="toc-group"><div class="toc-label">' + esc(g.label) + "</div>" +
        g.items.map(function (w) {
          var active = w.id === pageId;
          return '<a class="toc-pill' + (active ? " is-active" : "") + '" href="' + w.file + '"' + (active ? ' aria-current="page"' : "") + '><span class="n">' + w.n + "</span><span>" + esc(w.nav) + "</span></a>";
        }).join("") + "</div>";
    }).join("");
    return '<aside class="toc" id="site-toc"><div class="toc-head"><div class="eyebrow">JMS · Workflow guide</div><h2>How the app saves you time</h2><p>Watch each workflow, then read what it saves.</p></div>' +
      body + '<div class="toc-foot">Play, pause, step or change speed on any animation. Every page is a real JMS workflow.</div></aside>';
  }

  function footer() {
    return '<footer class="footer"><span><strong>JMS</strong> · Acme Windows job management system</span><span>Built from <a href="../_PLAN.md">_PLAN.md</a> · <a href="../src/index.html">Open the live demo</a></span></footer>';
  }

  /* ------------------------------------------------------------------ */
  /* page composition                                                    */
  /* ------------------------------------------------------------------ */
  function hero() {
    return '<section class="demo-hero"><div class="demo-hero-copy"><div class="eyebrow">' + esc(workflow.hero.eyebrow) + "</div><h1>" + esc(workflow.hero.title) + "</h1><p class=\"lead\">" + esc(workflow.hero.lead) + "</p></div>" +
      '<div class="demo-hero-actions"><button class="hero-more" data-open-insights>What it saves <span aria-hidden="true">→</span></button></div></section>';
  }

  function savings() {
    return '<div class="section-title"><h2>What it saves you</h2><p>Time and money, in plain numbers.</p></div><div class="benefit-grid">' +
      workflow.saves.map(function (s) {
        return '<article class="benefit"><span class="icon">' + s.icon + '</span><span class="value">' + esc(s.value) + '</span><span class="label">' + esc(s.label) + '</span><p>' + esc(s.note) + "</p></article>";
      }).join("") + "</div>";
  }

  function steps() {
    return '<div class="section-title"><h2>In the real app</h2><p>Four steps, one obvious action at a time.</p></div><ol class="real-steps">' +
      workflow.steps.map(function (s) {
        return "<li><div><strong>" + esc(s[0]) + "</strong><span>" + esc(s[1]) + "</span></div></li>";
      }).join("") + "</ol>" +
      '<div class="flow-note"><span>💡</span><div><b>Why this matters:</b> ' + esc(workflow.hero.lead) + "</div></div>";
  }

  function pager() {
    var list = D.workflows.filter(function (w) { return w.id !== "overview"; });
    var i = list.map(function (w) { return w.id; }).indexOf(workflow.id);
    var prev = i <= 0 ? D.workflows[0] : list[i - 1];
    var next = i < 0 || i === list.length - 1 ? D.workflows[0] : list[i + 1];
    var prevLabel = prev.id === "overview" ? "Back to the overview" : prev.n + " · " + prev.nav;
    var nextLabel = next.id === "overview" ? "Back to the overview" : next.n + " · " + next.nav;
    return '<nav class="pager" aria-label="Workflow pages"><a href="' + prev.file + '"><span class="dir">← Previous</span><strong>' + esc(prevLabel) + "</strong></a>" +
      '<a class="next" href="' + next.file + '"><span class="dir">Next →</span><strong>' + esc(nextLabel) + "</strong></a></nav>";
  }

  function indexPath() {
    var stats = [
      ["6 hrs", "admin saved every week"],
      ["9 days", "faster from job to cash"],
      ["0", "documents retyped"],
      ["1", "place for the whole job"]
    ];
    return '<section class="hero overview-hero"><div class="eyebrow">JMS · The whole job in one place</div>' +
      "<h1>Less admin. Fewer phone calls. Money in the bank sooner.</h1>" +
      '<p class="lead">Customers, jobs, engineers, dates, invoices and documents live in one record — so nobody retypes the job, the engineers update from site and the owner can see the week and the money.</p>' +
      '<div class="hero-chips"><span class="hero-chip"><span class="dot"></span><b>No spreadsheets</b></span><span class="hero-chip"><span class="dot"></span><b>No paper invoices</b></span><span class="hero-chip"><span class="dot"></span><b>No “where is my fitter?”</b></span></div></section>' +
      '<div class="overview-stats">' + stats.map(function (s) { return '<div class="stat"><strong>' + s[0] + "</strong><span>" + s[1] + "</span></div>"; }).join("") + "</div>" +
      '<div id="story-host" class="stage-host"></div>' +
      '<div class="section-title" id="workflows"><h2>Ten workflows, one story</h2><p>Pick any card to watch it animated.</p></div>' +
      '<div class="workflow-grid">' + D.workflows.filter(function (w) { return w.id !== "overview"; }).map(function (w) {
        return '<a class="workflow-card" href="' + w.file + '"><div class="top"><span class="n">' + w.n + '</span><span class="arrow">→</span></div><h3>' + esc(w.nav) + "</h3><p>" + esc(w.pitch) + '</p><span class="save">✨ ' + esc(w.save) + "</span></a>";
      }).join("") + "</div>" +
      '<div class="section-title"><h2>Who sees what</h2><p>Every role gets a shorter, safer app.</p></div>' +
      '<div class="roles">' + [
        ["Admin", "Full access, permissions and company settings."],
        ["Manager", "Customers, jobs, scheduling, invoices and insight."],
        ["Engineer", "Only assigned jobs; updates status from site."],
        ["Customer", "Only their own jobs, dates and documents."]
      ].map(function (r) {
        return '<article class="role-card"><span class="tag">Role</span><h3>' + esc(r[0]) + "</h3><p>" + esc(r[1]) + "</p></article>";
      }).join("") + "</div>" +
      '<div class="cta"><div><h2>See it with real demo data</h2><p>The JMS Demo Lite runs entirely in the browser. Sign in as an admin, manager, engineer or customer and click through the seeded jobs.</p></div><a href="../src/index.html">Open the demo →</a></div>' +
      footer();
  }

  function insightsDrawer() {
    return '<div class="drawer-scrim" data-close-insights hidden></div>' +
      '<aside class="insight-drawer" id="insight-drawer" aria-label="What this workflow saves" aria-hidden="true">' +
      '<div class="drawer-head"><div><div class="eyebrow">Why it matters</div><h2>What it saves you</h2><p>Then the same flow in the real app.</p></div><button class="drawer-close" data-close-insights aria-label="Close">×</button></div>' +
      '<div class="drawer-body">' + savings() + steps() + pager() + '<p class="drawer-foot">Use the left-hand contents to open the next workflow, or <a href="../src/index.html">try the live demo →</a></p></div></aside>';
  }

  function workflowPath() {
    return hero() + '<div id="story-host" class="stage-host"></div>' + insightsDrawer();
  }

  /* ------------------------------------------------------------------ */
  /* story player                                                        */
  /* ------------------------------------------------------------------ */
  function mountStory(host, key) {
    var story = D.stories[key];
    if (!story) return;

    var scenes = story.scenes;
    var total = scenes.length;

    host.innerHTML = '<section class="stage-card" id="stage-card" tabindex="0" aria-label="Animated walkthrough">' +
      '<div class="stage-top"><div><div class="eyebrow">Animated walkthrough</div><h2>' + esc(story.title) + '</h2><p class="stage-sub">' + esc(story.sub) + "</p></div>" +
      '<span class="stage-badge" id="stage-badge">Step 1 of ' + total + "</span></div>" +
      '<div class="demo-frame" id="demo-frame"><div class="frame-bar"><span class="frame-dots"><span></span><span></span><span></span></span><span class="frame-url" id="frame-url">jms.acme.example</span></div>' +
      '<div class="frame-app" id="frame-app"></div>' +
      '<div class="demo-cursor" id="demo-cursor" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L18 10 L11 11.5 L8.5 18 Z" fill="#fffdfa" stroke="#1f1e1d" stroke-width="1.4" stroke-linejoin="round"/></svg></div></div>' +
      '<div class="scene-caption" aria-live="polite"><span class="caption-num" id="caption-num">01</span><div class="caption-main"><div class="caption-step" id="caption-step"></div><p class="caption-text" id="caption-text"></p></div><div class="caption-tip"><b>Why it helps</b><span id="caption-tip"></span></div></div>' +
      '<div class="controls"><button class="ctl ctl-primary" id="play-btn" aria-label="Pause animation">Pause</button>' +
      '<button class="ctl ctl-icon" id="prev-btn" aria-label="Previous step" title="Previous step">←</button>' +
      '<button class="ctl ctl-icon" id="next-btn" aria-label="Next step" title="Next step">→</button>' +
      '<button class="ctl" id="restart-btn" aria-label="Replay from the beginning" title="Replay">↺ Replay</button>' +
      '<div class="speeds" role="group" aria-label="Playback speed"><span class="lbl">Speed</span>' +
      '<button class="speed-btn" data-speed="0.75">0.75×</button><button class="speed-btn is-active" data-speed="1">1×</button><button class="speed-btn" data-speed="1.5">1.5×</button><button class="speed-btn" data-speed="2">2×</button></div></div>' +
      '<div class="dots" id="scene-dots" role="group" aria-label="Jump to step"></div>' +
      '<div class="progress"><div class="progress-fill" id="progress-fill"></div></div></section>';

    var stage = host.querySelector("#stage-card");
    var frame = host.querySelector("#demo-frame");
    var frameApp = host.querySelector("#frame-app");
    var urlEl = host.querySelector("#frame-url");
    var badge = host.querySelector("#stage-badge");
    var capNum = host.querySelector("#caption-num");
    var capStep = host.querySelector("#caption-step");
    var capText = host.querySelector("#caption-text");
    var capTip = host.querySelector("#caption-tip");
    var playBtn = host.querySelector("#play-btn");
    var prevBtn = host.querySelector("#prev-btn");
    var nextBtn = host.querySelector("#next-btn");
    var restartBtn = host.querySelector("#restart-btn");
    var dotsEl = host.querySelector("#scene-dots");
    var fill = host.querySelector("#progress-fill");
    var cursor = host.querySelector("#demo-cursor");

    var startAt = 0;
    try {
      var requested = Number(new URLSearchParams(window.location.search).get("step"));
      if (requested >= 1 && requested <= total) startAt = requested - 1;
    } catch (e) { startAt = 0; }
    var idx = startAt;
    var playing = true;
    var speed = 1;
    var clock = 0;
    var autoEnd = 0;
    var queue = [];
    var lastScheduled = 0;
    var raf = null;
    var lastFrameTime = performance.now();
    var hasStarted = false;
    var stageHover = false;

    frameApp.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (a) e.preventDefault();
    });

    dotsEl.innerHTML = scenes.map(function (s, i) {
      return '<button class="dot-btn" data-go="' + i + '" aria-label="Step ' + (i + 1) + ": " + esc(s.label) + '"><span class="num">' + String(i + 1).padStart(2, "0") + "</span>" + esc(s.label) + "</button>";
    }).join("");

    function schedule(delay, fn) {
      var at = clock + Math.max(0, delay);
      queue.push({ at: at, fn: fn });
      queue.sort(function (a, b) { return a.at - b.at; });
      if (at > lastScheduled) lastScheduled = at;
    }

    function processQueue() {
      while (queue.length && queue[0].at <= clock) {
        var item = queue.shift();
        try { item.fn(); } catch (e) { /* keep the player alive */ }
      }
    }

    function setValue(sel, text) {
      var el = frameApp.querySelector(sel);
      if (!el) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.value = text;
      else el.textContent = text;
    }

    function fitMockContent() {
      var main = frameApp.querySelector(".mock-main");
      var inner = main && main.querySelector(".mock-main-inner");
      if (!main || !inner) return;
      inner.style.transform = "";
      inner.style.width = "";
      main.style.overflowY = "";
      var cs = window.getComputedStyle(main);
      var avail = main.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      var natural = inner.scrollHeight;
      if (!avail || !natural || natural <= avail + 2) return;
      var scale = Math.max(0.5, (avail - 6) / natural);
      inner.style.width = (100 / scale) + "%";
      inner.style.transform = "scale(" + scale + ")";
      if (natural * scale > avail + 2) main.style.overflowY = "auto";
    }

    function typeText(spec) {
      var text = spec.text;
      var per = spec.per || 45;
      for (var i = 1; i <= text.length; i++) {
        (function (n) {
          schedule(spec.at + n * per, function () { setValue(spec.sel, text.slice(0, n)); });
        })(i);
      }
    }

    function ripple() {
      var r = document.createElement("span");
      r.className = "cursor-ripple";
      cursor.appendChild(r);
      setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 750);
    }

    function aimAt(sel, click) {
      var target = frameApp.querySelector(sel);
      if (!target) { cursor.classList.remove("is-on"); return; }
      var fr = frame.getBoundingClientRect();
      var tr = target.getBoundingClientRect();
      var x = tr.left - fr.left + Math.min(26, Math.max(10, tr.width * 0.22));
      var y = tr.top - fr.top + Math.min(tr.height * 0.55, tr.height - 6);
      cursor.style.transform = "translate(" + x + "px," + y + "px)";
      cursor.classList.add("is-on");
      target.classList.add("is-aim");
      if (click) schedule(620, ripple);
    }

    function clearScene() {
      queue = [];
      lastScheduled = 0;
      clock = 0;
      frameApp.querySelectorAll(".is-aim").forEach(function (n) { n.classList.remove("is-aim"); });
      cursor.classList.remove("is-on");
    }

    function updateButtons() {
      playBtn.textContent = playing ? "Pause" : (idx === total - 1 && clock >= autoEnd ? "Replay" : "Play");
      playBtn.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
      prevBtn.disabled = idx === 0 && clock < 300;
      nextBtn.disabled = idx === total - 1;
      Array.prototype.forEach.call(dotsEl.children, function (b, i) {
        b.classList.toggle("is-active", i === idx);
        b.setAttribute("aria-current", i === idx ? "step" : "false");
      });
    }

    function renderScene(i, keepPlaying) {
      idx = i;
      var sc = scenes[i];
      clearScene();
      playing = keepPlaying !== false;

      frame.classList.toggle("is-phone", !!sc.phone);
      frameApp.innerHTML = shellFor(sc);
      urlEl.textContent = sc.url || "jms.acme.example";
      badge.textContent = "Step " + (i + 1) + " of " + total;
      capNum.textContent = String(i + 1).padStart(2, "0");
      capStep.textContent = "Step " + (i + 1) + " · " + sc.label;
      capText.textContent = sc.caption || "";
      capTip.textContent = sc.tip || "";

      stage.classList.remove("is-paused");

      if (sc.aim) schedule(380, function () { aimAt(sc.aim, sc.click); });
      if (sc.type) typeText(sc.type);
      (sc.types || []).forEach(typeText);
      (sc.pops || []).forEach(function (p) {
        schedule(p.at || 800, function () {
          var el = frameApp.querySelector(p.sel);
          if (el) el.classList.add("is-pop");
        });
      });

      autoEnd = sc.duration || 5600;
      if (lastScheduled + 1500 > autoEnd) autoEnd = lastScheduled + 1500;

      requestAnimationFrame(fitMockContent);
      updateButtons();
      fill.style.width = "0%";
      hasStarted = true;
    }

    function shellFor(sc) {
      var role = sc.role || "MANAGER";
      var user = USERS[role] || USERS.MANAGER;
      var groups = NAV[role] || NAV.MANAGER;
      var side = groups.map(function (g) {
        return '<div class="m-nav-label">' + esc(g[0]) + "</div>" + g[1].map(function (item) {
          return '<a class="m-nav-pill' + (item === sc.active ? " is-active" : "") + '" href="#">' + esc(item) + "</a>";
        }).join("");
      }).join("");
      return '<div class="mock-topbar"><div class="mock-brand"><span class="mark">J</span><span>JMS<em>Acme Windows</em></span></div>' +
        '<div class="mock-search"><span class="lens">⌕</span><span>Search jobs, customers, invoices…</span></div>' +
        '<div class="mock-top-actions"><span class="mock-aa">Aa</span><span class="mock-user"><span class="mock-avatar">' + user.initials + '</span><span class="mock-user-name">' + esc(user.name) + "<em>" + esc(user.role) + "</em></span></span></div></div>" +
        '<div class="mock-body"><aside class="mock-side">' + side + '</aside><div class="mock-main"><div class="mock-main-inner">' + sc.html + "</div></div></div>";
    }

    function go(i, options) {
      if (i < 0) i = 0;
      if (i > total - 1) i = total - 1;
      var wasPlaying = options && typeof options.playing === "boolean" ? options.playing : playing;
      renderScene(i, wasPlaying);
    }

    function next() {
      if (idx < total - 1) {
        renderScene(idx + 1, true);
      } else {
        playing = false;
        autoEnd = clock;
        fill.style.width = "100%";
        stage.classList.add("is-paused");
        updateButtons();
      }
    }

    function startClock() {
      if (raf) return;
      lastFrameTime = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function tick(t) {
      var dt = Math.min(120, t - lastFrameTime);
      lastFrameTime = t;
      if (playing) {
        clock += dt * speed;
        processQueue();
        var pct = autoEnd > 0 ? Math.min(100, (clock / autoEnd) * 100) : 0;
        fill.style.width = pct + "%";
        if (clock >= autoEnd) next();
      }
      raf = requestAnimationFrame(tick);
    }

    function setPlaying(on) {
      if (on && idx === total - 1 && clock >= autoEnd) {
        renderScene(0, true);
        return;
      }
      playing = on;
      stage.classList.toggle("is-paused", !on);
      playBtn.textContent = on ? "Pause" : "Play";
      playBtn.setAttribute("aria-label", on ? "Pause animation" : "Play animation");
      updateButtons();
    }

    function setSpeed(value) {
      var old = speed;
      if (value === old) return;
      var factor = old / value;
      autoEnd = clock + (autoEnd - clock) * factor;
      queue.forEach(function (q) { q.at = clock + (q.at - clock) * factor; });
      speed = value;
      Array.prototype.forEach.call(host.querySelectorAll(".speed-btn"), function (b) {
        b.classList.toggle("is-active", Number(b.getAttribute("data-speed")) === value);
      });
    }

    playBtn.addEventListener("click", function () { setPlaying(!playing); });
    prevBtn.addEventListener("click", function () { go(idx - 1, { playing: playing }); });
    nextBtn.addEventListener("click", function () { go(idx + 1, { playing: playing }); });
    restartBtn.addEventListener("click", function () { renderScene(0, true); });
    dotsEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-go]");
      if (b) go(Number(b.getAttribute("data-go")), { playing: playing });
    });
    host.querySelector(".speeds").addEventListener("click", function (e) {
      var b = e.target.closest("[data-speed]");
      if (b) setSpeed(Number(b.getAttribute("data-speed")));
    });

    stage.addEventListener("mouseenter", function () { stageHover = true; });
    stage.addEventListener("mouseleave", function () { stageHover = false; });
    stage.addEventListener("focusin", function () { stageHover = true; });
    stage.addEventListener("focusout", function () { stageHover = false; });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      var active = stageHover || stage.contains(document.activeElement);
      if (!active) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1, { playing: playing }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1, { playing: playing }); }
      else if (e.key.toLowerCase() === "r") { e.preventDefault(); renderScene(0, true); }
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitMockContent, 120);
    });

    renderScene(startAt, true);
    startClock();
    updateButtons();
  }

  function wireDrawer() {
    var drawer = document.getElementById("insight-drawer");
    var scrim = document.querySelector(".drawer-scrim");
    if (!drawer) return;
    var open = function () {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      if (scrim) scrim.hidden = false;
      var close = drawer.querySelector(".drawer-close");
      if (close) close.focus();
    };
    var close = function () {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if (scrim) scrim.hidden = true;
    };
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-insights]")) { e.preventDefault(); open(); }
      if (e.target.closest("[data-close-insights]")) { e.preventDefault(); close(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  function boot() {
    var headerHost = document.getElementById("site-header");
    var tocHost = document.getElementById("site-toc");
    var main = document.getElementById("site-main");
    if (headerHost) headerHost.innerHTML = brandHeader();
    if (tocHost) tocHost.outerHTML = toc();
    if (main) {
      main.innerHTML = isOverview ? indexPath() : workflowPath();
      var storyHost = document.getElementById("story-host");
      if (storyHost) mountStory(storyHost, isOverview ? "overview" : workflow.id);
      wireDrawer();
    }
    document.title = "JMS explainers · " + (isOverview ? "Why JMS" : workflow.title);

    var menu = document.getElementById("menu-btn");
    if (menu) {
      menu.addEventListener("click", function () {
        var open = document.body.classList.toggle("toc-open");
        menu.setAttribute("aria-expanded", open ? "true" : "false");
      });
      var tocEl = document.getElementById("site-toc");
      if (tocEl) tocEl.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          document.body.classList.remove("toc-open");
          menu.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && document.body.classList.contains("toc-open")) {
          document.body.classList.remove("toc-open");
          menu.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("click", function (e) {
        if (!document.body.classList.contains("toc-open")) return;
        if (e.target.closest("#site-toc") || e.target.closest("#menu-btn")) return;
        document.body.classList.remove("toc-open");
        menu.setAttribute("aria-expanded", "false");
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
