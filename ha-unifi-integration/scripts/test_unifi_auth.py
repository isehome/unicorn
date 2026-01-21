#!/usr/bin/env python3
"""
UniFi Authentication Diagnostic Script

This script tests authentication to your UDM Pro/SE and reports exactly
what's failing. Run this directly on your Home Assistant to diagnose
the "Authentication failed" error.

Usage:
    # On Home Assistant (via SSH or Terminal add-on):
    UNIFI_HOST=192.168.1.1 UNIFI_USERNAME=admin UNIFI_PASSWORD=yourpass python3 test_unifi_auth.py

    # Or set vars in the script below for testing
"""

import json
import os
import sys
import socket

# ============================================================================
# CONFIGURATION - Set these for testing, or use environment variables
# ============================================================================
TEST_HOST = os.environ.get("UNIFI_HOST", "192.168.1.1")
TEST_USERNAME = os.environ.get("UNIFI_USERNAME", "")  # Set this!
TEST_PASSWORD = os.environ.get("UNIFI_PASSWORD", "")  # Set this!
TEST_SITE = os.environ.get("UNIFI_SITE", "default")

# ============================================================================
# DIAGNOSTIC TESTS
# ============================================================================

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def print_result(test, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test}")
    if details:
        print(f"       {details}")

def test_dns_resolution():
    """Test if the host can be resolved."""
    print_header("TEST 1: DNS Resolution / Host Reachability")

    try:
        # If it's already an IP, this will just return it
        ip = socket.gethostbyname(TEST_HOST)
        print_result("DNS/IP resolution", True, f"Host resolves to: {ip}")
        return True
    except socket.gaierror as e:
        print_result("DNS/IP resolution", False, f"Cannot resolve host: {e}")
        return False

def test_port_connectivity():
    """Test if HTTPS port is open."""
    print_header("TEST 2: Network Connectivity (Port 443)")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)

    try:
        result = sock.connect_ex((TEST_HOST, 443))
        if result == 0:
            print_result("Port 443 (HTTPS)", True, "Port is open and accepting connections")
            return True
        else:
            print_result("Port 443 (HTTPS)", False, f"Connection refused (error code: {result})")
            return False
    except socket.error as e:
        print_result("Port 443 (HTTPS)", False, f"Socket error: {e}")
        return False
    finally:
        sock.close()

def test_https_connection():
    """Test HTTPS connection (with SSL verification disabled)."""
    print_header("TEST 3: HTTPS Connection")

    try:
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        url = f"https://{TEST_HOST}/"
        response = requests.get(url, verify=False, timeout=10)
        print_result("HTTPS connection", True, f"Status code: {response.status_code}")

        # Check if it's a UniFi device
        if "UniFi" in response.text or "ubnt" in response.text.lower():
            print_result("UniFi detection", True, "Response appears to be from a UniFi device")
        else:
            print_result("UniFi detection", False, "Response doesn't look like UniFi")
            print(f"       Response preview: {response.text[:200]}...")

        return True
    except ImportError:
        print_result("HTTPS connection", False, "requests library not installed")
        print("       Run: pip install requests")
        return False
    except requests.exceptions.Timeout:
        print_result("HTTPS connection", False, "Connection timed out")
        return False
    except requests.exceptions.ConnectionError as e:
        print_result("HTTPS connection", False, f"Connection error: {e}")
        return False
    except Exception as e:
        print_result("HTTPS connection", False, f"Unexpected error: {e}")
        return False

def test_auth_endpoint():
    """Test the authentication endpoint specifically."""
    print_header("TEST 4: Authentication Endpoint")

    if not TEST_USERNAME or not TEST_PASSWORD:
        print_result("Credentials provided", False, "UNIFI_USERNAME or UNIFI_PASSWORD not set!")
        print("\n       Set these environment variables and re-run:")
        print("       UNIFI_HOST=192.168.1.1 UNIFI_USERNAME=admin UNIFI_PASSWORD=yourpass python3 test_unifi_auth.py")
        return False

    print_result("Credentials provided", True, f"Username: {TEST_USERNAME}")

    try:
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        session = requests.Session()

        # Try UDM Pro/SE endpoint first
        auth_url = f"https://{TEST_HOST}/api/auth/login"
        payload = {"username": TEST_USERNAME, "password": TEST_PASSWORD}

        print(f"\n  Trying primary endpoint: {auth_url}")

        try:
            response = session.post(auth_url, json=payload, verify=False, timeout=10)
            print(f"  Response status: {response.status_code}")

            if response.status_code == 200:
                print_result("Primary auth (UniFi OS)", True, "Authentication successful!")

                # Try to get some data to confirm session works
                test_url = f"https://{TEST_HOST}/proxy/network/api/s/{TEST_SITE}/stat/device"
                test_resp = session.get(test_url, verify=False, timeout=10)
                if test_resp.status_code == 200:
                    data = test_resp.json()
                    devices = data.get("data", [])
                    print_result("API access", True, f"Found {len(devices)} UniFi devices")

                    # Show device summary
                    for d in devices[:5]:  # Show first 5
                        name = d.get("name", d.get("model", "Unknown"))
                        dtype = d.get("type", "?")
                        print(f"         - {name} ({dtype})")
                    if len(devices) > 5:
                        print(f"         ... and {len(devices) - 5} more")
                else:
                    print_result("API access", False, f"Status {test_resp.status_code}: {test_resp.text[:100]}")

                return True

            elif response.status_code == 401:
                print_result("Primary auth (UniFi OS)", False, "Invalid username or password")
                try:
                    error_data = response.json()
                    print(f"       Error details: {json.dumps(error_data, indent=2)}")
                except:
                    pass
                return False

            elif response.status_code == 403:
                print_result("Primary auth (UniFi OS)", False, "Access forbidden - check user permissions")
                return False

            else:
                print_result("Primary auth (UniFi OS)", False, f"Unexpected status: {response.status_code}")
                print(f"       Response: {response.text[:200]}")

        except requests.exceptions.RequestException as e:
            print(f"  Primary endpoint failed: {e}")

        # Try legacy endpoint
        legacy_url = f"https://{TEST_HOST}:8443/api/login"
        print(f"\n  Trying legacy endpoint: {legacy_url}")

        try:
            response = session.post(legacy_url, json=payload, verify=False, timeout=10)
            print(f"  Response status: {response.status_code}")

            if response.status_code == 200:
                print_result("Legacy auth (Controller)", True, "Authentication successful!")
                return True
            else:
                print_result("Legacy auth (Controller)", False, f"Status {response.status_code}")

        except requests.exceptions.RequestException as e:
            print(f"  Legacy endpoint failed: {e}")

        print_result("Authentication", False, "Both endpoints failed")
        return False

    except ImportError:
        print_result("Authentication test", False, "requests library not installed")
        return False
    except Exception as e:
        print_result("Authentication test", False, f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_2fa_check():
    """Check if 2FA might be enabled."""
    print_header("TEST 5: Two-Factor Authentication Check")

    print("  Note: This script does NOT support 2FA.")
    print("  If 2FA is enabled on your UniFi account, you need to:")
    print("    1. Create a local admin account WITHOUT 2FA, or")
    print("    2. Disable 2FA on your main account for API access")
    print("")
    print("  To create a local-only admin account:")
    print("    1. Go to UniFi Console > Settings > Admins")
    print("    2. Click 'Add Admin'")
    print("    3. Choose 'Local Access Only'")
    print("    4. Set username/password")
    print("    5. Do NOT enable 2FA for this account")
    print("    6. Use these credentials in Home Assistant")

    return True  # Just informational

def main():
    print("\n" + "="*60)
    print("  UniFi Authentication Diagnostic Tool")
    print("="*60)
    print(f"\n  Target Host:     {TEST_HOST}")
    print(f"  Username:        {TEST_USERNAME or '(not set)'}")
    print(f"  Password:        {'*' * len(TEST_PASSWORD) if TEST_PASSWORD else '(not set)'}")
    print(f"  Site:            {TEST_SITE}")

    results = []

    # Run tests in order
    results.append(("DNS/Network", test_dns_resolution()))
    results.append(("Port Access", test_port_connectivity()))
    results.append(("HTTPS", test_https_connection()))
    results.append(("Authentication", test_auth_endpoint()))
    test_2fa_check()

    # Summary
    print_header("SUMMARY")

    all_passed = all(r[1] for r in results)

    for name, passed in results:
        status = "✅" if passed else "❌"
        print(f"  {status} {name}")

    if all_passed:
        print("\n  🎉 All tests passed! Authentication should work.")
        print("\n  If shell_command.unifi_fetch_clients is still failing:")
        print("    1. Check that /config/python_scripts/unifi_client_collector.py exists")
        print("    2. Verify secrets.yaml has the correct values")
        print("    3. Check Home Assistant logs for detailed errors")
    else:
        print("\n  ⚠️  Some tests failed. See above for details.")

        # Specific recommendations
        if not results[0][1]:  # DNS failed
            print("\n  → Check that the IP address is correct")
            print("  → Ensure the UDM Pro is on the same network as HA")

        elif not results[1][1]:  # Port failed
            print("\n  → Firewall may be blocking port 443")
            print("  → Check UDM Pro is running and accessible")

        elif not results[2][1]:  # HTTPS failed
            print("\n  → SSL certificate issue (but we disable verification)")
            print("  → UDM Pro web interface may be down")

        elif not results[3][1]:  # Auth failed
            print("\n  → Username or password is incorrect")
            print("  → User may not have admin privileges")
            print("  → 2FA may be enabled (not supported)")
            print("  → Try logging into https://{} in browser first".format(TEST_HOST))

if __name__ == "__main__":
    main()
