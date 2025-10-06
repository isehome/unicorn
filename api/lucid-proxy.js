/** 
 * Serverless function to proxy Lucid Chart API requests 
 * This keeps the API key secure on the backend 
 */

const LUCID_API_BASE_URL = 'https://api.lucid.co';
const LUCID_API_VERSION = '1';

export default async function handler(req, res) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests (after OPTIONS)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the API key from environment variable
  const apiKey = process.env.REACT_APP_LUCID_API_KEY;
  
  if (!apiKey) {
    console.error('REACT_APP_LUCID_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Get parameters from request body
  const {
    documentId,
    pageNumber,
    pageId,
    exportImage,
    action,
    crop,
    scale,
    format,
    dpi,
    embedOptions = {}
  } = req.body;
  
  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    // Handle specialized actions before default export flow
    if (action === 'metadata') {
      const metaUrl = `${LUCID_API_BASE_URL}/documents/${documentId}`;
      const metaResponse = await fetch(metaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': LUCID_API_VERSION,
          'Content-Type': 'application/json'
        }
      });

      if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        console.error('Lucid metadata error:', metaResponse.status, errorText);
        return res.status(metaResponse.status).json({
          error: 'Failed to fetch document metadata',
          status: metaResponse.status
        });
      }

      const metadata = await metaResponse.json();
      return res.status(200).json(metadata);
    }

    if (action === 'embedToken') {
      const tokenUrl = `${LUCID_API_BASE_URL}/embeds/token`;
      const tokenBody = {
        documentId,
        type: embedOptions.type || 'document',
        permissions: embedOptions.permissions || ['view'],
        expiresInSeconds: embedOptions.expiresInSeconds || 3600,
        pageId: embedOptions.pageId || pageId || null
      };

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': LUCID_API_VERSION,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tokenBody)
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Lucid embed token error:', tokenResponse.status, errorText);
        return res.status(tokenResponse.status).json({
          error: 'Failed to create embed token',
          status: tokenResponse.status
        });
      }

      const tokenData = await tokenResponse.json();
      return res.status(200).json(tokenData);
    }

    let url;
    let headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Lucid-Api-Version': LUCID_API_VERSION
    };
    let requestedMimeType = 'image/png';

    const determinePageId = async () => {
      if (pageId) return pageId;
      if (typeof pageNumber !== 'number') return null;

      const contentsUrl = `${LUCID_API_BASE_URL}/documents/${documentId}/contents`;
      const contentsResponse = await fetch(contentsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': LUCID_API_VERSION,
          'Content-Type': 'application/json'
        }
      });

      if (!contentsResponse.ok) {
        throw new Error('Failed to fetch document contents');
      }

      const docData = await contentsResponse.json();
      if (docData.pages && docData.pages[pageNumber]) {
        return docData.pages[pageNumber].id;
      }

      throw new Error(`Page ${pageNumber} not found in document`);
    };

    // FIXED: Use correct Lucid export endpoint with page parameter
    if (exportImage || action === 'exportImage') {
      const actualPageId = await determinePageId();
      if (!actualPageId) {
        throw new Error('Could not determine page ID');
      }

      const imageUrl = new URL(`${LUCID_API_BASE_URL}/documents/${documentId}`);
      imageUrl.searchParams.set('page', actualPageId);

      if (scale) {
        imageUrl.searchParams.set('scale', scale);
      }

      if (dpi) {
        imageUrl.searchParams.set('dpi', dpi);
      }

      if (crop && typeof crop === 'object') {
        const { x, y, width, height } = crop;
        if ([x, y, width, height].every((value) => value !== undefined && value !== null)) {
          imageUrl.searchParams.set('crop', `${x},${y},${width},${height}`);
        }
      }

      if (format) {
        requestedMimeType = `image/${format}`;
      }

      if (dpi && scale) {
        console.warn('Both dpi and scale provided; Lucid API will honor one depending on precedence.');
      }

      headers['Accept'] = requestedMimeType;

      url = imageUrl.toString();
    } else {
      // Default to getting document contents
      url = `${LUCID_API_BASE_URL}/documents/${documentId}/contents`;
      headers['Content-Type'] = 'application/json';
    }

    console.log('Calling Lucid API:', url);

    // Make request to Lucid API
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lucid API error:', response.status, errorText);
      
      // Return appropriate error messages
      switch (response.status) {
        case 401:
          return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
        case 403:
          return res.status(403).json({ error: 'Forbidden: No access to this document' });
        case 404:
          return res.status(404).json({ error: 'Document or page not found' });
        case 429:
          return res.status(429).json({ error: 'Rate limit exceeded' });
        default:
          return res.status(response.status).json({ 
            error: `API Error: ${response.statusText}`
          });
      }
    }

    // Handle image export differently
    if (exportImage || action === 'exportImage') {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      res.status(200).json({ 
        image: `data:${requestedMimeType};base64,${base64}`,
        pageNumber: pageNumber 
      });
    } else {
      // Return the document data
      const data = await response.json();
      res.status(200).json(data);
    }
    
  } catch (error) {
    console.error('Error fetching from Lucid API:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document',
      message: error.message 
    });
  }
}
