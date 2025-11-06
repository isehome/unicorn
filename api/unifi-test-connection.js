/**
 * Test endpoint to verify UniFi controller connectivity
 * Useful for debugging connection issues before attempting actual API calls
 */

const https = require('https');
const { URL } = require('url');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { controllerUrl, apiKey } = req.body;

  if (!controllerUrl) {
    return res.status(400).json({ error: 'Controller URL is required' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    // Test with a simple endpoint that should always exist
    const testEndpoint = '/api/self';
    const fullUrl = controllerUrl.startsWith('http')
      ? `${controllerUrl}${testEndpoint}`
      : `https://${controllerUrl}${testEndpoint}`;

    const url = new URL(fullUrl);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      },
      rejectUnauthorized: false,  // Accept self-signed certificates
      timeout: 5000  // 5 second timeout
    };

    console.log('Testing connection to:', url.hostname, 'port:', options.port);

    return new Promise((resolve) => {
      const testRequest = https.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          const result = {
            success: response.statusCode < 400,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            headers: {
              server: response.headers.server,
              'content-type': response.headers['content-type'],
              'x-frame-options': response.headers['x-frame-options']
            },
            message: response.statusCode < 400
              ? 'Controller is reachable and responding'
              : `Controller returned error: ${response.statusCode} ${response.statusMessage}`,
            data: data.substring(0, 500)  // First 500 chars of response
          };

          if (response.statusCode === 401) {
            result.suggestion = 'Check that the API key is correct and has appropriate permissions';
          } else if (response.statusCode === 404) {
            result.suggestion = 'The test endpoint was not found. The controller may be using a different API structure';
          } else if (response.statusCode >= 500) {
            result.suggestion = 'Controller internal error. Check the controller logs';
          }

          res.status(200).json(result);
          resolve();
        });
      });

      testRequest.on('error', (error) => {
        console.error('Connection test error:', error);

        let suggestion = 'Check that the controller is accessible from the internet';

        if (error.code === 'ECONNREFUSED') {
          suggestion = 'Connection refused. Check that the controller is running and the port is correct';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          suggestion = 'Connection timed out. Check firewall rules and port forwarding';
        } else if (error.code === 'ENOTFOUND') {
          suggestion = 'Hostname not found. Check the controller URL or hostname';
        } else if (error.message.includes('certificate')) {
          suggestion = 'SSL certificate issue (this should not happen with rejectUnauthorized: false)';
        }

        res.status(200).json({
          success: false,
          error: error.message,
          errorCode: error.code,
          suggestion: suggestion,
          hint: 'Common issues: firewall blocking port 443, incorrect WAN IP, or controller not configured for external access'
        });
        resolve();
      });

      testRequest.on('timeout', () => {
        testRequest.destroy();
        console.error('Connection test timed out after 5 seconds');
        res.status(200).json({
          success: false,
          error: 'Connection timeout',
          message: 'The controller did not respond within 5 seconds',
          suggestion: 'Check network connectivity and firewall rules. The controller may not be accessible from the internet.',
          hint: 'If testing locally, ensure you are on the same network as the controller'
        });
        resolve();
      });

      testRequest.end();
    });

  } catch (error) {
    console.error('Error in connection test:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test connection',
      details: error.message
    });
  }
};