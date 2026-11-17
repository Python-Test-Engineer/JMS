// Live preview for the appearance and site-theme forms.
// The form still posts normally; this only repaints the current page while the
// reader drags a slider or picks a colour. Variables are written through the
// CSSOM, which the strict style-src policy allows.
(function () {
  "use strict";

  var form = document.querySelector("[data-theme-form]");
  if (!form) return;

  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function currentMode() {
    var checked = form.querySelector("input[name=mode]:checked");
    return checked ? checked.value : "system";
  }

  function applyMode() {
    document.documentElement.setAttribute("data-theme", currentMode());
  }

  function applyColors() {
    var mode = currentMode();
    var dark = mode === "dark" || (mode === "system" && media.matches);
    var scope = dark ? "dark" : "light";
    var inputs = form.querySelectorAll("[data-theme-key]");
    for (var i = 0; i < inputs.length; i += 1) {
      var input = inputs[i];
      if (input.getAttribute("data-theme-scope") !== scope) continue;
      if (!/^#[0-9a-f]{3,8}$/i.test(input.value)) continue;
      document.documentElement.style.setProperty(input.getAttribute("data-theme-key"), input.value);
    }
  }

  function applyVars() {
    var inputs = form.querySelectorAll("[data-preview-var]");
    for (var i = 0; i < inputs.length; i += 1) {
      var input = inputs[i];
      var unit = input.getAttribute("data-unit") || "";
      document.documentElement.style.setProperty(input.getAttribute("data-preview-var"), input.value + unit);
    }
  }

  function apply() {
    applyMode();
    applyColors();
    applyVars();
  }

  form.addEventListener("input", apply);
  form.addEventListener("change", apply);
  if (typeof media.addEventListener === "function") media.addEventListener("change", apply);
  else if (typeof media.addListener === "function") media.addListener(apply);
})();
