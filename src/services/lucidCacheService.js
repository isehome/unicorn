/**
 * Lucid Chart Cache Service
 * Manages caching of Lucid Chart page images in Supabase storage
 */

import { supabase } from '../lib/supabase';
import { exportDocumentPage } from './lucidApi';

const BUCKET_NAME = 'lucid-chart-cache';
const CACHE_DURATION_DAYS = 7;

/**
 * Get cached image URL or fetch and cache new one
 * @param {string} documentId - Lucid document ID
 * @param {number} pageIndex - Page index (0-based)
 * @param {object} pageInfo - Optional page information (title, id)
 * @returns {Promise<string>} - Public URL of the cached image
 */
export const getCachedPageImage = async (documentId, pageIndex, pageInfo = {}) => {
  try {
    // Check if we have a valid cached entry
    const { data: cacheEntry, error: cacheError } = await supabase
      .from('lucid_chart_cache')
      .select('*')
      .eq('document_id', documentId)
      .eq('page_index', pageIndex)
      .single();

    // If we have a valid cache entry that hasn't expired, return it
    if (cacheEntry && !cacheError) {
      const expiresAt = new Date(cacheEntry.expires_at);
      const now = new Date();
      
      if (expiresAt > now && cacheEntry.image_url) {
        return cacheEntry.image_url;
      }
    }

    // Fetch fresh image from Lucid API via proxy
    // Get the base64 image from Lucid API via proxy
    const base64Image = await exportDocumentPage(documentId, pageIndex, pageInfo.id);
    
    if (!base64Image) {
      throw new Error('Failed to fetch image from Lucid API');
    }

    // For now, skip Supabase storage and just cache the base64 in the database
    // This simplifies the flow and avoids storage bucket issues
    
    const cacheData = {
      document_id: documentId,
      page_index: pageIndex,
      page_title: pageInfo.title || `Page ${pageIndex + 1}`,
      page_id: pageInfo.id || null,
      storage_path: `base64-${documentId}-${pageIndex}`, // Indicator that this is base64
      image_url: base64Image, // Store the base64 data URL directly
      last_fetched: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    };

    // Try to upsert cache entry (optional - if table doesn't exist, still return the image)
    try {
      const { error: upsertError } = await supabase
        .from('lucid_chart_cache')
        .upsert(cacheData, {
          onConflict: 'document_id,page_index'
        });

      // Ignore cache errors - we have the image
    } catch (dbError) {
      // Continue anyway - we have the image
    }

    return base64Image;
  } catch (error) {
    // Fallback: Try to return a base64 encoded placeholder
    return createPlaceholderImage(pageInfo.title || `Page ${pageIndex + 1}`);
  }
};

/**
 * Check if cache exists for a document
 * @param {string} documentId - Lucid document ID
 * @returns {Promise<boolean>}
 */
export const hasCachedDocument = async (documentId) => {
  try {
    const { data, error } = await supabase
      .from('lucid_chart_cache')
      .select('id')
      .eq('document_id', documentId)
      .limit(1);

    return !error && data && data.length > 0;
  } catch (error) {
    console.error('Failed to check cache:', error);
    return false;
  }
};

/**
 * Preload all pages for a document
 * @param {string} documentId - Lucid document ID
 * @param {Array} pages - Array of page objects with index, title, id
 * @returns {Promise<Object>} - Map of pageIndex to image URL
 */
export const preloadDocumentPages = async (documentId, pages) => {
  const imageUrls = {};
  
  // Load pages in parallel but with a limit to avoid rate limiting
  const BATCH_SIZE = 3;
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);
    const promises = batch.map(page => 
      getCachedPageImage(documentId, page.index, {
        title: page.title,
        id: page.id
      }).then(url => {
        imageUrls[page.index] = url;
        return url;
      }).catch(err => {
        imageUrls[page.index] = null;
        return null;
      })
    );
    
    await Promise.all(promises);
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < pages.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return imageUrls;
};

/**
 * Clear cache for a document
 * @param {string} documentId - Lucid document ID
 */
export const clearDocumentCache = async (documentId) => {
  try {
    // Get all cache entries for this document
    const { data: entries, error: fetchError } = await supabase
      .from('lucid_chart_cache')
      .select('storage_path')
      .eq('document_id', documentId);

    if (fetchError) {
      throw fetchError;
    }

    // Delete storage files
    if (entries && entries.length > 0) {
      const filePaths = entries.map(e => e.storage_path);
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths);

      // Ignore delete errors
    }

    // Delete cache entries
    const { error: dbError } = await supabase
      .from('lucid_chart_cache')
      .delete()
      .eq('document_id', documentId);

    if (dbError) {
      throw dbError;
    }

    // Cache cleared
  } catch (error) {
    throw error;
  }
};

/**
 * Create a placeholder image as base64
 * @param {string} title - Page title
 * @returns {string} - Base64 data URL
 */
const createPlaceholderImage = (title) => {
  try {
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
    
    // Loading text
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Unable to load image', canvas.width / 2, canvas.height / 2 + 60);
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    return '';
  }
};

/**
 * Clean up expired cache entries
 */
export const cleanupExpiredCache = async () => {
  try {
    const { data, error } = await supabase.rpc('clean_expired_lucid_cache');
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};
