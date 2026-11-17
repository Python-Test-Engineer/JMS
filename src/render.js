import path from "node:path";
import nunjucks from "nunjucks";
import { config } from "./config.js";
import { STATUS_LABELS, WORK_TYPE_LABELS } from "./domain/status.js";
import { formatDate, formatDateTime, formatTime } from "./domain/dates.js";
import { formatMoney } from "./domain/money.js";
import { ROLE_LABELS } from "./domain/permissions.js";

const viewsDir = path.resolve(config.root, "src/views");

export const env = nunjucks.configure(viewsDir, {
  autoescape: true,
  noCache: !config.isProduction,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
});

env.addFilter("money", (pence) => formatMoney(pence, config.CURRENCY));
env.addFilter("date", formatDate);
env.addFilter("datetime", formatDateTime);
env.addFilter("time", formatTime);
env.addFilter("statusLabel", (value) => STATUS_LABELS[value] || value || "—");
env.addFilter("workType", (value) => WORK_TYPE_LABELS[value] || value || "—");
env.addFilter("roleLabel", (value) => ROLE_LABELS[value] || value || "—");
env.addFilter("json", (value) => JSON.stringify(value));
env.addFilter("nl2br", (value) => String(value ?? "").replace(/\r?\n/g, "<br>"));
env.addFilter("pounds", (pence) => (pence === null || pence === undefined ? "" : (Number(pence) / 100).toFixed(2)));
env.addFilter("initials", (name) => String(name || "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase());
env.addGlobal("appName", "JMS");
env.addGlobal("companyName", "Acme Windows");

export function renderPage(req, res, template, context = {}) {
  const html = env.render(template, {
    ...res.locals,
    reqPath: req.path,
    query: req.query,
    ...context,
  });
  res.type("html").send(html);
}
