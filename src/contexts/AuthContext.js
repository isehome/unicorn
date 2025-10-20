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

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// IMPORTANT: Initialize MSAL (this returns a promise, but we handle it in useEffect)
const msalInitPromise = msalInstance.initialize();

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
  
  const initRef = useRef(false);
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
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const profile = await response.json();
      
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

      setUser(enrichedUser);
      return enrichedUser;
    } catch (error) {
      console.error('[Auth] Failed to load user profile:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let mounted = true;
    let timeoutId = null;

    const initialize = async () => {
      console.log('[Auth] Initializing MSAL');

      timeoutId = setTimeout(() => {
        if (mounted && loading) {
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
          if (redirectError?.errorCode === 'hash_empty_error') {
            console.warn('[Auth] Redirect hash empty, clearing stale interaction status');
            try {
              localStorage.removeItem('msal.interaction.status');
            } catch (storageError) {
              console.warn('[Auth] Unable to clear msal.interaction.status:', storageError);
            }
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
          
          await loadUserProfile(response.accessToken);
          setAuthState(AUTH_STATES.AUTHENTICATED);
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
              await loadUserProfile(token);
              setAuthState(AUTH_STATES.AUTHENTICATED);
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
        setError(error);
        setAuthState(AUTH_STATES.ERROR);
      } finally {
        if (mounted) {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
          console.log('[Auth] Initialization complete, loading set to false');
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
      initRef.current = false;
    };
  }, [acquireToken, loadUserProfile, scheduleTokenRefresh]); // REMOVED 'loading' from deps!

  const login = useCallback(async () => {
    try {
      console.log('[Auth] Starting login flow with popup');
      setError(null);

      const response = await msalInstance.loginPopup(loginRequest);
      
      console.log('[Auth] Login successful:', response.account.username);
      setAccount(response.account);
      setAccessToken(response.accessToken);
      msalInstance.setActiveAccount(response.account);

      if (response.expiresOn) {
        scheduleTokenRefresh(response.expiresOn);
      }

      await loadUserProfile(response.accessToken);
      setAuthState(AUTH_STATES.AUTHENTICATED);

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
      } else if (error.errorCode) {
        errorMessage = `Authentication failed: ${error.errorCode}`;
      }
      
      const formattedError = new Error(errorMessage);
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
