/**
 * api/ha/network-clients.js
 * Get detailed network client AND device information from Home Assistant's UniFi integration
 * GET /api/ha/network-clients?project_id=xxx
 *
 * This fetches from the custom Unicorn UniFi integration sensor:
 * sensor.unifi_connection_status
 *
 * Returns:
 * - clients: Connected network devices (computers, phones, IoT devices)
 *   - Device name, MAC address, IP address
 *   - Switch name, switch port (for wired clients)
 *   - WiFi network (SSID), AP name (for wireless clients)
 *   - Connection type (wired/wireless)
 *   - Uptime, last seen
 *
 * - devices: UniFi infrastructure (switches, APs, gateways)
 *   - MAC, IP, model, name
 *   - Category (switch, access_point, gateway)
 *   - Port table for switches
 *   - Firmware version, uptime
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

    // Extract clients and devices arrays from entity attributes
    const rawClients = entityData.attributes?.clients || [];
    const rawDevices = entityData.attributes?.devices || [];

    if (!Array.isArray(rawClients)) {
      return res.status(422).json({
        error: 'No clients data found',
        hint: 'Expected sensor.unifi_connection_status to have a "clients" attribute array'
      });
    }

    console.log('[HA Network] Found', rawClients.length, 'clients and', rawDevices.length, 'devices');

    // ===== TOPOLOGY DEBUG =====
    // Log what topology data is available from HA
    const topologySummary = rawDevices.map(d => ({
      name: d.name,
      category: d.category,
      has_uplink_mac: !!(d.uplink_mac || d.uplink?.uplink_mac),
      has_uplink_port: !!(d.uplink_remote_port || d.uplink?.uplink_remote_port),
      downlink_count: (d.downlink_table || []).length,
      lldp_count: (d.lldp_table || []).length,
      uplink_raw: d.uplink ? 'present' : 'missing',
    }));
    console.log('[HA Network] TOPOLOGY SUMMARY:', JSON.stringify(topologySummary, null, 2));

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

    // Format UniFi infrastructure devices (switches, APs, gateways)
    const devices = rawDevices.map(d => {
      // Format uptime
      let uptimeFormatted = null;
      if (d.uptime && typeof d.uptime === 'number') {
        const seconds = d.uptime;
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
        mac_address: d.mac || null,
        ip_address: d.ip || null,
        name: d.name || d.model || 'Unknown Device',
        model: d.model || null,

        // Device type
        type: d.type || null,
        category: d.category || null, // 'switch', 'access_point', 'gateway'

        // Status
        state: d.state || null,
        adopted: d.adopted || false,
        is_online: d.state === 1,

        // Version info
        version: d.version || null,
        upgradable: d.upgradable || false,

        // Timing
        uptime_seconds: d.uptime || null,
        uptime_formatted: uptimeFormatted,
        last_seen: d.last_seen || null,

        // Switch-specific
        ports_total: d.ports_total || null,
        ports_used: d.ports_used || null,
        port_table: d.port_table || [],

        // AP-specific
        num_sta: d.num_sta || null, // Number of connected stations
        channel: d.channel || null,

        // System stats
        cpu: d.cpu || null,
        mem: d.mem || null,

        // Gateway MAC (for topology)
        gateway_mac: d.gateway_mac || null,

        // *** UPLINK/TOPOLOGY DATA - CRITICAL for port mapping ***
        // These fields come from the Python collector's format_device function
        // and tell us how this device connects to the network
        uplink_mac: d.uplink_mac || null,              // MAC of upstream device this connects to
        uplink_remote_port: d.uplink_remote_port || null, // Port number on the upstream device
        uplink_device_name: d.uplink_device_name || null, // Name of upstream device
        uplink_type: d.uplink_type || null,            // Connection type (wire, etc.)

        // Full uplink object (has additional details)
        uplink: d.uplink || null,

        // Topology tables - useful for building full network map
        lldp_table: d.lldp_table || [],               // LLDP neighbor discovery
        uplink_table: d.uplink_table || [],           // All uplink connections
        downlink_table: d.downlink_table || [],       // Downstream devices connected to this
        ethernet_table: d.ethernet_table || [],       // Ethernet interfaces

        // Raw data for debugging
        _raw: d
      };
    });

    // Sort devices: gateways first, then switches, then APs
    const categoryOrder = { gateway: 0, switch: 1, access_point: 2 };
    devices.sort((a, b) => {
      const orderA = categoryOrder[a.category] ?? 99;
      const orderB = categoryOrder[b.category] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Summary stats
    const summary = {
      total_clients: clients.length,
      wired_clients: clients.filter(c => c.is_wired).length,
      wireless_clients: clients.filter(c => c.is_wireless).length,
      total_devices: devices.length,
      switches: devices.filter(d => d.category === 'switch').length,
      access_points: devices.filter(d => d.category === 'access_point').length,
      gateways: devices.filter(d => d.category === 'gateway').length
    };

    console.log('[HA Network] Returning', clients.length, 'clients and', devices.length, 'devices');

    return res.json({
      success: true,
      summary,
      clients,
      devices,
      source: 'sensor.unifi_connection_status'
    });

  } catch (error) {
    console.error('[HA Network] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
