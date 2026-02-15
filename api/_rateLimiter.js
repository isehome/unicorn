/**
 * Simple In-Memory Rate Limiter for Vercel Serverless Functions
 *
 * Limits requests per IP address within a sliding window.
 * Since Vercel functions are ephemeral, this is per-instance only,
 * but it still catches basic abuse (rapid fire from a single IP).
 *
 * For production-grade rate limiting, consider Vercel's WAF or
 * an external service like Upstash Redis.
 *
 * Usage:
 *   const { rateLimit } = require('./_rateLimiter');
 *
 *   module.exports = async (req, res) => {
 *     if (!rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) return;
 *     // ... handle request
 *   };
 */

// In-memory store: { ip: { count, resetTime } }
const store = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limit a request by IP address.
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @param {object} options - Configuration
 * @param {number} options.maxRequests - Max requests per window (default: 60)
 * @param {number} options.windowMs - Window size in ms (default: 60000 = 1 min)
 * @returns {boolean} true if allowed, false if rate limited (429 already sent)
 */
function rateLimit(req, res, options = {}) {
  const { maxRequests = 60, windowMs = 60000 } = options;

  // Get client IP (Vercel provides x-forwarded-for, x-real-ip)
  const ip = req.headers['x-real-ip'] ||
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             'unknown';

  const now = Date.now();
  const key = ip;

  let record = store.get(key);

  if (!record || now > record.resetTime) {
    // New window
    record = { count: 1, resetTime: now + windowMs };
    store.set(key, record);
  } else {
    record.count++;
  }

  // Set rate limit headers (helpful for debugging)
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
  res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

  if (record.count > maxRequests) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return false;
  }

  return true;
}

/**
 * Stricter rate limit for sensitive operations (login, notifications, etc.)
 */
function strictRateLimit(req, res) {
  return rateLimit(req, res, { maxRequests: 10, windowMs: 60000 });
}

/**
 * Generous rate limit for read-heavy endpoints
 */
function readRateLimit(req, res) {
  return rateLimit(req, res, { maxRequests: 120, windowMs: 60000 });
}

module.exports = { rateLimit, strictRateLimit, readRateLimit };
