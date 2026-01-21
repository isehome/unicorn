# Home Assistant UniFi Integration for Unicorn

This document describes the Home Assistant UniFi integration that powers the network connection visualization in the Unicorn rack layout system.

## Overview

The HA UniFi Integration bridges your UniFi network infrastructure with Home Assistant, which then provides real-time network data to the Unicorn application. This enables:

- **Real-time device status** - See which equipment is online/offline
- **Switch port visualization** - View which port each device is connected to
- **WiFi connection indicators** - Show wireless connection status and signal strength
- **Gateway port support** - Dream Machine Pro/SE gateways display their ports like switches

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   UniFi Network     │     │   Home Assistant     │     │   Unicorn App       │
│   (UDM Pro/SE)      │────▶│   (Python Script)    │────▶│   (React Frontend)  │
│                     │     │                      │     │                     │
│ • Clients           │     │ • Collects data      │     │ • RackBackView      │
│ • Devices           │     │ • Creates sensor     │     │ • Network tab       │
│ • Port tables       │     │ • Stores in HA       │     │ • Port connections  │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

## Components

### 1. Python Collector Script (`scripts/unifi_clients.py`)

This script runs on Home Assistant and collects data from your UniFi controller:

**Location on HA:** `/config/python_scripts/unifi_client_collector.py`

**What it collects:**
- All connected clients (wired and wireless)
- All UniFi devices (switches, access points, gateways)
- Switch port tables with detailed port status
- Gateway port tables (UDM Pro, Dream Machine, etc.)

**Key features:**
- Authenticates to UDM Pro/SE via the local API
- Handles both UniFi OS and legacy controller authentication
- Formats port data for switches AND gateways
- Outputs JSON for Home Assistant sensor consumption

**Device categories supported:**
- `switch` - USW switches (USW-16-PoE, USW-Pro-24, etc.)
- `gateway` - UDM Pro, UDM SE, USG, UXG devices
- `access_point` - UAP devices (U6, UAP-AC, etc.)

### 2. Home Assistant Configuration (`configuration_additions.yaml`)

Add these to your HA `configuration.yaml`:

```yaml
# Shell command to run the collector
shell_command:
  unifi_fetch_clients: >
    python3 /config/python_scripts/unifi_client_collector.py

# Automation to run every 60 seconds
automation:
  - alias: "Fetch UniFi Clients"
    trigger:
      - platform: time_pattern
        seconds: "/60"
    action:
      - service: shell_command.unifi_fetch_clients
```

### 3. Unicorn API Endpoint (`api/ha/network-clients.js`)

The Unicorn app fetches data from Home Assistant via this API:

```
GET /api/ha/network-clients
```

**Returns:**
```json
{
  "clients": [...],      // Connected devices
  "devices": [...],      // UniFi infrastructure (switches, APs, gateways)
  "timestamp": "...",
  "status": "connected"
}
```

### 4. React Components

**RackBackView.jsx** - Main rack visualization component

Key functions:
- `isPortHost(eq)` - Determines if equipment should show ports (switches OR gateways with port data)
- `getPortConnections()` - Maps which devices are connected to which ports
- `getNetworkInfo(eq)` - Gets connection info for any equipment

## How It Works

### Data Flow

1. **Collection (every 60 seconds)**
   - HA automation triggers `shell_command.unifi_fetch_clients`
   - Python script authenticates to UDM Pro API
   - Script fetches clients and devices from `/proxy/network/api/s/{site}/...`
   - Data is formatted and written to `sensor.unifi_connection_status`

2. **Consumption (in Unicorn)**
   - Rack view requests `/api/ha/network-clients`
   - API reads `sensor.unifi_connection_status` from HA
   - Returns clients and devices arrays to frontend

3. **Visualization**
   - `haClients` - Array of connected devices (phones, computers, IoT, etc.)
   - `haDevices` - Array of UniFi infrastructure with port tables
   - Equipment is matched by `ha_client_mac` field in database
   - Network tab shows port connections for switches and gateways

### Port Visualization Logic

For **switches** (USW devices):
- Always show ports if `global_part.is_network_switch = true`
- Port data comes from `device.port_table[]`

For **gateways** (UDM Pro, Dream Machine):
- Show ports if `category === 'gateway'` AND `port_table.length > 0`
- Gateways are detected by their `type` field: `ugw`, `udm`, `udr`, `uxg`

### Client Matching

Equipment in Unicorn is linked to HA data via MAC address:

```javascript
// In database: equipment.ha_client_mac = "74:ac:b9:3b:59:57"
// In HA data: client.mac = "74:ac:b9:3b:59:57"

const haClient = haClients.find(c =>
  c.mac?.toLowerCase() === eq.ha_client_mac?.toLowerCase()
);
```

## Setup Instructions

### Prerequisites

1. UniFi Dream Machine Pro/SE or UniFi Controller
2. Home Assistant with API access
3. Unicorn app configured with HA connection

### Step 1: Install the Python Script

Copy `scripts/unifi_clients.py` to your Home Assistant:

```bash
# Via SSH or File Editor
cp unifi_clients.py /config/python_scripts/unifi_client_collector.py
chmod +x /config/python_scripts/unifi_client_collector.py
```

### Step 2: Add HA Secrets

In `/config/secrets.yaml`:

```yaml
unifi_host: "192.168.1.1"  # Your UDM Pro IP
unifi_username: "admin"
unifi_password: "your_password"
```

### Step 3: Add Configuration

Add the contents of `configuration_additions.yaml` to your `configuration.yaml`.

### Step 4: Configure Unicorn Equipment

For each piece of equipment you want to track:

1. Edit the equipment in Unicorn
2. Set the `HA Client MAC` field to the device's MAC address
3. The network view will now show the connection status

### Step 5: Test the Integration

1. In HA Developer Tools > Actions, run `shell_command.unifi_fetch_clients`
2. Check Developer Tools > States for `sensor.unifi_connection_status`
3. Verify the `devices` attribute contains your switches and gateway
4. In Unicorn, open a rack and switch to the "Network" tab

## Troubleshooting

### Gateway ports not showing

**Symptom:** Switch shows ports but Dream Machine doesn't

**Cause:** The Python script condition at line 213 needs to include gateways:

```python
# Should be:
"port_table": [format_port(p) for p in port_table] if category in ["switch", "gateway"] else [],

# NOT:
"port_table": [format_port(p) for p in port_table] if category == "switch" else [],
```

### Authentication failed

**Symptom:** Shell command returns `{"status": "error", "message": "Authentication failed"}`

**Solutions:**
- Verify UDM Pro is accessible (try https://192.168.1.1 in browser)
- Check credentials in `secrets.yaml`
- Ensure the HA user has admin access to UniFi
- Check if UniFi requires 2FA (not supported by this script)

### No devices in sensor

**Symptom:** `sensor.unifi_connection_status` has empty `devices: []`

**Solutions:**
- Check that the automation is running (look in HA logs)
- Manually trigger `shell_command.unifi_fetch_clients`
- Check Python script output in HA logs for errors

### Equipment not showing connection

**Symptom:** Equipment in Unicorn doesn't show network info

**Solutions:**
- Verify `ha_client_mac` is set on the equipment
- MAC address must be lowercase with colons (e.g., `aa:bb:cc:dd:ee:ff`)
- Check that the device is connected to your UniFi network

## Data Structures

### Client Object

```json
{
  "mac": "aa:bb:cc:dd:ee:ff",
  "hostname": "my-device",
  "ip": "192.168.1.100",
  "is_wired": true,
  "switch_mac": "24:5a:4c:ab:6c:fa",
  "switch_name": "USW 16 PoE",
  "switch_port": 5,
  "connection_type": "Wired",
  "network": "Default",
  "vlan": 1,
  "uptime": 123456,
  "signal": -45  // For wireless only
}
```

### Device Object (Switch/Gateway)

```json
{
  "mac": "74:ac:b9:3b:59:57",
  "name": "Zionsville Shop",
  "model": "UDMPRO",
  "type": "udm",
  "category": "gateway",
  "ip": "192.168.1.1",
  "state": 1,
  "adopted": true,
  "ports_total": 11,
  "ports_used": 2,
  "port_table": [
    {
      "port_idx": 1,
      "name": "Port 1",
      "up": true,
      "speed": 1000,
      "full_duplex": true,
      "poe_enable": false,
      "is_uplink": false
    }
    // ... more ports
  ]
}
```

## Future Enhancements

- [ ] Real-time WebSocket updates instead of polling
- [ ] PoE power consumption display
- [ ] VLAN visualization
- [ ] Traffic statistics per port
- [ ] Alert integration for port status changes
