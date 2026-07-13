const rateBuckets = new Map();
const responseCache = new Map();

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function checkRateLimit(req, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const key = clientIp(req);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

async function fetchWithTimeout(url, options, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getCache(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlMs = 10 * 60_000) {
  if (responseCache.size > 200) responseCache.delete(responseCache.keys().next().value);
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

module.exports = { checkRateLimit, fetchWithTimeout, getCache, setCache };
