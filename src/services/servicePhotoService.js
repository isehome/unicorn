/**
 * servicePhotoService.js
 * Service for managing service ticket photos in SharePoint
 * Folder structure: Service/{CustomerName}/{TicketNumber}/
 */

import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/images';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Photo categories
export const PHOTO_CATEGORIES = {
  before: { label: 'Before', description: 'Pre-work condition' },
  during: { label: 'During', description: 'Work in progress' },
  after: { label: 'After', description: 'Completed work' },
  documentation: { label: 'Documentation', description: 'Manuals, notes, receipts' }
};

export const servicePhotoService = {
  /**
   * Get the SharePoint root URL for service photos
   * This should be configured in settings
   */
  async getServiceSharePointRoot() {
    // Try to get from settings table
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'sharepoint_service_root')
      .single();

    if (error || !data?.value) {
      // Fallback to site configuration
      const { data: siteConfig } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'sharepoint_root_url')
        .single();

      if (siteConfig?.value) {
        // Append /Service to the root
        return `${siteConfig.value.replace(/\/+$/, '')}/Service`;
      }

      throw new Error('SharePoint service root URL not configured. Please configure it in Settings.');
    }

    return data.value.replace(/\/+$/, '');
  },

  /**
   * Get photos for a service ticket
   */
  async getPhotosForTicket(ticketId) {
    if (!ticketId) return [];

    const { data, error } = await supabase
      .from('service_ticket_photos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[servicePhotoService] Failed to get photos:', error);
      throw new Error(error.message || 'Failed to get photos');
    }

    return data || [];
  },

  /**
   * Get photos grouped by category
   */
  async getPhotosGroupedByCategory(ticketId) {
    const photos = await this.getPhotosForTicket(ticketId);

    const grouped = {
      before: [],
      during: [],
      after: [],
      documentation: []
    };

    photos.forEach(photo => {
      if (grouped[photo.category]) {
        grouped[photo.category].push(photo);
      }
    });

    return grouped;
  },

  /**
   * Get photo counts by category
   */
  async getPhotoCounts(ticketId) {
    if (!ticketId) return {};

    const { data, error } = await supabase.rpc('get_service_ticket_photo_counts', {
      p_ticket_id: ticketId
    });

    if (error) {
      console.error('[servicePhotoService] Failed to get photo counts:', error);
      return {};
    }

    const counts = {};
    (data || []).forEach(row => {
      counts[row.category] = row.count;
    });

    return counts;
  },

  /**
   * Build the SharePoint folder path for a service ticket
   * Structure: Service/{CustomerName}/{TicketNumber}/{Category}/
   */
  buildFolderPath(customerName, ticketNumber, category = null) {
    const sanitizedCustomer = this.sanitizeForFileName(customerName || 'Unknown');
    const sanitizedTicket = this.sanitizeForFileName(ticketNumber || 'Unknown');

    let path = `${sanitizedCustomer}/${sanitizedTicket}`;
    if (category) {
      path += `/${category}`;
    }

    return path;
  },

  /**
   * Upload a photo for a service ticket
   */
  async uploadPhoto({ ticketId, file, category, caption, user }) {
    if (!ticketId) throw new Error('Ticket ID is required');
    if (!file) throw new Error('File is required');
    if (!category) throw new Error('Category is required');

    // Get ticket details for folder naming
    const { data: ticket, error: ticketError } = await supabase
      .from('service_tickets')
      .select(`
        ticket_number,
        customer:contacts!service_tickets_customer_id_fkey(full_name)
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError) throw ticketError;
    if (!ticket) throw new Error('Ticket not found');

    const customerName = ticket.customer?.full_name || 'Unknown Customer';
    const ticketNumber = ticket.ticket_number || ticketId.substring(0, 8);

    // Get SharePoint root
    const rootUrl = await this.getServiceSharePointRoot();

    // Build folder path
    const folderPath = this.buildFolderPath(customerName, ticketNumber, category);

    // Compress the image
    const compressedFile = await compressImage(file);

    // Generate filename
    const timestamp = this.formatTimestamp(new Date());
    const extension = this.getFileExtension(file.name);
    const filename = `${category.toUpperCase()}_${timestamp}.${extension}`;

    console.log('[servicePhotoService] Uploading photo:', {
      rootUrl,
      folderPath,
      filename,
      category
    });

    // Upload to SharePoint
    const metadata = await this.uploadToSharePoint(rootUrl, folderPath, filename, compressedFile);

    // Save to database
    const photoRecord = {
      ticket_id: ticketId,
      photo_url: metadata.url || metadata.webUrl,
      sharepoint_drive_id: metadata.driveId,
      sharepoint_item_id: metadata.itemId,
      category,
      caption: caption || null,
      taken_at: new Date().toISOString(),
      uploaded_by: user?.id || null,
      uploaded_by_name: user?.name || user?.full_name || user?.email || 'Unknown',
      file_name: metadata.name || filename,
      file_size: metadata.size || file.size,
      content_type: file.type || 'image/jpeg'
    };

    const { data, error } = await supabase
      .from('service_ticket_photos')
      .insert([photoRecord])
      .select()
      .single();

    if (error) {
      console.error('[servicePhotoService] Failed to save photo record:', error);
      throw new Error(error.message || 'Failed to save photo');
    }

    // Update ticket's SharePoint folder URL if not set
    if (!ticket.sharepoint_folder_url) {
      const folderUrl = `${rootUrl}/${this.buildFolderPath(customerName, ticketNumber)}`;
      await supabase
        .from('service_tickets')
        .update({ sharepoint_folder_url: folderUrl })
        .eq('id', ticketId);
    }

    return data;
  },

  /**
   * Delete a photo
   */
  async deletePhoto(photoId, user) {
    if (!photoId) throw new Error('Photo ID is required');

    // Get photo details
    const { data: photo, error: fetchError } = await supabase
      .from('service_ticket_photos')
      .select('*')
      .eq('id', photoId)
      .single();

    if (fetchError) throw fetchError;
    if (!photo) throw new Error('Photo not found');

    // Delete from database
    const { error } = await supabase
      .from('service_ticket_photos')
      .delete()
      .eq('id', photoId);

    if (error) {
      console.error('[servicePhotoService] Failed to delete photo:', error);
      throw new Error(error.message || 'Failed to delete photo');
    }

    // Try to delete from SharePoint (best effort)
    if (photo.sharepoint_drive_id && photo.sharepoint_item_id) {
      try {
        await this.deleteFromSharePoint(photo.sharepoint_drive_id, photo.sharepoint_item_id);
      } catch (spError) {
        console.warn('[servicePhotoService] Failed to delete from SharePoint:', spError);
        // Continue - database record is already deleted
      }
    }

    return { success: true };
  },

  /**
   * Update photo caption
   */
  async updateCaption(photoId, caption) {
    if (!photoId) throw new Error('Photo ID is required');

    const { data, error } = await supabase
      .from('service_ticket_photos')
      .update({ caption })
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      console.error('[servicePhotoService] Failed to update caption:', error);
      throw new Error(error.message || 'Failed to update caption');
    }

    return data;
  },

  /**
   * Upload file to SharePoint with retry logic
   */
  async uploadToSharePoint(rootUrl, subPath, filename, file) {
    let lastError;

    // Clean the root URL
    const cleanedRootUrl = rootUrl.replace(/\/+$/, '');

    // Encode for Graph API
    let graphSafeRootUrl;
    try {
      const decodedUrl = decodeURIComponent(cleanedRootUrl);
      graphSafeRootUrl = encodeURI(decodedUrl);
    } catch {
      graphSafeRootUrl = encodeURI(cleanedRootUrl);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Convert file to base64
        const fileBase64 = await this.fileToBase64(file);

        console.log('[servicePhotoService] Upload attempt', attempt, {
          rootUrl: graphSafeRootUrl,
          subPath,
          filename,
          fileSize: file.size
        });

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

        console.log('[servicePhotoService] Upload successful:', result);

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
        console.error(`[servicePhotoService] Upload attempt ${attempt} failed:`, error);

        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          if (attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`Rate limited. Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, INITIAL_RETRY_DELAY));
        }
      }
    }

    throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
  },

  /**
   * Delete file from SharePoint
   */
  async deleteFromSharePoint(driveId, itemId) {
    if (!driveId || !itemId) return false;

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
  },

  /**
   * Sanitize text for filename
   */
  sanitizeForFileName(text) {
    if (!text) return 'Unknown';

    let sanitized = text
      .trim()
      .replace(/[~"#%&*:<>?/\\{|}]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^\w.-]/g, '')
      .replace(/_{2,}/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .substring(0, 50)
      .replace(/[._-]+$/g, '');

    if (!sanitized || sanitized.length === 0) {
      return 'Unknown';
    }

    if (sanitized.startsWith('.')) {
      sanitized = 'File' + sanitized;
    }

    return sanitized;
  },

  /**
   * Format timestamp for filenames
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  },

  /**
   * Get file extension
   */
  getFileExtension(filename) {
    if (!filename) return 'jpg';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
  },

  /**
   * Convert File to base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

export default servicePhotoService;
