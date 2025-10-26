// Vercel serverless function: Initialize SharePoint folder structure
// Creates standard subfolders (Photos, File, Procurement, etc.) if they don't exist
// Input: JSON { rootFolderUrl, subfolders: ['Photos', 'File', ...] }
// Returns: { rootDriveId, rootFolderId, subfolders: { Photos: {...}, File: {...}, ... } }

const TENANT = process.env.AZURE_TENANT_ID
const CLIENT_ID = process.env.AZURE_CLIENT_ID
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET

function b64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function getAppToken() {
  const body = new URLSearchParams()
  body.set('client_id', CLIENT_ID)
  body.set('client_secret', CLIENT_SECRET)
  body.set('grant_type', 'client_credentials')
  body.set('scope', 'https://graph.microsoft.com/.default')

  const resp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token error: ${resp.status} ${text}`)
  }
  const json = await resp.json()
  return json.access_token
}

async function graph(token, url, options = {}) {
  const resp = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Graph ${url} ${resp.status}: ${text}`)
  }
  return resp.json()
}

async function ensureFolder(token, driveId, parentId, folderName) {
  // Check if folder exists (case-insensitive search)
  const list = await graph(token, `/drives/${driveId}/items/${parentId}/children?$select=id,name,webUrl`)
  const found = (list.value || []).find(ch =>
    ch.name.toLowerCase() === folderName.toLowerCase()
  )

  if (found) {
    console.log(`Folder "${folderName}" already exists, using existing folder (ID: ${found.id})`)
    return found
  }

  // Folder doesn't exist - create it
  // Use 'fail' instead of 'rename' to prevent accidental duplicates
  console.log(`Creating new folder: ${folderName}`)
  const created = await graph(token, `/drives/${driveId}/items/${parentId}/children`, {
    method: 'POST',
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail'  // Will error if folder exists (safer than 'rename')
    })
  })

  return created
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(200).end()
    return
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { rootFolderUrl, subfolders } = req.body || {}

    if (!rootFolderUrl || !subfolders || !Array.isArray(subfolders)) {
      res.status(400).json({ error: 'Missing required fields: rootFolderUrl, subfolders' })
      return
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      res.status(500).json({ error: 'Server missing Azure credentials' })
      return
    }

    const token = await getAppToken()

    // Resolve the root folder URL to drive/item
    const encoded = 'u!' + b64Url(rootFolderUrl)
    const driveItem = await graph(token, `/shares/${encoded}/driveItem?$select=id,webUrl,parentReference`)
    const driveId = driveItem.parentReference.driveId
    const rootFolderId = driveItem.id

    console.log(`Root folder resolved: driveId=${driveId}, folderId=${rootFolderId}`)

    // Ensure each subfolder exists
    const subfolderResults = {}

    for (const folderName of subfolders) {
      try {
        console.log(`Ensuring subfolder exists: ${folderName}`)
        const folder = await ensureFolder(token, driveId, rootFolderId, folderName)

        subfolderResults[folderName] = {
          driveId: driveId,
          itemId: folder.id,
          webUrl: folder.webUrl,
          name: folder.name
        }

        console.log(`Subfolder ready: ${folderName} (${folder.id})`)
      } catch (error) {
        console.error(`Failed to create subfolder ${folderName}:`, error.message)
        // Continue with other folders even if one fails
        subfolderResults[folderName] = {
          error: error.message
        }
      }
    }

    res.status(200).json({
      rootDriveId: driveId,
      rootFolderId: rootFolderId,
      rootUrl: driveItem.webUrl,
      subfolders: subfolderResults
    })
  } catch (e) {
    console.error('Folder initialization error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
