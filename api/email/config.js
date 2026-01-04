/**
 * Email Agent Configuration
 *
 * GET: Retrieve current configuration
 * POST: Update configuration
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return getConfig(req, res);
  } else if (req.method === 'POST') {
    return updateConfig(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};

async function getConfig(req, res) {
  try {
    const { data: configs } = await supabase
      .from('app_configuration')
      .select('key, value, description')
      .like('key', 'email_agent_%');

    const config = {};
    configs?.forEach(c => {
      const shortKey = c.key.replace('email_agent_', '');
      config[shortKey] = {
        value: c.value,
        description: c.description,
      };
    });

    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateConfig(req, res) {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid updates' });
    }

    // Update each config key
    for (const [key, value] of Object.entries(updates)) {
      const fullKey = key.startsWith('email_agent_') ? key : `email_agent_${key}`;

      await supabase
        .from('app_configuration')
        .upsert({
          key: fullKey,
          value: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
    }

    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
