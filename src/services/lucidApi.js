/**
 * Lucid Chart API Service
 * 
 * Provides methods to interact with the Lucid Chart API for document retrieval
 * and shape data extraction for wire drop integration.
 */

const LUCID_API_BASE_URL = 'https://api.lucid.co';
const LUCID_API_VERSION = '1';

/**
 * Fetches document contents from Lucid Chart API
 * In production: Uses secure proxy endpoint
 * In development: Calls API directly with env variable
 * @param {string} documentId - The Lucid document ID
 * @returns {Promise<Object>} Document contents with pages, shapes, lines, and groups
 * @throws {Error} If the API request fails
 */
export const fetchDocumentContents = async (documentId) => {
  if (!documentId) {
    throw new Error('Document ID is required');
  }

  const apiKey = process.env.REACT_APP_LUCID_API_KEY;
  const isDevelopment = process.env.NODE_ENV === 'development';

  try {
    // In development, call Lucid API directly; in production, use proxy
    if (isDevelopment && apiKey) {
      // Direct API call for local development
      const response = await fetch(
        `${LUCID_API_BASE_URL}/documents/${documentId}/contents`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Lucid-Api-Version': LUCID_API_VERSION,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        switch (response.status) {
          case 401:
            throw new Error('Unauthorized: Invalid API key');
          case 403:
            throw new Error('Forbidden: No access to this document');
          case 404:
            throw new Error('Document not found');
          case 429:
            throw new Error('Rate limit exceeded');
          default:
            throw new Error(`API Error (${response.status}): ${response.statusText}`);
        }
      }

      return await response.json();
    } else {
      // Use secure proxy for production
      const response = await fetch('/api/lucid-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API Error (${response.status})`);
      }

      return await response.json();
    }
  } catch (error) {
    // Re-throw errors with additional context
    if (error.message.includes('Failed to fetch')) {
      throw new Error('Network error: Unable to connect to Lucid API');
    }
    throw error;
  }
};

/**
 * Extracts shape data from document pages
 * @param {Object} documentData - The full document data from API
 * @returns {Array} Array of shape objects with metadata
 */
export const extractShapes = (documentData) => {
  if (!documentData || !documentData.pages) {
    return [];
  }

  const shapes = [];
  
  documentData.pages.forEach(page => {
    // Handle both old and new API structure
    const shapesList = page.shapes || page.items?.shapes || [];
    
    if (Array.isArray(shapesList)) {
      shapesList.forEach(shape => {
        // Extract text from textAreas if present
        let text = '';
        if (shape.textAreas && Array.isArray(shape.textAreas)) {
          text = shape.textAreas
            .map(ta => ta.text)
            .filter(Boolean)
            .join(' ');
        } else if (shape.text) {
          text = shape.text;
        }
        
        // Convert customData array to object if needed
        let customDataObj = {};
        if (Array.isArray(shape.customData)) {
          shape.customData.forEach(item => {
            if (item.key && item.value !== undefined) {
              customDataObj[item.key] = item.value;
            }
          });
        } else if (shape.customData && typeof shape.customData === 'object') {
          customDataObj = shape.customData;
        }
        
        shapes.push({
          id: shape.id,
          pageId: page.id,
          pageTitle: page.title,
          class: shape.class,
          text: text,
          textAreas: shape.textAreas || [],
          boundingBox: shape.boundingBox || {},
          customData: customDataObj,
          rawCustomData: shape.customData, // Keep original format for reference
          // Additional metadata for wire drop matching
          position: {
            x: shape.boundingBox?.x || 0,
            y: shape.boundingBox?.y || 0
          },
          size: {
            width: shape.boundingBox?.w || 0,
            height: shape.boundingBox?.h || 0
          }
        });
      });
    }
  });

  return shapes;
};

/**
 * Extracts document ID from a Lucid Chart URL
 * @param {string} url - The Lucid Chart document URL
 * @returns {string|null} The document ID or null if not found
 */
export const extractDocumentIdFromUrl = (url) => {
  if (!url) return null;
  
  // Match patterns like:
  // https://lucid.app/lucidchart/DOC-ID-HERE/edit
  // https://lucid.app/lucidchart/DOC-ID-HERE/view
  const match = url.match(/lucidchart\/([a-zA-Z0-9-_]+)\/(edit|view)/);
  return match ? match[1] : null;
};

/**
 * Validates API key format (basic check)
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} True if format appears valid
 */
export const validateApiKeyFormat = (apiKey) => {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Basic validation: should be a non-empty string with reasonable length
  return apiKey.length >= 20 && apiKey.length <= 200;
};

/**
 * Export a specific page of a Lucid document as PNG image
 * In development: Makes direct API calls (may fail due to CORS)
 * In production: Uses the proxy endpoint
 * @param {string} documentId - Lucid document ID
 * @param {number} pageNumber - Page index (0-based)
 * @returns {Promise<string>} - Base64 data URL of the image
 */
export const exportDocumentPage = async (documentId, pageNumber) => {
  if (!documentId) {
    throw new Error('Document ID is required');
  }

  const apiKey = process.env.REACT_APP_LUCID_API_KEY;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In local development, use CORS proxy
  if (isDevelopment) {
    if (!apiKey) {
      console.error('API key not configured. Please set REACT_APP_LUCID_API_KEY in .env.local');
      // Return a placeholder image
      return createPlaceholderImage(`Page ${pageNumber + 1}`);
    }

    // In development, just return placeholder since CORS will block direct calls
    // Real images will load in production via the proxy
    return createPlaceholderImage(`Page ${pageNumber + 1}`);
  } else {
    // In production, use the proxy endpoint
    try {
      const response = await fetch('/api/lucid-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          documentId,
          pageNumber,
          exportImage: true
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Export failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.image) {
        return data.image;
      } else {
        throw new Error('No image data received from proxy');
      }
    } catch (error) {
      console.error(`Failed to export page ${pageNumber}:`, error);
      return createPlaceholderImage(`Page ${pageNumber + 1}`);
    }
  }
};

/**
 * Create a placeholder image as base64
 * @param {string} title - Page title
 * @returns {string} - Base64 data URL
 */
const createPlaceholderImage = (title) => {
  try {
    if (typeof document === 'undefined') {
      // Return a simple data URL if not in browser
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjNmI3MjgwIj5MdWNpZCBDaGFydDwvdGV4dD48L3N2Zz4=';
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    
    // Icon
    ctx.fillStyle = '#6b7280';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📄', canvas.width / 2, canvas.height / 2 - 30);
    
    // Title
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 30);
    
    // Info text
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Enable CORS or deploy to see image', canvas.width / 2, canvas.height / 2 + 60);
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to create placeholder:', error);
    return '';
  }
};

/**
 * Calculate bounding box that contains all shapes on a page
 * @param {Array} shapes - Array of shape objects with boundingBox
 * @returns {Object} - {x, y, width, height} encompassing all shapes
 */
export const calculateContentBoundingBox = (shapes) => {
  if (!shapes || shapes.length === 0) {
    return { x: 0, y: 0, width: 1000, height: 1000 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  shapes.forEach(shape => {
    if (shape.boundingBox) {
      const { x, y, w, h } = shape.boundingBox;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  });
  
  // If no valid bounding boxes found, return default
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { x: 0, y: 0, width: 1000, height: 1000 };
  }
  
  // Add 5% padding
  const padding = Math.max((maxX - minX) * 0.05, (maxY - minY) * 0.05);
  
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + (padding * 2),
    height: maxY - minY + (padding * 2)
  };
};
