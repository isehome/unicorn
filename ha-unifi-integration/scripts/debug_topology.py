#!/usr/bin/env python3
"""
Debug script to inspect UniFi topology data.
Run this on Home Assistant to see what uplink/downlink data is available.

Usage:
  UNIFI_HOST=192.168.1.1 UNIFI_USERNAME=xxx UNIFI_PASSWORD=xxx python3 debug_topology.py
"""

import json
import sys
import os
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def main():
    config = {
        "host": os.environ.get("UNIFI_HOST", "192.168.1.1"),
        "username": os.environ.get("UNIFI_USERNAME", ""),
        "password": os.environ.get("UNIFI_PASSWORD", ""),
        "site": os.environ.get("UNIFI_SITE", "default"),
    }

    if not config["username"] or not config["password"]:
        print("ERROR: Set UNIFI_USERNAME and UNIFI_PASSWORD environment variables")
        sys.exit(1)

    session = requests.Session()

    # Login
    auth_url = f"https://{config['host']}/api/auth/login"
    resp = session.post(auth_url, json={
        "username": config["username"],
        "password": config["password"]
    }, verify=False, timeout=10)

    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code}")
        sys.exit(1)

    print("✓ Login successful\n")

    # Get devices
    devices_url = f"https://{config['host']}/proxy/network/api/s/{config['site']}/stat/device"
    resp = session.get(devices_url, verify=False, timeout=15)
    devices = resp.json().get("data", [])

    print(f"Found {len(devices)} devices\n")
    print("=" * 80)

    for d in devices:
        name = d.get("name", d.get("model", "Unknown"))
        mac = d.get("mac", "")
        device_type = d.get("type", "unknown")

        print(f"\n{'='*80}")
        print(f"DEVICE: {name}")
        print(f"  MAC: {mac}")
        print(f"  Type: {device_type}")
        print(f"  IP: {d.get('ip', 'N/A')}")

        # UPLINK - this is what we need for port mapping!
        uplink = d.get("uplink", {})
        print(f"\n  UPLINK OBJECT:")
        if uplink:
            print(f"    uplink_mac: {uplink.get('uplink_mac', 'EMPTY')}")
            print(f"    uplink_remote_port: {uplink.get('uplink_remote_port', 'EMPTY')}")
            print(f"    uplink_device_name: {uplink.get('uplink_device_name', 'EMPTY')}")
            print(f"    mac: {uplink.get('mac', 'EMPTY')}")
            print(f"    type: {uplink.get('type', 'EMPTY')}")
            print(f"    Full uplink object: {json.dumps(uplink, indent=6)}")
        else:
            print("    (empty)")

        # DOWNLINK TABLE - devices connected to this device
        downlink_table = d.get("downlink_table", [])
        print(f"\n  DOWNLINK_TABLE ({len(downlink_table)} entries):")
        if downlink_table:
            for dl in downlink_table:
                print(f"    - MAC: {dl.get('mac')}, port_idx: {dl.get('port_idx')}, type: {dl.get('type')}")
        else:
            print("    (empty)")

        # LLDP TABLE - LLDP neighbor discovery
        lldp_table = d.get("lldp_table", [])
        print(f"\n  LLDP_TABLE ({len(lldp_table)} entries):")
        if lldp_table:
            for lldp in lldp_table:
                print(f"    - Port {lldp.get('local_port_idx')}: chassis_id={lldp.get('chassis_id')}, port_id={lldp.get('port_id')}")
        else:
            print("    (empty)")

        # PORT TABLE - check for mac_table entries
        port_table = d.get("port_table", [])
        if port_table:
            print(f"\n  PORT_TABLE ({len(port_table)} ports):")
            for p in port_table:
                port_idx = p.get("port_idx")
                up = p.get("up", False)
                is_uplink = p.get("is_uplink", False)
                mac_table = p.get("mac_table", [])
                lldp_info = p.get("lldp_info", {})

                if up:  # Only show active ports
                    print(f"    Port {port_idx}: up={up}, is_uplink={is_uplink}")
                    if mac_table:
                        print(f"      mac_table: {mac_table}")
                    if lldp_info:
                        print(f"      lldp_info: {lldp_info}")
                    # Check for any MAC-related fields
                    for key in ['mac', 'lldp_remote_mac', 'port_mac']:
                        val = p.get(key)
                        if val:
                            print(f"      {key}: {val}")

    print("\n" + "=" * 80)
    print("SUMMARY: Look above for 'uplink_mac' and 'uplink_remote_port' values.")
    print("If they're empty, the UniFi API isn't providing topology data.")
    print("In that case, we need to use client sw_mac/sw_port for mapping.")
    print("=" * 80)


if __name__ == "__main__":
    main()
