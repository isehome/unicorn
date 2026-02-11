/**
 * Supabase Token Exchange
 *
 * POST /api/auth/supabase-token
 *
 * Accepts a valid Microsoft (MSAL) access token, validates it against
 * Microsoft Graph, and returns a Supabase-compatible JWT signed with
 * the project's JWT secret.  The frontend stores this JWT via
 * supabase.auth.setSession() so that auth.uid() resolves to the
 * Azure user's OID inside RLS policies.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_JWT_SECRET   (Settings → API → JWT Secret in Supabase dashboard)
 */

const crypto = require('crypto');

// ─── JWT helpers (HS256, no external deps) ───────────────────────────

function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];
  const signature = crypto
    .createHmac('sha256', secret)
    .update(segments.join('.'))
    .digest();
  segments.push(base64url(signature));
  return segments.join('.');
}

// ─── Handler ─────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Extract MSAL token ──────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const msalToken = authHeader.slice(7);

  // ── Validate against Microsoft Graph ────────────────────────────
  let profile;
  try {
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${msalToken}` },
    });
    if (!graphRes.ok) {
      const body = await graphRes.text().catch(() => '');
      console.error('[supabase-token] Graph validation failed:', graphRes.status, body);
      return res.status(401).json({ error: 'Invalid or expired MSAL token' });
    }
    profile = await graphRes.json();
  } catch (err) {
    console.error('[supabase-token] Graph fetch error:', err);
    return res.status(502).json({ error: 'Unable to reach Microsoft Graph' });
  }

  // ── Mint Supabase JWT ───────────────────────────────────────────
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('[supabase-token] SUPABASE_JWT_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1 hour – matches MSAL token cadence

  const payload = {
    // Required Supabase / PostgREST claims
    aud: 'authenticated',
    role: 'authenticated',
    sub: profile.id,                           // Azure OID → auth.uid()
    iss: `${supabaseUrl}/auth/v1`,
    iat: now,
    exp: now + expiresIn,

    // Standard user info (available via auth.jwt() in RLS)
    email: profile.mail || profile.userPrincipalName,

    // Supabase-style metadata
    app_metadata: {
      provider: 'azure',
      providers: ['azure'],
    },
    user_metadata: {
      full_name: profile.displayName,
      email: profile.mail || profile.userPrincipalName,
      azure_oid: profile.id,
    },
  };

  const accessToken = signJWT(payload, jwtSecret);

  return res.status(200).json({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    user: {
      id: profile.id,
      email: payload.email,
      role: 'authenticated',
      user_metadata: payload.user_metadata,
    },
  });
};
