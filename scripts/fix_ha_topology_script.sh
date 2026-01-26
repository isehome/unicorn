#!/bin/bash
# Fix the UniFi Python script on Home Assistant to include topology data
# Run this in the HA terminal (SSH add-on)

SCRIPT_PATH="/config/scripts/unifi_clients.py"

echo "=== Checking current script for topology fields ==="

# Check if the script has the topology fields
if grep -q "downlink_table" "$SCRIPT_PATH" 2>/dev/null; then
    echo "✓ Script already has downlink_table"
else
    echo "✗ Script is MISSING downlink_table - needs update!"
fi

if grep -q "uplink_remote_port" "$SCRIPT_PATH" 2>/dev/null; then
    echo "✓ Script already has uplink_remote_port"
else
    echo "✗ Script is MISSING uplink_remote_port - needs update!"
fi

if grep -q "lldp_table" "$SCRIPT_PATH" 2>/dev/null; then
    echo "✓ Script already has lldp_table"
else
    echo "✗ Script is MISSING lldp_table - needs update!"
fi

echo ""
echo "=== To fix, run these commands in HA terminal: ==="
echo ""
cat << 'COMMANDS'
# Download the updated script from GitHub (replace with your repo URL):
curl -o /config/scripts/unifi_clients.py https://raw.githubusercontent.com/YOUR_REPO/unicorn/main/ha-unifi-integration/scripts/unifi_clients.py

# Or manually add these fields to the format_device() function return dict:
# After "mem": ... add:
#
#     # Uplink/topology info
#     "uplink_mac": device.get("uplink", {}).get("uplink_mac", ""),
#     "uplink_remote_port": device.get("uplink", {}).get("uplink_remote_port"),
#     "uplink_device_name": device.get("uplink", {}).get("uplink_device_name", ""),
#     "uplink": device.get("uplink", {}),
#
#     # Topology tables
#     "lldp_table": device.get("lldp_table", []),
#     "downlink_table": device.get("downlink_table", []),
#     "uplink_table": device.get("uplink_table", []),

# After updating, regenerate the JSON and restart HA:
python3 /config/scripts/unifi_clients.py
ha core restart
COMMANDS
