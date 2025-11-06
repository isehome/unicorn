# UniFi API - Code Examples & Implementation Details

## Core API Service Implementation

### File: `src/services/unifiApi.js`

#### 1. Connection Test

```javascript
export const testConnection = async (controllerUrl) => {
  try {
    await fetchSites(controllerUrl);
    return { 
      success: true, 
      message: 'Successfully connected to UniFi API' 
    };
  } catch (error) {
    console.error('UniFi connection test failed:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};
```

#### 2. Fetch Sites/Hosts

```javascript
export const fetchSites = async (controllerUrl) => {
  try {
    return await callUnifiProxy({ 
      endpoint: '/v1/hosts',
      controllerUrl
    });
  } catch (error) {
    console.error('Error fetching UniFi hosts:', error);
    throw error;
  }
};
```

#### 3. Fetch Devices (with pagination)

```javascript
export const fetchDevices = async (hostIds, controllerUrl = null, options = {}) => {
  try {
    const ids = hostIds
      ? (Array.isArray(hostIds) ? hostIds.filter(Boolean) : [hostIds])
      : [];

    const sanitizedIds = ids
      .map((id) => (typeof id === 'string' ? id.trim() : id))
      .filter(Boolean);

    const fetchAll = options.fetchAll !== false;
    const pageSize = options.pageSize ? Number(options.pageSize) : 200;
    const startNextToken = options.nextToken || null;

    const uniqueDevices = [];
    const seenDeviceKeys = new Set();
    const hostSummaries = [];
    const seenHosts = new Set();

    let nextToken = startNextToken;
    let page = 0;
    let lastResponse = null;

    do {
      page += 1;
      const searchParams = new URLSearchParams();

      sanitizedIds.forEach((id) => {
        if (!id) return;
        searchParams.append('hostIds[]', id);
      });

      if (pageSize) searchParams.set('pageSize', String(pageSize));
      if (options.time) searchParams.set('time', options.time);
      if (nextToken) searchParams.set('nextToken', nextToken);

      const queryString = searchParams.toString();
      const endpoint = queryString ? `/v1/devices?${queryString}` : '/v1/devices';

      console.log('[unifiApi] Fetching devices page', page, 'endpoint:', endpoint);

      const response = await callUnifiProxy({
        endpoint,
        controllerUrl
      });

      lastResponse = response;

      const pageEntries =
        response?.data ||
        response?.devices ||
        response?.items ||
        [];

      console.log('[unifiApi] Devices page', page, 'count:', pageEntries.length);

      // Process devices and hosts...
      pageEntries.forEach((entry, entryIndex) => {
        const hostMetadata = extractHostMetadata(entry, entryIndex);

        if (Array.isArray(entry?.devices)) {
          entry.devices.forEach((device) => {
            const mergedDevice = mergeDeviceWithHost(device, hostMetadata);
            const key = buildDeviceKey(mergedDevice);
            if (!seenDeviceKeys.has(key)) {
              seenDeviceKeys.add(key);
              uniqueDevices.push(mergedDevice);
            }
          });
          return;
        }

        if (entry && typeof entry === 'object') {
          const mergedDevice = mergeDeviceWithHost(entry, hostMetadata);
          const key = buildDeviceKey(mergedDevice);
          if (!seenDeviceKeys.has(key)) {
            seenDeviceKeys.add(key);
            uniqueDevices.push(mergedDevice);
          }
        }
      });

      nextToken = response?.nextToken || null;

      if (!fetchAll) break;
      if (!nextToken) break;
    } while (true);

    return {
      data: uniqueDevices,
      nextToken,
      pagesFetched: page,
      hosts: hostSummaries,
      raw: lastResponse
    };
  } catch (error) {
    console.error('Error fetching UniFi devices:', error);
    throw error;
  }
};
```

#### 4. Proxy Call Handler

```javascript
const callUnifiProxy = async (payload = {}) => {
  const proxyUrl = resolveProxyUrl();
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let data;
  
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (parseError) {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const message = data?.error || data?.message || rawText || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;

    if (response.status === 404 && proxyUrl === PROXY_ENDPOINT) {
      error.suggestedFix = 'The UniFi proxy function is not running locally...';
    }

    throw error;
  }

  return data;
};
```

---

## Proxy Handler Implementation

### File: `api/unifi-proxy.js`

```javascript
const UNIFI_API_BASE_URL = process.env.UNIFI_CONTROLLER_URL || 'https://api.ui.com';

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.UNIFI_API_KEY;
  
  if (!apiKey) {
    console.error('UNIFI_API_KEY not configured');
    return res.status(500).json({ 
      error: 'API key not configured',
      debug: 'UNIFI_API_KEY environment variable is missing'
    });
  }

  const { endpoint, method = 'GET', body: upstreamBody } = req.body;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  const baseUrl = UNIFI_API_BASE_URL;

  try {
    let url = `${baseUrl}${endpoint}`;
    
    console.log('Calling UniFi API:', url, 'method:', method);

    const fetchOptions = {
      method: method?.toUpperCase() || 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    if (fetchOptions.method === 'GET') {
      delete fetchOptions.headers['Content-Type'];
    } else if (upstreamBody !== undefined && upstreamBody !== null) {
      fetchOptions.body = typeof upstreamBody === 'string'
        ? upstreamBody
        : JSON.stringify(upstreamBody);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UniFi API error:', response.status, errorText);
      
      switch (response.status) {
        case 401:
          return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
        case 403:
          return res.status(403).json({ error: 'Forbidden: No access to this resource' });
        case 404:
          return res.status(404).json({ error: 'Resource not found' });
        case 429:
          return res.status(429).json({ error: 'Rate limit exceeded' });
        default:
          return res.status(response.status).json({
            error: `API Error: ${response.statusText}`,
            details: errorText
          });
      }
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching from UniFi API:', error);
    return res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message
    });
  }
}
```

---

## Test Page Implementation

### File: `src/components/UnifiTestPage.js`

#### 1. URL Parsing

```javascript
const parseUnifiUrl = (url) => {
  if (!url) return null;
  
  try {
    // Extract console ID from URL like:
    // https://unifi.ui.com/consoles/6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638/network/default/dashboard
    const match = url.match(/\/consoles\/([^\/]+)/);
    if (match && match[1]) {
      console.log('Parsed console ID:', match[1]);
      return match[1];
    }
  } catch (err) {
    console.error('Error parsing UniFi URL:', err);
  }
  return null;
};
```

#### 2. Connection Test

```javascript
const testConnection = async (controllerUrl) => {
  if (!controllerUrl) {
    setError('No UniFi URL configured for this project');
    setConnectionStatus({ success: false, error: 'No UniFi URL configured' });
    return;
  }

  try {
    setLoading(true);
    setError(null);
    
    const result = await unifiApi.testConnection(controllerUrl);
    setConnectionStatus(result);
    
    if (result.success) {
      await loadSites(controllerUrl);
    }
  } catch (err) {
    console.error('Connection test failed:', err);
    setError(err.message);
    setConnectionStatus({ success: false, error: err.message });
  } finally {
    setLoading(false);
  }
};
```

#### 3. Load Sites

```javascript
const loadSites = async (controllerUrl) => {
  try {
    setLoading(true);
    setError(null);
    
    console.log('Loading sites from:', controllerUrl);
    const response = await unifiApi.fetchSites(controllerUrl);
    console.log('Full API Response:', JSON.stringify(response, null, 2));
    
    const rawSites = response.data || response;
    const sitesArray = Array.isArray(rawSites) ? rawSites : [];

    console.log('Number of hosts returned:', sitesArray.length);

    if (sitesArray.length > 0) {
      console.log('First host structure:', sitesArray[0]);
    }

    const normalizedSites = normalizeHostsToSites(sitesArray);
    console.log('Normalized site entries:', normalizedSites);

    setSites(normalizedSites);

    if (normalizedSites.length > 0) {
      let defaultSite = normalizedSites[0];

      if (parsedConsoleId) {
        console.log('Looking for host with console ID:', parsedConsoleId);
        const matchingSite = normalizedSites.find((site) => {
          if (!site) return false;
          if (site.consoleId === parsedConsoleId) return true;
          if (site.hostId === parsedConsoleId) return true;
          if (site.hostSiteId?.startsWith(`${parsedConsoleId}:`)) return true;
          return false;
        });

        if (matchingSite) {
          console.log('Found matching site for console ID:', matchingSite);
          defaultSite = matchingSite;
        }
      }

      if (defaultSite) {
        setSelectedSite(defaultSite.hostSiteId);
        await loadSiteData(defaultSite.hostSiteId, controllerUrl, defaultSite);
      }
    }
  } catch (err) {
    console.error('Failed to load sites:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

#### 4. Load Site Data (Devices)

```javascript
const loadSiteData = async (siteId, controllerUrl, providedSite) => {
  const url = controllerUrl || (useManualUrl ? manualUrl : selectedProject?.unifi_url);
  if (!url) return;

  const siteEntry = providedSite || sites.find(site => site.hostSiteId === siteId || site.hostId === siteId);

  const requestHostId = siteEntry?.hostSiteId || siteId;
  const hostIdsForRequest = Array.from(
    new Set(
      [
        siteEntry?.hostSiteId,
        siteEntry?.consoleId,
        siteEntry?.hostId,
        requestHostId
      ].filter(Boolean)
    )
  );

  try {
    setLoading(true);
    setError(null);
    setDeviceSource(null);
    
    console.log('Loading devices for hostId:', requestHostId);
    
    // Call the /v1/devices endpoint with hostIds filter
    const devicesResult = await unifiApi.fetchDevices(hostIdsForRequest, url, {
      fetchAll: true,
      pageSize: 200
    });
    
    console.log('Devices response summary:', {
      pagesFetched: devicesResult?.pagesFetched,
      total: devicesResult?.data?.length,
      nextToken: devicesResult?.nextToken
    });
    
    const devicesData = devicesResult?.data || [];
    const apiDevices = Array.isArray(devicesData) ? devicesData : [];
    const filteredApiDevices = filterDevicesForSite(apiDevices, siteEntry);

    if (filteredApiDevices.length > 0) {
      console.log('Found devices from API:', apiDevices.length, 'Filtered devices:', filteredApiDevices.length);
      setDevices(filteredApiDevices);
      setDeviceSource({
        type: 'api',
        rawCount: apiDevices.length,
        filteredCount: filteredApiDevices.length
      });
    } else {
      setDevices([]);
      setDeviceSource({
        type: 'apiNoMatch',
        rawCount: apiDevices.length,
        filteredCount: 0
      });
    }
    
    setClients([]);
  } catch (err) {
    console.error('Failed to load site data:', err);
    setError(err.message);
    setDeviceSource({
      type: 'error',
      message: err.message
    });
  } finally {
    setLoading(false);
  }
};
```

#### 5. Normalize Hosts to Sites

```javascript
const normalizeHostsToSites = (hosts = []) => {
  const normalized = [];
  const seen = new Set();

  hosts.forEach((host) => {
    const hostUidb = parseUidb(
      host?.uidb ||
      host?.reportedState?.uidb ||
      host?.reportedState?.controller_uuid ||
      host?.id
    );

    const baseHostId = host?.hostId || host?.id || hostUidb.hostId || host?.controllerId || null;
    const fallbackHostName = getHostDisplayName(host);

    // Handle different site collection structures
    const siteCollections = [
      Array.isArray(host?.sites) ? host.sites : [],
      Array.isArray(host?.hostSites) ? host.hostSites : [],
      Array.isArray(host?.reportedState?.sites) ? host.reportedState.sites : []
    ].find((collection) => collection.length > 0);

    if (siteCollections && siteCollections.length > 0) {
      // Sites are nested - process each one
      siteCollections.forEach((site) => {
        const siteUidb = parseUidb(site?.uidb);
        const siteId = site?.siteId || site?.id || siteUidb.siteId || null;
        
        normalized.push({
          hostId: baseHostId,
          hostName: fallbackHostName,
          siteId: siteId,
          siteName: site?.name || site?.displayName || fallbackHostName,
          hostSiteId: siteUidb.hostSiteId || `${baseHostId}:${siteId}`,
          consoleId: baseHostId,
          ipAddress: host?.reportedState?.ip || null,
          firmware: host?.reportedState?.version || null,
          devices: host.devices || []
        });
      });
    } else {
      // No sites nested - create single entry
      normalized.push({
        hostId: baseHostId,
        hostName: fallbackHostName,
        siteId: null,
        siteName: fallbackHostName,
        hostSiteId: baseHostId,
        consoleId: baseHostId,
        ipAddress: host?.reportedState?.ip || null,
        firmware: host?.reportedState?.version || null,
        devices: host.devices || []
      });
    }
  });

  return normalized;
};
```

---

## Using in Components

### Example: Wire Drop Equipment Assignment

```javascript
// src/components/UniFiClientSelector.js

const handleFetchClients = async () => {
  try {
    setLoading(true);
    setError('');

    // Parse site ID from URL
    const match = unifiUrl.match(/\/consoles\/([^\/]+)/);
    const consoleId = match ? match[1] : null;

    if (!consoleId) {
      throw new Error('Could not parse console ID from UniFi URL');
    }

    // Fetch sites/hosts
    const sitesData = await unifiApi.fetchSites(unifiUrl);
    const hostId = sitesData.data[0]?.id;

    if (!hostId) {
      throw new Error('No UniFi host found');
    }

    // Fetch clients
    const clientsData = await unifiApi.fetchClients(hostId, unifiUrl);
    setClients(clientsData.data || []);

  } catch (err) {
    console.error('Failed to fetch UniFi clients:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

---

## Data Transformation Helpers

### Parse UIDB (Host/Site Identifier)

```javascript
const parseUidb = (uidb) => {
  if (!uidb) return {};
  if (typeof uidb === 'object') {
    const stringValue = uidb.id || uidb.guid || uidb.value || null;
    if (!stringValue) return {};
    return parseUidb(stringValue);
  }
  if (typeof uidb !== 'string') return {};

  const parts = uidb.split(':').filter(Boolean);
  if (parts.length === 0) return {};

  return {
    hostId: parts[0] || null,
    siteId: parts[1] || null,
    hostSiteId: parts[0] && parts[1] ? `${parts[0]}:${parts[1]}` : parts[0] || null
  };
};
```

### Build Device Key (for deduplication)

```javascript
const buildDeviceKey = (device) => {
  if (!device || typeof device !== 'object') return JSON.stringify(device);

  const mac = normalizeMac(device.mac);
  const id = cleanString(device.id);
  const serial = cleanString(device.serial || device.serialNumber);
  const host = cleanString(device.hostSiteId) || cleanString(device.hostId);

  const parts = [host, mac, id, serial].filter(Boolean);
  if (parts.length === 0) {
    return JSON.stringify(device);
  }
  return parts.join('::');
};
```

### Normalize MAC Address

```javascript
const normalizeMac = (value) => {
  const str = cleanString(value);
  if (!str) return null;
  return str.replace(/[^a-f0-9]/gi, '').toLowerCase();
};
```

---

## Environment Setup

### Development (.env.local)

```bash
# UniFi API Configuration
REACT_APP_UNIFI_API_KEY=your_api_key_from_unifi_cloud
REACT_APP_UNIFI_CONTROLLER_URL=https://api.ui.com

# Optional: For custom proxy location
# REACT_APP_UNIFI_PROXY_URL=https://your-deployed-url.vercel.app/api/unifi-proxy
```

### Vercel Deployment

1. Go to Vercel Project Settings
2. Navigate to Environment Variables
3. Add:
   - `UNIFI_API_KEY` = your API key
   - `UNIFI_CONTROLLER_URL` = https://api.ui.com (or self-hosted)

