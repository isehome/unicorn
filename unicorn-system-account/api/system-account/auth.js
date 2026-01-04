/**
 * /api/system-account/auth.js
 * 
 * Initiates OAuth flow for connecting the system account.
 * Returns an authorization URL that the admin will be redirected to.
 */

const crypto = require('crypto');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    
    if (!clientId || !tenantId) {
      return res.status(500).json({ 
        error: 'Azure AD not configured',
        details: 'Missing AZURE_CLIENT_ID or AZURE_TENANT_ID'
      });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Build redirect URI - use the callback endpoint
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://unicorn-one.vercel.app';
    const redirectUri = `${origin}/api/system-account/callback`;

    // Scopes we need for system account operations
    const scopes = [
      'offline_access',      // Required for refresh token
      'openid',
      'profile',
      'email',
      'User.Read',
      'Mail.Send',
      'Calendars.ReadWrite',
      'Files.ReadWrite.All', // For SharePoint/OneDrive
    ].join(' ');

    // Build authorization URL
    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('prompt', 'consent'); // Force consent to ensure we get all scopes

    console.log('[SystemAccount] Auth initiated, redirectUri:', redirectUri);

    return res.status(200).json({
      authUrl: authUrl.toString(),
      state,
      redirectUri,
      scopes: scopes.split(' ')
    });

  } catch (error) {
    console.error('[SystemAccount] Auth error:', error);
    return res.status(500).json({
      error: 'Failed to initiate authentication',
      details: error.message
    });
  }
};
