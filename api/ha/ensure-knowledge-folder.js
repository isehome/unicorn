/**
 * api/ha/ensure-knowledge-folder.js
 * Ensures the "Home Assistant" folder exists in the SharePoint Knowledge library
 * POST /api/ha/ensure-knowledge-folder
 *
 * This creates the folder structure for HA documentation:
 * sites/Unicorn/Knowledge/Home Assistant/
 */

const { requireAuth } = require('../_authMiddleware');
const { rateLimit } = require('../_rateLimiter');

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// Knowledge library location
const KNOWLEDGE_SITE = 'isehome.sharepoint.com';
const KNOWLEDGE_SITE_PATH = '/sites/Unicorn';
const KNOWLEDGE_LIBRARY = 'Knowledge';

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

  // Return null for 404 (folder doesn't exist yet)
  if (resp.status === 404) {
    return null;
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph ${url} ${resp.status}: ${text}`);
  }

  return resp.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!rateLimit(req, res)) return;

  try {
    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'Server missing Azure credentials' });
    }

    const token = await getAppToken();

    // Get the site ID
    console.log('[HA Knowledge] Getting site ID for:', KNOWLEDGE_SITE_PATH);
    const site = await graph(token, `/sites/${KNOWLEDGE_SITE}:${KNOWLEDGE_SITE_PATH}`);

    if (!site) {
      return res.status(404).json({ error: 'Knowledge site not found' });
    }

    const siteId = site.id;
    console.log('[HA Knowledge] Site ID:', siteId);

    // Get the Knowledge library drive
    const drives = await graph(token, `/sites/${siteId}/drives`);
    const knowledgeDrive = drives.value.find(d =>
      d.name.toLowerCase() === KNOWLEDGE_LIBRARY.toLowerCase()
    );

    if (!knowledgeDrive) {
      return res.status(404).json({ error: `"${KNOWLEDGE_LIBRARY}" library not found in site` });
    }

    const driveId = knowledgeDrive.id;
    console.log('[HA Knowledge] Drive ID:', driveId);

    // Check if "Home Assistant" folder exists
    const folderName = 'Home Assistant';
    const existingFolder = await graph(token, `/drives/${driveId}/root:/${folderName}`);

    if (existingFolder) {
      console.log('[HA Knowledge] Folder already exists:', existingFolder.webUrl);
      return res.json({
        created: false,
        exists: true,
        folder: {
          id: existingFolder.id,
          name: existingFolder.name,
          webUrl: existingFolder.webUrl
        }
      });
    }

    // Create the folder
    console.log('[HA Knowledge] Creating folder:', folderName);
    const newFolder = await graph(token, `/drives/${driveId}/root/children`, {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    });

    console.log('[HA Knowledge] Folder created:', newFolder.webUrl);

    return res.json({
      created: true,
      exists: true,
      folder: {
        id: newFolder.id,
        name: newFolder.name,
        webUrl: newFolder.webUrl
      }
    });

  } catch (error) {
    console.error('[HA Knowledge] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
