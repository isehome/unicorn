/**
 * Email Agent Configuration
 *
 * GET: Retrieve current configuration
 * POST: Update configuration
 */

const { requireAuth } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    return getConfig(req, res);
  } else {
    return updateConfig(req, res);
  }
};

async function getConfig(req, res) {
  try {
    const { data: configs, error } = await supabase
      .from('app_configuration')
      .select('key, value, description')
      .like('key', 'email_agent_%');

    if (error) {
      console.error('[EmailConfig] GET error:', error);
      return res.status(500).json({ error: error.message });
    }

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
    console.error('[EmailConfig] GET exception:', error);
    res.status(500).json({ error: error.message });
  }
}

async function updateConfig(req, res) {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      console.error('[EmailConfig] Invalid body:', typeof updates, updates);
      return res.status(400).json({ error: 'Invalid updates' });
    }

    const errors = [];
    let savedCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      const fullKey = key.startsWith('email_agent_') ? key : `email_agent_${key}`;

      const { error } = await supabase
        .from('app_configuration')
        .update({
          value: String(value),
          updated_at: new Date().toISOString(),
        })
        .eq('key', fullKey);

      if (error) {
        console.error(`[EmailConfig] Update failed for ${fullKey}:`, error);
        errors.push(`${fullKey}: ${error.message}`);
      } else {
        savedCount++;
      }
    }

    if (errors.length > 0) {
      console.error('[EmailConfig] Save errors:', errors);
      return res.status(500).json({
        error: `Failed to save ${errors.length} config(s): ${errors.join('; ')}`,
        saved: savedCount,
      });
    }

    res.json({ success: true, message: `${savedCount} settings saved` });
  } catch (error) {
    console.error('[EmailConfig] POST exception:', error);
    res.status(500).json({ error: error.message });
  }
}
