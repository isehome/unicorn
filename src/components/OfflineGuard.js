import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WifiOff, RefreshCw, ArrowLeft } from 'lucide-react';
import Button from './ui/Button';

/**
 * OfflineGuard Component
 *
 * Wraps route components to handle offline access gracefully.
 * - Allows access if page was previously visited while online
 * - Shows friendly message for first-time offline access
 * - Tracks visited pages in localStorage
 *
 * Usage:
 * <Route path="/wire-drops" element={
 *   <OfflineGuard>
 *     <WireDropsList />
 *   </OfflineGuard>
 * } />
 */
export function OfflineGuard({ children, pageName = 'this page' }) {
  const { isOnline } = useNetworkStatus();
  const location = useLocation();
  const navigate = useNavigate();

  // Create a unique key for this route
  const routeKey = `visited:${location.pathname}`;

  // Check if user has visited this page before
  const hasVisitedBefore = localStorage.getItem(routeKey) === 'true';

  // Mark page as visited when online
  useEffect(() => {
    if (isOnline) {
      localStorage.setItem(routeKey, 'true');
    }
  }, [isOnline, routeKey]);

  // If offline and never visited, show friendly message
  if (!isOnline && !hasVisitedBefore) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-800 rounded-2xl shadow-lg p-8 text-center border border-gray-200 dark:border-gray-700">
          {/* Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
              <WifiOff size={40} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">
            You're Offline
          </h2>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            {pageName} requires an internet connection to load for the first time.
            Once you've visited it online, you'll be able to view it offline.
          </p>

          {/* What still works */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              What still works offline:
            </p>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Upload photos (queued for later)</li>
              <li>• View previously loaded pages</li>
              <li>• View cached photos</li>
              <li>• Check in/out of projects</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => navigate(-1)}
              className="w-full"
            >
              Go Back
            </Button>
            <Button
              variant="primary"
              icon={RefreshCw}
              onClick={() => window.location.reload()}
              className="w-full"
              disabled={!isOnline}
            >
              {isOnline ? 'Try Again' : 'Waiting for Connection...'}
            </Button>
          </div>

          {/* Tip */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
            Tip: Visit pages while online to enable offline access
          </p>
        </div>
      </div>
    );
  }

  // If offline but visited before, show children with a subtle indicator
  if (!isOnline && hasVisitedBefore) {
    return (
      <div>
        {/* Subtle "using cached data" indicator */}
        <div className="bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
          <div className="container mx-auto">
            <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <WifiOff size={14} />
              <span>Viewing cached data - some information may be outdated</span>
            </p>
          </div>
        </div>
        {children}
      </div>
    );
  }

  // Online or offline with cache - show normally
  return children;
}

/**
 * Hook to manually mark a route as visited
 * Useful for pages that load data after mount
 */
export function useMarkRouteVisited() {
  const location = useLocation();
  const { isOnline } = useNetworkStatus();

  return () => {
    if (isOnline) {
      const routeKey = `visited:${location.pathname}`;
      localStorage.setItem(routeKey, 'true');
    }
  };
}

/**
 * Clear all visited route history
 * Useful for testing or user-initiated cache clear
 */
export function clearVisitedRoutes() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('visited:')) {
      localStorage.removeItem(key);
    }
  });
  console.log('[OfflineGuard] Cleared all visited routes');
}
