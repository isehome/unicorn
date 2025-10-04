/**
 * Supabase Storage Service
 * 
 * Handles uploading and managing floor plan images in Supabase Storage
 */

import { supabase } from '../lib/supabase';

const FLOOR_PLANS_BUCKET = 'floor-plans';

/**
 * Upload floor plan image to Supabase Storage
 * @param {Blob} imageBlob - Image data
 * @param {string} projectId - Project UUID
 * @param {string} pageId - Lucid page ID
 * @returns {Promise<string>} - Public URL of uploaded image
 */
export async function uploadFloorPlanImage(imageBlob, projectId, pageId) {
  if (!imageBlob || !projectId || !pageId) {
    throw new Error('Image blob, project ID, and page ID are required');
  }

  const fileName = `${projectId}/${pageId}.png`;
  
  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .upload(fileName, imageBlob, {
        contentType: 'image/png',
        upsert: true // Overwrite if exists
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .getPublicUrl(fileName);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading floor plan image:', error);
    throw new Error(`Failed to upload floor plan image: ${error.message}`);
  }
}

/**
 * Delete floor plan image from Supabase Storage
 * @param {string} projectId - Project UUID
 * @param {string} pageId - Lucid page ID
 * @returns {Promise<void>}
 */
export async function deleteFloorPlanImage(projectId, pageId) {
  if (!projectId || !pageId) {
    throw new Error('Project ID and page ID are required');
  }

  const fileName = `${projectId}/${pageId}.png`;
  
  try {
    const { error } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .remove([fileName]);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error deleting floor plan image:', error);
    throw new Error(`Failed to delete floor plan image: ${error.message}`);
  }
}

/**
 * Delete all floor plan images for a project
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 */
export async function deleteProjectFloorPlans(projectId) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  try {
    // List all files in the project folder
    const { data: files, error: listError } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .list(projectId);
    
    if (listError) {
      throw listError;
    }
    
    if (!files || files.length === 0) {
      return; // No files to delete
    }
    
    // Delete all files
    const filePaths = files.map(file => `${projectId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .remove(filePaths);
    
    if (deleteError) {
      throw deleteError;
    }
  } catch (error) {
    console.error('Error deleting project floor plans:', error);
    throw new Error(`Failed to delete project floor plans: ${error.message}`);
  }
}

/**
 * Check if floor-plans bucket exists and is accessible
 * @returns {Promise<boolean>}
 */
export async function checkFloorPlansBucketExists() {
  try {
    const { data, error } = await supabase.storage.getBucket(FLOOR_PLANS_BUCKET);
    return !error && !!data;
  } catch (error) {
    console.error('Error checking floor-plans bucket:', error);
    return false;
  }
}

/**
 * Get public URL for a floor plan image (without checking existence)
 * @param {string} projectId - Project UUID
 * @param {string} pageId - Lucid page ID
 * @returns {string} - Public URL
 */
export function getFloorPlanImageUrl(projectId, pageId) {
  if (!projectId || !pageId) {
    throw new Error('Project ID and page ID are required');
  }

  const fileName = `${projectId}/${pageId}.png`;
  const { data: { publicUrl } } = supabase.storage
    .from(FLOOR_PLANS_BUCKET)
    .getPublicUrl(fileName);
  
  return publicUrl;
}
