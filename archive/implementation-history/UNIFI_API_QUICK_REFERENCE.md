# UniFi API Quick Reference - Testing & Implementation Guide

## Quick Links

| Purpose | File | Location |
|---------|------|----------|
| Test Page UI | `UnifiTestPage.js` | `src/components/` |
| API Service | `unifiApi.js` | `src/services/` |
| Proxy Handler | `unifi-proxy.js` | `api/` |
| Navigation | `BottomNavigation.js` | `src/components/` |
| Full Analysis | `UNIFI_TEST_PAGE_ANALYSIS.md` | Root |

---

## How to Access the Test Page

### In the App
1. Navigate to the application home page
2. Look at the bottom navigation bar
3. Click the "UniFi Test" button (Activity icon)
4. You'll be taken to `/unifi-test` route

### Via Direct URL
```
http://localhost:3000/unifi-test
```

---

## How to Test the API

### Method 1: Manual URL Testing

1. Go to UniFi Test Page
2. In the "Test with Manual URL" section, enter a URL:
   - For UniFi Cloud: Paste a full console URL like `https://unifi.ui.com/consoles/{CONSOLE_ID}/network/default/dashboard`
   - For API base: Just use `https://api.ui.com`
3. Click "Test Connection"
4. If successful, sites will be discovered automatically
5. Select a site to see its devices

### Method 2: Project-Based Testing

1. Go to UniFi Test Page
2. In the "Or Select From Projects" section
3. Select a project from the dropdown (must have `unifi_url` field set in database)
4. Connection test and site loading happen automatically
5. Select a site to explore its devices

---

## API Endpoints Overview

### GET /v1/hosts
**Purpose**: Retrieve all UniFi hosts/sites
**Called By**: `fetchSites(controllerUrl)`
**Response**: Array of host objects with site information
**Pagination**: No pagination needed

```javascript
import { fetchSites } from '../services/unifiApi';

const result = await fetchSites('https://unifi.ui.com/consoles/...');
// result.data = [{ id, hostName, sites, devices, ... }, ...]
```

### GET /v1/devices
**Purpose**: Retrieve all devices filtered by hostIds
**Called By**: `fetchDevices(hostIds, controllerUrl, options)`
**Query Parameters**:
- `hostIds[]` - Host ID filter (can be multiple)
- `pageSize` - Results per page (default 200)
- `nextToken` - Pagination token (auto-handled)

**Pagination**: Automatic nextToken handling
**Deduplication**: Built-in (uses device MACs, IDs, serials)

```javascript
import { fetchDevices } from '../services/unifiApi';

// Fetch all devices for specific hosts
const result = await fetchDevices(
  ['hostId1', 'hostId2'],  // Host IDs to filter
  'https://unifi.ui.com/consoles/...',
  {
    fetchAll: true,        // Fetch all pages automatically
    pageSize: 200          // Items per page
  }
);

// result = {
//   data: [...all unique devices...],
//   pagesFetched: 1,
//   nextToken: null,
//   hosts: [...host summaries...],
//   raw: {...last response...}
// }
```

### GET /v1/devices (Port Query)
**Purpose**: Get switch port configuration
**Called By**: `fetchSwitchPorts(siteId, deviceMac, controllerUrl)`
**Implementation**: Filters devices by MAC and returns `port_table`

```javascript
import { fetchSwitchPorts } from '../services/unifiApi';

const ports = await fetchSwitchPorts(
  'siteId',
  'aa:bb:cc:dd:ee:ff',  // Device MAC
  'https://unifi.ui.com/...'
);
// ports = [{ port_idx, name, vlan, poe_mode, ... }, ...]
```

### (Not Implemented) /v1/clients
**Purpose**: Retrieve connected network clients
**Status**: Stubbed - returns empty array
**TODO**: Find correct endpoint path in UniFi API docs

```javascript
import { fetchClients } from '../services/unifiApi';

const clients = await fetchClients('hostId', 'controllerUrl');
// Currently returns: { data: [] }
```

---

## Data Structure Examples

### Host/Site Object (from /v1/hosts)
```javascript
{
  id: "host-uuid",
  hostName: "My Network",
  uidb: "host-uuid:site-uuid",  // Composite ID
  sites: [
    {
      name: "Office Building",
      description: "Main site",
      id: "site-uuid"
    }
  ],
  devices: [...device array...],
  reportedState: {
    hostname: "network-console",
    ip: "192.168.1.1",
    version: "3.1.2",
    controllers: [...controller array...]
  }
}
```

### Device Object (from /v1/devices)
```javascript
{
  id: "device-uuid",
  name: "Access Point 1",
  model: "U6-LR",
  mac: "aa:bb:cc:dd:ee:ff",
  ip: "192.168.1.100",
  state: 1,           // 1=online, 0=offline
  version: "3.1.2",
  productLine: "Unifi",
  type: "uap",        // Access Point
  port_table: [       // For switches
    {
      port_idx: 1,
      name: "Port 1",
      vlan: 10,
      poe_mode: "auto"
    }
  ]
}
```

### Normalized Site Object (UniFi Test Page)
```javascript
{
  hostId: "host-uuid",
  hostName: "My Network",
  siteId: "site-uuid",
  siteName: "Office Building",
  hostSiteId: "host-uuid:site-uuid",
  consoleId: "host-uuid",
  ipAddress: "192.168.1.1",
  firmware: "3.1.2",
  location: "Downtown",
  devices: [...raw devices from host...]
}
```

---

## Testing Checklist

### Connection Verification
- [ ] Can I enter a UniFi console URL?
- [ ] Does it parse the console ID correctly?
- [ ] Does "Test Connection" show green success?
- [ ] Can I see sites in the dropdown?

### Site Navigation
- [ ] Are multiple sites listed?
- [ ] Can I click different sites?
- [ ] Does the Debug Info section show site details?
- [ ] Are hostSiteId values unique?

### Device Discovery
- [ ] Are devices loaded for the selected site?
- [ ] Can I see device names, MACs, IPs?
- [ ] Does the device source show "api" or "hostPayload"?
- [ ] Are online/offline statuses correct?

### Data Validation
- [ ] Can I see device models and firmware?
- [ ] Are switch devices showing port_table data?
- [ ] Are device identifiers (consoleId, hostSiteId) populated?
- [ ] Are location and IP address fields displayed?

### Error Handling
- [ ] Does invalid URL show clear error?
- [ ] Is API key missing handled gracefully?
- [ ] Are rate limit errors displayed?
- [ ] Can I retry after errors?

---

## Common Issues & Solutions

### Issue: Connection test shows "404 Not Found"
**Likely Cause**: Proxy function not running  
**Solution**:
1. Make sure `vercel dev` is running
2. Check that `/api/unifi-proxy.js` exists
3. Verify `UNIFI_API_KEY` environment variable is set

### Issue: "Unauthorized: Invalid API key"
**Likely Cause**: Wrong or expired API key  
**Solution**:
1. Log into UniFi Cloud Console (https://unifi.ui.com)
2. Go to API Credentials
3. Get/regenerate your API key
4. Update `.env.local` with new key
5. Restart development server

### Issue: Sites load but no devices shown
**Likely Causes**:
- Selected site has no devices
- Device filtering is too strict
- API response structure changed

**Debugging Steps**:
1. Open DevTools Console (F12)
2. Look for "[unifiApi]" log messages
3. Check "Device Source" indicator
4. Review Debug Info section for site details
5. Check raw API response in console

### Issue: "No sites found" even though connection succeeded
**Likely Cause**: API response structure different than expected  
**Solution**:
1. Check browser console for full API response
2. Verify response has `data` or `hosts` array
3. Check if sites are nested differently
4. May need to update `normalizeHostsToSites()` function

---

## Development Tips

### Inspecting API Responses
1. Open Browser DevTools (F12)
2. Go to Console tab
3. Look for logs starting with `[unifiApi]` or `Calling UniFi API`
4. Full responses are logged as JSON
5. Copy and paste into code editor to examine structure

### Debugging Site/Device Matching
1. Check the "Debug Info" section on test page
2. Look for hostSiteId values
3. Verify they match between sites and devices
4. Check if siteId and siteSuffix are set correctly

### Testing Pagination
1. Create a test scenario with 200+ devices
2. Watch browser console for multiple page fetches
3. Verify `pagesFetched` counter in response
4. Check that `nextToken` is properly handled

### Testing Device Filtering
1. Load a site with multiple hosts
2. Watch which hostIds are used in filter
3. Check `rawCount` vs `filteredCount` in device source
4. Verify all devices are accounted for

---

## Next Steps: Implementing Missing Features

### TODO: Implement Clients Endpoint

1. Research correct `/v1/clients` endpoint path in UniFi API docs
2. Understand query parameters (filters, pagination)
3. Update `fetchClients()` in `unifiApi.js`:
   ```javascript
   export const fetchClients = async (hostId, controllerUrl) => {
     try {
       const response = await callUnifiProxy({
         endpoint: '/v1/clients', // <- Find correct path
         controllerUrl
       });
       return response;
     } catch (error) {
       console.error('Error fetching clients:', error);
       throw error;
     }
   };
   ```
4. Update `UnifiTestPage.js` to display clients
5. Test in test page with real client data

### TODO: Add More API Endpoints

Candidates for implementation:
- `/v1/alarms` - Network alarms/alerts
- `/v1/events` - Historical events
- `/v1/statistics` - Device/network statistics
- `/v1/users` - Network user profiles
- `/v1/networks` - Network/VLAN configurations
- `/v1/routing` - Routing configurations

---

## Performance Considerations

### Pagination Strategy
- Automatic pagination with `fetchAll: true`
- Default page size: 200 items
- Handles nextToken automatically
- Consider reducing pageSize for large datasets

### Deduplication
- Uses composite keys: `host::mac::id::serial`
- Prevents duplicate devices in results
- Handles devices in nested structures

### Caching
- Currently no caching implemented
- Consider adding caching for frequently accessed data
- Implement in `unifiApi.js` or component level

---

## File Reference Map

```
src/
├── components/
│   ├── UnifiTestPage.js          <- Main test page (1189 lines)
│   ├── UnifiIntegration.js       <- Project-level integration
│   ├── UniFiClientSelector.js    <- Equipment commissioning
│   └── BottomNavigation.js       <- Navigation to test page
├── services/
│   ├── unifiApi.js              <- All API calls (498 lines)
│   └── unifiService.js          <- Database sync
└── App.js                        <- Route definition

api/
└── unifi-proxy.js               <- Secure proxy handler

docs/
└── UNIFI_INTEGRATION_GUIDE.md   <- Setup instructions
```

---

## Key Functions Reference

| Function | File | Purpose |
|----------|------|---------|
| `fetchSites()` | unifiApi.js:281 | Get all hosts |
| `fetchDevices()` | unifiApi.js:301 | Get devices by hostIds |
| `fetchClients()` | unifiApi.js:428 | Get clients (not implemented) |
| `fetchSwitchPorts()` | unifiApi.js:447 | Get switch ports |
| `testConnection()` | unifiApi.js:475 | Verify connectivity |
| `parseUnifiUrl()` | UnifiTestPage.js:315 | Extract console ID |
| `normalizeHostsToSites()` | UnifiTestPage.js:102 | Standardize site data |
| `loadSites()` | UnifiTestPage.js:427 | Fetch and display sites |
| `loadSiteData()` | UnifiTestPage.js:489 | Fetch and display devices |

