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
      error.suggestedFix = 'The UniFi proxy function is not running locally. Start the Vercel dev server (`vercel dev`) or set REACT_APP_UNIFI_PROXY_URL to a deployed API endpoint.';
    }

    throw error;
  }

  return data;
};

/**
 * Fetch all hosts from UniFi Site Manager
 * Official endpoint: https://api.ui.com/v1/hosts
 * Each host has a hostname (UUID) that identifies it
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of UniFi hosts
 */
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

/**
 * Fetch all devices managed by hosts
 * Official endpoint: https://api.ui.com/v1/devices
 * Can optionally filter by hostIds
 * @param {string} hostId - Optional UniFi host ID to filter devices
 * @param {string} controllerUrl - UniFi controller base URL (not used, kept for compatibility)
 * @returns {Promise<Object>} Response with devices data
 */
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
        controllerUrl // Maintained for API signature parity
      });

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
 * Note: Client data may be included in device data or require a different endpoint
 * @param {string} hostId - UniFi host ID
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of connected clients
 */
export const fetchClients = async (hostId, controllerUrl) => {
  try {
    // TODO: Check if there's a separate clients endpoint in the API docs
    // For now, returning empty array as clients might be in device data
    console.warn('Clients endpoint not yet implemented - check API docs for correct endpoint');
    return { data: [] };
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

export default {
  fetchSites,
  fetchDevices,
  fetchClients,
  fetchSwitchPorts,
  testConnection
};
