/**
 * Floor Plan Processor
 * 
 * Handles fetching Lucid data, exporting images, and caching floor plans
 */

import { supabase } from '../lib/supabase';
import { fetchDocumentContents, exportDocumentPage, calculateContentBoundingBox } from './lucidApi';
import { sharePointStorageService } from './sharePointStorageService';

/**
 * Get image dimensions from blob
 * @param {Blob} blob - Image blob
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url); // Clean up
      resolve({ width: img.width, height: img.height });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Process and cache all floor plans for a project
 * @param {string} projectId - Project UUID
 * @param {string} lucidDocumentId - Lucid document ID
 * @param {string} apiKey - Lucid API key (optional)
 * @returns {Promise<{pages: Array, shapes: Array}>}
 */
export async function processAndCacheFloorPlans(projectId, lucidDocumentId, apiKey) {
  if (!projectId || !lucidDocumentId) {
    throw new Error('Project ID and Lucid document ID are required');
  }

  try {
    // 1. Fetch document contents to get pages and shapes
    console.log('Fetching document contents...');
    const docContents = await fetchDocumentContents(lucidDocumentId, apiKey);
    
    if (!docContents.pages || docContents.pages.length === 0) {
      throw new Error('No pages found in document');
    }

    // 2. For each page, export image and cache
    const pages = docContents.pages || [];
    const cachedPages = [];
    const allShapes = [];
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      console.log(`Processing page ${i + 1}/${pages.length}: ${page.title || 'Untitled'}`);
      
      // Get shapes for this page
      const pageShapes = page.shapes || [];
      allShapes.push(...pageShapes.map(shape => ({
        ...shape,
        pageId: page.id,
        pageTitle: page.title
      })));
      
      // Calculate bounding box from shapes
      const boundingBox = calculateContentBoundingBox(pageShapes);
      
      try {
        // Export page as image
        console.log(`Exporting page ${i + 1} as image...`);
        const imageBlob = await exportDocumentPage(lucidDocumentId, i, apiKey);
        
        // Get image dimensions
        const imageDimensions = await getImageDimensions(imageBlob);
        
        // Upload to SharePoint
        console.log(`Uploading image for page ${i + 1} to SharePoint...`);
        const imageUrl = await sharePointStorageService.uploadFloorPlan(
          projectId,
          page.id,
          page.title || `Floor ${i + 1}`,
          imageBlob
        );
        
        // Save to lucid_pages table
        console.log(`Saving page ${i + 1} metadata to database...`);
        const { data: cachedPage, error } = await supabase
          .from('lucid_pages')
          .upsert({
            project_id: projectId,
            page_id: page.id,
            page_title: page.title || `Floor ${i + 1}`,
            page_index: i,
            image_url: imageUrl,
            image_width: imageDimensions.width,
            image_height: imageDimensions.height,
            bounding_box: boundingBox,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'project_id,page_id'
          })
          .select()
          .single();
        
        if (error) {
          console.error(`Error saving page ${i + 1}:`, error);
          throw error;
        }
        
        cachedPages.push(cachedPage);
        console.log(`✓ Page ${i + 1} processed successfully`);
        
        // Add a small delay to avoid hitting rate limits (75 requests per 5 seconds)
        if (i < pages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error processing page ${i + 1}:`, error);
        // Continue with other pages even if one fails
        throw new Error(`Failed to process page ${i + 1}: ${error.message}`);
      }
    }
    
    console.log(`✓ All ${cachedPages.length} pages processed successfully`);
    
    return {
      pages: cachedPages,
      shapes: allShapes
    };
  } catch (error) {
    console.error('Error processing floor plans:', error);
    throw new Error(`Floor plan processing failed: ${error.message}`);
  }
}

/**
 * Get cached floor plans for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<Array>} Array of cached floor plan pages
 */
export async function getCachedFloorPlans(projectId) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('lucid_pages')
      .select('*')
      .eq('project_id', projectId)
      .order('page_index', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Error getting cached floor plans:', error);
    throw new Error(`Failed to get cached floor plans: ${error.message}`);
  }
}

/**
 * Delete cached floor plans for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 */
export async function deleteCachedFloorPlans(projectId) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  try {
    const { error } = await supabase
      .from('lucid_pages')
      .delete()
      .eq('project_id', projectId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error deleting cached floor plans:', error);
    throw new Error(`Failed to delete cached floor plans: ${error.message}`);
  }
}

/**
 * Get a specific floor plan page
 * @param {string} projectId - Project UUID
 * @param {string} pageId - Lucid page ID
 * @returns {Promise<Object|null>} Floor plan page or null
 */
export async function getFloorPlanPage(projectId, pageId) {
  if (!projectId || !pageId) {
    throw new Error('Project ID and page ID are required');
  }

  try {
    const { data, error } = await supabase
      .from('lucid_pages')
      .select('*')
      .eq('project_id', projectId)
      .eq('page_id', pageId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting floor plan page:', error);
    throw new Error(`Failed to get floor plan page: ${error.message}`);
  }
}

/**
 * Check if floor plans are cached for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<boolean>}
 */
export async function areFloorPlansCached(projectId) {
  if (!projectId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('lucid_pages')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    
    if (error) {
      console.error('Error checking cached floor plans:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking cached floor plans:', error);
    return false;
  }
}
