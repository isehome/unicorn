/**
 * System Account Configure
 *
 * Endpoint: POST /api/system-account/configure
 * Updates the system account email in app_configuration
 */

const { requireAuth } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');
const { clearCaches, getSystemAccountStatus } = require('../_systemGraph');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required for internal system-account endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Update the configuration
    const { error: upsertError } = await supabase
      .from('app_configuration')
      .upsert({
        key: 'system_account_email',
        value: email.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (upsertError) {
      console.error('[SystemAccount] Configure error:', upsertError);
      return res.status(500).json({ error: 'Failed to save configuration' });
    }

    // Clear caches so the new email is used
    clearCaches();

    // Verify the new account works
    const status = await getSystemAccountStatus();

    console.log(`[SystemAccount] Configured system email: ${email}`);

    res.json({
      success: true,
      email,
      status,
    });
  } catch (err) {
    console.error('[SystemAccount] Configure error:', err);
    res.status(500).json({ error: err.message });
  }
};
