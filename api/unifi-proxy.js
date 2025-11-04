/**
 * Serverless function to proxy UniFi API requests
 * Keeps the API key secure on the backend
 */

const UNIFI_API_BASE_URL = process.env.UNIFI_CONTROLLER_URL || 'https://api.ui.com';

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, x-unifi-api-key');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Allow API key from header (for local testing) or environment variable (for production)
  const apiKey = req.headers['x-unifi-api-key'] || process.env.UNIFI_API_KEY;
  
  console.log('Environment variables:', {
    hasUnifiApiKey: !!apiKey,
    hasControllerUrl: !!process.env.UNIFI_CONTROLLER_URL,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('UNIFI'))
  });
  
  if (!apiKey) {
    console.error('UNIFI_API_KEY not configured');
    return res.status(500).json({ 
      error: 'API key not configured',
      debug: 'UNIFI_API_KEY environment variable is missing'
    });
  }

  const {
    endpoint,
    action,
    siteId,
    controllerUrl,
    method = 'GET',
    body: upstreamBody,
    headers: upstreamHeaders,
    directUrl = false
  } = req.method === 'POST' ? req.body : req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  try {
    let url;
    let useNetworkApiKey = false;

    if (directUrl) {
      // If directUrl is true, endpoint is already a full URL (e.g., https://47.199.106.32/...)
      url = endpoint;
      useNetworkApiKey = true; // Direct controller calls need the Network API key
      console.log('Using direct URL:', url);
    } else {
      // ALWAYS use the static API URL - we don't use controllerUrl as a base
      // The controllerUrl parameter is only used by the frontend to parse console IDs
      const baseUrl = UNIFI_API_BASE_URL;

      if (!baseUrl) {
        return res.status(400).json({ error: 'API base URL not configured' });
      }

      url = `${baseUrl}${endpoint}`;

      // Check if this is a Network API proxy endpoint
      if (endpoint.includes('/proxy/network/')) {
        useNetworkApiKey = true;
        console.log('Detected Network API proxy endpoint, will use Network API key');
      }
    }

    console.log('Calling UniFi API:', url, 'method:', method);

    // HARDCODED Network API key for testing direct controller access
    const networkApiKey = 'j_ChcU0fSMHlxPoj8djPhkBYgFVy0LAq';
    const keyToUse = useNetworkApiKey ? networkApiKey : apiKey;

    console.log('Using API key type:', useNetworkApiKey ? 'Network API key (hardcoded)' : 'Cloud API key (env)');

    const fetchOptions = {
      method: method?.toUpperCase() || 'GET',
      headers: {
        'X-API-KEY': keyToUse,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(upstreamHeaders || {})
      }
    };

    // For direct WAN IP calls, we need to handle self-signed SSL certificates
    // and set a timeout to avoid Vercel function timeout
    if (useNetworkApiKey && typeof global !== 'undefined' && global.fetch) {
      // Add a timeout for direct controller calls (5 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      fetchOptions.signal = controller.signal;

      // Note: We can't disable SSL verification in browser fetch or Vercel edge functions
      // This might fail due to self-signed certificates
      console.log('Direct WAN call with 5s timeout and potential SSL certificate issues');
    }

    if (fetchOptions.method === 'GET') {
      // Remove content-type for GET to avoid potential issues
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

    // Return the data
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching from UniFi API:', error);

    // Handle specific error types
    if (error.name === 'AbortError') {
      console.error('Request timed out after 5 seconds');
      return res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Request to controller timed out (WAN IP may not be accessible or has SSL certificate issues)',
        details: 'The controller did not respond within 5 seconds. This is likely due to SSL certificate issues with self-signed certificates or the WAN IP not being publicly accessible.'
      });
    }

    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      endpoint: endpoint
    });

    return res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message,
      details: error.toString(),
      hint: useNetworkApiKey ? 'Direct WAN IP calls may fail due to SSL certificate issues or firewall restrictions' : null
    });
  }
}
