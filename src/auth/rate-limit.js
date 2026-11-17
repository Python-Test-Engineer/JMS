// Tiny in-memory sliding-window limiter (single process, _TECH.md §9.5).
const buckets = new Map();

function prune(now) {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((at) => now - at < bucket.windowMs);
    if (!bucket.hits.length) buckets.delete(key);
  }
}
setInterval(() => prune(Date.now()), 5 * 60_000).unref?.();

export function hit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key) || { hits: [], windowMs };
  bucket.windowMs = windowMs;
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { blocked: bucket.hits.length > limit, remaining: Math.max(0, limit - bucket.hits.length), retryMs: windowMs };
}

export function clear(key) {
  buckets.delete(key);
}

export function blocked(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return false;
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);
  return bucket.hits.length >= limit;
}
