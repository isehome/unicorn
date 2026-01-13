// Vercel serverless function: Proxies SharePoint images with server-side authentication
// This allows images to be embedded without requiring user authentication

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

function b64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { url } = req.query
    
    if (!url) {
      res.status(400).json({ error: 'Missing url parameter' })
      return
    }

    if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
      res.status(500).json({ error: 'Server missing Azure credentials' })
      return
    }

    // Get token
    const token = await getAppToken()
    
    // Extract share token from SharePoint URL and get item
    let downloadUrl
    
    // Try to parse as SharePoint sharing URL
    // Matches formats like: https://tenant.sharepoint.com/:i:/g/... or :x:, :b:, :v:
    const shareUrlMatch = url.match(/https:\/\/[^\/]+\.sharepoint\.com\/(:i:|:x:|:b:|:v:)\/g\//)
    
    if (shareUrlMatch) {
      // This is a sharing URL, resolve it to get the actual file
      const encoded = 'u!' + b64Url(url)
      const itemResp = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!itemResp.ok) {
        throw new Error(`Failed to resolve share link: ${itemResp.status}`)
      }
      
      const item = await itemResp.json()
      downloadUrl = item['@microsoft.graph.downloadUrl']
    } else {
      // Assume it's already a download URL
      downloadUrl = url
    }

    if (!downloadUrl) {
      throw new Error('Could not determine download URL')
    }

    // Fetch the actual image with authentication
    const imageResp = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!imageResp.ok) {
      throw new Error(`Failed to fetch image: ${imageResp.status}`)
    }

    // Get the image buffer
    const imageBuffer = await imageResp.arrayBuffer()
    const buffer = Buffer.from(imageBuffer)

    // Set appropriate headers
    const contentType = imageResp.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
    
    // Send the image
    res.status(200).send(buffer)
  } catch (error) {
    console.error('Image proxy error:', error)
    res.status(500).json({ error: error.message })
  }
}
