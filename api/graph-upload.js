// Vercel serverless function: Uploads a file to OneDrive/SharePoint using Microsoft Graph
// Input: JSON { rootUrl, subPath, filename, fileBase64, contentType }
// Auth: App-only (client credentials). Set env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET

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

async function ensureFolderPath(token, driveId, parentId, parts) {
  let currentId = parentId
  for (const name of parts) {
    if (!name) continue
    const list = await graph(token, `/drives/${driveId}/items/${currentId}/children?$select=id,name`)
    const found = (list.value || []).find(ch => ch.name === name)
    if (found) {
      currentId = found.id
      continue
    }
    const created = await graph(token, `/drives/${driveId}/items/${currentId}/children`, {
      method: 'POST',
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    })
    currentId = created.id
  }
  return currentId
}

async function uploadBufferToItem(token, driveId, parentId, filename, buffer, contentType) {
  // Upload session for reliability
  const session = await graph(token, `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/createUploadSession`, {
    method: 'POST',
    body: JSON.stringify({ '@microsoft.graph.conflictBehavior': 'replace' })
  })
  const resp = await fetch(session.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': buffer.length.toString(),
      'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
      'Content-Type': contentType || 'application/octet-stream'
    },
    body: buffer
  })
  if (!resp.ok && resp.status !== 201 && resp.status !== 200) {
    const text = await resp.text()
    throw new Error(`Upload failed: ${resp.status} ${text}`)
  }
  const item = await resp.json()
  return item
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
    const { rootUrl, subPath, filename, fileBase64, contentType } = req.body || {}
    if (!rootUrl || !subPath || !filename || !fileBase64) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      res.status(500).json({ error: 'Server missing Azure credentials' })
      return
    }

    const token = await getAppToken()

    // Resolve the root URL to drive/item
    const encoded = 'u!' + b64Url(rootUrl)
    const driveItem = await graph(token, `/shares/${encoded}/driveItem?$select=id,webUrl,parentReference`)
    const driveId = driveItem.parentReference.driveId
    const parentId = driveItem.id

    // Ensure subfolders exist
    const finalParentId = await ensureFolderPath(token, driveId, parentId, subPath.split('/'))

    // Upload
    const buffer = Buffer.from(fileBase64, 'base64')
    const item = await uploadBufferToItem(token, driveId, finalParentId, filename, buffer, contentType)

    // Create an embed link (permanent, works in img tags without auth)
    try {
      const embedLink = await graph(token, `/drives/${driveId}/items/${item.id}/createLink`, {
        method: 'POST',
        body: JSON.stringify({ 
          type: 'embed',
          scope: 'organization'
        })
      })
      
      // The embed link has a webUrl that can be used in img src
      // Format: https://{tenant}.sharepoint.com/:i:/g/{path}
      const embedUrl = embedLink.link && embedLink.link.webUrl ? embedLink.link.webUrl : item.webUrl
      
      res.status(200).json({ url: embedUrl })
    } catch (linkError) {
      // Fallback to webUrl if embed link creation fails
      console.error('Failed to create embed link:', linkError.message)
      res.status(200).json({ url: item.webUrl })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
