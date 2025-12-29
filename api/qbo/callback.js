/**
 * QBO OAuth callback endpoint
 * Handles the OAuth2 callback from QuickBooks and stores tokens
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, realmId, error: authError } = req.query;

  // Handle authorization errors
  if (authError) {
    console.error('[QBO Callback] Authorization error:', authError);
    return res.redirect(`/settings?qbo_error=${encodeURIComponent(authError)}`);
  }

  if (!code || !realmId) {
    console.error('[QBO Callback] Missing code or realmId');
    return res.redirect('/settings?qbo_error=missing_params');
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

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Exchange authorization code for tokens
    const authResponse = await oauthClient.createToken(req.url);
    const token = authResponse.getJson();

    console.log('[QBO Callback] Token received for realmId:', realmId);

    // Get company info
    let companyName = null;
    try {
      const companyInfo = await oauthClient.makeApiCall({
        url: `https://${process.env.QBO_ENVIRONMENT === 'production' ? '' : 'sandbox-'}quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      companyName = companyInfo.getJson()?.CompanyInfo?.CompanyName;
    } catch (companyErr) {
      console.warn('[QBO Callback] Could not fetch company name:', companyErr.message);
    }

    // Calculate token expiration times
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + (token.expires_in * 1000));
    const refreshTokenExpiresAt = new Date(now.getTime() + (token.x_refresh_token_expires_in * 1000));

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('qbo_auth_tokens')
      .upsert({
        realm_id: realmId,
        company_name: companyName,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        access_token_expires_at: accessTokenExpiresAt.toISOString(),
        refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
        updated_at: now.toISOString()
      }, {
        onConflict: 'realm_id'
      });

    if (dbError) {
      console.error('[QBO Callback] Failed to store tokens:', dbError);
      return res.redirect('/settings?qbo_error=token_storage_failed');
    }

    console.log('[QBO Callback] Tokens stored successfully for:', companyName || realmId);

    // Redirect back to settings page with success
    return res.redirect('/settings?qbo_connected=true');
  } catch (error) {
    console.error('[QBO Callback] Error exchanging code:', error);
    return res.redirect(`/settings?qbo_error=${encodeURIComponent(error.message || 'token_exchange_failed')}`);
  }
}
