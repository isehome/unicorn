/**
 * WeeklyPlanning.js
 * "Air Traffic Control" interface for service ticket scheduling
 * Supports iframe embedding for Alleo integration
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, X, Phone, Mail, MapPin, Clock, Tag, User, Calendar, ExternalLink } from 'lucide-react';
import TechnicianFilterBar from '../components/Service/TechnicianFilterBar';
import WeekCalendarGrid from '../components/Service/WeekCalendarGrid';
import UnscheduledTicketsPanel from '../components/Service/UnscheduledTicketsPanel';
import { weeklyPlanningService, getWeekStart, formatDate, BUFFER_MINUTES } from '../services/weeklyPlanningService';
import { technicianService, serviceTicketService, serviceScheduleService } from '../services/serviceTicketService';
import { checkUserAvailability, fetchEventsForDate, createServiceAppointmentEvent, updateServiceAppointmentEvent } from '../services/microsoftCalendarService';
import { useAuth } from '../contexts/AuthContext';
import { brandColors } from '../styles/styleSystem';

// Priority colors
const priorityColors = {
  urgent: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444' },
  high: { bg: 'rgba(249, 115, 22, 0.2)', border: '#f97316', text: '#f97316' },
  normal: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', text: '#3b82f6' },
  low: { bg: 'rgba(148, 175, 50, 0.2)', border: '#94AF32', text: '#94AF32' }
};

// Status colors
const statusColors = {
  new: '#3b82f6',
  triaged: '#8b5cf6',
  scheduled: '#f59e0b',
  in_progress: '#f97316',
  completed: '#94AF32',
  closed: '#71717a'
};

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

  // Ticket detail modal
  const [ticketDetailModal, setTicketDetailModal] = useState(null);
  const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);

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

  // Handle drop ticket onto calendar (both new schedules and reschedules)
  const handleDropTicket = async ({ ticket, date, startTime }) => {
    // Check if this is a reschedule (moving an existing schedule)
    const isReschedule = ticket._isReschedule;
    const scheduleId = ticket._scheduleId;

    // Use selected technician from filter bar, or fall back to ticket's assigned technician
    const techId = selectedTechnician || ticket.assigned_to;
    if (!techId && !isReschedule) {
      setError('No technician assigned to this ticket. Please assign a technician in the ticket first.');
      return;
    }

    const tech = technicians.find(t => t.id === techId);
    if (!tech && !isReschedule) {
      setError('Technician not found');
      return;
    }

    // IMPORTANT: Fetch fresh ticket data from database to get latest estimated_hours
    // The drag data might be stale if triage was updated after the panel loaded
    let freshTicket = ticket;
    if (ticket.id) {
      try {
        const freshData = await serviceTicketService.getById(ticket.id);
        if (freshData) {
          freshTicket = { ...ticket, ...freshData };
          console.log('[WeeklyPlanning] Fetched fresh ticket data:', {
            id: freshData.id,
            estimated_hours: freshData.estimated_hours,
            customer_name: freshData.customer_name,
            category: freshData.category
          });
        }
      } catch (err) {
        console.warn('[WeeklyPlanning] Could not fetch fresh ticket data, using drag data:', err);
      }
    }

    // Calculate end time based on estimated hours
    // Parse as number to handle string values from database
    const rawEstimatedHours = freshTicket.estimated_hours;
    const estimatedHours = typeof rawEstimatedHours === 'number'
      ? rawEstimatedHours
      : (parseFloat(rawEstimatedHours) || 2);

    console.log('[WeeklyPlanning] Ticket estimated_hours:', {
      raw: rawEstimatedHours,
      parsed: estimatedHours,
      type: typeof rawEstimatedHours
    });
    const [startH, startM] = startTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = startMinutes + (estimatedHours * 60);
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    try {
      // Check for conflicts (exclude current schedule if rescheduling)
      const conflicts = await weeklyPlanningService.checkBufferConflicts(
        techId || freshTicket.assigned_to,
        date,
        startTime,
        endTime,
        isReschedule ? scheduleId : null // Exclude self when rescheduling
      );

      // Also check M365 calendar if available
      let calendarConflicts = [];
      const techForCalendar = tech || technicians.find(t => t.id === freshTicket.assigned_to);
      if (techForCalendar?.email && authContext) {
        try {
          const availability = await checkUserAvailability(
            authContext,
            techForCalendar.email,
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
          ticket: freshTicket,
          date,
          startTime,
          endTime,
          technician: tech || techForCalendar,
          conflicts: allConflicts,
          isReschedule,
          scheduleId,
          onConfirm: async () => {
            if (isReschedule) {
              await moveSchedule(scheduleId, date, startTime, estimatedHours);
            } else {
              await createTentativeSchedule(freshTicket, date, startTime, tech);
            }
            setConflictModal(null);
          },
          onCancel: () => setConflictModal(null)
        });
        return;
      }

      // No conflicts - create or move schedule
      if (isReschedule) {
        await moveSchedule(scheduleId, date, startTime, estimatedHours);
      } else {
        await createTentativeSchedule(freshTicket, date, startTime, tech);
      }
    } catch (err) {
      console.error('[WeeklyPlanning] Drop failed:', err);
      setError(isReschedule ? 'Failed to reschedule' : 'Failed to schedule ticket');
    }
  };

  // Move existing schedule to new date/time
  const moveSchedule = async (scheduleId, newDate, newTime, estimatedHours = null) => {
    try {
      // Move schedule in database
      const updatedSchedule = await weeklyPlanningService.moveSchedule(scheduleId, newDate, newTime, null, null, estimatedHours);

      // Update calendar event if one exists
      if (updatedSchedule?.calendar_event_id && authContext) {
        try {
          await updateServiceAppointmentEvent(authContext, updatedSchedule.calendar_event_id, {
            scheduled_date: newDate,
            scheduled_time_start: newTime,
            scheduled_time_end: updatedSchedule.scheduled_time_end
          });
          console.log('[WeeklyPlanning] Calendar event updated:', updatedSchedule.calendar_event_id);
        } catch (calendarErr) {
          console.warn('[WeeklyPlanning] Failed to update calendar event:', calendarErr);
        }
      }

      // Refresh data
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Move schedule failed:', err);
      throw err;
    }
  };

  // Constants for work day limits
  const MAX_WORK_HOURS_PER_DAY = 8;
  const WORK_DAY_START_HOUR = 8; // 8 AM default start for subsequent days

  // Helper to add days to a date string (skips weekends)
  const addWorkDaysToDate = (dateStr, days) => {
    const date = new Date(dateStr);
    let daysAdded = 0;
    while (daysAdded < days) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysAdded++;
      }
    }
    return date.toISOString().split('T')[0];
  };

  // Create tentative schedule (handles multi-day appointments automatically)
  const createTentativeSchedule = async (ticket, date, startTime, technician) => {
    try {
      // Calculate end time based on estimated hours
      // Parse as number to handle string values from database
      const rawHours = ticket.estimated_hours;
      const estimatedHours = typeof rawHours === 'number' ? rawHours : (parseFloat(rawHours) || 2);

      console.log('[WeeklyPlanning] createTentativeSchedule - estimated_hours:', {
        raw: rawHours,
        parsed: estimatedHours
      });

      // Check if we need to split into multiple appointments (over 8 hours)
      if (estimatedHours > MAX_WORK_HOURS_PER_DAY) {
        // Split into multiple appointments across days
        const appointments = [];
        let remainingHours = estimatedHours;
        let currentDate = date;
        let appointmentNumber = 1;
        const totalAppointments = Math.ceil(estimatedHours / MAX_WORK_HOURS_PER_DAY);

        while (remainingHours > 0) {
          const hoursForThisDay = Math.min(remainingHours, MAX_WORK_HOURS_PER_DAY);
          // First appointment uses the dropped time, subsequent ones start at WORK_DAY_START_HOUR
          const dayStartTime = appointmentNumber === 1
            ? startTime
            : `${WORK_DAY_START_HOUR.toString().padStart(2, '0')}:00`;

          const [startH, startM] = dayStartTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = startMinutes + (hoursForThisDay * 60);
          const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

          appointments.push({
            date: currentDate,
            startTime: dayStartTime,
            endTime: endTime,
            hours: hoursForThisDay,
            appointmentNumber,
            totalAppointments
          });

          remainingHours -= hoursForThisDay;
          if (remainingHours > 0) {
            currentDate = addWorkDaysToDate(currentDate, 1);
          }
          appointmentNumber++;
        }

        console.log('[WeeklyPlanning] Creating multi-day appointments:', appointments);

        // Create each appointment
        for (const appt of appointments) {
          const scheduleNotes = `Part ${appt.appointmentNumber} of ${appt.totalAppointments} (${appt.hours}h of ${estimatedHours}h total)`;

          const schedule = await weeklyPlanningService.createTentativeSchedule(ticket.id, {
            scheduled_date: appt.date,
            scheduled_time_start: appt.startTime,
            scheduled_time_end: appt.endTime,
            technician_id: technician.id,
            technician_name: technician.full_name,
            service_address: ticket.service_address,
            pre_visit_notes: scheduleNotes
          });

          // Create calendar event for each appointment
          if (authContext) {
            try {
              const calendarResult = await createServiceAppointmentEvent(authContext, {
                scheduled_date: appt.date,
                scheduled_time_start: appt.startTime,
                scheduled_time_end: appt.endTime,
                ticket: {
                  ...ticket,
                  title: `${ticket.title || 'Service'} (${scheduleNotes})`
                },
                customer_name: ticket.customer_name,
                customer_email: ticket.customer_email,
                service_address: ticket.service_address,
                technician_name: technician.full_name,
                is_tentative: true
              });

              if (calendarResult.success && calendarResult.eventId) {
                await weeklyPlanningService.updateCalendarEventId(schedule.id, calendarResult.eventId);
                console.log(`[WeeklyPlanning] Calendar event ${appt.appointmentNumber}/${appt.totalAppointments} created:`, calendarResult.eventId);
              }
            } catch (calendarErr) {
              console.warn('[WeeklyPlanning] Failed to create calendar event:', calendarErr);
            }
          }
        }

        console.log(`[WeeklyPlanning] Created ${appointments.length} appointments for ${estimatedHours}h ticket`);
      } else {
        // Single appointment (8 hours or less)
        const [startH, startM] = startTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = startMinutes + (estimatedHours * 60);
        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

        // Create the schedule in the database
        const schedule = await weeklyPlanningService.createTentativeSchedule(ticket.id, {
          scheduled_date: date,
          scheduled_time_start: startTime,
          scheduled_time_end: endTime,
          technician_id: technician.id,
          technician_name: technician.full_name,
          service_address: ticket.service_address
        });

        // Create calendar event with customer as attendee (if authContext available)
        if (authContext) {
          try {
            const calendarResult = await createServiceAppointmentEvent(authContext, {
              scheduled_date: date,
              scheduled_time_start: startTime,
              scheduled_time_end: endTime,
              ticket: ticket,
              customer_name: ticket.customer_name,
              customer_email: ticket.customer_email,
              service_address: ticket.service_address,
              technician_name: technician.full_name,
              is_tentative: true
            });

            if (calendarResult.success && calendarResult.eventId) {
              // Update schedule with calendar event ID
              await weeklyPlanningService.updateCalendarEventId(schedule.id, calendarResult.eventId);
              console.log('[WeeklyPlanning] Calendar event created:', calendarResult.eventId);
            } else {
              console.warn('[WeeklyPlanning] Calendar event creation skipped or failed:', calendarResult.error);
            }
          } catch (calendarErr) {
            console.warn('[WeeklyPlanning] Failed to create calendar event:', calendarErr);
            // Don't fail the schedule creation if calendar fails
          }
        }
      }

      // Refresh data
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Create schedule failed:', err);
      throw err;
    }
  };

  // Open ticket detail modal
  const handleOpenTicket = async (ticketOrSchedule) => {
    const ticketId = ticketOrSchedule.ticket_id || ticketOrSchedule.id;
    if (!ticketId) return;

    try {
      setLoadingTicketDetail(true);
      // Fetch full ticket details
      const ticketData = await serviceTicketService.getById(ticketId);
      setTicketDetailModal({
        ticket: ticketData,
        schedule: ticketOrSchedule.scheduled_date ? ticketOrSchedule : null
      });
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to load ticket details:', err);
      setError('Failed to load ticket details');
    } finally {
      setLoadingTicketDetail(false);
    }
  };

  // Handle schedule click - show modal
  const handleScheduleClick = (schedule) => {
    handleOpenTicket(schedule);
  };

  // Handle schedule delete
  const handleScheduleDelete = async (schedule) => {
    try {
      await serviceScheduleService.remove(schedule.id);
      console.log('[WeeklyPlanning] Schedule deleted:', schedule.id);
      // Refresh to update the view
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to delete schedule:', err);
      setError('Failed to delete schedule');
    }
  };

  // Open full ticket page in new tab
  const handleOpenTicketFullPage = (ticketId) => {
    window.open(`/service/tickets/${ticketId}`, '_blank');
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
            onScheduleDelete={handleScheduleDelete}
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
                {conflictModal.isReschedule ? 'Move Anyway' : 'Schedule Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {ticketDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">
                  #{ticketDetailModal.ticket?.ticket_number}
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: priorityColors[ticketDetailModal.ticket?.priority]?.bg || priorityColors.normal.bg,
                    color: priorityColors[ticketDetailModal.ticket?.priority]?.text || priorityColors.normal.text,
                    border: `1px solid ${priorityColors[ticketDetailModal.ticket?.priority]?.border || priorityColors.normal.border}`
                  }}
                >
                  {ticketDetailModal.ticket?.priority || 'normal'}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: statusColors[ticketDetailModal.ticket?.status] || statusColors.new }}
                >
                  {ticketDetailModal.ticket?.status?.replace('_', ' ') || 'new'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenTicketFullPage(ticketDetailModal.ticket?.id)}
                  className="p-2 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
                  title="Open in new tab"
                >
                  <ExternalLink size={18} />
                </button>
                <button
                  onClick={() => setTicketDetailModal(null)}
                  className="p-2 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title */}
              <div>
                <h4 className="text-xl font-medium text-white mb-1">
                  {ticketDetailModal.ticket?.title || 'Service Request'}
                </h4>
                {ticketDetailModal.ticket?.description && (
                  <p className="text-zinc-400 text-sm">
                    {ticketDetailModal.ticket.description}
                  </p>
                )}
              </div>

              {/* Customer Info */}
              <div className="bg-zinc-700/50 rounded-lg p-4">
                <h5 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <User size={14} />
                  Customer Information
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-zinc-400" />
                    <span className="text-white">{ticketDetailModal.ticket?.customer_name || 'Unknown'}</span>
                  </div>
                  {ticketDetailModal.ticket?.customer_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone size={14} className="text-zinc-400" />
                      <a href={`tel:${ticketDetailModal.ticket.customer_phone}`} className="text-violet-400 hover:underline">
                        {ticketDetailModal.ticket.customer_phone}
                      </a>
                    </div>
                  )}
                  {ticketDetailModal.ticket?.customer_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={14} className="text-zinc-400" />
                      <a href={`mailto:${ticketDetailModal.ticket.customer_email}`} className="text-violet-400 hover:underline">
                        {ticketDetailModal.ticket.customer_email}
                      </a>
                    </div>
                  )}
                  {ticketDetailModal.ticket?.service_address && (
                    <div className="flex items-start gap-2 text-sm md:col-span-2">
                      <MapPin size={14} className="text-zinc-400 mt-0.5" />
                      <span className="text-white">{ticketDetailModal.ticket.service_address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Info */}
              {ticketDetailModal.schedule && (
                <div className="bg-zinc-700/50 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Calendar size={14} />
                    Schedule Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar size={14} className="text-zinc-400" />
                      <span className="text-white">
                        {new Date(ticketDetailModal.schedule.scheduled_date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock size={14} className="text-zinc-400" />
                      <span className="text-white">
                        {ticketDetailModal.schedule.scheduled_time_start?.slice(0, 5)} - {ticketDetailModal.schedule.scheduled_time_end?.slice(0, 5)}
                      </span>
                    </div>
                    {/* Technician Dropdown */}
                    <div className="md:col-span-2">
                      <label className="text-xs text-zinc-400 block mb-1">Assigned Technician</label>
                      <select
                        value={ticketDetailModal.schedule.technician_id || ''}
                        onChange={async (e) => {
                          const newTechId = e.target.value;
                          const newTech = technicians.find(t => t.id === newTechId);
                          if (newTech && ticketDetailModal.schedule?.id) {
                            try {
                              await weeklyPlanningService.moveSchedule(
                                ticketDetailModal.schedule.id,
                                ticketDetailModal.schedule.scheduled_date,
                                ticketDetailModal.schedule.scheduled_time_start,
                                newTechId,
                                newTech.full_name
                              );
                              // Update the modal state
                              setTicketDetailModal(prev => ({
                                ...prev,
                                schedule: {
                                  ...prev.schedule,
                                  technician_id: newTechId,
                                  technician_name: newTech.full_name
                                }
                              }));
                              // Refresh calendar
                              await handleRefresh();
                            } catch (err) {
                              console.error('[WeeklyPlanning] Failed to update technician:', err);
                              setError('Failed to update technician');
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                      >
                        <option value="">-- Select Technician --</option>
                        {technicians.map(tech => (
                          <option key={tech.id} value={tech.id}>
                            {tech.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Ticket Details */}
              <div className="bg-zinc-700/50 rounded-lg p-4">
                <h5 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <Tag size={14} />
                  Ticket Details
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {ticketDetailModal.ticket?.category && (
                    <div className="text-sm">
                      <span className="text-zinc-400 block text-xs">Category</span>
                      <span className="text-white capitalize">{ticketDetailModal.ticket.category}</span>
                    </div>
                  )}
                  {ticketDetailModal.ticket?.estimated_hours && (
                    <div className="text-sm">
                      <span className="text-zinc-400 block text-xs">Estimated Time</span>
                      <span className="text-white">{ticketDetailModal.ticket.estimated_hours} hours</span>
                    </div>
                  )}
                  {ticketDetailModal.ticket?.created_at && (
                    <div className="text-sm">
                      <span className="text-zinc-400 block text-xs">Created</span>
                      <span className="text-white">
                        {new Date(ticketDetailModal.ticket.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {ticketDetailModal.ticket?.internal_notes && (
                <div className="bg-zinc-700/50 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-zinc-300 mb-2">Internal Notes</h5>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                    {ticketDetailModal.ticket.internal_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-zinc-700">
              <button
                onClick={() => handleOpenTicketFullPage(ticketDetailModal.ticket?.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors text-white"
              >
                <ExternalLink size={16} />
                Open Full Details
              </button>
              <button
                onClick={() => setTicketDetailModal(null)}
                className="px-4 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for ticket detail */}
      {loadingTicketDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 rounded-lg p-6 flex items-center gap-3">
            <Loader2 size={24} className="animate-spin text-violet-500" />
            <span className="text-white">Loading ticket details...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyPlanning;
