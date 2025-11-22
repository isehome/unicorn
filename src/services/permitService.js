import { supabase } from '../lib/supabase';
import { sharePointStorageService } from './sharePointStorageService';

/**
 * Service for managing project permits, inspections, and permit documents
 * Documents are stored in SharePoint using the same pattern as wire drop photos
 */
class PermitService {
  /**
   * Get all permits for a project
   * @param {string} projectId - The project ID
   * @returns {Promise<Array>} Array of permit records
   */
  async getProjectPermits(projectId) {
    try {
      const { data, error } = await supabase
        .from('project_permits')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user profiles separately if needed
      const permits = data || [];
      if (permits.length > 0) {
        const userIds = new Set();
        permits.forEach(permit => {
          if (permit.created_by) userIds.add(permit.created_by);
          if (permit.updated_by) userIds.add(permit.updated_by);
          if (permit.rough_in_completed_by) userIds.add(permit.rough_in_completed_by);
          if (permit.final_inspection_completed_by) userIds.add(permit.final_inspection_completed_by);
        });

        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', Array.from(userIds));

          const profileMap = {};
          (profiles || []).forEach(profile => {
            profileMap[profile.id] = profile;
          });

          // Attach user info to permits
          permits.forEach(permit => {
            permit.created_by_user = profileMap[permit.created_by] || null;
            permit.updated_by_user = profileMap[permit.updated_by] || null;
            permit.rough_in_user = profileMap[permit.rough_in_completed_by] || null;
            permit.final_inspection_user = profileMap[permit.final_inspection_completed_by] || null;
          });
        }
      }

      return permits;
    } catch (error) {
      console.error('Error fetching project permits:', error);
      throw error;
    }
  }

  /**
   * Get a single permit by ID
   * @param {string} permitId - The permit ID
   * @returns {Promise<Object>} Permit record
   */
  async getPermit(permitId) {
    try {
      const { data, error } = await supabase
        .from('project_permits')
        .select('*')
        .eq('id', permitId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching permit:', error);
      throw error;
    }
  }

  /**
   * Create a new permit
   * @param {Object} permitData - The permit data
   * @param {File} documentFile - Optional PDF file for the permit document
   * @returns {Promise<Object>} Created permit record
   */
  async createPermit(permitData, documentFile = null) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      let documentUrl = null;
      let documentName = null;

      // Upload document if provided
      if (documentFile) {
        const uploadResult = await this.uploadPermitDocument(
          permitData.project_id,
          documentFile,
          permitData.permit_number // Pass permit number for filename
        );
        documentUrl = uploadResult.url || uploadResult.webUrl;
        documentName = uploadResult.name || documentFile.name;
      }

      // Create permit record
      const { data, error } = await supabase
        .from('project_permits')
        .insert({
          ...permitData,
          permit_document_url: documentUrl,
          permit_document_name: documentName,
          created_by: user?.id,
          updated_by: user?.id
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating permit:', error);
      throw error;
    }
  }

  /**
   * Update a permit
   * @param {string} permitId - The permit ID
   * @param {Object} updates - The fields to update
   * @param {File} documentFile - Optional new PDF file for the permit document
   * @returns {Promise<Object>} Updated permit record
   */
  async updatePermit(permitId, updates, documentFile = null) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Get existing permit to access project_id and old document
      const existingPermit = await this.getPermit(permitId);

      let documentUrl = updates.permit_document_url;
      let documentName = updates.permit_document_name;

      // Upload new document if provided
      if (documentFile) {
        // Delete old document if exists
        if (existingPermit.permit_document_url) {
          await this.deletePermitDocument(existingPermit.permit_document_url);
        }

        const uploadResult = await this.uploadPermitDocument(
          existingPermit.project_id,
          documentFile,
          updates.permit_number || existingPermit.permit_number // Pass permit number for filename
        );
        documentUrl = uploadResult.url || uploadResult.webUrl;
        documentName = uploadResult.name || documentFile.name;
      }

      // Update permit record
      const { data, error } = await supabase
        .from('project_permits')
        .update({
          ...updates,
          permit_document_url: documentUrl,
          permit_document_name: documentName,
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating permit:', error);
      throw error;
    }
  }

  /**
   * Delete a permit
   * @param {string} permitId - The permit ID
   * @returns {Promise<void>}
   */
  async deletePermit(permitId) {
    try {
      // Get permit to access document URL
      const permit = await this.getPermit(permitId);

      // Delete document if exists
      if (permit.permit_document_url) {
        await this.deletePermitDocument(permit.permit_document_url);
      }

      // Delete permit record
      const { error } = await supabase
        .from('project_permits')
        .delete()
        .eq('id', permitId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting permit:', error);
      throw error;
    }
  }

  /**
   * Mark rough-in inspection as completed
   * @param {string} permitId - The permit ID
   * @param {string} inspectionDate - The inspection date
   * @returns {Promise<Object>} Updated permit record
   */
  async completeRoughInInspection(permitId, inspectionDate) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          rough_in_completed: true,
          rough_in_date: inspectionDate,
          rough_in_completed_by: user?.id,
          rough_in_completed_at: new Date().toISOString(),
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error completing rough-in inspection:', error);
      throw error;
    }
  }

  /**
   * Mark final inspection as completed
   * @param {string} permitId - The permit ID
   * @param {string} inspectionDate - The inspection date
   * @returns {Promise<Object>} Updated permit record
   */
  async completeFinalInspection(permitId, inspectionDate) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          final_inspection_completed: true,
          final_inspection_date: inspectionDate,
          final_inspection_completed_by: user?.id,
          final_inspection_completed_at: new Date().toISOString(),
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error completing final inspection:', error);
      throw error;
    }
  }

  /**
   * Unmark rough-in inspection
   * @param {string} permitId - The permit ID
   * @returns {Promise<Object>} Updated permit record
   */
  async uncompleteRoughInInspection(permitId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          rough_in_completed: false,
          rough_in_completed_by: null,
          rough_in_completed_at: null,
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error uncompleting rough-in inspection:', error);
      throw error;
    }
  }

  /**
   * Unmark final inspection
   * @param {string} permitId - The permit ID
   * @returns {Promise<Object>} Updated permit record
   */
  async uncompleteFinalInspection(permitId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          final_inspection_completed: false,
          final_inspection_completed_by: null,
          final_inspection_completed_at: null,
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error uncompleting final inspection:', error);
      throw error;
    }
  }

  /**
   * Update rough-in inspection target date
   * @param {string} permitId - The permit ID
   * @param {string} targetDate - The target date (YYYY-MM-DD format)
   * @returns {Promise<Object>} Updated permit record
   */
  async updateRoughInTargetDate(permitId, targetDate) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          rough_in_target_date: targetDate,
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating rough-in target date:', error);
      throw error;
    }
  }

  /**
   * Update final inspection target date
   * @param {string} permitId - The permit ID
   * @param {string} targetDate - The target date (YYYY-MM-DD format)
   * @returns {Promise<Object>} Updated permit record
   */
  async updateFinalInspectionTargetDate(permitId, targetDate) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('project_permits')
        .update({
          final_inspection_target_date: targetDate,
          updated_by: user?.id
        })
        .eq('id', permitId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating final inspection target date:', error);
      throw error;
    }
  }

  /**
   * Upload a permit document to SharePoint
   * Uses the same pattern as wire drop photo uploads
   * @param {string} projectId - The project ID
   * @param {File} file - The PDF file to upload
   * @param {string} permitNumber - The permit number for naming
   * @returns {Promise<Object>} Object with url and metadata
   */
  async uploadPermitDocument(projectId, file, permitNumber = '') {
    try {
      // Validate file type
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed for permit documents');
      }

      // Get Business folder URL using auto folder management
      const sharePointUrl = await sharePointStorageService.getProjectBusinessUrl(projectId);

      // Create subfolder for permits under Business: Business/permits/
      const subPath = 'permits';

      // Create filename with permit number and timestamp
      const timestamp = sharePointStorageService.formatTimestamp(new Date());
      const permitLabel = permitNumber ? sharePointStorageService.sanitizeForFileName(permitNumber) : 'PERMIT';
      const extension = sharePointStorageService.getFileExtension(file.name);
      const filename = `PERMIT_${permitLabel}_${timestamp}.${extension}`;

      console.log('Permit upload debug:', {
        sharePointUrl,
        subPath,
        filename,
        fileSize: file.size
      });

      // Upload using the same service wire drops use
      const uploadResult = await sharePointStorageService.uploadToSharePoint(
        sharePointUrl,
        subPath,
        filename,
        file
      );

      console.log('Permit uploaded successfully:', uploadResult);

      // Return metadata in the same format as wire drops
      return {
        url: uploadResult.url || uploadResult.webUrl,
        driveId: uploadResult.driveId,
        itemId: uploadResult.itemId,
        name: uploadResult.name,
        webUrl: uploadResult.webUrl
      };
    } catch (error) {
      console.error('Error uploading permit document:', error);
      throw new Error(`Failed to upload permit document: ${error.message}`);
    }
  }

  /**
   * Delete a permit document from SharePoint
   * Note: For SharePoint documents, we don't actively delete files.
   * Files remain in SharePoint for record-keeping purposes.
   * @param {string} fileUrl - The URL of the file to delete
   * @returns {Promise<void>}
   */
  async deletePermitDocument(fileUrl) {
    try {
      // For SharePoint documents, we keep them for audit trail
      // The database record removal is sufficient
      console.log('Permit document retained in SharePoint:', fileUrl);

      // TODO: If active deletion is required in the future, implement SharePoint Graph API delete
      // This would require extracting driveId and itemId from the URL and calling:
      // DELETE /drives/{driveId}/items/{itemId}
    } catch (error) {
      console.error('Error in deletePermitDocument:', error);
      // Don't throw error for delete failures - log and continue
    }
  }

  /**
   * Get a URL for accessing a permit document
   * For SharePoint documents, the webUrl is directly accessible to authenticated users
   * @param {string} fileUrl - The SharePoint webUrl of the permit document
   * @param {number} expiresIn - Not used for SharePoint (kept for compatibility)
   * @returns {Promise<string>} Document URL
   */
  async getSignedUrl(fileUrl, expiresIn = 3600) {
    try {
      // For SharePoint documents, return the direct URL
      // SharePoint handles authentication and permissions
      return fileUrl;
    } catch (error) {
      console.error('Error getting document URL:', error);
      throw error;
    }
  }
}

export const permitService = new PermitService();
export default permitService;
