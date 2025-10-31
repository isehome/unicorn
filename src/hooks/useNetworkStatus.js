import { useState, useEffect } from 'react';

/**
 * Hook to monitor network connectivity status
 *
 * Features:
 * - Detects online/offline state changes
 * - Verifies actual connectivity (not just WiFi connected)
 * - Tracks if user was previously offline (for triggering sync)
 * - Dispatches 'reconnected' event for sync triggers
 *
 * @returns {Object} { isOnline: boolean, wasOffline: boolean }
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Dispatch custom event for sync service to listen to
        window.dispatchEvent(new CustomEvent('reconnected'));
        console.log('[Network] Reconnected - triggering sync');
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      console.log('[Network] Offline mode activated');
    };

    // Register event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verify actual connectivity (not just WiFi connected)
    // This catches cases where WiFi is connected but no internet access
    const verifyConnectivity = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }

      try {
        // Try to fetch a small resource with no-cache to verify real connectivity
        // Using the Supabase URL as it's always available
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        await fetch('https://api.github.com/zen', {
          method: 'HEAD',
          cache: 'no-cache',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        setIsOnline(true);
      } catch (error) {
        // Fetch failed - we're actually offline despite WiFi connection
        setIsOnline(false);
        setWasOffline(true);
      }
    };

    // Verify connectivity every 30 seconds
    const interval = setInterval(verifyConnectivity, 30000);

    // Initial connectivity check
    verifyConnectivity();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [wasOffline]);

  return { isOnline, wasOffline };
}
