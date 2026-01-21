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
    Fetch all UniFi network devices (switches, APs, gateways) with full details.
    Returns tuple of (name_map, devices_list).
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
        raw_devices = data.get("data", [])

        # Build name mapping for client lookups
        name_map = {d.get("mac"): d.get("name", d.get("model", "Unknown"))
                    for d in raw_devices}

        # Format full device list
        devices_list = [format_device(d) for d in raw_devices]

        return name_map, devices_list
    except requests.exceptions.RequestException:
        return {}, []


def format_device(device):
    """
    Format a UniFi device (switch, AP, gateway) with relevant fields.
    """
    device_type = device.get("type", "unknown")

    # Determine device category
    if device_type in ["usw", "usw-pro", "usw-flex"]:
        category = "switch"
    elif device_type in ["uap", "uap-pro", "uap-ac", "u6"]:
        category = "access_point"
    elif device_type in ["ugw", "udm", "udr", "uxg"]:
        category = "gateway"
    else:
        category = device_type

    # Build port summary for switches
    port_table = device.get("port_table", [])
    ports_used = sum(1 for p in port_table if p.get("up", False))
    ports_total = len(port_table)

    # Get the IP address - for gateways, prefer the LAN IP over WAN IP
    ip_address = device.get("ip", "")
    if category == "gateway":
        # For UDM Pro/SE/etc, the 'ip' field might be the WAN IP
        # Check for LAN IP in various possible locations
        # 1. Check network_table for LAN network
        network_table = device.get("network_table", [])
        for net in network_table:
            # Look for the LAN network (usually named "LAN" or is the default network)
            net_name = net.get("name", "").lower()
            if "lan" in net_name or net.get("is_default", False):
                lan_ip = net.get("ip_subnet", "").split("/")[0]  # Get IP without CIDR
                if lan_ip:
                    ip_address = lan_ip
                    break

        # 2. Check config_network for LAN IP
        if not ip_address or ip_address == device.get("ip", ""):
            config_network = device.get("config_network", {})
            if config_network.get("ip"):
                ip_address = config_network.get("ip")

        # 3. Check connect_request_ip (often the internal management IP)
        if not ip_address or ip_address == device.get("ip", ""):
            connect_ip = device.get("connect_request_ip", "")
            # Only use if it looks like a private IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if connect_ip and (
                connect_ip.startswith("192.168.") or
                connect_ip.startswith("10.") or
                connect_ip.startswith("172.")
            ):
                ip_address = connect_ip

    return {
        # Identity
        "mac": device.get("mac", ""),
        "name": device.get("name", device.get("model", "Unknown")),
        "model": device.get("model", ""),
        "type": device_type,
        "category": category,

        # Network - use computed ip_address which prefers LAN IP for gateways
        "ip": ip_address,
        "gateway_mac": device.get("gateway_mac", ""),

        # Status
        "state": device.get("state", 0),  # 1 = connected
        "adopted": device.get("adopted", False),
        "uptime": device.get("uptime", 0),
        "last_seen": device.get("last_seen", 0),

        # Version info
        "version": device.get("version", ""),
        "upgradable": device.get("upgradable", False),

        # Switch/Gateway port info (Dream Machine gateways also have ports)
        "ports_total": ports_total,
        "ports_used": ports_used,
        "port_table": [format_port(p) for p in port_table] if category in ["switch", "gateway"] else [],

        # AP-specific
        "num_sta": device.get("num_sta", 0),  # Number of connected stations
        "channel": device.get("channel", ""),
        "radio_table": device.get("radio_table", []),

        # System stats
        "cpu": device.get("system-stats", {}).get("cpu", ""),
        "mem": device.get("system-stats", {}).get("mem", ""),
        "loadavg_1": device.get("sys_stats", {}).get("loadavg_1", ""),
    }


def format_port(port):
    """Format a switch port entry with MAC address fields for device identification."""
    return {
        "port_idx": port.get("port_idx"),
        "name": port.get("name", f"Port {port.get('port_idx', '?')}"),
        "up": port.get("up", False),
        "speed": port.get("speed", 0),
        "full_duplex": port.get("full_duplex", False),
        "poe_enable": port.get("poe_enable", False),
        "poe_mode": port.get("poe_mode", ""),
        "poe_power": port.get("poe_power", ""),
        "is_uplink": port.get("is_uplink", False),
        # MAC address fields for identifying connected devices
        "mac": port.get("mac", ""),
        "lldp_remote_mac": port.get("lldp_remote_mac", ""),  # LLDP discovered MAC
        "port_mac": port.get("port_mac", ""),  # Alternative MAC field
    }


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
    """Main entry point - fetch and output client and device data as JSON."""
    config = get_config()

    # Validate required config
    if not config["username"] or not config["password"]:
        print(json.dumps({
            "error": "Missing UNIFI_USERNAME or UNIFI_PASSWORD environment variables",
            "clients": [],
            "devices": []
        }))
        sys.exit(1)

    # Create session with cookie persistence
    session = requests.Session()

    # Authenticate
    if not authenticate(session, config):
        sys.exit(1)

    # Get devices (returns name_map for client lookups AND full device list)
    device_names, devices = get_devices(session, config)

    # Get all clients
    raw_clients = get_clients(session, config)

    # Format clients with relevant fields
    clients = [format_client(c, device_names) for c in raw_clients]

    # Sort clients by hostname for consistent ordering
    clients.sort(key=lambda x: x.get("hostname", "").lower())

    # Sort devices by name
    devices.sort(key=lambda x: x.get("name", "").lower())

    # Count device types
    switches = [d for d in devices if d.get("category") == "switch"]
    access_points = [d for d in devices if d.get("category") == "access_point"]
    gateways = [d for d in devices if d.get("category") == "gateway"]

    # Output JSON for Home Assistant command_line sensor
    output = {
        # Client data
        "clients": clients,
        "total_count": len(clients),
        "wired_count": sum(1 for c in clients if c.get("is_wired")),
        "wireless_count": sum(1 for c in clients if not c.get("is_wired")),

        # Device data (NEW!)
        "devices": devices,
        "device_count": len(devices),
        "switch_count": len(switches),
        "ap_count": len(access_points),
        "gateway_count": len(gateways),
    }

    print(json.dumps(output))


if __name__ == "__main__":
    main()
