import express from "express";
import { all } from "../db/index.js";
import { can } from "../domain/permissions.js";
import { jobScope } from "../services/access.js";
import { renderPage } from "../render.js";

export const searchRouter = express.Router();

searchRouter.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  const results = { jobs: [], customers: [], invoices: [] };
  if (q.length >= 2 && req.user) {
    const scope = jobScope(req.user);
    results.jobs = all(
      `SELECT j.*, c.name AS customer_name FROM jobs j JOIN customers c ON c.id=j.customer_id
       WHERE (${scope.sql}) AND j.archived_at IS NULL
         AND (j.reference LIKE ? OR j.title LIKE ? OR j.description LIKE ? OR c.name LIKE ?)
       ORDER BY j.created_at DESC LIMIT 15`,
      ...scope.params, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`,
    );
    if (can(req.user, "customer.view.all")) {
      results.customers = all(
        `SELECT * FROM customers WHERE archived_at IS NULL AND (name LIKE ? OR email LIKE ? OR contact_name LIKE ?)
         ORDER BY name LIMIT 10`,
        `%${q}%`, `%${q}%`, `%${q}%`,
      );
    }
    if (can(req.user, "invoice.view.all")) {
      results.invoices = all(
        `SELECT i.*, j.reference AS job_reference, c.name AS customer_name
         FROM invoices i JOIN jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id
         WHERE i.number LIKE ? OR j.reference LIKE ? OR c.name LIKE ?
         ORDER BY i.created_at DESC LIMIT 10`,
        `%${q}%`, `%${q}%`, `%${q}%`,
      );
    }
  }
  renderPage(req, res, "pages/search.njk", { title: "Search", q, results });
});
