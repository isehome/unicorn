import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for getting a fresh Microsoft Graph API access token.
 *
 * Unlike using `accessToken` directly from AuthContext (which may be stale
 * if the scheduled refresh timer didn't fire due to browser sleep/tab inactive),
 * this hook calls acquireToken() which handles silent refresh automatically.
 *
 * Usage:
 *   const getFreshToken = useFreshToken();
 *   const token = await getFreshToken();
 *   // Use token for Graph API calls
 *
 * The hook will:
 * 1. Try silent token acquisition first (no user interaction)
 * 2. Fall back to interactive popup if silent fails
 * 3. Return null if token cannot be acquired
 */
export function useFreshToken() {
  const { acquireToken, authState } = useAuth();

  const getFreshToken = useCallback(async () => {
    // Don't attempt to get token if not authenticated
    if (authState !== 'authenticated') {
      console.warn('[useFreshToken] Not authenticated, cannot acquire token');
      return null;
    }

    try {
      const token = await acquireToken(false);
      if (!token) {
        console.warn('[useFreshToken] acquireToken returned null');
      }
      return token;
    } catch (error) {
      console.error('[useFreshToken] Failed to acquire fresh token:', error);
      return null;
    }
  }, [acquireToken, authState]);

  return getFreshToken;
}

export default useFreshToken;
