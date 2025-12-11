import { supabase } from '../lib/supabase';
import { sharePointStorageService } from './sharePointStorageService';
import { compressImage } from '../lib/images';

/**
 * Service for managing shade verification photos.
 * Follows the same pattern as wireDropService for consistency.
 */
export const shadePhotoService = {
    /**
     * Get all photos for a shade
     * @param {string} shadeId - The shade UUID
     * @returns {Promise<Array>} Array of photo objects
     */
    async getPhotos(shadeId) {
        const { data, error } = await supabase
            .from('shade_photos')
            .select('*')
            .eq('shade_id', shadeId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Get photos for a specific measurement set (m1 or m2)
     * @param {string} shadeId - The shade UUID
     * @param {string} measurementSet - 'm1' or 'm2'
     * @returns {Promise<Array>} Array of photo objects
     */
    async getPhotosBySet(shadeId, measurementSet) {
        const { data, error } = await supabase
            .from('shade_photos')
            .select('*')
            .eq('shade_id', shadeId)
            .eq('measurement_set', measurementSet)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Upload a new photo for a shade
     * @param {Object} params - Upload parameters
     * @param {string} params.shadeId - The shade UUID
     * @param {string} params.projectId - The project UUID
     * @param {string} params.measurementSet - 'm1' or 'm2'
     * @param {File} params.file - The image file to upload
     * @param {Object} params.user - Current user object { id, name }
     * @returns {Promise<Object>} The created photo record
     */
    async uploadPhoto({ shadeId, projectId, measurementSet, file, user }) {
        if (!shadeId || !projectId || !measurementSet || !file) {
            throw new Error('Missing required parameters for photo upload');
        }

        // Compress the image first
        const compressedFile = await compressImage(file);

        // Upload to SharePoint
        const result = await sharePointStorageService.uploadShadePhoto(
            projectId,
            shadeId,
            measurementSet,
            compressedFile
        );

        // result contains: { url, driveId, itemId, name, webUrl, size }
        const photoRecord = {
            shade_id: shadeId,
            project_id: projectId,
            measurement_set: measurementSet,
            photo_url: result.url || result.webUrl,
            sharepoint_drive_id: result.driveId,
            sharepoint_item_id: result.itemId,
            file_name: result.name || file.name,
            file_size: result.size || file.size,
            uploaded_by: user?.id,
            uploaded_by_name: user?.name || user?.displayName || 'Unknown'
        };

        const { data, error } = await supabase
            .from('shade_photos')
            .insert([photoRecord])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Replace an existing photo (delete old, upload new)
     * @param {string} photoId - The photo UUID to replace
     * @param {File} file - The new image file
     * @param {Object} user - Current user object { id, name }
     * @returns {Promise<Object>} The updated photo record
     */
    async replacePhoto(photoId, file, user) {
        // Get existing photo
        const { data: existing, error: fetchError } = await supabase
            .from('shade_photos')
            .select('*')
            .eq('id', photoId)
            .single();

        if (fetchError) throw fetchError;
        if (!existing) throw new Error('Photo not found');

        // Compress the new image
        const compressedFile = await compressImage(file);

        // Upload new photo to SharePoint
        const result = await sharePointStorageService.uploadShadePhoto(
            existing.project_id,
            existing.shade_id,
            existing.measurement_set,
            compressedFile
        );

        // Update the record with new data
        const updates = {
            photo_url: result.url || result.webUrl,
            sharepoint_drive_id: result.driveId,
            sharepoint_item_id: result.itemId,
            file_name: result.name || file.name,
            file_size: result.size || file.size,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
            updated_by_name: user?.name || user?.displayName || 'Unknown'
        };

        const { data, error } = await supabase
            .from('shade_photos')
            .update(updates)
            .eq('id', photoId)
            .select()
            .single();

        if (error) throw error;

        // Optionally try to delete old file from SharePoint (best effort)
        if (existing.sharepoint_drive_id && existing.sharepoint_item_id) {
            try {
                await sharePointStorageService.deleteFile(
                    existing.sharepoint_drive_id,
                    existing.sharepoint_item_id
                );
            } catch (deleteErr) {
                console.warn('[shadePhotoService] Failed to delete old SharePoint file:', deleteErr);
                // Continue - don't fail the replace operation
            }
        }

        return data;
    },

    /**
     * Soft-delete a photo
     * @param {string} photoId - The photo UUID to delete
     * @param {Object} user - Current user object { id }
     * @returns {Promise<void>}
     */
    async deletePhoto(photoId, user) {
        // Get existing photo for SharePoint deletion
        const { data: existing, error: fetchError } = await supabase
            .from('shade_photos')
            .select('*')
            .eq('id', photoId)
            .single();

        if (fetchError) throw fetchError;

        // Soft delete in database
        const { error } = await supabase
            .from('shade_photos')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: user?.id
            })
            .eq('id', photoId);

        if (error) throw error;

        // Try to delete from SharePoint (best effort)
        if (existing?.sharepoint_drive_id && existing?.sharepoint_item_id) {
            try {
                await sharePointStorageService.deleteFile(
                    existing.sharepoint_drive_id,
                    existing.sharepoint_item_id
                );
            } catch (deleteErr) {
                console.warn('[shadePhotoService] Failed to delete SharePoint file:', deleteErr);
            }
        }
    },

    /**
     * Hard-delete a photo (permanent)
     * @param {string} photoId - The photo UUID to delete
     * @returns {Promise<void>}
     */
    async hardDeletePhoto(photoId) {
        const { error } = await supabase
            .from('shade_photos')
            .delete()
            .eq('id', photoId);

        if (error) throw error;
    },

    /**
     * Build photo payload for PhotoViewer
     * @param {Object} photo - Photo record from database
     * @returns {Object} Photo payload for PhotoViewerModal
     */
    buildPhotoViewerPayload(photo) {
        return {
            id: photo.id,
            url: photo.photo_url,
            sharepoint_drive_id: photo.sharepoint_drive_id,
            sharepoint_item_id: photo.sharepoint_item_id,
            file_name: photo.file_name || 'Verification Photo',
            uploaded_by: photo.uploaded_by_name,
            created_at: photo.created_at,
            updated_at: photo.updated_at,
            updated_by: photo.updated_by_name
        };
    }
};
