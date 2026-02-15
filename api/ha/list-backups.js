/**
 * api/ha/list-backups.js
 * List Home Assistant backups in the project's SharePoint folder
 * GET /api/ha/list-backups?project_id=xxx
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../_authMiddleware');
const { rateLimit } = require('../_rateLimiter');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!rateLimit(req, res)) return;

  try {
    const { project_id } = req.query;

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
        backups: [],
        folderConfigured: false,
        message: 'No SharePoint folder configured for this project'
      });
    }

    const token = await getAppToken();

    // Resolve the root folder
    const rootUrl = project.client_folder_url.trim().replace(/\/+$/, '');
    const encoded = 'u!' + b64Url(rootUrl);

    let driveItem;
    try {
      const resp = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem?$select=id,parentReference`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error(`Failed to resolve folder: ${resp.status}`);
      driveItem = await resp.json();
    } catch (err) {
      return res.json({
        backups: [],
        folderConfigured: true,
        folderAccessible: false,
        message: `Could not access SharePoint folder: ${err.message}`
      });
    }

    const driveId = driveItem.parentReference.driveId;
    const rootFolderId = driveItem.id;

    // Check if Home Assistant folder exists
    const haFolderName = 'Home Assistant';
    const listResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootFolderId}/children?$filter=name eq '${haFolderName}'`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!listResp.ok) {
      return res.json({
        backups: [],
        folderConfigured: true,
        folderAccessible: true,
        haFolderExists: false,
        message: 'Home Assistant folder does not exist yet'
      });
    }

    const list = await listResp.json();
    if (!list.value || list.value.length === 0) {
      return res.json({
        backups: [],
        folderConfigured: true,
        folderAccessible: true,
        haFolderExists: false,
        message: 'Home Assistant folder does not exist yet'
      });
    }

    const haFolderId = list.value[0].id;
    const haFolderUrl = list.value[0].webUrl;

    // List files in Home Assistant folder
    const filesResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${haFolderId}/children?$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl&$orderby=lastModifiedDateTime desc`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!filesResp.ok) {
      return res.json({
        backups: [],
        folderConfigured: true,
        folderAccessible: true,
        haFolderExists: true,
        haFolderUrl,
        message: 'Could not list files in Home Assistant folder'
      });
    }

    const files = await filesResp.json();

    // Filter to only backup files (.tar, .tar.gz, .zip)
    const backups = (files.value || [])
      .filter(f => {
        const name = f.name.toLowerCase();
        return name.endsWith('.tar') || name.endsWith('.tar.gz') || name.endsWith('.tgz') || name.endsWith('.zip');
      })
      .map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        sizeFormatted: formatBytes(f.size),
        createdAt: f.createdDateTime,
        modifiedAt: f.lastModifiedDateTime,
        webUrl: f.webUrl
      }));

    return res.json({
      backups,
      folderConfigured: true,
      folderAccessible: true,
      haFolderExists: true,
      haFolderUrl,
      totalBackups: backups.length
    });

  } catch (error) {
    console.error('[HA List Backups] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
