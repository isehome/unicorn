/**
 * SharePoint File Download API
 *
 * Downloads a file from SharePoint via Microsoft Graph API.
 * Used by the submittals ZIP generator to fetch uploaded PDFs.
 *
 * Input: Query params { driveId, itemId }
 * Output: File blob with appropriate content type
 */

const { requireAuth } = require('./_authMiddleware');

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

async function getAppToken() {
  const body = new URLSearchParams();
  body.set('client_id', CLIENT_ID);
  body.set('client_secret', CLIENT_SECRET);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

async function downloadFile(token, driveId, itemId) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;

  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    redirect: 'follow'
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Download failed: ${resp.status} ${text}`);
  }

  // Get content type from response
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';

  // Return the response body as ArrayBuffer
  const buffer = await resp.arrayBuffer();

  return { buffer, contentType };
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res); if (!user) return;

  const { driveId, itemId } = req.query;

  if (!driveId || !itemId) {
    return res.status(400).json({ error: 'Missing driveId or itemId' });
  }

  try {
    const token = await getAppToken();
    const { buffer, contentType } = await downloadFile(token, driveId, itemId);

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Send the file
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[sharepoint-download] Error:', err);
    return res.status(500).json({
      error: 'Failed to download file',
      details: err.message
    });
  }
};
