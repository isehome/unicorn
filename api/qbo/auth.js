/**
 * QBO OAuth initiation endpoint
 * Returns the authorization URL for QuickBooks OAuth2 flow
 */

import { requireAuth } from '../_authMiddleware.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required for QBO endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

  // Check for required environment variables
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET) {
    console.error('[QBO Auth] Missing QBO credentials');
    return res.status(500).json({
      error: 'QuickBooks is not configured. Please add QBO_CLIENT_ID and QBO_CLIENT_SECRET to environment variables.'
    });
  }

  if (!process.env.QBO_REDIRECT_URI) {
    console.error('[QBO Auth] Missing redirect URI');
    return res.status(500).json({
      error: 'QuickBooks redirect URI is not configured. Please add QBO_REDIRECT_URI to environment variables.'
    });
  }

  try {
    // Import intuit-oauth dynamically inside handler to avoid cold start issues
    const OAuthClient = (await import('intuit-oauth')).default;

    const oauthClient = new OAuthClient({
      clientId: process.env.QBO_CLIENT_ID,
      clientSecret: process.env.QBO_CLIENT_SECRET,
      environment: process.env.QBO_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QBO_REDIRECT_URI
    });

    // Generate authorization URL
    const authUrl = oauthClient.authorizeUri({
      scope: [
        OAuthClient.scopes.Accounting,
        OAuthClient.scopes.OpenId,
        OAuthClient.scopes.Profile,
        OAuthClient.scopes.Email
      ],
      state: 'unicorn_qbo_auth'
    });

    console.log('[QBO Auth] Generated auth URL:', authUrl);

    return res.status(200).json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('[QBO Auth] Error generating auth URL:', error);
    return res.status(500).json({
      error: error.message || 'Failed to initiate QuickBooks authorization'
    });
  }
}
