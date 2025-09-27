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

const getProviderToken = async () => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data?.session?.provider_token || null;
};

const mapGraphEvent = (event) => ({
  id: event.id,
  subject: event.subject || 'Untitled event',
  start: event.start?.dateTime || null,
  end: event.end?.dateTime || null,
  location: event.location?.displayName || ''
});

export const fetchTodayEvents = async () => {
  const token = await getProviderToken();

  if (!token) {
    return {
      connected: false,
      events: []
    };
  }

  const start = toStartOfDayIso();
  const end = toEndOfDayIso();
  const timezone = getTimeZone();
  const graphUrl = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
  graphUrl.searchParams.set('startDateTime', start);
  graphUrl.searchParams.set('endDateTime', end);
  graphUrl.searchParams.set('$orderby', 'start/dateTime');
  graphUrl.searchParams.set('$top', '10');

  const response = await fetch(graphUrl.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone="${timezone}"`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Microsoft Graph error (${response.status})`);
  }

  const payload = await response.json();
  const events = Array.isArray(payload.value)
    ? payload.value.map(mapGraphEvent)
    : [];

  return {
    connected: true,
    events
  };
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
