# Workstream 2: Home Assistant Integration

## Overview

**Problem:** Sarah (AI voice agent) cannot diagnose specific customer devices remotely. She knows a customer has "Sonos" but can't say "Your master bedroom Sonos Arc at 192.168.1.120 appears to be offline."

**Solution:** Integrate with Home Assistant (deployed to every customer) as a universal device bridge.

**Dependency:** Workstream 1 (Secure Data Encryption) must be complete first - we need encrypted storage for HA tokens.

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

Create table for storing HA credentials per project:

```sql
-- Migration: YYYYMMDD_home_assistant_integration.sql

CREATE TABLE project_home_assistant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Connection details (encrypted via Vault)
  ha_url_encrypted bytea,           -- Nabu Casa URL or local URL
  access_token_encrypted bytea,     -- Long-lived access token

  -- Metadata (not sensitive)
  instance_name text,               -- Friendly name
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

CREATE POLICY "Users can manage project HA settings"
ON project_home_assistant FOR ALL
TO authenticated
USING (true);

-- Decrypted view
CREATE OR REPLACE VIEW project_home_assistant_decrypted AS
SELECT
  id,
  project_id,
  decrypt_sensitive_data(ha_url_encrypted, 'project_secure_data_key') as ha_url,
  decrypt_sensitive_data(access_token_encrypted, 'project_secure_data_key') as access_token,
  instance_name,
  nabu_casa_enabled,
  last_connected_at,
  last_error,
  device_count,
  created_at,
  updated_at,
  created_by
FROM project_home_assistant;
```

### Phase 2: API Endpoints

#### `/api/ha/status.js` - Check HA Connection

```javascript
/**
 * Check Home Assistant connection status for a project
 * GET /api/ha/status?project_id=xxx
 */
module.exports = async (req, res) => {
  const { project_id } = req.query;

  // 1. Get HA credentials from database (decrypted view)
  // 2. Call HA API: GET /api/
  // 3. Return connection status and basic info
};
```

#### `/api/ha/entities.js` - List Devices/Entities

```javascript
/**
 * Get all entities from customer's Home Assistant
 * GET /api/ha/entities?project_id=xxx&domain=media_player
 *
 * Domains: media_player, light, switch, sensor, binary_sensor, climate, cover, etc.
 */
module.exports = async (req, res) => {
  const { project_id, domain } = req.query;

  // 1. Get HA credentials
  // 2. Call HA API: GET /api/states
  // 3. Filter by domain if specified
  // 4. Return entity list with states
};
```

#### `/api/ha/command.js` - Execute HA Service Call

```javascript
/**
 * Execute a Home Assistant service call
 * POST /api/ha/command
 * Body: { project_id, domain, service, entity_id, data }
 *
 * Examples:
 * - { domain: "media_player", service: "play_media", entity_id: "media_player.living_room_sonos" }
 * - { domain: "light", service: "turn_on", entity_id: "light.kitchen" }
 */
module.exports = async (req, res) => {
  const { project_id, domain, service, entity_id, data } = req.body;

  // 1. Get HA credentials
  // 2. Call HA API: POST /api/services/{domain}/{service}
  // 3. Return result
};
```

#### `/api/ha/device-info.js` - Get Specific Device Details

```javascript
/**
 * Get detailed info about a specific device
 * GET /api/ha/device-info?project_id=xxx&entity_id=media_player.bedroom_sonos
 */
module.exports = async (req, res) => {
  // 1. Get entity state
  // 2. Get entity attributes (IP, MAC, model, etc.)
  // 3. Return formatted device info
};
```

### Phase 3: Retell AI Tools

Create new Retell custom tools that Sarah can use:

#### Tool: `check_home_device`

```json
{
  "name": "check_home_device",
  "description": "Check if a specific device is online and get its current status. Use when customer reports a device issue.",
  "parameters": {
    "project_id": {
      "type": "string",
      "description": "The customer's project ID"
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
  "webhook_url": "https://unicorn-app.vercel.app/api/retell/check-home-device"
}
```

#### Tool: `list_customer_devices`

```json
{
  "name": "list_customer_devices",
  "description": "Get a list of all smart devices at the customer's location. Use to understand what equipment they have.",
  "parameters": {
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
  "webhook_url": "https://unicorn-app.vercel.app/api/retell/list-home-devices"
}
```

#### Tool: `test_device`

```json
{
  "name": "test_device",
  "description": "Run a quick test on a device (play a test sound on speaker, flash a light, etc.)",
  "parameters": {
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
  "webhook_url": "https://unicorn-app.vercel.app/api/retell/test-home-device"
}
```

### Phase 4: Retell Tool Implementations

#### `/api/retell/check-home-device.js`

```javascript
/**
 * Retell tool: Check a specific home device
 */
module.exports = async (req, res) => {
  const { project_id, device_type, location } = req.body.args || req.body;

  // 1. Get HA credentials for project
  // 2. Query HA for matching entities
  // 3. Find device matching type + location
  // 4. Return status in natural language for Sarah to speak

  return res.json({
    result: {
      found: true,
      device_name: "Master Bedroom Sonos Arc",
      entity_id: "media_player.master_bedroom_sonos",
      status: "online",
      ip_address: "192.168.1.120",
      message: "Your master bedroom Sonos Arc is online at 192.168.1.120. It's currently idle."
    }
  });
};
```

### Phase 5: UI Component for HA Management

Add to Project Settings page - new section for Home Assistant configuration:

```javascript
// src/components/HomeAssistantSettings.js

function HomeAssistantSettings({ projectId }) {
  return (
    <div className="ha-settings">
      <h3>Home Assistant Integration</h3>

      {/* Connection Status */}
      <div className="connection-status">
        <span className={connected ? 'online' : 'offline'}>
          {connected ? '● Connected' : '○ Not Connected'}
        </span>
        <span>{deviceCount} devices</span>
      </div>

      {/* Configuration Form */}
      <form>
        <label>Nabu Casa URL or Local URL</label>
        <input type="url" placeholder="https://xxxxx.ui.nabu.casa" />

        <label>Long-Lived Access Token</label>
        <input type="password" placeholder="eyJ..." />

        <button type="button">Test Connection</button>
        <button type="submit">Save</button>
      </form>

      {/* Device List Preview */}
      {connected && (
        <div className="device-preview">
          <h4>Detected Devices</h4>
          {/* List of entity domains with counts */}
        </div>
      )}
    </div>
  );
}
```

### Phase 6: Update Sarah's Prompt

Add to Sarah's system prompt in Retell:

```
## Home Device Diagnostics

You have access to the customer's Home Assistant system for live device diagnostics.

When a customer reports an issue with a smart device:

1. Use `check_home_device` to see if the device is online
2. If offline, check related network devices
3. If online but not working, suggest basic troubleshooting
4. Use `test_device` to verify (e.g., play test sound on speaker)

You can check: Sonos speakers, TVs, lights, thermostats, shades, cameras, and network devices.

Example responses:
- "Let me check your master bedroom Sonos... I can see it's online at 192.168.1.120 and currently idle."
- "I'm checking your living room TV... It appears to be offline. Let me check the network..."
- "Your Sonos is online. Let me play a test sound to make sure it's working."
```

---

## Customer Setup Process

For each customer project:

1. **Verify Nabu Casa subscription** - Needed for remote access
2. **Generate Long-Lived Access Token** in HA
   - Profile → Long-Lived Access Tokens → Create Token
   - Copy token (shown only once)
3. **Enter in Unicorn** - Project Settings → Home Assistant
4. **Test Connection** - Verify device count shows up
5. **Sarah can now diagnose** - Ready for voice support

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `api/ha/status.js` | Check HA connection |
| `api/ha/entities.js` | List all entities |
| `api/ha/command.js` | Execute service calls |
| `api/ha/device-info.js` | Get device details |
| `api/retell/check-home-device.js` | Retell tool implementation |
| `api/retell/list-home-devices.js` | Retell tool implementation |
| `api/retell/test-home-device.js` | Retell tool implementation |
| `src/components/HomeAssistantSettings.js` | UI for HA config |
| `src/services/homeAssistantService.js` | Service layer for HA |
| `database/migrations/YYYYMMDD_home_assistant.sql` | DB schema |

### Modify
| File | Changes |
|------|---------|
| `api/retell/identify.js` | Include HA status in customer lookup |
| `src/pages/ProjectSettings.js` | Add HA settings section |
| Retell Dashboard | Add new custom tools |

---

## Testing Checklist

- [ ] HA credentials stored encrypted in database
- [ ] Connection test works from Unicorn UI
- [ ] Entity list populates correctly
- [ ] Sarah can call `check_home_device` tool
- [ ] Sarah can call `list_customer_devices` tool
- [ ] Sarah can call `test_device` tool
- [ ] Device status shows in natural language
- [ ] Test with real Nabu Casa connection
- [ ] Test with local HA (if accessible)
- [ ] Audit logging for HA access

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1 (DB Schema) | 1 hour |
| Phase 2 (API Endpoints) | 4 hours |
| Phase 3-4 (Retell Tools) | 4 hours |
| Phase 5 (UI Component) | 3 hours |
| Phase 6 (Sarah's Prompt) | 1 hour |
| Testing | 4 hours |

**Total: ~17 hours**

---

## Future Enhancements

1. **Auto-discovery** - Sync HA devices to Unicorn equipment list
2. **Proactive monitoring** - Alert when devices go offline
3. **Integration mapping** - Link HA entities to Unicorn equipment records
4. **Historical data** - Track device uptime/issues over time
