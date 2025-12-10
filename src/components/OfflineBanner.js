import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertCircle, CheckCircle2, Upload } from 'lucide-react';

/**
 * Banner component that displays network and sync status
 *
 * Shows:
 * - Offline mode warning
 * - Pending uploads count
 * - Sync progress
 * - Manual sync button
 *
 * @param {Object} props
 * @param {boolean} props.isOnline - Current online/offline status
 * @param {number} props.pendingCount - Number of pending uploads in queue
 * @param {boolean} props.isSyncing - Whether sync is currently in progress
 * @param {Function} props.onSyncNow - Callback to trigger manual sync
 */
export function OfflineBanner({ isOnline, pendingCount = 0, isSyncing = false, onSyncNow }) {
  const [showSuccess, setShowSuccess] = useState(false);

  // Show success message temporarily after sync completes
  useEffect(() => {
    if (!isSyncing && pendingCount === 0 && showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSyncing, pendingCount, showSuccess]);

  // Track when sync completes successfully
  useEffect(() => {
    if (!isSyncing && pendingCount === 0) {
      setShowSuccess(true);
    }
  }, [isSyncing, pendingCount]);

  // Don't show banner if online and no pending uploads
  if (isOnline && pendingCount === 0 && !showSuccess) {
    return null;
  }

  const getBannerStyle = () => {
    if (!isOnline) {
      return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800';
    }
    if (isSyncing) {
      return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
    }
    if (showSuccess && pendingCount === 0) {
      return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
    }
    if (pendingCount > 0) {
      return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800';
    }
    return 'bg-gray-50 border-gray-200 dark:bg-zinc-900/20 dark:border-gray-800';
  };

  const getIcon = () => {
    if (!isOnline) {
      return <WifiOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
    }
    if (isSyncing) {
      return <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />;
    }
    if (showSuccess && pendingCount === 0) {
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
    if (pendingCount > 0) {
      return <Upload className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
    }
    return <AlertCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
  };

  const getMessage = () => {
    if (!isOnline) {
      if (pendingCount > 0) {
        return `You're offline. ${pendingCount} photo${pendingCount > 1 ? 's' : ''} queued for upload when you reconnect.`;
      }
      return "You're offline. Photos will be queued for upload when you reconnect.";
    }
    if (isSyncing) {
      return `Syncing ${pendingCount} photo${pendingCount > 1 ? 's' : ''}...`;
    }
    if (showSuccess && pendingCount === 0) {
      return 'All photos synced successfully!';
    }
    if (pendingCount > 0) {
      return `${pendingCount} photo${pendingCount > 1 ? 's' : ''} waiting to upload.`;
    }
    return '';
  };

  return (
    <div className={`border-b ${getBannerStyle()}`}>
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {getIcon()}
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {getMessage()}
              </p>
              {!isOnline && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  You can continue working. Changes will sync automatically when online.
                </p>
              )}
            </div>
          </div>

          {/* Manual sync button - only show when online and has pending items */}
          {isOnline && pendingCount > 0 && !isSyncing && (
            <button
              onClick={onSyncNow}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </button>
          )}

          {/* Show spinner during sync */}
          {isSyncing && (
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
              Syncing...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
