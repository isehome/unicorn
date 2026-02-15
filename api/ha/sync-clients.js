/**
 * api/ha/sync-clients.js
 * Sync UniFi client data from Home Assistant to project_ha_clients table
 * POST /api/ha/sync-clients
 * Body: { projectId: string }
 *
 * Fetches sensor.unifi_connection_status from HA and upserts clients
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../_authMiddleware');
const { rateLimit } = require('../_rateLimiter');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Entity ID for UniFi connection status sensor
const UNIFI_SENSOR_ENTITY = 'sensor.unifi_connection_status';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!rateLimit(req, res)) return;

  const { projectId } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  try {
    // Get HA credentials from decrypted view
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', projectId)
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('[HA Sync Clients] DB error:', dbError);
      return res.status(500).json({ error: 'Database error fetching HA config' });
    }

    if (!haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured for this project' });
    }

    console.log('[HA Sync Clients] Fetching UniFi clients from:', haConfig.ha_url);

    // Fetch the UniFi connection status entity from HA
    const haResponse = await fetch(
      `${haConfig.ha_url}/api/states/${UNIFI_SENSOR_ENTITY}`,
      {
        headers: {
          'Authorization': `Bearer ${haConfig.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!haResponse.ok) {
      if (haResponse.status === 404) {
        return res.status(404).json({
          error: `Entity ${UNIFI_SENSOR_ENTITY} not found in Home Assistant. Is the UniFi collector configured?`
        });
      }
      return res.status(502).json({
        error: `HA API error: ${haResponse.status} ${haResponse.statusText}`
      });
    }

    const entityData = await haResponse.json();

    // Extract clients array from entity attributes
    const clients = entityData.attributes?.clients;

    if (!clients || !Array.isArray(clients)) {
      return res.status(422).json({
        error: 'No clients attribute found on UniFi entity or invalid format',
        hint: 'Expected sensor.unifi_connection_status to have a "clients" attribute array'
      });
    }

    console.log('[HA Sync Clients] Found', clients.length, 'clients to sync');

    // Map HA client data to our schema
    const syncedAt = new Date().toISOString();
    const mappedClients = clients.map(client => ({
      project_id: projectId,
      mac: client.mac?.toUpperCase() || null, // Normalize MAC to uppercase
      hostname: client.hostname || null,
      ip: client.ip || null,
      is_wired: client.is_wired === true,
      switch_name: client.is_wired ? (client.switch_name || null) : null,
      switch_port: client.is_wired ? (client.switch_port || null) : null,
      switch_mac: client.is_wired ? (client.switch_mac?.toUpperCase() || null) : null,
      ssid: !client.is_wired ? (client.ssid !== 'N/A' ? client.ssid : null) : null,
      signal: !client.is_wired ? parseSignal(client.signal) : null,
      ap_name: !client.is_wired ? (client.ap_name || null) : null,
      ap_mac: !client.is_wired ? (client.ap_mac?.toUpperCase() || null) : null,
      uptime_seconds: typeof client.uptime === 'number' ? client.uptime : null,
      is_online: true, // If they're in the list, they're online
      last_seen_at: syncedAt,
      cached_at: syncedAt
    })).filter(client => client.mac); // Filter out any clients without MAC addresses

    if (mappedClients.length === 0) {
      return res.status(200).json({
        success: true,
        clientCount: 0,
        syncedAt,
        message: 'No valid clients to sync (all clients missing MAC address)'
      });
    }

    // Upsert all clients into project_ha_clients table
    // Using ON CONFLICT with the unique constraint (project_id, mac)
    const { data: upsertedData, error: upsertError } = await supabase
      .from('project_ha_clients')
      .upsert(mappedClients, {
        onConflict: 'project_id,mac',
        ignoreDuplicates: false
      })
      .select('id');

    if (upsertError) {
      console.error('[HA Sync Clients] Upsert error:', upsertError);
      return res.status(500).json({
        error: 'Failed to save clients to database',
        details: upsertError.message
      });
    }

    // Mark clients not in this sync as offline (they weren't returned by HA)
    const syncedMacs = mappedClients.map(c => c.mac);
    const { error: offlineError } = await supabase
      .from('project_ha_clients')
      .update({ is_online: false })
      .eq('project_id', projectId)
      .not('mac', 'in', `(${syncedMacs.map(m => `"${m}"`).join(',')})`);

    if (offlineError) {
      // Log but don't fail the request
      console.error('[HA Sync Clients] Error marking offline clients:', offlineError);
    }

    console.log('[HA Sync Clients] Successfully synced', mappedClients.length, 'clients');

    return res.status(200).json({
      success: true,
      clientCount: mappedClients.length,
      syncedAt
    });

  } catch (error) {
    console.error('[HA Sync Clients] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Parse signal strength from HA data
 * Handles both numeric values and "N/A" strings
 */
function parseSignal(signal) {
  if (signal === 'N/A' || signal === null || signal === undefined) {
    return null;
  }
  const parsed = parseInt(signal, 10);
  return isNaN(parsed) ? null : parsed;
}
