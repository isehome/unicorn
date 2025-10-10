/**
 * Frontend service for Ubiquity API integration
 * Uses serverless proxy to keep API key secure
 */

const PROXY_ENDPOINT = '/api/ubiquity-proxy';

class UbiquityApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'UbiquityApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Make a request through the Ubiquity proxy
 * @param {string} endpoint - API endpoint path (e.g., 'devices', 'sites')
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} API response data
 */
export async function callUbiquityApi(endpoint, options = {}) {
  try {
    const queryParams = new URLSearchParams({
      endpoint: endpoint,
      ...options.params
    });

    const response = await fetch(`${PROXY_ENDPOINT}?${queryParams}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      ...(options.body && { body: JSON.stringify(options.body) })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new UbiquityApiError(
        data.error || 'Ubiquity API request failed',
        response.status,
        data.details
      );
    }

    return data;
  } catch (error) {
    if (error instanceof UbiquityApiError) {
      throw error;
    }
    
    console.error('Ubiquity API call failed:', error);
    throw new UbiquityApiError(
      'Failed to connect to Ubiquity API',
      500,
      error.message
    );
  }
}

/**
 * Make a request to a full Ubiquity API URL
 * @param {string} url - Full API URL
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} API response data
 */
export async function callUbiquityApiUrl(url, options = {}) {
  try {
    const queryParams = new URLSearchParams({
      url: url,
      ...options.params
    });

    const response = await fetch(`${PROXY_ENDPOINT}?${queryParams}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      ...(options.body && { body: JSON.stringify(options.body) })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new UbiquityApiError(
        data.error || 'Ubiquity API request failed',
        response.status,
        data.details
      );
    }

    return data;
  } catch (error) {
    if (error instanceof UbiquityApiError) {
      throw error;
    }
    
    console.error('Ubiquity API call failed:', error);
    throw new UbiquityApiError(
      'Failed to connect to Ubiquity API',
      500,
      error.message
    );
  }
}

// Example usage methods - adjust based on actual Ubiquity API endpoints

/**
 * Get list of devices
 * @returns {Promise<Array>} List of devices
 */
export async function getDevices() {
  const data = await callUbiquityApi('devices');
  return data.devices || data;
}

/**
 * Get list of sites
 * @returns {Promise<Array>} List of sites
 */
export async function getSites() {
  const data = await callUbiquityApi('sites');
  return data.sites || data;
}

/**
 * Get device details
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} Device details
 */
export async function getDeviceDetails(deviceId) {
  return await callUbiquityApi(`devices/${deviceId}`);
}

/**
 * Get site details
 * @param {string} siteId - Site ID
 * @returns {Promise<Object>} Site details
 */
export async function getSiteDetails(siteId) {
  return await callUbiquityApi(`sites/${siteId}`);
}

export default {
  callUbiquityApi,
  callUbiquityApiUrl,
  getDevices,
  getSites,
  getDeviceDetails,
  getSiteDetails,
  UbiquityApiError
};
