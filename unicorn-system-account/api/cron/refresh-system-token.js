/**
 * /api/cron/refresh-system-token.js
 * 
 * Daily cron job to proactively refresh the system account token.
 * This ensures the token never expires, even over long weekends.
 * 
 * Runs at 2 AM daily (configured in vercel.json)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TOKEN_URL = 'https://login.microsoftonline.com';

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel sends this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow unauthenticated for manual testing in dev
    if (process.env.NODE_ENV === 'production' && !req.query.manual) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[Cron:RefreshSystemToken] Starting daily token refresh');

  try {
    // Get all active system accounts
    const { data: accounts, error: fetchError } = await supabase
      .from('system_account_credentials')
      .select('*')
      .eq('is_active', true);

    if (fetchError) {
      console.error('[Cron:RefreshSystemToken] Failed to fetch accounts:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch accounts' });
    }

    if (!accounts || accounts.length === 0) {
      console.log('[Cron:RefreshSystemToken] No active system accounts to refresh');
      return res.status(200).json({ 
        message: 'No active system accounts',
        refreshed: 0 
      });
    }

    const results = [];

    for (const account of accounts) {
      console.log('[Cron:RefreshSystemToken] Refreshing:', account.account_email);

      try {
        if (!account.refresh_token) {
          throw new Error('No refresh token stored');
        }

        // Refresh the token
        const body = new URLSearchParams();
        body.set('client_id', process.env.AZURE_CLIENT_ID);
        body.set('client_secret', process.env.AZURE_CLIENT_SECRET);
        body.set('grant_type', 'refresh_token');
        body.set('refresh_token', account.refresh_token);
        body.set('scope', 'offline_access openid profile email User.Read Mail.Send Calendars.ReadWrite Files.ReadWrite.All');

        const resp = await fetch(`${TOKEN_URL}/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Token refresh failed: ${resp.status} ${errorText}`);
        }

        const tokens = await resp.json();
        const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

        // Update stored tokens
        const { error: updateError } = await supabase
          .from('system_account_credentials')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || account.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            last_token_refresh: new Date().toISOString(),
            consecutive_failures: 0,
            last_error: null,
            last_error_at: null
          })
          .eq('id', account.id);

        if (updateError) {
          throw new Error(`Failed to save token: ${updateError.message}`);
        }

        // Log success
        await supabase.from('system_account_refresh_log').insert({
          account_type: account.account_type,
          refresh_type: 'cron',
          success: true,
          token_expires_at: expiresAt.toISOString()
        });

        results.push({
          account: account.account_email,
          success: true,
          expiresAt: expiresAt.toISOString()
        });

        console.log('[Cron:RefreshSystemToken] Refreshed:', account.account_email, 'expires:', expiresAt);

      } catch (refreshError) {
        console.error('[Cron:RefreshSystemToken] Failed to refresh:', account.account_email, refreshError.message);

        // Log failure
        await supabase.from('system_account_refresh_log').insert({
          account_type: account.account_type,
          refresh_type: 'cron',
          success: false,
          error_message: refreshError.message.substring(0, 500)
        });

        // Update consecutive failures
        await supabase.from('system_account_credentials')
          .update({
            consecutive_failures: (account.consecutive_failures || 0) + 1,
            last_error: refreshError.message.substring(0, 500),
            last_error_at: new Date().toISOString()
          })
          .eq('id', account.id);

        results.push({
          account: account.account_email,
          success: false,
          error: refreshError.message
        });
      }
    }

    // Clean up old refresh logs (older than 30 days)
    await supabase.rpc('cleanup_system_account_refresh_log');

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('[Cron:RefreshSystemToken] Completed:', successCount, 'refreshed,', failCount, 'failed');

    return res.status(200).json({
      message: 'Token refresh completed',
      refreshed: successCount,
      failed: failCount,
      results
    });

  } catch (error) {
    console.error('[Cron:RefreshSystemToken] Cron error:', error);
    return res.status(500).json({
      error: 'Token refresh cron failed',
      details: error.message
    });
  }
};
