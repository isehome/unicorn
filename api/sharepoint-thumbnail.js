// Vercel serverless function: Get SharePoint thumbnail via Microsoft Graph API
// Input: Query params { driveId, itemId, size }
// Auth: App-only (client credentials)

const TENANT = process.env.AZURE_TENANT_ID
const CLIENT_ID = process.env.AZURE_CLIENT_ID
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET

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

async function getThumbnail(token, driveId, itemId, size = 'medium') {
  // Microsoft Graph thumbnail sizes:
  // Default sizes (square, cropped): small (48x48), medium (176x176), large (800x800)
  // Custom sizes preserve aspect ratio: c{width}x{height} or c{width}x0 for auto-height
  // Using custom sizes to preserve photo aspect ratios
  // 'full' = download the actual file content (not a thumbnail)

  if (size === 'full') {
    // Get the full resolution file content
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      redirect: 'follow' // Graph API redirects to the actual file
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Full file fetch failed: ${resp.status} ${text}`)
    }

    return resp
  }

  // Standard Graph API thumbnail sizes (these work reliably)
  // Note: These are square crops centered on the image
  const sizeMap = {
    small: 'small',   // 96x96px
    medium: 'medium', // 176x176px
    large: 'large'    // 800x800px
  }
  const thumbnailSize = sizeMap[size] || 'medium'

  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/thumbnails/0/${thumbnailSize}/content`

  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Thumbnail fetch failed: ${resp.status} ${text}`)
  }

  return resp
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(200).end()
    return
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { driveId, itemId, size } = req.query
    
    if (!driveId || !itemId) {
      res.status(400).json({ error: 'Missing required parameters: driveId and itemId' })
      return
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      res.status(500).json({ error: 'Server missing Azure credentials' })
      return
    }

    const token = await getAppToken()
    const thumbnailResponse = await getThumbnail(token, driveId, itemId, size)
    
    // Stream the image data back to the client
    const imageBuffer = await thumbnailResponse.arrayBuffer()
    const contentType = thumbnailResponse.headers.get('content-type') || 'image/jpeg'
    
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
    res.status(200).send(Buffer.from(imageBuffer))
  } catch (e) {
    console.error('Thumbnail fetch error:', e)
    res.status(500).json({ error: e.message })
  }
}
