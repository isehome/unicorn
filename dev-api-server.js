/**
 * Local Development API Server
 *
 * Run this alongside your React app to test API endpoints locally.
 * Usage: node dev-api-server.js
 *
 * This runs on port 3002 and proxies API calls.
 */

const http = require('http');
const enrichSinglePart = require('./api/enrich-single-part');

const PORT = 3002;

const server = http.createServer(async (req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url, `http://localhost:${PORT}`);

  console.log(`[Dev API] ${req.method} ${url.pathname}`);

  // Route to appropriate handler
  if (url.pathname === '/api/enrich-single-part' && req.method === 'POST') {
    // Parse body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      req.body = JSON.parse(body);
    } catch (e) {
      req.body = {};
    }

    // Call the handler
    await enrichSinglePart(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Dev API Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /api/enrich-single-part`);
  console.log(`\nMake sure you have GEMINI_API_KEY set in your environment!\n`);
});
