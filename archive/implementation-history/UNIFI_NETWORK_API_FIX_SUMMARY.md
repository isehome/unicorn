# UniFi Network API Fix Summary

## Issues Fixed (November 2024)

### Problem Statement
The UniFi Network API (local controller access) was completely non-functional due to:
1. Wrong endpoint paths (using `/proxy/network/...` which doesn't exist on controllers)
2. Wrong port (using 443 instead of 8443)
3. Hardcoded API key (security issue)
4. No distinction between local and remote access

### Changes Made

#### 1. **Removed Hardcoded API Key** (`api/unifi-proxy.js`)
- **Line 90**: Removed hardcoded key `j_ChcU0fSMHlxPoj8djPhkBYgFVy0LAq`
- Now requires Network API key to be provided by user
- Added validation to ensure key is present for Network API calls

#### 2. **Fixed Endpoint Paths** (`src/components/UnifiTestPage.js`)
- **Lines 907-912**: Changed from `/proxy/network/api/s/...` to `/api/s/...`
- These are the actual paths the UniFi controller expects:
  - `/api/s/{siteId}/stat/sta` - Active clients for a specific site
  - `/api/s/default/stat/sta` - Active clients for default site
  - `/v2/api/site/{siteId}/clients` - V2 API for clients
  - `/api/stat/sta` - All active clients

#### 3. **Fixed Port Configuration**
- **Line 935**: Added port 8443 (UniFi controllers use 8443, not 443)
- **Line 820**: Updated connection test to use port 8443
- Automatically adds `:8443` if no port is specified in the URL

#### 4. **Added Conditional Routing**
- **Lines 922-994**: Added logic to detect local vs remote IPs
- Local IPs (192.168.x.x, 10.x.x.x, etc.):
  - Attempts to use local proxy (localhost:3001)
  - Provides clear instructions if local proxy isn't running
- Remote IPs/hostnames:
  - Uses Vercel proxy as before
  - Handles SSL certificates and CORS

### How It Works Now

#### For Mobile Access (WAN IP):
```
Mobile → Vercel Proxy → UniFi Controller (port 8443)
```
- Enter WAN IP or hostname (e.g., `47.199.106.32`)
- System adds port 8443 automatically
- Vercel proxy handles SSL certificates

#### For Local Access (Local IP):
```
Browser → Local Proxy (localhost:3001) → UniFi Controller (port 8443)
```
- Enter local IP (e.g., `192.168.1.1`)
- Must run: `node local-unifi-proxy.js`
- Local proxy handles CORS and SSL

### Testing Instructions

#### Test 1: Mobile Access (Production)
1. Deploy to Vercel: `git push origin main`
2. On mobile device (connected to same network):
   - Open UniFi Test Page
   - Enter controller WAN IP (no need to add :8443)
   - Enter Network API key
   - Click "Test Connection First"
   - Click "Get Client Data"

#### Test 2: Local Development
1. Start local proxy: `node local-unifi-proxy.js`
2. In browser:
   - Enter local controller IP (e.g., `192.168.1.1`)
   - Enter Network API key
   - Test connection and get data

### Key Learnings

1. **UniFi has TWO completely separate APIs:**
   - Cloud API (`api.ui.com`) - For cloud-managed controllers
   - Network API (controller:8443) - For direct controller access

2. **Network API specifics:**
   - Always uses port 8443 for HTTPS
   - Paths start with `/api/` not `/proxy/network/`
   - Requires Network API key (different from Cloud API key)
   - Uses self-signed SSL certificates

3. **Access patterns:**
   - Local IPs cannot be accessed from Vercel (private network)
   - WAN IPs can be accessed via Vercel proxy
   - Local proxy needed for development with local IPs

### Files Modified
- `/api/unifi-proxy.js` - Removed hardcoded key, added validation
- `/src/components/UnifiTestPage.js` - Fixed paths, port, routing logic

### Security Improvements
- Removed exposed API key from source code
- Now requires users to provide their own Network API keys
- Better error messages guide users to generate proper keys

### Next Steps
1. Deploy changes to Vercel
2. Test with actual UniFi controller
3. Verify mobile access works with WAN IP
4. Document any controller-specific configuration needed

---

*Fixed: November 2024*
*Issue: Network API completely non-functional*
*Solution: Corrected endpoint paths, port, and routing logic*