import { supabase } from '../lib/supabase';

const toStartOfDayIso = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
};

const toEndOfDayIso = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

const getTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    console.warn('Failed to resolve timezone, defaulting to UTC', error);
    return 'UTC';
  }
};

// Token cache to avoid multiple concurrent token fetches
let tokenPromise = null;
let cachedToken = null;
let tokenExpiry = null;

const getProviderToken = async (forceRefresh = false) => {
  if (!supabase) {
    return null;
  }

  // If token is cached and not expired, return it
  if (!forceRefresh && cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // If we're already fetching a token, wait for that promise
  if (tokenPromise && !forceRefresh) {
    return tokenPromise;
  }

  // Create new token fetch promise
  tokenPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session for calendar:', error);
        cachedToken = null;
        tokenExpiry = null;
        return null;
      }

      const token = data?.session?.provider_token || null;
      
      if (token) {
        // Cache the token with a 50-minute expiry (tokens usually last 1 hour)
        cachedToken = token;
        tokenExpiry = Date.now() + 50 * 60 * 1000;
      } else {
        cachedToken = null;
        tokenExpiry = null;
      }
      
      return token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
};

const refreshTokenIfNeeded = async () => {
  if (!supabase) return null;
  
  try {
    // Try to refresh the session to get a new provider token
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error('Failed to refresh session for calendar:', error);
      return null;
    }
    
    const token = data?.session?.provider_token || null;
    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + 50 * 60 * 1000;
    }
    
    return token;
  } catch (err) {
    console.error('Error refreshing token:', err);
    return null;
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
  responseStatus: event.responseStatus?.response || 'none'
});

export const fetchTodayEvents = async (retryCount = 0) => {
  try {
    let token = await getProviderToken();

    if (!token) {
      return {
        connected: false,
        events: [],
        error: 'No calendar connection available'
      };
    }

    const start = toStartOfDayIso();
    const end = toEndOfDayIso();
    const timezone = getTimeZone();
    const graphUrl = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
    graphUrl.searchParams.set('startDateTime', start);
    graphUrl.searchParams.set('endDateTime', end);
    graphUrl.searchParams.set('$orderby', 'start/dateTime');
    graphUrl.searchParams.set('$top', '20');
    graphUrl.searchParams.set('$select', 'id,subject,start,end,location,isAllDay,organizer,responseStatus');

    const response = await fetch(graphUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: `outlook.timezone="${timezone}"`,
        'Content-Type': 'application/json'
      }
    });

    // Handle token expiry
    if (response.status === 401 && retryCount < 2) {
      console.log('Token expired, attempting to refresh...');
      
      // Clear cached token
      cachedToken = null;
      tokenExpiry = null;
      
      // Try to refresh the token
      const newToken = await refreshTokenIfNeeded();
      
      if (newToken) {
        // Retry with new token
        return fetchTodayEvents(retryCount + 1);
      } else {
        return {
          connected: false,
          events: [],
          error: 'Calendar authentication expired. Please sign in again.'
        };
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Microsoft Graph API error:', response.status, errorText);
      
      // Provide user-friendly error messages
      let errorMessage = 'Unable to fetch calendar events';
      
      if (response.status === 403) {
        errorMessage = 'Calendar access denied. Please check permissions.';
      } else if (response.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (response.status >= 500) {
        errorMessage = 'Microsoft services are temporarily unavailable.';
      }
      
      return {
        connected: true,
        events: [],
        error: errorMessage
      };
    }

    const payload = await response.json();
    const events = Array.isArray(payload.value)
      ? payload.value.map(mapGraphEvent)
      : [];

    return {
      connected: true,
      events,
      error: null
    };
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    
    // Network error handling
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      return {
        connected: false,
        events: [],
        error: 'Network error. Please check your connection.'
      };
    }
    
    return {
      connected: false,
      events: [],
      error: 'Unable to load calendar events'
    };
  }
};

export const hasCalendarConnection = async () => {
  try {
    const token = await getProviderToken();
    return Boolean(token);
  } catch (error) {
    console.error('Failed to determine calendar connection', error);
    return false;
  }
};

// Clear cached token when user logs out
export const clearCalendarCache = () => {
  cachedToken = null;
  tokenExpiry = null;
  tokenPromise = null;
};
