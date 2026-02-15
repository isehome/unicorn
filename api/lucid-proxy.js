/** 
 * Serverless function to proxy Lucid Chart API requests 
 * This keeps the API key secure on the backend 
 */

const { requireAuth } = require('./_authMiddleware');

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

  // Auth required for proxy endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

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
    embedOptions = {},
    options = {}
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

    // Handle image export using the CORRECT endpoint from documentation
    if (exportImage || action === 'exportImage') {
      const actualPageId = await determinePageId();
      if (!actualPageId) {
        throw new Error('Could not determine page ID');
      }

      // Use the correct GET endpoint with Accept header
      const exportUrl = `${LUCID_API_BASE_URL}/documents/${documentId}?pageId=${actualPageId}`;
      
      // Format the Accept header - MUST include DPI or it returns 400
      const imageFormat = format || 'png';
      const imageDpi = dpi || 72; // Default to low DPI for smaller files
      const acceptHeader = `image/${imageFormat};dpi=${imageDpi}`;
      
      console.log('Exporting from:', exportUrl);
      console.log('Accept header:', acceptHeader);
      
      const exportResponse = await fetch(exportUrl, {
        method: 'GET', // GET not POST!
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': LUCID_API_VERSION,
          'Accept': acceptHeader // This specifies the export format
        }
      });

      if (!exportResponse.ok) {
        const errorText = await exportResponse.text();
        console.error('Export error:', exportResponse.status, errorText);
        
        switch (exportResponse.status) {
          case 400:
            return res.status(400).json({ 
              error: 'Bad request - try adding DPI to Accept header (e.g., image/png;dpi=72)',
              details: errorText
            });
          case 401:
            return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
          case 403:
            return res.status(403).json({ error: 'Forbidden: No access to this document' });
          case 404:
            return res.status(404).json({ error: 'Document or page not found' });
          case 429:
            return res.status(429).json({ error: 'Rate limit exceeded (max 75 requests per 5 seconds)' });
          default:
            return res.status(exportResponse.status).json({ 
              error: `API Error: ${exportResponse.statusText}`
            });
        }
      }

      // Success - convert image to base64 and return
      const buffer = await exportResponse.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      console.log('Export successful! Image size:', buffer.byteLength, 'bytes');
      
      return res.status(200).json({ 
        image: `data:image/${imageFormat};base64,${base64}`,
        pageNumber: pageNumber,
        size: buffer.byteLength
      });
    } else {
      // Default to getting document contents
      const {
        useBeta = true,
        includeData = true,
        includeStyles = false,
        includeProperties = false,
        betaFeature = null
      } = options || {};

      const searchParams = new URLSearchParams();
      if (includeData) searchParams.set('includeData', 'true');
      if (includeStyles) searchParams.set('includeStyles', 'true');
      if (includeProperties) searchParams.set('includeProperties', 'true');
      const query = searchParams.toString();

      const basePath = `/documents/${documentId}/contents`;
      const url = `${LUCID_API_BASE_URL}${basePath}${query ? `?${query}` : ''}`;
      headers['Content-Type'] = 'application/json';
      if (useBeta && betaFeature) {
        headers['Lucid-Beta-Feature'] = betaFeature;
      }
      
      console.log('Calling Lucid API:', url);
      console.log('With headers:', JSON.stringify(headers, null, 2));

      // Make request to Lucid API
      const response = await fetch(url, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Lucid API error:', response.status, errorText);
        console.error('Failed URL was:', url);
        
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
