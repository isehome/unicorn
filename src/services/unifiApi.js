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
 * Fetch all hosts/sites from UniFi Site Manager
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of UniFi sites
 */
export const fetchSites = async (controllerUrl) => {
  try {
    return await callUnifiProxy({ 
      endpoint: '/v1/hosts',
      controllerUrl
    });
  } catch (error) {
    console.error('Error fetching UniFi sites:', error);
    throw error;
  }
};

/**
 * Fetch all devices (switches, APs, etc.) for a specific site
 * @param {string} siteId - UniFi site ID (host ID)
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of network devices
 */
export const fetchDevices = async (siteId, controllerUrl) => {
  if (!siteId) throw new Error('Site ID is required');
  
  try {
    // Note: The endpoint might be /ea/hosts/{hostId}/devices for early access
    // or /v1/sites/{siteId}/devices for stable API
    return await callUnifiProxy({ 
      endpoint: `/ea/hosts/${siteId}/devices`,
      controllerUrl
    });
  } catch (error) {
    console.error('Error fetching UniFi devices:', error);
    throw error;
  }
};

/**
 * Fetch all clients connected to the network
 * @param {string} siteId - UniFi site ID (host ID)
 * @param {string} controllerUrl - UniFi controller base URL
 * @returns {Promise<Array>} List of connected clients
 */
export const fetchClients = async (siteId, controllerUrl) => {
  if (!siteId) throw new Error('Site ID is required');
  
  try {
    // Note: The endpoint might be /ea/hosts/{hostId}/clients for early access
    return await callUnifiProxy({ 
      endpoint: `/ea/hosts/${siteId}/clients`,
      controllerUrl
    });
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
