/**
 * Serverless function to proxy UniFi API requests
 * Keeps the API key secure on the backend
 */

const UNIFI_API_BASE_URL = process.env.UNIFI_CONTROLLER_URL || 'https://api.ui.com';

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.UNIFI_API_KEY;
  
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
    headers: upstreamHeaders
  } = req.method === 'POST' ? req.body : req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  // ALWAYS use the static API URL - we don't use controllerUrl as a base
  // The controllerUrl parameter is only used by the frontend to parse console IDs
  const baseUrl = UNIFI_API_BASE_URL;

  if (!baseUrl) {
    return res.status(400).json({ error: 'API base URL not configured' });
  }

  try {
    let url = `${baseUrl}${endpoint}`;
    
    console.log('Calling UniFi API:', url, 'method:', method);

    const fetchOptions = {
      method: method?.toUpperCase() || 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(upstreamHeaders || {})
      }
    };

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
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      url: `${baseUrl}${endpoint}`
    });
    return res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message,
      details: error.toString()
    });
  }
}
