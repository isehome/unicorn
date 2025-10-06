/**
 * Lucid Chart API Service
 * 
 * Provides methods to interact with the Lucid Chart API for document retrieval
 * and shape data extraction for wire drop integration.
 */

const LUCID_API_BASE_URL = 'https://api.lucid.co';
const LUCID_API_VERSION = '1';
const rawProxyBase = process.env.REACT_APP_LUCID_PROXY_URL || '';
const PROXY_BASE_URL = rawProxyBase.endsWith('/')
  ? rawProxyBase.slice(0, -1)
  : rawProxyBase;
const PROXY_ENDPOINT = PROXY_BASE_URL
  ? `${PROXY_BASE_URL}/api/lucid-proxy`
  : '/api/lucid-proxy';
const isDevelopment = process.env.NODE_ENV === 'development';

const shouldUseProxy = () => !!PROXY_BASE_URL || !isDevelopment;

const callLucidProxy = async (payload = {}) => {
  // The proxy endpoint can be either:
  // - A full URL (for local dev pointing to deployed proxy): https://unicorn-one.vercel.app/api/lucid-proxy
  // - A relative path (for production where API route is on same domain): /api/lucid-proxy
  if (!PROXY_ENDPOINT) {
    throw new Error('Lucid proxy endpoint not configured.');
  }

  const response = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (parseError) {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const message = data?.error || data?.message || rawText || `Proxy request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
};

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

  try {
    // Prefer proxy unless we're in local dev without an override
    if (!shouldUseProxy() && apiKey) {
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
      // Use secure proxy for production (and optionally for dev via override)
      return await callLucidProxy({ documentId });
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
 * Fetch lightweight document metadata (page count, titles, version)
 * @param {string} documentId - Lucid document ID
 * @returns {Promise<Object>} Metadata payload from Lucid
 */
export const fetchDocumentMetadata = async (documentId) => {
  if (!documentId) {
    throw new Error('Document ID is required');
  }

  const apiKey = process.env.REACT_APP_LUCID_API_KEY;

  if (!shouldUseProxy() && apiKey) {
    const response = await fetch(`${LUCID_API_BASE_URL}/documents/${documentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Lucid-Api-Version': LUCID_API_VERSION,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch document metadata (${response.status})`);
    }

    return response.json();
  }

  return callLucidProxy({ documentId, action: 'metadata' });
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
 * @param {string} pageId - Optional page ID from Lucid document
 * @returns {Promise<string>} - Base64 data URL of the image
 */
export const exportDocumentPage = async (documentId, pageNumber = null, pageId = null, options = {}) => {
  if (!documentId) {
    throw new Error('Document ID is required');
  }

  const apiKey = process.env.REACT_APP_LUCID_API_KEY;

  const label = typeof pageNumber === 'number'
    ? `Page ${pageNumber + 1}`
    : pageId ? `Page ${pageId}` : 'Page';

  // In local development, use CORS proxy
  if (!shouldUseProxy() && !(options.forceProxy)) {
    if (!apiKey) {
      console.error('API key not configured. Please set REACT_APP_LUCID_API_KEY in .env.local');
      // Return a placeholder image
      return createPlaceholderImage(label);
    }

    // In development, just return placeholder since CORS will block direct calls
    // Real images will load in production via the proxy
    return createPlaceholderImage(label);
  }

  // Use the proxy endpoint (production or dev override)
  try {
    const payload = {
      documentId,
      exportImage: true,
      action: 'exportImage'
    };

    if (typeof pageNumber === 'number') {
      payload.pageNumber = pageNumber;
    }

    if (pageId) {
      payload.pageId = pageId;
    }

    if (options.scale) {
      payload.scale = options.scale;
    }

    if (options.dpi) {
      payload.dpi = options.dpi;
    }

    if (options.crop) {
      payload.crop = options.crop;
    }

    if (options.format) {
      payload.format = options.format;
    }

    const data = await callLucidProxy(payload);

    if (data.image) {
      return data.image;
    }

    throw new Error('No image data received from proxy');
  } catch (error) {
    console.error(`Failed to export page ${label}:`, error);
    return createPlaceholderImage(label);
  }
};

/**
 * Request an embed token for rendering Lucid in an iframe
 * @param {string} documentId - Lucid document ID
 * @param {Object} options - Additional embed options
 * @returns {Promise<Object>} - Embed token response
 */
export const requestLucidEmbedToken = async (documentId, options = {}) => {
  if (!documentId) {
    throw new Error('Document ID is required');
  }

  const apiKey = process.env.REACT_APP_LUCID_API_KEY;

  if (!shouldUseProxy() && apiKey) {
    try {
      const response = await fetch(`${LUCID_API_BASE_URL}/embeds/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': LUCID_API_VERSION,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          permissions: options.permissions || ['view'],
          expiresInSeconds: options.expiresInSeconds || 3600,
          pageId: options.pageId || null,
          type: options.type || 'document'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Lucid embed token request failed (${response.status})`);
      }

      return await response.json();
    } catch (error) {
      console.error('Direct embed token request failed:', error);
      throw new Error('Embed token request failed. When developing locally, set REACT_APP_LUCID_PROXY_URL to your deployed domain or run the backend proxy so the token can be issued.');
    }
  }

  const data = await callLucidProxy({
    documentId,
    action: 'embedToken',
    embedOptions: options
  });

  if (!data || (!data.token && !data.embedToken && !data.accessToken)) {
    throw new Error('Proxy returned an empty embed token response');
  }

  return data;
};

/**
 * Export a cropped, high-resolution image focused on a specific shape
 * @param {string} documentId - Lucid document ID
 * @param {string} shapeId - Lucid shape ID
 * @param {Object} options - { padding, scale, format }
 * @returns {Promise<string>} - Base64 data URL of the cropped image
 */
export const exportShapeFocusImage = async (documentId, shapeId, options = {}) => {
  if (!documentId || !shapeId) {
    throw new Error('Document ID and shape ID are required');
  }

  const { padding = 80, scale = 2, format = 'png' } = options;
  const docData = await fetchDocumentContents(documentId);

  let targetPageId = null;
  let targetPageIndex = null;
  let bounds = null;

  docData.pages?.some((page, pageIndex) => {
    const shapesList = page.shapes || page.items?.shapes || [];
    const match = shapesList.find((shape) => shape.id === shapeId);

    if (match) {
      targetPageId = page.id;
      targetPageIndex = pageIndex;
      bounds = match.boundingBox || match.bounds || null;
      return true;
    }

    return false;
  });

  if (!bounds || targetPageIndex === null) {
    throw new Error(`Shape ${shapeId} not found in document`);
  }

  const crop = createFocusCrop(bounds, padding);
  return exportDocumentPage(documentId, targetPageIndex, targetPageId, {
    crop,
    scale,
    format
  });
};

/**
 * Calculate a crop rectangle around a shape bounding box with padding
 * @param {Object} bounds - { x, y, w, h }
 * @param {number} padding - Padding in Lucid units
 * @returns {Object} crop parameters compatible with Lucid export endpoint
 */
export const createFocusCrop = (bounds = {}, padding = 60) => {
  const x = Number(bounds.x ?? bounds.left ?? 0);
  const y = Number(bounds.y ?? bounds.top ?? 0);
  const width = Number(bounds.w ?? bounds.width ?? 0);
  const height = Number(bounds.h ?? bounds.height ?? 0);

  const safePadding = Math.max(padding, 0);

  const cropX = Math.max(x - safePadding, 0);
  const cropY = Math.max(y - safePadding, 0);
  const cropWidth = Math.max(width + safePadding * 2, width || 1);
  const cropHeight = Math.max(height + safePadding * 2, height || 1);

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight)
  };
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
