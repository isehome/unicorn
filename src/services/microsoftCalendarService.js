/**
 * Microsoft Calendar Service
 * 
 * Service for fetching calendar events from Microsoft Graph API
 * Uses MSAL access tokens from AuthContext
 */

import { graphConfig } from '../config/authConfig';

const getToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

const getTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    console.warn('[Calendar] Failed to resolve timezone, defaulting to UTC', error);
    return 'UTC';
  }
};

const mapGraphEvent = (event) => ({
  id: event.id,
  subject: event.subject || 'Untitled event',
  start: event.start?.dateTime || null,
  end: event.end?.dateTime || null,
  location: event.location?.displayName || '',
  isAllDay: event.isAllDay || false,
  organizer: event.organizer?.emailAddress?.name || '',
  responseStatus: event.responseStatus?.response || 'none',
  webLink: event.webLink || null,
});

export const fetchTodayEvents = async (authContext) => {
  try {
    let token = authContext?.accessToken;
    
    if (!token) {
      console.log('[Calendar] No access token available, attempting to acquire');
      
      if (authContext?.acquireToken) {
        token = await authContext.acquireToken(false);
      }
      
      if (!token) {
        return {
          connected: false,
          events: [],
          error: 'Calendar not connected. Please sign in to connect your calendar.',
        };
      }
    }

    const { start, end } = getToday();
    const timezone = getTimeZone();
    
    const url = new URL(graphConfig.graphCalendarEndpoint);
    url.searchParams.set('startDateTime', start);
    url.searchParams.set('endDateTime', end);
    url.searchParams.set('$orderby', 'start/dateTime');
    url.searchParams.set('$top', '20');
    url.searchParams.set('$select', 'id,subject,start,end,location,isAllDay,organizer,responseStatus,webLink');

    console.log('[Calendar] Fetching events from Graph API');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Prefer': `outlook.timezone="${timezone}"`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      console.warn('[Calendar] Token expired (401), attempting refresh');
      
      if (authContext?.acquireToken) {
        const newToken = await authContext.acquireToken(false);
        
        if (newToken) {
          console.log('[Calendar] Got new token, retrying request');
          
          const retryResponse = await fetch(url.toString(), {
            headers: {
              'Authorization': `Bearer ${newToken}`,
              'Prefer': `outlook.timezone="${timezone}"`,
              'Content-Type': 'application/json',
            },
          });
          
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            const events = Array.isArray(data.value) 
              ? data.value.map(mapGraphEvent)
              : [];
            
            console.log(`[Calendar] Successfully fetched ${events.length} events after token refresh`);
            return { connected: true, events, error: null };
          }
        }
      }
      
      return {
        connected: false,
        events: [],
        error: 'Calendar session expired. Please sign in again.',
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Calendar] Graph API error:', response.status, errorText);
      
      let errorMessage = 'Unable to fetch calendar events';
      
      if (response.status === 403) {
        errorMessage = 'Calendar access denied. Please check permissions in Azure AD.';
      } else if (response.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment.';
      } else if (response.status >= 500) {
        errorMessage = 'Microsoft services are temporarily unavailable.';
      }
      
      return {
        connected: true,
        events: [],
        error: errorMessage,
      };
    }

    const data = await response.json();
    const events = Array.isArray(data.value)
      ? data.value.map(mapGraphEvent)
      : [];
    
    console.log(`[Calendar] Successfully fetched ${events.length} events`);
    
    return {
      connected: true,
      events,
      error: null,
    };
    
  } catch (error) {
    console.error('[Calendar] Fetch error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      return {
        connected: false,
        events: [],
        error: 'Network error. Please check your connection.',
      };
    }
    
    return {
      connected: false,
      events: [],
      error: 'Unable to load calendar events. Please try again.',
    };
  }
};

export const hasCalendarConnection = (authContext) => {
  return Boolean(authContext?.accessToken);
};

export const getCalendarStatus = (authContext) => {
  const connected = hasCalendarConnection(authContext);
  const userEmail = authContext?.user?.email || null;
  
  if (!connected) {
    return {
      connected: false,
      userEmail: null,
      error: 'Calendar not connected. Please sign in.',
    };
  }
  
  return {
    connected: true,
    userEmail,
    error: null,
  };
};

export const fetchUserProfile = async (authContext) => {
  try {
    const token = authContext?.accessToken;
    
    if (!token) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const response = await fetch(graphConfig.graphMeEndpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Graph API error: ${response.status}`);
    }

    const profile = await response.json();
    
    return {
      success: true,
      profile,
    };
    
  } catch (error) {
    console.error('[Calendar] Failed to fetch user profile:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export default {
  fetchTodayEvents,
  hasCalendarConnection,
  getCalendarStatus,
  fetchUserProfile,
};
