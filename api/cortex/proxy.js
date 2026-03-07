const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract URL parameter
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing required parameter: url' });
  }

  // Validate URL
  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are allowed' });
  }

  // Block localhost and internal IPs
  const hostname = targetUrl.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.')
  ) {
    return res.status(403).json({ error: 'Access to internal networks is not allowed' });
  }

  // Set response headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");

  try {
    const data = await fetchUrl(url);
    const contentType = data.contentType || '';
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      let html = data.body.toString('utf-8');

      // Inject <base> tag into <head> to resolve relative URLs
      const baseTag = `<base href="${targetUrl.origin}/">`;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
      } else {
        html = `${baseTag}\n${html}`;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(data.statusCode).send(html);
    } else {
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(data.statusCode).send(data.body);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(502).json({
      error: 'Failed to fetch target URL',
      message: error.message,
    });
  }
};

/**
 * Fetch a URL using Node's built-in http/https modules.
 * Follows up to 5 redirects.
 */
function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }

    const lib = url.startsWith('https') ? https : http;

    const request = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    }, (response) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        let redirectUrl = response.headers.location;
        // Handle relative redirects
        if (redirectUrl.startsWith('/')) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          contentType: response.headers['content-type'] || '',
          body: Buffer.concat(chunks),
        });
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}
