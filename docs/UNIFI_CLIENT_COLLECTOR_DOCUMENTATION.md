# UniFi Network Client Collector for Home Assistant

## Complete Build Documentation
**Version:** 1.0
**Date:** January 17, 2026

---

## Overview

This system collects client data from UniFi network controllers and displays it in Home Assistant dashboards. It provides:
- IP addresses for all connected clients
- MAC addresses
- Switch name and port assignment for wired clients
- WiFi SSID and signal strength for wireless clients
- Real-time status updates

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  UniFi Network  │────▶│  Python Script   │────▶│  Home Assistant │
│   Controller    │     │  (API Client)    │     │    Dashboard    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Files Created

### 1. Python Script
**Location:** `/config/python_scripts/unifi_client_collector.py`

This script:
- Authenticates with UniFi controller API
- Fetches all connected clients
- Retrieves device information (switches, APs) for name lookups
- Outputs JSON data with client details

### 2. Configuration Files

**configuration.yaml additions:**
- Input helpers for credentials (URL, username, password, site)
- Input boolean for SSL verification
- Shell command to execute the Python script
- Command line sensor to read the JSON output
- Template sensors for individual clients

**templates.yaml:**
- Creates 5 individual client sensors with detailed attributes

**scripts.yaml:**
- Test connection script

### 3. Output Files

**Location:** `/config/unifi_status.json`

Contains the JSON output from the Python script with all client data.

---

## Installation Steps

### Step 1: Create the Python Script Directory

```bash
mkdir -p /config/python_scripts
```

### Step 2: Create the Python Script

Create `/config/python_scripts/unifi_client_collector.py`:

```python
#!/usr/bin/env python3
"""UniFi Network Client Data Extractor for Home Assistant"""

import json
import requests
import urllib3
from datetime import datetime
from typing import List, Dict, Any
import logging
import sys
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger(__name__)

class UniFiClientCollector:
    def __init__(self, controller_url, username, password, site="default", verify_ssl=False):
        self.controller_url = controller_url.rstrip('/')
        self.username = username
        self.password = password
        self.site = site
        self.verify_ssl = verify_ssl
        self.session = requests.Session()
        self.session.verify = verify_ssl
        self.authenticated = False
        self.is_unifi_os = True  # Assume UniFi OS by default
        self.devices = {}  # Cache for device info (switches)

    def login(self):
        try:
            # Try UniFi OS authentication first (port 443)
            login_url = f"{self.controller_url}/api/auth/login"
            payload = {"username": self.username, "password": self.password}
            response = self.session.post(login_url, json=payload)
            
            if response.status_code == 200:
                self.authenticated = True
                self.is_unifi_os = True
                logger.info("Successfully authenticated with UniFi OS controller")
                return True
            elif response.status_code == 404:
                # Try legacy UniFi Controller authentication
                login_url = f"{self.controller_url}/api/login"
                response = self.session.post(login_url, json=payload)
                if response.status_code == 200:
                    self.authenticated = True
                    self.is_unifi_os = False
                    logger.info("Successfully authenticated with legacy UniFi controller")
                    return True
            
            logger.error(f"Authentication failed: {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False

    def get_devices(self) -> Dict[str, str]:
        """Fetch all network devices (switches, APs) and return MAC to name mapping"""
        if not self.authenticated:
            return {}
        
        try:
            if self.is_unifi_os:
                url = f"{self.controller_url}/proxy/network/api/s/{self.site}/stat/device"
            else:
                url = f"{self.controller_url}/api/s/{self.site}/stat/device"
            
            response = self.session.get(url)
            if response.status_code == 200:
                data = response.json()
                devices = data.get('data', [])
                # Create MAC to name mapping
                device_map = {}
                for device in devices:
                    mac = device.get('mac', '').lower()
                    name = device.get('name', device.get('model', 'Unknown Device'))
                    device_map[mac] = name
                logger.info(f"Fetched {len(device_map)} network devices")
                return device_map
        except Exception as e:
            logger.error(f"Error fetching devices: {e}")
        return {}

    def get_switch_name(self, switch_mac: str) -> str:
        """Get the friendly name of a switch by its MAC address"""
        if not self.devices:
            self.devices = self.get_devices()
        return self.devices.get(switch_mac.lower(), switch_mac) if switch_mac else "N/A"

    def get_clients(self) -> List[Dict[str, Any]]:
        if not self.authenticated:
            return []
        
        try:
            if self.is_unifi_os:
                url = f"{self.controller_url}/proxy/network/api/s/{self.site}/stat/sta"
            else:
                url = f"{self.controller_url}/api/s/{self.site}/stat/sta"
            
            response = self.session.get(url)
            if response.status_code == 200:
                data = response.json()
                return data.get('data', [])
        except Exception as e:
            logger.error(f"Error fetching clients: {e}")
        return []

    def format_client_data(self, clients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Ensure we have device information
        if not self.devices:
            self.devices = self.get_devices()
        
        formatted = []
        for client in clients:
            is_wired = client.get('is_wired', False)
            switch_mac = client.get('sw_mac', '')
            
            formatted_client = {
                "mac": client.get('mac', 'Unknown'),
                "hostname": client.get('hostname', client.get('name', 'Unknown')),
                "ip": client.get('ip', 'N/A'),
                "is_wired": is_wired,
                "network": client.get('network', 'Default'),
                "connection_type": "Wired" if is_wired else "Wireless",
                "ssid": client.get('essid', 'N/A') if not is_wired else "N/A",
                "signal": client.get('signal', 'N/A') if not is_wired else "N/A",
                "switch_mac": switch_mac if is_wired else "N/A",
                "switch_name": self.get_switch_name(switch_mac) if is_wired else "N/A",
                "switch_port": client.get('sw_port', 'N/A') if is_wired else "N/A",
                "uptime": client.get('uptime', 0),
                "rx_bytes": client.get('rx_bytes', 0),
                "tx_bytes": client.get('tx_bytes', 0)
            }
            formatted.append(formatted_client)
        return formatted

    def logout(self):
        try:
            if self.is_unifi_os:
                self.session.post(f"{self.controller_url}/api/auth/logout")
            else:
                self.session.post(f"{self.controller_url}/api/logout")
        except:
            pass

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"status": "error", "message": "Missing arguments"}))
        sys.exit(1)
    
    controller_url = sys.argv[1]
    username = sys.argv[2]
    password = sys.argv[3]
    site = sys.argv[4] if len(sys.argv) > 4 else "default"
    verify_ssl = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else False
    output_file = sys.argv[6] if len(sys.argv) > 6 else None

    collector = UniFiClientCollector(controller_url, username, password, site, verify_ssl)
    
    if not collector.login():
        result = {"status": "error", "message": "Authentication failed"}
    else:
        clients = collector.get_clients()
        formatted = collector.format_client_data(clients)
        
        result = {
            "status": "connected",
            "timestamp": datetime.now().isoformat(),
            "client_count": len(formatted),
            "clients": formatted
        }
        
        collector.logout()
    
    json_output = json.dumps(result, indent=2)
    
    if output_file:
        with open(output_file, 'w') as f:
            f.write(json_output)
    
    print(json_output)

if __name__ == "__main__":
    main()
```

### Step 3: Add to configuration.yaml

Add the following to your `/config/configuration.yaml`:

```yaml
# UniFi Network Client Collector - Input Helpers
input_text:
  unifi_controller_url:
    name: UniFi Controller URL
    initial: "https://192.168.1.1"
    mode: text
  unifi_username:
    name: UniFi Username
    initial: "admin"
    mode: text
  unifi_password:
    name: UniFi Password
    mode: password
  unifi_site:
    name: UniFi Site
    initial: "default"
    mode: text

input_boolean:
  unifi_verify_ssl:
    name: Verify SSL Certificate
    initial: false

# Shell command to fetch UniFi clients
shell_command:
  unifi_fetch_clients: 'python3 /config/python_scripts/unifi_client_collector.py "{{ states(''input_text.unifi_controller_url'') }}" "{{ states(''input_text.unifi_username'') }}" "{{ states(''input_text.unifi_password'') }}" "{{ states(''input_text.unifi_site'') }}" "{{ states(''input_boolean.unifi_verify_ssl'') }}" /config/unifi_status.json'

# Command line sensor to read UniFi status
command_line:
  - sensor:
      name: "UniFi Connection Status"
      unique_id: unifi_connection_status
      command: 'cat /config/unifi_status.json 2>/dev/null || echo ''{"status":"not_tested","message":"Click Test Connection"}'''
      value_template: "{{ value_json.status }}"
      json_attributes:
        - timestamp
        - client_count
        - clients
        - message
      scan_interval: 300

# Include template sensors
template: !include templates.yaml
```

### Step 4: Create templates.yaml

Create `/config/templates.yaml`:

```yaml
# Template sensors for individual UniFi clients
- sensor:
    - name: "UniFi Client 1"
      unique_id: unifi_client_1
      state: >
        {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
        {% if data and data | length > 0 %}
          {{ data[0].hostname | default('Unknown') }}
        {% else %}
          unavailable
        {% endif %}
      attributes:
        ip: >
          {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
          {% if data and data | length > 0 %}{{ data[0].ip | default('N/A') }}{% else %}N/A{% endif %}
        mac: >
          {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
          {% if data and data | length > 0 %}{{ data[0].mac | default('N/A') }}{% else %}N/A{% endif %}
        connection_type: >
          {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
          {% if data and data | length > 0 %}{{ data[0].connection_type | default('N/A') }}{% else %}N/A{% endif %}
        switch_or_ssid: >
          {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
          {% if data and data | length > 0 %}
            {% if data[0].is_wired %}{{ data[0].switch_name | default('N/A') }}{% else %}{{ data[0].ssid | default('N/A') }}{% endif %}
          {% else %}N/A{% endif %}
        port_or_signal: >
          {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
          {% if data and data | length > 0 %}
            {% if data[0].is_wired %}Port {{ data[0].switch_port | default('N/A') }}{% else %}{{ data[0].signal | default('N/A') }} dBm{% endif %}
          {% else %}N/A{% endif %}
      icon: >
        {% set data = state_attr('sensor.unifi_connection_status', 'clients') %}
        {% if data and data | length > 0 and data[0].is_wired %}mdi:lan{% else %}mdi:wifi{% endif %}
    # Repeat for clients 2-5 with index [1], [2], [3], [4]
    # (Full template in templates.yaml file)
```

### Step 5: Create scripts.yaml Entry

Add to `/config/scripts.yaml`:

```yaml
unifi_test_connection:
  alias: Test UniFi Connection
  sequence:
    - service: shell_command.unifi_fetch_clients
    - delay:
        seconds: 2
    - service: homeassistant.update_entity
      target:
        entity_id: sensor.unifi_connection_status
  mode: single
```

### Step 6: Restart Home Assistant

```bash
ha core restart
```

---

## Dashboard Configuration

### Create a New Dashboard

1. Go to Settings → Dashboards → Add Dashboard
2. Name it "UniFi Network Clients"
3. Create dashboard with following cards:

### Credentials Card (Entities)
```yaml
type: entities
title: UniFi Connection Settings
entities:
  - entity: input_text.unifi_controller_url
  - entity: input_text.unifi_username
  - entity: input_text.unifi_password
  - entity: input_boolean.unifi_verify_ssl
```

### Test Connection Button
```yaml
type: button
name: Test Connection
tap_action:
  action: call-service
  service: script.unifi_test_connection
icon: mdi:lan-connect
```

### Connected Devices (Markdown)
```yaml
type: markdown
title: Connected Devices
content: >-
  {% set clients = state_attr('sensor.unifi_connection_status', 'clients') %}
  {% if clients %}
  | Device | IP | MAC | Switch/SSID | Port/Signal |
  |--------|-----|-----|-------------|-------------|
  {%- for client in clients %}
  | **{{ client.hostname }}** | {{ client.ip }} | {{ client.mac }} | {{ client.switch_name if client.is_wired else client.ssid }} | {% if client.is_wired %}Port {{ client.switch_port }}{% else %}{{ client.signal }} dBm{% endif %} |
  {%- endfor %}
  {% else %}
  No clients connected
  {% endif %}
```

---

## Troubleshooting

### Authentication Issues
- Ensure correct port: UniFi OS uses port 443, legacy controllers use 8443
- Check username and password
- Verify the site name (usually "default")

### No Data Displayed
1. Check Terminal: `cat /config/unifi_status.json`
2. Run script manually: `python3 /config/python_scripts/unifi_client_collector.py "https://192.168.1.1" "admin" "password" "default" "false" /config/unifi_status.json`
3. Check Home Assistant logs for errors

### SSL Certificate Errors
- Set "Verify SSL Certificate" to OFF for self-signed certificates

---

## Data Fields Reference

| Field | Description | Example |
|-------|-------------|---------|
| hostname | Client device name | "homeassistant" |
| ip | IP address | "192.168.1.149" |
| mac | MAC address | "78:55:36:00:85:c7" |
| is_wired | Boolean for wired/wireless | true |
| connection_type | "Wired" or "Wireless" | "Wired" |
| switch_name | Switch friendly name (wired) | "USW 16 PoE" |
| switch_port | Switch port number (wired) | 15 |
| ssid | WiFi network name (wireless) | "Zshop" |
| signal | Signal strength in dBm (wireless) | -45 |

---

## Maintenance

### Updating the Script
1. Edit `/config/python_scripts/unifi_client_collector.py`
2. No restart required - changes take effect on next execution

### Adding More Client Slots
1. Edit `/config/templates.yaml`
2. Duplicate the sensor template and change index number
3. Reload template entities from Developer Tools

---

## Version History

- **1.0** - Initial release with full client data collection
  - IP, MAC, switch name, switch port for wired clients
  - SSID, signal strength for wireless clients
  - Dynamic icon based on connection type

