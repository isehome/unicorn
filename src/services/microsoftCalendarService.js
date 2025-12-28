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

const getDateRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
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

export const fetchEventsForDate = async (authContext, date) => {
  try {
    let token = authContext?.accessToken;

    if (!token) {
      if (authContext?.acquireToken) {
        token = await authContext.acquireToken(false);
      }
      if (!token) return { connected: false, events: [], error: 'Not authenticated' };
    }

    const { start, end } = getDateRange(date);
    const timezone = getTimeZone();

    const url = new URL(graphConfig.graphCalendarEndpoint);
    url.searchParams.set('startDateTime', start);
    url.searchParams.set('endDateTime', end);
    url.searchParams.set('$orderby', 'start/dateTime');
    url.searchParams.set('$top', '50');
    url.searchParams.set('$select', 'id,subject,start,end,location,isAllDay,organizer,responseStatus,webLink');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Prefer': `outlook.timezone="${timezone}"`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Handle token refresh logic if needed, or just fail for now to keep it simple
        return { connected: false, events: [], error: 'Session expired' };
      }
      return { connected: true, events: [], error: 'Failed to fetch events' };
    }

    const data = await response.json();
    const events = Array.isArray(data.value) ? data.value.map(mapGraphEvent) : [];

    return { connected: true, events, error: null };
  } catch (error) {
    console.error('[Calendar] Fetch error:', error);
    return { connected: false, events: [], error: error.message };
  }
};

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
 * @param {Array} attendees - Optional list of attendees [{ email, name }]
 * @returns {Object} { success: boolean, eventId?: string, error?: string }
 */
export const createCalendarEvent = async (authContext, todo, attendees = []) => {
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

    // Add attendees if provided
    if (attendees && attendees.length > 0) {
      eventBody.attendees = attendees.map(attendee => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.name || attendee.email
        },
        type: 'required'
      }));
    }

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
 * @param {Object} updates - Fields to update (title, doBy, plannedHours, attendees, etc.)
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

    // Update attendees if provided
    if (updates.attendees) {
      patchBody.attendees = updates.attendees.map(attendee => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.name || attendee.email
        },
        type: 'required'
      }));
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

/**
 * Check if a user has calendar availability for a specific time slot
 * Uses Microsoft Graph findMeetingTimes or calendar view to check conflicts
 * @param {Object} authContext - Auth context with token
 * @param {string} userEmail - Email of the user to check availability for
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format (optional, defaults to startTime + 2 hours)
 * @param {number} bufferMinutes - Buffer time in minutes to add before and after (default 30)
 * @returns {Object} { available: boolean, conflicts: Array, error?: string }
 */
export const checkUserAvailability = async (authContext, userEmail, date, startTime, endTime, bufferMinutes = 30) => {
  try {
    let token = authContext?.accessToken;

    if (!token && authContext?.acquireToken) {
      token = await authContext.acquireToken(false);
    }

    if (!token) {
      return { available: true, conflicts: [], error: 'Not authenticated - skipping availability check' };
    }

    if (!userEmail) {
      return { available: true, conflicts: [], error: 'No email provided - skipping availability check' };
    }

    const timezone = getTimeZone();

    // Parse times
    const [startHour, startMinute] = startTime.split(':').map(Number);
    let endHour, endMinute;

    if (endTime) {
      [endHour, endMinute] = endTime.split(':').map(Number);
    } else {
      // Default to 2 hours if no end time
      endHour = startHour + 2;
      endMinute = startMinute;
    }

    // Calculate buffer times (30 minutes before and after)
    const startWithBufferMinutes = (startHour * 60 + startMinute) - bufferMinutes;
    const endWithBufferMinutes = (endHour * 60 + endMinute) + bufferMinutes;

    const bufferedStartHour = Math.floor(Math.max(0, startWithBufferMinutes) / 60);
    const bufferedStartMin = Math.max(0, startWithBufferMinutes) % 60;
    const bufferedEndHour = Math.floor(Math.min(24 * 60 - 1, endWithBufferMinutes) / 60);
    const bufferedEndMin = Math.min(24 * 60 - 1, endWithBufferMinutes) % 60;

    // Create datetime strings for the buffered time range
    const startDateTime = `${date}T${String(bufferedStartHour).padStart(2, '0')}:${String(bufferedStartMin).padStart(2, '0')}:00`;
    const endDateTime = `${date}T${String(bufferedEndHour).padStart(2, '0')}:${String(bufferedEndMin).padStart(2, '0')}:00`;

    console.log(`[Calendar] Checking availability for ${userEmail} on ${date} from ${startTime} to ${endTime || 'TBD'} (with ${bufferMinutes}min buffer)`);

    // Use the calendar view endpoint to get events in the time range
    // We query the user's calendar using the /users/{email}/calendarView endpoint
    const url = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendarView`);
    url.searchParams.set('startDateTime', `${startDateTime}`);
    url.searchParams.set('endDateTime', `${endDateTime}`);
    url.searchParams.set('$select', 'id,subject,start,end,showAs,isCancelled');
    url.searchParams.set('$top', '20');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Prefer': `outlook.timezone="${timezone}"`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If we can't access the calendar, we can't check availability
      // Log the error but don't block scheduling
      const errorText = await response.text();
      console.warn('[Calendar] Could not check availability:', response.status, errorText);

      if (response.status === 403) {
        return { available: true, conflicts: [], error: 'No permission to check calendar - schedule at your discretion' };
      }

      return { available: true, conflicts: [], error: `Could not verify availability (${response.status})` };
    }

    const data = await response.json();
    const events = data.value || [];

    // Filter out cancelled events and free/tentative events
    const conflictingEvents = events.filter(event => {
      if (event.isCancelled) return false;
      // showAs: 'free', 'tentative', 'busy', 'oof' (out of office), 'workingElsewhere'
      if (event.showAs === 'free') return false;
      return true;
    });

    if (conflictingEvents.length > 0) {
      const conflicts = conflictingEvents.map(event => ({
        subject: event.subject || 'Busy',
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        showAs: event.showAs
      }));

      console.log(`[Calendar] Found ${conflicts.length} conflicts for ${userEmail}:`, conflicts);

      return {
        available: false,
        conflicts,
        error: null
      };
    }

    console.log(`[Calendar] ${userEmail} is available for the requested time slot`);
    return { available: true, conflicts: [], error: null };

  } catch (error) {
    console.error('[Calendar] Availability check error:', error);
    // Don't block scheduling if we can't check availability
    return { available: true, conflicts: [], error: error.message };
  }
};

/**
 * Create a calendar event for a service appointment
 * Includes customer email as an attendee and proper service details
 * @param {Object} authContext - Auth context with token
 * @param {Object} scheduleData - Schedule data with ticket info
 * @returns {Object} { success: boolean, eventId?: string, error?: string }
 */
export const createServiceAppointmentEvent = async (authContext, scheduleData) => {
  try {
    let token = authContext?.accessToken;

    if (!token && authContext?.acquireToken) {
      token = await authContext.acquireToken(false);
    }

    if (!token) {
      return { success: false, error: 'Not authenticated. Please sign in.' };
    }

    const {
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end,
      ticket,
      customer_name,
      customer_email,
      service_address,
      technician_name,
      is_tentative = true
    } = scheduleData;

    if (!scheduled_date || !scheduled_time_start) {
      return { success: false, error: 'Schedule date and start time are required.' };
    }

    const timezone = getTimeZone();

    // Parse start time
    const [startHour, startMinute] = scheduled_time_start.split(':').map(Number);

    // Parse end time (default to start + 2 hours)
    let endHour, endMinute;
    if (scheduled_time_end) {
      [endHour, endMinute] = scheduled_time_end.split(':').map(Number);
    } else {
      const estimatedHours = ticket?.estimated_hours || 2;
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = startMinutes + (estimatedHours * 60);
      endHour = Math.floor(endMinutes / 60);
      endMinute = endMinutes % 60;
    }

    // Format datetimes
    const startDateTime = `${scheduled_date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`;
    const endDateTime = `${scheduled_date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

    // Build event subject
    const ticketNumber = ticket?.ticket_number || '';
    const customerDisplayName = customer_name || ticket?.customer_name || 'Customer';
    const statusPrefix = is_tentative ? '[TENTATIVE] ' : '';
    const subject = `${statusPrefix}Service: ${customerDisplayName}${ticketNumber ? ` (#${ticketNumber})` : ''}`;

    // Build event body
    const bodyContent = [
      ticket?.title || 'Service Appointment',
      '',
      `Customer: ${customerDisplayName}`,
      service_address || ticket?.service_address ? `Address: ${service_address || ticket?.service_address}` : '',
      ticket?.customer_phone ? `Phone: ${ticket.customer_phone}` : '',
      customer_email || ticket?.customer_email ? `Email: ${customer_email || ticket?.customer_email}` : '',
      '',
      ticket?.description ? `Notes: ${ticket.description}` : '',
      ticketNumber ? `Ticket: #${ticketNumber}` : '',
    ].filter(Boolean).join('\n');

    const eventBody = {
      subject,
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
        content: bodyContent,
      },
      location: {
        displayName: service_address || ticket?.service_address || '',
      },
      categories: ['Service Appointment'],
      showAs: is_tentative ? 'tentative' : 'busy',
    };

    // Add customer as attendee if email is available
    const customerEmailAddress = customer_email || ticket?.customer_email;
    if (customerEmailAddress) {
      eventBody.attendees = [{
        emailAddress: {
          address: customerEmailAddress,
          name: customerDisplayName
        },
        type: 'required'
      }];
    }

    console.log('[Calendar] Creating service appointment event:', eventBody);

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
            console.log('[Calendar] Service appointment event created after token refresh:', data.id);
            return { success: true, eventId: data.id };
          }
        }
      }
      return { success: false, error: 'Session expired. Please sign in again.' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Calendar] Failed to create service event:', response.status, errorText);

      if (response.status === 403) {
        return { success: false, error: 'Calendar write access denied. Please check permissions.' };
      }

      return { success: false, error: 'Failed to create calendar event.' };
    }

    const data = await response.json();
    console.log('[Calendar] Service appointment event created successfully:', data.id);

    return { success: true, eventId: data.id };

  } catch (error) {
    console.error('[Calendar] Create service event error:', error);
    return { success: false, error: error.message || 'Failed to create calendar event.' };
  }
};

/**
 * Update a service appointment calendar event (e.g., when confirmed)
 * @param {Object} authContext - Auth context with token
 * @param {string} eventId - Microsoft Graph event ID
 * @param {Object} updates - Fields to update
 * @returns {Object} { success: boolean, error?: string }
 */
export const updateServiceAppointmentEvent = async (authContext, eventId, updates) => {
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

    // Update subject (remove [TENTATIVE] prefix if confirmed)
    if (updates.is_confirmed !== undefined) {
      // We need to get the current subject first and update it
      if (updates.subject) {
        patchBody.subject = updates.is_confirmed
          ? updates.subject.replace('[TENTATIVE] ', '')
          : updates.subject;
      }
      patchBody.showAs = updates.is_confirmed ? 'busy' : 'tentative';
    }

    // Update times if provided
    if (updates.scheduled_date && updates.scheduled_time_start) {
      const [startHour, startMinute] = updates.scheduled_time_start.split(':').map(Number);
      const startDateTime = `${updates.scheduled_date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`;

      patchBody.start = {
        dateTime: startDateTime,
        timeZone: timezone,
      };

      if (updates.scheduled_time_end) {
        const [endHour, endMinute] = updates.scheduled_time_end.split(':').map(Number);
        const endDateTime = `${updates.scheduled_date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;
        patchBody.end = {
          dateTime: endDateTime,
          timeZone: timezone,
        };
      }
    }

    // Update location
    if (updates.service_address) {
      patchBody.location = {
        displayName: updates.service_address,
      };
    }

    // Update attendees (customer email)
    if (updates.customer_email) {
      patchBody.attendees = [{
        emailAddress: {
          address: updates.customer_email,
          name: updates.customer_name || updates.customer_email
        },
        type: 'required'
      }];
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
      console.error('[Calendar] Failed to update service event:', response.status);
      return { success: false, error: 'Failed to update calendar event.' };
    }

    console.log('[Calendar] Service appointment event updated successfully:', eventId);
    return { success: true };

  } catch (error) {
    console.error('[Calendar] Update service event error:', error);
    return { success: false, error: error.message };
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
  checkUserAvailability,
  createServiceAppointmentEvent,
  updateServiceAppointmentEvent,
};
