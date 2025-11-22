// Vercel serverless function: Resolve SharePoint sharing link to direct folder URL
// Input: JSON { sharingUrl: "https://tenant.sharepoint.com/:f:/s/site/..." }
// Returns: { webUrl: "https://tenant.sharepoint.com/sites/site/Shared Documents/Folder" }

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
    const { sharingUrl } = req.body || {}

    if (!sharingUrl) {
      res.status(400).json({ error: 'Missing required field: sharingUrl' })
      return
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      res.status(500).json({ error: 'Server missing Azure credentials' })
      return
    }

    const token = await getAppToken()

    console.log(`Resolving sharing link: ${sharingUrl}`)

    // Use the shares endpoint to resolve the sharing link
    const encoded = 'u!' + b64Url(sharingUrl)
    const driveItem = await graph(token, `/shares/${encoded}/driveItem?$select=id,name,webUrl,parentReference`)

    console.log(`Resolved to: ${driveItem.webUrl}`)

    res.status(200).json({
      webUrl: driveItem.webUrl,
      name: driveItem.name,
      driveId: driveItem.parentReference.driveId,
      itemId: driveItem.id
    })
  } catch (e) {
    console.error('Sharing link resolution error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
