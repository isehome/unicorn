/**
 * SharePoint Folder Service
 * Handles automatic folder structure initialization and management
 */

import { supabase } from '../lib/supabase';

// Standard subfolder structure for all projects
const STANDARD_SUBFOLDERS = {
  photos: 'Photos',
  files: 'File',
  procurement: 'Procurement',
  design: 'Design',
  data: 'Data',
  business: 'Business'
};

class SharePointFolderService {
  /**
   * Initialize SharePoint folder structure for a project
   * Verifies subfolders exist and creates them if missing
   * @param {string} projectId - Project UUID
   * @param {string} rootFolderUrl - SharePoint root folder URL (e.g., https://tenant.sharepoint.com/sites/SiteName/Shared Documents/ClientName)
   * @returns {Promise<Object>} Subfolder URLs
   */
  async initializeProjectFolders(projectId, rootFolderUrl) {
    try {
      console.log(`Initializing SharePoint folders for project ${projectId}`);
      console.log(`Root folder: ${rootFolderUrl}`);

      // Validate root URL
      if (!rootFolderUrl || !this.isValidSharePointUrl(rootFolderUrl)) {
        throw new Error('Invalid SharePoint URL. Please provide a valid Document Library URL.');
      }

      // Check if it's a Site Pages URL (common mistake)
      if (rootFolderUrl.includes('/SitePages/')) {
        throw new Error('Cannot use a Site Pages URL. Please provide a Document Library URL (e.g., Shared Documents).');
      }

      // Call backend API to verify/create subfolders
      const response = await fetch('/api/sharepoint-init-folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rootFolderUrl,
          subfolders: Object.values(STANDARD_SUBFOLDERS)
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to initialize folders: ${response.status}`);
      }

      const result = await response.json();

      // result contains:
      // {
      //   rootDriveId: string,
      //   rootFolderId: string,
      //   subfolders: {
      //     Photos: { driveId, itemId, webUrl },
      //     File: { driveId, itemId, webUrl },
      //     ...
      //   }
      // }

      // Store the folder structure in the project record
      await this.saveProjectFolderStructure(projectId, rootFolderUrl, result);

      console.log('SharePoint folders initialized successfully:', result);

      return {
        rootUrl: rootFolderUrl,
        photos: result.subfolders[STANDARD_SUBFOLDERS.photos]?.webUrl,
        files: result.subfolders[STANDARD_SUBFOLDERS.files]?.webUrl,
        procurement: result.subfolders[STANDARD_SUBFOLDERS.procurement]?.webUrl,
        design: result.subfolders[STANDARD_SUBFOLDERS.design]?.webUrl,
        data: result.subfolders[STANDARD_SUBFOLDERS.data]?.webUrl,
        business: result.subfolders[STANDARD_SUBFOLDERS.business]?.webUrl
      };
    } catch (error) {
      console.error('Failed to initialize SharePoint folders:', error);
      throw error;
    }
  }

  /**
   * Save project folder structure to database
   * @param {string} projectId - Project UUID
   * @param {string} rootUrl - Root folder URL
   * @param {Object} folderStructure - Folder structure from API
   */
  async saveProjectFolderStructure(projectId, rootUrl, folderStructure) {
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          sharepoint_root_url: rootUrl,
          sharepoint_folder_structure: folderStructure,
          // Keep old fields for backward compatibility (can be removed later)
          one_drive_photos: folderStructure.subfolders[STANDARD_SUBFOLDERS.photos]?.webUrl || rootUrl,
          one_drive_files: folderStructure.subfolders[STANDARD_SUBFOLDERS.files]?.webUrl || rootUrl,
          one_drive_procurement: folderStructure.subfolders[STANDARD_SUBFOLDERS.procurement]?.webUrl || rootUrl
        })
        .eq('id', projectId);

      if (error) throw error;

      console.log('Project folder structure saved to database');
    } catch (error) {
      console.error('Failed to save folder structure:', error);
      throw error;
    }
  }

  /**
   * Get folder structure for a project
   * @param {string} projectId - Project UUID
   * @returns {Promise<Object>} Folder structure
   */
  async getProjectFolderStructure(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('sharepoint_root_url, sharepoint_folder_structure, one_drive_photos')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!project) throw new Error('Project not found');

      // If we have the new structure, use it
      if (project.sharepoint_folder_structure) {
        return {
          rootUrl: project.sharepoint_root_url,
          structure: project.sharepoint_folder_structure,
          photos: project.sharepoint_folder_structure.subfolders[STANDARD_SUBFOLDERS.photos]?.webUrl,
          files: project.sharepoint_folder_structure.subfolders[STANDARD_SUBFOLDERS.files]?.webUrl,
          procurement: project.sharepoint_folder_structure.subfolders[STANDARD_SUBFOLDERS.procurement]?.webUrl
        };
      }

      // Fallback to old single URL
      if (project.one_drive_photos) {
        return {
          rootUrl: project.one_drive_photos,
          structure: null,
          photos: project.one_drive_photos
        };
      }

      throw new Error('No SharePoint folder configured for this project');
    } catch (error) {
      console.error('Failed to get folder structure:', error);
      throw error;
    }
  }

  /**
   * Get the Photos subfolder URL for a project
   * @param {string} projectId - Project UUID
   * @returns {Promise<string>} Photos folder URL
   */
  async getPhotosFolderUrl(projectId) {
    try {
      const structure = await this.getProjectFolderStructure(projectId);

      if (!structure.photos) {
        throw new Error('Photos folder not configured. Please initialize SharePoint folders for this project.');
      }

      return structure.photos;
    } catch (error) {
      console.error('Failed to get photos folder:', error);
      throw error;
    }
  }

  /**
   * Validate SharePoint URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid
   */
  isValidSharePointUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);

      // Check if it's a SharePoint domain
      if (!urlObj.hostname.includes('sharepoint.com')) {
        return false;
      }

      // Check if it's not a Site Pages URL
      if (url.includes('/SitePages/')) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract site and folder path from SharePoint URL
   * @param {string} url - SharePoint URL
   * @returns {Object} {siteUrl, folderPath}
   */
  parseSharePointUrl(url) {
    try {
      // Handle different URL formats:
      // 1. https://tenant.sharepoint.com/sites/SiteName/Shared Documents/Folder
      // 2. https://tenant.sharepoint.com/:f:/s/SiteName/FOLDER_ID

      if (url.includes('/:f:/')) {
        // Share link format - will be resolved by backend
        return {
          siteUrl: url,
          folderPath: '',
          isShareLink: true
        };
      }

      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      // Find the document library (usually "Shared Documents" or "Documents")
      const docLibIndex = pathParts.findIndex(p =>
        p.toLowerCase() === 'shared documents' ||
        p.toLowerCase() === 'documents'
      );

      if (docLibIndex === -1) {
        throw new Error('Could not find document library in URL');
      }

      const siteUrl = `${urlObj.origin}/${pathParts.slice(0, docLibIndex + 1).join('/')}`;
      const folderPath = pathParts.slice(docLibIndex + 1).join('/');

      return {
        siteUrl,
        folderPath,
        isShareLink: false
      };
    } catch (error) {
      console.error('Failed to parse SharePoint URL:', error);
      throw new Error('Invalid SharePoint URL format');
    }
  }

  /**
   * Test folder access (useful for validating setup)
   * @param {string} folderUrl - Folder URL to test
   * @returns {Promise<boolean>} True if accessible
   */
  async testFolderAccess(folderUrl) {
    try {
      const response = await fetch('/api/sharepoint-test-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderUrl })
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.accessible === true;
    } catch (error) {
      console.error('Failed to test folder access:', error);
      return false;
    }
  }
}

export const sharePointFolderService = new SharePointFolderService();
