#!/bin/bash
# Diagnostic script to check UniFi topology data in Home Assistant
# Run this from within HA (SSH or terminal)

echo "=== UniFi Topology Diagnostic ==="
echo ""

# Check if the JSON file exists
JSON_FILE="/config/www/unifi_clients.json"
if [ ! -f "$JSON_FILE" ]; then
    echo "ERROR: $JSON_FILE not found"
    exit 1
fi

echo "✓ JSON file exists: $JSON_FILE"
echo ""

# Check devices for topology data
echo "=== Checking devices for topology data ==="
python3 -c "
import json

with open('$JSON_FILE') as f:
    data = json.load(f)

devices = data.get('devices', [])
print(f'Total devices: {len(devices)}')
print()

for d in devices:
    name = d.get('name', 'Unknown')
    cat = d.get('category', 'unknown')
    print(f'Device: {name} ({cat})')
    print(f'  MAC: {d.get(\"mac\", \"N/A\")}')

    # Check uplink data
    uplink_mac = d.get('uplink_mac', '')
    uplink_port = d.get('uplink_remote_port')
    print(f'  uplink_mac: {uplink_mac or \"(empty)\"}')
    print(f'  uplink_remote_port: {uplink_port or \"(empty)\"}')

    # Check raw uplink object
    uplink = d.get('uplink', {})
    if uplink:
        print(f'  uplink object: {json.dumps(uplink, indent=4)}')

    # Check downlink_table
    dl_table = d.get('downlink_table', [])
    if dl_table:
        print(f'  downlink_table ({len(dl_table)} entries):')
        for dl in dl_table:
            print(f'    - MAC: {dl.get(\"mac\")}, port_idx: {dl.get(\"port_idx\")}')
    else:
        print(f'  downlink_table: (empty)')

    # Check lldp_table
    lldp_table = d.get('lldp_table', [])
    if lldp_table:
        print(f'  lldp_table ({len(lldp_table)} entries):')
        for ll in lldp_table:
            print(f'    - local_port: {ll.get(\"local_port_idx\")}, chassis_id: {ll.get(\"chassis_id\")}')
    else:
        print(f'  lldp_table: (empty)')

    print()
"

echo ""
echo "=== Summary ==="
echo "If uplink_mac and downlink_table are empty, the Python collector"
echo "is not extracting topology data from the UniFi API."
echo ""
echo "Solution: Update /config/python_scripts/unifi_client_collector.py"
echo "to include these fields in format_device()."
