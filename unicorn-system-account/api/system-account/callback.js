/**
 * /api/system-account/callback.js
 * 
 * OAuth callback handler for system account connection.
 * Exchanges the authorization code for tokens and stores them.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Handle OAuth errors
    if (oauthError) {
      console.error('[SystemAccount] OAuth error:', oauthError, error_description);
      return res.redirect(`/admin?tab=integrations&system_account_error=${encodeURIComponent(error_description || oauthError)}`);
    }

    if (!code) {
      return res.redirect('/admin?tab=integrations&system_account_error=No+authorization+code+received');
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const tenantId = process.env.AZURE_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      return res.redirect('/admin?tab=integrations&system_account_error=Azure+AD+not+configured');
    }

    // Build redirect URI (must match the one used in auth request)
    const origin = `https://${req.headers.host}`;
    const redirectUri = `${origin}/api/system-account/callback`;

    // Exchange code for tokens
    const tokenBody = new URLSearchParams();
    tokenBody.set('client_id', clientId);
    tokenBody.set('client_secret', clientSecret);
    tokenBody.set('grant_type', 'authorization_code');
    tokenBody.set('code', code);
    tokenBody.set('redirect_uri', redirectUri);
    tokenBody.set('scope', 'offline_access openid profile email User.Read Mail.Send Calendars.ReadWrite Files.ReadWrite.All');

    const tokenResp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody
    });

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text();
      console.error('[SystemAccount] Token exchange failed:', tokenResp.status, errorText);
      return res.redirect(`/admin?tab=integrations&system_account_error=${encodeURIComponent('Token exchange failed')}`);
    }

    const tokens = await tokenResp.json();

    // Get user profile to confirm the account
    const profileResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });

    if (!profileResp.ok) {
      console.error('[SystemAccount] Profile fetch failed:', profileResp.status);
      return res.redirect(`/admin?tab=integrations&system_account_error=${encodeURIComponent('Failed to get account profile')}`);
    }

    const profile = await profileResp.json();
    const accountEmail = profile.mail || profile.userPrincipalName;
    const displayName = profile.displayName;
    const userId = profile.id;

    console.log('[SystemAccount] Connected account:', accountEmail, displayName);

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Parse granted scopes
    const grantedScopes = tokens.scope ? tokens.scope.split(' ') : [];

    // Get the admin user who initiated this (from state or session - simplified here)
    // In production, you'd decode this from the state parameter
    const configuredBy = req.query.configured_by || null;
    const configuredByName = req.query.configured_by_name || 'Admin';

    // Upsert the credentials (replace any existing)
    const { error: upsertError } = await supabase
      .from('system_account_credentials')
      .upsert({
        account_type: 'microsoft_365',
        account_email: accountEmail,
        display_name: displayName,
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        granted_scopes: grantedScopes,
        is_active: true,
        last_token_refresh: new Date().toISOString(),
        consecutive_failures: 0,
        last_error: null,
        last_error_at: null,
        configured_by: configuredBy,
        configured_by_name: configuredByName,
        configured_at: new Date().toISOString()
      }, {
        onConflict: 'account_type'
      });

    if (upsertError) {
      console.error('[SystemAccount] Failed to save credentials:', upsertError);
      return res.redirect(`/admin?tab=integrations&system_account_error=${encodeURIComponent('Failed to save credentials')}`);
    }

    // Log successful connection
    await supabase.from('system_account_refresh_log').insert({
      account_type: 'microsoft_365',
      refresh_type: 'initial_connect',
      success: true,
      token_expires_at: expiresAt.toISOString()
    });

    console.log('[SystemAccount] Credentials saved successfully');

    // Redirect back to admin page with success
    return res.redirect(`/admin?tab=integrations&system_account_success=Connected+as+${encodeURIComponent(accountEmail)}`);

  } catch (error) {
    console.error('[SystemAccount] Callback error:', error);
    return res.redirect(`/admin?tab=integrations&system_account_error=${encodeURIComponent(error.message)}`);
  }
};
