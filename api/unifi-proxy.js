/**
 * Serverless function to proxy UniFi API requests
 * Keeps the API key secure on the backend
 */

const { requireAuth } = require('./_authMiddleware');
const https = require('https');
const { URL } = require('url');

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

  // Auth required for proxy endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

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
    directUrl = false,
    networkApiKey: customNetworkApiKey
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

      // NOTE: We do NOT force useNetworkApiKey = true here anymore.
      // If we are hitting api.ui.com (directUrl = false), we MUST use the Cloud API Key (apiKey).
      // The previous logic incorrectly forced expecting a Network API Key for cloud proxy paths.
      if (endpoint.includes('/proxy/network/') || endpoint.includes('/consoles/')) {
        console.log('Targeting Network API via Cloud Proxy - using Cloud API Key');
      }
    }

    console.log('Calling UniFi API:', url, 'method:', method);

    // Use custom Network API key if provided (no fallback - must be provided)
    const networkApiKey = customNetworkApiKey;
    const keyToUse = useNetworkApiKey ? networkApiKey : apiKey;

    // Ensure Network API key is provided for Network API calls
    if (useNetworkApiKey && !networkApiKey) {
      return res.status(400).json({
        error: 'Network API key required',
        hint: 'Please provide a Network API key for accessing the UniFi controller directly'
      });
    }

    console.log('Using API key type:', useNetworkApiKey ? 'Network API key (custom)' : 'Cloud API key (env)');

    const fetchOptions = {
      method: method?.toUpperCase() || 'GET',
      headers: {
        'X-API-KEY': keyToUse,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(upstreamHeaders || {})
      }
    };

    // For Network API calls to controller (WAN IP or hostname), use Node.js HTTPS module
    // This allows us to handle self-signed certificates properly
    if (useNetworkApiKey && (directUrl || endpoint.includes('/proxy/network/'))) {
      console.log('Using Node.js HTTPS module for Network API call to handle self-signed certs');
      console.log('Full URL being requested:', url);

      return new Promise((resolve, reject) => {
        try {
          const parsedUrl = new URL(url);

          const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,  // UDM Pro uses port 443 by default (not 8443)
            path: parsedUrl.pathname + parsedUrl.search,
            method: method?.toUpperCase() || 'GET',
            headers: {
              'X-API-KEY': keyToUse,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              ...(upstreamHeaders || {})
            },
            rejectUnauthorized: false,  // Accept self-signed certificates
            timeout: 30000,  // 30 second timeout
            family: 4        // Force IPv4 to avoid lookup delays
          };

          // Remove content-type for GET requests
          if (options.method === 'GET') {
            delete options.headers['Content-Type'];
          }

          console.log('HTTPS request options:', {
            hostname: options.hostname,
            port: options.port,
            path: options.path,
            method: options.method
          });

          const httpsReq = https.request(options, (httpsRes) => {
            let data = '';

            httpsRes.on('data', (chunk) => {
              data += chunk;
            });

            httpsRes.on('end', () => {
              console.log('HTTPS response status:', httpsRes.statusCode);

              // Handle error status codes
              if (httpsRes.statusCode >= 400) {
                console.error('UniFi API error:', httpsRes.statusCode, data);

                switch (httpsRes.statusCode) {
                  case 401:
                    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
                    break;
                  case 403:
                    res.status(403).json({ error: 'Forbidden: No access to this resource' });
                    break;
                  case 404:
                    res.status(404).json({ error: 'Resource not found' });
                    break;
                  case 429:
                    res.status(429).json({ error: 'Rate limit exceeded' });
                    break;
                  default:
                    res.status(httpsRes.statusCode).json({
                      error: `API Error: ${httpsRes.statusMessage}`,
                      details: data
                    });
                }
                resolve();
                return;
              }

              // Parse and return successful response
              try {
                const jsonData = data ? JSON.parse(data) : {};
                res.status(200).json(jsonData);
              } catch (parseError) {
                console.error('JSON parse error:', parseError);
                // If it's not JSON, return raw data
                res.status(200).send(data);
              }
              resolve();
            });
          });

          httpsReq.on('error', (error) => {
            console.error('HTTPS request error:', error);
            console.error('Error code:', error.code);
            console.error('Failed URL:', url);

            let hint = 'Check that the controller is accessible and the WAN IP/hostname is correct';

            if (error.code === 'ECONNREFUSED') {
              hint = `Connection refused on port ${options.port}. Ensure the controller is running and accessible. For UDM Pro, use port 443 (not 8443).`;
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
              hint = `Connection timed out. Ensure you're on the same local network as the controller. Local API keys only work from the local network.`;
            } else if (error.code === 'ENOTFOUND') {
              hint = 'Hostname not found. Use the local IP address (e.g., 192.168.1.1) instead.';
            }

            res.status(500).json({
              error: 'Controller connection failed',
              details: error.message,
              errorCode: error.code,
              url: url,
              port: options.port,
              hint: hint
            });
            resolve();
          });

          httpsReq.on('timeout', () => {
            httpsReq.destroy();
            console.error('Request timed out after 10 seconds');
            res.status(504).json({
              error: 'Gateway Timeout',
              message: 'Request to controller timed out',
              hint: 'The controller did not respond within 10 seconds. Check network connectivity and firewall rules.'
            });
            resolve();
          });

          // Send request body if POST
          if (method?.toUpperCase() === 'POST' && upstreamBody !== undefined && upstreamBody !== null) {
            const bodyData = typeof upstreamBody === 'string'
              ? upstreamBody
              : JSON.stringify(upstreamBody);
            httpsReq.write(bodyData);
          }

          httpsReq.end();
        } catch (error) {
          console.error('Error setting up HTTPS request:', error);
          res.status(500).json({
            error: 'Failed to setup controller request',
            details: error.message
          });
          resolve();
        }
      });
    }

    // For Cloud API calls (api.ui.com), continue using fetch
    console.log('Using fetch for Cloud API call');

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
