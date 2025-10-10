/**
 * Serverless function to proxy Ubiquity API requests
 * Keeps the API key secure on the backend
 */

// TODO: Replace with actual Ubiquity API base URL
const UBIQUITY_API_BASE_URL = 'https://api.ubiquity.example.com';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment
  const apiKey = process.env.REACT_APP_UBIQUITY_API_KEY;
  
  if (!apiKey) {
    console.error('REACT_APP_UBIQUITY_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Get parameters from request
  const { url, endpoint, action } = req.method === 'POST' ? req.body : req.query;

  if (!url && !endpoint) {
    return res.status(400).json({ error: 'URL or endpoint is required' });
  }

  try {
    // Build the full URL
    const targetUrl = url || `${UBIQUITY_API_BASE_URL}/${endpoint}`;
    
    console.log('Calling Ubiquity API:', targetUrl);

    // Make request to Ubiquity API
    // TODO: Adjust headers based on actual API requirements
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ubiquity API error:', response.status, errorText);
      
      switch (response.status) {
        case 401:
          return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
        case 403:
          return res.status(403).json({ error: 'Forbidden: No access to this resource' });
        case 404:
          return res.status(404).json({ error: 'Resource not found' });
        case 429:
          return res.status(429).json({ error: 'Rate limit exceeded' });
        default:
          return res.status(response.status).json({
            error: `API Error: ${response.statusText}`,
            details: errorText
          });
      }
    }

    // Return the data
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching from Ubiquity API:', error);
    return res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message
    });
  }
}
