// Progressive enhancement only. Every form and link works without JavaScript.
(function () {
  "use strict";

  // Prevent accidental double submits. Show a busy label after 300ms so fast
  // requests do not flash a distracting message.
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.submitting === "1") {
      event.preventDefault();
      return;
    }
    form.dataset.submitting = "1";
    var buttons = form.querySelectorAll("button[type=submit]");
    for (var i = 0; i < buttons.length; i += 1) {
      (function (button) {
        setTimeout(function () {
          if (form.dataset.submitting === "1") {
            button.disabled = true;
            button.textContent = "Working…";
          }
        }, 300);
      })(buttons[i]);
    }
  });

  // Mobile slide-over navigation.
  var navToggle = document.querySelector(".nav-toggle");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.querySelector(".nav-scrim");
  function setNav(open) {
    document.body.classList.toggle("nav-open", open);
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    }
    if (scrim) scrim.hidden = !open;
    if (open) {
      var firstLink = sidebar && sidebar.querySelector("a");
      if (firstLink) firstLink.focus();
    }
  }
  if (navToggle && sidebar) {
    navToggle.addEventListener("click", function () {
      setNav(!document.body.classList.contains("nav-open"));
    });
    sidebar.addEventListener("click", function (event) {
      if (event.target.closest("a")) setNav(false);
    });
    if (scrim) scrim.addEventListener("click", function () { setNav(false); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
        setNav(false);
        navToggle.focus();
      }
    });
  }

  var backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    var update = function () {
      backToTop.classList.toggle("is-visible", window.scrollY > 320);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  // Focus the first invalid field after a server-side validation failure.
  var invalid = document.querySelector(".field-error");
  if (invalid) {
    var field = invalid.closest(".field");
    var input = field && field.querySelector("input, select, textarea");
    if (input) input.focus();
  }
})();
