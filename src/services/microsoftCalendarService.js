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

/**
 * Create a calendar event from a todo item
 * @param {Object} authContext - Auth context with token
 * @param {Object} todo - Todo item with title, doBy, plannedHours, description
 * @returns {Object} { success: boolean, eventId?: string, error?: string }
 */
export const createCalendarEvent = async (authContext, todo) => {
  try {
    let token = authContext?.accessToken;

    if (!token && authContext?.acquireToken) {
      token = await authContext.acquireToken(false);
    }

    if (!token) {
      return { success: false, error: 'Not authenticated. Please sign in.' };
    }

    if (!todo.doBy) {
      return { success: false, error: 'Do By date is required to create a calendar event.' };
    }

    const timezone = getTimeZone();
    const plannedHours = todo.plannedHours || 1; // Default to 1 hour if not specified

    // Parse the doBy date - it comes as YYYY-MM-DD string
    // We'll create the datetime string directly to avoid timezone conversion issues
    const dateStr = todo.doBy.split('T')[0]; // Get just the date part YYYY-MM-DD

    // Use provided time or default to 9 AM
    const startTime = todo.doByTime || '09:00';
    const [startHour, startMinute] = startTime.split(':').map(Number);

    // Calculate end time based on start time + planned hours
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + (plannedHours * 60);
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;

    // Format as ISO datetime without timezone suffix (Graph API expects local time with timezone specified separately)
    const startDateTime = `${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`;
    const endDateTime = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

    const eventBody = {
      subject: `[Todo] ${todo.title}`,
      start: {
        dateTime: startDateTime,
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone,
      },
      body: {
        contentType: 'text',
        content: todo.description || `Task: ${todo.title}\nPlanned: ${plannedHours} hour(s)`,
      },
      categories: ['Todo'], // Tag as a todo item
      showAs: 'busy',
    };

    console.log('[Calendar] Creating event:', eventBody);

    const response = await fetch(graphConfig.graphEventsEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      if (authContext?.acquireToken) {
        const newToken = await authContext.acquireToken(false);
        if (newToken) {
          const retryResponse = await fetch(graphConfig.graphEventsEndpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${newToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventBody),
          });

          if (retryResponse.ok) {
            const data = await retryResponse.json();
            console.log('[Calendar] Event created after token refresh:', data.id);
            return { success: true, eventId: data.id };
          }
        }
      }
      return { success: false, error: 'Session expired. Please sign in again.' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Calendar] Failed to create event:', response.status, errorText);

      if (response.status === 403) {
        return { success: false, error: 'Calendar write access denied. Please check permissions.' };
      }

      return { success: false, error: 'Failed to create calendar event.' };
    }

    const data = await response.json();
    console.log('[Calendar] Event created successfully:', data.id);

    return { success: true, eventId: data.id };

  } catch (error) {
    console.error('[Calendar] Create event error:', error);
    return { success: false, error: error.message || 'Failed to create calendar event.' };
  }
};

/**
 * Update an existing calendar event
 * @param {Object} authContext - Auth context with token
 * @param {string} eventId - Microsoft Graph event ID
 * @param {Object} updates - Fields to update (title, doBy, plannedHours, etc.)
 * @returns {Object} { success: boolean, error?: string }
 */
export const updateCalendarEvent = async (authContext, eventId, updates) => {
  try {
    let token = authContext?.accessToken;

    if (!token && authContext?.acquireToken) {
      token = await authContext.acquireToken(false);
    }

    if (!token) {
      return { success: false, error: 'Not authenticated.' };
    }

    const timezone = getTimeZone();
    const patchBody = {};

    if (updates.title) {
      patchBody.subject = `[Todo] ${updates.title}`;
    }

    if (updates.doBy) {
      const plannedHours = updates.plannedHours || 1;
      const dateStr = updates.doBy.split('T')[0]; // Get just the date part YYYY-MM-DD

      // Use provided time or default to 9 AM
      const startTime = updates.doByTime || '09:00';
      const [startHour, startMinute] = startTime.split(':').map(Number);

      // Calculate end time based on start time + planned hours
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = startMinutes + (plannedHours * 60);
      const endHour = Math.floor(endMinutes / 60);
      const endMinute = endMinutes % 60;

      const startDateTime = `${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`;
      const endDateTime = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

      patchBody.start = {
        dateTime: startDateTime,
        timeZone: timezone,
      };
      patchBody.end = {
        dateTime: endDateTime,
        timeZone: timezone,
      };
    }

    if (updates.description) {
      patchBody.body = {
        contentType: 'text',
        content: updates.description,
      };
    }

    const response = await fetch(`${graphConfig.graphEventsEndpoint}/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    });

    if (!response.ok) {
      console.error('[Calendar] Failed to update event:', response.status);
      return { success: false, error: 'Failed to update calendar event.' };
    }

    console.log('[Calendar] Event updated successfully:', eventId);
    return { success: true };

  } catch (error) {
    console.error('[Calendar] Update event error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete a calendar event
 * @param {Object} authContext - Auth context with token
 * @param {string} eventId - Microsoft Graph event ID
 * @returns {Object} { success: boolean, error?: string }
 */
export const deleteCalendarEvent = async (authContext, eventId) => {
  try {
    let token = authContext?.accessToken;

    if (!token && authContext?.acquireToken) {
      token = await authContext.acquireToken(false);
    }

    if (!token) {
      return { success: false, error: 'Not authenticated.' };
    }

    const response = await fetch(`${graphConfig.graphEventsEndpoint}/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // 204 No Content is success for DELETE
    if (response.status === 204 || response.ok) {
      console.log('[Calendar] Event deleted successfully:', eventId);
      return { success: true };
    }

    // 404 means already deleted, which is fine
    if (response.status === 404) {
      console.log('[Calendar] Event already deleted:', eventId);
      return { success: true };
    }

    console.error('[Calendar] Failed to delete event:', response.status);
    return { success: false, error: 'Failed to delete calendar event.' };

  } catch (error) {
    console.error('[Calendar] Delete event error:', error);
    return { success: false, error: error.message };
  }
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
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};
