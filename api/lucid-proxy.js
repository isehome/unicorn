/** 
 * Serverless function to proxy Lucid Chart API requests 
 * This keeps the API key secure on the backend 
 */

const LUCID_API_BASE_URL = 'https://api.lucid.co';
const LUCID_API_VERSION = '1';

export default async function handler(req, res) {
  // Only allow POST requests
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
  const { documentId, pageNumber, pageId, exportImage } = req.body;
  
  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    let url;
    let headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Lucid-Api-Version': LUCID_API_VERSION
    };
    
    // FIXED: Use actual page ID from Lucid document
    if (exportImage) {
      // First, fetch document contents to get page info if we don't have pageId
      if (!pageId && typeof pageNumber === 'number') {
        const contentsUrl = `${LUCID_API_BASE_URL}/documents/${documentId}/contents`;
        const contentsResponse = await fetch(contentsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Lucid-Api-Version': LUCID_API_VERSION,
            'Content-Type': 'application/json'
          }
        });
        
        if (contentsResponse.ok) {
          const docData = await contentsResponse.json();
          if (docData.pages && docData.pages[pageNumber]) {
            // Use the actual page ID from the document
            const actualPageId = docData.pages[pageNumber].id;
            url = `${LUCID_API_BASE_URL}/documents/${documentId}/pages/${actualPageId}/export?format=png`;
          } else {
            throw new Error(`Page ${pageNumber} not found in document`);
          }
        } else {
          throw new Error('Failed to fetch document contents for page lookup');
        }
      } else if (pageId) {
        // Use the provided page ID directly
        url = `${LUCID_API_BASE_URL}/documents/${documentId}/pages/${pageId}/export?format=png`;
      } else {
        throw new Error('Either pageId or pageNumber must be provided for image export');
      }
      
      headers['Accept'] = 'image/png';
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
    if (exportImage) {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      res.status(200).json({ 
        image: `data:image/png;base64,${base64}`,
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
