/**
 * UnscheduledTicketsPanel.jsx
 * Left sidebar showing ALL service tickets - both unscheduled and scheduled
 * - Unscheduled tickets appear at top with full card display
 * - Scheduled tickets appear below in collapsed single-line format with status color
 * - Cards are uniform size in panel (variable height only when dragged to calendar)
 * - Scrollable list with sorting options
 */

import { memo, useState, useMemo } from 'react';
import { Clock, AlertCircle, Search, ExternalLink, GripVertical, Calendar, ChevronDown, ArrowUpDown } from 'lucide-react';
import { setDragEstimatedHours, resetDragEstimatedHours } from './WeekCalendarGrid';
import TechnicianDropdown from './TechnicianDropdown';

// Constants
const HOUR_HEIGHT = 60; // pixels per hour - matches WeekCalendarGrid (used for drag preview)
const MIN_CARD_HEIGHT = 50; // minimum height for drag preview
const MAX_CARD_HEIGHT = 360; // max 6 hours visual for drag preview
const PANEL_CARD_HEIGHT = 140; // Fixed height for cards in the panel

// Priority colors
const priorityColors = {
  urgent: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444', label: 'Urgent' },
  high: { bg: 'rgba(249, 115, 22, 0.2)', border: '#f97316', text: '#f97316', label: 'High' },
  medium: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#3b82f6', label: 'Medium' },
  low: { bg: 'rgba(148, 175, 50, 0.2)', border: '#94AF32', text: '#94AF32', label: 'Low' }
};

// Schedule status colors (matches WeekCalendarGrid) - 4-step approval workflow
const scheduleStatusColors = {
  draft: { bg: 'rgba(139, 92, 246, 0.3)', border: '#8b5cf6', text: '#a78bfa', label: 'Draft' },
  pending_tech: { bg: 'rgba(245, 158, 11, 0.3)', border: '#f59e0b', text: '#fbbf24', label: 'Awaiting Tech' },
  tech_accepted: { bg: 'rgba(59, 130, 246, 0.3)', border: '#3b82f6', text: '#60a5fa', label: 'Tech Accepted' },
  pending_customer: { bg: 'rgba(6, 182, 212, 0.3)', border: '#06b6d4', text: '#22d3ee', label: 'Awaiting Customer' },
  confirmed: { bg: 'rgba(148, 175, 50, 0.3)', border: '#94AF32', text: '#94AF32', label: 'Confirmed' },
  cancelled: { bg: 'rgba(113, 113, 122, 0.3)', border: '#71717a', text: '#a1a1aa', label: 'Cancelled' }
};

// Category labels
const categoryLabels = {
  network: 'Network',
  av: 'AV',
  lighting: 'Lighting',
  hvac: 'HVAC',
  shades: 'Shades',
  security: 'Security',
  control: 'Control',
  general: 'General',
  other: 'Other'
};

// Sort options
const sortOptions = [
  { value: 'oldest', label: 'Oldest First' },
  { value: 'newest', label: 'Newest First' },
  { value: 'priority', label: 'Priority' },
  { value: 'technician', label: 'Technician' }
];

// Priority order for sorting
const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Calculate card height for drag preview based on estimated hours
 */
const getCardHeightForDrag = (estimatedHours) => {
  const hours = estimatedHours || 2;
  const height = hours * HOUR_HEIGHT;
  return Math.max(MIN_CARD_HEIGHT, Math.min(height, MAX_CARD_HEIGHT));
};

/**
 * TicketCard Component - Full card for unscheduled tickets
 * Fixed height in panel, variable height when dragged to calendar
 */
const TicketCard = memo(({
  ticket,
  technicians = [],
  onOpenTicket,
  onAssignTechnician
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const priority = ticket.priority || 'normal';
  const colors = priorityColors[priority] || priorityColors.normal;
  const rawHours = ticket.estimated_hours;
  const estimatedHours = typeof rawHours === 'number' ? rawHours : (parseFloat(rawHours) || 2);
  const dragHeight = getCardHeightForDrag(estimatedHours);

  // Handle drag start
  const handleDragStart = (e) => {
    setIsDragging(true);

    // Set the estimated hours for the drop preview
    setDragEstimatedHours(estimatedHours);

    // Set ticket data for drop handler
    const ticketData = {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
      customer_name: ticket.customer_name,
      service_address: ticket.service_address,
      estimated_hours: estimatedHours,
      priority: priority,
      category: ticket.category,
      assigned_to: ticket.assigned_to
    };

    e.dataTransfer.setData('application/json', JSON.stringify(ticketData));
    e.dataTransfer.setData('text/plain', ticket.ticket_number);
    e.dataTransfer.effectAllowed = 'move';

    // Create drag image with variable sizing based on estimated hours
    const dragEl = e.currentTarget.cloneNode(true);
    dragEl.style.width = '170px';
    dragEl.style.height = `${dragHeight}px`;
    dragEl.style.opacity = '0.8';
    dragEl.style.position = 'absolute';
    dragEl.style.top = '-1000px';
    document.body.appendChild(dragEl);
    e.dataTransfer.setDragImage(dragEl, 85, dragHeight / 2);

    setTimeout(() => {
      document.body.removeChild(dragEl);
    }, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    resetDragEstimatedHours();
  };

  // Handle card click to open ticket details
  const handleCardClick = () => {
    // Don't open if dragging
    if (isDragging) return;
    onOpenTicket?.(ticket);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
      className={`
        group relative rounded-lg border-l-4 px-3 py-2 cursor-grab active:cursor-grabbing
        transition-all hover:shadow-lg
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
      `}
      style={{
        minHeight: `${PANEL_CARD_HEIGHT}px`,
        backgroundColor: colors.bg,
        borderLeftColor: colors.border
      }}
    >
      {/* Drag handle indicator */}
      <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-60 transition-opacity">
        <GripVertical size={14} className="text-zinc-400" />
      </div>

      {/* Priority badge and ticket number */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: colors.border, color: '#000' }}
        >
          {colors.label}
        </span>
        <span className="text-xs text-zinc-400 truncate ml-2">#{ticket.ticket_number}</span>
      </div>

      {/* Customer name */}
      <div className="font-medium text-white text-sm truncate mb-1">
        {ticket.customer_name || 'Unknown Customer'}
      </div>

      {/* Title */}
      <div className="text-xs text-zinc-300 truncate mb-2">
        {ticket.title || 'Service Request'}
      </div>

      {/* Technician Assignment */}
      <div className="mb-2" onClick={(e) => e.stopPropagation()}>
        <TechnicianDropdown
          value={ticket.assigned_to}
          selectedName={ticket.assigned_to_name}
          selectedColor={ticket.assigned_to_avatar_color}
          category={ticket.category || 'general'}
          technicians={technicians}
          onChange={(techId, techName, avatarColor) => onAssignTechnician?.(ticket.id, techId, techName, null, avatarColor)}
          size="sm"
          placeholder="Unassigned"
        />
      </div>

      {/* Time estimate and category */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1" style={{ color: colors.text }}>
          <Clock size={12} />
          <span>{estimatedHours}h</span>
        </div>
        {ticket.category && (
          <span className="text-zinc-500">
            {categoryLabels[ticket.category] || ticket.category}
          </span>
        )}
      </div>

      {/* Edit button */}
      <button
        className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/20"
        onClick={(e) => {
          e.stopPropagation();
          onOpenTicket?.(ticket);
        }}
        title="Open ticket details"
      >
        <ExternalLink size={14} style={{ color: colors.text }} />
      </button>
    </div>
  );
});

TicketCard.displayName = 'TicketCard';

/**
 * ScheduledTicketCard Component - Card for scheduled tickets
 * Shows status color, customer name, date/time, and technician dropdown
 */
const ScheduledTicketCard = memo(({
  ticket,
  schedule,
  onOpenTicket,
  onAssignTechnician
}) => {
  const scheduleStatus = schedule?.schedule_status || 'draft';
  const statusColors = scheduleStatusColors[scheduleStatus] || scheduleStatusColors.draft;
  const priority = ticket.priority || 'normal';
  const priorityColor = priorityColors[priority] || priorityColors.normal;

  // Format scheduled date nicely
  const scheduledDate = schedule?.scheduled_date
    ? new Date(schedule.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : '';

  const scheduledTime = schedule?.scheduled_time_start?.slice(0, 5) || '';

  return (
    <div
      className="rounded-lg border-l-4 px-3 py-2 cursor-pointer hover:bg-zinc-700/30 transition-colors"
      style={{
        backgroundColor: statusColors.bg,
        borderLeftColor: statusColors.border
      }}
    >
      {/* Top row: Customer name + Date/Time - clickable to open modal */}
      <button
        onClick={() => onOpenTicket?.(schedule || ticket)}
        className="w-full flex items-center gap-2 text-left mb-2"
      >
        {/* Status indicator dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusColors.border }}
        />

        {/* Customer name */}
        <span className="flex-1 text-sm text-white truncate">
          {ticket.customer_name || 'Unknown'}
        </span>

        {/* Date/Time */}
        <span className="text-xs text-zinc-400 flex-shrink-0">
          {scheduledDate} {scheduledTime}
        </span>

        {/* Priority indicator */}
        <div
          className="w-1.5 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: priorityColor.border }}
          title={priorityColor.label}
        />
      </button>

      {/* Bottom row: Technician dropdown */}
      <div onClick={(e) => e.stopPropagation()}>
        <TechnicianDropdown
          value={schedule?.technician_id || ticket.assigned_to}
          selectedName={schedule?.technician_name || ticket.assigned_to_name}
          selectedColor={schedule?.technician_avatar_color || ticket.assigned_to_avatar_color}
          category={ticket.category || 'general'}
          onChange={(techId, techName, avatarColor) => onAssignTechnician?.(ticket.id, techId, techName, schedule?.id, avatarColor)}
          size="sm"
          placeholder="Unassigned"
          showUnassignOption={false}
        />
      </div>
    </div>
  );
});

ScheduledTicketCard.displayName = 'ScheduledTicketCard';

/**
 * UnscheduledTicketsPanel - Main Component
 * Shows all tickets: unscheduled at top, scheduled collapsed below
 */
const UnscheduledTicketsPanel = ({
  tickets = [],           // Unscheduled tickets
  scheduledTickets = [],  // Scheduled tickets (from all weeks)
  technicians = [],
  selectedTechnician,
  onOpenTicket,
  onAssignTechnician,
  onUnschedule,
  isLoading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('oldest');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showScheduled, setShowScheduled] = useState(true);

  // Handle drag over for drop zone
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const types = e.dataTransfer.types;
      if (types.includes('application/json')) {
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }
    } catch {
      // Ignore errors
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Handle drop - unschedule the ticket
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (!jsonData) return;

      const data = JSON.parse(jsonData);

      // Only handle reschedules (tickets with _isReschedule flag from calendar)
      if (data._isReschedule && data._scheduleId && onUnschedule) {
        onUnschedule(data._scheduleId, data);
      }
    } catch (err) {
      console.error('[UnscheduledTicketsPanel] Drop failed:', err);
    }
  };

  // Combine and filter all tickets
  const { filteredUnscheduled, filteredScheduled, totalHours } = useMemo(() => {
    console.log('[UnscheduledPanel] Filtering with:', {
      ticketsCount: tickets.length,
      sortBy,
      priorityFilter,
      categoryFilter,
      sampleTicket: tickets[0] ? { priority: tickets[0].priority, created_at: tickets[0].created_at } : null
    });

    // Apply filters to unscheduled tickets
    let unscheduled = [...tickets]; // Create a copy to avoid mutating props

    // Deduplicate scheduled tickets by ticket_id (keep earliest schedule per ticket)
    const scheduledByTicket = new Map();
    for (const schedule of scheduledTickets) {
      const ticketId = schedule.ticket_id;
      if (!ticketId) continue;

      const existing = scheduledByTicket.get(ticketId);
      if (!existing || new Date(schedule.scheduled_date) < new Date(existing.scheduled_date)) {
        scheduledByTicket.set(ticketId, schedule);
      }
    }
    let scheduled = Array.from(scheduledByTicket.values());

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (t) =>
        (t.customer_name?.toLowerCase().includes(query)) ||
        (t.title?.toLowerCase().includes(query)) ||
        (t.ticket_number?.toString().includes(query));

      unscheduled = unscheduled.filter(matchesSearch);
      scheduled = scheduled.filter(s => {
        const t = s.ticket || s;
        return matchesSearch(t);
      });
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      unscheduled = unscheduled.filter(t => t.priority === priorityFilter);
      scheduled = scheduled.filter(s => (s.ticket?.priority || s.priority) === priorityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      unscheduled = unscheduled.filter(t => t.category === categoryFilter);
      scheduled = scheduled.filter(s => (s.ticket?.category || s.category) === categoryFilter);
    }

    // Technician filter
    if (selectedTechnician && selectedTechnician !== 'all') {
      unscheduled = unscheduled.filter(t => t.assigned_to === selectedTechnician);
      scheduled = scheduled.filter(s => s.technician_id === selectedTechnician);
    }

    // Sort unscheduled tickets
    const sortTickets = (arr) => {
      console.log('[UnscheduledPanel] sortTickets called with sortBy:', sortBy, 'arrLen:', arr.length);
      const sorted = [...arr].sort((a, b) => {
        let result;
        switch (sortBy) {
          case 'oldest':
            // Oldest tickets first (smallest date value first = most time has passed)
            result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;
          case 'newest':
            // Newest tickets first (largest date value first)
            result = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            break;
          case 'priority':
            result = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
            break;
          case 'technician':
            const nameA = a.assigned_to_name || 'zzz';
            const nameB = b.assigned_to_name || 'zzz';
            result = nameA.localeCompare(nameB);
            break;
          default:
            result = 0;
        }
        return result;
      });
      return sorted;
    };

    // Sort scheduled tickets by scheduled date
    const sortScheduled = (arr) => {
      return [...arr].sort((a, b) => {
        if (sortBy === 'priority') {
          const pA = a.ticket?.priority || a.priority || 'normal';
          const pB = b.ticket?.priority || b.priority || 'normal';
          return (priorityOrder[pA] || 2) - (priorityOrder[pB] || 2);
        }
        if (sortBy === 'technician') {
          const nameA = a.technician_name || 'zzz';
          const nameB = b.technician_name || 'zzz';
          return nameA.localeCompare(nameB);
        }
        // Default: sort by scheduled date (oldest first)
        return new Date(a.scheduled_date) - new Date(b.scheduled_date);
      });
    };

    const sortedUnscheduled = sortTickets(unscheduled);
    const sortedScheduled = sortScheduled(scheduled);

    console.log('[UnscheduledPanel] After filtering/sorting:', {
      sortBy,
      unscheduledCount: sortedUnscheduled.length,
      scheduledCount: sortedScheduled.length,
      firstThree: sortedUnscheduled.slice(0, 3).map(t => ({
        id: t.id?.slice(-8),
        ticket_number: t.ticket_number,
        priority: t.priority,
        created_at: t.created_at,
        created_date: t.created_at ? new Date(t.created_at).toLocaleDateString() : 'N/A'
      }))
    });

    // Calculate total estimated hours for unscheduled
    const hours = sortedUnscheduled.reduce((sum, t) => sum + (parseFloat(t.estimated_hours) || 2), 0);

    return {
      filteredUnscheduled: sortedUnscheduled,
      filteredScheduled: sortedScheduled,
      totalHours: hours
    };
  }, [tickets, scheduledTickets, searchQuery, priorityFilter, categoryFilter, selectedTechnician, sortBy]);

  // Get unique categories from all tickets
  const categories = useMemo(() => {
    const allTickets = [...tickets, ...scheduledTickets.map(s => s.ticket || s)];
    const cats = new Set(allTickets.map(t => t?.category).filter(Boolean));
    return Array.from(cats);
  }, [tickets, scheduledTickets]);

  return (
    <div
      className={`relative flex flex-col h-full bg-zinc-800 rounded-lg overflow-hidden transition-all ${
        isDragOver ? 'ring-2 ring-amber-500 ring-opacity-70' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop indicator overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-amber-500/10 z-10 flex items-center justify-center pointer-events-none rounded-lg">
          <div className="bg-amber-500/90 text-black px-4 py-2 rounded-lg font-medium text-sm shadow-lg">
            Drop to Unschedule
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-zinc-700 flex-shrink-0">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400" />
          Service Tickets
        </h3>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-sm bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Filters row */}
        <div className="flex gap-2 mb-2">
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
            ))}
          </select>
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <ArrowUpDown size={12} className="text-zinc-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded text-white focus:outline-none focus:border-zinc-500"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="mt-2 text-xs text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span>{totalHours.toFixed(1)}h unscheduled</span>
          </div>
          <span>{filteredUnscheduled.length} pending</span>
        </div>
      </div>

      {/* Tickets list - scrollable */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-zinc-400">
            <div className="animate-pulse">Loading tickets...</div>
          </div>
        ) : (
          <>
            {/* Unscheduled tickets section */}
            {filteredUnscheduled.length === 0 && filteredScheduled.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 px-3">
                <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tickets found</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-violet-400 mt-1 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Unscheduled tickets */}
                {filteredUnscheduled.length > 0 && (
                  <div className="p-2 space-y-2">
                    <div className="text-xs text-zinc-500 font-medium px-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      Unscheduled ({filteredUnscheduled.length})
                    </div>
                    {filteredUnscheduled.map(ticket => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        technicians={technicians}
                        onOpenTicket={onOpenTicket}
                        onAssignTechnician={onAssignTechnician}
                      />
                    ))}
                  </div>
                )}

                {/* Scheduled tickets section - collapsible */}
                {filteredScheduled.length > 0 && (
                  <div className="border-t border-zinc-700">
                    <button
                      onClick={() => setShowScheduled(!showScheduled)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>Scheduled ({filteredScheduled.length})</span>
                      </div>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${showScheduled ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {showScheduled && (
                      <div className="px-2 pb-2 space-y-2">
                        {filteredScheduled.map(schedule => {
                          const ticket = schedule.ticket || schedule;
                          return (
                            <ScheduledTicketCard
                              key={schedule.id}
                              ticket={ticket}
                              schedule={schedule}
                              onOpenTicket={onOpenTicket}
                              onAssignTechnician={onAssignTechnician}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer - drag hint */}
      <div className="p-2 border-t border-zinc-700 text-center flex-shrink-0">
        <p className="text-xs text-zinc-500">
          Drag tickets to calendar to schedule
        </p>
      </div>
    </div>
  );
};

export default memo(UnscheduledTicketsPanel);

// Export for reuse
export { TicketCard, ScheduledTicketCard, getCardHeightForDrag as getCardHeight, priorityColors, scheduleStatusColors };
