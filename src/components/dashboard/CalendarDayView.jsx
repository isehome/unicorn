import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import Button from '../ui/Button';

// Time slot height in pixels
const HOUR_HEIGHT = 60;
const START_HOUR = 8;  // 8 AM
const END_HOUR = 18;   // 6 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;

// Importance colors for todos
const importanceColors = {
  critical: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' },
  high: { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#f97316' },
  normal: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },
  low: { bg: 'rgba(148, 175, 50, 0.15)', border: '#94AF32', text: '#94AF32' }
};

// White/neutral for calendar events
const calendarEventColor = {
  bg: 'rgba(255, 255, 255, 0.9)',
  border: '#9333ea',
  text: '#1f2937'
};

/**
 * Parse time from ISO string and return hours as decimal
 */
const getHourFromTime = (timeString) => {
  if (!timeString) return null;
  try {
    const date = new Date(timeString);
    return date.getHours() + date.getMinutes() / 60;
  } catch {
    return null;
  }
};

/**
 * Format time for display
 */
const formatTime = (timeString) => {
  if (!timeString) return '';
  try {
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

/**
 * Format date for header display
 */
const formatDateHeader = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((compareDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

/**
 * Convert pixel position to hour (decimal)
 */
const pixelToHour = (pixels) => {
  return START_HOUR + (pixels / HOUR_HEIGHT);
};

/**
 * Convert hour (decimal) to time string (HH:MM)
 */
const hourToTimeString = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/**
 * Snap to 15-minute increments
 */
const snapToQuarter = (hour) => {
  return Math.round(hour * 4) / 4;
};

/**
 * Resizable Event Block Component
 */
const EventBlock = memo(({
  event,
  type,
  top,
  height,
  onClick,
  onResizeStart,
  onResizeEnd,
  isResizing,
  resizeHeight
}) => {
  const colors = type === 'calendar' ? calendarEventColor : (importanceColors[event.importance] || importanceColors.normal);
  const canResize = type === 'todo'; // Only todos can be resized
  const displayHeight = isResizing ? resizeHeight : height;

  const handleResizeMouseDown = (e) => {
    if (!canResize) return;
    e.stopPropagation();
    e.preventDefault();
    onResizeStart?.(event, e);
  };

  return (
    <div
      className="absolute left-12 right-2 rounded-lg border-l-4 px-2 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden group"
      style={{
        top: `${top}px`,
        height: `${Math.max(displayHeight, 24)}px`,
        backgroundColor: colors.bg,
        borderLeftColor: colors.border,
        zIndex: isResizing ? 50 : (type === 'calendar' ? 10 : 20)
      }}
      onClick={(e) => {
        if (!isResizing) onClick?.(e);
      }}
    >
      <div className="flex items-center gap-1">
        {type === 'todo' && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.border }}
          />
        )}
        <span
          className="text-xs font-medium truncate"
          style={{ color: type === 'calendar' ? colors.text : colors.border }}
        >
          {type === 'todo' ? event.title : event.subject}
        </span>
      </div>
      {displayHeight >= 40 && (
        <div className="text-xs opacity-70 truncate" style={{ color: type === 'calendar' ? colors.text : colors.border }}>
          {type === 'calendar' && event.location ? event.location : ''}
          {type === 'todo' && (isResizing ? `${(displayHeight / HOUR_HEIGHT).toFixed(1)}h` : (event.plannedHours ? `${event.plannedHours}h` : ''))}
        </div>
      )}

      {/* Resize handle - only for todos */}
      {canResize && (
        <div
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
          onMouseDown={handleResizeMouseDown}
        >
          <div className="w-8 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
        </div>
      )}
    </div>
  );
});

EventBlock.displayName = 'EventBlock';

/**
 * Hour Label Component
 */
const HourLabel = memo(({ hour }) => {
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';

  return (
    <div
      className="absolute left-0 w-10 text-right pr-2 text-xs text-gray-400"
      style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT - 8}px` }}
    >
      {displayHour}{ampm}
    </div>
  );
});

HourLabel.displayName = 'HourLabel';

/**
 * Current Time Indicator
 */
const CurrentTimeIndicator = memo(({ isToday }) => {
  if (!isToday) return null;

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  if (currentHour < START_HOUR || currentHour > END_HOUR) return null;

  const top = (currentHour - START_HOUR) * HOUR_HEIGHT;

  return (
    <div
      className="absolute left-10 right-0 flex items-center z-30"
      style={{ top: `${top}px` }}
    >
      <div className="w-2 h-2 rounded-full bg-red-500" />
      <div className="flex-1 h-0.5 bg-red-500" />
    </div>
  );
});

CurrentTimeIndicator.displayName = 'CurrentTimeIndicator';

/**
 * CalendarDayView - Shows calendar events and todos in a day view timeline
 */
const CalendarDayView = ({
  sectionStyles,
  calendar,
  todos = [],
  selectedDate = new Date(),
  onDateChange,
  onConnectCalendar,
  onTodoClick,
  onTodoResize,
  hideHeader = false
}) => {
  // Resize state
  const [resizingEvent, setResizingEvent] = useState(null);
  const [resizeHeight, setResizeHeight] = useState(0);
  const gridRef = useRef(null);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  // Memoized events for the selected date
  const { calendarEvents, todoEvents } = useMemo(() => {
    const selectedDateStr = selectedDate.toISOString().split('T')[0];

    // Filter calendar events for selected date
    const calendarEvents = (calendar?.data?.events || []).filter(event => {
      if (!event.start) return false;
      const eventDate = new Date(event.start).toISOString().split('T')[0];
      return eventDate === selectedDateStr;
    });

    // Filter todos with doBy on selected date
    const todoEvents = todos.filter(todo => {
      if (!todo.doBy || todo.completed) return false;
      const todoDate = new Date(todo.doBy).toISOString().split('T')[0];
      return todoDate === selectedDateStr;
    });

    return { calendarEvents, todoEvents };
  }, [calendar?.data?.events, todos, selectedDate]);

  // Calculate positions for events
  const positionedEvents = useMemo(() => {
    const events = [];

    // Add calendar events
    calendarEvents.forEach(event => {
      const startHour = getHourFromTime(event.start) || START_HOUR;
      const endHour = getHourFromTime(event.end) || (startHour + 1);

      const clampedStart = Math.max(startHour, START_HOUR);
      const clampedEnd = Math.min(endHour, END_HOUR);

      if (clampedStart < END_HOUR) {
        events.push({
          ...event,
          type: 'calendar',
          top: (clampedStart - START_HOUR) * HOUR_HEIGHT,
          height: (clampedEnd - clampedStart) * HOUR_HEIGHT
        });
      }
    });

    // Add todo events
    todoEvents.forEach(todo => {
      // Default to 9 AM if no specific time
      let startHour = 9;
      if (todo.doBy) {
        const doByDate = new Date(todo.doBy);
        if (doByDate.getHours() !== 0 || doByDate.getMinutes() !== 0) {
          startHour = doByDate.getHours() + doByDate.getMinutes() / 60;
        }
      }

      const duration = todo.plannedHours || todo.planned_hours || 1;
      const endHour = startHour + duration;

      const clampedStart = Math.max(startHour, START_HOUR);
      const clampedEnd = Math.min(endHour, END_HOUR);

      if (clampedStart < END_HOUR) {
        events.push({
          ...todo,
          type: 'todo',
          top: (clampedStart - START_HOUR) * HOUR_HEIGHT,
          height: (clampedEnd - clampedStart) * HOUR_HEIGHT
        });
      }
    });

    return events;
  }, [calendarEvents, todoEvents]);

  // Check if selected date is today
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  // Navigation handlers
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange?.(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange?.(newDate);
  };

  const goToToday = () => {
    onDateChange?.(new Date());
  };

  // Resize handlers
  const handleResizeStart = useCallback((event, mouseEvent) => {
    setResizingEvent(event);
    setResizeHeight(event.height);
    resizeStartY.current = mouseEvent.clientY;
    resizeStartHeight.current = event.height;
  }, []);

  const handleResizeMove = useCallback((e) => {
    if (!resizingEvent) return;

    const deltaY = e.clientY - resizeStartY.current;
    const newHeight = Math.max(
      HOUR_HEIGHT * 0.25, // Minimum 15 minutes
      Math.min(
        resizeStartHeight.current + deltaY,
        (END_HOUR - START_HOUR - (resizingEvent.top / HOUR_HEIGHT)) * HOUR_HEIGHT // Max to end of day
      )
    );

    // Snap to 15-minute increments
    const snappedHeight = Math.round(newHeight / (HOUR_HEIGHT / 4)) * (HOUR_HEIGHT / 4);
    setResizeHeight(snappedHeight);
  }, [resizingEvent]);

  const handleResizeEnd = useCallback(() => {
    if (!resizingEvent) return;

    // Calculate new duration in hours
    const newDuration = snapToQuarter(resizeHeight / HOUR_HEIGHT);

    // Only trigger update if duration actually changed
    if (newDuration !== (resizingEvent.plannedHours || resizingEvent.planned_hours || 1)) {
      onTodoResize?.(resizingEvent, newDuration);
    }

    setResizingEvent(null);
    setResizeHeight(0);
  }, [resizingEvent, resizeHeight, onTodoResize]);

  // Global mouse event handlers for resize
  useEffect(() => {
    if (!resizingEvent) return;

    const handleMouseMove = (e) => handleResizeMove(e);
    const handleMouseUp = () => handleResizeEnd();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingEvent, handleResizeMove, handleResizeEnd]);

  // Generate hour lines
  const hourLines = useMemo(() => {
    const lines = [];
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      lines.push(hour);
    }
    return lines;
  }, []);

  const connected = calendar?.data?.connected || false;

  return (
    <div style={hideHeader ? {} : sectionStyles.card} className="space-y-3">
      {/* Header - only show if not hidden */}
      {!hideHeader && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-500" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[160px] text-center">
              {formatDateHeader(selectedDate)}
            </h2>
            <button
              onClick={goToNextDay}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronRight size={20} className="text-gray-500" />
            </button>
            {!isToday && (
              <button
                onClick={goToToday}
                className="ml-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {connected ? (
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
      )}

      {/* Date navigation for when header is hidden */}
      {hideHeader && (
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousDay}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-500" />
          </button>
          <h3 className="text-base font-medium text-gray-900 dark:text-white min-w-[140px] text-center">
            {formatDateHeader(selectedDate)}
          </h3>
          <button
            onClick={goToNextDay}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronRight size={20} className="text-gray-500" />
          </button>
          {!isToday && (
            <button
              onClick={goToToday}
              className="ml-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              Today
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {calendar.isFetching && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Loader className="w-4 h-4 animate-spin text-violet-500" />
          <span>Loading calendar...</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-l-2" style={{ borderColor: calendarEventColor.border, backgroundColor: calendarEventColor.bg }} />
          <span>Calendar</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-l-2" style={{ borderColor: importanceColors.critical.border, backgroundColor: importanceColors.critical.bg }} />
          <span>Critical</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-l-2" style={{ borderColor: importanceColors.high.border, backgroundColor: importanceColors.high.bg }} />
          <span>High</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-l-2" style={{ borderColor: importanceColors.normal.border, backgroundColor: importanceColors.normal.bg }} />
          <span>Normal</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-l-2" style={{ borderColor: importanceColors.low.border, backgroundColor: importanceColors.low.bg }} />
          <span>Low</span>
        </div>
      </div>

      {/* Day View Grid */}
      <div
        ref={gridRef}
        className="relative overflow-y-auto"
        style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT + 20}px`, userSelect: resizingEvent ? 'none' : 'auto' }}
      >
        {/* Hour labels and lines */}
        {hourLines.map(hour => (
          <React.Fragment key={hour}>
            <HourLabel hour={hour} />
            <div
              className="absolute left-10 right-0 border-t border-gray-200 dark:border-gray-700"
              style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
            />
          </React.Fragment>
        ))}

        {/* Current time indicator */}
        <CurrentTimeIndicator isToday={isToday} />

        {/* Events */}
        {positionedEvents.map((event, idx) => (
          <EventBlock
            key={event.type === 'calendar' ? event.id : `todo-${event.id}`}
            event={event}
            type={event.type}
            top={event.top}
            height={event.height}
            onClick={() => event.type === 'todo' && onTodoClick?.(event)}
            onResizeStart={handleResizeStart}
            isResizing={resizingEvent?.id === event.id && event.type === 'todo'}
            resizeHeight={resizingEvent?.id === event.id ? resizeHeight : event.height}
          />
        ))}

        {/* Empty state */}
        {!calendar.isFetching && positionedEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No events or todos scheduled</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(CalendarDayView);
