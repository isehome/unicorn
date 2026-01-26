#!/bin/bash
# Deploy the correct UniFi script to Home Assistant
#
# Run this in HA terminal/SSH:
#   bash /config/deploy_unifi_script_to_ha.sh
#
# Or copy the unifi_clients.py content below directly to /config/scripts/unifi_clients.py

echo "=== Checking UniFi Script Location ==="

# The HA configuration expects the script here:
SCRIPT_PATH="/config/scripts/unifi_clients.py"

# Check if directory exists
if [ ! -d "/config/scripts" ]; then
    echo "Creating /config/scripts directory..."
    mkdir -p /config/scripts
fi

# Check current script
if [ -f "$SCRIPT_PATH" ]; then
    echo "✓ Script exists at $SCRIPT_PATH"

    # Check if it has the topology fields
    if grep -q "downlink_table" "$SCRIPT_PATH"; then
        echo "✓ Script has downlink_table field"
    else
        echo "✗ Script is MISSING downlink_table field - needs update!"
    fi

    if grep -q "uplink_remote_port" "$SCRIPT_PATH"; then
        echo "✓ Script has uplink_remote_port field"
    else
        echo "✗ Script is MISSING uplink_remote_port field - needs update!"
    fi
else
    echo "✗ Script NOT FOUND at $SCRIPT_PATH"
    echo "  You need to copy unifi_clients.py to this location"
fi

echo ""
echo "=== Fix Instructions ==="
echo "If the script is missing or doesn't have topology fields:"
echo "1. Copy the unifi_clients.py from the Unicorn repo:"
echo "   ha-unifi-integration/scripts/unifi_clients.py"
echo "2. Save it to: /config/scripts/unifi_clients.py"
echo "3. Run: ha core restart"
echo ""
echo "Or run in HA terminal:"
echo "  curl -o /config/scripts/unifi_clients.py https://raw.githubusercontent.com/your-repo/unicorn/main/ha-unifi-integration/scripts/unifi_clients.py"
