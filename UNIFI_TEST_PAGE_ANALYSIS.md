# UniFi Test Page and API Implementation - Comprehensive Analysis

## Overview
The application has a dedicated UniFi Test Page (accessible via "UniFi Test" button in the bottom navigation) that provides comprehensive testing, debugging, and exploration of the UniFi API integration. It's a development/testing utility designed to verify API connectivity and explore the data structure.

---

## Part 1: UniFi Test Page Access

### Location in UI
- **Navigation Button**: Bottom navigation bar (fixed at bottom of screen)
- **Button Label**: "UniFi Test"
- **Button Icon**: Activity icon (from lucide-react)
- **Route**: `/unifi-test`
- **File**: `/Users/stepheblansette/Desktop/unicorn/src/components/UnifiTestPage.js`

### Navigation Implementation
**File**: `src/components/BottomNavigation.js`

```javascript
const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Boxes, label: 'Parts', path: '/parts' },
  { icon: Users, label: 'People', path: '/people' },
  { icon: Activity, label: 'UniFi Test', path: '/unifi-test' },  // <- UniFi Test Button
  { icon: QrCode, label: 'Scan Tag', path: '/scan-tag' },
];
```

### App Route Configuration
**File**: `src/App.js` (line 301-305)

```javascript
<Route
  path="/unifi-test"
  element={
    <ProtectedRoute>
      <UnifiTestPage />
    </ProtectedRoute>
  }
/>
```

---

## Part 2: UniFi Test Page Component Structure

### File Location
`src/components/UnifiTestPage.js` (1,189 lines)

### Key State Variables

| State | Type | Purpose |
|-------|------|---------|
| `loading` | boolean | Shows loading indicator during API calls |
| `projects` | array | List of projects with UniFi URLs from Supabase |
| `selectedProject` | object | Currently selected project |
| `manualUrl` | string | URL entered manually by user for testing |
| `useManualUrl` | boolean | Flag to toggle between project and manual URL modes |
| `connectionStatus` | object | Result of connection test (success/error) |
| `sites` | array | List of normalized site/host entries |
| `selectedSite` | string | Currently selected site's hostSiteId |
| `devices` | array | Devices for the selected site |
| `clients` | array | Connected clients (currently empty - endpoint not implemented) |
| `error` | string | Error message display |
| `parsedConsoleId` | string | Console ID parsed from UniFi URL |
| `deviceSource` | object | Metadata about where devices came from (API vs host payload) |

### Main UI Sections

1. **Manual URL Input Section**
   - Text input field for entering UniFi controller URL
   - Examples: `https://api.ui.com` or self-hosted controller IP
   - "Test Connection" button triggers `testConnection()`
   - Displays parsed console ID when URL is entered

2. **Project Selection Section**
   - Loads all projects from Supabase where `unifi_url` is not null
   - Dropdown to select a project
   - Auto-selects first project on load
   - Displays project's UniFi URL and parsed console ID

3. **Connection Status Section**
   - Shows success/failure of connection test
   - Displays detailed error messages
   - "Test Again" button to retest
   - Real-time status indicators (green checkmark for success, red X for failure)

4. **Debug Info Section** (visible when sites are loaded)
   - Displays total site entries returned
   - Shows detailed breakdown of each site:
     - hostId, siteId, hostSiteId, consoleId
     - hostName, siteName, IP address
     - Firmware version, Location
     - Number of controllers in host

5. **Sites Section**
   - Dropdown to select a site
   - Grid of site cards showing:
     - Site label/name
     - Host name
     - Console ID
     - hostSiteId
     - Location
     - IP address
     - Firmware version
   - Click card or use dropdown to load site data

6. **Devices Section**
   - Shows devices for selected site
   - Device source indicator (API, host payload, or error)
   - Device cards displaying:
     - Name/model with online/offline status
     - IP address, MAC address, model
     - Product line, version
     - Site identifiers (siteId, hostSiteId, consoleId)

7. **Clients Section**
   - Currently empty (clients endpoint not yet implemented)
   - Placeholder for future client data display

---

## Part 3: How Site URL is Entered/Pasted

### URL Format Recognition
The page supports two URL formats from UniFi Cloud:

**Format 1: UniFi Cloud Console URL**
```
https://unifi.ui.com/consoles/{CONSOLE_ID}/network/default/dashboard
```

**Format 2: API Base URL**
```
https://api.ui.com
```

### URL Parsing Function

```javascript
const parseUnifiUrl = (url) => {
  if (!url) return null;
  
  try {
    // Extract console ID from URL like:
    // https://unifi.ui.com/consoles/6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638/network/...
    const match = url.match(/\/consoles\/([^\/]+)/);
    if (match && match[1]) {
      console.log('Parsed console ID:', match[1]);
      return match[1];  // e.g., "6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638"
    }
  } catch (err) {
    console.error('Error parsing UniFi URL:', err);
  }
  return null;
};
```

### User Flow for Manual URL Entry

1. User pastes URL in "Enter UniFi Controller URL" input field
2. Console ID is automatically parsed from the URL
3. User clicks "Test Connection" button
4. Flow:
   - Calls `testConnection(controllerUrl)`
   - If successful, calls `loadSites(controllerUrl)`
   - Sites are fetched and normalized
   - First matching site is auto-selected based on parsed console ID
   - Site data is loaded

---

## Part 4: API Calls Currently Being Made

### Service File
`src/services/unifiApi.js` (498 lines)

### Current API Endpoints

#### 1. **fetchSites(controllerUrl)**
- **Endpoint**: `/v1/hosts`
- **Purpose**: Get all UniFi hosts/sites
- **HTTP Method**: GET
- **Parameters**: `controllerUrl` (for parsing, actual API uses proxy)
- **Returns**: Array of host objects
- **Used In**: Initial connection test, site discovery

#### 2. **fetchDevices(hostIds, controllerUrl, options)**
- **Endpoint**: `/v1/devices`
- **Purpose**: Get all devices managed by specified hosts
- **HTTP Method**: GET
- **Parameters**: 
  - `hostIds`: Array of host IDs to filter by
  - `controllerUrl`: For API parity
  - `options`:
    - `fetchAll`: boolean (default true) - fetch all pages
    - `pageSize`: number (default 200) - results per page
    - `nextToken`: string - pagination token
- **Query Parameters**: 
  - `hostIds[]`: Host IDs (can be multiple)
  - `pageSize`: Results per page
  - `nextToken`: For pagination
- **Returns**: Object with:
  - `data`: Array of unique devices
  - `nextToken`: Pagination token
  - `pagesFetched`: Number of pages fetched
  - `hosts`: Host summaries
  - `raw`: Last raw response
- **Pagination**: Automatically fetches all pages when `fetchAll=true`
- **Deduplication**: Uses device keys (host:MAC:id:serial) to avoid duplicates

#### 3. **fetchClients(hostId, controllerUrl)**
- **Endpoint**: Not implemented
- **Status**: Stubbed - returns empty array
- **Note**: Check API docs for correct endpoint
- **Purpose**: Get connected network clients
- **Currently Returns**: `{ data: [] }`

#### 4. **fetchSwitchPorts(siteId, deviceMac, controllerUrl)**
- **Endpoint**: `/v1/devices` (reuses fetchDevices)
- **Purpose**: Get port configuration for specific switch
- **Parameters**: siteId, device MAC address
- **Returns**: Array of port objects from `device.port_table`

#### 5. **testConnection(controllerUrl)**
- **Purpose**: Verify API connectivity
- **Implementation**: Calls fetchSites()
- **Returns**: Object with:
  - `success`: boolean
  - `message`: success message
  - `error`: error message (if failed)

### Proxy Configuration

**File**: `api/unifi-proxy.js`

The application uses a serverless proxy function to keep API key secure:

```javascript
// Base URL configuration
const UNIFI_API_BASE_URL = process.env.UNIFI_CONTROLLER_URL || 'https://api.ui.com';

// Authentication
const apiKey = process.env.UNIFI_API_KEY;
// Sent as header: 'X-API-KEY': apiKey

// Proxy accepts POST requests with:
{
  endpoint: '/v1/hosts' or '/v1/devices?...',
  controllerUrl: string,  // For parsing, not used as API base
  method: 'GET' or 'POST',
  body: {...},           // Optional request body
  headers: {...}         // Optional additional headers
}
```

### Proxy Error Handling

| Status | Response |
|--------|----------|
| 401 | Unauthorized: Invalid API key |
| 403 | Forbidden: No access to this resource |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| Other | Error details with status code |

---

## Part 5: Data Display and Structure

### Sites/Hosts Normalization

The page normalizes raw UniFi API responses into a standard format through `normalizeHostsToSites()`:

**Normalized Site Object**:
```javascript
{
  hostId: string,           // Console/host ID
  hostName: string,         // Display name for host
  siteId: string | null,    // Site identifier
  siteName: string,         // Display name for site
  hostSiteId: string,       // Composite identifier (hostId:siteId or just hostId)
  consoleId: string,        // Console ID derived from hostSiteId
  siteSuffix: string | null,// Suffix from hostSiteId split
  siteLabel: string,        // Display label
  ipAddress: string | null, // IP address
  firmware: string | null,  // Firmware version
  location: string | null,  // Location text
  mac: string | null,       // MAC address
  controllerStatus: string, // Current state
  devices: array,           // Devices from host payload
  controllers: array,       // Controllers information
  rawHost: object,          // Original host data
  rawSite: object | null    // Original site data if nested
}
```

### Device Object Structure (after merge with host metadata)

```javascript
{
  // Original device fields...
  name: string,
  model: string,
  ip: string,
  mac: string,
  status: string,
  state: number,           // 1=online, 0=offline
  version: string,
  productLine: string,
  
  // Added host metadata...
  hostId: string,
  hostSiteId: string,
  consoleId: string,
  siteId: string | null,
  siteName: string | null,
  hostName: string | null,
  hostMetadata: object
}
```

### Device Source Metadata

The page tracks where device data came from:

```javascript
deviceSource = {
  type: 'api' | 'hostPayload' | 'apiNoMatch' | 'hostPayloadNoMatch' | 'empty' | 'error',
  rawCount: number,         // Total devices before filtering
  filteredCount: number,    // Devices after site filtering
  note: string | null,      // Additional context
  message: string | null    // Error message
}
```

---

## Part 6: Implemented vs Stubbed Endpoints

### Fully Implemented

| Endpoint | Function | Status |
|----------|----------|--------|
| `/v1/hosts` | `fetchSites()` | Working with pagination |
| `/v1/devices` | `fetchDevices()` | Working with pagination, filtering, deduplication |
| Connection test | `testConnection()` | Working |

### Partially Implemented

| Endpoint | Function | Status |
|----------|----------|--------|
| `/v1/devices` | `fetchSwitchPorts()` | Works but no dedicated endpoint - filters devices |

### Stubbed/Not Implemented

| Endpoint | Function | Status |
|----------|----------|--------|
| `/v1/clients` | `fetchClients()` | Returns empty array - endpoint path unknown |

---

## Part 7: Data Loading Flow

### Connection Test Flow

```
User clicks "Test Connection" (line 670-677)
  ↓
testConnection(controllerUrl) is called
  ↓
callUnifiProxy({ endpoint: '/v1/hosts', controllerUrl })
  ↓
If success → loadSites(controllerUrl)
If error → Display error message
```

### Site Loading Flow

```
testConnection succeeds
  ↓
loadSites(controllerUrl) is called (line 427-487)
  ↓
callUnifiProxy({ endpoint: '/v1/hosts', controllerUrl })
  ↓
Response data normalized via normalizeHostsToSites()
  ↓
Sites array populated in state
  ↓
Auto-select first matching site (by parsed console ID)
  ↓
Call loadSiteData() for selected site
```

### Device Loading Flow

```
Site is selected (line 609-617 or auto-selected)
  ↓
loadSiteData(siteId, controllerUrl, providedSite) is called (line 489-607)
  ↓
Build array of potential hostIds to filter by
  ↓
callUnifiProxy({ 
  endpoint: '/v1/devices?hostIds[]=id1&hostIds[]=id2&pageSize=200',
  controllerUrl 
})
  ↓
Fetch all pages via nextToken pagination
  ↓
Merge devices with host metadata
  ↓
Filter devices to selected site
  ↓
If filtered count > 0 → Display devices
If API returned devices but none match → Show "apiNoMatch" status
If no API devices → Try host payload fallback
If no devices anywhere → Show "empty" status
```

---

## Part 8: Project Integration

### Loading Projects from Supabase

**Query** (line 341-345):
```javascript
const { data, error: fetchError } = await supabase
  .from('projects')
  .select('id, project_number, unifi_url')
  .not('unifi_url', 'is', null)
  .order('project_number');
```

**Database Requirements**:
- Table: `projects`
- Required columns: `id`, `project_number`, `unifi_url`
- Filter: Only projects where `unifi_url` is not null

### Project Selection Behavior

1. Auto-selects first project on page load
2. Parses console ID from project's `unifi_url`
3. Tests connection using project's URL
4. Loads sites and auto-selects matching site

---

## Part 9: Key Debugging Features

### Console Logging
The component logs detailed information:
- Parsed console ID
- Full API responses
- Number of hosts/devices returned
- Host/site structure info
- Device filtering results
- Source of device data

### Debug Info Section
Displays formatted JSON of all discovered sites with full metadata structure

### Device Source Tracking
Shows exactly where devices came from and counts before/after filtering

### Connection Status
Clear success/failure indicators with detailed error messages

---

## Part 10: Environment Configuration

### Required Environment Variables

```bash
# In .env.local or Vercel dashboard:
REACT_APP_UNIFI_API_KEY=<your_api_key>
REACT_APP_UNIFI_CONTROLLER_URL=https://api.ui.com  # or self-hosted URL

# Optional proxy override:
REACT_APP_UNIFI_PROXY_URL=<absolute_proxy_url>
REACT_APP_UNIFI_PROXY_ORIGIN=<proxy_origin>
```

### Proxy Resolution Logic

1. If `REACT_APP_UNIFI_PROXY_URL` is set → use it (absolute)
2. Else if `REACT_APP_UNIFI_PROXY_ORIGIN` is set → append `/api/unifi-proxy`
3. Else → use default `/api/unifi-proxy` (local Vercel function)

---

## Part 11: Related Components

### UniFi Client Selector
**File**: `src/components/UniFiClientSelector.js`

Used in equipment/wire drop commissioning to:
- Fetch UniFi clients from a specific host
- Assign a network client to equipment
- Track unifi_client_mac, unifi_last_ip, unifi_last_seen
- Mark commission stage as complete

### UniFi Integration Component
**File**: `src/components/UnifiIntegration.js`

Used in project views to:
- Sync sites from UniFi to Supabase
- Sync switches and ports to database
- Test connection
- Display synced data

### UniFi Service
**File**: `src/services/unifiService.js`

Database sync functions:
- `syncSites()` - Save sites to unifi_sites table
- `syncSwitches()` - Save switches to unifi_switches table
- `syncSwitchPorts()` - Save ports to unifi_switch_ports table
- `linkWireDropToPort()` - Map wire drops to switch ports
- `getWireDropsWithNetwork()` - Get wire drops with network info

---

## Part 12: Available Test Scenarios

### Basic Connectivity Test
1. Enter UniFi Cloud console URL
2. Click "Test Connection"
3. Should succeed and show green indicator
4. Console ID should be parsed and displayed

### Project-Based Test
1. Select a project from dropdown
2. Auto-loads connection test
3. Shows project's UniFi URL
4. Displays parsed console ID

### Multi-Site Navigation
1. Load sites successfully
2. See all discovered hosts/sites
3. Click different sites to compare device lists
4. Observe debug info for each site

### Device Data Exploration
1. Load a site with devices
2. Inspect device structure
3. Check device source indicator
4. Examine hostSiteId and siteId matching

### API Response Inspection
1. Open browser DevTools → Console
2. All API responses logged to console
3. Full response structure visible
4. Can inspect API response format directly

---

## Summary: What We Have Access To

### Full API Access
- ✅ `/v1/hosts` - All hosts/sites
- ✅ `/v1/devices` - All devices with pagination
- ✅ Pagination via nextToken
- ✅ Filtering by hostIds

### Partial Access
- ⚠️ `/v1/devices` port_table - Switch port data (via device filtering)

### Not Yet Implemented
- ❌ `/v1/clients` - Connected clients endpoint (path unknown)
- ❌ Dedicated clients endpoint

### Data Available
- ✅ Host information (ID, name, IP, firmware, location)
- ✅ Device information (name, model, MAC, IP, state, type)
- ✅ Switch/device metadata
- ✅ Port configuration (if device has port_table)
- ⚠️ Client information (partially available through custom fields in device data)

### Testing Capabilities
- ✅ Manual URL testing
- ✅ Project-based testing
- ✅ Multi-site exploration
- ✅ Device data inspection
- ✅ Real-time error handling
- ✅ Response structure logging
- ✅ Pagination testing
