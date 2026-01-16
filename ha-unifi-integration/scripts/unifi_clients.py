#!/usr/bin/env python3
"""
UniFi Network Clients Sensor for Home Assistant
Fetches all client data from UDM Pro/SE including switch port information.

Place this file in: /config/scripts/unifi_clients.py
Make executable: chmod +x /config/scripts/unifi_clients.py

Required: pip install requests (usually pre-installed in HA)
"""

import json
import sys
import os
import requests
import urllib3

# Disable SSL warnings for self-signed certs (UDM uses self-signed)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def get_config():
    """Load configuration from environment variables or defaults."""
    return {
        "host": os.environ.get("UNIFI_HOST", "192.168.1.1"),
        "username": os.environ.get("UNIFI_USERNAME", ""),
        "password": os.environ.get("UNIFI_PASSWORD", ""),
        "site": os.environ.get("UNIFI_SITE", "default"),
        "verify_ssl": os.environ.get("UNIFI_VERIFY_SSL", "false").lower() == "true"
    }


def authenticate(session, config):
    """
    Authenticate to UniFi controller and return session with auth cookie.
    UDM Pro/SE uses a different auth endpoint than standalone controllers.
    """
    # UDM Pro/SE authentication endpoint
    auth_url = f"https://{config['host']}/api/auth/login"

    payload = {
        "username": config["username"],
        "password": config["password"]
    }

    try:
        response = session.post(
            auth_url,
            json=payload,
            verify=config["verify_ssl"],
            timeout=10
        )
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        # Try legacy endpoint (for older firmware or Cloud Key)
        legacy_url = f"https://{config['host']}:8443/api/login"
        try:
            response = session.post(
                legacy_url,
                json=payload,
                verify=config["verify_ssl"],
                timeout=10
            )
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException:
            print(json.dumps({"error": f"Authentication failed: {str(e)}", "clients": []}))
            return False


def get_clients(session, config):
    """
    Fetch all connected clients from UniFi controller.
    Returns list of client dictionaries with switch port info.
    """
    # UDM Pro/SE API endpoint for active clients
    clients_url = f"https://{config['host']}/proxy/network/api/s/{config['site']}/stat/sta"

    try:
        response = session.get(
            clients_url,
            verify=config["verify_ssl"],
            timeout=15
        )
        response.raise_for_status()
        data = response.json()
        return data.get("data", [])
    except requests.exceptions.RequestException:
        # Try legacy endpoint
        legacy_url = f"https://{config['host']}:8443/api/s/{config['site']}/stat/sta"
        try:
            response = session.get(
                legacy_url,
                verify=config["verify_ssl"],
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])
        except requests.exceptions.RequestException as e:
            return []


def get_devices(session, config):
    """
    Fetch all UniFi network devices (switches, APs) for reference.
    Useful for mapping sw_mac to device names.
    """
    devices_url = f"https://{config['host']}/proxy/network/api/s/{config['site']}/stat/device"

    try:
        response = session.get(
            devices_url,
            verify=config["verify_ssl"],
            timeout=15
        )
        response.raise_for_status()
        data = response.json()
        return {d.get("mac"): d.get("name", d.get("model", "Unknown"))
                for d in data.get("data", [])}
    except requests.exceptions.RequestException:
        return {}


def format_client(client, device_names):
    """
    Format a client record with the fields we care about.
    Includes switch port info, network details, and connection state.
    """
    sw_mac = client.get("sw_mac", "")

    return {
        # Identity
        "mac": client.get("mac", ""),
        "hostname": client.get("hostname", client.get("name", "Unknown")),
        "name": client.get("name", client.get("hostname", "")),
        "oui": client.get("oui", ""),  # Manufacturer

        # Network details
        "ip": client.get("ip", ""),
        "network": client.get("network", ""),
        "vlan": client.get("vlan", 1),

        # Switch port info (the key data you need!)
        "sw_port": client.get("sw_port"),
        "sw_mac": sw_mac,
        "sw_name": device_names.get(sw_mac, "Unknown Switch"),
        "sw_depth": client.get("sw_depth"),

        # Connection state
        "is_wired": client.get("is_wired", False),
        "is_guest": client.get("is_guest", False),
        "uptime": client.get("uptime", 0),
        "last_seen": client.get("last_seen", 0),
        "first_seen": client.get("first_seen", 0),

        # Wireless info (if applicable)
        "essid": client.get("essid", ""),
        "radio": client.get("radio", ""),
        "signal": client.get("signal", 0),
        "channel": client.get("channel"),
        "ap_mac": client.get("ap_mac", ""),

        # Traffic stats
        "tx_bytes": client.get("tx_bytes", 0),
        "rx_bytes": client.get("rx_bytes", 0),
        "tx_packets": client.get("tx_packets", 0),
        "rx_packets": client.get("rx_packets", 0),

        # Additional useful fields
        "satisfaction": client.get("satisfaction", 100),
        "noted": client.get("noted", False),
        "usergroup_id": client.get("usergroup_id", ""),
    }


def main():
    """Main entry point - fetch and output client data as JSON."""
    config = get_config()

    # Validate required config
    if not config["username"] or not config["password"]:
        print(json.dumps({
            "error": "Missing UNIFI_USERNAME or UNIFI_PASSWORD environment variables",
            "clients": []
        }))
        sys.exit(1)

    # Create session with cookie persistence
    session = requests.Session()

    # Authenticate
    if not authenticate(session, config):
        sys.exit(1)

    # Get device names for switch mapping
    device_names = get_devices(session, config)

    # Get all clients
    raw_clients = get_clients(session, config)

    # Format clients with relevant fields
    clients = [format_client(c, device_names) for c in raw_clients]

    # Sort by hostname for consistent ordering
    clients.sort(key=lambda x: x.get("hostname", "").lower())

    # Output JSON for Home Assistant command_line sensor
    output = {
        "clients": clients,
        "total_count": len(clients),
        "wired_count": sum(1 for c in clients if c.get("is_wired")),
        "wireless_count": sum(1 for c in clients if not c.get("is_wired")),
    }

    print(json.dumps(output))


if __name__ == "__main__":
    main()
