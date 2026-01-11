/**
 * UnscheduledTicketsPanel.jsx
 * Left sidebar showing unscheduled service tickets as draggable cards
 * Card height represents the estimated time the service will take
 */

import React, { memo, useState, useMemo } from 'react';
import { Clock, MapPin, AlertCircle, Search, ExternalLink, GripVertical } from 'lucide-react';
import { setDragEstimatedHours, resetDragEstimatedHours } from './WeekCalendarGrid';
import TechnicianDropdown from './TechnicianDropdown';

// Constants
const HOUR_HEIGHT = 60; // pixels per hour - matches WeekCalendarGrid
const MIN_CARD_HEIGHT = 50; // minimum height in pixels
const MAX_CARD_HEIGHT = 360; // max 6 hours visual

// Priority colors
const priorityColors = {
  urgent: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444', label: 'Urgent' },
  high: { bg: 'rgba(249, 115, 22, 0.2)', border: '#f97316', text: '#f97316', label: 'High' },
  normal: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#3b82f6', label: 'Normal' },
  low: { bg: 'rgba(148, 175, 50, 0.2)', border: '#94AF32', text: '#94AF32', label: 'Low' }
};

// Category icons (simplified)
const categoryLabels = {
  network: 'Network',
  av: 'AV',
  lighting: 'Lighting',
  hvac: 'HVAC',
  shades: 'Shades',
  security: 'Security',
  other: 'Other'
};

/**
 * Calculate card height based on estimated hours
 */
const getCardHeight = (estimatedHours) => {
  const hours = estimatedHours || 2; // Default 2 hours
  const height = hours * HOUR_HEIGHT;
  return Math.max(MIN_CARD_HEIGHT, Math.min(height, MAX_CARD_HEIGHT));
};

/**
 * TicketCard Component
 * Draggable card representing a service ticket
 * Height is proportional to estimated service time
 */
const TicketCard = memo(({
  ticket,
  technicians = [],
  onOpenTicket,
  onAssignTechnician,
  compact = false
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const priority = ticket.priority || 'normal';
  const colors = priorityColors[priority] || priorityColors.normal;
  // Parse estimated_hours as number (database returns NUMERIC as string sometimes)
  const rawHours = ticket.estimated_hours;
  const estimatedHours = typeof rawHours === 'number' ? rawHours : (parseFloat(rawHours) || 2);
  const cardHeight = getCardHeight(estimatedHours);

  // Handle drag start
  const handleDragStart = (e) => {
    setIsDragging(true);

    // Set the estimated hours for the drop preview (module-level workaround for browser security)
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

    // Create drag image with proper sizing
    const dragEl = e.currentTarget.cloneNode(true);
    dragEl.style.width = '170px';
    dragEl.style.height = `${cardHeight}px`;
    dragEl.style.opacity = '0.8';
    dragEl.style.position = 'absolute';
    dragEl.style.top = '-1000px';
    document.body.appendChild(dragEl);
    e.dataTransfer.setDragImage(dragEl, 85, cardHeight / 2);

    // Cleanup drag image
    setTimeout(() => {
      document.body.removeChild(dragEl);
    }, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // Reset the drag estimated hours back to default
    resetDragEstimatedHours();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`
        group relative rounded-lg border-l-4 px-3 py-2 cursor-grab active:cursor-grabbing
        transition-all hover:shadow-lg
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
      `}
      style={{
        height: compact ? 'auto' : `${cardHeight}px`,
        minHeight: `${MIN_CARD_HEIGHT}px`,
        backgroundColor: colors.bg,
        borderLeftColor: colors.border
      }}
    >
      {/* Drag handle indicator */}
      <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-60 transition-opacity">
        <GripVertical size={14} className="text-zinc-400" />
      </div>

      {/* Priority badge */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: colors.border, color: '#000' }}
        >
          {colors.label}
        </span>
        <span className="text-xs text-zinc-400">#{ticket.ticket_number}</span>
      </div>

      {/* Customer name */}
      <div className="font-medium text-white text-sm truncate mb-1">
        {ticket.customer_name || 'Unknown Customer'}
      </div>

      {/* Title */}
      <div className="text-xs text-zinc-300 truncate mb-2">
        {ticket.title || 'Service Request'}
      </div>

      {/* Technician Assignment - with skill matching */}
      <div className="mb-2" onClick={(e) => e.stopPropagation()}>
        <TechnicianDropdown
          value={ticket.assigned_to}
          category={ticket.category || 'general'}
          technicians={technicians}
          onChange={(techId, techName) => onAssignTechnician?.(ticket.id, techId, techName)}
          size="sm"
          placeholder="Unassigned"
        />
      </div>

      {/* Time estimate - prominent display */}
      <div
        className="flex items-center gap-1 text-sm font-medium mb-2"
        style={{ color: colors.text }}
      >
        <Clock size={14} />
        <span>{estimatedHours}h estimated</span>
      </div>

      {/* Additional info for taller cards */}
      {cardHeight >= 100 && (
        <>
          {/* Category */}
          {ticket.category && (
            <div className="text-xs text-zinc-400 mb-1">
              {categoryLabels[ticket.category] || ticket.category}
            </div>
          )}

          {/* Location */}
          {ticket.service_address && cardHeight >= 140 && (
            <div className="flex items-start gap-1 text-xs text-zinc-400 mb-1">
              <MapPin size={12} className="flex-shrink-0 mt-0.5" />
              <span className="truncate">{ticket.service_address}</span>
            </div>
          )}
        </>
      )}

      {/* Edit button - bottom right */}
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
 * UnscheduledTicketsPanel - Main Component
 */
const UnscheduledTicketsPanel = ({
  tickets = [],
  technicians = [],
  selectedTechnician,
  onTechnicianChange,
  onOpenTicket,
  onAssignTechnician, // Callback to assign a technician to a ticket: (ticketId, techId, techName) => void
  onUnschedule, // Callback when a scheduled ticket is dropped here
  isLoading = false,
  compactMode = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle drag over for drop zone
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only show drop indicator if this is a reschedule (from calendar)
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

  // Filter tickets
  const filteredTickets = useMemo(() => {
    let filtered = tickets;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        (t.customer_name?.toLowerCase().includes(query)) ||
        (t.title?.toLowerCase().includes(query)) ||
        (t.ticket_number?.toString().includes(query))
      );
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }

    // Technician filter
    if (selectedTechnician && selectedTechnician !== 'all') {
      filtered = filtered.filter(t => t.assigned_to === selectedTechnician);
    }

    return filtered;
  }, [tickets, searchQuery, priorityFilter, categoryFilter, selectedTechnician]);

  // Get unique categories from tickets
  const categories = useMemo(() => {
    const cats = new Set(tickets.map(t => t.category).filter(Boolean));
    return Array.from(cats);
  }, [tickets]);

  // Calculate total estimated hours
  const totalHours = useMemo(() => {
    return filteredTickets.reduce((sum, t) => sum + (t.estimated_hours || 2), 0);
  }, [filteredTickets]);

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
      <div className="p-3 border-b border-zinc-700">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400" />
          Unscheduled ({filteredTickets.length})
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
          />
        </div>

        {/* Filters row */}
        <div className="flex gap-2">
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
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

        {/* Stats */}
        <div className="mt-2 text-xs text-zinc-400 flex items-center gap-2">
          <Clock size={12} />
          <span>{totalHours}h total estimated</span>
        </div>
      </div>

      {/* Tickets list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-zinc-400">
            <div className="animate-pulse">Loading tickets...</div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-8 text-zinc-400">
            <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No unscheduled tickets</p>
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
          filteredTickets.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              technicians={technicians}
              onOpenTicket={onOpenTicket}
              onAssignTechnician={onAssignTechnician}
              compact={compactMode}
            />
          ))
        )}
      </div>

      {/* Footer - drag hint */}
      <div className="p-2 border-t border-zinc-700 text-center">
        <p className="text-xs text-zinc-500">
          Drag tickets to calendar to schedule
        </p>
      </div>
    </div>
  );
};

export default memo(UnscheduledTicketsPanel);

// Export TicketCard for potential reuse
export { TicketCard, getCardHeight, priorityColors };
