// Vercel serverless function: Manages existing SharePoint files via Microsoft Graph
// Currently supports deleting files by drive/item ID.

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

async function graph(token, url, options = {}) {
  const resp = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph ${url} ${resp.status}: ${text}`);
  }

  if (resp.status === 204) return {};
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return resp.json();
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'Server missing Azure credentials' });
    return;
  }

  try {
    const { action = 'delete', driveId, itemId } = req.body || {};

    if (!driveId || !itemId) {
      res.status(400).json({ error: 'driveId and itemId are required' });
      return;
    }

    const token = await getAppToken();

    switch (action) {
      case 'delete': {
        await graph(token, `/drives/${driveId}/items/${itemId}`, { method: 'DELETE' });
        res.status(200).json({ success: true });
        return;
      }
      default:
        res.status(400).json({ error: `Unsupported action: ${action}` });
        return;
    }
  } catch (error) {
    console.error('[graph-file] error:', error);
    res.status(500).json({ error: error.message });
  }
};
