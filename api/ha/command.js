/**
 * api/ha/command.js
 * Execute a Home Assistant service call
 * POST /api/ha/command
 * Body: { project_id, domain, service, entity_id, data }
 *
 * Examples:
 * - { domain: "media_player", service: "play_media", entity_id: "media_player.living_room" }
 * - { domain: "light", service: "turn_on", entity_id: "light.kitchen", data: { brightness: 255 } }
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../_authMiddleware');
const { rateLimit } = require('../_rateLimiter');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Whitelist of allowed services (safety measure)
const ALLOWED_SERVICES = {
  media_player: ['play_media', 'media_play', 'media_pause', 'media_stop', 'volume_set', 'volume_up', 'volume_down', 'volume_mute', 'select_source'],
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  cover: ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'],
  climate: ['set_temperature', 'set_hvac_mode', 'set_fan_mode'],
  fan: ['turn_on', 'turn_off', 'toggle', 'set_percentage'],
  scene: ['turn_on'],
  script: ['turn_on', 'turn_off'],
  automation: ['turn_on', 'turn_off', 'trigger'],
  // Diagnostic services
  homeassistant: ['check_config', 'restart'],
  // Notify for testing
  notify: ['notify', 'persistent_notification']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!rateLimit(req, res)) return;

  const { project_id, domain, service, entity_id, data } = req.body;

  if (!project_id || !domain || !service) {
    return res.status(400).json({ error: 'project_id, domain, and service are required' });
  }

  // Check if service is allowed
  if (!ALLOWED_SERVICES[domain] || !ALLOWED_SERVICES[domain].includes(service)) {
    return res.status(403).json({
      error: 'Service not allowed',
      hint: `${domain}.${service} is not in the whitelist`,
      allowed: ALLOWED_SERVICES[domain] || []
    });
  }

  try {
    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('[HA Command] DB error:', dbError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured' });
    }

    console.log('[HA Command] Executing:', domain, service, entity_id);

    // Build service call payload
    const payload = {};
    if (entity_id) payload.entity_id = entity_id;
    if (data) Object.assign(payload, data);

    // Call HA service
    const haResponse = await fetch(`${haConfig.ha_url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!haResponse.ok) {
      const errorText = await haResponse.text();
      console.error('[HA Command] HA error:', haResponse.status, errorText);
      return res.status(502).json({
        error: `HA API error: ${haResponse.status}`,
        details: errorText
      });
    }

    const result = await haResponse.json();

    console.log('[HA Command] Success:', domain, service);

    return res.json({
      success: true,
      domain,
      service,
      entity_id,
      result
    });

  } catch (error) {
    console.error('[HA Command] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
