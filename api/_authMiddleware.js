/**
 * Shared Authentication Middleware for Unicorn API
 *
 * Provides consistent auth patterns across all API endpoints.
 *
 * THREE AUTH MODES:
 * 1. requireAuth(req, res)      - Validates MSAL Bearer token via Microsoft Graph
 * 2. requireCron(req, res)      - Validates CRON_SECRET for Vercel cron jobs
 * 3. optionalAuth(req, res)     - Tries auth, but allows unauthenticated (sets req.user if valid)
 *
 * Usage in an endpoint:
 *   const { requireAuth, requireCron, optionalAuth } = require('./_authMiddleware');
 *
 *   module.exports = async (req, res) => {
 *     const user = await requireAuth(req, res);
 *     if (!user) return;  // Already sent 401
 *     // user.id, user.email, user.displayName available
 *   };
 *
 * IMPORTANT: This validates MSAL tokens against Microsoft Graph.
 * It does NOT use supabase.auth.getUser() (which is always null in this app).
 */

// In-memory token cache (per serverless instance, ~5 min lifetime)
// Prevents hitting Microsoft Graph on every single API call
const tokenCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate an MSAL token against Microsoft Graph and return the user profile.
 * Results are cached for 5 minutes per token to avoid hammering Graph.
 */
async function validateMSALToken(token) {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.profile;
  }

  // Validate against Microsoft Graph
  const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!graphRes.ok) {
    // Clean up expired cache entry
    tokenCache.delete(token);
    return null;
  }

  const profile = await graphRes.json();

  // Cache the result
  tokenCache.set(token, { profile, timestamp: Date.now() });

  // Evict old entries if cache gets too big (prevent memory leaks)
  if (tokenCache.size > 100) {
    const oldestKey = tokenCache.keys().next().value;
    tokenCache.delete(oldestKey);
  }

  return profile;
}

/**
 * Extract Bearer token from Authorization header.
 * Returns null if not present or malformed.
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * REQUIRE AUTH - Validates MSAL Bearer token. Returns user profile or sends 401.
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @returns {object|null} User profile { id, email, displayName } or null (401 already sent)
 */
async function requireAuth(req, res) {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return null;
  }

  try {
    const profile = await validateMSALToken(token);
    if (!profile) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }

    // Attach user to request for downstream use
    req.user = {
      id: profile.id,
      email: profile.mail || profile.userPrincipalName,
      displayName: profile.displayName,
    };

    return req.user;
  } catch (err) {
    console.error('[Auth] Token validation error:', err.message);
    res.status(502).json({ error: 'Unable to validate token' });
    return null;
  }
}

/**
 * REQUIRE CRON - Validates CRON_SECRET Bearer token for Vercel cron jobs.
 * In development (or if CRON_SECRET not set), allows manual triggers.
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @returns {boolean} true if authorized, false if 401 was sent
 */
function requireCron(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Auth] Unauthorized cron request');
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    // In development, allow manual triggers without secret
  }

  return true;
}

/**
 * OPTIONAL AUTH - Tries to validate token but allows unauthenticated access.
 * Sets req.user if valid token is present, otherwise req.user = null.
 * Never sends 401 — always returns.
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @returns {object|null} User profile or null (request continues either way)
 */
async function optionalAuth(req, res) {
  const token = extractBearerToken(req);

  if (!token) {
    req.user = null;
    return null;
  }

  try {
    const profile = await validateMSALToken(token);
    if (profile) {
      req.user = {
        id: profile.id,
        email: profile.mail || profile.userPrincipalName,
        displayName: profile.displayName,
      };
      return req.user;
    }
  } catch (err) {
    // Silent failure for optional auth
  }

  req.user = null;
  return null;
}

/**
 * CORS handler for OPTIONS preflight.
 * Returns true if this was a preflight request (response already sent).
 */
function handleCORS(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = {
  requireAuth,
  requireCron,
  optionalAuth,
  handleCORS,
  extractBearerToken,
  validateMSALToken,
};
