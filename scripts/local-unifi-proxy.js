#!/usr/bin/env node

/**
 * Local UniFi Network API Proxy
 *
 * This proxy runs on your local machine and forwards requests to your UniFi controller,
 * adding the necessary CORS headers so your browser-based app can access the API.
 *
 * Usage:
 *   node local-unifi-proxy.js
 *
 * The proxy will run on http://localhost:3001
 * Your app should send requests to http://localhost:3001/proxy instead of directly to the controller
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

// Disable SSL certificate validation for self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, X-Controller-IP');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle /proxy path
  if (!req.url.startsWith('/proxy')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /proxy endpoint' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const controllerIp = req.headers['x-controller-ip'];
      const apiKey = req.headers['x-api-key'];

      if (!controllerIp) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'X-Controller-IP header required' }));
        return;
      }

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'X-API-KEY header required' }));
        return;
      }

      // Extract the path after /proxy
      const proxyPath = req.url.substring('/proxy'.length) || '/';
      const targetUrl = `https://${controllerIp}${proxyPath}`;

      console.log(`[${new Date().toISOString()}] ${req.method} ${targetUrl}`);

      const parsedUrl = url.parse(targetUrl);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.path,
        method: req.method,
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        rejectUnauthorized: false // Accept self-signed certificates
      };

      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });

        proxyRes.pipe(res);

        console.log(`  → ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
      });

      proxyReq.on('error', (error) => {
        console.error(`  ✗ Error:`, error.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Proxy error',
          message: error.message
        }));
      });

      if (body) {
        proxyReq.write(body);
      }

      proxyReq.end();
    } catch (error) {
      console.error('Request processing error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Local UniFi Network API Proxy Server                  ║
╚═══════════════════════════════════════════════════════════════╝

✓ Server running on http://localhost:${PORT}

Usage in your app:
  Send requests to: http://localhost:${PORT}/proxy/network/api/...

  Required headers:
    X-Controller-IP: Your controller IP (e.g., 192.168.1.1)
    X-API-KEY: Your Network API key

Example:
  fetch('http://localhost:${PORT}/proxy/network/api/s/default/stat/sta', {
    headers: {
      'X-Controller-IP': '192.168.1.1',
      'X-API-KEY': 'your-api-key-here'
    }
  })

Press Ctrl+C to stop
`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use. Please close the other application or change the PORT.`);
  } else {
    console.error('\n✗ Server error:', error);
  }
  process.exit(1);
});
