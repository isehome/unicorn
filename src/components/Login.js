import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { AUTH_ERRORS } from '../config/authConfig';

// Detect if user is on mobile device
const isMobile = () => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
};

const Login = () => {
  const { login, loginRedirect, loading: authLoading, user, authState, error: authError } = useAuth();
  const [error, setError] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the default workspace from localStorage, or use '/' for technician
  const getDefaultHome = () => {
    const defaultWorkspace = localStorage.getItem('default-workspace-mode');
    return defaultWorkspace === 'pm' ? '/pm-dashboard' : '/';
  };

  // If user was trying to access a specific page, go there; otherwise use their default workspace
  const from = location.state?.from?.pathname || getDefaultHome();
  const useMobileFlow = isMobile();

  const getErrorMessage = useCallback((errorCode) => {
    const errorMap = {
      'authentication_failed': 'Authentication failed. Please try again.',
      'callback_timeout': 'Authentication timed out. Please try again.',
      'access_denied': 'Access was denied. Please ensure you have permission.',
      'server_error': 'Microsoft services are experiencing issues. Please try again later.',
      'unexpected_error': 'An unexpected error occurred. Please try again.',
      'popup_blocked': AUTH_ERRORS.POPUP_BLOCKED,
      'user_cancelled': AUTH_ERRORS.USER_CANCELLED,
      'network_error': AUTH_ERRORS.NETWORK_ERROR,
      'interaction_in_progress': 'Authentication is in progress. Please wait or reload the page.',
    };
    
    return errorMap[errorCode] || 'An error occurred. Please try again.';
  }, []);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    
    if (errorParam) {
      setError(getErrorMessage(errorParam));
      
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('error');
      navigate({ search: newSearchParams.toString() }, { replace: true });
    }
  }, [searchParams, navigate, getErrorMessage]);

  // Show error from AuthContext if present (but not hash_empty_error which is handled silently)
  useEffect(() => {
    if (authError) {
      const errorMsg = authError.message || authError.errorMessage || '';
      const errorCode = authError.errorCode || '';

      // Don't show hash_empty_error to users - it's handled automatically
      if (errorCode === 'hash_empty_error' || errorMsg.includes('hash_empty_error') || errorMsg.includes('Hash value cannot be processed')) {
        console.log('[Login] Ignoring hash_empty_error - handled automatically');
        return;
      }

      setError(errorMsg || 'An error occurred during authentication.');
    }
  }, [authError]);

  useEffect(() => {
    if (user && !authLoading && authState === 'authenticated') {
      console.log('[Login] User already authenticated, redirecting');
      navigate(from, { replace: true });
    }
  }, [user, authLoading, authState, navigate, from]);

  const handleLogin = useCallback(async () => {
    try {
      setError('');
      setLocalLoading(true);

      console.log('[Login] Starting login flow, mobile:', useMobileFlow);

      if (useMobileFlow) {
        console.log('[Login] Using redirect flow for mobile');
        await loginRedirect();
        // Note: On redirect, browser will navigate away, so code below won't execute
      } else {
        console.log('[Login] Using popup flow for desktop');
        try {
          await login();
          console.log('[Login] Login flow completed');
        } catch (popupError) {
          // If popup fails (blocked, window error), fall back to redirect flow
          if (popupError.errorCode === 'popup_window_error' ||
              popupError.errorCode === 'empty_window_error' ||
              popupError.message?.includes('popup')) {
            console.log('[Login] Popup failed, falling back to redirect flow');
            setError('');
            await loginRedirect();
            return; // Browser will redirect away
          }
          throw popupError; // Re-throw other errors
        }
      }

    } catch (error) {
      console.error('[Login] Login error:', error);
      setLocalLoading(false);

      // Handle interaction_in_progress error
      if (error.errorCode === 'interaction_in_progress') {
        setError('Authentication is already in progress. Please reload the page and try again.');

        // Offer to clear the stuck state
        setTimeout(() => {
          if (window.confirm('Would you like to reset the authentication state?')) {
            // Clear MSAL cache
            localStorage.removeItem('msal.interaction.status');
            window.location.reload();
          }
        }, 2000);
      } else if (error.errorCode === 'popup_window_error' || error.errorCode === 'empty_window_error') {
        // This shouldn't happen since we handle it above, but just in case
        setError('Pop-up was blocked. Click the button again to sign in via redirect.');
      } else {
        setError(error.message || 'Failed to sign in. Please try again.');
      }
    }
  }, [login, loginRedirect, useMobileFlow]);

  const isLoading = authLoading || localLoading;

  if (authLoading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Checking authentication...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Intelligent Systems"
              className="w-48 h-auto sm:w-60"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const textFallback = document.getElementById('logo-fallback');
                if (textFallback) textFallback.style.display = 'block';
              }}
            />
            <h1 
              id="logo-fallback"
              className="text-3xl font-bold text-violet-600 dark:text-violet-400"
              style={{ display: 'none' }}
            >
              Unicorn
            </h1>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Welcome to Unicorn
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Sign in with your Microsoft 365 account
          </p>
          {useMobileFlow && (
            <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-500">
              Mobile browser detected
            </p>
          )}
        </div>
        
        {error && (
          <div 
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg relative" 
            role="alert"
          >
            <span className="block sm:inline">{error}</span>
            <button
              onClick={() => setError('')}
              className="absolute top-0 right-0 px-4 py-3 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              aria-label="Dismiss"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path 
                  fillRule="evenodd" 
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                  clipRule="evenodd" 
                />
              </svg>
            </button>
          </div>
        )}
        
        <div>
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out transform hover:scale-[1.02] disabled:transform-none"
          >
            {isLoading ? (
              <div className="flex items-center">
                <svg 
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Signing in...
              </div>
            ) : (
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 23 23" fill="currentColor">
                  <path d="M11.1 0H0v11.1h11.1V0z" fill="#f25022"/>
                  <path d="M23 0H11.9v11.1H23V0z" fill="#00a4ef"/>
                  <path d="M11.1 11.9H0V23h11.1V11.9z" fill="#ffb900"/>
                  <path d="M23 11.9H11.9V23H23V11.9z" fill="#7fba00"/>
                </svg>
                Continue with Microsoft 365
              </div>
            )}
          </button>
        </div>
        
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By signing in, you agree to use your organization's Microsoft 365 account.
            Contact your administrator if you need access.
          </p>
        </div>
        
        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
          <details className="text-sm text-gray-600 dark:text-gray-400">
            <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 font-medium">
              Having trouble signing in?
            </summary>
            <ul className="mt-3 space-y-2 ml-4 list-disc">
              {!useMobileFlow && <li>Ensure pop-ups are allowed for this site</li>}
              <li>Use your work or school Microsoft account</li>
              <li>Check that you have access to this application</li>
              <li>Try clearing your browser cache and cookies</li>
              {useMobileFlow && <li>Try using a different browser if issues persist</li>}
              <li>If issues persist, contact your IT administrator</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
};

export default Login;
