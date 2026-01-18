/**
 * api/ha/upload-backup.js
 * Upload Home Assistant backup to the project's SharePoint folder
 * POST /api/ha/upload-backup
 *
 * Body: multipart/form-data with:
 *   - file: The backup file (.tar or .tar.gz)
 *   - project_id: Project UUID
 */

const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs');

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

// Parse multipart form data
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 500 * 1024 * 1024, // 500MB max for HA backups
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'Server missing Azure credentials' });
    }

    // Parse the multipart form
    const { fields, files } = await parseForm(req);

    const projectId = fields.project_id?.[0] || fields.project_id;
    const file = files.file?.[0] || files.file;

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('[HA Backup] Uploading backup for project:', projectId);
    console.log('[HA Backup] File:', file.originalFilename, 'Size:', file.size);

    // Get the project's client folder URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, client_folder_url')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.client_folder_url) {
      return res.status(400).json({ error: 'Project does not have a SharePoint folder configured. Please set the Client Folder URL in project settings.' });
    }

    const token = await getAppToken();

    // Resolve the root folder to get drive info
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
      return res.status(400).json({ error: `Could not access SharePoint folder: ${err.message}` });
    }

    const driveId = driveItem.parentReference.driveId;
    const rootFolderId = driveItem.id;

    // Ensure Home Assistant folder exists
    const haFolderName = 'Home Assistant';
    let haFolderId;

    // Check if folder exists
    const listResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${rootFolderId}/children?$filter=name eq '${haFolderName}'`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (listResp.ok) {
      const list = await listResp.json();
      if (list.value && list.value.length > 0) {
        haFolderId = list.value[0].id;
        console.log('[HA Backup] Found existing Home Assistant folder:', haFolderId);
      }
    }

    // Create folder if it doesn't exist
    if (!haFolderId) {
      console.log('[HA Backup] Creating Home Assistant folder');
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
        throw new Error(`Failed to create folder: ${text}`);
      }

      const newFolder = await createResp.json();
      haFolderId = newFolder.id;
      console.log('[HA Backup] Created folder:', haFolderId);
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const originalName = file.originalFilename || 'backup.tar';
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '.tar';
    const fileName = `ha_backup_${timestamp}${ext}`;

    // Read the file
    const fileBuffer = fs.readFileSync(file.filepath);

    // Upload to SharePoint using upload session for large files
    if (fileBuffer.length > 4 * 1024 * 1024) {
      // Large file - use upload session
      console.log('[HA Backup] Using upload session for large file');

      const sessionResp = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${haFolderId}:/${fileName}:/createUploadSession`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            item: {
              '@microsoft.graph.conflictBehavior': 'rename'
            }
          })
        }
      );

      if (!sessionResp.ok) {
        const text = await sessionResp.text();
        throw new Error(`Failed to create upload session: ${text}`);
      }

      const session = await sessionResp.json();
      const uploadUrl = session.uploadUrl;

      // Upload in chunks
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      let offset = 0;

      while (offset < fileBuffer.length) {
        const chunk = fileBuffer.slice(offset, Math.min(offset + chunkSize, fileBuffer.length));
        const end = offset + chunk.length - 1;

        const chunkResp = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': chunk.length.toString(),
            'Content-Range': `bytes ${offset}-${end}/${fileBuffer.length}`
          },
          body: chunk
        });

        if (!chunkResp.ok && chunkResp.status !== 202) {
          const text = await chunkResp.text();
          throw new Error(`Chunk upload failed: ${text}`);
        }

        offset += chunkSize;
        console.log(`[HA Backup] Uploaded ${Math.min(offset, fileBuffer.length)}/${fileBuffer.length} bytes`);
      }

      console.log('[HA Backup] Large file upload complete');
    } else {
      // Small file - direct upload
      console.log('[HA Backup] Direct upload for small file');

      const uploadResp = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${haFolderId}:/${fileName}:/content`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream'
          },
          body: fileBuffer
        }
      );

      if (!uploadResp.ok) {
        const text = await uploadResp.text();
        throw new Error(`Upload failed: ${text}`);
      }
    }

    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (e) {
      console.warn('[HA Backup] Could not delete temp file:', e.message);
    }

    // Get the folder URL for the response
    const folderUrl = `${rootUrl}/Home%20Assistant`;

    console.log('[HA Backup] Upload complete:', fileName);

    return res.json({
      success: true,
      fileName,
      folderUrl,
      message: `Backup uploaded successfully: ${fileName}`
    });

  } catch (error) {
    console.error('[HA Backup] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Disable body parsing for multipart
module.exports.config = {
  api: {
    bodyParser: false
  }
};
