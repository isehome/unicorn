import { useState, useEffect } from 'react';
import { syncService } from '../services/syncService';
import { getQueueCount } from '../lib/offline';

/**
 * Sync Status Component
 *
 * Displays the current sync status and pending upload count
 * Listens to sync events from the sync service
 *
 * @returns {Object} { pendingCount, isSyncing }
 */
export function useSyncStatus() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Initial count
    getQueueCount().then(setPendingCount).catch(console.error);

    // Listen to queue updates
    const handleQueueUpdate = () => {
      getQueueCount().then(setPendingCount).catch(console.error);
    };

    // Listen to sync events
    const handleSyncEvent = (event) => {
      switch (event.type) {
        case 'sync-started':
          setIsSyncing(true);
          break;
        case 'sync-completed':
        case 'sync-error':
          setIsSyncing(false);
          // Refresh count after sync
          getQueueCount().then(setPendingCount).catch(console.error);
          break;
        case 'upload-success':
          // Decrement count on successful upload
          setPendingCount(prev => Math.max(0, prev - 1));
          break;
        default:
          break;
      }
    };

    // Subscribe to sync service
    const unsubscribe = syncService.subscribe(handleSyncEvent);

    // Listen to queue updates
    window.addEventListener('queue-updated', handleQueueUpdate);

    // Cleanup
    return () => {
      unsubscribe();
      window.removeEventListener('queue-updated', handleQueueUpdate);
    };
  }, []);

  const triggerSync = () => {
    syncService.syncNow().catch(error => {
      console.error('[SyncStatus] Manual sync failed:', error);
    });
  };

  return { pendingCount, isSyncing, triggerSync };
}
