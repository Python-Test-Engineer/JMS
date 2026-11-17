// Small progressive enhancement: busy state on submit, confirmations and
// keyboard focus on the first invalid field. The app works without JavaScript.
(function () {
  "use strict";

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (form.dataset.submitting === "1") {
      event.preventDefault();
      return;
    }
    form.dataset.submitting = "1";
    var buttons = form.querySelectorAll("button[type=submit]");
    for (var i = 0; i < buttons.length; i += 1) {
      setTimeout(function (button) {
        button.disabled = true;
        button.textContent = "Working…";
      }.bind(null, buttons[i]), 300);
    }
  });

  var navToggle = document.querySelector(".nav-toggle");
  var sidebar = document.getElementById("sidebar");
  if (navToggle && sidebar) {
    var setNav = function (open) {
      document.body.classList.toggle("nav-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };
    navToggle.addEventListener("click", function () {
      var open = !document.body.classList.contains("nav-open");
      setNav(open);
      if (open) {
        var firstLink = sidebar.querySelector("a");
        if (firstLink) firstLink.focus();
      }
    });
    sidebar.addEventListener("click", function (event) {
      if (event.target.closest("a")) setNav(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
        setNav(false);
        navToggle.focus();
      }
    });
  }

  var backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    var updateBackToTop = function () {
      backToTop.classList.toggle("is-visible", window.scrollY > 320);
    };
    updateBackToTop();
    window.addEventListener("scroll", updateBackToTop, { passive: true });
  }

  var invalid = document.querySelector(".field-error");
  if (invalid) {
    var field = invalid.closest(".field");
    var input = field && field.querySelector("input, select, textarea");
    if (input) input.focus();
  }
})();
