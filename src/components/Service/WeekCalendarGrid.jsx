/**
 * WeekCalendarGrid.jsx
 * Week view calendar grid for Weekly Planning "Air Traffic Control" interface
 * Supports drag-drop scheduling, infinite horizontal scroll, and time-based card sizing
 */

import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import { Clock, AlertCircle, Send } from 'lucide-react';
import { brandColors } from '../../styles/styleSystem';

// Constants
const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 6;   // 6 AM
const END_HOUR = 22;    // 10 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const MIN_DAY_WIDTH = 150;  // minimum pixels per day column
const TIME_COLUMN_WIDTH = 60;

// Module-level variable to store dragged ticket's estimated hours
// This is a workaround for browser security - dataTransfer.getData() returns empty during dragover
// The actual value is only accessible on drop event
let currentDragEstimatedHours = 2;

/**
 * Set the current drag estimated hours - call this from drag source
 * This allows the drop preview to show the correct duration
 */
export const setDragEstimatedHours = (hours) => {
  currentDragEstimatedHours = hours || 2;
};

/**
 * Reset drag estimated hours to default
 */
export const resetDragEstimatedHours = () => {
  currentDragEstimatedHours = 2;
};

// Schedule status colors - 4-step approval workflow
// Text is always white/light for readability; border/badge colors indicate status
const scheduleStatusColors = {
  // Draft: Not yet committed - can still be moved/adjusted
  draft: {
    bg: 'rgba(139, 92, 246, 0.15)',  // Violet (light)
    border: '#8B5CF6',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#A78BFA',             // Violet for status badge
    label: 'Draft',
    icon: 'edit',
    isDraggable: true
  },
  // Step 1: Waiting for technician to accept calendar invite
  pending_tech: {
    bg: 'rgba(245, 158, 11, 0.2)',   // Amber
    border: '#F59E0B',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#F59E0B',             // Amber for status badge
    label: 'Awaiting Tech',
    icon: 'clock',
    isDraggable: false
  },
  // Step 2: Tech accepted calendar invite, customer invite pending
  tech_accepted: {
    bg: 'rgba(59, 130, 246, 0.2)',   // Blue
    border: '#3B82F6',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#3B82F6',             // Blue for status badge
    label: 'Tech Accepted',
    icon: 'check',
    isDraggable: false
  },
  // Step 3: Customer invite sent, waiting for customer to accept
  pending_customer: {
    bg: 'rgba(6, 182, 212, 0.2)',    // Cyan
    border: '#06B6D4',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#06B6D4',             // Cyan for status badge
    label: 'Awaiting Customer',
    icon: 'clock',
    isDraggable: false
  },
  // Step 4: All confirmed
  confirmed: {
    bg: 'rgba(148, 175, 50, 0.2)',   // Green (brand)
    border: '#94AF32',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#94AF32',             // Green for status badge
    label: 'Confirmed',
    icon: 'check',
    isDraggable: false
  },
  // Cancelled
  cancelled: {
    bg: 'rgba(113, 113, 122, 0.2)',  // Gray
    border: '#71717A',
    text: '#A1A1AA',                  // Slightly dimmer for cancelled
    badgeText: '#71717A',             // Gray for status badge
    label: 'Cancelled',
    icon: 'x',
    isDraggable: false
  },
  // Legacy support for 'tentative' status (maps to draft)
  tentative: {
    bg: 'rgba(139, 92, 246, 0.15)',
    border: '#8B5CF6',
    text: '#E4E4E7',                  // Light gray - always readable
    badgeText: '#A78BFA',             // Violet for status badge
    label: 'Draft',
    icon: 'edit',
    isDraggable: true
  }
};

// Calendar blocked time (M365 events)
const blockedTimeColor = {
  bg: 'rgba(113, 113, 122, 0.3)',
  border: '#71717A',
  text: '#A1A1AA'
};

// Priority colors for ticket cards
const priorityColors = {
  urgent: { bg: '#ef4444', text: '#fff' },
  high: { bg: '#f97316', text: '#fff' },
  normal: { bg: '#3b82f6', text: '#fff' },
  low: { bg: '#94AF32', text: '#fff' }
};

/**
 * Format date to YYYY-MM-DD (using local timezone, not UTC)
 */
const formatDateLocal = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date to display string
 */
const formatDayHeader = (date) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(date);
  return {
    day: days[d.getDay()],
    date: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    full: formatDateLocal(d)
  };
};

/**
 * Check if date is today
 */
const isToday = (date) => {
  const today = new Date();
  const d = new Date(date);
  return d.toDateString() === today.toDateString();
};

/**
 * Convert time string (HH:MM) to hour decimal
 */
const timeToHour = (timeStr) => {
  if (!timeStr) return START_HOUR;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + minutes / 60;
};

/**
 * Convert hour decimal to time string
 */
const hourToTimeStr = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/**
 * Snap to 15-minute increments
 */
const snapToQuarter = (hour) => Math.round(hour * 4) / 4;

/**
 * Convert pixel Y position to hour
 */
const pixelToHour = (pixelY) => START_HOUR + (pixelY / HOUR_HEIGHT);

/**
 * Schedule Block Component - Now draggable for rescheduling
 */
// Category labels for display
const categoryLabels = {
  network: 'Network',
  av: 'AV',
  shades: 'Shades',
  control: 'Control',
  wiring: 'Wiring',
  lighting: 'Lighting',
  hvac: 'HVAC',
  security: 'Security',
  installation: 'Install',
  maintenance: 'Maint',
  general: 'Service',
  other: 'Other'
};

/**
 * Get initials from a name (first letter of first and last name)
 */
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Generate a consistent color based on technician name
 */
const getTechnicianColor = (name) => {
  if (!name) return '#71717A'; // zinc-500 default
  const colors = [
    '#8B5CF6', // violet
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#6366F1', // indigo
    '#14B8A6', // teal
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const ScheduleBlock = memo(({
  schedule,
  top,
  height,
  onEdit,
  onClick,
  onDelete,
  onCommit,
  showTechnician = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  // Use 'draft' as default for new schedules (not committed yet)
  const status = schedule.schedule_status || 'draft';
  const colors = scheduleStatusColors[status] || scheduleStatusColors.draft;
  const ticket = schedule.ticket || {};

  // Check if this schedule is draggable (only draft/tentative can be moved)
  const isDraggable = colors.isDraggable !== false;
  const isDraft = status === 'draft' || status === 'tentative';

  // Get technician info
  const technicianName = schedule.technician_name || ticket.assigned_to_name || '';
  const technicianInitials = getInitials(technicianName);
  // Use user-selected avatar color if available, otherwise fall back to generated color
  const technicianColor = schedule.technician_avatar_color || getTechnicianColor(technicianName);

  // Get display name - customer name first, then fallback
  const displayName = ticket.customer_name || schedule.customer_name || 'Service';

  // Get category label
  const category = ticket.category || '';
  const categoryLabel = categoryLabels[category] || '';

  // Calculate estimated hours from schedule times or ticket
  const getEstimatedHours = () => {
    if (schedule.scheduled_time_start && schedule.scheduled_time_end) {
      const startHour = timeToHour(schedule.scheduled_time_start);
      const endHour = timeToHour(schedule.scheduled_time_end);
      return endHour - startHour;
    }
    return ticket.estimated_hours || 2;
  };

  // Handle drag start for rescheduling (only for draft schedules)
  const handleDragStart = (e) => {
    if (!isDraggable) {
      e.preventDefault();
      return;
    }

    setIsDragging(true);

    const estimatedHours = getEstimatedHours();
    // Set the estimated hours for the drop preview (module-level workaround for browser security)
    currentDragEstimatedHours = estimatedHours;

    // Create data payload that includes schedule info for moving
    const dragData = {
      id: ticket.id || schedule.ticket_id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
      customer_name: ticket.customer_name || schedule.customer_name,
      service_address: ticket.service_address || schedule.service_address,
      estimated_hours: estimatedHours,
      priority: ticket.priority,
      category: ticket.category,
      assigned_to: ticket.assigned_to || schedule.technician_id,
      // Include schedule info so we know we're moving an existing schedule
      _isReschedule: true,
      _scheduleId: schedule.id,
      _originalDate: schedule.scheduled_date,
      _originalTime: schedule.scheduled_time_start
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // Reset the drag estimated hours back to default
    currentDragEstimatedHours = 2;
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`absolute left-1 right-1 rounded-lg border-l-4 px-2 py-1 hover:shadow-lg transition-all overflow-hidden ${
        isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-50 scale-95' : ''}`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 30)}px`,
        backgroundColor: colors.bg,
        borderLeftColor: colors.border,
        zIndex: isDragging ? 50 : 20
      }}
      onClick={() => onClick?.(schedule)}
    >
      {/* Header row - customer name, category, and technician avatar */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.border }}
          />
          <span
            className="text-xs font-medium truncate"
            style={{ color: colors.text }}
          >
            {displayName}
          </span>
          {categoryLabel && (
            <span
              className="text-xs opacity-70 flex-shrink-0"
              style={{ color: colors.text }}
            >
              • {categoryLabel}
            </span>
          )}
        </div>
        {/* Technician Avatar - inside card, top right */}
        {technicianName && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{ backgroundColor: technicianColor, color: '#fff' }}
            title={technicianName}
          >
            {technicianInitials}
          </div>
        )}
      </div>

      {/* Time range and duration */}
      <div className="flex items-center gap-1 text-xs opacity-70" style={{ color: colors.text }}>
        <Clock size={10} className="flex-shrink-0" />
        <span className="truncate">
          {schedule.scheduled_time_start?.slice(0, 5)} - {schedule.scheduled_time_end?.slice(0, 5)}
          {height >= 40 && ` (${getEstimatedHours().toFixed(1)}h)`}
        </span>
      </div>

      {/* Additional info for taller blocks */}
      {height >= 60 && (
        <div className="text-xs opacity-60 truncate mt-0.5" style={{ color: colors.text }}>
          {ticket.title || 'Service visit'}
        </div>
      )}


      {/* Commit button - prominent for draft schedules with enough height */}
      {isDraft && height >= 70 && onCommit && (
        <button
          className="flex items-center justify-center gap-1 w-full mt-1 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            color: '#22C55E',
            border: '1px solid rgba(34, 197, 94, 0.4)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onCommit?.(schedule);
          }}
        >
          <Send size={10} />
          <span>Commit & Send Invite</span>
        </button>
      )}


      {/* Reschedule indicator - bottom left to avoid avatar */}
      {schedule.reschedule_requested_at && (
        <div className="absolute bottom-1 left-1">
          <AlertCircle size={12} className="text-amber-500" title="Reschedule requested" />
        </div>
      )}
    </div>
  );
});

ScheduleBlock.displayName = 'ScheduleBlock';

/**
 * Blocked Time Block (M365 Calendar Events)
 */
const BlockedTimeBlock = memo(({ event, top, height }) => {
  return (
    <div
      className="absolute left-1 right-1 rounded px-2 py-1 overflow-hidden pointer-events-none"
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`,
        backgroundColor: blockedTimeColor.bg,
        borderLeft: `2px solid ${blockedTimeColor.border}`,
        zIndex: 10
      }}
    >
      <div className="text-xs truncate" style={{ color: blockedTimeColor.text }}>
        {event.subject || 'Busy'}
      </div>
    </div>
  );
});

BlockedTimeBlock.displayName = 'BlockedTimeBlock';

/**
 * Drop Preview Component
 */
const DropPreview = memo(({ date, startHour, durationHours }) => {
  if (!date) return null;

  const top = (startHour - START_HOUR) * HOUR_HEIGHT;
  const height = durationHours * HOUR_HEIGHT;

  return (
    <div
      className="absolute left-1 right-1 rounded-lg border-2 border-dashed pointer-events-none"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        borderColor: brandColors.primary,
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        zIndex: 30
      }}
    >
      <div className="text-xs text-center pt-1" style={{ color: brandColors.primary }}>
        {hourToTimeStr(startHour)} - {hourToTimeStr(startHour + durationHours)}
      </div>
    </div>
  );
});

DropPreview.displayName = 'DropPreview';

/**
 * Day Column Component
 */
const DayColumn = memo(({
  date,
  schedules,
  blockedEvents,
  dropPreview,
  onDragOver,
  onDragLeave,
  onDrop,
  onScheduleClick,
  onScheduleEdit,
  onScheduleDelete,
  onScheduleCommit,
  showTechnician
}) => {
  const dateInfo = formatDayHeader(date);
  const isCurrentDay = isToday(date);

  // Position schedules
  const positionedSchedules = useMemo(() => {
    if (schedules.length > 0) {
      console.log('[DayColumn] Positioning', schedules.length, 'schedules for date:', formatDateLocal(date));
    }
    return schedules.map(schedule => {
      const startHour = timeToHour(schedule.scheduled_time_start);
      const ticket = schedule.ticket || {};

      // Calculate end hour from multiple sources (in order of priority):
      // 1. Explicit scheduled_time_end
      // 2. estimated_duration_minutes on the schedule
      // 3. estimated_hours from the ticket
      // 4. Default 2 hours
      let endHour;
      if (schedule.scheduled_time_end) {
        endHour = timeToHour(schedule.scheduled_time_end);
      } else if (schedule.estimated_duration_minutes) {
        // Parse as number (database may return string)
        const mins = typeof schedule.estimated_duration_minutes === 'number'
          ? schedule.estimated_duration_minutes
          : parseFloat(schedule.estimated_duration_minutes);
        endHour = startHour + (mins || 120) / 60;
      } else if (ticket.estimated_hours) {
        // Parse as number (database NUMERIC may return string)
        const hours = typeof ticket.estimated_hours === 'number'
          ? ticket.estimated_hours
          : parseFloat(ticket.estimated_hours);
        endHour = startHour + (hours || 2);
      } else {
        endHour = startHour + 2; // Default 2 hours
      }

      const clampedStart = Math.max(startHour, START_HOUR);
      const clampedEnd = Math.min(endHour, END_HOUR);

      const positioned = {
        ...schedule,
        top: (clampedStart - START_HOUR) * HOUR_HEIGHT,
        height: (clampedEnd - clampedStart) * HOUR_HEIGHT
      };

      console.log('[DayColumn] Schedule positioned:', {
        id: schedule.id,
        time: `${schedule.scheduled_time_start}-${schedule.scheduled_time_end}`,
        startHour,
        endHour,
        top: positioned.top,
        height: positioned.height
      });

      return positioned;
    });
  }, [schedules, date]);

  // Position blocked events
  const positionedBlockedEvents = useMemo(() => {
    return (blockedEvents || []).map(event => {
      const startHour = event.startHour || START_HOUR;
      const endHour = event.endHour || startHour + 1;

      const clampedStart = Math.max(startHour, START_HOUR);
      const clampedEnd = Math.min(endHour, END_HOUR);

      return {
        ...event,
        top: (clampedStart - START_HOUR) * HOUR_HEIGHT,
        height: (clampedEnd - clampedStart) * HOUR_HEIGHT
      };
    });
  }, [blockedEvents]);

  return (
    <div
      className="relative flex-1 border-r border-zinc-700"
      style={{ minWidth: `${MIN_DAY_WIDTH}px` }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver?.(e, date);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, date)}
    >
      {/* Day header */}
      <div
        className={`sticky top-0 z-40 px-2 py-2 text-center border-b border-zinc-700 ${
          isCurrentDay ? 'bg-violet-900/30' : 'bg-zinc-800'
        }`}
      >
        <div className={`text-xs ${isCurrentDay ? 'text-violet-400' : 'text-zinc-400'}`}>
          {dateInfo.day}
        </div>
        <div className={`text-lg font-semibold ${isCurrentDay ? 'text-violet-300' : 'text-white'}`}>
          {dateInfo.date}
        </div>
        <div className={`text-xs ${isCurrentDay ? 'text-violet-400' : 'text-zinc-500'}`}>
          {dateInfo.month}
        </div>
      </div>

      {/* Time grid */}
      <div className="relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
        {/* Hour lines */}
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-zinc-700/50"
            style={{ top: `${i * HOUR_HEIGHT}px` }}
          />
        ))}

        {/* Current time indicator */}
        {isCurrentDay && (() => {
          const now = new Date();
          const currentHour = now.getHours() + now.getMinutes() / 60;
          if (currentHour >= START_HOUR && currentHour <= END_HOUR) {
            const top = (currentHour - START_HOUR) * HOUR_HEIGHT;
            return (
              <div
                className="absolute left-0 right-0 flex items-center z-25"
                style={{ top: `${top}px` }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            );
          }
          return null;
        })()}

        {/* Blocked time (M365 events) */}
        {positionedBlockedEvents.map((event, idx) => (
          <BlockedTimeBlock
            key={`blocked-${idx}`}
            event={event}
            top={event.top}
            height={event.height}
          />
        ))}

        {/* Scheduled events */}
        {positionedSchedules.map(schedule => (
          <ScheduleBlock
            key={schedule.id}
            schedule={schedule}
            top={schedule.top}
            height={schedule.height}
            onClick={onScheduleClick}
            onEdit={onScheduleEdit}
            onDelete={onScheduleDelete}
            onCommit={onScheduleCommit}
            showTechnician={showTechnician}
          />
        ))}

        {/* Drop preview */}
        {dropPreview && dropPreview.date === dateInfo.full && (
          <DropPreview
            date={dropPreview.date}
            startHour={dropPreview.startHour}
            durationHours={dropPreview.durationHours}
          />
        )}
      </div>
    </div>
  );
});

DayColumn.displayName = 'DayColumn';

/**
 * Time Column Component (sticky left)
 */
const TimeColumn = memo(() => {
  return (
    <div
      className="sticky left-0 z-50 bg-zinc-900 border-r border-zinc-700 flex-shrink-0"
      style={{ width: `${TIME_COLUMN_WIDTH}px` }}
    >
      {/* Header spacer */}
      <div className="h-[76px] border-b border-zinc-700" />

      {/* Hour labels */}
      <div className="relative" style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}>
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
          const hour = START_HOUR + i;
          const displayHour = hour % 12 === 0 ? 12 : hour % 12;
          const ampm = hour < 12 ? 'AM' : 'PM';

          return (
            <div
              key={hour}
              className="absolute right-2 text-xs text-zinc-400"
              style={{ top: `${i * HOUR_HEIGHT - 8}px` }}
            >
              {displayHour}{ampm}
            </div>
          );
        })}
      </div>
    </div>
  );
});

TimeColumn.displayName = 'TimeColumn';

/**
 * WeekCalendarGrid - Main Component
 */
const WeekCalendarGrid = ({
  weeks = [], // Array of week data: [{ startDate, schedules, blockedEvents }]
  showWorkWeekOnly = true,
  showTechnician = false,
  onScheduleClick,
  onScheduleEdit,
  onScheduleDelete,
  onScheduleCommit,
  onDropTicket,
  onLoadMoreWeeks,
  isLoading = false
}) => {
  const containerRef = useRef(null);
  const [dropPreview, setDropPreview] = useState(null);

  // Generate days for all loaded weeks
  const allDays = useMemo(() => {
    const days = [];
    console.log('[WeekCalendarGrid] Processing weeks data:', weeks);
    weeks.forEach((week, weekIdx) => {
      // Parse date string as local date (not UTC) to avoid timezone shift
      // YYYY-MM-DD format when passed to new Date() is treated as UTC
      // We need to parse it manually to get local midnight
      const [year, month, day] = week.startDate.split('-').map(Number);
      const startDate = new Date(year, month - 1, day); // month is 0-indexed
      const numDays = showWorkWeekOnly ? 5 : 7;
      const startOffset = showWorkWeekOnly ? 0 : 0; // Mon or Sun

      console.log(`[WeekCalendarGrid] Week ${weekIdx}: startDate=${week.startDate}, schedules=${week.schedules?.length || 0}, blockedEvents=${week.blockedEvents?.length || 0}`);

      for (let i = startOffset; i < startOffset + numDays; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = formatDateLocal(date);

        const daySchedules = (week.schedules || []).filter(s => s.scheduled_date === dateStr);
        const dayBlockedEvents = (week.blockedEvents || []).filter(e => e.date === dateStr);

        if (daySchedules.length > 0 || dayBlockedEvents.length > 0) {
          console.log(`[WeekCalendarGrid] Day ${dateStr}: ${daySchedules.length} schedules, ${dayBlockedEvents.length} blocked events`);
          if (daySchedules.length > 0) {
            console.log('[WeekCalendarGrid] Schedules for day:', daySchedules.map(s => ({
              id: s.id,
              date: s.scheduled_date,
              time: `${s.scheduled_time_start}-${s.scheduled_time_end}`,
              customer: s.ticket?.customer_name || s.customer_name || 'unknown'
            })));
          }
        }

        days.push({
          date,
          dateStr,
          schedules: daySchedules,
          blockedEvents: dayBlockedEvents
        });
      }
    });
    console.log('[WeekCalendarGrid] Total days generated:', days.length, 'with schedules on days:', days.filter(d => d.schedules.length > 0).length);
    return days;
  }, [weeks, showWorkWeekOnly]);

  // Handle horizontal scroll for infinite loading
  const handleScroll = useCallback((e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.target;
    // Load more when near the right edge
    if (scrollWidth - scrollLeft - clientWidth < 300) {
      onLoadMoreWeeks?.();
    }
  }, [onLoadMoreWeeks]);

  // Drag over handler - calculate drop position
  const handleDragOver = useCallback((e, date) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top - 76; // Subtract header height
    const hour = snapToQuarter(pixelToHour(relativeY));
    const clampedHour = Math.max(START_HOUR, Math.min(hour, END_HOUR - 1));

    // Use module-level variable for duration (set by drag source)
    // Browser security prevents reading dataTransfer during dragover
    const durationHours = currentDragEstimatedHours;

    setDropPreview({
      date: formatDateLocal(date),
      startHour: clampedHour,
      durationHours
    });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropPreview(null);
  }, []);

  // Drop handler
  const handleDrop = useCallback((e, date) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top - 76;
    const hour = snapToQuarter(pixelToHour(relativeY));
    const clampedHour = Math.max(START_HOUR, Math.min(hour, END_HOUR - 1));

    try {
      const ticketData = e.dataTransfer.getData('application/json');
      if (ticketData) {
        const ticket = JSON.parse(ticketData);
        onDropTicket?.({
          ticket,
          date: formatDateLocal(date),
          startTime: hourToTimeStr(clampedHour)
        });
      }
    } catch (err) {
      console.error('[WeekCalendarGrid] Drop error:', err);
    }

    setDropPreview(null);
  }, [onDropTicket]);

  // Calculate number of days for current view
  const numDays = showWorkWeekOnly ? 5 : 7;

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-lg overflow-hidden">
      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="flex overflow-y-auto flex-1"
        onScroll={handleScroll}
      >
        {/* Sticky time column */}
        <TimeColumn />

        {/* Day columns - show only current week's days */}
        {allDays.slice(0, numDays).map(day => (
          <DayColumn
            key={day.dateStr}
            date={day.date}
            schedules={day.schedules}
            blockedEvents={day.blockedEvents}
            dropPreview={dropPreview}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onScheduleClick={onScheduleClick}
            onScheduleEdit={onScheduleEdit}
            onScheduleDelete={onScheduleDelete}
            onScheduleCommit={onScheduleCommit}
            showTechnician={showTechnician}
          />
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center px-8" style={{ minWidth: `${MIN_DAY_WIDTH}px` }}>
            <div className="text-zinc-400 text-sm animate-pulse">Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(WeekCalendarGrid);

// Export constants for use in parent components
export { HOUR_HEIGHT, START_HOUR, END_HOUR, MIN_DAY_WIDTH, TIME_COLUMN_WIDTH, scheduleStatusColors, priorityColors };
