/**
 * api/ha/network-clients.js
 * Get detailed network client information from Home Assistant's UniFi integration
 * GET /api/ha/network-clients?project_id=xxx
 *
 * This fetches from the custom Unicorn UniFi integration sensor:
 * sensor.unifi_connection_status
 *
 * Returns detailed client info:
 * - Device name, MAC address, IP address
 * - Switch name, switch port (for wired clients)
 * - WiFi network (SSID), AP name (for wireless clients)
 * - Connection type (wired/wireless)
 * - Uptime, last seen
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The custom UniFi integration sensor entity ID
const UNIFI_SENSOR_ENTITY = 'sensor.unifi_connection_status';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id } = req.query;

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
      console.error('[HA Network] DB error:', dbError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured' });
    }

    console.log('[HA Network] Fetching UniFi clients from:', haConfig.ha_url);

    // Fetch the UniFi connection status sensor from HA
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
          error: `Entity ${UNIFI_SENSOR_ENTITY} not found in Home Assistant`,
          hint: 'Is the Unicorn UniFi collector integration configured in Home Assistant?'
        });
      }
      return res.status(502).json({ error: `HA API error: ${haResponse.status}` });
    }

    const entityData = await haResponse.json();

    // Extract clients array from entity attributes
    const rawClients = entityData.attributes?.clients;

    if (!rawClients || !Array.isArray(rawClients)) {
      return res.status(422).json({
        error: 'No clients data found',
        hint: 'Expected sensor.unifi_connection_status to have a "clients" attribute array'
      });
    }

    // Format with full network details
    const clients = rawClients.map(c => {
      // Format uptime
      let uptimeFormatted = null;
      if (c.uptime && typeof c.uptime === 'number') {
        const seconds = c.uptime;
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (days > 0) {
          uptimeFormatted = `${days}d ${hours}h`;
        } else if (hours > 0) {
          uptimeFormatted = `${hours}h ${mins}m`;
        } else {
          uptimeFormatted = `${mins}m`;
        }
      }

      return {
        // Core identity
        mac_address: c.mac || null,
        ip_address: c.ip || null,
        hostname: c.hostname || null,
        name: c.hostname || c.mac || 'Unknown',

        // Connection type
        is_wired: c.is_wired === true,
        is_wireless: c.is_wired === false,
        connection_type: c.is_wired ? 'wired' : 'wireless',

        // Wired connection info (switch/port)
        // Note: Python script outputs sw_name/sw_port, but we normalize to switch_name/switch_port
        switch_name: c.sw_name || c.switch_name || null,
        switch_port: c.sw_port || c.switch_port || null,
        switch_mac: c.sw_mac || c.switch_mac || null,

        // Wireless connection info
        ssid: c.ssid && c.ssid !== 'N/A' ? c.ssid : null,
        ap_name: c.ap_name || null,
        ap_mac: c.ap_mac || null,
        wifi_signal: c.signal && c.signal !== 'N/A' ? c.signal : null,

        // Timing
        uptime_seconds: c.uptime || null,
        uptime_formatted: uptimeFormatted,

        // Status - if it's in the list, it's connected
        is_connected: true,

        // Raw data for debugging
        _raw: c
      };
    });

    // Sort: wired first, then by name
    clients.sort((a, b) => {
      // Sort wired before wireless
      if (a.is_wired && !b.is_wired) return -1;
      if (!a.is_wired && b.is_wired) return 1;
      // Then alphabetically by name
      return (a.name || '').localeCompare(b.name || '');
    });

    // Summary stats
    const summary = {
      total: clients.length,
      wired: clients.filter(c => c.is_wired).length,
      wireless: clients.filter(c => c.is_wireless).length
    };

    console.log('[HA Network] Returning', clients.length, 'clients');

    return res.json({
      success: true,
      summary,
      clients,
      source: 'sensor.unifi_connection_status'
    });

  } catch (error) {
    console.error('[HA Network] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
