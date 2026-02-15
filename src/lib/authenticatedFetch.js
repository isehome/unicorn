/**
 * Authenticated Fetch Utility
 *
 * Provides a drop-in replacement for fetch() that automatically includes
 * the MSAL Bearer token in API requests.
 *
 * USAGE IN SERVICES (non-React code):
 *   import { authFetch } from '../lib/authenticatedFetch';
 *   const res = await authFetch('/api/ha/command', { method: 'POST', body: ... });
 *
 * USAGE IN COMPONENTS (React code):
 *   import { authFetch } from '../lib/authenticatedFetch';
 *   const res = await authFetch('/api/ha/command', { method: 'POST', body: ... });
 *
 * HOW IT WORKS:
 * 1. Gets the MSAL instance from the module-level singleton (same one AuthContext uses)
 * 2. Silently acquires a fresh access token
 * 3. Adds Authorization: Bearer <token> header
 * 4. Falls through to normal fetch if no token available (user not logged in)
 *
 * This approach works in BOTH React components AND plain service files
 * because it accesses MSAL directly, not through React context.
 */

import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig, tokenRequest } from '../config/authConfig';

// Re-use the same MSAL instance that AuthContext creates.
// MSAL uses localStorage for its cache, so even a separate instance
// will find the same cached tokens/accounts.
let msalInstance = null;
let msalInitPromise = null;

function getMSALInstance() {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    msalInitPromise = msalInstance.initialize();
  }
  return { instance: msalInstance, ready: msalInitPromise };
}

/**
 * Get a fresh MSAL access token silently.
 * Returns null if the user isn't logged in or token can't be acquired.
 */
async function getAccessToken() {
  try {
    const { instance, ready } = getMSALInstance();
    await ready;

    const accounts = instance.getAllAccounts();
    if (!accounts || accounts.length === 0) {
      return null;
    }

    const response = await instance.acquireTokenSilent({
      ...tokenRequest,
      account: accounts[0],
    });

    return response?.accessToken || null;
  } catch (err) {
    // Silent acquisition failed — user may need to re-login
    // Don't throw, just return null so the request proceeds without auth
    console.warn('[authFetch] Silent token acquisition failed:', err.name);
    return null;
  }
}

/**
 * Authenticated fetch — drop-in replacement for window.fetch.
 *
 * Automatically adds Authorization: Bearer <msal-token> header
 * to requests that go to /api/ endpoints.
 *
 * For non-API URLs (external), behaves exactly like regular fetch.
 *
 * @param {string} url - The URL to fetch
 * @param {object} options - Standard fetch options
 * @returns {Promise<Response>} Standard fetch Response
 */
export async function authFetch(url, options = {}) {
  // Only add auth to our own API endpoints
  const isAPICall = typeof url === 'string' && url.startsWith('/api/');

  if (isAPICall) {
    const token = await getAccessToken();

    if (token) {
      const headers = new Headers(options.headers || {});
      // Don't override if caller already set Authorization
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      options = { ...options, headers };
    }
  }

  return fetch(url, options);
}

/**
 * Get just the auth headers (for cases where you need to build headers manually).
 *
 * @returns {object} Headers object with Authorization if available
 */
export async function getAuthHeaders() {
  const token = await getAccessToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export default authFetch;
