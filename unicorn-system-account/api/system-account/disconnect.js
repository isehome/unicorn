/**
 * /api/system-account/disconnect.js
 * 
 * Disconnects the system account by deactivating the stored credentials.
 * Does not delete - keeps for audit trail.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the account type (default to microsoft_365)
    const { account_type = 'microsoft_365' } = req.body || {};

    // Deactivate the account (don't delete for audit trail)
    const { data, error } = await supabase
      .from('system_account_credentials')
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('account_type', account_type)
      .select('account_email')
      .single();

    if (error) {
      console.error('[SystemAccount] Disconnect error:', error);
      return res.status(500).json({
        error: 'Failed to disconnect account',
        details: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        error: 'No system account found to disconnect'
      });
    }

    // Log the disconnection
    await supabase.from('system_account_refresh_log').insert({
      account_type,
      refresh_type: 'disconnect',
      success: true
    });

    console.log('[SystemAccount] Disconnected:', data.account_email);

    return res.status(200).json({
      success: true,
      disconnected: data.account_email
    });

  } catch (error) {
    console.error('[SystemAccount] Disconnect error:', error);
    return res.status(500).json({
      error: 'Failed to disconnect account',
      details: error.message
    });
  }
};
