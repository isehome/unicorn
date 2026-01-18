/**
 * api/ha/ensure-client-folder.js
 * Ensures the "Home Assistant" folder exists in the project's SharePoint client folder
 * POST /api/ha/ensure-client-folder
 * Body: { project_id: "uuid" }
 *
 * This creates the folder for storing HA backups and configs:
 * {client_folder}/Home Assistant/
 */

const { createClient } = require('@supabase/supabase-js');

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function b64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { project_id } = req.body || {};

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'Server missing Azure credentials' });
    }

    // Get the project's client folder URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, client_folder_url')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.client_folder_url) {
      return res.json({
        created: false,
        exists: false,
        message: 'No client folder URL configured for this project. Set it in project settings first.'
      });
    }

    const token = await getAppToken();

    // Resolve the root folder to get drive info
    const rootUrl = project.client_folder_url.trim().replace(/\/+$/, '');
    const encoded = 'u!' + b64Url(rootUrl);

    console.log('[HA Client Folder] Resolving root folder:', rootUrl);

    let driveItem;
    try {
      const resp = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,parentReference,webUrl`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to resolve folder: ${resp.status} - ${text}`);
      }
      driveItem = await resp.json();
    } catch (err) {
      console.error('[HA Client Folder] Could not resolve root folder:', err.message);
      return res.json({
        created: false,
        exists: false,
        error: `Could not access SharePoint folder: ${err.message}`
      });
    }

    const driveId = driveItem.parentReference.driveId;
    const rootFolderId = driveItem.id;

    console.log('[HA Client Folder] Drive:', driveId, 'Root folder:', rootFolderId);

    // Check if "Home Assistant" folder already exists
    const haFolderName = 'Home Assistant';
    const listResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootFolderId}/children?$filter=name eq '${haFolderName}'&$select=id,name,webUrl`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (listResp.ok) {
      const list = await listResp.json();
      if (list.value && list.value.length > 0) {
        console.log('[HA Client Folder] Folder already exists:', list.value[0].webUrl);
        return res.json({
          created: false,
          exists: true,
          folder: {
            id: list.value[0].id,
            name: list.value[0].name,
            webUrl: list.value[0].webUrl
          }
        });
      }
    }

    // Create the folder
    console.log('[HA Client Folder] Creating folder:', haFolderName);
    const createResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootFolderId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: haFolderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        })
      }
    );

    if (!createResp.ok) {
      const text = await createResp.text();
      // Check if it failed because folder already exists
      if (createResp.status === 409 || text.includes('nameAlreadyExists')) {
        console.log('[HA Client Folder] Folder already exists (conflict)');
        return res.json({
          created: false,
          exists: true,
          message: 'Folder already exists'
        });
      }
      throw new Error(`Failed to create folder: ${text}`);
    }

    const newFolder = await createResp.json();
    console.log('[HA Client Folder] Created folder:', newFolder.webUrl);

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
    console.error('[HA Client Folder] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
