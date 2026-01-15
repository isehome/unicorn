/**
 * api/ha/entities.js
 * Get all entities from customer's Home Assistant
 * GET /api/ha/entities?project_id=xxx&domain=media_player&category=audio
 *
 * Domains: media_player, light, switch, sensor, binary_sensor, climate, cover, etc.
 * Categories: audio, lighting, climate, shades, security, sensors, network, other
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map HA domains to friendly categories
const DOMAIN_CATEGORIES = {
  media_player: 'audio',
  light: 'lighting',
  switch: 'lighting',
  climate: 'climate',
  cover: 'shades',
  camera: 'security',
  alarm_control_panel: 'security',
  sensor: 'sensors',
  binary_sensor: 'sensors',
  device_tracker: 'network',
  person: 'network'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id, domain, category } = req.query;

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  try {
    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('[HA Entities] DB error:', dbError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured' });
    }

    console.log('[HA Entities] Fetching from:', haConfig.ha_url);

    // Get all states from HA
    const haResponse = await fetch(`${haConfig.ha_url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!haResponse.ok) {
      return res.status(502).json({ error: `HA API error: ${haResponse.status}` });
    }

    let entities = await haResponse.json();

    // Filter by domain if specified
    if (domain) {
      entities = entities.filter(e => e.entity_id.startsWith(domain + '.'));
    }

    // Filter by category if specified
    if (category && category !== 'all') {
      const domainsInCategory = Object.entries(DOMAIN_CATEGORIES)
        .filter(([_, cat]) => cat === category)
        .map(([dom, _]) => dom);

      entities = entities.filter(e => {
        const entityDomain = e.entity_id.split('.')[0];
        return domainsInCategory.includes(entityDomain);
      });
    }

    // Format response
    const formatted = entities.map(e => {
      const entityDomain = e.entity_id.split('.')[0];
      return {
        entity_id: e.entity_id,
        name: e.attributes.friendly_name || e.entity_id,
        state: e.state,
        domain: entityDomain,
        category: DOMAIN_CATEGORIES[entityDomain] || 'other',
        is_online: e.state !== 'unavailable' && e.state !== 'unknown',
        attributes: {
          ip_address: e.attributes.ip_address || null,
          mac_address: e.attributes.mac_address || null,
          model: e.attributes.model || e.attributes.device_class || null,
          manufacturer: e.attributes.manufacturer || null,
          area: e.attributes.area_id || null,
          device_class: e.attributes.device_class || null,
          unit_of_measurement: e.attributes.unit_of_measurement || null
        },
        last_changed: e.last_changed,
        last_updated: e.last_updated
      };
    });

    // Sort by name
    formatted.sort((a, b) => a.name.localeCompare(b.name));

    console.log('[HA Entities] Returning', formatted.length, 'entities');

    return res.json({
      success: true,
      count: formatted.length,
      entities: formatted
    });

  } catch (error) {
    console.error('[HA Entities] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
