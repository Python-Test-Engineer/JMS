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

  var invalid = document.querySelector(".field-error");
  if (invalid) {
    var field = invalid.closest(".field");
    var input = field && field.querySelector("input, select, textarea");
    if (input) input.focus();
  }
})();
