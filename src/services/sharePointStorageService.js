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
import { normalizeSharePointRootUrl } from './sharePointFolderService';

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
   * @returns {Promise<{url: string, driveId: string, itemId: string, name: string, webUrl: string, size: number}>} SharePoint metadata
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
      
      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(sharePointUrl, subPath, filename, file);
      
      return metadata;
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
   * @returns {Promise<{url: string, driveId: string, itemId: string, name: string, webUrl: string, size: number}>} SharePoint metadata
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
      
      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(sharePointUrl, subPath, filename, file);
      
      return metadata;
    } catch (error) {
      console.error('Failed to upload floor plan:', error);
      throw new Error(`Floor plan upload failed: ${error.message}`);
    }
  }

  /**
   * Get project's Photos folder URL using auto folder management
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Photos folder URL
   */
  async getProjectSharePointUrl(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('client_folder_url, one_drive_photos')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!project) throw new Error('Project not found');

      const { rootUrl, source, needsSubfolder } = this.resolveFolderRoot(project, [
        { key: 'one_drive_photos', needsSubfolder: false }
      ]);

      if (!rootUrl) {
        throw new Error('Client Folder URL not configured. Please set Client Folder URL (or legacy Photos URL) in project settings to enable auto folder management.');
      }

      const photosUrl = needsSubfolder ? this.ensureSubfolderUrl(rootUrl, 'Photos') : rootUrl;

      console.debug?.('[SharePointStorage] Resolved Photos folder', {
        projectId,
        source,
        needsSubfolder,
        photosUrl
      });

      return photosUrl;
    } catch (error) {
      console.error('Failed to get project SharePoint URL:', error);
      throw error;
    }
  }

  /**
   * Get project's Procurement folder URL using auto folder management
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Procurement folder URL
   */
  async getProjectProcurementUrl(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('client_folder_url, one_drive_procurement, one_drive_photos')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!project) throw new Error('Project not found');

      const { rootUrl, source, needsSubfolder } = this.resolveFolderRoot(project, [
        { key: 'one_drive_procurement', needsSubfolder: false },
        { key: 'one_drive_photos', needsSubfolder: true }
      ]);

      if (!rootUrl) {
        throw new Error('Client Folder URL not configured. Please set Client Folder URL (or legacy Procurement/Photos URL) in project settings to enable auto folder management.');
      }

      const procurementUrl = needsSubfolder ? this.ensureSubfolderUrl(rootUrl, 'Procurement') : rootUrl;

      console.debug?.('[SharePointStorage] Resolved Procurement folder', {
        projectId,
        source,
        needsSubfolder,
        procurementUrl
      });

      return procurementUrl;
    } catch (error) {
      console.error('Failed to get project procurement SharePoint URL:', error);
      throw error;
    }
  }

  /**
   * Get project's Business folder URL using auto folder management
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Business folder URL
   */
  async getProjectBusinessUrl(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('client_folder_url, one_drive_files, one_drive_photos')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!project) throw new Error('Project not found');

      const { rootUrl, source, needsSubfolder } = this.resolveFolderRoot(project, [
        { key: 'one_drive_files', needsSubfolder: false },
        { key: 'one_drive_photos', needsSubfolder: true }
      ]);

      if (!rootUrl) {
        throw new Error('Client Folder URL not configured. Please set Client Folder URL (or legacy Files/Photos URL) in project settings to enable auto folder management.');
      }

      const businessUrl = needsSubfolder ? this.ensureSubfolderUrl(rootUrl, 'Business') : rootUrl;

      console.debug?.('[SharePointStorage] Resolved Business folder', {
        projectId,
        source,
        needsSubfolder,
        businessUrl
      });

      return businessUrl;
    } catch (error) {
      console.error('Failed to get project business folder URL:', error);
      throw error;
    }
  }

  /**
   * Clean SharePoint URL by removing query parameters
   * @param {string} url - SharePoint URL
   * @returns {string} Cleaned URL
   */
  cleanSharePointUrl(url) {
    try {
      // Remove query parameters (everything after ?)
      const cleanUrl = url.split('?')[0];
      console.log('Cleaned SharePoint URL:', { original: url, cleaned: cleanUrl });
      return cleanUrl;
    } catch (error) {
      console.warn('Failed to clean SharePoint URL:', error);
      return url;
    }
  }

  /**
   * Resolve the base client folder URL, falling back to legacy fields when needed
   * @param {Object} project - Project record with folder fields
   * @param {Array<string|{key: string, needsSubfolder?: boolean, normalize?: boolean}>} fallbackFields - Additional fields to try
   * @returns {{rootUrl: string|null, source: string|null, needsSubfolder: boolean}} Resolved root URL metadata
   */
  resolveFolderRoot(project, fallbackFields = []) {
    const candidates = [
      {
        key: 'client_folder_url',
        value: project?.client_folder_url,
        needsSubfolder: true,
        normalize: true
      },
      ...fallbackFields.map(field =>
        typeof field === 'string'
          ? {
              key: field,
              value: project?.[field],
              needsSubfolder: false,
              normalize: false
            }
          : {
              key: field.key,
              value: project?.[field.key],
              needsSubfolder: field.needsSubfolder ?? false,
              normalize: field.normalize ?? false
            }
      )
    ];

    for (const candidate of candidates) {
      if (!candidate.value || typeof candidate.value !== 'string') continue;

      const baseValue = candidate.normalize
        ? (normalizeSharePointRootUrl(candidate.value) || candidate.value.trim())
        : candidate.value.trim();

      if (baseValue) {
        return {
          rootUrl: baseValue.replace(/\/+$/, ''),
          source: candidate.key,
          needsSubfolder: candidate.needsSubfolder === true
        };
      }
    }

    return { rootUrl: null, source: null, needsSubfolder: false };
  }

  /**
   * Ensure a URL points to the expected subfolder (e.g., Photos, Procurement)
   * without duplicating the folder segment.
   * @param {string} rootUrl - Base URL
   * @param {string} folderName - Target subfolder name
   * @returns {string} URL that ends with the folder
   */
  ensureSubfolderUrl(rootUrl, folderName) {
    if (!rootUrl) return '';

    const trimmed = rootUrl.trim().replace(/\/+$/, '');
    const suffix = `/${folderName}`.toLowerCase();

    if (trimmed.toLowerCase().endsWith(suffix)) {
      return trimmed;
    }

    return `${trimmed}/${folderName}`;
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

    // Clean the root URL to remove query parameters
    const cleanedRootUrl = this.cleanSharePointUrl(rootUrl);
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Convert file to base64
        const fileBase64 = await this.fileToBase64(file);

        // Debug logging
        console.log('SharePoint upload attempt', attempt, {
          originalRootUrl: rootUrl,
          cleanedRootUrl,
          subPath,
          filename,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream'
        });

        // Call the graph-upload API with cleaned URL
        const response = await fetch('/api/graph-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rootUrl: cleanedRootUrl,
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
        
        console.log(`Successfully uploaded ${filename} to SharePoint with metadata:`, {
          url: result.url,
          driveId: result.driveId,
          itemId: result.itemId
        });
        
        // Return complete metadata for thumbnail generation
        return {
          url: result.url,
          driveId: result.driveId,
          itemId: result.itemId,
          name: result.name,
          webUrl: result.webUrl,
          size: result.size
        };
        
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

    let sanitized = text
      .trim()
      // Replace SharePoint forbidden characters with underscores
      // SharePoint forbids: ~ " # % & * : < > ? / \ { | }
      .replace(/[~"#%&*:<>?/\\{|}]/g, '_')
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // Replace spaces with underscores for filenames
      .replace(/ /g, '_')
      // Keep alphanumeric, underscores, hyphens, and periods
      .replace(/[^\w.-]/g, '')
      // Replace multiple consecutive underscores with single underscore
      .replace(/_{2,}/g, '_')
      // Remove leading/trailing underscores, periods, or hyphens
      .replace(/^[._-]+|[._-]+$/g, '')
      // Limit length to 50 characters
      .substring(0, 50)
      // Final cleanup of trailing special chars after substring
      .replace(/[._-]+$/g, '');

    // If sanitization resulted in empty string, return default
    if (!sanitized || sanitized.length === 0) {
      return 'Unknown';
    }

    // Ensure doesn't start with period (hidden file in SharePoint)
    if (sanitized.startsWith('.')) {
      sanitized = 'File' + sanitized;
    }

    return sanitized;
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
