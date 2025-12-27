/**
 * WeeklyPlanning.js
 * "Air Traffic Control" interface for service ticket scheduling
 * Supports iframe embedding for Alleo integration
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import TechnicianFilterBar from '../components/Service/TechnicianFilterBar';
import WeekCalendarGrid from '../components/Service/WeekCalendarGrid';
import UnscheduledTicketsPanel from '../components/Service/UnscheduledTicketsPanel';
import { weeklyPlanningService, getWeekStart, formatDate, BUFFER_MINUTES } from '../services/weeklyPlanningService';
import { technicianService } from '../services/serviceTicketService';
import { checkUserAvailability, fetchEventsForDate } from '../services/microsoftCalendarService';
import { useAuth } from '../contexts/AuthContext';
import { brandColors } from '../styles/styleSystem';

/**
 * Get Monday of the current week
 */
const getCurrentWeekStart = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

/**
 * WeeklyPlanning Component
 */
const WeeklyPlanning = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authContext, user } = useAuth();

  // Check if embedded via URL param or iframe detection
  const isEmbedded = useMemo(() => {
    return searchParams.get('embed') === 'true' || window.self !== window.top;
  }, [searchParams]);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Technicians
  const [technicians, setTechnicians] = useState([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState(null);

  // View settings
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'all'
  const [showWorkWeekOnly, setShowWorkWeekOnly] = useState(true);

  // Week data
  const [currentWeekStart, setCurrentWeekStart] = useState(getCurrentWeekStart());
  const [weeks, setWeeks] = useState([]); // Array of week data

  // Unscheduled tickets
  const [unscheduledTickets, setUnscheduledTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Conflict checking modal
  const [conflictModal, setConflictModal] = useState(null);

  // Load technicians
  useEffect(() => {
    const loadTechnicians = async () => {
      try {
        setLoadingTechnicians(true);
        const data = await technicianService.getAll();
        setTechnicians(data || []);
      } catch (err) {
        console.error('[WeeklyPlanning] Failed to load technicians:', err);
      } finally {
        setLoadingTechnicians(false);
      }
    };
    loadTechnicians();
  }, []);

  // Load week schedules
  const loadWeekSchedules = useCallback(async (weekStart, techId = null) => {
    try {
      const startDate = new Date(weekStart);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      // Get schedules from database
      const schedules = await weeklyPlanningService.getSchedulesForDateRange(
        startDate,
        endDate,
        techId
      );

      // Get M365 calendar events for blocking (fetch each day in the range)
      let blockedEvents = [];
      if (techId && authContext) {
        try {
          const techEmail = technicians.find(t => t.id === techId)?.email;
          if (techEmail) {
            // Fetch events for each day in the week
            const dayPromises = [];
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
              const dateStr = new Date(d).toISOString().split('T')[0];
              dayPromises.push(
                fetchEventsForDate(authContext, dateStr)
                  .then(events => (events || []).map(e => ({ ...e, fetchedDate: dateStr })))
                  .catch(() => [])
              );
            }
            const dayResults = await Promise.all(dayPromises);
            const allEvents = dayResults.flat();

            blockedEvents = allEvents.map(event => {
              const startHour = new Date(event.start).getHours() + new Date(event.start).getMinutes() / 60;
              const endHour = new Date(event.end).getHours() + new Date(event.end).getMinutes() / 60;
              return {
                ...event,
                date: new Date(event.start).toISOString().split('T')[0],
                startHour,
                endHour
              };
            });
          }
        } catch (calendarErr) {
          console.warn('[WeeklyPlanning] Failed to load calendar events:', calendarErr);
        }
      }

      return {
        startDate: formatDate(startDate),
        schedules,
        blockedEvents
      };
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to load week schedules:', err);
      throw err;
    }
  }, [authContext, technicians]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        // Load current week and next week
        const weekData = await loadWeekSchedules(currentWeekStart, selectedTechnician);
        const nextWeekStart = new Date(currentWeekStart);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);
        const nextWeekData = await loadWeekSchedules(nextWeekStart, selectedTechnician);

        setWeeks([weekData, nextWeekData]);

        // Load unscheduled tickets
        setLoadingTickets(true);
        console.log('[WeeklyPlanning] Loading unscheduled tickets, selectedTechnician:', selectedTechnician);
        const tickets = await weeklyPlanningService.getUnscheduledTickets({
          technicianId: selectedTechnician
        });
        console.log('[WeeklyPlanning] Loaded unscheduled tickets:', tickets?.length || 0, tickets);
        setUnscheduledTickets(tickets || []);
        setLoadingTickets(false);
      } catch (err) {
        console.error('[WeeklyPlanning] Failed to load data:', err);
        setError('Failed to load scheduling data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentWeekStart, selectedTechnician, loadWeekSchedules]);

  // Refresh data
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const weekData = await loadWeekSchedules(currentWeekStart, selectedTechnician);
      const nextWeekStart = new Date(currentWeekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const nextWeekData = await loadWeekSchedules(nextWeekStart, selectedTechnician);
      setWeeks([weekData, nextWeekData]);

      const tickets = await weeklyPlanningService.getUnscheduledTickets({
        technicianId: selectedTechnician
      });
      setUnscheduledTickets(tickets);
    } catch (err) {
      console.error('[WeeklyPlanning] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Load more weeks (infinite scroll)
  const handleLoadMoreWeeks = async () => {
    if (weeks.length === 0) return;

    try {
      const lastWeek = weeks[weeks.length - 1];
      const nextWeekStart = new Date(lastWeek.startDate);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);

      const newWeekData = await loadWeekSchedules(nextWeekStart, selectedTechnician);
      setWeeks(prev => [...prev, newWeekData]);
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to load more weeks:', err);
    }
  };

  // Navigation
  const handlePreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const handleNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const handleToday = () => {
    setCurrentWeekStart(getCurrentWeekStart());
  };

  // Handle technician change
  const handleTechnicianChange = (techId) => {
    setSelectedTechnician(techId);
  };

  // Handle drop ticket onto calendar
  const handleDropTicket = async ({ ticket, date, startTime }) => {
    if (!selectedTechnician && viewMode === 'single') {
      setError('Please select a technician first');
      return;
    }

    const techId = selectedTechnician || ticket.assigned_to;
    if (!techId) {
      setError('No technician assigned to this ticket');
      return;
    }

    const tech = technicians.find(t => t.id === techId);
    if (!tech) {
      setError('Technician not found');
      return;
    }

    // Calculate end time based on estimated hours
    const estimatedHours = ticket.estimated_hours || 2;
    const [startH, startM] = startTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = startMinutes + (estimatedHours * 60);
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    try {
      // Check for conflicts
      const conflicts = await weeklyPlanningService.checkBufferConflicts(
        techId,
        date,
        startTime,
        endTime
      );

      // Also check M365 calendar if available
      let calendarConflicts = [];
      if (tech.email && authContext) {
        try {
          const availability = await checkUserAvailability(
            authContext,
            tech.email,
            date,
            startTime,
            endTime,
            BUFFER_MINUTES
          );
          if (!availability.available) {
            calendarConflicts = availability.conflicts || [];
          }
        } catch {
          // Continue without calendar check
        }
      }

      const allConflicts = [...conflicts, ...calendarConflicts];

      if (allConflicts.length > 0) {
        // Show conflict modal
        setConflictModal({
          ticket,
          date,
          startTime,
          endTime,
          technician: tech,
          conflicts: allConflicts,
          onConfirm: async () => {
            await createTentativeSchedule(ticket, date, startTime, tech);
            setConflictModal(null);
          },
          onCancel: () => setConflictModal(null)
        });
        return;
      }

      // No conflicts - create schedule
      await createTentativeSchedule(ticket, date, startTime, tech);
    } catch (err) {
      console.error('[WeeklyPlanning] Drop failed:', err);
      setError('Failed to schedule ticket');
    }
  };

  // Create tentative schedule
  const createTentativeSchedule = async (ticket, date, startTime, technician) => {
    try {
      await weeklyPlanningService.createTentativeSchedule(ticket.id, {
        scheduled_date: date,
        scheduled_time_start: startTime,
        technician_id: technician.id,
        technician_name: technician.full_name,
        service_address: ticket.service_address
      });

      // Refresh data
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Create schedule failed:', err);
      throw err;
    }
  };

  // Open ticket detail
  const handleOpenTicket = (ticket) => {
    const ticketId = ticket.ticket_id || ticket.id;
    if (isEmbedded) {
      // Open in new tab if embedded
      window.open(`/service/tickets/${ticketId}`, '_blank');
    } else {
      navigate(`/service/tickets/${ticketId}`);
    }
  };

  // Handle schedule click
  const handleScheduleClick = (schedule) => {
    const ticketId = schedule.ticket?.id || schedule.ticket_id;
    if (ticketId) {
      handleOpenTicket({ id: ticketId });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`min-h-screen bg-zinc-900 ${isEmbedded ? '' : 'pt-16'}`}>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 size={48} className="animate-spin mx-auto mb-4 text-violet-500" />
            <p className="text-zinc-400">Loading Weekly Planning...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-zinc-900 flex flex-col ${isEmbedded ? 'h-screen' : 'pt-16'}`}>

      {/* Header / Filter Bar */}
      <TechnicianFilterBar
        technicians={technicians}
        selectedTechnician={selectedTechnician}
        onTechnicianChange={handleTechnicianChange}
        loadingTechnicians={loadingTechnicians}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showWorkWeekOnly={showWorkWeekOnly}
        onWeekModeChange={setShowWorkWeekOnly}
        currentWeekStart={currentWeekStart}
        onPreviousWeek={handlePreviousWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        isEmbedded={isEmbedded}
      />

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button
            onClick={() => setError('')}
            className="ml-auto text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Unscheduled tickets panel (left sidebar) */}
        <div className="w-[220px] flex-shrink-0">
          <UnscheduledTicketsPanel
            tickets={unscheduledTickets}
            technicians={technicians}
            selectedTechnician={selectedTechnician}
            onTechnicianChange={handleTechnicianChange}
            onOpenTicket={handleOpenTicket}
            isLoading={loadingTickets}
          />
        </div>

        {/* Week calendar grid (main area) */}
        <div className="flex-1 overflow-hidden">
          <WeekCalendarGrid
            weeks={weeks}
            showWorkWeekOnly={showWorkWeekOnly}
            showTechnician={viewMode === 'all'}
            onScheduleClick={handleScheduleClick}
            onScheduleEdit={handleOpenTicket}
            onDropTicket={handleDropTicket}
            onLoadMoreWeeks={handleLoadMoreWeeks}
            isLoading={refreshing}
          />
        </div>
      </div>

      {/* Conflict Modal */}
      {conflictModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={24} className="text-amber-500" />
              <h3 className="text-lg font-semibold text-white">Scheduling Conflict</h3>
            </div>

            <p className="text-zinc-300 mb-4">
              The selected time slot has conflicts with existing appointments.
              A 30-minute buffer is required between appointments.
            </p>

            <div className="bg-zinc-700/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-zinc-400 mb-2">Conflicts:</p>
              <ul className="space-y-1">
                {conflictModal.conflicts.map((conflict, idx) => (
                  <li key={idx} className="text-sm text-amber-400">
                    {conflict.title || conflict.subject || 'Busy'}: {conflict.start} - {conflict.end}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              Do you want to schedule anyway?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={conflictModal.onCancel}
                className="px-4 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={conflictModal.onConfirm}
                className="px-4 py-2 rounded-lg text-white transition-colors"
                style={{ backgroundColor: brandColors.warning }}
              >
                Schedule Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyPlanning;
