/**
 * UniFi Network API Service
 * Provides methods to interact with UniFi Controller for network infrastructure
 */

const PROXY_ENDPOINT = '/api/unifi-proxy';

const callUnifiProxy = async (payload = {}) => {
  const response = await fetch(PROXY_ENDPOINT, {
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
    throw error;
  }

  return data;
};

/**
 * Fetch all sites from UniFi Site Manager
 * Official endpoint: https://api.ui.com/v1/sites
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of UniFi sites
 */
export const fetchSites = async (controllerUrl) => {
  try {
    return await callUnifiProxy({ 
      endpoint: '/v1/sites',
      controllerUrl
    });
  } catch (error) {
    console.error('Error fetching UniFi sites:', error);
    throw error;
  }
};

/**
 * Fetch all devices managed by hosts
 * Official endpoint: https://api.ui.com/v1/devices
 * Can optionally filter by hostIds
 * @param {string} hostId - Optional UniFi host ID to filter devices
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of network devices
 */
export const fetchDevices = async (hostId, controllerUrl) => {
  try {
    // Build endpoint with optional hostIds filter
    let endpoint = '/v1/devices';
    if (hostId) {
      endpoint += `?hostIds[]=${hostId}`;
    }
    
    return await callUnifiProxy({ 
      endpoint,
      controllerUrl
    });
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
    const devices = await fetchDevices(siteId, controllerUrl);
    const switchDevice = devices.find(d => d.mac === deviceMac);
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
