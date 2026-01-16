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
import { STANDARD_SUBFOLDERS, normalizeSharePointRootUrl } from './sharePointFolderService';

// SharePoint thumbnail size configurations
const THUMBNAIL_SIZES = {
  small: { width: 96, height: 96 },
  medium: { width: 300, height: 300 },
  large: { width: 800, height: 800 }
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const PHOTOS_FOLDER_NAME = STANDARD_SUBFOLDERS?.photos || 'Photos';
const PHOTOS_SEGMENT = `/${PHOTOS_FOLDER_NAME.toLowerCase()}`;

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
      // Get project SharePoint folder context
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);

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
      const subPath = `${photosSubPath}wire_drops/${folderName}`;

      // Create consistent filename WITHOUT timestamp so it replaces the existing file
      const stagePrefix = stageType.toUpperCase();
      const extension = this.getFileExtension(file.name);
      const filename = `${stagePrefix}_${this.sanitizeForFileName(roomName)}_${this.sanitizeForFileName(dropName)}.${extension}`;

      // Debug logging
      console.log('SharePoint Upload Debug:', {
        rootUrl: uploadRoot,
        subPath,
        filename,
        folderName,
        sanitizedRoom: this.sanitizeForFileName(roomName),
        sanitizedDrop: this.sanitizeForFileName(dropName)
      });

      // Upload to SharePoint
      const url = await this.uploadToSharePoint(uploadRoot, subPath, filename, file);

      return url;
    } catch (error) {
      console.error('Failed to upload wire drop photo:', error);
      throw new Error(`Wire drop photo upload failed: ${error.message}`);
    }
  }

  /**
   * Upload window treatment photo to SharePoint
   * @param {string} projectId - Project UUID
   * @param {string} shadeId - Project Shade UUID
   * @param {string} measurementSet - 'M1' or 'M2'
   * @param {File} file - Image file
   * @returns {Promise<string>} SharePoint URL
   */
  async uploadShadePhoto(projectId, shadeId, measurementSet, file) {
    try {
      // Get project SharePoint folder context
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);

      // Get shade details for naming
      const { data: shade, error: shadeError } = await supabase
        .from('project_shades')
        .select('name, room:project_rooms(name)')
        .eq('id', shadeId)
        .single();

      if (shadeError) throw shadeError;
      if (!shade) throw new Error('Shade not found');

      const roomName = shade.room?.name || 'Unknown';
      const shadeName = shade.name || 'Shade';

      // Structure: Photos/WindowTreatment/{Room}_{Shade}/
      const folderName = `${this.sanitizeForFileName(roomName)}_${this.sanitizeForFileName(shadeName)}`;
      const subPath = `${photosSubPath}WindowTreatment/${folderName}`;

      // Filename: {M1|M2}_{Timestamp}.ext
      const setPrefix = measurementSet.toUpperCase();
      const timestamp = this.formatTimestamp(new Date());
      const extension = this.getFileExtension(file.name);
      const filename = `${setPrefix}_${timestamp}.${extension}`;

      console.log('Shade Photo Upload Debug:', {
        rootUrl: uploadRoot,
        subPath,
        filename
      });

      // Upload to SharePoint
      const metadata = await this.uploadToSharePoint(uploadRoot, subPath, filename, file);

      // Return full metadata object for thumbnail fetching
      return metadata;

    } catch (error) {
      console.error('Failed to upload shade photo:', error);
      throw new Error(`Shade photo upload failed: ${error.message}`);
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
      // Get project SharePoint folder context
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);

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
      const subPath = `${photosSubPath}issues/${folderName}`;

      // Create filename
      const timestamp = this.formatTimestamp(new Date());
      const description = photoDescription ? `_${this.sanitizeForFileName(photoDescription)}` : '';
      const extension = this.getFileExtension(file.name);
      const filename = `ISSUE_${this.sanitizeForFileName(issueTitle)}${description}_${timestamp}.${extension}`;

      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(uploadRoot, subPath, filename, file);

      return metadata;
    } catch (error) {
      console.error('Failed to upload issue photo:', error);
      throw new Error(`Issue photo upload failed: ${error.message}`);
    }
  }

  /**
   * Upload HomeKit QR code photo to SharePoint
   * @param {string} projectId - Project UUID
   * @param {string} equipmentId - Equipment UUID
   * @param {File} file - Image file
   * @returns {Promise<{url: string, driveId: string, itemId: string, name: string, webUrl: string, size: number}>} SharePoint metadata
   */
  async uploadHomeKitQRPhoto(projectId, equipmentId, file) {
    try {
      // Get project SharePoint folder context
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);

      // Get equipment details for naming
      const { data: equipment, error: equipmentError } = await supabase
        .from('project_equipment')
        .select('name, manufacturer, model')
        .eq('id', equipmentId)
        .single();

      if (equipmentError) throw equipmentError;
      if (!equipment) throw new Error('Equipment not found');

      const equipmentName = equipment.name || equipment.model || 'Unknown';

      // Create folder structure: homekit_codes/{Equipment Name}/
      const folderName = this.sanitizeForFileName(equipmentName);
      const subPath = `${photosSubPath}homekit_codes/${folderName}`;

      // Create consistent filename WITHOUT timestamp so it replaces the existing file
      const extension = this.getFileExtension(file.name);
      const filename = `HOMEKIT_QR_${this.sanitizeForFileName(equipmentName)}.${extension}`;

      // Debug logging
      console.log('HomeKit QR Upload Debug:', {
        rootUrl: uploadRoot,
        subPath,
        filename,
        folderName,
        sanitizedName: this.sanitizeForFileName(equipmentName)
      });

      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(uploadRoot, subPath, filename, file);

      return metadata;
    } catch (error) {
      console.error('Failed to upload HomeKit QR photo:', error);
      throw new Error(`HomeKit QR photo upload failed: ${error.message}`);
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
      // Get project SharePoint folder context
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);

      const pageTitleSafe = pageTitle || 'Floor Plan';

      // Create folder structure: floor_plans/{Page Title}/
      const folderName = this.sanitizeForFileName(pageTitleSafe);
      const subPath = `${photosSubPath}floor_plans/${folderName}`;

      // Create filename
      const timestamp = this.formatTimestamp(new Date());
      const filename = `FLOORPLAN_${this.sanitizeForFileName(pageTitleSafe)}_${timestamp}.png`;

      // Convert blob to File object for upload
      const file = new File([imageBlob], filename, { type: 'image/png' });

      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(uploadRoot, subPath, filename, file);

      return metadata;
    } catch (error) {
      console.error('Failed to upload floor plan:', error);
      throw new Error(`Floor plan upload failed: ${error.message}`);
    }
  }

  /**
   * Resolve and validate the client's root SharePoint folder for a project
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Normalized root URL
   */
  async getProjectRootFolder(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('client_folder_url')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!project) throw new Error('Project not found');

      const normalizedRoot = normalizeSharePointRootUrl(project.client_folder_url) || project.client_folder_url?.trim();

      if (!normalizedRoot) {
        throw new Error('Client Folder URL not configured. Please set Client Folder URL in project settings to enable SharePoint uploads.');
      }

      return normalizedRoot.replace(/\/+$/, '');
    } catch (error) {
      console.error('Failed to resolve project SharePoint root:', error);
      throw error;
    }
  }

  /**
   * Resolve the correct Photos folder context for uploads
   * @param {string} projectId - Project UUID
   * @returns {Promise<{uploadRoot: string, photosSubPath: string}>}
   */
  async getPhotosFolderContext(projectId) {
    const rootUrl = await this.getProjectRootFolder(projectId);
    const trimmedRoot = (rootUrl || '').replace(/\/+$/, '');
    const lowerRoot = trimmedRoot.toLowerCase();

    if (lowerRoot.endsWith(PHOTOS_SEGMENT)) {
      return {
        uploadRoot: trimmedRoot,
        photosSubPath: ''
      };
    }

    return {
      uploadRoot: trimmedRoot,
      photosSubPath: `${PHOTOS_FOLDER_NAME}/`
    };
  }

  /**
   * Get project's Photos folder URL using auto folder management
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Photos folder URL
   */
  async getProjectSharePointUrl(projectId) {
    try {
      const { uploadRoot, photosSubPath } = await this.getPhotosFolderContext(projectId);
      const normalizedSubPath = photosSubPath.replace(/\/+$/, '');
      const photosUrl = normalizedSubPath ? `${uploadRoot}/${normalizedSubPath}` : uploadRoot;

      console.debug?.('[SharePointStorage] Resolved Photos folder', {
        projectId,
        rootUrl: uploadRoot,
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
      const rootUrl = await this.getProjectRootFolder(projectId);
      const procurementUrl = `${rootUrl}/Procurement`;

      console.log('[SharePointStorage] Resolved Procurement folder:', {
        projectId,
        rootUrl,
        procurementUrl,
        message: 'Files should upload to: procurementUrl/Vendor/'
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
      const rootUrl = await this.getProjectRootFolder(projectId);
      const businessUrl = `${rootUrl}/Business`;

      console.debug?.('[SharePointStorage] Resolved Business folder', {
        projectId,
        rootUrl,
        businessUrl
      });

      return businessUrl;
    } catch (error) {
      console.error('Failed to get project business folder URL:', error);
      throw error;
    }
  }

  /**
   * Clean SharePoint URL by removing query parameters while preserving path segments
   * Handles SharePoint sharing links like: https://domain/:f:/path?e=code/SubFolder
   * @param {string} url - SharePoint URL
   * @returns {string} Cleaned URL
   */
  cleanSharePointUrl(url) {
    try {
      if (!url) return url;

      // Check if URL has query parameters
      const questionMarkIndex = url.indexOf('?');
      if (questionMarkIndex === -1) {
        console.log('Cleaned SharePoint URL (no query params):', { original: url, cleaned: url });
        return url;
      }

      // Split into base URL and query string
      const baseUrl = url.substring(0, questionMarkIndex);
      const queryAndPath = url.substring(questionMarkIndex + 1);

      // Check if there are path segments after the query parameter
      // SharePoint sharing links can have format: ?e=code/SubFolder/MorePath
      const pathAfterQuery = queryAndPath.split('/').slice(1).join('/');

      let cleanUrl = baseUrl;
      if (pathAfterQuery) {
        cleanUrl = `${baseUrl}/${pathAfterQuery}`;
      }

      console.log('Cleaned SharePoint URL:', {
        original: url,
        cleaned: cleanUrl,
        preservedPath: pathAfterQuery || '(none)'
      });

      return cleanUrl;
    } catch (error) {
      console.warn('Failed to clean SharePoint URL:', error);
      return url;
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

    // Clean the root URL to remove query parameters
    const cleanedRootUrl = this.cleanSharePointUrl(rootUrl);

    // Decode first to handle already-encoded URLs, then encode to prevent double-encoding
    // This handles cases where user enters URL with %20 or actual spaces
    let graphSafeRootUrl;
    try {
      const decodedUrl = decodeURIComponent(cleanedRootUrl);
      graphSafeRootUrl = encodeURI(decodedUrl);
    } catch (e) {
      // If decoding fails, just encode as-is
      graphSafeRootUrl = encodeURI(cleanedRootUrl);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Convert file to base64
        const fileBase64 = await this.fileToBase64(file);

        // Debug logging
        console.log('SharePoint upload attempt', attempt, {
          originalRootUrl: rootUrl,
          cleanedRootUrl,
          graphSafeRootUrl,
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
            rootUrl: graphSafeRootUrl,
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
   * Get the company SharePoint root URL for global parts document storage
   * @returns {Promise<string>} Company SharePoint root URL
   */
  async getCompanySharePointUrl() {
    try {
      const { data: settings, error } = await supabase
        .from('company_settings')
        .select('company_sharepoint_root_url')
        .limit(1)
        .single();

      if (error) {
        // If no settings exist yet, return null instead of throwing
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return settings?.company_sharepoint_root_url || null;
    } catch (error) {
      console.error('Failed to get company SharePoint URL:', error);
      throw error;
    }
  }

  /**
   * Upload global part document to SharePoint
   * Uploads to company SharePoint: Parts/{Manufacturer}/{PartNumber}/{docType}/
   *
   * @param {File} file - File to upload
   * @param {string} manufacturer - Part manufacturer name
   * @param {string} partNumber - Part number
   * @param {string} docType - Document type: 'submittals', 'schematics', 'manuals', 'technical'
   * @returns {Promise<{url: string, driveId: string, itemId: string, name: string, webUrl: string, size: number}>} SharePoint metadata
   */
  async uploadGlobalPartDocument(file, manufacturer, partNumber, docType = 'submittals') {
    try {
      // Get company SharePoint root URL
      const rootUrl = await this.getCompanySharePointUrl();

      if (!rootUrl) {
        throw new Error('Company SharePoint URL not configured. Please set it in Admin → Company Settings.');
      }

      // Sanitize folder names
      const sanitizedManufacturer = this.sanitizeForFileName(manufacturer || 'Unknown');
      const sanitizedPartNumber = this.sanitizeForFileName(partNumber || 'Unknown');

      // Validate document type
      const validDocTypes = ['submittals', 'schematics', 'manuals', 'technical'];
      const normalizedDocType = validDocTypes.includes(docType) ? docType : 'submittals';

      // Build folder path: Parts/{Manufacturer}/{PartNumber}/{docType}/
      const subPath = `Parts/${sanitizedManufacturer}/${sanitizedPartNumber}/${normalizedDocType}`;

      // Create filename with timestamp to allow multiple versions
      const timestamp = this.formatTimestamp(new Date());
      const extension = this.getFileExtension(file.name);
      const originalName = this.sanitizeForFileName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
      const filename = `${originalName}_${timestamp}.${extension}`;

      console.log('Global Part Document Upload Debug:', {
        rootUrl,
        subPath,
        filename,
        manufacturer: sanitizedManufacturer,
        partNumber: sanitizedPartNumber,
        docType: normalizedDocType,
        fileSize: file.size,
        fileType: file.type
      });

      // Upload to SharePoint - returns metadata object
      const metadata = await this.uploadToSharePoint(rootUrl, subPath, filename, file);

      return metadata;
    } catch (error) {
      console.error('Failed to upload global part document:', error);
      throw new Error(`Global part document upload failed: ${error.message}`);
    }
  }

  /**
   * Delete a file from SharePoint via Graph API
   * @param {string} driveId
   * @param {string} itemId
   * @returns {Promise<boolean>}
   */
  async deleteFile(driveId, itemId) {
    if (!driveId || !itemId) {
      console.warn('deleteFile skipped - missing drive/item ID');
      return false;
    }

    const response = await fetch('/api/graph-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', driveId, itemId })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to delete SharePoint file (${response.status})`);
    }

    return true;
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
