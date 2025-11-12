/**
 * MSAL Authentication Configuration
 * 
 * Centralized configuration for Microsoft Authentication Library (MSAL)
 * This file contains all authentication-related settings for Azure AD OAuth
 */

import { LogLevel } from '@azure/msal-browser';

// Azure AD Application Configuration
export const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin, // Changed from /auth/callback
    postLogoutRedirectUri: window.location.origin + '/login',
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            console.info('[MSAL]', message);
            break;
          default:
            break;
        }
      },
      logLevel: LogLevel.Info, // Changed to Info for better debugging
    },
    windowHashTimeout: 60000,
    iframeHashTimeout: 6000,
    loadFrameTimeout: 0,
  },
};

// Authentication request scopes
export const loginRequest = {
  scopes: [
    'openid',
    'profile', 
    'email',
    'offline_access',
    'User.Read',
    'Calendars.Read',
    'Contacts.Read',
    'Mail.Send'
  ],
  prompt: 'select_account',
};

// Token request for Microsoft Graph API
export const tokenRequest = {
  scopes: [
    'User.Read',
    'Calendars.Read', 
    'Contacts.Read',
    'Mail.Send'
  ],
};

// Microsoft Graph API Configuration
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphCalendarEndpoint: 'https://graph.microsoft.com/v1.0/me/calendarView',
  graphContactsEndpoint: 'https://graph.microsoft.com/v1.0/me/contacts',
};

// Authentication State Constants
export const AUTH_STATES = {
  INITIALIZING: 'initializing',
  AUTHENTICATED: 'authenticated', 
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error',
};

// Timeout Configuration (in milliseconds)
export const TIMEOUTS = {
  INITIALIZATION: 3000,
  LOGIN: 10000,
  TOKEN_ACQUIRE: 5000,
  CALLBACK_PROCESS: 8000,
};

// Token Refresh Configuration
export const TOKEN_CONFIG = {
  REFRESH_BUFFER: 5 * 60 * 1000,
  CHECK_INTERVAL: 60 * 1000,
};

// User-Friendly Error Messages
export const AUTH_ERRORS = {
  POPUP_BLOCKED: 'Pop-up was blocked. Please allow pop-ups for this site and try again.',
  USER_CANCELLED: 'Sign-in was cancelled. Please try again.',
  TIMEOUT: 'Authentication timed out. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  ALREADY_IN_PROGRESS: 'Authentication is already in progress. Please wait.',
  NO_ACCOUNT: 'No account found. Please sign in first.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};
