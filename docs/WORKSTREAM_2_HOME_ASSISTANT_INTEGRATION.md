# Workstream 2: Home Assistant Integration

## Implementation Status (Updated January 2026)

| Phase | Description | Status | Files |
|-------|-------------|--------|-------|
| **Phase 1** | Database Schema | ✅ **COMPLETE** | `database/migrations/20260115_home_assistant_integration.sql` |
| **Phase 2** | Service Layer | ✅ **COMPLETE** | `src/services/homeAssistantService.js` |
| **Phase 3** | API Endpoints | ✅ **COMPLETE** | `api/ha/status.js`, `api/ha/entities.js`, `api/ha/command.js` |
| **Phase 4** | Retell AI Tools | ⏳ **IN PROGRESS** | See [Phase 10: Retell MCP Integration](#phase-10-retell-mcp-integration-for-sarah) |
| **Phase 5** | UI Components | ✅ **COMPLETE** | `src/components/HomeAssistantSettings.js`, `src/pages/HomeAssistantPage.js` |
| **Phase 6** | Sarah's Prompt | ⏳ **PENDING** | Update via Retell MCP |
| **Phase 7** | Update identify.js | ⏳ **PENDING** | Add HA status to customer data |
| **Phase 8** | MCP Server Integration | 📋 **DOCUMENTED** | Architecture for Unicorn AI agent |
| **Phase 9** | On-Site Agent | 📋 **FUTURE** | Raspberry Pi deployment |
| **Phase 10** | Retell MCP Integration | ⏳ **NEW** | Direct Claude access to HA via MCP |

### What's Working Now
- ✅ Database stores encrypted HA credentials per project
- ✅ API endpoints can test connection, list entities, execute commands
- ✅ UI allows configuring and testing HA connections
- ✅ Service layer for frontend integration

### What's Needed to Complete
- ⏳ Create Retell tools that call `/api/ha/*` endpoints
- ⏳ Update Sarah's prompt to use HA tools
- ⏳ Add HA status to `identify.js` response
- ⏳ **NEW:** Use Retell MCP to configure tools directly from Claude

---

## Overview

**Problem:** Sarah (AI voice agent) cannot diagnose specific customer devices remotely. She knows a customer has "Sonos" but can't say "Your master bedroom Sonos Arc at 192.168.1.120 appears to be offline."

**Solution:** Integrate with Home Assistant (deployed to every customer) as a universal device bridge.

**Prerequisite:** ✅ Workstream 1 (Secure Data Encryption) is COMPLETE - encryption functions are available.

---

## Why Home Assistant?

1. **Already deployed to every customer** - No new hardware needed
2. **Universal integration hub** - Connects to UniFi, Sonos, Lutron, Control4, etc.
3. **Remote access via Nabu Casa** - ~$6.50/month cloud service for remote API access
4. **REST API** - Well-documented, easy to query device states
5. **Covers the UniFi gap** - HA can see all network clients that Site Manager API can't expose

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Sarah (Retell) │────▶│  Vercel API      │────▶│  Nabu Casa      │
│  Voice Agent    │     │  /api/ha/*       │     │  (HA Cloud)     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Customer's     │
                                                 │  Home Assistant │
                                                 └────────┬────────┘
                                                          │
                        ┌─────────────────────────────────┼─────────────────────────────────┐
                        │                                 │                                 │
                        ▼                                 ▼                                 ▼
               ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
               │  UniFi Network  │             │  Sonos Speakers │             │  Lutron Shades  │
               │  (all clients)  │             │                 │             │                 │
               └─────────────────┘             └─────────────────┘             └─────────────────┘
```

---

## Implementation Plan

### Phase 1: Database Schema

Create table for storing HA credentials per project. Uses existing encryption functions from Workstream 1.

**File to create:** `database/migrations/20260115_home_assistant_integration.sql`

```sql
-- ============================================================
-- Home Assistant Integration Schema
-- Uses existing encrypt_field/decrypt_field from Workstream 1
-- ============================================================

-- Main table for HA credentials per project
CREATE TABLE project_home_assistant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Connection details (encrypted using existing Vault infrastructure)
  ha_url_encrypted text,           -- Nabu Casa URL or local URL
  access_token_encrypted text,     -- Long-lived access token

  -- Metadata (not sensitive - stored plaintext)
  instance_name text,               -- Friendly name (e.g., "Smith Residence HA")
  nabu_casa_enabled boolean DEFAULT true,

  -- Status tracking
  last_connected_at timestamptz,
  last_error text,
  device_count integer DEFAULT 0,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  UNIQUE(project_id)
);

-- Index for lookups
CREATE INDEX idx_project_ha_project ON project_home_assistant(project_id);

-- RLS
ALTER TABLE project_home_assistant ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project HA settings"
ON project_home_assistant FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert project HA settings"
ON project_home_assistant FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update project HA settings"
ON project_home_assistant FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Users can delete project HA settings"
ON project_home_assistant FOR DELETE
TO authenticated
USING (true);

-- Decrypted view (uses existing decrypt_field function)
CREATE OR REPLACE VIEW project_home_assistant_decrypted AS
SELECT
  id,
  project_id,
  decrypt_field(ha_url_encrypted, 'project_secure_data_key') as ha_url,
  decrypt_field(access_token_encrypted, 'project_secure_data_key') as access_token,
  instance_name,
  nabu_casa_enabled,
  last_connected_at,
  last_error,
  device_count,
  created_at,
  updated_at,
  created_by
FROM project_home_assistant;

GRANT SELECT ON project_home_assistant_decrypted TO anon, authenticated;

-- RPC function to create HA config with encryption
CREATE OR REPLACE FUNCTION create_project_home_assistant(
  p_project_id uuid,
  p_ha_url text,
  p_access_token text,
  p_instance_name text DEFAULT NULL,
  p_nabu_casa_enabled boolean DEFAULT true,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF p_ha_url IS NULL OR p_ha_url = '' THEN
    RAISE EXCEPTION 'ha_url is required';
  END IF;

  IF p_access_token IS NULL OR p_access_token = '' THEN
    RAISE EXCEPTION 'access_token is required';
  END IF;

  INSERT INTO project_home_assistant (
    project_id,
    ha_url_encrypted,
    access_token_encrypted,
    instance_name,
    nabu_casa_enabled,
    created_by
  ) VALUES (
    p_project_id,
    encrypt_field(p_ha_url, 'project_secure_data_key'),
    encrypt_field(p_access_token, 'project_secure_data_key'),
    p_instance_name,
    p_nabu_casa_enabled,
    p_created_by
  )
  ON CONFLICT (project_id) DO UPDATE SET
    ha_url_encrypted = encrypt_field(p_ha_url, 'project_secure_data_key'),
    access_token_encrypted = encrypt_field(p_access_token, 'project_secure_data_key'),
    instance_name = COALESCE(p_instance_name, project_home_assistant.instance_name),
    nabu_casa_enabled = p_nabu_casa_enabled,
    updated_at = now()
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to update HA config
CREATE OR REPLACE FUNCTION update_project_home_assistant(
  p_project_id uuid,
  p_ha_url text DEFAULT NULL,
  p_access_token text DEFAULT NULL,
  p_instance_name text DEFAULT NULL,
  p_nabu_casa_enabled boolean DEFAULT NULL,
  p_last_connected_at timestamptz DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_device_count integer DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  result_id uuid;
BEGIN
  UPDATE project_home_assistant SET
    ha_url_encrypted = CASE
      WHEN p_ha_url IS NOT NULL THEN encrypt_field(p_ha_url, 'project_secure_data_key')
      ELSE ha_url_encrypted
    END,
    access_token_encrypted = CASE
      WHEN p_access_token IS NOT NULL THEN encrypt_field(p_access_token, 'project_secure_data_key')
      ELSE access_token_encrypted
    END,
    instance_name = COALESCE(p_instance_name, instance_name),
    nabu_casa_enabled = COALESCE(p_nabu_casa_enabled, nabu_casa_enabled),
    last_connected_at = COALESCE(p_last_connected_at, last_connected_at),
    last_error = p_last_error,  -- Allow setting to NULL
    device_count = COALESCE(p_device_count, device_count),
    updated_at = now()
  WHERE project_id = p_project_id
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_project_home_assistant TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_project_home_assistant TO anon, authenticated;

-- Add comments
COMMENT ON TABLE project_home_assistant IS 'Home Assistant connection credentials per project';
COMMENT ON VIEW project_home_assistant_decrypted IS 'Decrypted view of project_home_assistant';
```

---

### Phase 2: Service Layer

**File to create:** `src/services/homeAssistantService.js`

```javascript
/**
 * Home Assistant Service
 * Handles all HA-related database operations and API calls
 */
import { supabase } from './supabase';

const homeAssistantService = {
  /**
   * Get HA config for a project (decrypted)
   */
  async getForProject(projectId) {
    const { data, error } = await supabase
      .from('project_home_assistant_decrypted')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  /**
   * Create or update HA config for a project
   */
  async upsert(projectId, config, userId = null) {
    const { data, error } = await supabase.rpc('create_project_home_assistant', {
      p_project_id: projectId,
      p_ha_url: config.ha_url,
      p_access_token: config.access_token,
      p_instance_name: config.instance_name || null,
      p_nabu_casa_enabled: config.nabu_casa_enabled ?? true,
      p_created_by: userId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update connection status
   */
  async updateStatus(projectId, { lastConnected, lastError, deviceCount }) {
    const { data, error } = await supabase.rpc('update_project_home_assistant', {
      p_project_id: projectId,
      p_last_connected_at: lastConnected || null,
      p_last_error: lastError,
      p_device_count: deviceCount || null
    });

    if (error) throw error;
    return data;
  },

  /**
   * Delete HA config for a project
   */
  async delete(projectId) {
    const { error } = await supabase
      .from('project_home_assistant')
      .delete()
      .eq('project_id', projectId);

    if (error) throw error;
    return true;
  },

  /**
   * Test connection to HA instance
   * Calls the backend API which handles the actual HA communication
   */
  async testConnection(projectId) {
    const response = await fetch(`/api/ha/status?project_id=${projectId}`);
    return response.json();
  }
};

export default homeAssistantService;
```

---

### Phase 3: API Endpoints

#### `/api/ha/status.js` - Check HA Connection

**File to create:** `api/ha/status.js`

```javascript
/**
 * api/ha/status.js
 * Check Home Assistant connection status for a project
 * GET /api/ha/status?project_id=xxx
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    // Get HA credentials from decrypted view
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('*')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.json({
        connected: false,
        configured: false,
        message: 'Home Assistant not configured for this project'
      });
    }

    // Call Home Assistant API
    const haResponse = await fetch(`${haConfig.ha_url}/api/`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (!haResponse.ok) {
      // Update error status in database
      await supabase.rpc('update_project_home_assistant', {
        p_project_id: project_id,
        p_last_error: `HTTP ${haResponse.status}: ${haResponse.statusText}`
      });

      return res.json({
        connected: false,
        configured: true,
        error: `HA returned ${haResponse.status}`,
        instance_name: haConfig.instance_name
      });
    }

    const haData = await haResponse.json();

    // Get entity count
    const statesResponse = await fetch(`${haConfig.ha_url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let deviceCount = 0;
    if (statesResponse.ok) {
      const states = await statesResponse.json();
      deviceCount = states.length;
    }

    // Update success status in database
    await supabase.rpc('update_project_home_assistant', {
      p_project_id: project_id,
      p_last_connected_at: new Date().toISOString(),
      p_last_error: null,
      p_device_count: deviceCount
    });

    return res.json({
      connected: true,
      configured: true,
      instance_name: haConfig.instance_name,
      ha_version: haData.version,
      device_count: deviceCount,
      last_connected: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HA Status] Error:', error);

    // Update error status
    if (project_id) {
      await supabase.rpc('update_project_home_assistant', {
        p_project_id: project_id,
        p_last_error: error.message
      }).catch(() => {}); // Ignore update errors
    }

    return res.json({
      connected: false,
      configured: true,
      error: error.message
    });
  }
};
```

#### `/api/ha/entities.js` - List Devices/Entities

**File to create:** `api/ha/entities.js`

```javascript
/**
 * api/ha/entities.js
 * Get all entities from customer's Home Assistant
 * GET /api/ha/entities?project_id=xxx&domain=media_player
 *
 * Domains: media_player, light, switch, sensor, binary_sensor, climate, cover, etc.
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

    if (dbError || !haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured' });
    }

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
    const formatted = entities.map(e => ({
      entity_id: e.entity_id,
      name: e.attributes.friendly_name || e.entity_id,
      state: e.state,
      domain: e.entity_id.split('.')[0],
      category: DOMAIN_CATEGORIES[e.entity_id.split('.')[0]] || 'other',
      attributes: {
        ip_address: e.attributes.ip_address || null,
        mac_address: e.attributes.mac_address || null,
        model: e.attributes.model || e.attributes.device_class || null,
        manufacturer: e.attributes.manufacturer || null,
        area: e.attributes.area_id || null
      },
      last_changed: e.last_changed
    }));

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
```

#### `/api/ha/command.js` - Execute HA Service Call

**File to create:** `api/ha/command.js`

```javascript
/**
 * api/ha/command.js
 * Execute a Home Assistant service call
 * POST /api/ha/command
 * Body: { project_id, domain, service, entity_id, data }
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Whitelist of allowed services (safety measure)
const ALLOWED_SERVICES = {
  media_player: ['play_media', 'media_play', 'media_pause', 'media_stop', 'volume_set', 'volume_up', 'volume_down'],
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  cover: ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'],
  climate: ['set_temperature', 'set_hvac_mode'],
  // Diagnostic services
  homeassistant: ['check_config'],
  script: ['reload'],
  // Notify for testing
  notify: ['notify']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id, domain, service, entity_id, data } = req.body;

  if (!project_id || !domain || !service) {
    return res.status(400).json({ error: 'project_id, domain, and service are required' });
  }

  // Check if service is allowed
  if (!ALLOWED_SERVICES[domain] || !ALLOWED_SERVICES[domain].includes(service)) {
    return res.status(403).json({
      error: 'Service not allowed',
      hint: `${domain}.${service} is not in the whitelist`
    });
  }

  try {
    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.status(404).json({ error: 'Home Assistant not configured' });
    }

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
      return res.status(502).json({
        error: `HA API error: ${haResponse.status}`,
        details: errorText
      });
    }

    const result = await haResponse.json();

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
```

---

### Phase 4: Retell AI Tools

Create webhook endpoints that Retell will call when Sarah uses these tools.

#### `/api/retell/check-home-device.js`

**File to create:** `api/retell/check-home-device.js`

```javascript
/**
 * api/retell/check-home-device.js
 * Retell tool: Check if a specific device is online
 *
 * Tool config in Retell:
 * {
 *   "name": "check_home_device",
 *   "description": "Check if a specific device is online and get its current status. Use when customer reports a device issue.",
 *   "parameters": {
 *     "project_id": { "type": "string", "description": "The customer's project ID" },
 *     "device_type": { "type": "string", "enum": ["sonos", "tv", "light", "thermostat", "shade", "camera", "network"], "description": "Type of device" },
 *     "location": { "type": "string", "description": "Room or location name" }
 *   }
 * }
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map device types to HA domains
const DEVICE_TYPE_DOMAINS = {
  sonos: ['media_player'],
  tv: ['media_player'],
  light: ['light', 'switch'],
  thermostat: ['climate'],
  shade: ['cover'],
  camera: ['camera'],
  network: ['device_tracker', 'binary_sensor']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Handle Retell's args wrapper
    let body = req.body;
    if (req.body?.args) body = req.body.args;

    const { project_id, device_type, location } = body;

    if (!project_id) {
      return res.json({
        result: {
          found: false,
          message: "I need the customer's project information to check their devices."
        }
      });
    }

    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.json({
        result: {
          found: false,
          message: "I don't have access to this customer's home automation system yet."
        }
      });
    }

    // Get all states from HA
    const haResponse = await fetch(`${haConfig.ha_url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!haResponse.ok) {
      return res.json({
        result: {
          found: false,
          message: "I'm having trouble connecting to the home automation system right now."
        }
      });
    }

    const entities = await haResponse.json();

    // Filter by device type
    const targetDomains = device_type ? DEVICE_TYPE_DOMAINS[device_type] || [] : [];
    let filtered = entities;

    if (targetDomains.length > 0) {
      filtered = entities.filter(e => {
        const domain = e.entity_id.split('.')[0];
        return targetDomains.includes(domain);
      });
    }

    // Filter by location (fuzzy match on friendly_name or entity_id)
    if (location) {
      const locationLower = location.toLowerCase().replace(/[^a-z0-9]/g, '');
      filtered = filtered.filter(e => {
        const name = (e.attributes.friendly_name || e.entity_id).toLowerCase().replace(/[^a-z0-9]/g, '');
        return name.includes(locationLower);
      });
    }

    if (filtered.length === 0) {
      return res.json({
        result: {
          found: false,
          message: `I couldn't find a ${device_type || 'device'} ${location ? 'in the ' + location : ''} in the system.`
        }
      });
    }

    // Return first matching device
    const device = filtered[0];
    const isOnline = device.state !== 'unavailable' && device.state !== 'unknown';
    const ipAddress = device.attributes.ip_address || null;

    let statusMessage = '';
    if (!isOnline) {
      statusMessage = `Your ${device.attributes.friendly_name || device_type} appears to be offline or unreachable.`;
    } else {
      statusMessage = `Your ${device.attributes.friendly_name || device_type} is online`;
      if (ipAddress) statusMessage += ` at ${ipAddress}`;
      statusMessage += `. It's currently ${device.state}.`;
    }

    return res.json({
      result: {
        found: true,
        device_name: device.attributes.friendly_name || device.entity_id,
        entity_id: device.entity_id,
        status: isOnline ? 'online' : 'offline',
        state: device.state,
        ip_address: ipAddress,
        message: statusMessage
      }
    });

  } catch (error) {
    console.error('[Check Home Device] Error:', error);
    return res.json({
      result: {
        found: false,
        message: "I encountered an error checking the device. Let me create a ticket for a technician to investigate."
      }
    });
  }
};
```

#### `/api/retell/list-home-devices.js`

**File to create:** `api/retell/list-home-devices.js`

```javascript
/**
 * api/retell/list-home-devices.js
 * Retell tool: List all smart devices at customer location
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORY_DOMAINS = {
  audio: ['media_player'],
  video: ['media_player'],
  lighting: ['light', 'switch'],
  climate: ['climate'],
  shades: ['cover'],
  network: ['device_tracker'],
  security: ['camera', 'alarm_control_panel']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (req.body?.args) body = req.body.args;

    const { project_id, device_type } = body;

    if (!project_id) {
      return res.json({
        result: {
          success: false,
          message: "I need the customer's project information."
        }
      });
    }

    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.json({
        result: {
          success: false,
          message: "Home Assistant is not configured for this customer."
        }
      });
    }

    // Get all states
    const haResponse = await fetch(`${haConfig.ha_url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!haResponse.ok) {
      return res.json({
        result: {
          success: false,
          message: "Unable to connect to home automation system."
        }
      });
    }

    const entities = await haResponse.json();

    // Filter by category
    let filtered = entities;
    if (device_type && device_type !== 'all') {
      const domains = CATEGORY_DOMAINS[device_type] || [];
      filtered = entities.filter(e => {
        const domain = e.entity_id.split('.')[0];
        return domains.includes(domain);
      });
    } else {
      // Filter to only "interesting" domains
      const interestingDomains = Object.values(CATEGORY_DOMAINS).flat();
      filtered = entities.filter(e => {
        const domain = e.entity_id.split('.')[0];
        return interestingDomains.includes(domain);
      });
    }

    // Group by domain
    const grouped = {};
    filtered.forEach(e => {
      const domain = e.entity_id.split('.')[0];
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push({
        name: e.attributes.friendly_name || e.entity_id,
        state: e.state,
        online: e.state !== 'unavailable' && e.state !== 'unknown'
      });
    });

    // Build summary message
    const summaryParts = [];
    if (grouped.media_player) {
      const online = grouped.media_player.filter(d => d.online).length;
      summaryParts.push(`${online} of ${grouped.media_player.length} speakers/TVs online`);
    }
    if (grouped.light) {
      const on = grouped.light.filter(d => d.state === 'on').length;
      summaryParts.push(`${on} of ${grouped.light.length} lights on`);
    }
    if (grouped.climate) {
      summaryParts.push(`${grouped.climate.length} thermostat(s)`);
    }

    return res.json({
      result: {
        success: true,
        total_devices: filtered.length,
        summary: summaryParts.join(', ') || `${filtered.length} devices found`,
        devices: grouped,
        message: `I found ${filtered.length} devices. ${summaryParts.join(', ')}.`
      }
    });

  } catch (error) {
    console.error('[List Home Devices] Error:', error);
    return res.json({
      result: {
        success: false,
        message: "Error retrieving device list."
      }
    });
  }
};
```

#### `/api/retell/test-home-device.js`

**File to create:** `api/retell/test-home-device.js`

```javascript
/**
 * api/retell/test-home-device.js
 * Retell tool: Run a quick test on a device
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (req.body?.args) body = req.body.args;

    const { project_id, entity_id, test_type } = body;

    if (!project_id || !entity_id) {
      return res.json({
        result: {
          success: false,
          message: "I need the project and device information to run a test."
        }
      });
    }

    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.json({
        result: {
          success: false,
          message: "Home Assistant not configured."
        }
      });
    }

    const domain = entity_id.split('.')[0];
    let service, payload, successMessage;

    // Determine test action based on device type and test_type
    switch (test_type) {
      case 'play_sound':
        if (domain === 'media_player') {
          // Play a short notification sound or TTS
          service = 'play_media';
          payload = {
            entity_id,
            media_content_type: 'music',
            media_content_id: 'media-source://tts/google_translate?message=Test+sound+from+Intelligent+Systems'
          };
          successMessage = "I've played a test sound on the speaker. Did you hear it?";
        }
        break;

      case 'identify':
        if (domain === 'light') {
          // Flash the light
          service = 'toggle';
          payload = { entity_id };
          successMessage = "I've toggled the light. Did you see it flash?";
          // Toggle it back after a moment (would need setTimeout or second call)
        }
        break;

      case 'ping':
      default:
        // Just check the state
        const stateResponse = await fetch(`${haConfig.ha_url}/api/states/${entity_id}`, {
          headers: {
            'Authorization': `Bearer ${haConfig.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (stateResponse.ok) {
          const state = await stateResponse.json();
          const isOnline = state.state !== 'unavailable' && state.state !== 'unknown';
          return res.json({
            result: {
              success: true,
              test_type: 'ping',
              online: isOnline,
              state: state.state,
              message: isOnline
                ? `The device is responding. Current state: ${state.state}`
                : "The device is not responding."
            }
          });
        }
        break;
    }

    // Execute service if determined
    if (service) {
      const haResponse = await fetch(`${haConfig.ha_url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${haConfig.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (haResponse.ok) {
        return res.json({
          result: {
            success: true,
            test_type,
            message: successMessage
          }
        });
      }
    }

    return res.json({
      result: {
        success: false,
        message: "I wasn't able to run that test on this device type."
      }
    });

  } catch (error) {
    console.error('[Test Home Device] Error:', error);
    return res.json({
      result: {
        success: false,
        message: "Error running device test."
      }
    });
  }
};
```

---

### Phase 5: UI Component

**File to create:** `src/components/HomeAssistantSettings.js`

```javascript
/**
 * HomeAssistantSettings.js
 * UI component for configuring Home Assistant integration per project
 */
import React, { useState, useEffect } from 'react';
import homeAssistantService from '../services/homeAssistantService';

function HomeAssistantSettings({ projectId }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  // Form state
  const [haUrl, setHaUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [projectId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await homeAssistantService.getForProject(projectId);
      if (data) {
        setConfig(data);
        setHaUrl(data.ha_url || '');
        setAccessToken(data.access_token || '');
        setInstanceName(data.instance_name || '');
      }
    } catch (err) {
      console.error('Error loading HA config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await homeAssistantService.upsert(projectId, {
        ha_url: haUrl,
        access_token: accessToken,
        instance_name: instanceName
      });
      await loadConfig();
      setTestResult({ success: true, message: 'Configuration saved!' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await homeAssistantService.testConnection(projectId);
      setTestResult(result);
    } catch (err) {
      setTestResult({ connected: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove Home Assistant configuration?')) return;

    try {
      await homeAssistantService.delete(projectId);
      setConfig(null);
      setHaUrl('');
      setAccessToken('');
      setInstanceName('');
      setTestResult(null);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="p-4">Loading Home Assistant configuration...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Home Assistant Integration</h3>
        {config && (
          <span className={`px-2 py-1 rounded text-sm ${
            config.last_error ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {config.last_error ? 'Error' : config.last_connected_at ? 'Connected' : 'Not tested'}
          </span>
        )}
      </div>

      {config?.device_count > 0 && (
        <div className="mb-4 text-sm text-gray-600">
          {config.device_count} devices detected • Last connected: {new Date(config.last_connected_at).toLocaleString()}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {testResult && (
        <div className={`mb-4 p-3 rounded ${
          testResult.connected || testResult.success
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {testResult.message || (testResult.connected
            ? `Connected! HA version ${testResult.ha_version}, ${testResult.device_count} devices`
            : `Connection failed: ${testResult.error}`
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Instance Name (optional)
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="e.g., Smith Residence HA"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Home Assistant URL *
          </label>
          <input
            type="url"
            value={haUrl}
            onChange={(e) => setHaUrl(e.target.value)}
            placeholder="https://xxxxx.ui.nabu.casa"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="mt-1 text-xs text-gray-500">
            Nabu Casa URL (recommended) or local URL if accessible
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Long-Lived Access Token *
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
            >
              {showToken ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Create in HA: Profile → Long-Lived Access Tokens → Create Token
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !haUrl || !accessToken}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {config && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default HomeAssistantSettings;
```

---

### Phase 6: Update Sarah's Prompt

Add to Sarah's system prompt in Retell Dashboard:

```
## Home Device Diagnostics

You have access to the customer's Home Assistant system for live device diagnostics.

When a customer reports an issue with a smart device:

1. First use `check_home_device` with their project_id to see if the device is online
2. If the device is offline, check related network devices or the gateway
3. If the device is online but not working correctly, suggest basic troubleshooting
4. Use `test_device` to verify functionality (e.g., play test sound on speaker, flash a light)

You can diagnose: Sonos speakers, TVs, lights, thermostats, shades, cameras, and network devices.

Example conversation flow:
- Customer: "My Sonos in the bedroom isn't playing music"
- Sarah: "Let me check your bedroom Sonos... [calls check_home_device] I can see your Master Bedroom Sonos Arc is online at 192.168.1.120. It's currently idle. Would you like me to play a test sound to make sure it's working?"
- Customer: "Yes please"
- Sarah: [calls test_device with play_sound] "I've sent a test sound. Did you hear it?"

If the device appears offline or you can't diagnose remotely, offer to create a service ticket.
```

---

### Phase 7: Update identify.js

**File to modify:** `api/retell/identify.js`

Add HA status to customer identification response so Sarah knows if HA is available:

```javascript
// After getting customer data, also check for HA config
const { data: haConfig } = await supabase
  .from('project_home_assistant')
  .select('id, last_connected_at, device_count, last_error')
  .eq('project_id', primaryProject?.id)
  .single();

// Include in response
return res.json({
  result: {
    // ... existing fields ...
    home_assistant: haConfig ? {
      configured: true,
      device_count: haConfig.device_count,
      last_connected: haConfig.last_connected_at,
      has_error: !!haConfig.last_error
    } : {
      configured: false
    }
  }
});
```

---

## Retell Dashboard Configuration

### Add Custom Tools in Retell

1. Go to Retell Dashboard → Your Agent → Tools
2. Add these three custom tools:

**Tool 1: check_home_device**
```json
{
  "type": "webhook",
  "name": "check_home_device",
  "description": "Check if a specific device is online and get its current status. Use when customer reports a device issue.",
  "url": "https://your-app.vercel.app/api/retell/check-home-device",
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "The customer's project ID (from identification)"
      },
      "device_type": {
        "type": "string",
        "enum": ["sonos", "tv", "light", "thermostat", "shade", "camera", "network"],
        "description": "Type of device to check"
      },
      "location": {
        "type": "string",
        "description": "Room or location name (e.g., 'master bedroom', 'living room')"
      }
    },
    "required": ["project_id"]
  }
}
```

**Tool 2: list_customer_devices**
```json
{
  "type": "webhook",
  "name": "list_customer_devices",
  "description": "Get a list of all smart devices at the customer's location.",
  "url": "https://your-app.vercel.app/api/retell/list-home-devices",
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "The customer's project ID"
      },
      "device_type": {
        "type": "string",
        "enum": ["all", "audio", "video", "lighting", "climate", "shades", "network"],
        "description": "Filter by device category"
      }
    },
    "required": ["project_id"]
  }
}
```

**Tool 3: test_device**
```json
{
  "type": "webhook",
  "name": "test_device",
  "description": "Run a quick test on a device (play test sound, flash light, etc.)",
  "url": "https://your-app.vercel.app/api/retell/test-home-device",
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "The customer's project ID"
      },
      "entity_id": {
        "type": "string",
        "description": "The Home Assistant entity ID to test"
      },
      "test_type": {
        "type": "string",
        "enum": ["ping", "identify", "play_sound"],
        "description": "Type of test to run"
      }
    },
    "required": ["project_id", "entity_id"]
  }
}
```

---

## Files Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `database/migrations/20260115_home_assistant_integration.sql` | DB schema |
| `src/services/homeAssistantService.js` | Service layer |
| `api/ha/status.js` | Check HA connection |
| `api/ha/entities.js` | List all entities |
| `api/ha/command.js` | Execute service calls |
| `api/retell/check-home-device.js` | Retell tool |
| `api/retell/list-home-devices.js` | Retell tool |
| `api/retell/test-home-device.js` | Retell tool |
| `src/components/HomeAssistantSettings.js` | UI component |

### Files to Modify

| File | Changes |
|------|---------|
| `api/retell/identify.js` | Add HA status to response |
| Project Settings page | Add HomeAssistantSettings component |
| Retell Dashboard | Add 3 custom tools |

---

## Testing Checklist

- [ ] Run database migration successfully
- [ ] HA credentials stored encrypted (verify in DB - should see encrypted text)
- [ ] Decrypted view returns plaintext correctly
- [ ] Connection test works from Unicorn UI
- [ ] Entity list populates correctly
- [ ] API `/api/ha/status` returns correct data
- [ ] API `/api/ha/entities` returns filtered entities
- [ ] API `/api/ha/command` executes service (test with light toggle)
- [ ] Retell tool `check_home_device` returns device status
- [ ] Retell tool `list_customer_devices` returns device list
- [ ] Retell tool `test_device` plays sound/flashes light
- [ ] Sarah can use tools in live call
- [ ] Test with real Nabu Casa connection
- [ ] Verify audit logging (if implemented)

---

## Customer Setup Process

For each customer project:

1. **Verify Nabu Casa subscription** (~$6.50/month for remote access)
2. **Generate Long-Lived Access Token** in HA
   - Open Home Assistant
   - Click your profile (bottom left)
   - Scroll to "Long-Lived Access Tokens"
   - Click "Create Token"
   - Name it "Unicorn Integration"
   - Copy the token (shown only once!)
3. **Enter in Unicorn**
   - Go to Project → Settings → Home Assistant
   - Paste Nabu Casa URL and token
   - Click "Test Connection"
4. **Verify device count** shows correctly
5. **Test with Sarah** - Call and ask about a device

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1 (DB Migration) | 30 min |
| Phase 2 (Service Layer) | 1 hour |
| Phase 3 (API Endpoints) | 3 hours |
| Phase 4 (Retell Tools) | 3 hours |
| Phase 5 (UI Component) | 2 hours |
| Phase 6 (Sarah's Prompt) | 30 min |
| Phase 7 (identify.js update) | 30 min |
| Retell Dashboard Config | 30 min |
| Testing | 3 hours |

**Total: ~14-15 hours**

---

## CRITICAL: UniFi Network Client Data via Home Assistant

### The Goal
Sarah should be able to say: **"Your Sonos Arc is online at 192.168.1.120, connected to the office switch on port 8"**

This requires getting **granular network client data** including:
- IP address
- MAC address
- Hostname
- **Which switch the device is connected to**
- **Which port on that switch**
- Wired vs WiFi
- Signal strength (wireless)
- Uptime

### Why Home Assistant + UniFi Integration

The UniFi Site Manager API (api.ui.com) does NOT expose client data remotely. But the **UniFi integration in Home Assistant** connects directly to the local controller and CAN access all client data.

When properly configured, each client entity in HA should have attributes like:
```json
{
  "entity_id": "device_tracker.sonos_living_room",
  "state": "home",
  "attributes": {
    "ip": "192.168.1.120",
    "mac": "aa:bb:cc:dd:ee:ff",
    "hostname": "Sonos-Living-Room",
    "sw_mac": "24:5a:4c:xx:xx:xx",
    "sw_port": 8,
    "wired": true,
    "uptime": 123456,
    "ap_mac": null,
    "essid": null
  }
}
```

### Setup Requirements

1. **UniFi Integration must be installed in HA**
   - Settings → Devices & Services → Add Integration → "UniFi Network"
   - Enter local controller IP (e.g., 192.168.1.1) and admin credentials

2. **Enable client tracking in integration options:**
   - ✅ Track network clients
   - ✅ Track wired clients
   - ✅ Track wireless clients

3. **Nabu Casa for remote access** - So our API can reach HA from Vercel

### API Enhancement for Network Data

Add to `/api/ha/entities.js` - special handling for `device_tracker` domain:

```javascript
// For device_tracker entities (network clients), extract network details
if (e.entity_id.startsWith('device_tracker.')) {
  return {
    entity_id: e.entity_id,
    name: e.attributes.friendly_name || e.attributes.hostname || e.entity_id,
    state: e.state,
    domain: 'device_tracker',
    category: 'network',
    network_info: {
      ip_address: e.attributes.ip || null,
      mac_address: e.attributes.mac || null,
      hostname: e.attributes.hostname || null,
      switch_mac: e.attributes.sw_mac || null,
      switch_port: e.attributes.sw_port || null,
      is_wired: e.attributes.wired || false,
      access_point_mac: e.attributes.ap_mac || null,
      wifi_network: e.attributes.essid || null,
      signal_strength: e.attributes.rssi || null,
      uptime_seconds: e.attributes.uptime || null
    },
    last_changed: e.last_changed
  };
}
```

### New Retell Tool: `check_network_client`

```json
{
  "name": "check_network_client",
  "description": "Check network status of a specific device - IP, switch port, connection type. Use when customer has connectivity issues with a specific device.",
  "parameters": {
    "project_id": { "type": "string", "description": "Customer's project ID" },
    "device_name": { "type": "string", "description": "Name or hostname of the device (e.g., 'Sonos', 'Apple TV', 'printer')" }
  }
}
```

### Sarah Conversation Example

```
Customer: "My Sonos in the living room isn't showing up in the app"

Sarah: "Let me check your network... [calls check_network_client]
        I can see your Living Room Sonos is connected to the network at 192.168.1.120.
        It's plugged into port 12 on your office switch and has been online for 3 days.
        The device itself looks healthy from a network perspective.
        Have you tried restarting the Sonos app on your phone?"
```

### Fallback: Direct UniFi API

If the HA UniFi integration doesn't expose switch port data (some versions don't), we have a backup plan:

1. Store UniFi local controller credentials in `project_home_assistant` table (or new table)
2. Create `/api/unifi/clients.js` that queries the controller directly via Cloudflare Tunnel or local network
3. The controller API endpoint `/api/s/{site}/stat/sta` returns full client data including switch ports

This is the same data we've been trying to get through the Site Manager API but couldn't - going through HA (or direct local API) bypasses that limitation.

---

## Phase 8: MCP Server Integration for Unicorn AI Agent

### Overview

This phase enables the Unicorn AI agent to have **real-time, full-context access** to Home Assistant data via Model Context Protocol (MCP). This is the foundation for making Unicorn the "brain" that correlates project equipment with network clients.

### Architecture: Unicorn as Central AI Brain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNICORN AI AGENT                                     │
│  (Central Intelligence - runs on your infrastructure + on-site agents)      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────────┐
          │                         │                             │
          ▼                         ▼                             ▼
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  HA MCP Server  │     │  UniFi MCP Server   │     │  SharePoint MCP     │
│  (per client)   │     │  (per client)       │     │  (central backup)   │
│                 │     │                     │     │                     │
│ • Devices       │     │ • Network clients   │     │ • Offline cache     │
│ • Areas/Rooms   │     │ • Switch ports      │     │ • Version history   │
│ • Entities      │     │ • IP addresses      │     │ • Cross-client      │
│ • States        │     │ • MAC addresses     │     │   search            │
└────────┬────────┘     └──────────┬──────────┘     └──────────┬──────────┘
         │                         │                            │
         │    Nabu Casa URL        │   Local Controller         │  Graph API
         │                         │   (via HA or direct)       │
         ▼                         ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT SITE                                          │
│  Home Assistant ←──── UniFi Controller ←──── Network Equipment              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Connection Method: Nabu Casa URL

**Yes, you CAN use the Nabu Casa URL to reach each client's HA instance.**

The existing `project_home_assistant` table already stores:
- `ha_url` - The Nabu Casa URL (e.g., `https://xxxxx.ui.nabu.casa`)
- `access_token` - Long-lived access token

This is the **same connection** used by Sarah (Retell) and the existing HA API endpoints. The MCP server will use these credentials.

### Option A: REST API Approach (Current Implementation)

The existing Phase 1-7 implementation uses **REST API calls** from Vercel to HA. This works for:
- Sarah (Retell phone agent) checking devices
- Unicorn web app displaying device status
- Service technicians running diagnostics

**Pros:** Already implemented, simple, works from anywhere
**Cons:** Request/response model, not real-time streaming

### Option B: Full MCP Server Approach (Enhanced)

For deeper AI integration where Unicorn needs to:
- Query device registries
- Correlate equipment to network clients
- Build installation profiles during technician setup

**Implementation Options:**

#### B1. Deploy MCP Server per Client Site (On-Site Agent)

```
Client Site:
┌──────────────────────────────────────────┐
│  Raspberry Pi / Mini PC                  │
│  ┌────────────────────────────────────┐  │
│  │  HA MCP Server (cronus42)          │  │
│  │  • Connects to local HA            │  │
│  │  • Exposes MCP over SSE/HTTP       │  │
│  │  • Syncs to SharePoint backup      │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
            │
            │ Cloudflare Tunnel / Tailscale
            ▼
┌──────────────────────────────────────────┐
│  Unicorn Central                         │
│  • Connects to each site's MCP server    │
│  • Aggregates data across projects       │
│  • AI queries via MCP protocol           │
└──────────────────────────────────────────┘
```

**Pros:** Real-time, full MCP protocol, local resilience
**Cons:** Requires hardware at each site, more complex deployment

#### B2. Proxy MCP Through Vercel (Hybrid)

```javascript
// api/mcp/query.js - MCP-like query endpoint
// Translates MCP tool calls to HA REST API calls

const MCP_TOOLS = {
  'get_devices': async (projectId) => {
    const haConfig = await getHAConfig(projectId);
    const response = await fetch(`${haConfig.ha_url}/api/websocket`, {
      // WebSocket connection for device_registry/list
    });
    return response;
  },

  'get_areas': async (projectId) => {
    // Query area_registry/list
  },

  'get_entities_by_area': async (projectId, areaId) => {
    // Query entities filtered by area
  },

  'correlate_network_client': async (projectId, macAddress) => {
    // Find HA device with matching MAC, return with network info
  }
};
```

**Pros:** No on-site hardware, uses existing Nabu Casa connection
**Cons:** Not true MCP protocol, but achieves same result

### Recommended: Hybrid Approach (Option B2 now, B1 later)

**Phase 1 (Now):** Use REST API through Vercel (already implemented)
- Works immediately with existing `project_home_assistant` credentials
- Sarah and Unicorn web app can query devices
- Add correlation tools for technician installation workflow

**Phase 2 (Future):** Deploy on-site MCP agents
- For clients with high automation needs
- Real-time event streaming
- Local AI processing for faster response
- Resilience when internet is down

### New API Endpoints for Unicorn AI Agent

#### `/api/ha/mcp/devices.js` - Device Registry Query

```javascript
/**
 * Query HA device registry via WebSocket API
 * Returns all devices with MAC addresses, manufacturers, areas
 */
module.exports = async (req, res) => {
  const { project_id } = req.query;

  // Get HA credentials from existing table
  const haConfig = await getHAConfig(project_id);

  // Connect via WebSocket for registry access
  const devices = await haWebSocketQuery(haConfig, {
    type: 'config/device_registry/list'
  });

  return res.json({
    success: true,
    devices: devices.map(d => ({
      id: d.id,
      name: d.name,
      manufacturer: d.manufacturer,
      model: d.model,
      area_id: d.area_id,
      connections: d.connections, // Includes MAC addresses
      identifiers: d.identifiers
    }))
  });
};
```

#### `/api/ha/mcp/areas.js` - Area Registry Query

```javascript
/**
 * Query HA area registry
 * Returns all rooms/areas defined in HA
 */
module.exports = async (req, res) => {
  const { project_id } = req.query;
  const haConfig = await getHAConfig(project_id);

  const areas = await haWebSocketQuery(haConfig, {
    type: 'config/area_registry/list'
  });

  return res.json({
    success: true,
    areas: areas.map(a => ({
      id: a.area_id,
      name: a.name,
      aliases: a.aliases || []
    }))
  });
};
```

#### `/api/ha/mcp/correlate.js` - Device-to-Network Correlation

```javascript
/**
 * Correlate HA device with network client data
 * This is the KEY tool for technician installation workflow
 */
module.exports = async (req, res) => {
  const { project_id, mac_address, device_id } = req.body;
  const haConfig = await getHAConfig(project_id);

  // 1. Get device registry
  const devices = await haWebSocketQuery(haConfig, {
    type: 'config/device_registry/list'
  });

  // 2. Find device by MAC or ID
  let device = null;
  if (mac_address) {
    device = devices.find(d =>
      d.connections?.some(c => c[1]?.toLowerCase() === mac_address.toLowerCase())
    );
  } else if (device_id) {
    device = devices.find(d => d.id === device_id);
  }

  if (!device) {
    return res.json({ success: false, error: 'Device not found' });
  }

  // 3. Get area info
  const areas = await haWebSocketQuery(haConfig, {
    type: 'config/area_registry/list'
  });
  const area = areas.find(a => a.area_id === device.area_id);

  // 4. Get network client info (from device_tracker entities)
  const states = await fetch(`${haConfig.ha_url}/api/states`, {
    headers: { 'Authorization': `Bearer ${haConfig.access_token}` }
  }).then(r => r.json());

  const networkClient = states.find(s =>
    s.entity_id.startsWith('device_tracker.') &&
    s.attributes.mac?.toLowerCase() === mac_address?.toLowerCase()
  );

  // 5. Return correlated data
  return res.json({
    success: true,
    device: {
      id: device.id,
      name: device.name,
      manufacturer: device.manufacturer,
      model: device.model
    },
    area: area ? {
      id: area.area_id,
      name: area.name
    } : null,
    network: networkClient ? {
      ip_address: networkClient.attributes.ip,
      mac_address: networkClient.attributes.mac,
      hostname: networkClient.attributes.hostname,
      switch_port: networkClient.attributes.sw_port,
      switch_mac: networkClient.attributes.sw_mac,
      is_wired: networkClient.attributes.wired,
      is_online: networkClient.state === 'home'
    } : null
  });
};
```

### Technician Installation Workflow

During install, technicians will:

1. **Connect device to network** → UniFi detects MAC, assigns IP, records switch port
2. **Add device to Home Assistant** → HA discovers device, creates entity
3. **Assign to Area/Room in HA** → Technician uses HA app or voice
4. **Unicorn AI correlates** → Queries both MCP endpoints, builds complete profile
5. **Profile synced to project** → Equipment record linked to wire drop, room, network client

**Voice Command Example:**
```
Technician: "I just connected the Sonos Arc to port 12 on the office switch"

Unicorn AI: [calls /api/ha/mcp/correlate with switch_port=12]
           "I found a device on port 12 - it's a Sonos Arc with MAC aa:bb:cc:dd:ee:ff
            at IP 192.168.1.120. I see it's in the Living Room area in Home Assistant.
            Should I link this to the Living Room - Soundbar equipment in your project?"

Technician: "Yes"

Unicorn AI: [updates equipment_items.mac_address, creates correlation record]
           "Done. The Living Room Soundbar is now linked to that network client."
```

### Database: Equipment-to-Network Correlation

Add to `equipment_items` table (or create new correlation table):

```sql
-- Add to equipment_items
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS
  ha_device_id text,
  ha_entity_id text,
  network_mac_address text,
  network_ip_address inet,
  network_switch_port integer,
  network_switch_mac text,
  network_last_seen timestamptz,
  network_is_wired boolean DEFAULT true;

-- Create index for MAC lookups
CREATE INDEX IF NOT EXISTS idx_equipment_mac ON equipment_items(network_mac_address);

-- Or create separate correlation table for history
CREATE TABLE IF NOT EXISTS equipment_network_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment_items(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

  -- Network snapshot
  mac_address text NOT NULL,
  ip_address inet,
  switch_port integer,
  switch_mac text,
  is_wired boolean,

  -- HA correlation
  ha_device_id text,
  ha_entity_id text,
  ha_area_id text,
  ha_area_name text,

  -- Audit
  recorded_at timestamptz DEFAULT now(),
  recorded_by uuid REFERENCES profiles(id)
);
```

### Retell Tool Updates for Sarah

Add to Sarah's tools so she can use the correlation data:

```json
{
  "name": "get_device_network_info",
  "description": "Get detailed network information for a specific device including IP, switch port, and connection status. Use when customer asks about a device's network connection.",
  "url": "https://unicorn-one.vercel.app/api/ha/mcp/correlate",
  "parameters": {
    "project_id": { "type": "string", "description": "Customer's project ID" },
    "device_name": { "type": "string", "description": "Name of the device" }
  }
}
```

### SharePoint Backup for Offline Access

When client site is unreachable (network down, hardware failure), query SharePoint:

```javascript
// api/sharepoint-mcp/query.js
module.exports = async (req, res) => {
  const { project_id, query_type } = req.body;

  // Get SharePoint path for this project
  const project = await getProject(project_id);
  const spPath = `${project.sharepoint_url}/network_backup/`;

  // Query backed-up data
  switch (query_type) {
    case 'devices':
      return await fetchSharePointFile(spPath + 'device_registry.json');
    case 'areas':
      return await fetchSharePointFile(spPath + 'area_registry.json');
    case 'network_clients':
      return await fetchSharePointFile(spPath + 'network_clients.json');
    case 'correlations':
      return await fetchSharePointFile(spPath + 'correlations.json');
  }
};
```

**Sync Schedule:**
- Daily backup via scheduled function
- On-demand sync when technician completes installation
- Event-triggered sync when significant changes detected

---

## Phase 9: On-Site Unicorn Agent (Future)

For clients requiring real-time responsiveness and local resilience:

### Hardware Options

| Option | Cost | Use Case |
|--------|------|----------|
| Raspberry Pi 5 | ~$80 | Basic monitoring, occasional queries |
| Intel NUC | ~$300 | Full local AI, frequent queries |
| Existing server | $0 | Client has spare capacity |

### Software Stack

```yaml
# docker-compose.yml for on-site agent
version: '3.8'
services:
  unicorn-agent:
    image: unicorn/site-agent:latest
    environment:
      - SITE_ID=${PROJECT_ID}
      - HA_URL=http://homeassistant.local:8123
      - HA_TOKEN=${HA_TOKEN}
      - CENTRAL_API=https://unicorn-one.vercel.app
      - SHAREPOINT_SYNC=true
    volumes:
      - ./data:/data
    restart: unless-stopped

  ha-mcp-server:
    image: cronus42/homeassistant-mcp:latest
    environment:
      - HA_URL=http://homeassistant.local:8123
      - HA_TOKEN=${HA_TOKEN}
    ports:
      - "3000:3000"
    restart: unless-stopped
```

### Communication

- **Inbound:** Cloudflare Tunnel or Tailscale for secure access from central Unicorn
- **Outbound:** Syncs data to SharePoint, reports status to central API
- **Local:** Direct MCP connection to HA, no internet required for local queries

---

## Phase 10: Retell MCP Integration for Sarah

### Overview

This phase uses the **Retell MCP Server** to directly configure Sarah's tools from Claude, enabling her to query Home Assistant devices during customer calls.

### Current Sarah Configuration

**Agent ID:** `agent_569081761d8bbd630c0794095d`
**LLM ID:** `llm_a897cdd41f9c7de05c5528a895b9`

**Current Tools (via Retell LLM):**
- `identify_customer` - Lookup by phone number ✅
- `check_network` - UniFi diagnostics ✅
- `create_ticket` - Create service ticket ✅
- `end_call` - End the call ✅

**Missing Tools (Need to Add):**
- `check_home_device` - Check specific HA device status
- `list_home_devices` - List all devices for customer
- `test_home_device` - Run diagnostic test on device

### Adding HA Tools via Retell MCP

**Step 1: Update the Retell LLM with new tools**

Use the Retell MCP server to add the HA tools. The tools call our existing `/api/ha/*` endpoints.

```
Claude: Use the update_retell_llm MCP tool with llmId "llm_a897cdd41f9c7de05c5528a895b9"
        to add these general_tools:
```

**Tool 1: check_home_device**
```json
{
  "type": "custom",
  "name": "check_home_device",
  "description": "Check if a specific smart home device is online and get its status. Use when customer reports a device issue. Requires project_id from identify_customer.",
  "url": "https://unicorn-one.vercel.app/api/retell/check-home-device",
  "speak_during_execution": false,
  "speak_after_execution": true,
  "execution_message_description": "Checking device status...",
  "timeout_ms": 15000,
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "Customer's project ID from identify_customer result"
      },
      "device_type": {
        "type": "string",
        "enum": ["sonos", "tv", "light", "thermostat", "shade", "camera", "network"],
        "description": "Type of device to check"
      },
      "location": {
        "type": "string",
        "description": "Room or location name (e.g., 'master bedroom', 'living room')"
      }
    },
    "required": ["project_id"]
  }
}
```

**Tool 2: list_home_devices**
```json
{
  "type": "custom",
  "name": "list_home_devices",
  "description": "Get a summary of all smart home devices at customer's location. Use to understand what devices they have.",
  "url": "https://unicorn-one.vercel.app/api/retell/list-home-devices",
  "speak_during_execution": false,
  "speak_after_execution": true,
  "timeout_ms": 15000,
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "Customer's project ID"
      },
      "device_type": {
        "type": "string",
        "enum": ["all", "audio", "video", "lighting", "climate", "shades", "network"],
        "description": "Filter by device category (default: all)"
      }
    },
    "required": ["project_id"]
  }
}
```

**Tool 3: test_home_device**
```json
{
  "type": "custom",
  "name": "test_home_device",
  "description": "Run a quick test on a device (play test sound on speaker, flash a light). Use after checking device status to verify it's working.",
  "url": "https://unicorn-one.vercel.app/api/retell/test-home-device",
  "speak_during_execution": true,
  "speak_after_execution": true,
  "execution_message_description": "Running device test...",
  "timeout_ms": 20000,
  "parameters": {
    "type": "object",
    "properties": {
      "project_id": {
        "type": "string",
        "description": "Customer's project ID"
      },
      "entity_id": {
        "type": "string",
        "description": "Home Assistant entity ID to test (from check_home_device result)"
      },
      "test_type": {
        "type": "string",
        "enum": ["ping", "identify", "play_sound"],
        "description": "Type of test: ping (check status), identify (flash light), play_sound (speaker test)"
      }
    },
    "required": ["project_id", "entity_id"]
  }
}
```

### Step 2: Update Sarah's Prompt

Add this section to Sarah's system prompt:

```
## HOME DEVICE DIAGNOSTICS

You have access to the customer's Home Assistant system for live device diagnostics.

When a customer reports an issue with a smart device:

1. First use check_home_device with their primary_project_id to see if the device is online
2. If the device is offline, check related network devices or suggest power cycle
3. If the device is online but not working, suggest basic troubleshooting
4. Use test_home_device to verify functionality (play test sound on speaker, flash a light)

IMPORTANT: Only use these tools if the customer has Home Assistant configured (check primary_project_id exists).

Example conversation:
- Customer: "My Sonos in the bedroom isn't playing music"
- Sarah: "Let me check your bedroom Sonos... [calls check_home_device]"
- Sarah: "I can see your Master Bedroom Sonos Arc is online at 192.168.1.120. It's currently idle. Would you like me to play a test sound to verify it's working?"
- Customer: "Yes please"
- Sarah: [calls test_home_device] "I've sent a test sound. Did you hear it?"
```

### Step 3: Create API Endpoints

**File: `api/retell/check-home-device.js`** (needs to be created)

This endpoint wraps the existing `/api/ha/entities.js` with Retell-friendly responses:

```javascript
/**
 * api/retell/check-home-device.js
 * Retell tool wrapper for HA device status
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEVICE_TYPE_DOMAINS = {
  sonos: ['media_player'],
  tv: ['media_player'],
  light: ['light', 'switch'],
  thermostat: ['climate'],
  shade: ['cover'],
  camera: ['camera'],
  network: ['device_tracker', 'binary_sensor']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (req.body?.args) body = req.body.args;

    const { project_id, device_type, location } = body;

    if (!project_id) {
      return res.json({
        result: {
          found: false,
          message: "I need the customer's project information to check their devices."
        }
      });
    }

    // Get HA credentials
    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('ha_url, access_token')
      .eq('project_id', project_id)
      .single();

    if (dbError || !haConfig) {
      return res.json({
        result: {
          found: false,
          message: "Home Assistant is not configured for this customer yet."
        }
      });
    }

    // Get all states from HA
    const haResponse = await fetch(`${haConfig.ha_url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!haResponse.ok) {
      return res.json({
        result: {
          found: false,
          message: "I'm having trouble connecting to the home automation system."
        }
      });
    }

    const entities = await haResponse.json();

    // Filter by device type
    const targetDomains = device_type ? DEVICE_TYPE_DOMAINS[device_type] || [] : [];
    let filtered = entities;

    if (targetDomains.length > 0) {
      filtered = entities.filter(e => {
        const domain = e.entity_id.split('.')[0];
        return targetDomains.includes(domain);
      });
    }

    // Filter by location
    if (location) {
      const locationLower = location.toLowerCase().replace(/[^a-z0-9]/g, '');
      filtered = filtered.filter(e => {
        const name = (e.attributes.friendly_name || e.entity_id).toLowerCase().replace(/[^a-z0-9]/g, '');
        return name.includes(locationLower);
      });
    }

    if (filtered.length === 0) {
      return res.json({
        result: {
          found: false,
          message: `I couldn't find a ${device_type || 'device'} ${location ? 'in the ' + location : ''}.`
        }
      });
    }

    const device = filtered[0];
    const isOnline = device.state !== 'unavailable' && device.state !== 'unknown';
    const ipAddress = device.attributes.ip_address || device.attributes.ip || null;

    let statusMessage = '';
    if (!isOnline) {
      statusMessage = `Your ${device.attributes.friendly_name || device_type} appears to be offline or unreachable.`;
    } else {
      statusMessage = `Your ${device.attributes.friendly_name || device_type} is online`;
      if (ipAddress) statusMessage += ` at ${ipAddress}`;
      statusMessage += `. Current status: ${device.state}.`;
    }

    return res.json({
      result: {
        found: true,
        device_name: device.attributes.friendly_name || device.entity_id,
        entity_id: device.entity_id,
        status: isOnline ? 'online' : 'offline',
        state: device.state,
        ip_address: ipAddress,
        message: statusMessage
      }
    });

  } catch (error) {
    console.error('[Check Home Device] Error:', error);
    return res.json({
      result: {
        found: false,
        message: "I encountered an error checking the device."
      }
    });
  }
};
```

### Step 4: Update identify.js to Include HA Status

Add to the response in `api/retell/identify.js`:

```javascript
// After getting primary project, check for HA config
let haStatus = null;
if (primaryProject?.id) {
  const { data: haConfig } = await supabase
    .from('project_home_assistant')
    .select('id, last_connected_at, device_count, last_error')
    .eq('project_id', primaryProject.id)
    .single();

  if (haConfig) {
    haStatus = {
      configured: true,
      device_count: haConfig.device_count || 0,
      last_connected: haConfig.last_connected_at,
      has_error: !!haConfig.last_error
    };
  }
}

// Add to result object:
return res.json({
  result: {
    // ... existing fields ...
    home_assistant: haStatus || { configured: false },
    // Update summary to mention HA capability
    summary: `Customer: ${c.contact_name}. ${projectSummary} ${haStatus?.configured ? 'Home Assistant connected with ' + haStatus.device_count + ' devices.' : ''}`
  }
});
```

### Using Retell MCP to Make These Changes

**You can use Claude to directly update Sarah's configuration:**

1. **List current tools:**
```
Use mcp__retellai-mcp-server__get_retell_llm with llmId "llm_a897cdd41f9c7de05c5528a895b9"
```

2. **Update LLM with new tools:**
```
Use mcp__retellai-mcp-server__update_retell_llm with:
- llmId: "llm_a897cdd41f9c7de05c5528a895b9"
- general_tools: [... array of existing + new tools ...]
- general_prompt: "... updated prompt with HA instructions ..."
```

3. **Verify the update:**
```
Use mcp__retellai-mcp-server__get_retell_llm again to confirm changes
```

### Implementation Checklist

- [ ] Create `api/retell/check-home-device.js`
- [ ] Create `api/retell/list-home-devices.js`
- [ ] Create `api/retell/test-home-device.js`
- [ ] Update `api/retell/identify.js` with HA status
- [ ] Use Retell MCP to add tools to LLM
- [ ] Use Retell MCP to update Sarah's prompt
- [ ] Test with real customer call

---

## Future Enhancements

1. **Auto-discovery** - Sync HA devices to Unicorn equipment list automatically
2. **Proactive monitoring** - Alert when devices go offline
3. **Integration mapping** - Link HA entities to Unicorn equipment records
4. **Historical data** - Track device uptime/issues over time
5. **Automation triggers** - Create HA automations from Unicorn
6. **Switch port mapping** - Visual diagram of what's connected to each switch port
7. **Network topology** - Show device → switch → router path for troubleshooting
