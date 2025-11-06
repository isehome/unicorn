# UniFi Mobile Access Setup Guide

## Overview
This guide explains how to access UniFi Network API client data from mobile devices (iPhones/iPads) while onsite. The solution uses a Vercel proxy to handle CORS restrictions and SSL certificate issues.

> **Note:** The enhanced proxy with self-signed certificate support has been implemented. Once deployed to Vercel, mobile access will work properly.

## Table of Contents
- [For Network Administrators](#for-network-administrators)
- [For Technicians](#for-technicians)
- [Troubleshooting](#troubleshooting)
- [Technical Details](#technical-details)

---

## For Network Administrators

### Prerequisites
- UniFi Network Application v7.0 or higher
- Access to UniFi controller settings
- Network API key generation privileges

### Setup Steps

#### 1. Generate Network API Key
1. Log into your UniFi Network Application
2. Navigate to: **Settings → System → Advanced → Integrations**
3. Click **"Create API Key"**
4. Configure the key:
   - **Name:** Mobile Access (or similar)
   - **Role:** Read-only (minimum) or Read/Write if needed
   - **Scope:** Network API
5. Click **Create** and copy the generated key
6. **Important:** Save this key securely - it won't be shown again

#### 2. Identify Your Controller's WAN IP
1. Check your UniFi controller's public IP address:
   - In UniFi Network: **Settings → System → Administration**
   - Look for "Controller Hostname/IP"
   - Or check your router's WAN interface
2. Note this IP address (e.g., 47.199.106.32)
3. Alternative: Use Dynamic DNS hostname if configured

#### 3. Configure Firewall (Optional but Recommended)
If your controller is behind a firewall:
1. Ensure port 443 (HTTPS) is accessible
2. Consider IP whitelisting for added security
3. Verify the controller accepts external API requests

#### 4. Alternative: Dynamic DNS Setup
For easier access and automatic IP updates:
1. Set up DDNS service (e.g., DuckDNS, No-IP, or similar)
2. Configure hostname (e.g., mycontroller.ddns.net)
3. Update automatically if WAN IP changes
4. Use hostname instead of IP in the app

---

## For Technicians

### Mobile Access Steps

#### 1. Prerequisites
- iPhone or iPad with internet access
- Connected to the client's WiFi network
- Network API key from administrator
- Controller's WAN IP or hostname

#### 2. Accessing the UniFi Test Page
1. Open your mobile browser (Safari/Chrome)
2. Navigate to the Unicorn app
3. Go to the UniFi Test Page

#### 3. Configuration
1. In the **"Local Network API - Client Data"** section (green border):

   **Enter Controller Information:**
   - **Controller WAN IP Address:** Enter the public IP (e.g., 47.199.106.32)
   - **OR Controller Hostname:** Enter if using DDNS (e.g., unifi.local)
   - **Network API Key:** Paste the key from the administrator

2. **Test Connection First:**
   - Click **"Test Connection First"** button
   - Wait for confirmation (green checkmark = success)
   - If it fails, check troubleshooting section below

3. **Get Client Data:**
   - After successful connection test
   - Click **"Get Client Data"** button
   - View results showing MAC addresses, hostnames, and switch ports

#### 4. Using the Data
The client data will show:
- **MAC Address:** Device hardware address
- **Hostname:** Device name on network
- **Switch Port:** Physical port location
- **VLAN:** Network segment assignment
- **IP Address:** Current network address

Use this information for:
- Wire drop commissioning
- Port labeling
- Network documentation
- Troubleshooting connectivity

---

## Troubleshooting

### Common Issues and Solutions

#### Timeout Error
**Symptom:** "Request to controller timed out"
**Solutions:**
1. Verify you're on the same network as the controller
2. Check the WAN IP is correct (not 192.168.x.x)
3. Ensure port 443 is not blocked by firewall
4. Try using hostname instead of IP
5. Verify controller is online and accessible

#### SSL Certificate Error
**Symptom:** "SSL certificate verification failed"
**Note:** This is handled automatically by the proxy
**Solutions:**
1. The proxy accepts self-signed certificates
2. If still failing, controller may require specific configuration
3. Check controller SSL settings

#### No Data Returned
**Symptom:** Connection succeeds but no clients shown
**Solutions:**
1. Verify the Network API key is correct (not Cloud API key)
2. Check the key has appropriate permissions
3. Ensure clients are actually connected to the network
4. Try different endpoint variations (the app tests multiple)
5. Select the correct site if multiple sites exist

#### 403 Forbidden
**Symptom:** "Forbidden: No access to this resource"
**Solutions:**
1. Network API key is incorrect or expired
2. Key doesn't have sufficient permissions
3. Generate a new key with proper scope

#### Connection Refused
**Symptom:** "Connection refused"
**Solutions:**
1. Controller is not accessible from internet
2. Port forwarding not configured
3. Controller service is not running
4. Firewall blocking the connection

---

## Technical Details

### How It Works

1. **Request Flow:**
   ```
   Mobile Browser → Vercel Proxy → UniFi Controller
                    (Handles CORS)   (Accepts self-signed SSL)
   ```

2. **Security Features:**
   - API keys never stored in browser
   - Proxy handles SSL certificate validation
   - Support for self-signed certificates
   - 10-second timeout for safety

3. **Endpoint Discovery:**
   The system automatically tests multiple endpoint patterns:
   - Legacy API: `/proxy/network/api/s/{siteId}/stat/sta`
   - Network v1: `/proxy/network/integration/v1/clients`
   - Site-specific: `/proxy/network/integration/v1/sites/{siteId}/clients`
   - And several other variations

4. **Retry Logic:**
   - Automatic retry with exponential backoff
   - Up to 2 retries per endpoint
   - Helps with intermittent connectivity issues

### API Endpoints Tested

The app automatically tests these endpoints to find working client data:
1. Network API - All Clients (no filter)
2. Network API - Default Site
3. Legacy Network API - Site specific
4. Legacy Network API - Default
5. Various v1/v2 API formats
6. Query parameter formats

### Requirements

**UniFi Controller:**
- UniFi Network Application 7.0+
- Network API enabled
- API key generated

**Mobile Device:**
- Any modern mobile browser
- Connected to same network as controller
- Internet access (for Vercel proxy)

**Network:**
- Controller accessible via WAN IP or hostname
- Port 443 (HTTPS) available
- Same network as controller (for local access)

### Security Considerations

1. **API Keys:**
   - Use read-only keys when possible
   - Rotate keys regularly
   - Never share keys publicly

2. **Network Access:**
   - Consider IP whitelisting
   - Use VPN for additional security
   - Monitor API access logs

3. **Data Privacy:**
   - Client data contains MAC addresses
   - Handle according to privacy policies
   - Don't store unnecessarily

---

## Quick Reference

### Checklist for Mobile Access

- [ ] Network API key generated
- [ ] Controller WAN IP identified
- [ ] Connected to client's WiFi
- [ ] Test connection successful
- [ ] Client data retrieved

### Key Locations in UniFi

- **API Key:** Settings → System → Advanced → Integrations
- **WAN IP:** Settings → System → Administration
- **Client List:** Network → Clients
- **Port Configuration:** Devices → [Switch] → Ports

### Support Resources

- **UniFi Documentation:** https://help.ui.com
- **API Reference:** https://ubntwiki.com/products/software/unifi-controller/api
- **Community Forum:** https://community.ui.com

---

## FAQ

**Q: Why can't I use the local IP (192.168.x.x)?**
A: Browsers block cross-origin requests. The Vercel proxy handles this by using the WAN IP.

**Q: Do I need to be onsite?**
A: Yes, you must be on the same network as the controller for the WAN IP loopback to work.

**Q: What's the difference between Cloud API and Network API keys?**
A: Cloud API keys access cloud-hosted data. Network API keys access the local controller directly.

**Q: Can I use this remotely?**
A: Only if the controller is configured for external access with proper port forwarding.

**Q: Is this secure?**
A: Yes, when using HTTPS and API keys properly. Consider additional security measures for production use.

---

*Last Updated: November 2024*
*Version: 1.0*