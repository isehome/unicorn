/**
 * Direct Lucid API Service for Local Development
 * This bypasses the proxy and makes direct API calls
 * Note: This will only work if CORS is not an issue (e.g., with browser extensions)
 */

export const exportDocumentPageDirect = async (documentId, pageNumber) => {
  const apiKey = process.env.REACT_APP_LUCID_API_KEY;
  
  if (!apiKey) {
    throw new Error('REACT_APP_LUCID_API_KEY not set in environment variables');
  }

  if (!documentId) {
    throw new Error('Document ID is required');
  }

  try {
    console.log(`Direct API call: Exporting page ${pageNumber} from document ${documentId}`);
    
    // Try direct API call
    const response = await fetch(
      `https://api.lucid.co/documents/${documentId}?pageNumber=${pageNumber}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': '1',
          'Accept': 'image/png'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Direct API call failed:`, error);
    throw error;
  }
};

/**
 * Test if direct API calls work
 */
export const testDirectApi = async () => {
  const apiKey = process.env.REACT_APP_LUCID_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'No API key' };
  }

  try {
    const response = await fetch(
      'https://api.lucid.co/users/me',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Lucid-Api-Version': '1'
        }
      }
    );
    
    if (response.ok) {
      return { success: true, data: await response.json() };
    } else {
      return { success: false, error: `Status ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
