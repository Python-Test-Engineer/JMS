import { can } from "../domain/permissions.js";
import { forbidden } from "./errors.js";

export function requirePermission(actionKey) {
  return (req, res, next) => {
    if (can(req.user, actionKey)) return next();
    return forbidden(req, res, "You do not have permission to open this screen. Go back to your work using the navigation.");
  };
}

export function requireAnyPermission(...actionKeys) {
  return (req, res, next) => {
    if (actionKeys.some((key) => can(req.user, key))) return next();
    return forbidden(req, res);
  };
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function parsePage(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(query.per_page, 10) || 25));
  return { page, perPage, offset: (page - 1) * perPage };
}
