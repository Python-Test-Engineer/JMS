/** Global search, scoped by role. */
import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { renderPage } from "../render.js";
import { searchAll } from "../services/dashboard.js";
import { layout } from "./helpers.js";

export const searchRouter = Router();

searchRouter.get("/search", requireUser, (req, res) => {
  layout(req, res);
  const q = String(req.query["q"] ?? "").trim();
  const results = q.length >= 2 ? searchAll(req.user!, q) : { jobs: [], customers: [], invoices: [] };
  renderPage(res, "pages/search.njk", { title: `Search: ${q || "everything"}`, q, results });
});
