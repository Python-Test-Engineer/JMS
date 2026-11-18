// Live preview for the appearance radios. The server remains the source of truth.
(function () {
  "use strict";
  var form = document.querySelector('form[action="/account/appearance"]');
  if (!form) return;
  form.addEventListener("change", function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === "mode") document.documentElement.setAttribute("data-theme", target.value);
    if (target.name === "text") document.documentElement.setAttribute("data-text", target.value);
    if (target.name === "leading") document.documentElement.setAttribute("data-leading", target.value);
  });
})();
