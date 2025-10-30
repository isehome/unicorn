import React, { memo, useCallback, useMemo } from 'react';
import Button from '../ui/Button';
import { Calendar, Loader } from 'lucide-react';

// Memoized Calendar Event Component
const CalendarEvent = memo(({ event, formatEventTime }) => (
  <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" />
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{event.subject}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {formatEventTime(event.start, event.end)}
        {event.location ? ` • ${event.location}` : ''}
      </p>
    </div>
  </div>
));

CalendarEvent.displayName = 'CalendarEvent';

/**
 * CalendarSection - Displays Microsoft 365 calendar events for today
 *
 * Features:
 * - Shows today's calendar events
 * - Connect to Microsoft 365
 * - Refresh calendar data
 * - Handles loading and error states
 */
const CalendarSection = ({ sectionStyles, calendar, onConnectCalendar }) => {
  // Memoized event time formatter
  const formatEventTime = useCallback((start, end) => {
    try {
      const options = { hour: 'numeric', minute: '2-digit' };
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (startDate && endDate) {
        return `${startDate.toLocaleTimeString([], options)} – ${endDate.toLocaleTimeString([], options)}`;
      }
      if (startDate) {
        return startDate.toLocaleTimeString([], options);
      }
      return 'All day';
    } catch (error) {
      return 'All day';
    }
  }, []);

  // Memoized calendar data
  const calendarData = useMemo(() => {
    if (!calendar.data) return { connected: false, events: [] };
    return {
      connected: calendar.data.connected || false,
      events: calendar.data.events || []
    };
  }, [calendar.data]);

  return (
    <div style={sectionStyles.card} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Today's Schedule</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Synced from Microsoft 365</p>
        </div>
        <div className="flex gap-2">
          {calendarData.connected ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Calendar}
              onClick={() => calendar.refetch()}
              disabled={calendar.isFetching}
            >
              Refresh
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={Calendar}
              onClick={onConnectCalendar}
            >
              Connect Calendar
            </Button>
          )}
        </div>
      </div>

      {calendar.error && (
        <p className="text-sm text-rose-500">{calendar.error.message}</p>
      )}

      {calendar.isFetching ? (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Loader className="w-4 h-4 animate-spin text-violet-500" />
          <span>Loading calendar…</span>
        </div>
      ) : (
        <div className="space-y-2">
          {calendarData.connected && calendarData.events.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-300">No events scheduled for today.</p>
          )}
          {!calendarData.connected && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Connect your Microsoft account to see today's appointments.
            </p>
          )}
          {calendarData.events.map((event) => (
            <CalendarEvent key={event.id} event={event} formatEventTime={formatEventTime} />
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(CalendarSection);
