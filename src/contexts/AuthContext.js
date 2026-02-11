import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import {
  msalConfig,
  loginRequest,
  tokenRequest,
  AUTH_STATES,
  TIMEOUTS,
  TOKEN_CONFIG,
  AUTH_ERRORS
} from '../config/authConfig';
import { supabase } from '../lib/supabase';

// Clear stale MSAL interaction state on page load if no auth hash is present.
// This prevents the hash_empty_error that occurs when MSAL expects a redirect
// response but the hash was already stripped (e.g. by Safari or React Router).
(() => {
  const hasAuthHash = window.location.hash &&
    (window.location.hash.includes('code=') ||
     window.location.hash.includes('id_token=') ||
     window.location.hash.includes('access_token=') ||
     window.location.hash.includes('error='));

  if (!hasAuthHash) {
    // Clear ALL interaction-related keys from both storages.
    // Account / token caches are left intact so users stay signed in.
    let cleared = 0;
    const clearInteractionState = (storage) => {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (!key) continue;
        // Only target interaction / request tracking keys, NOT cached tokens/accounts
        const isInteraction =
          key === 'msal.interaction.status' ||
          (key.startsWith('msal.') && (
            key.includes('.request.') ||
            key.includes('interaction') ||
            key.includes('.redirect')
          ));
        if (isInteraction) {
          storage.removeItem(key);
          cleared++;
        }
      }
    };
    try { clearInteractionState(localStorage); } catch (_) { /* private browsing */ }
    try { clearInteractionState(sessionStorage); } catch (_) { /* private browsing */ }
    if (cleared > 0) {
      console.log(`[Auth] Cleared ${cleared} stale MSAL interaction key(s) on page load`);
    }
  }
})();

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// IMPORTANT: Initialize MSAL (this returns a promise, but we handle it in useEffect)
const msalInitPromise = msalInstance.initialize();

// Module-level tracking for auth initialization (persists across StrictMode remounts)
let authInitStarted = false;
let authInitCompleteResolver = null;
const authInitCompletePromise = new Promise(resolve => {
  authInitCompleteResolver = resolve;
});

const AuthContext = createContext({
  user: null,
  account: null,
  accessToken: null,
  loading: true,
  error: null,
  authState: AUTH_STATES.INITIALIZING,
  login: async () => {},
  loginRedirect: async () => {},
  logout: async () => {},
  acquireToken: async () => {},
});

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authState, setAuthState] = useState(AUTH_STATES.INITIALIZING);
  
  const initStartedRef = useRef(false);
  const initCompletedRef = useRef(false);
  const tokenRefreshTimerRef = useRef(null);
  const isAcquiringTokenRef = useRef(false);

  const acquireToken = useCallback(async (forceInteractive = false) => {
    if (isAcquiringTokenRef.current) {
      console.log('[Auth] Token acquisition already in progress');
      return null;
    }

    try {
      isAcquiringTokenRef.current = true;
      
      const currentAccount = msalInstance.getAllAccounts()[0];
      if (!currentAccount) {
        console.log('[Auth] No account found for token acquisition');
        return null;
      }

      const request = {
        ...tokenRequest,
        account: currentAccount,
      };

      let response;

      if (forceInteractive) {
        console.log('[Auth] Forcing interactive token acquisition');
        response = await msalInstance.acquireTokenPopup(request);
      } else {
        try {
          console.log('[Auth] Attempting silent token acquisition');
          response = await msalInstance.acquireTokenSilent(request);
          console.log('[Auth] Silent token acquisition successful');
        } catch (silentError) {
          if (silentError instanceof InteractionRequiredAuthError) {
            console.log('[Auth] Silent acquisition failed, falling back to interactive');
            response = await msalInstance.acquireTokenPopup(request);
          } else {
            throw silentError;
          }
        }
      }

      if (response?.accessToken) {
        setAccessToken(response.accessToken);
        scheduleTokenRefresh(response.expiresOn);
        return response.accessToken;
      }

      return null;
    } catch (error) {
      console.error('[Auth] Token acquisition error:', error);
      setError(error);
      return null;
    } finally {
      isAcquiringTokenRef.current = false;
    }
    // Note: scheduleTokenRefresh is intentionally omitted to avoid circular dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleTokenRefresh = useCallback((expiresOn) => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
    }

    if (!expiresOn) return;

    const now = Date.now();
    const expiryTime = expiresOn.getTime();
    const timeUntilExpiry = expiryTime - now;
    const refreshTime = timeUntilExpiry - TOKEN_CONFIG.REFRESH_BUFFER;

    if (refreshTime > 0) {
      console.log(`[Auth] Scheduling token refresh in ${Math.round(refreshTime / 1000 / 60)} minutes`);
      
      tokenRefreshTimerRef.current = setTimeout(async () => {
        console.log('[Auth] Auto-refreshing token');
        await acquireToken(false);
      }, refreshTime);
    } else {
      console.log('[Auth] Token expires soon, refreshing immediately');
      acquireToken(false);
    }
  }, [acquireToken]);

  const loadUserProfile = useCallback(async (token) => {
    if (!token) return null;

    try {
      console.log('[Auth] loadUserProfile: Starting Graph API fetch...');

      // Add timeout to prevent hanging indefinitely
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[Auth] loadUserProfile: Fetch timeout after 10s, aborting...');
        controller.abort();
      }, 10000);

      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Auth] loadUserProfile: Graph API response status:', response.status);

      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.status}`);
      }

      const profile = await response.json();
      console.log('[Auth] loadUserProfile: Profile fetched successfully for:', profile.displayName);
      
      const enrichedUser = {
        id: profile.id,
        email: profile.mail || profile.userPrincipalName,
        displayName: profile.displayName,
        givenName: profile.givenName,
        surname: profile.surname,
        jobTitle: profile.jobTitle,
        officeLocation: profile.officeLocation,
        mobilePhone: profile.mobilePhone,
        businessPhones: profile.businessPhones,
      };

      // Load avatar_color from profile BEFORE setting user to prevent color flash
      // Use timeout to prevent hanging if Supabase is slow
      console.log('[Auth] loadUserProfile: Pre-loading avatar color...');
      if (supabase && enrichedUser.id) {
        try {
          const avatarPromise = supabase
            .from('profiles')
            .select('avatar_color')
            .eq('id', enrichedUser.id)
            .single();

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Avatar color query timeout')), 5000)
          );

          const { data: profileData, error: avatarError } = await Promise.race([avatarPromise, timeoutPromise]);
          console.log('[Auth] loadUserProfile: Avatar color query result:', { profileData, avatarError: avatarError?.message });
          if (profileData?.avatar_color) {
            enrichedUser.avatar_color = profileData.avatar_color;
          }
        } catch (err) {
          // Non-critical - continue without avatar color
          console.log('[Auth] Could not pre-load avatar color:', err.message);
        }
      }

      console.log('[Auth] loadUserProfile: Setting user state...');
      setUser(enrichedUser);

      // Sync user profile to Supabase profiles table for audit trail lookups
      // Use a timeout to prevent hanging if Supabase is slow/unreachable
      if (supabase && enrichedUser.id) {
        console.log('[Auth] Attempting profile sync for user:', {
          id: enrichedUser.id,
          email: enrichedUser.email,
          displayName: enrichedUser.displayName
        });

        const syncWithTimeout = async () => {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile sync timeout')), 5000)
          );

          try {
            const syncPromise = (async () => {
              const { data: upsertData, error: upsertError } = await supabase
                .from('profiles')
                .upsert({
                  id: enrichedUser.id,
                  email: enrichedUser.email,
                  full_name: enrichedUser.displayName,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'id',
                  ignoreDuplicates: false
                })
                .select()
                .single();

              if (upsertError) {
                console.error('[Auth] Failed to sync profile to Supabase:', upsertError);
              } else {
                console.log('[Auth] Profile synced successfully');
                if (upsertData?.avatar_color) {
                  enrichedUser.avatar_color = upsertData.avatar_color;
                  // Update user state with avatar_color
                  setUser(prev => ({ ...prev, avatar_color: upsertData.avatar_color }));
                }
              }

              // Fetch avatar_color if not already set
              if (!enrichedUser.avatar_color) {
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('avatar_color')
                  .eq('id', enrichedUser.id)
                  .single();
                if (profileData?.avatar_color) {
                  enrichedUser.avatar_color = profileData.avatar_color;
                  // Update user state with avatar_color
                  setUser(prev => ({ ...prev, avatar_color: profileData.avatar_color }));
                }
              }
            })();

            await Promise.race([syncPromise, timeoutPromise]);
          } catch (err) {
            console.warn('[Auth] Profile sync failed or timed out:', err.message);
            // Don't block login - profile sync is non-critical
          }
        };

        await syncWithTimeout();
      }

      console.log('[Auth] loadUserProfile: Complete, returning user');
      return enrichedUser;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('[Auth] loadUserProfile: Request timed out after 10 seconds');
      } else {
        console.error('[Auth] loadUserProfile: Failed to load user profile:', error);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    // Skip if already initialized - MSAL should only init once per page load
    // Use module-level variable (not ref) because refs don't persist across StrictMode remounts
    if (authInitStarted) {
      console.log('[Auth] Auth init already started, waiting for completion...');
      // Wait for the first mount's init to complete, then update our loading state
      authInitCompletePromise.then(() => {
        console.log('[Auth] Auth init completed (from first mount), setting loading=false');
        setLoading(false);
      });
      return;
    }
    authInitStarted = true;

    let timeoutId = null;

    const initialize = async () => {
      console.log('[Auth] Initializing MSAL');

      timeoutId = setTimeout(() => {
        if (loading) {
          console.warn('[Auth] Initialization timeout');
          setAuthState(AUTH_STATES.UNAUTHENTICATED);
          setLoading(false);
        }
      }, TIMEOUTS.INITIALIZATION);

      try {
        // Wait for MSAL to initialize
        await msalInitPromise;
        console.log('[Auth] MSAL initialized successfully');

        // Handle redirect promise (for popup/redirect flows)
        let response = null;
        try {
          response = await msalInstance.handleRedirectPromise();
        } catch (redirectError) {
          if (redirectError?.errorCode === 'hash_empty_error' || 
              redirectError?.errorMessage?.includes('Hash value cannot be processed')) {
            console.warn('[Auth] Hash empty error detected, clearing all MSAL state');
            try {
              // Clear all MSAL-related items from localStorage
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('msal.') || key.includes('login.windows'))) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(key => localStorage.removeItem(key));
              console.log('[Auth] Cleared MSAL localStorage items:', keysToRemove.length);
            } catch (storageError) {
              console.warn('[Auth] Unable to clear MSAL state:', storageError);
            }
            // Don't throw - treat as no authentication response
            response = null;
          } else {
            throw redirectError;
          }
        }
        
        if (response) {
          console.log('[Auth] Login successful via redirect/popup');
          setAccount(response.account);
          setAccessToken(response.accessToken);

          if (response.expiresOn) {
            scheduleTokenRefresh(response.expiresOn);
          }

          const userProfile = await loadUserProfile(response.accessToken);
          if (userProfile) {
            setAuthState(AUTH_STATES.AUTHENTICATED);
          } else {
            console.error('[Auth] Failed to load user profile after redirect login');
            setAuthState(AUTH_STATES.UNAUTHENTICATED);
          }
        } else {
          // Check for existing accounts
          const accounts = msalInstance.getAllAccounts();
          
          if (accounts.length > 0) {
            const currentAccount = accounts[0];
            console.log('[Auth] Found existing account:', currentAccount.username);
            
            setAccount(currentAccount);
            msalInstance.setActiveAccount(currentAccount);
            
            // Acquire token silently
            const token = await acquireToken(false);

            if (token) {
              console.log('[Auth] Token acquired, loading user profile...');
              const userProfile = await loadUserProfile(token);
              console.log('[Auth] loadUserProfile returned:', userProfile ? 'success' : 'null');
              if (userProfile) {
                console.log('[Auth] Setting auth state to AUTHENTICATED');
                setAuthState(AUTH_STATES.AUTHENTICATED);
              } else {
                console.error('[Auth] Failed to load user profile for existing account');
                setAuthState(AUTH_STATES.UNAUTHENTICATED);
              }
            } else {
              console.warn('[Auth] Failed to acquire token for existing account');
              setAuthState(AUTH_STATES.UNAUTHENTICATED);
            }
          } else {
            console.log('[Auth] No existing accounts found');
            setAuthState(AUTH_STATES.UNAUTHENTICATED);
          }
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error);

        // Handle hash_empty_error gracefully - clear state and treat as unauthenticated
        if (error?.errorCode === 'hash_empty_error' ||
            error?.message?.includes('hash_empty_error') ||
            error?.errorMessage?.includes('Hash value cannot be processed')) {
          console.warn('[Auth] Hash empty error in main catch, clearing MSAL state');
          try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.startsWith('msal.') || key.includes('login.windows') || key.includes('msal'))) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            // Also clear session storage
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
              const key = sessionStorage.key(i);
              if (key && (key.startsWith('msal.') || key.includes('msal'))) {
                sessionStorage.removeItem(key);
              }
            }
            console.log('[Auth] Cleared MSAL state, treating as unauthenticated');
          } catch (storageError) {
            console.warn('[Auth] Unable to clear MSAL state:', storageError);
          }
          setAuthState(AUTH_STATES.UNAUTHENTICATED);
        } else {
          setError(error);
          setAuthState(AUTH_STATES.ERROR);
        }
      } finally {
        initCompletedRef.current = true;
        if (timeoutId) clearTimeout(timeoutId);
        setLoading(false);
        console.log('[Auth] Initialization complete, loading set to false');
        // Resolve the promise so second mount (StrictMode) can update its loading state
        if (authInitCompleteResolver) {
          authInitCompleteResolver();
        }
      }
    };

    initialize();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
      // Do NOT reset refs - MSAL should only initialize once per page load
    };
    // Note: 'loading' is intentionally omitted to prevent infinite re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquireToken, loadUserProfile, scheduleTokenRefresh]);

  const login = useCallback(async () => {
    try {
      console.log('[Auth] Starting login flow with popup');
      setError(null);

      // Clear any stuck interaction state from storage before attempting login
      // This handles cases where a previous login was interrupted
      const clearMsalStorage = (storage) => {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key && (key.startsWith('msal.') || key.includes('msal'))) {
            // Don't clear account/token caches, only interaction state
            if (key.includes('interaction') || key.includes('.request.')) {
              storage.removeItem(key);
            }
          }
        }
      };

      const hasStuckInteraction = sessionStorage.getItem('msal.interaction.status') ||
                                   localStorage.getItem('msal.interaction.status');
      if (hasStuckInteraction) {
        console.warn('[Auth] Found stuck interaction status in storage, clearing');
        clearMsalStorage(sessionStorage);
        clearMsalStorage(localStorage);
      }

      const response = await msalInstance.loginPopup(loginRequest);
      
      console.log('[Auth] Login successful:', response.account.username);
      setAccount(response.account);
      setAccessToken(response.accessToken);
      msalInstance.setActiveAccount(response.account);

      if (response.expiresOn) {
        scheduleTokenRefresh(response.expiresOn);
      }

      const userProfile = await loadUserProfile(response.accessToken);
      if (userProfile) {
        setAuthState(AUTH_STATES.AUTHENTICATED);
      } else {
        console.error('[Auth] Failed to load user profile after popup login');
        setAuthState(AUTH_STATES.UNAUTHENTICATED);
        throw new Error('Failed to load user profile. Please try again.');
      }

      return response;
    } catch (error) {
      console.error('[Auth] Login error:', error);
      console.error('[Auth] Error code:', error.errorCode);
      console.error('[Auth] Error message:', error.errorMessage);
      
      let errorMessage = AUTH_ERRORS.UNKNOWN;
      
      if (error.errorCode === 'popup_window_error' || error.errorCode === 'empty_window_error') {
        errorMessage = AUTH_ERRORS.POPUP_BLOCKED;
      } else if (error.errorCode === 'user_cancelled') {
        errorMessage = AUTH_ERRORS.USER_CANCELLED;
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        errorMessage = AUTH_ERRORS.NETWORK_ERROR;
      } else if (error.errorCode === 'hash_empty_error' || error.errorMessage?.includes('Hash value cannot be processed')) {
        // Handle hash_empty_error silently - clear MSAL state and don't throw
        console.warn('[Auth] Hash empty error in login, clearing MSAL state');
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('msal.') || key.includes('login.windows') || key.includes('msal'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith('msal.') || key.includes('msal'))) {
              sessionStorage.removeItem(key);
            }
          }
          console.log('[Auth] MSAL state cleared, please try again');
        } catch (storageError) {
          console.warn('[Auth] Unable to clear MSAL state:', storageError);
        }
        // Don't set error or throw - just return so user can try again
        return;
      } else if (error.errorCode === 'interaction_in_progress') {
        // Clear the stuck interaction state and prompt retry
        console.warn('[Auth] Interaction in progress error, clearing stuck state');
        try {
          sessionStorage.removeItem('msal.interaction.status');
          localStorage.removeItem('msal.interaction.status');
          // Clear all interaction-related keys
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && key.includes('msal.') && (key.includes('.request.') || key.includes('interaction'))) {
              sessionStorage.removeItem(key);
            }
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.includes('msal.') && (key.includes('.request.') || key.includes('interaction'))) {
              localStorage.removeItem(key);
            }
          }
          console.log('[Auth] Cleared stuck interaction state, please try again');
        } catch (storageError) {
          console.warn('[Auth] Unable to clear stuck state:', storageError);
        }
        errorMessage = 'Authentication was interrupted. Please click the button again to sign in.';
      } else if (error.errorCode) {
        errorMessage = `Authentication failed: ${error.errorCode}`;
      }

      const formattedError = new Error(errorMessage);
      formattedError.errorCode = error.errorCode;
      setError(formattedError);
      throw formattedError;
    }
  }, [loadUserProfile, scheduleTokenRefresh]);

  // Redirect flow for mobile
  const loginRedirect = useCallback(async () => {
    try {
      console.log('[Auth] Starting login flow with redirect');
      setError(null);

      // This will redirect the browser to Microsoft login
      await msalInstance.loginRedirect(loginRequest);
      
      // Code after this won't execute because browser redirects away
    } catch (error) {
      console.error('[Auth] Login redirect error:', error);
      console.error('[Auth] Error code:', error.errorCode);
      
      let errorMessage = AUTH_ERRORS.UNKNOWN;
      
      if (error.errorCode === 'interaction_in_progress') {
        errorMessage = 'Authentication already in progress. Please wait or reload the page.';
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        errorMessage = AUTH_ERRORS.NETWORK_ERROR;
      } else if (error.errorCode === 'hash_empty_error' || error.errorMessage?.includes('Hash value cannot be processed')) {
        // Handle hash_empty_error silently - clear MSAL state
        console.warn('[Auth] Hash empty error in redirect, clearing MSAL state');
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('msal.') || key.includes('login.windows') || key.includes('msal'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith('msal.') || key.includes('msal'))) {
              sessionStorage.removeItem(key);
            }
          }
        } catch (storageError) {
          console.warn('[Auth] Unable to clear MSAL state:', storageError);
        }
        return;
      } else if (error.errorCode) {
        errorMessage = `Authentication failed: ${error.errorCode}`;
      }

      const formattedError = new Error(errorMessage);
      setError(formattedError);
      throw formattedError;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      console.log('[Auth] Logging out');

      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }

      setAccount(null);
      setUser(null);
      setAccessToken(null);
      setAuthState(AUTH_STATES.UNAUTHENTICATED);
      setError(null);

      const currentAccount = msalInstance.getActiveAccount();
      if (currentAccount) {
        await msalInstance.logoutPopup({
          account: currentAccount,
          postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
        });
      }

      console.log('[Auth] Logout successful');
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      setAccount(null);
      setUser(null);
      setAccessToken(null);
      setAuthState(AUTH_STATES.UNAUTHENTICATED);
    }
  }, []);

  // Function to update user's avatar color in context (called after saving in Settings)
  const updateAvatarColor = useCallback((newColor) => {
    if (user) {
      setUser(prev => ({ ...prev, avatar_color: newColor }));
    }
  }, [user]);

  const value = {
    user,
    account,
    accessToken,
    loading,
    error,
    authState,
    login,
    loginRedirect,
    logout,
    acquireToken,
    msalInstance,
    updateAvatarColor,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
