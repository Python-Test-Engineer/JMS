const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const token = req.body?._csrf || req.get("X-CSRF-Token") || "";
  if (!req.session || !token || token !== req.session.csrf_token) {
    const err = new Error("Your security token was missing or stale. Reload the page and try again.");
    err.status = 403;
    err.csrf = true;
    return next(err);
  }
  return next();
}
