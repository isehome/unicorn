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
  const { documentId, pageNumber, exportImage } = req.body;
  
  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    let url = `${LUCID_API_BASE_URL}/documents/${documentId}`;
    let headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Lucid-Api-Version': LUCID_API_VERSION,
      'Content-Type': 'application/json'
    };
    
    // If exporting image, adjust URL and headers
    if (exportImage && typeof pageNumber === 'number') {
      url += `?pageNumber=${pageNumber}`;
      headers['Accept'] = 'image/png';
    } else {
      // Default to getting document contents
      url += '/contents';
    }
    
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
          return res.status(404).json({ error: 'Document not found' });
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
