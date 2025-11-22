/**
 * Sync Service
 *
 * Handles automatic synchronization of queued photo uploads
 * when the device reconnects to the internet.
 *
 * Features:
 * - Auto-sync on reconnect
 * - Periodic sync every 2 minutes
 * - Manual sync trigger
 * - Progress tracking
 * - Error handling with retry logic
 */

import { listUploads, removeUpload, updateUpload } from '../lib/offline';
import { sharePointStorageService } from './sharePointStorageService';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.listeners = new Set();
    this.syncInterval = null;
  }

  /**
   * Subscribe to sync events
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of sync events
   * @param {Object} event - Event object
   */
  notify(event) {
    console.log('[Sync Service]', event.type, event);
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        console.error('[Sync Service] Listener error:', error);
      }
    });
  }

  /**
   * Process the entire upload queue
   * @returns {Promise<void>}
   */
  async processQueue() {
    // Don't run if already syncing or offline
    if (this.isSyncing || !navigator.onLine) {
      console.log('[Sync Service] Skipping sync:', {
        isSyncing: this.isSyncing,
        isOnline: navigator.onLine
      });
      return;
    }

    this.isSyncing = true;
    this.notify({ type: 'sync-started' });

    try {
      const uploads = await listUploads();
      console.log(`[Sync Service] Processing ${uploads.length} uploads`);

      if (uploads.length === 0) {
        this.notify({ type: 'sync-completed', successCount: 0, errorCount: 0 });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const upload of uploads) {
        // Skip already completed or currently uploading items
        if (upload.status === 'completed' || upload.status === 'uploading') {
          continue;
        }

        // Skip failed uploads that have exceeded retry limit
        if (upload.status === 'failed' && upload.retryCount >= 3) {
          console.warn('[Sync Service] Skipping failed upload (max retries):', upload.id);
          errorCount++;
          continue;
        }

        try {
          this.notify({ type: 'upload-started', upload });
          await updateUpload(upload.id, { status: 'uploading' });

          // Process based on type
          await this.processUpload(upload);

          // Remove from queue on success
          await removeUpload(upload.id);
          successCount++;

          this.notify({ type: 'upload-success', upload });
        } catch (error) {
          console.error('[Sync Service] Upload failed:', upload.id, error);
          errorCount++;

          // Update retry count and status
          const retryCount = (upload.retryCount || 0) + 1;
          const status = retryCount >= 3 ? 'failed' : 'pending';

          await updateUpload(upload.id, {
            status,
            retryCount,
            lastError: error.message
          });

          this.notify({ type: 'upload-failed', upload, error });
        }
      }

      this.notify({
        type: 'sync-completed',
        successCount,
        errorCount
      });

      // Invalidate queries to refresh UI
      if (successCount > 0) {
        queryClient.invalidateQueries(['issues']);
        queryClient.invalidateQueries(['wire-drops']);
      }
    } catch (error) {
      console.error('[Sync Service] Queue processing error:', error);
      this.notify({ type: 'sync-error', error });
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process a single upload based on its type
   * @param {Object} upload - Upload record
   * @returns {Promise<void>}
   */
  async processUpload(upload) {
    console.log('[Sync Service] Processing upload:', upload.type, upload.id);

    switch (upload.type) {
      case 'issue_photo':
        return this.uploadIssuePhoto(upload);
      case 'wire_drop_photo':
        return this.uploadWireDropPhoto(upload);
      default:
        throw new Error(`Unknown upload type: ${upload.type}`);
    }
  }

  /**
   * Upload issue photo to SharePoint and save metadata to Supabase
   * @param {Object} upload - Upload record
   * @returns {Promise<void>}
   */
  async uploadIssuePhoto(upload) {
    console.log('[Sync Service] Uploading issue photo:', upload.id);

    // Upload to SharePoint
    const metadata = await sharePointStorageService.uploadIssuePhoto(
      upload.projectId,
      upload.issueId,
      upload.file,
      upload.metadata.description
    );

    console.log('[Sync Service] SharePoint upload complete:', metadata);

    // Save metadata to Supabase
    const { data, error } = await supabase
      .from('issue_photos')
      .insert([{
        issue_id: upload.issueId,
        url: metadata.url,
        sharepoint_drive_id: metadata.driveId,
        sharepoint_item_id: metadata.itemId,
        file_name: metadata.name,
        content_type: upload.metadata.contentType,
        size_bytes: metadata.size,
        uploaded_by: upload.metadata.uploadedBy || 'Offline upload'
      }])
      .select()
      .single();

    if (error) {
      console.error('[Sync Service] Supabase insert error:', error);
      throw error;
    }

    console.log('[Sync Service] Issue photo synced successfully:', data);
    return data;
  }

  /**
   * Upload wire drop photo to SharePoint and update Supabase
   * @param {Object} upload - Upload record
   * @returns {Promise<void>}
   */
  async uploadWireDropPhoto(upload) {
    console.log('[Sync Service] Uploading wire drop photo:', upload.id);

    // Upload to SharePoint
    const metadata = await sharePointStorageService.uploadWireDropPhoto(
      upload.projectId,
      upload.wireDropId,
      upload.stage,
      upload.file
    );

    console.log('[Sync Service] SharePoint upload complete:', metadata?.url);

    // Update wire drop stage in Supabase
    const { data, error } = await supabase
      .from('wire_drop_stages')
      .update({
        photo_url: metadata.url,
        sharepoint_drive_id: metadata.driveId,
        sharepoint_item_id: metadata.itemId,
        status: 'completed',
        completed: true,
        completed_at: new Date().toISOString(),
        completed_by: upload.metadata?.uploadedBy || 'Offline upload'
      })
      .eq('wire_drop_id', upload.wireDropId)
      .eq('stage_type', upload.stage)
      .select()
      .single();

    if (error) {
      console.error('[Sync Service] Supabase update error:', error);
      throw error;
    }

    console.log('[Sync Service] Wire drop photo synced successfully:', data);
    return data;
  }

  /**
   * Start automatic sync monitoring
   */
  startAutoSync() {
    console.log('[Sync Service] Starting auto-sync');

    // Listen for reconnect events
    window.addEventListener('reconnected', () => {
      console.log('[Sync Service] Reconnected event - processing queue');
      this.processQueue();
    });

    // Periodic sync every 2 minutes when online
    this.syncInterval = setInterval(() => {
      if (navigator.onLine) {
        console.log('[Sync Service] Periodic sync check');
        this.processQueue();
      }
    }, 2 * 60 * 1000); // 2 minutes
  }

  /**
   * Stop automatic sync monitoring
   */
  stopAutoSync() {
    console.log('[Sync Service] Stopping auto-sync');
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Manually trigger sync
   * @returns {Promise<void>}
   */
  async syncNow() {
    console.log('[Sync Service] Manual sync triggered');
    return this.processQueue();
  }

  /**
   * Get current sync status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      isOnline: navigator.onLine
    };
  }
}

// Create singleton instance
export const syncService = new SyncService();

// Start auto-sync when module loads
if (typeof window !== 'undefined') {
  syncService.startAutoSync();
}
