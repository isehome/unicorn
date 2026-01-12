/**
 * UniFi Network API Service
 * Provides methods to interact with UniFi Controller for network infrastructure
 */

const PROXY_ENDPOINT = '/api/unifi-proxy';

const resolveProxyUrl = () => {
  const absoluteOverride = cleanString(process.env.REACT_APP_UNIFI_PROXY_URL);
  if (absoluteOverride) return absoluteOverride;

  const originOverride = cleanString(process.env.REACT_APP_UNIFI_PROXY_ORIGIN);
  if (originOverride) {
    const trimmedOrigin = originOverride.endsWith('/')
      ? originOverride.slice(0, -1)
      : originOverride;
    return `${trimmedOrigin}${PROXY_ENDPOINT}`;
  }

  return PROXY_ENDPOINT;
};

const cleanString = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

const firstNonEmpty = (...values) => values.map(cleanString).find(Boolean) || null;

const normalizeMac = (value) => {
  const str = cleanString(value);
  if (!str) return null;
  return str.replace(/[^a-f0-9]/gi, '').toLowerCase();
};

const parseUidb = (uidb) => {
  if (!uidb) return {};

  if (typeof uidb === 'object') {
    const candidate = uidb.id || uidb.guid || uidb.value || null;
    if (!candidate) return {};
    return parseUidb(candidate);
  }

  if (typeof uidb !== 'string') return {};

  const parts = uidb.split(':').filter(Boolean);
  if (parts.length === 0) return {};

  const hostId = parts[0] || null;
  const siteId = parts[1] || null;

  return {
    hostId,
    siteId,
    hostSiteId: hostId && siteId ? `${hostId}:${siteId}` : hostId
  };
};

const deriveConsoleId = (hostSiteId) => {
  const value = cleanString(hostSiteId);
  if (!value) return null;
  const [consoleId] = value.split(':');
  return cleanString(consoleId);
};

const extractHostMetadata = (entry, index = null) => {
  if (!entry || typeof entry !== 'object') return null;

  const uidbInfo = parseUidb(entry.uidb);

  const candidateHostId = firstNonEmpty(
    entry.hostId,
    entry.id,
    entry.consoleId,
    entry.controllerId,
    entry.controller_id,
    uidbInfo.hostId
  );

  let candidateSiteId = firstNonEmpty(
    entry.siteId,
    entry.site_id,
    entry.site?.id,
    entry.site?.siteId,
    uidbInfo.siteId
  );

  let candidateHostSiteId = firstNonEmpty(
    entry.hostSiteId,
    entry.host_site_id,
    uidbInfo.hostSiteId,
    entry.hostId,
    entry.id
  );

  if (!candidateHostSiteId) {
    if (candidateHostId && candidateSiteId) {
      candidateHostSiteId = `${candidateHostId}:${candidateSiteId}`;
    } else if (candidateHostId) {
      candidateHostSiteId = candidateHostId;
    }
  }

  if (!candidateSiteId && candidateHostSiteId?.includes(':')) {
    candidateSiteId = candidateHostSiteId.split(':')[1];
  }

  const consoleId = firstNonEmpty(
    entry.consoleId,
    entry.console_id,
    deriveConsoleId(candidateHostSiteId),
    deriveConsoleId(candidateHostId),
    uidbInfo.hostId
  );

  const fallbackName = index !== null ? `Host ${index + 1}` : null;
  const hostName = firstNonEmpty(
    entry.hostName,
    entry.name,
    entry.hostname,
    entry.siteName,
    entry.site?.name,
    entry.site?.displayName,
    fallbackName,
    candidateHostSiteId,
    candidateHostId,
    consoleId
  );

  const siteName = firstNonEmpty(
    entry.siteName,
    entry.site?.name,
    entry.site?.displayName,
    hostName
  );

  return {
    hostId: candidateHostId || candidateHostSiteId || null,
    hostSiteId: candidateHostSiteId || candidateHostId || null,
    hostName,
    consoleId,
    siteId: candidateSiteId || null,
    siteName,
    rawHost: entry
  };
};

const mergeDeviceWithHost = (device, hostMetadata = {}) => {
  const deviceObject = device && typeof device === 'object' ? { ...device } : { raw: device };

  const uidbInfo = parseUidb(deviceObject.uidb);

  const resolvedHostId = firstNonEmpty(
    deviceObject.hostId,
    deviceObject.host_id,
    hostMetadata.hostId,
    hostMetadata.hostSiteId,
    uidbInfo.hostId
  );

  const resolvedHostSiteId = firstNonEmpty(
    deviceObject.hostSiteId,
    deviceObject.host_site_id,
    hostMetadata.hostSiteId,
    uidbInfo.hostSiteId,
    resolvedHostId
  );

  const resolvedConsoleId = firstNonEmpty(
    deviceObject.consoleId,
    deviceObject.console_id,
    hostMetadata.consoleId,
    deriveConsoleId(resolvedHostSiteId),
    deriveConsoleId(resolvedHostId)
  );

  const resolvedSiteId = firstNonEmpty(
    deviceObject.siteId,
    deviceObject.site_id,
    uidbInfo.siteId,
    hostMetadata.siteId,
    resolvedHostSiteId?.includes(':') ? resolvedHostSiteId.split(':')[1] : null
  );

  const resolvedSiteName = firstNonEmpty(
    deviceObject.siteName,
    deviceObject.site_name,
    deviceObject.site?.name,
    hostMetadata.siteName,
    resolvedSiteId
  );

  const resolvedHostName = firstNonEmpty(
    deviceObject.hostName,
    deviceObject.host_name,
    hostMetadata.hostName
  );

  const enrichedDevice = {
    ...deviceObject,
    hostId: resolvedHostId || null,
    hostSiteId: resolvedHostSiteId || null,
    consoleId: resolvedConsoleId || null,
    siteId: resolvedSiteId || null,
    siteName: resolvedSiteName || null,
    hostName: resolvedHostName || null
  };

  if (hostMetadata && Object.keys(hostMetadata).length > 0) {
    enrichedDevice.hostMetadata = hostMetadata;
  }

  return enrichedDevice;
};

const buildDeviceKey = (device) => {
  if (!device || typeof device !== 'object') return JSON.stringify(device);

  const mac = normalizeMac(device.mac);
  const id = cleanString(device.id);
  const serial = cleanString(device.serial || device.serialNumber);
  const host = cleanString(device.hostSiteId) || cleanString(device.hostId) || cleanString(device.consoleId);

  const parts = [host, mac, id, serial].filter(Boolean);
  if (parts.length === 0) {
    return JSON.stringify(device);
  }
  return parts.join('::');
};

const callUnifiProxy = async (payload = {}, apiKey = null) => {
  // ALWAYS use the proxy endpoint - never call UniFi API directly from browser
  // This avoids CORS issues
  const proxyUrl = resolveProxyUrl();

  console.log('[UniFi API] Calling proxy:', proxyUrl);
  console.log('[UniFi API] Endpoint:', payload.endpoint);
  console.log('[UniFi API] Has API key:', !!apiKey);

  const headers = {
    'Content-Type': 'application/json'
  };

  // Pass API key via header for local testing and production
  if (apiKey) {
    headers['x-unifi-api-key'] = apiKey;
    console.log('[UniFi API] Passing API key in header');
  }

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers,
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

    // Check if error is "Cannot POST /" - this means using npm start instead of npm run dev
    if (rawText?.includes('Cannot POST')) {
      error.message = 'UniFi proxy endpoint not available. You must use "npm run dev" to enable the API proxy.';
      error.suggestedFix = `
SOLUTION:
1. Stop your current server (Ctrl+C)
2. Run: npm run dev
3. Your app will be available at http://localhost:3000

Why? The proxy endpoint (/api/unifi-proxy) is a Vercel serverless function that only runs with Vercel dev.
      `;
      console.error('⚠️  ERROR: Run "npm run dev" instead to start the UniFi API proxy!');
    } else if (response.status === 404 && proxyUrl === PROXY_ENDPOINT) {
      error.message = 'UniFi proxy endpoint not found.';
      error.suggestedFix = `
Run the development server: npm run dev
      `;
    }

    throw error;
  }

  return data;
};

/**
 * Parse UniFi URL to extract host ID and site ID
 * Supports patterns like:
 * - /consoles/{hostId}/network/{siteId}/...
 * - /consoles/{hostId}/unifi-api/network (implies default site)
 * - /network/{siteId}/...
 * @param {string} unifiUrl - Full UniFi URL from project
 * @returns {Object} { hostId, siteId }
 */
export const parseUnifiUrl = (unifiUrl) => {
  try {
    const url = new URL(unifiUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Pattern 1: /consoles/{hostId}/...
    if (pathParts[0] === 'consoles' && pathParts[1]) {
      const hostId = pathParts[1];

      // Check for /network/{siteId}
      const networkIndex = pathParts.indexOf('network');
      if (networkIndex !== -1 && pathParts[networkIndex + 1]) {
        return {
          hostId,
          siteId: pathParts[networkIndex + 1]
        };
      }

      // Check for /unifi-api/network (usually implies default site or site list)
      if (pathParts.includes('unifi-api')) {
        return { hostId, siteId: 'default' };
      }

      return {
        hostId,
        siteId: 'default'
      };
    }

    // Pattern 2: /network/{siteId}/...
    if (pathParts[0] === 'network' && pathParts[1]) {
      return {
        hostId: null,
        siteId: pathParts[1]
      };
    }

    return { hostId: null, siteId: 'default' };
  } catch (error) {
    console.error('[parseUnifiUrl] Failed to parse URL:', error);
    return { hostId: null, siteId: 'default' };
  }
};

/**
 * Fetch all hosts from UniFi Site Manager (Cloud API)
 * Official endpoint: https://api.ui.com/v1/hosts
 * Each host has a hostname (UUID) that identifies it
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of UniFi hosts
 */
export const fetchSites = async (controllerUrl, apiKey = null) => {
  try {
    return await callUnifiProxy({
      endpoint: '/v1/hosts',
      controllerUrl
    }, apiKey);
  } catch (error) {
    console.error('Error fetching UniFi hosts:', error);
    throw error;
  }
};

/**
 * Fetch sites from local UniFi controller
 * Uses local Network API endpoint: /proxy/network/integration/v1/sites
 * @param {string} controllerUrl - Local controller IP (e.g., 'https://192.168.1.1')
 * @param {string} networkApiKey - Local Network API key
 * @returns {Promise<Array>} List of sites
 */
export const fetchLocalSites = async (controllerUrl, networkApiKey = null) => {
  try {
    if (!controllerUrl) {
      throw new Error('Controller URL is required');
    }

    // Build full URL for local controller access
    const baseUrl = controllerUrl.endsWith('/') ? controllerUrl.slice(0, -1) : controllerUrl;
    const endpoint = `${baseUrl}/proxy/network/integration/v1/sites`;

    console.log('[fetchLocalSites] Full endpoint URL:', endpoint);

    const response = await callUnifiProxy({
      endpoint,
      directUrl: true,
      networkApiKey
    }, networkApiKey);

    // Parse response - API returns data in various formats
    const sites = response?.data || response?.sites || response || [];

    console.log('[fetchLocalSites] Retrieved sites:', Array.isArray(sites) ? sites.length : 'non-array response');

    return {
      data: sites,
      total: Array.isArray(sites) ? sites.length : 0,
      raw: response
    };
  } catch (error) {
    console.error('Error fetching local UniFi sites:', error);
    throw error;
  }
};

/**
 * Fetch all devices managed by hosts
 * Official endpoint: https://api.ui.com/v1/devices
 * Can optionally filter by hostIds
 * @param {string} hostId - Optional UniFi host ID to filter devices
 * @param {string} controllerUrl - UniFi controller base URL (not used, kept for compatibility)
 * @returns {Promise<Object>} Response with devices data
 */
export const fetchDevices = async (hostIds, controllerUrl = null, options = {}, apiKey = null) => {
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

    // Determine if we need to use a console-specific proxy path (Cloud Key)
    // This supports fetching devices via the legacy /stat/device endpoint if needed, 
    // but typically we use the Site Manager API (/v1/devices) which is better.
    // For now, we stick to /v1/devices as it works well for UniFi hardware.

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
        controllerUrl // Maintained for API signature parity
      }, apiKey);

      lastResponse = response;

      const pageEntries =
        response?.data ||
        response?.devices ||
        response?.items ||
        [];

      console.log('[unifiApi] Devices page', page, 'count:', pageEntries.length);

      pageEntries.forEach((entry, entryIndex) => {
        const hostMetadata = extractHostMetadata(entry, entryIndex);

        if (hostMetadata) {
          const hostKey = hostMetadata.hostSiteId || hostMetadata.hostId || hostMetadata.consoleId;
          if (hostKey && !seenHosts.has(hostKey)) {
            seenHosts.add(hostKey);
            hostSummaries.push({
              ...hostMetadata,
              deviceCount: Array.isArray(entry?.devices) ? entry.devices.length : 0
            });
          }
        }

        if (Array.isArray(entry?.devices)) {
          if (entry.devices.length > 0) {
            entry.devices.forEach((device) => {
              const mergedDevice = mergeDeviceWithHost(device, hostMetadata);
              const key = buildDeviceKey(mergedDevice);
              if (!seenDeviceKeys.has(key)) {
                seenDeviceKeys.add(key);
                uniqueDevices.push(mergedDevice);
              }
            });
          }
          return;
        }

        if (entry && typeof entry === 'object') {
          const mergedDevice = mergeDeviceWithHost(entry, hostMetadata);
          const key = buildDeviceKey(mergedDevice);
          if (!seenDeviceKeys.has(key)) {
            seenDeviceKeys.add(key);
            uniqueDevices.push(mergedDevice);
          }
          return;
        }

        const key = JSON.stringify(entry);
        if (!seenDeviceKeys.has(key)) {
          seenDeviceKeys.add(key);
          uniqueDevices.push(entry);
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

/**
 * Fetch all clients connected to the network
 * Supports both:
 * 1. Cloud Console Proxy (legacy /stat/sta endpoint via api.ui.com) - Uses Cloud API Key
 * 2. Local Controller Direct (Network API) - Uses Local Network API Key
 *
 * @param {string} siteId - UniFi site ID (e.g., 'default' or UUID)
 * @param {string} controllerUrl - Full URL from project setting
 * @param {string} networkApiKey - Local Network API key (only for local connection)
 * @returns {Promise<Object>} Response with clients data
 */
export const fetchClients = async (siteId, controllerUrl, networkApiKey = null) => {
  try {
    if (!siteId) {
      throw new Error('Site ID is required to fetch clients');
    }

    if (!controllerUrl) {
      throw new Error('Controller URL is required to fetch clients');
    }

    // Check if we are using a Cloud Console URL
    const { hostId: consoleId, siteId: parsedSiteId } = parseUnifiUrl(controllerUrl);
    const effectiveSiteId = siteId || parsedSiteId || 'default';

    if (consoleId) {
      // PATH 1: Cloud Console Proxy (unchanged legacy path for now)
      console.log('[fetchClients] Detected Cloud Console URL. Using Console Proxy path.');
      const endpoint = `/v1/consoles/${consoleId}/proxy/network/api/s/${effectiveSiteId}/stat/sta`;
      const response = await callUnifiProxy({ endpoint, controllerUrl: null }, null);
      const clients = response?.data || response?.items || response || [];
      return {
        data: parseClientData(clients),
        total: Array.isArray(clients) ? clients.length : 0,
        raw: response
      };
    }

    // PATH 2: Local Controller Direct (Method 1) - THE NEW SMART LOGIC
    console.log('[fetchClients] Detected Local Controller URL. Using Smart Integration Logic.');
    const baseUrl = controllerUrl.endsWith('/') ? controllerUrl.slice(0, -1) : controllerUrl;

    // Step 1: Fetch Sites to get the correct UUID (bypassing 'default' error)
    // We reuse the verify logic basically
    const siteListEndpoint = `${baseUrl}/proxy/network/integration/v1/sites`;
    console.log('[fetchClients] Step 1: Getting Site UUID from:', siteListEndpoint);

    const siteListResponse = await callUnifiProxy({
      endpoint: siteListEndpoint,
      directUrl: true,
      networkApiKey,
      method: "GET"
    }, networkApiKey);

    const sites = siteListResponse?.data || siteListResponse;
    if (!sites || sites.length === 0) {
      throw new Error('Failed to retrieve site list from local controller');
    }

    // Default to first site if 'default' was requested, otherwise find matching name/ref
    let targetSiteId = sites[0].id;
    if (siteId !== 'default') {
      const found = sites.find(s => s.name === siteId || s.internalReference === siteId || s.id === siteId);
      if (found) targetSiteId = found.id;
    }

    console.log(`[fetchClients] Resolved Site ID: ${targetSiteId}`);

    // Step 2: Fetch Clients ONLY (Reliability Focus)
    // We skipping Device fetch for now as it causes timeouts on some controllers.
    const clientsEndpoint = `${baseUrl}/proxy/network/integration/v1/sites/${targetSiteId}/clients`;
    // const devicesEndpoint = `${baseUrl}/proxy/network/integration/v1/sites/${targetSiteId}/devices`;

    console.log('[fetchClients] Fetching Clients...');
    const clientsRes = await callUnifiProxy({ endpoint: clientsEndpoint, directUrl: true, networkApiKey, method: 'GET' }, networkApiKey);

    // console.log('[fetchClients] Fetching Devices...');
    // const devicesRes = await callUnifiProxy({ endpoint: devicesEndpoint, directUrl: true, networkApiKey, method: 'GET' }, networkApiKey);

    const clientsRaw = clientsRes?.data || clientsRes || [];
    const devicesRaw = []; // devicesRes?.data || devicesRes || [];

    console.log(`[fetchClients] Fetched ${clientsRaw.length} clients.`);

    // Step 3: Creation Lookup Map for Devices
    const deviceMap = new Map();
    devicesRaw.forEach(d => {
      if (d.id) deviceMap.set(d.id, d);
    });

    // Step 4: Enrich & Normalize Client Data
    const enrichedClients = clientsRaw.map(c => {
      // Find Uplink Device
      const uplinkDev = c.uplinkDeviceId ? deviceMap.get(c.uplinkDeviceId) : null;

      // Normalize Fields for App Compatibility
      return {
        ...c,
        // Core Identity
        mac: c.macAddress || c.mac,
        ip: c.ipAddress || c.ip,
        name: c.name || c.hostname || c.macAddress || c.mac,

        // Connection Info
        uptime: c.uptime || 0,
        wired: c.type === 'WIRED' || c.wired === true || c.is_wired === true,

        // Uplink Enrichment
        uplink_device_name: uplinkDev ? (uplinkDev.name || uplinkDev.model || 'Unknown Switch') : null,
        uplink_mac: uplinkDev ? (uplinkDev.macAddress || uplinkDev.mac) : null,
        // Note: uplinkPortIdx is not reliably in client obj, but we map name at least

        // Keep original raw data just in case
        _raw: c
      };
    });

    return {
      data: parseClientData(enrichedClients), // Pass through existing parser for final polish if needed
      total: enrichedClients.length,
      raw: clientsRes
    };

  } catch (error) {
    console.error('Error fetching UniFi clients:', error);
    throw error;
  }
};

/**
 * Test various client endpoint patterns to discover the correct one
 * @param {string} siteId - UniFi site ID or hostSiteId
 * @param {string} controllerUrl - UniFi controller URL
 * @returns {Promise<Object>} Test results for each endpoint
 */
export const testClientEndpoints = async (siteId, controllerUrl, apiKey = null) => {
  const results = {};

  // Helper function for retrying requests
  const fetchWithRetry = async (url, options, maxRetries = 2) => {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt} for ${options.body ? JSON.parse(options.body).endpoint : url}`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }

        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    throw lastError;
  };

  // Extract console ID from the URL
  const extractConsoleIdFromUrl = (url) => {
    if (!url) return null;
    // Try to extract from various URL formats - including the new format
    const patterns = [
      /consoles\/([A-F0-9:]+)/i,  // New format: consoles/6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638
      /console\.ui\.com\/([a-f0-9-]+)/i,
      /api\.ui\.com\/ea\/console\/([a-f0-9-]+)/i,
      /console-id[=:]([a-f0-9-]+)/i,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const consoleId = extractConsoleIdFromUrl(controllerUrl);

  // Extract actual site ID parts
  const siteParts = siteId ? siteId.split(':') : [];
  const actualSiteId = siteParts[1] || siteParts[0] || 'default';

  // Enhanced endpoint patterns with more variations
  const endpoints = [
    // Network API via api.ui.com proxy - MOST LIKELY TO WORK
    { path: `/proxy/network/integration/v1/clients`, name: 'Network API - All Clients (NO site filter)' },
    { path: `/proxy/network/integration/v1/sites/default/clients`, name: 'Network API - Default Site Clients' },

    // Legacy API patterns that often work
    { path: `/proxy/network/api/s/${actualSiteId}/stat/sta`, name: `Legacy Network API - Site ${actualSiteId}` },
    { path: `/proxy/network/api/s/default/stat/sta`, name: 'Legacy Network API - Default Site' },

    // Try with URL-encoded hostSiteId (colon becomes %3A)
    { path: `/proxy/network/integration/v1/sites/${encodeURIComponent(siteId)}/clients`, name: `Network API - Encoded Full ID` },
    { path: `/proxy/network/integration/v1/sites/${actualSiteId}/clients`, name: `Network API - Site part only (${actualSiteId})` },
    { path: `/proxy/network/integration/v1/sites/${consoleId}/clients`, name: `Network API - Console ID` },

    // Alternative v1 format
    { path: `/proxy/network/v1/sites/${actualSiteId}/clients`, name: `Network v1 - Site ${actualSiteId}` },

    // Query parameter format
    { path: `/integration/v1/clients?site=${actualSiteId}`, name: `Query Param Format - Site ${actualSiteId}` },

    // Direct legacy format (no proxy prefix)
    { path: `/api/s/${actualSiteId}/stat/sta`, name: `Direct Legacy - Site ${actualSiteId}` },

    // v2 API format
    { path: `/v2/api/site/${actualSiteId}/clients`, name: `v2 API - Site ${actualSiteId}` },

    // Site Manager API (cloud) - less likely to have clients
    { path: '/v1/clients', name: 'Site Manager - All Clients' },
    { path: `/v1/hosts/${consoleId}/clients`, name: 'Site Manager - Host Clients' },

    // No site context
    { path: `/proxy/network/api/stat/sta`, name: 'Legacy Network API - No Site Context' }
  ];

  // Always use the proxy to avoid CORS issues
  const proxyUrl = resolveProxyUrl();

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing endpoint: ${endpoint.name} - ${endpoint.path}`);

      // Use the proxy endpoint with POST method
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      // Don't pass API key in header - use env var on deployed proxy
      // if (apiKey) {
      //   headers['x-unifi-api-key'] = apiKey;
      // }

      // Use fetchWithRetry for better reliability
      const response = await fetchWithRetry(proxyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint: endpoint.path,
          method: 'GET',
          controllerUrl
        })
      }, 2); // Max 2 retries

      results[endpoint.name] = {
        path: endpoint.path,
        status: response.status,
        statusText: response.statusText,
        success: response.ok
      };

      if (response.ok) {
        const data = await response.json();
        results[endpoint.name].data = data;
        results[endpoint.name].recordCount = Array.isArray(data) ? data.length :
          Array.isArray(data?.data) ? data.data.length :
            Array.isArray(data?.clients) ? data.clients.length : 0;
      } else {
        const errorText = await response.text();
        results[endpoint.name].error = errorText;
      }
    } catch (error) {
      results[endpoint.name] = {
        path: endpoint.path,
        error: error.message,
        status: 'Network Error'
      };
    }
  }

  return results;
};

/**
 * Extract potential client information from device port tables
 * @param {Array} devices - Array of device objects from /v1/devices
 * @returns {Array} Array of discovered client connections
 */
export const extractClientsFromDevices = (devices) => {
  const clients = [];

  devices.forEach(device => {
    // Only switches have useful port_table data
    if (!device.port_table) return;

    console.log(`🔍 Checking ${device.name || device.model} for client data in port_table...`);

    device.port_table.forEach(port => {
      // Check if port has active connection
      if (!port.up) return;

      // Try to find client identifier in port data
      // Different controller versions use different field names
      const clientMac = port.mac ||
        port.client_mac ||
        port.port_poe?.client_mac ||
        port.poe_client_mac;

      if (clientMac) {
        console.log(`✅ Found client on ${device.name} port ${port.port_idx}:`, clientMac);
        clients.push({
          mac: clientMac,
          switch_mac: device.mac,
          switch_name: device.name,
          switch_model: device.model,
          switch_port: port.port_idx,
          port_name: port.name,
          vlan: port.native_networkconf_id || port.vlan,
          poe_enabled: port.poe_enable,
          poe_mode: port.poe_mode,
          poe_power: port.poe_power,
          speed: port.speed,
          discovered_from: 'device_port_table',
          raw_port_data: port
        });
      } else {
        // Log port structure to see what fields are available
        if (port.up && port.port_idx <= 3) { // Only log first 3 ports to avoid spam
          console.log(`Port ${port.port_idx} fields:`, Object.keys(port));
        }
      }
    });
  });

  console.log(`📊 Extracted ${clients.length} clients from ${devices.length} devices`);
  return clients;
};

/**
 * Parse client data from various potential response formats
 * @param {Object} rawData - Raw API response
 * @returns {Array} Parsed client array
 */
export const parseClientData = (rawData) => {
  if (!rawData) return [];

  // Handle different response structures
  let clients = [];
  if (Array.isArray(rawData)) {
    clients = rawData;
  } else if (Array.isArray(rawData?.data)) {
    clients = rawData.data;
  } else if (Array.isArray(rawData?.clients)) {
    clients = rawData.clients;
  } else if (Array.isArray(rawData?.items)) {
    clients = rawData.items;
  }

  // Map to consistent format
  return clients.map(client => ({
    // Basic identification
    mac: client.mac || client.mac_address || client.client_mac,
    ip: client.ip || client.fixed_ip || client.last_ip || client.network?.ip,
    hostname: client.hostname || client.name || client.display_name || client.device_name,

    // Network connection info
    switch_mac: client.sw_mac || client.switch_mac || client.uplink_mac,
    switch_port: client.sw_port || client.switch_port || client.port_idx,
    switch_name: client.sw_name || client.switch_name,
    vlan: client.vlan || client.network?.vlan_id,
    network: client.network?.name || client.network || client.essid,

    // Connection type
    is_wired: client.is_wired !== undefined ? client.is_wired :
      client.connection_type === 'wired' ||
      client.type === 'wired' ||
      !client.essid,

    // Status info
    is_online: client.is_online || client.status === 'online' || client.last_seen_by_uap > Date.now() / 1000 - 300,
    last_seen: client.last_seen || client.last_seen_by_uap || client.disconnect_timestamp,
    uptime: client.uptime || client.association_time,

    // Traffic stats
    rx_bytes: client.rx_bytes || client.bytes_r,
    tx_bytes: client.tx_bytes || client.bytes,

    // Additional info
    oui: client.oui || client.vendor,
    device_type: client.dev_cat || client.device_category,
    os: client.os_name || client.os,

    // Raw data for debugging
    _raw: client
  }));
};

/**
 * Fetch clients using the discovered endpoint
 * @param {string} siteId - UniFi site ID
 * @param {string} controllerUrl - UniFi controller URL
 * @param {string} endpoint - Specific endpoint to use (optional)
 * @returns {Promise<Array>} Array of client objects
 */
export const fetchClientsWithEndpoint = async (siteId, controllerUrl, endpoint = '/v1/clients', apiKey = null) => {
  try {
    // Extract console ID from the URL
    const extractConsoleIdFromUrl = (url) => {
      if (!url) return null;
      const patterns = [
        /consoles\/([A-F0-9:]+)/i,  // New format: consoles/6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638
        /console\.ui\.com\/([a-f0-9-]+)/i,
        /api\.ui\.com\/ea\/console\/([a-f0-9-]+)/i,
        /console-id[=:]([a-f0-9-]+)/i,
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    // eslint-disable-next-line no-unused-vars
    const consoleId = extractConsoleIdFromUrl(controllerUrl);
    const proxyUrl = resolveProxyUrl();

    console.log(`Fetching clients from: ${endpoint}`);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Don't pass API key in header - use env var on deployed proxy
    // if (apiKey) {
    //   headers['x-unifi-api-key'] = apiKey;
    // }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint,
        method: 'GET',
        controllerUrl
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch clients: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return parseClientData(data);
  } catch (error) {
    console.error('Error fetching UniFi clients:', error);
    throw error;
  }
};

/**
 * Fetch port configurations for a specific switch
 * @param {string} siteId - UniFi site ID
 * @param {string} deviceMac - Switch MAC address
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Object>} Switch port configuration
 */
export const fetchSwitchPorts = async (siteId, deviceMac, controllerUrl) => {
  if (!siteId || !deviceMac) throw new Error('Site ID and device MAC are required');

  try {
    const response = await fetchDevices(siteId, controllerUrl, { fetchAll: false });
    const devices = response?.data || [];
    const targetMac = normalizeMac(deviceMac);
    const switchDevice = devices.find((device) => {
      const deviceMacNormalized = normalizeMac(device?.mac);
      const deviceId = cleanString(device?.id);
      const compareId = cleanString(deviceMac);
      return (
        (deviceMacNormalized && targetMac && deviceMacNormalized === targetMac) ||
        (deviceId && compareId && deviceId === compareId)
      );
    });
    return switchDevice?.port_table || [];
  } catch (error) {
    console.error('Error fetching switch ports:', error);
    throw error;
  }
};

/**
 * Test connection to UniFi API
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Object>} Connection status result
 */
export const testConnection = async (controllerUrl, apiKey = null) => {
  try {
    await fetchSites(controllerUrl, apiKey);
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

const unifiApi = {
  fetchSites,
  fetchLocalSites,
  fetchDevices,
  fetchClients,
  fetchSwitchPorts,
  testConnection,
  testClientEndpoints,
  fetchClientsWithEndpoint,
  parseClientData,
  extractClientsFromDevices,
  parseUnifiUrl
};
export default unifiApi;
