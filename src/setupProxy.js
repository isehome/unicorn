const https = require('https');
const { URL } = require('url');
const path = require('path');

// Load environment variables for API routes in development
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

module.exports = function (app) {
    const bodyParser = require('express').json();

    // System Account API endpoints for local development
    // These replicate the Vercel API routes
    app.use('/api/system-account/send-meeting-invite', bodyParser, async (req, res) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            const handler = require('../api/system-account/send-meeting-invite');
            await handler(req, res);
        } catch (error) {
            console.error('[setupProxy] send-meeting-invite error:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });

    app.use('/api/system-account/send-cancellation', bodyParser, async (req, res) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            const handler = require('../api/system-account/send-cancellation');
            await handler(req, res);
        } catch (error) {
            console.error('[setupProxy] send-cancellation error:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });

    // Check calendar responses - immediate check for schedule status updates
    app.use('/api/system-account/check-responses', bodyParser, async (req, res) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            const handler = require('../api/system-account/check-responses');
            await handler(req, res);
        } catch (error) {
            console.error('[setupProxy] check-responses error:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });

    // Public schedule response endpoint - allows customers to accept/decline via email links
    app.use('/api/public/schedule-response', async (req, res) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        try {
            const handler = require('../api/public/schedule-response');
            await handler(req, res);
        } catch (error) {
            console.error('[setupProxy] schedule-response error:', error);
            res.status(500).send('<html><body><h1>Error</h1><p>An error occurred processing your request.</p></body></html>');
        }
    });

    // We hijack the Vercel API path for local development
    // This allows 'npm start' to handle the proxying directly without 'vercel dev'
    app.use('/api/unifi-proxy', bodyParser, async (req, res) => {
        // Enable CORS
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, x-unifi-api-key');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        const apiKey = req.headers['x-unifi-api-key'] || process.env.UNIFI_API_KEY;
        const query = req.query;
        // Body is now parsed by the middleware
        const body = req.body;

        const endpoint = query.endpoint || body?.endpoint;
        const method = query.method || body?.method || 'GET';
        const directUrl = query.directUrl === 'true' || body?.directUrl === true;
        const networkApiKey = query.networkApiKey || body?.networkApiKey;

        console.log('[setupProxy] Request received:', { endpoint, directUrl, method: req.method });

        // For local network connections (Method 1)
        if (directUrl && endpoint) {
            console.log('[setupProxy] Proxying local request to:', endpoint);

            try {
                const parsedUrl = new URL(endpoint);

                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: method,
                    rejectUnauthorized: false,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-KEY': networkApiKey || apiKey,
                        'Accept': 'application/json'
                    },
                    agent: false, // Create new agent per request (avoid pool exhaustion)
                    timeout: 60000
                };

                if (body && (method === 'POST' || method === 'PUT')) {
                    // This line is now redundant if Content-Type is always application/json,
                    // but keeping it as per original structure for minimal change.
                    options.headers['Content-Type'] = 'application/json';
                }

                // Clean the body to remove proxy-specific fields
                const {
                    endpoint: _ep,
                    directUrl: _du,
                    method: _m,
                    networkApiKey: _nak,
                    ...cleanBody
                } = body;

                // If there's content left in body (like username/password), send it.
                // Otherwise don't send a body (for GETs).
                const hasBody = Object.keys(cleanBody).length > 0;

                const proxyReq = https.request(options, (proxyRes) => {
                    let data = '';

                    // FORWARD HEADERS (Critical for Set-Cookie / Auth)
                    Object.keys(proxyRes.headers).forEach(key => {
                        res.setHeader(key, proxyRes.headers[key]);
                    });

                    // Set Access-Control-Expose-Headers so fetch can see Set-Cookie
                    if (proxyRes.headers['set-cookie']) {
                        res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
                    }

                    res.status(proxyRes.statusCode);

                    proxyRes.on('data', chunk => data += chunk);
                    proxyRes.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            res.json(json);
                        } catch (e) {
                            res.send(data);
                        }
                    });
                });

                proxyReq.on('error', (e) => {
                    console.error('[Proxy Error]', e.message);
                    res.status(502).json({ error: 'Proxy Request Failed', details: e.message });
                });

                proxyReq.on('timeout', () => {
                    proxyReq.destroy();
                    res.status(504).json({ error: 'Gateway Timeout' });
                });

                proxyReq.setTimeout(60000); // 60s timeout

                // Write the CLEAN body
                if (hasBody && (method === 'POST' || method === 'PUT')) {
                    const bodyStr = JSON.stringify(cleanBody);
                    console.log('[Proxy] Forwarding Body:', bodyStr);
                    proxyReq.write(bodyStr);
                }

                proxyReq.end();

            } catch (error) {
                console.error('[setupProxy] Error:', error);
                res.status(500).json({ error: 'Internal Proxy Error', details: error.message });
            }
        } else {
            console.warn('[setupProxy] Fallback triggered. endpoint:', endpoint, 'directUrl:', directUrl);
            res.status(404).json({ error: 'This local proxy only handles directUrl=true requests for Method 1 testing.' });
        }
    });
};
