/**
 * SharePoint Storage Service
 * 
 * Unified service for managing all image storage in SharePoint with:
 * - Wire drop photos (prewire, trim out, commission)
 * - Floor plan drawings
 * - Issue photos
 * - Thumbnail caching via IndexedDB
 */

import { supabase } from '../lib/supabase';
import { thumbnailCache } from '../lib/thumbnailCache';

// SharePoint thumbnail size configurations
const THUMBNAIL_SIZES = {
  small: { width: 96, height: 96 },
  medium: { width: 300, height: 300 },
  large: { width: 800, height: 800 }
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

class SharePointStorageService {
  /**
   * Upload wire drop photo to SharePoint
   * @param {string} projectId - Project UUID
   * @param {string} wireDropId - Wire drop UUID
   * @param {string} stageType - Stage type (prewire, trim_out, commission)
   * @param {File} file - Image file
   * @returns {Promise<string>} SharePoint URL
   */
  async uploadWireDropPhoto(projectId, wireDropId, stageType, file) {
    try {
      // Get project SharePoint URL
      const sharePointUrl = await this.getProjectSharePointUrl(projectId);
      
      // Get wire drop details for naming
      const { data: wireDrop, error: wireDropError } = await supabase
        .from('wire_drops')
        .select('room_name, drop_name')
        .eq('id', wireDropId)
        .single();
      
      if (wireDropError) throw wireDropError;
      if (!wireDrop) throw new Error('Wire drop not found');
      
      const roomName = wireDrop.room_name || 'Unknown';
      const dropName = wireDrop.drop_name || 'Drop';
      
      // Create folder structure: wire_drops/{Room Name}_{Drop Name}/
      const folderName = `${this.sanitizeForFileName(roomName)}_${this.sanitizeForFileName(dropName)}`;
      const subPath = `wire_drops/${folderName}`;
      
      // Create consistent filename WITHOUT timestamp so it replaces the existing file
      const stagePrefix = stageType.toUpperCase();
      const extension = this.getFileExtension(file.name);
      const filename = `${stagePrefix}_${this.sanitizeForFileName(roomName)}_${this.sanitizeForFileName(dropName)}.${extension}`;
      
      // Debug logging
      console.log('SharePoint Upload Debug:', {
        rootUrl: sharePointUrl,
        subPath,
        filename,
        folderName,
        sanitizedRoom: this.sanitizeForFileName(roomName),
        sanitizedDrop: this.sanitizeForFileName(dropName)
      });
      
      // Upload to SharePoint
      const url = await this.uploadToSharePoint(sharePointUrl, subPath, filename, file);
      
      return url;
    } catch (error) {
      console.error('Failed to upload wire drop photo:', error);
      throw new Error(`Wire drop photo upload failed: ${error.message}`);
    }
  }

  /**
   * Upload issue photo to SharePoint
   * @param {string} projectId - Project UUID
   * @param {string} issueId - Issue UUID
   * @param {File} file - Image file
   * @param {string} photoDescription - Optional description for filename
   * @returns {Promise<string>} SharePoint URL
   */
  async uploadIssuePhoto(projectId, issueId, file, photoDescription = '') {
    try {
      // Get project SharePoint URL
      const sharePointUrl = await this.getProjectSharePointUrl(projectId);
      
      // Get issue details for naming
      const { data: issue, error: issueError } = await supabase
        .from('issues')
        .select('title')
        .eq('id', issueId)
        .single();
      
      if (issueError) throw issueError;
      if (!issue) throw new Error('Issue not found');
      
      const issueTitle = issue.title || 'Unknown Issue';
      
      // Create folder structure: issues/{Issue Title}/
      const folderName = this.sanitizeForFileName(issueTitle);
      const subPath = `issues/${folderName}`;
      
      // Create filename
      const timestamp = this.formatTimestamp(new Date());
      const description = photoDescription ? `_${this.sanitizeForFileName(photoDescription)}` : '';
      const extension = this.getFileExtension(file.name);
      const filename = `ISSUE_${this.sanitizeForFileName(issueTitle)}${description}_${timestamp}.${extension}`;
      
      // Upload to SharePoint
      const url = await this.uploadToSharePoint(sharePointUrl, subPath, filename, file);
      
      return url;
    } catch (error) {
      console.error('Failed to upload issue photo:', error);
      throw new Error(`Issue photo upload failed: ${error.message}`);
    }
  }

  /**
   * Upload floor plan to SharePoint
   * @param {string} projectId - Project UUID
   * @param {string} pageId - Lucid page ID
   * @param {string} pageTitle - Page title for naming
   * @param {Blob} imageBlob - Image data
   * @returns {Promise<string>} SharePoint URL
   */
  async uploadFloorPlan(projectId, pageId, pageTitle, imageBlob) {
    try {
      // Get project SharePoint URL
      const sharePointUrl = await this.getProjectSharePointUrl(projectId);
      
      const pageTitleSafe = pageTitle || 'Floor Plan';
      
      // Create folder structure: floor_plans/{Page Title}/
      const folderName = this.sanitizeForFileName(pageTitleSafe);
      const subPath = `floor_plans/${folderName}`;
      
      // Create filename
      const timestamp = this.formatTimestamp(new Date());
      const filename = `FLOORPLAN_${this.sanitizeForFileName(pageTitleSafe)}_${timestamp}.png`;
      
      // Convert blob to File object for upload
      const file = new File([imageBlob], filename, { type: 'image/png' });
      
      // Upload to SharePoint
      const url = await this.uploadToSharePoint(sharePointUrl, subPath, filename, file);
      
      return url;
    } catch (error) {
      console.error('Failed to upload floor plan:', error);
      throw new Error(`Floor plan upload failed: ${error.message}`);
    }
  }

  /**
   * Get project's SharePoint URL
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} SharePoint URL
   */
  async getProjectSharePointUrl(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('one_drive_photos')
        .eq('id', projectId)
        .single();
      
      if (error) throw error;
      if (!project) throw new Error('Project not found');
      
      const sharePointUrl = project.one_drive_photos;
      
      if (!sharePointUrl || sharePointUrl.trim() === '') {
        throw new Error('SharePoint folder not configured for this project. Please contact your administrator.');
      }
      
      return sharePointUrl;
    } catch (error) {
      console.error('Failed to get project SharePoint URL:', error);
      throw error;
    }
  }

  /**
   * Upload file to SharePoint with retry logic
   * @param {string} rootUrl - SharePoint root URL
   * @param {string} subPath - Subfolder path
   * @param {string} filename - File name
   * @param {File} file - File to upload
   * @returns {Promise<string>} SharePoint URL
   */
  async uploadToSharePoint(rootUrl, subPath, filename, file) {
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Convert file to base64
        const fileBase64 = await this.fileToBase64(file);
        
        // Call the graph-upload API
        const response = await fetch('/api/graph-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rootUrl,
            subPath,
            filename,
            fileBase64,
            contentType: file.type || 'application/octet-stream'
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `Upload failed with status ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.url) {
          throw new Error('No URL returned from upload');
        }
        
        console.log(`Successfully uploaded ${filename} to SharePoint`);
        return result.url;
        
      } catch (error) {
        lastError = error;
        console.error(`Upload attempt ${attempt} failed:`, error);
        
        // Check for rate limiting
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          if (attempt < MAX_RETRIES) {
            // Exponential backoff
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`Rate limited. Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For other errors, retry with shorter delay
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Get thumbnail URL for SharePoint file
   * @param {string} sharePointUrl - SharePoint file URL
   * @param {string} size - Thumbnail size ('small', 'medium', 'large')
   * @returns {string} Thumbnail URL
   */
  getThumbnailUrl(sharePointUrl, size = 'medium') {
    if (!sharePointUrl) return null;
    
    const sizeConfig = THUMBNAIL_SIZES[size] || THUMBNAIL_SIZES.medium;
    
    // SharePoint thumbnail API pattern
    return `${sharePointUrl}?width=${sizeConfig.width}&height=${sizeConfig.height}`;
  }

  /**
   * Get cached thumbnail or fetch and cache
   * @param {string} sharePointUrl - SharePoint file URL
   * @param {string} size - Thumbnail size
   * @returns {Promise<{data: string, type: string, cached: boolean}|null>}
   */
  async getCachedThumbnail(sharePointUrl, size = 'medium') {
    if (!sharePointUrl) return null;
    
    try {
      // Check cache first
      const cached = await thumbnailCache.get(sharePointUrl, size);
      if (cached) {
        return {
          data: cached.thumbnailData,
          type: cached.type,
          cached: true
        };
      }
      
      // Fetch thumbnail
      const thumbnailUrl = this.getThumbnailUrl(sharePointUrl, size);
      const response = await fetch(thumbnailUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail: ${response.status}`);
      }
      
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);
      
      // Cache it
      await thumbnailCache.set(sharePointUrl, base64, size, blob.type);
      
      return {
        data: base64,
        type: blob.type,
        cached: false
      };
      
    } catch (error) {
      console.error('Failed to get cached thumbnail:', error);
      return null;
    }
  }

  /**
   * Prefetch thumbnails in batch
   * @param {Array<string>} urls - Array of SharePoint URLs
   * @param {string} size - Thumbnail size
   * @returns {Promise<Array>} Results
   */
  async prefetchThumbnails(urls, size = 'medium') {
    if (!urls || urls.length === 0) return [];
    
    const items = urls.map(url => ({ url, size }));
    
    const fetchFn = async (url, size) => {
      try {
        const thumbnailUrl = this.getThumbnailUrl(url, size);
        const response = await fetch(thumbnailUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        
        const blob = await response.blob();
        const base64 = await this.blobToBase64(blob);
        
        return {
          data: base64,
          type: blob.type
        };
      } catch (error) {
        console.error(`Failed to fetch thumbnail for ${url}:`, error);
        return { data: null, type: null };
      }
    };
    
    return await thumbnailCache.prefetchBatch(items, fetchFn);
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      const count = await thumbnailCache.cleanup();
      console.log(`Cleared ${count} expired thumbnail cache entries`);
      return count;
    } catch (error) {
      console.error('Failed to clear expired cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await thumbnailCache.getStats();
  }

  /**
   * Sanitize text for SharePoint-safe filename while keeping it readable
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeForFileName(text) {
    if (!text) return 'Unknown';
    
    return text
      .trim()
      // Replace special characters with underscores
      .replace(/[<>:"/\\|?*]/g, '_')
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // Replace spaces with underscores for filenames
      .replace(/ /g, '_')
      // Remove any other problematic characters - keep only alphanumeric and underscores
      .replace(/[^\w]/g, '')
      // Replace multiple consecutive underscores with single underscore
      .replace(/_{2,}/g, '_')
      // Limit length to 50 characters
      .substring(0, 50)
      // Remove trailing/leading underscores
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Format timestamp for filenames
   * @param {Date} date - Date object
   * @returns {string} Formatted timestamp (YYYYMMDD_HHMMSS)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * Get file extension from filename
   * @param {string} filename - File name
   * @returns {string} Extension without dot
   */
  getFileExtension(filename) {
    if (!filename) return 'jpg';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
  }

  /**
   * Convert File to base64
   * @param {File} file - File object
   * @returns {Promise<string>} Base64 string
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:...;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert Blob to base64
   * @param {Blob} blob - Blob object
   * @returns {Promise<string>} Base64 string
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:...;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Export singleton instance
export const sharePointStorageService = new SharePointStorageService();
export default sharePointStorageService;
