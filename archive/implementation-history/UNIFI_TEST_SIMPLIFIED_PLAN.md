# UniFi Test Page Simplification Plan

## Current Status

I've made the following changes:
1. ✅ Added API key input field to the UniFi Test page
2. ✅ Updated the proxy to accept API key from `x-unifi-api-key` header for local testing
3. ✅ Changed "Test Connection" button to "Connect to UniFi" and require API key
4. ✅ Simplified the UI to show "UniFi API Configuration" section first

## What Still Needs to Be Done

### 1. Pass API Key to All API Calls

Update these functions to include the API key in headers:
- `testClientEndpoints()` - needs apiKey parameter
- `fetchSites()` - needs apiKey parameter
- `fetchDevices()` - needs apiKey parameter
- All other unifiApi functions

**In `src/services/unifiApi.js`:**
```javascript
// Example for fetchSites
export const fetchSites = async (controllerUrl, apiKey) => {
  const response = await fetch(`${resolveProxyUrl()}/v1/hosts`, {
    headers: {
      'x-unifi-api-key': apiKey,  // ADD THIS
      'Accept': 'application/json'
    }
  });
  // ... rest of code
};
```

### 2. Update Component to Pass API Key

**In `UnifiTestPage.js`:**
```javascript
// Update handleClientEndpointTest (line ~667)
const results = await unifiApi.testClientEndpoints(selectedSite, url, apiKey);

// Update testConnection (line ~432)
const result = await unifiApi.testConnection(controllerUrl, apiKey);

// Update loadSites (line ~450)
const response = await unifiApi.fetchSites(controllerUrl, apiKey);

// Update loadSiteData (line ~519)
const devicesResult = await unifiApi.fetchDevices(hostIdsForRequest, url, {
  fetchAll: true,
  pageSize: 200,
  apiKey: apiKey  // ADD THIS
});
```

### 3. Hide Project Dropdown (Simplify)

Since you want to test locally without projects, hide the project selection:
```javascript
// Around line ~784, change:
{/* Project Selection */}
{false && projects.length > 0 && (  // ADD false && to hide

// OR completely remove the entire Project Selection section
```

### 4. Auto-Select First Site

The code already auto-selects the first site in `loadSites()` around line 497-500.

### 5. Test with Your API Key

1. Go to http://localhost:3000/unifi-test
2. Enter your UniFi API key (get from Network > Control Plane > Integrations)
3. Leave URL as https://api.ui.com
4. Click "Connect to UniFi"
5. Should auto-select first site and show devices

## Expected Flow

1. User enters API key
2. User clicks "Connect to UniFi"
3. Page fetches sites (should get 1-2 sites typically)
4. Auto-selects first site
5. Loads devices for that site
6. Auto-runs client endpoint discovery
7. Shows results

## UniFi API Endpoints Being Used

Based on the official API documentation:

**Sites:**
- `GET /v1/hosts` - Returns list of sites/controllers
- `GET /v1/sites` - Alternative sites endpoint

**Devices (UniFi Hardware):**
- `GET /v1/devices` - Gets switches, APs, gateways
- Can filter by `hostIds` parameter

**Clients (Connected Devices):**
- `GET /v1/sites/{siteId}/clients` - Gets clients on a site
- Can filter with query parameters

## To Complete the Implementation

1. Add `apiKey` parameter to all unifiApi functions
2. Pass `apiKey` from component state to all API calls
3. Test with real UniFi API key
4. Once working, hide/remove project dropdown
5. Focus on showing one site at a time with devices and clients clearly separated

## Devices vs Clients

**Devices** = UniFi hardware (switches, APs, gateways, cameras)
- Shows in "Devices" section
- Has model, MAC, IP, firmware, etc.

**Clients** = Devices connected to the network
- Shows in "Clients" or "Client Endpoint Discovery" section
- Has hostname, MAC, IP, which device/port they're connected to
- This is what you need for wire drop commissioning

Make sure to display these separately with clear labels!