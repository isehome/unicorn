/**
 * WeeklyPlanning.js
 * "Air Traffic Control" interface for service ticket scheduling
 * Supports iframe embedding for Alleo integration
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, X, Phone, Mail, MapPin, Clock, Tag, User, Calendar, ExternalLink, Edit3, Trash2, Send, CheckCircle } from 'lucide-react';
import TechnicianFilterBar from '../components/Service/TechnicianFilterBar';
import WeekCalendarGrid from '../components/Service/WeekCalendarGrid';
import UnscheduledTicketsPanel from '../components/Service/UnscheduledTicketsPanel';
import TechnicianDropdown from '../components/Service/TechnicianDropdown';
import { weeklyPlanningService, formatDate, BUFFER_MINUTES } from '../services/weeklyPlanningService';
import { technicianService, serviceTicketService, serviceScheduleService } from '../services/serviceTicketService';
import { checkUserAvailability, fetchUserEventsForDate, updateServiceAppointmentEvent, sendMeetingInviteEmail, sendMeetingCancellationEmail } from '../services/microsoftCalendarService';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { brandColors } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';

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
  const [searchParams] = useSearchParams();
  // useAuth() returns the full context object with accessToken, acquireToken, user, etc.
  // We assign the whole thing to authContext for use with calendar services
  const authContext = useAuth();
  const { user } = authContext;
  const { publishState, registerActions, unregisterActions } = useAppState();

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
  const [allScheduledTickets, setAllScheduledTickets] = useState([]); // For panel sidebar
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

      // If 'all' is selected, pass null to get all technicians' schedules
      const effectiveTechId = (techId === 'all' || !techId) ? null : techId;

      // Get schedules from database
      const schedules = await weeklyPlanningService.getSchedulesForDateRange(
        startDate,
        endDate,
        effectiveTechId
      );
      console.log(`[WeeklyPlanning] Loaded ${schedules?.length || 0} service schedules from database:`, schedules);

      // Get M365 calendar events for blocking (fetch each day in the range)
      // Only fetch calendar events for a specific technician (not 'all' - privacy)
      let blockedEvents = [];
      if (effectiveTechId && authContext) {
        try {
          const tech = technicians.find(t => t.id === effectiveTechId);
          const techEmail = tech?.email;
          console.log(`[WeeklyPlanning] Looking up technician ${effectiveTechId}:`, tech ? `Found: ${tech.full_name} (${techEmail})` : 'NOT FOUND');
          console.log(`[WeeklyPlanning] Available technicians:`, technicians.map(t => ({ id: t.id, name: t.full_name })));
          if (techEmail) {
            console.log(`[WeeklyPlanning] Fetching calendar for ${techEmail}`);
            // Fetch events for each day in the week using the technician's calendar
            const dayPromises = [];
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
              const dateStr = formatDateLocal(new Date(d));
              dayPromises.push(
                fetchUserEventsForDate(authContext, techEmail, dateStr)
                  .then(result => {
                    if (result.error && result.error !== 'No calendar access') {
                      console.warn(`[WeeklyPlanning] Calendar fetch issue for ${dateStr}:`, result.error);
                    }
                    return (result.events || []).map(e => ({ ...e, fetchedDate: dateStr }));
                  })
                  .catch(() => [])
              );
            }
            const dayResults = await Promise.all(dayPromises);
            const allEvents = dayResults.flat();
            console.log(`[WeeklyPlanning] Raw calendar events:`, allEvents);

            // Filter out service appointments created by our app
            // These are shown as ScheduleBlocks, not blocked time
            const filteredEvents = allEvents.filter(event => {
              const subject = event.subject || '';
              // Exclude events that match our service appointment patterns
              const isServiceAppointment =
                subject.startsWith('[PENDING]') ||
                subject.startsWith('[AWAITING CUSTOMER]') ||
                subject.startsWith('[TENTATIVE]') ||
                subject.startsWith('Service:');
              if (isServiceAppointment) {
                console.log(`[WeeklyPlanning] Filtering out service appointment: "${subject}"`);
              }
              return !isServiceAppointment;
            });
            console.log(`[WeeklyPlanning] Filtered events: ${filteredEvents.length} (excluded ${allEvents.length - filteredEvents.length} service appointments)`);

            blockedEvents = filteredEvents.map(event => {
              // Graph API returns datetime without timezone suffix - parse as local time
              // Format: "2024-01-15T09:00:00.0000000"
              let startHour = 0;
              let endHour = 0;

              if (event.start) {
                // Parse the time portion directly to avoid timezone issues
                const startMatch = event.start.match(/T(\d{2}):(\d{2})/);
                if (startMatch) {
                  startHour = parseInt(startMatch[1], 10) + parseInt(startMatch[2], 10) / 60;
                }
              }
              if (event.end) {
                const endMatch = event.end.match(/T(\d{2}):(\d{2})/);
                if (endMatch) {
                  endHour = parseInt(endMatch[1], 10) + parseInt(endMatch[2], 10) / 60;
                }
              }

              // Get date from the fetchedDate we stored, or parse from start
              const eventDate = event.fetchedDate || formatDateLocal(new Date(event.start));

              console.log(`[WeeklyPlanning] Event: "${event.subject}" on ${eventDate} from ${startHour} to ${endHour}`);

              return {
                ...event,
                date: eventDate,
                startHour,
                endHour
              };
            });
            console.log(`[WeeklyPlanning] Processed ${blockedEvents.length} calendar events for ${techEmail}:`, blockedEvents);
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

  // Load initial data - wait for technicians to be loaded first
  useEffect(() => {
    // Don't load schedules until technicians are loaded (needed for calendar email lookup)
    if (loadingTechnicians) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        // Load current week and next week
        console.log('[WeeklyPlanning] Loading week data for:', { currentWeekStart, selectedTechnician, techniciansCount: technicians.length });
        const weekData = await loadWeekSchedules(currentWeekStart, selectedTechnician);
        console.log('[WeeklyPlanning] Week 1 data:', weekData);
        const nextWeekStart = new Date(currentWeekStart);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);
        const nextWeekData = await loadWeekSchedules(nextWeekStart, selectedTechnician);
        console.log('[WeeklyPlanning] Week 2 data:', nextWeekData);

        setWeeks([weekData, nextWeekData]);

        // Load unscheduled tickets AND all scheduled tickets for the panel
        setLoadingTickets(true);
        console.log('[WeeklyPlanning] Loading tickets, selectedTechnician:', selectedTechnician);

        // Fetch both in parallel
        const [unscheduled, allScheduled] = await Promise.all([
          weeklyPlanningService.getUnscheduledTickets({
            technicianId: selectedTechnician
          }),
          weeklyPlanningService.getAllActiveSchedules(selectedTechnician)
        ]);

        console.log('[WeeklyPlanning] Loaded unscheduled tickets:', unscheduled?.length || 0);
        console.log('[WeeklyPlanning] Loaded all scheduled tickets:', allScheduled?.length || 0);
        setUnscheduledTickets(unscheduled || []);
        setAllScheduledTickets(allScheduled || []);
        setLoadingTickets(false);
      } catch (err) {
        console.error('[WeeklyPlanning] Failed to load data:', err);
        setError('Failed to load scheduling data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // Note: technicians.length is used in console.log but loadWeekSchedules already depends on technicians
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekStart, selectedTechnician, loadWeekSchedules, loadingTechnicians]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'weekly-planning',
      isEmbedded: isEmbedded,
      weekStart: currentWeekStart?.toISOString(),
      selectedTechnician: selectedTechnician ? {
        id: selectedTechnician,
        name: technicians?.find(t => t.id === selectedTechnician)?.display_name
      } : null,
      viewMode: viewMode,
      technicians: (technicians || []).map(t => ({ id: t.id, name: t.display_name })),
      unscheduledTicketCount: unscheduledTickets?.length || 0,
      loading: loading || loadingTechnicians,
      hint: 'Weekly service scheduling view. Air traffic control for service tickets. Schedule, assign technicians.'
    });
  }, [publishState, currentWeekStart, selectedTechnician, viewMode, technicians, unscheduledTickets, loading, loadingTechnicians, isEmbedded]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      select_technician: async ({ technicianName }) => {
        if (technicianName === 'all' || !technicianName) {
          setSelectedTechnician(null);
          return { success: true, message: 'Showing all technicians' };
        }
        const tech = technicians?.find(t => t.display_name?.toLowerCase().includes(technicianName.toLowerCase()));
        if (tech) {
          setSelectedTechnician(tech.id);
          return { success: true, message: `Selected technician: ${tech.display_name}` };
        }
        return { success: false, error: 'Technician not found' };
      },
      go_to_next_week: async () => {
        const nextWeek = new Date(currentWeekStart);
        nextWeek.setDate(nextWeek.getDate() + 7);
        setCurrentWeekStart(nextWeek);
        return { success: true, message: 'Moved to next week' };
      },
      go_to_previous_week: async () => {
        const prevWeek = new Date(currentWeekStart);
        prevWeek.setDate(prevWeek.getDate() - 7);
        setCurrentWeekStart(prevWeek);
        return { success: true, message: 'Moved to previous week' };
      },
      go_to_current_week: async () => {
        setCurrentWeekStart(getCurrentWeekStart());
        return { success: true, message: 'Returned to current week' };
      },
      toggle_view_mode: async () => {
        setViewMode(prev => prev === 'single' ? 'all' : 'single');
        return { success: true, message: viewMode === 'single' ? 'Showing all technicians' : 'Showing single technician' };
      },
      refresh_schedules: async () => {
        await handleRefresh();
        return { success: true, message: 'Schedules refreshed' };
      },
      list_unscheduled_tickets: async () => {
        return {
          success: true,
          tickets: (unscheduledTickets || []).slice(0, 10).map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            contactName: t.contacts?.name
          })),
          count: unscheduledTickets?.length || 0
        };
      },
      list_technicians: async () => {
        return {
          success: true,
          technicians: (technicians || []).map(t => ({
            id: t.id,
            name: t.display_name,
            email: t.email
          }))
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerActions, unregisterActions, technicians, currentWeekStart, viewMode, unscheduledTickets]);

  // Refresh data and check for calendar response updates
  const handleRefresh = async (checkResponses = true) => {
    try {
      setRefreshing(true);

      // First, trigger a check for calendar responses (tech/customer accepts/declines)
      // This updates schedule statuses in the database before we fetch
      if (checkResponses) {
        try {
          const checkResult = await fetch('/api/system-account/check-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (checkResult.ok) {
            const data = await checkResult.json();
            console.log('[WeeklyPlanning] Calendar response check:', data);
            if (data.techAccepted > 0 || data.customerAccepted > 0 || data.declined > 0) {
              console.log('[WeeklyPlanning] Schedule status changes detected!');
            }
          }
        } catch (checkErr) {
          console.warn('[WeeklyPlanning] Calendar response check failed:', checkErr);
          // Continue with refresh even if check fails
        }
      }

      const weekData = await loadWeekSchedules(currentWeekStart, selectedTechnician);
      const nextWeekStart = new Date(currentWeekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const nextWeekData = await loadWeekSchedules(nextWeekStart, selectedTechnician);
      setWeeks([weekData, nextWeekData]);

      // Refresh both unscheduled and all scheduled tickets
      const [unscheduled, allScheduled] = await Promise.all([
        weeklyPlanningService.getUnscheduledTickets({
          technicianId: selectedTechnician
        }),
        weeklyPlanningService.getAllActiveSchedules(selectedTechnician)
      ]);
      setUnscheduledTickets(unscheduled || []);
      setAllScheduledTickets(allScheduled || []);
    } catch (err) {
      console.error('[WeeklyPlanning] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // REALTIME SUBSCRIPTION - Auto-refresh when schedules are updated
  // This ensures the UI updates when the cron job processes calendar responses
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Subscribe to changes on service_schedules table
    const subscription = supabase
      .channel('schedule-status-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_schedules'
        },
        (payload) => {
          console.log('[WeeklyPlanning] Realtime update received:', payload);
          // Refresh data when a schedule changes
          // Use a short delay to batch multiple rapid updates
          setTimeout(() => {
            console.log('[WeeklyPlanning] Auto-refreshing due to schedule change');
            handleRefresh(false); // false = don't trigger another calendar check
          }, 500);
        }
      )
      .subscribe((status) => {
        console.log('[WeeklyPlanning] Realtime subscription status:', status);
      });

    return () => {
      console.log('[WeeklyPlanning] Unsubscribing from realtime');
      supabase.removeChannel(subscription);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekStart, selectedTechnician, loadWeekSchedules]); // Re-subscribe when these change

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
    console.log('[WeeklyPlanning] Technician changed to:', techId);
    // Clear existing data immediately to show loading state
    setWeeks([]);
    setSelectedTechnician(techId);
    // Automatically switch view mode based on selection
    // 'all' or null -> show all technicians overlapping
    // specific tech -> show single technician
    if (!techId || techId === 'all') {
      setViewMode('all');
    } else {
      setViewMode('single');
    }
  };

  // Handle drop ticket onto calendar (both new schedules and reschedules)
  const handleDropTicket = async ({ ticket, date, startTime }) => {
    // Check if this is a reschedule (moving an existing schedule)
    const isReschedule = ticket._isReschedule;
    const scheduleId = ticket._scheduleId;

    // Use selected technician from filter bar, or fall back to ticket's assigned technician
    // In "All" view mode, require a specific technician selection to avoid confusion
    let techId = selectedTechnician;
    if (!techId || techId === 'all') {
      // Fall back to ticket's assigned technician
      techId = ticket.assigned_to;
    }
    if (!techId && !isReschedule) {
      setError('Please select a specific technician from the filter bar, or assign a technician to the ticket first.');
      return;
    }

    const tech = technicians.find(t => t.id === techId);
    if (!tech && !isReschedule) {
      setError('Technician not found');
      return;
    }

    // PREVENT DUPLICATE: Check if ticket already has an active schedule (not a reschedule)
    if (!isReschedule && ticket.id) {
      // Get all schedules from loaded weeks
      const allSchedules = weeks.flatMap(w => w.schedules || []);
      const existingSchedule = allSchedules.find(
        s => s.ticket_id === ticket.id && s.schedule_status !== 'cancelled'
      );
      if (existingSchedule) {
        setError(`This ticket already has a schedule on ${existingSchedule.scheduled_date}. Remove the existing schedule first or drag the existing card to reschedule.`);
        return;
      }
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
      const conflictCheckTechId = techId || freshTicket.assigned_to;
      console.log('[WeeklyPlanning] Checking conflicts for:', {
        techId,
        'freshTicket.assigned_to': freshTicket.assigned_to,
        conflictCheckTechId,
        date,
        startTime,
        endTime,
        isReschedule,
        scheduleId
      });
      const conflicts = await weeklyPlanningService.checkBufferConflicts(
        conflictCheckTechId,
        date,
        startTime,
        endTime,
        isReschedule ? scheduleId : null // Exclude self when rescheduling
      );
      console.log('[WeeklyPlanning] Database conflicts found:', conflicts);

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
    return formatDateLocal(date);
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

        console.log('[WeeklyPlanning] Creating multi-day draft appointments:', appointments);

        // Create each appointment as DRAFT - no calendar invites yet
        for (const appt of appointments) {
          await weeklyPlanningService.createTentativeSchedule(ticket.id, {
            scheduled_date: appt.date,
            scheduled_time_start: appt.startTime,
            scheduled_time_end: appt.endTime,
            technician_id: technician.id,
            technician_name: technician.full_name,
            notes: `Part ${appt.appointmentNumber} of ${appt.totalAppointments} (${appt.hours}h of ${estimatedHours}h total)`
          });
        }

        console.log(`[WeeklyPlanning] Created ${appointments.length} draft appointments for ${estimatedHours}h ticket - commit each to send invites`);
      } else {
        // Single appointment (8 hours or less)
        const [startH, startM] = startTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = startMinutes + (estimatedHours * 60);
        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

        // Create the schedule in the database as DRAFT
        // Calendar invite is NOT sent yet - user must click "Commit" to lock and send invite
        await weeklyPlanningService.createTentativeSchedule(ticket.id, {
          scheduled_date: date,
          scheduled_time_start: startTime,
          scheduled_time_end: endTime,
          technician_id: technician.id,
          technician_name: technician.full_name
        });

        console.log('[WeeklyPlanning] Draft schedule created - user must commit to send calendar invite');
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
      // Send cancellation email if schedule was committed (has a calendar_event_id)
      if (schedule.calendar_event_id && schedule.technician_id && authContext) {
        const technician = technicians.find(t => t.id === schedule.technician_id);
        if (technician?.email) {
          try {
            console.log('[WeeklyPlanning] Sending cancellation email to:', technician.email);
            const ticket = schedule.ticket || {};
            await sendMeetingCancellationEmail(authContext, {
              eventId: schedule.calendar_event_id,
              technicianEmail: technician.email,
              technicianName: schedule.technician_name || technician.full_name,
              customerName: ticket.customer_name,
              scheduledDate: schedule.scheduled_date,
              startTime: schedule.scheduled_time_start,
              scheduleId: schedule.id
            });
            console.log('[WeeklyPlanning] Calendar event cancelled');
          } catch (emailErr) {
            console.warn('[WeeklyPlanning] Failed to cancel calendar event:', emailErr);
            // Continue anyway
          }
        }
      }

      await serviceScheduleService.remove(schedule.id);
      console.log('[WeeklyPlanning] Schedule deleted:', schedule.id);
      // Refresh to update the view
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to delete schedule:', err);
      setError('Failed to delete schedule');
    }
  };

  // Track which schedules are currently being committed to prevent double-clicks
  const [committingSchedules, setCommittingSchedules] = useState(new Set());

  // Handle committing a draft schedule (locks it and sends tech invite)
  const handleCommitSchedule = async (schedule) => {
    // Prevent double-clicks
    if (committingSchedules.has(schedule.id)) {
      console.log('[WeeklyPlanning] Already committing schedule:', schedule.id);
      return;
    }

    // Mark as committing
    setCommittingSchedules(prev => new Set(prev).add(schedule.id));

    try {
      console.log('[WeeklyPlanning] Committing schedule:', schedule.id);
      console.log('[WeeklyPlanning] Schedule technician_id:', schedule.technician_id);
      console.log('[WeeklyPlanning] Available technicians:', technicians.map(t => ({ id: t.id, name: t.full_name, email: t.email })));

      // Get technician email for the calendar invite
      const technician = technicians.find(t => t.id === schedule.technician_id);
      console.log('[WeeklyPlanning] Found technician:', technician);
      if (!technician?.email) {
        setError('Cannot commit: Technician email not found. Please assign a technician with a valid email.');
        return;
      }

      // Check if the technician is the same as the currently logged-in user
      const currentUserEmail = user?.email?.toLowerCase();
      const technicianEmail = technician.email.toLowerCase();
      const isSelfAssigned = currentUserEmail && technicianEmail && currentUserEmail === technicianEmail;
      console.log('[WeeklyPlanning] Self-assigned check:', { currentUserEmail, technicianEmail, isSelfAssigned });

      // 1. Update schedule status to pending_tech
      const committedSchedule = await weeklyPlanningService.commitSchedule(schedule.id);
      console.log('[WeeklyPlanning] Schedule committed:', committedSchedule);

      // 2. Send meeting invite email to technician
      if (authContext) {
        try {
          const ticket = committedSchedule.ticket || schedule.ticket || {};
          console.log('[WeeklyPlanning] Sending meeting invite email to:', technician.email);

          // Send email with ICS calendar attachment - technician can accept/decline
          const inviteResult = await sendMeetingInviteEmail(authContext, {
            technicianEmail: technician.email,
            technicianName: committedSchedule.technician_name || technician.full_name,
            customerName: ticket.customer_name,
            customerPhone: ticket.customer_phone,
            customerEmail: ticket.customer_email,
            serviceAddress: ticket.service_address,
            scheduledDate: committedSchedule.scheduled_date,
            startTime: committedSchedule.scheduled_time_start,
            endTime: committedSchedule.scheduled_time_end,
            category: ticket.category,
            description: ticket.description || ticket.title,
            ticketNumber: ticket.id?.substring(0, 8),
            organizerEmail: user?.email || 'scheduling@isehome.com',
            organizerName: user?.name || 'ISE Scheduling',
            scheduleId: committedSchedule.id
          });

          console.log('[WeeklyPlanning] Meeting invite result:', inviteResult);
          if (inviteResult.success) {
            // Save the eventId for tracking (used to cancel the calendar event later)
            if (inviteResult.eventId) {
              await weeklyPlanningService.updateCalendarEventId(committedSchedule.id, inviteResult.eventId);
              console.log('[WeeklyPlanning] Saved calendar eventId:', inviteResult.eventId);
            }
            console.log('[WeeklyPlanning] Calendar invite created and sent to:', technician.email);
          } else {
            console.warn('[WeeklyPlanning] Meeting invite email failed:', inviteResult);
            setError(`Schedule committed but invite email failed: ${inviteResult.error || 'Unknown error'}`);
          }
        } catch (emailErr) {
          console.error('[WeeklyPlanning] Failed to send meeting invite email:', emailErr);
          setError('Schedule committed but failed to send invite email to technician.');
        }
      } else {
        console.warn('[WeeklyPlanning] No auth context - invite email not sent');
        setError('Schedule committed but invite email not sent (not authenticated).');
      }

      // 3. Refresh the view
      await handleRefresh();

    } catch (err) {
      console.error('[WeeklyPlanning] Failed to commit schedule:', err);
      setError(`Failed to commit schedule: ${err.message}`);
    } finally {
      // Remove from committing set
      setCommittingSchedules(prev => {
        const next = new Set(prev);
        next.delete(schedule.id);
        return next;
      });
    }
  };

  // Handle resetting a committed schedule back to draft (unlocks it)
  const handleResetToDraft = async (schedule) => {
    if (!window.confirm('Reset this schedule to draft? This will unlock it for editing and cancel any pending calendar invites.')) {
      return;
    }

    try {
      console.log('[WeeklyPlanning] Resetting schedule to draft:', schedule.id);

      // Send cancellation email if schedule was committed (has a calendar_event_id)
      if (schedule.calendar_event_id && schedule.technician_id && authContext) {
        const technician = technicians.find(t => t.id === schedule.technician_id);
        if (technician?.email) {
          try {
            console.log('[WeeklyPlanning] Sending cancellation email to:', technician.email);
            const ticket = schedule.ticket || {};
            await sendMeetingCancellationEmail(authContext, {
              eventId: schedule.calendar_event_id,
              technicianEmail: technician.email,
              technicianName: schedule.technician_name || technician.full_name,
              customerName: ticket.customer_name,
              scheduledDate: schedule.scheduled_date,
              startTime: schedule.scheduled_time_start,
              scheduleId: schedule.id
            });
            console.log('[WeeklyPlanning] Calendar event cancelled');
          } catch (emailErr) {
            console.warn('[WeeklyPlanning] Failed to cancel calendar event:', emailErr);
            // Continue anyway - don't block the reset
          }
        }
      }

      await weeklyPlanningService.resetToDraft(schedule.id);
      console.log('[WeeklyPlanning] Schedule reset to draft successfully');

      // Close the modal and refresh
      setTicketDetailModal(null);
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to reset schedule to draft:', err);
      setError(`Failed to reset schedule: ${err.message}`);
    }
  };

  // Handle completely removing a schedule (returns ticket to unscheduled)
  const handleRemoveSchedule = async (schedule) => {
    console.log('[WeeklyPlanning] handleRemoveSchedule called with:', schedule);

    if (!schedule || !schedule.id) {
      console.error('[WeeklyPlanning] No schedule or schedule.id provided');
      setError('Cannot remove schedule: missing schedule data');
      return;
    }

    const ticketName = schedule.ticket?.customer_name || schedule.ticket?.title || 'this ticket';
    if (!window.confirm(`Remove "${ticketName}" from the schedule entirely? The ticket will return to the unscheduled panel.`)) {
      console.log('[WeeklyPlanning] User cancelled removal');
      return;
    }

    try {
      console.log('[WeeklyPlanning] Removing schedule:', schedule.id);

      // Cancel calendar event if schedule was committed (has a calendar_event_id)
      // Note: We use system account API which doesn't require user authContext
      if (schedule.calendar_event_id) {
        try {
          const technician = technicians.find(t => t.id === schedule.technician_id);
          const ticket = schedule.ticket || {};
          console.log('[WeeklyPlanning] Cancelling calendar event:', schedule.calendar_event_id);
          await sendMeetingCancellationEmail(null, {
            eventId: schedule.calendar_event_id,
            technicianEmail: technician?.email,
            technicianName: schedule.technician_name || technician?.full_name,
            customerName: ticket.customer_name,
            scheduledDate: schedule.scheduled_date,
            startTime: schedule.scheduled_time_start,
            scheduleId: schedule.id
          });
          console.log('[WeeklyPlanning] Calendar event cancelled successfully');
        } catch (emailErr) {
          console.warn('[WeeklyPlanning] Failed to cancel calendar event:', emailErr);
          // Continue anyway - don't block the removal
        }
      }

      // Delete the schedule
      await serviceScheduleService.remove(schedule.id);

      // Update ticket status back to triaged
      if (schedule.ticket_id) {
        await serviceTicketService.update(schedule.ticket_id, { status: 'triaged' });
      }

      console.log('[WeeklyPlanning] Schedule removed successfully');

      // Close the modal and refresh
      setTicketDetailModal(null);
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to remove schedule:', err);
      setError(`Failed to remove schedule: ${err.message}`);
    }
  };

  // Handle sending customer invite (from tech_accepted → pending_customer)
  const handleSendCustomerInvite = async (schedule) => {
    const customerName = schedule.ticket?.customer_name || 'the customer';
    if (!window.confirm(`Send calendar invite to ${customerName}? This will transition the schedule to "Awaiting Customer" status.`)) {
      return;
    }

    try {
      console.log('[WeeklyPlanning] Sending customer invite for schedule:', schedule.id);
      await weeklyPlanningService.sendCustomerInvite(schedule.id);
      console.log('[WeeklyPlanning] Customer invite sent successfully');

      // Close the modal and refresh
      setTicketDetailModal(null);
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to send customer invite:', err);
      setError(`Failed to send customer invite: ${err.message}`);
    }
  };

  // Handle marking customer as confirmed manually (skips customer calendar acceptance)
  const handleMarkCustomerConfirmed = async (schedule) => {
    const customerName = schedule.ticket?.customer_name || 'the customer';
    if (!window.confirm(`Mark ${customerName} as confirmed? This will transition the schedule to "Confirmed" status without waiting for customer response.`)) {
      return;
    }

    try {
      console.log('[WeeklyPlanning] Marking customer confirmed for schedule:', schedule.id);
      await weeklyPlanningService.markCustomerConfirmed(schedule.id, user?.displayName || user?.email || 'Staff');
      console.log('[WeeklyPlanning] Customer marked as confirmed');

      // Close the modal and refresh
      setTicketDetailModal(null);
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to mark customer confirmed:', err);
      setError(`Failed to mark customer confirmed: ${err.message}`);
    }
  };

  // Handle unscheduling a ticket (dragged back to panel)
  const handleUnschedule = async (scheduleId, ticketData) => {
    if (!window.confirm(`Remove "${ticketData.customer_name || ticketData.title}" from schedule? The ticket will return to the unscheduled panel.`)) {
      return;
    }

    try {
      // First, fetch the schedule to get the calendar_event_id and technician info
      const schedule = await serviceScheduleService.getById(scheduleId);

      // Send cancellation email if schedule was committed (has a calendar_event_id)
      if (schedule?.calendar_event_id && schedule?.technician_id && authContext) {
        const technician = technicians.find(t => t.id === schedule.technician_id);
        if (technician?.email) {
          try {
            console.log('[WeeklyPlanning] Sending cancellation email to:', technician.email);
            await sendMeetingCancellationEmail(authContext, {
              eventId: schedule.calendar_event_id,
              technicianEmail: technician.email,
              technicianName: schedule.technician_name || technician.full_name,
              customerName: ticketData.customer_name,
              scheduledDate: schedule.scheduled_date,
              startTime: schedule.scheduled_time_start,
              scheduleId: schedule.id
            });
            console.log('[WeeklyPlanning] Calendar event cancelled');
          } catch (emailErr) {
            console.warn('[WeeklyPlanning] Failed to cancel calendar event:', emailErr);
            // Continue anyway
          }
        }
      }

      // Delete the schedule (this returns the ticket to unscheduled status)
      await serviceScheduleService.remove(scheduleId);
      console.log('[WeeklyPlanning] Ticket unscheduled:', scheduleId);

      // Update ticket status back to triaged
      if (ticketData.id) {
        await serviceTicketService.update(ticketData.id, { status: 'triaged' });
      }

      // Refresh to update the view
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to unschedule ticket:', err);
      setError('Failed to unschedule ticket');
    }
  };

  // Handle assigning a technician to a ticket from the panel
  // For scheduled tickets, also updates the schedule's technician
  const handleAssignTechnician = async (ticketId, techId, techName, scheduleId = null) => {
    try {
      // Update the ticket assignment
      await serviceTicketService.update(ticketId, {
        assigned_to: techId,
        assigned_to_name: techName || null
      });

      // If this is a scheduled ticket, also update the schedule's technician
      if (scheduleId) {
        const schedule = allScheduledTickets.find(s => s.id === scheduleId);
        if (schedule) {
          await weeklyPlanningService.moveSchedule(
            scheduleId,
            schedule.scheduled_date,
            schedule.scheduled_time_start,
            techId,
            techName
          );
        }
      }

      console.log('[WeeklyPlanning] Technician assigned:', { ticketId, techId, techName, scheduleId });
      // Refresh the ticket list
      await handleRefresh();
    } catch (err) {
      console.error('[WeeklyPlanning] Failed to assign technician:', err);
      setError('Failed to assign technician');
    }
  };

  // Open full ticket page in new tab
  const handleOpenTicketFullPage = (ticketId) => {
    window.open(`/service/tickets/${ticketId}`, '_blank');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900">
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
    <div className={`min-h-screen bg-zinc-900 flex flex-col ${isEmbedded ? 'h-screen' : '-mt-4 sm:-mt-6'}`}>

      {/* Header / Filter Bar */}
      <TechnicianFilterBar
        technicians={technicians}
        selectedTechnician={selectedTechnician}
        onTechnicianChange={handleTechnicianChange}
        loadingTechnicians={loadingTechnicians}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          // When switching to 'all', clear technician filter to show all schedules
          if (mode === 'all') {
            setSelectedTechnician(null);
          }
        }}
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
        {/* Tickets panel (left sidebar) - shows both unscheduled and scheduled */}
        <div className="w-[240px] flex-shrink-0">
          <UnscheduledTicketsPanel
            tickets={unscheduledTickets}
            scheduledTickets={allScheduledTickets}
            technicians={technicians}
            selectedTechnician={selectedTechnician}
            onOpenTicket={handleOpenTicket}
            onAssignTechnician={handleAssignTechnician}
            onUnschedule={handleUnschedule}
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
            onScheduleCommit={handleCommitSchedule}
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
              <ul className="space-y-2">
                {conflictModal.conflicts.map((conflict, idx) => (
                  <li key={idx} className="text-sm">
                    <div className="text-amber-400">
                      {conflict.title || conflict.subject || 'Busy'}: {conflict.start} - {conflict.end}
                    </div>
                    {conflict.id && (
                      <button
                        onClick={async () => {
                          if (window.confirm('Delete this conflicting schedule?')) {
                            try {
                              await weeklyPlanningService.deleteSchedule(conflict.id);
                              conflictModal.onCancel();
                              handleRefresh();
                            } catch (err) {
                              console.error('Failed to delete schedule:', err);
                            }
                          }
                        }}
                        className="text-xs text-red-400 hover:text-red-300 underline mt-1"
                      >
                        Delete this schedule
                      </button>
                    )}
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

              {/* Assignment Section - for unscheduled tickets */}
              {!ticketDetailModal.schedule && (
                <div className="bg-zinc-700/50 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <User size={14} />
                    Assignment
                  </h5>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">Assigned Technician</label>
                    <TechnicianDropdown
                      value={ticketDetailModal.ticket?.assigned_to || ''}
                      selectedName={ticketDetailModal.ticket?.assigned_to_name}
                      selectedColor={ticketDetailModal.ticket?.assigned_to_avatar_color}
                      category={ticketDetailModal.ticket?.category || 'general'}
                      onChange={async (newTechId, techName, avatarColor) => {
                        if (ticketDetailModal.ticket?.id) {
                          try {
                            await serviceTicketService.update(ticketDetailModal.ticket.id, {
                              assigned_to: newTechId || null,
                              status: newTechId ? 'triaged' : ticketDetailModal.ticket.status
                            });
                            // Update the modal state with new technician info including avatar color
                            setTicketDetailModal(prev => ({
                              ...prev,
                              ticket: {
                                ...prev.ticket,
                                assigned_to: newTechId,
                                assigned_to_name: techName || null,
                                assigned_to_avatar_color: avatarColor || null
                              }
                            }));
                            // Refresh the panels
                            await handleRefresh();
                          } catch (err) {
                            console.error('[WeeklyPlanning] Failed to assign technician:', err);
                            setError('Failed to assign technician');
                          }
                        }
                      }}
                      size="md"
                      placeholder="Select Technician"
                    />
                    {!ticketDetailModal.ticket?.assigned_to && (
                      <p className="text-xs text-amber-400 mt-2">
                        Assign a technician before scheduling this ticket
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Schedule Info - for scheduled tickets */}
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
                      <TechnicianDropdown
                        value={ticketDetailModal.schedule.technician_id || ''}
                        selectedName={ticketDetailModal.schedule.technician_name}
                        selectedColor={ticketDetailModal.schedule.technician_avatar_color}
                        category={ticketDetailModal.ticket?.category || 'general'}
                        onChange={async (newTechId, techName, avatarColor) => {
                          if (newTechId && ticketDetailModal.schedule?.id) {
                            try {
                              await weeklyPlanningService.moveSchedule(
                                ticketDetailModal.schedule.id,
                                ticketDetailModal.schedule.scheduled_date,
                                ticketDetailModal.schedule.scheduled_time_start,
                                newTechId,
                                techName
                              );
                              // Update the modal state with new technician info including avatar color
                              setTicketDetailModal(prev => ({
                                ...prev,
                                schedule: {
                                  ...prev.schedule,
                                  technician_id: newTechId,
                                  technician_name: techName,
                                  technician_avatar_color: avatarColor
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
                        size="md"
                        placeholder="Select Technician"
                        showUnassignOption={false}
                      />
                    </div>

                    {/* Schedule Status */}
                    <div className="md:col-span-2">
                      <label className="text-xs text-zinc-400 block mb-1">Status</label>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={
                            ticketDetailModal.schedule.schedule_status === 'draft' ? { backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#A78BFA' } :
                            ticketDetailModal.schedule.schedule_status === 'pending_tech' ? { backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24' } :
                            ticketDetailModal.schedule.schedule_status === 'tech_accepted' ? { backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA' } :
                            ticketDetailModal.schedule.schedule_status === 'pending_customer' ? { backgroundColor: 'rgba(6, 182, 212, 0.2)', color: '#22D3EE' } :
                            ticketDetailModal.schedule.schedule_status === 'confirmed' ? { backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' } :
                            { backgroundColor: 'rgba(113, 113, 122, 0.2)', color: '#A1A1AA' }
                          }
                        >
                          {ticketDetailModal.schedule.schedule_status === 'draft' ? 'Draft' :
                           ticketDetailModal.schedule.schedule_status === 'pending_tech' ? 'Awaiting Tech' :
                           ticketDetailModal.schedule.schedule_status === 'tech_accepted' ? 'Tech Accepted' :
                           ticketDetailModal.schedule.schedule_status === 'pending_customer' ? 'Awaiting Customer' :
                           ticketDetailModal.schedule.schedule_status === 'confirmed' ? 'Confirmed' :
                           ticketDetailModal.schedule.schedule_status || 'Unknown'}
                        </span>
                      </div>
                    </div>

                    {/* Schedule Actions */}
                    <div className="md:col-span-2 pt-2 border-t border-zinc-600 mt-2">
                      <label className="text-xs text-zinc-400 block mb-2">Actions</label>
                      <div className="flex flex-wrap gap-2">
                        {/* Send Customer Invite - only when tech_accepted */}
                        {ticketDetailModal.schedule.schedule_status === 'tech_accepted' && (
                          <button
                            onClick={() => handleSendCustomerInvite(ticketDetailModal.schedule)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors text-white text-sm"
                          >
                            <Send size={14} />
                            Send Customer Invite
                          </button>
                        )}
                        {/* Mark Customer Confirmed - when tech_accepted or pending_customer */}
                        {(ticketDetailModal.schedule.schedule_status === 'tech_accepted' ||
                          ticketDetailModal.schedule.schedule_status === 'pending_customer') && (
                          <button
                            onClick={() => handleMarkCustomerConfirmed(ticketDetailModal.schedule)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-white text-sm"
                            style={{ backgroundColor: brandColors.success }}
                          >
                            <CheckCircle size={14} />
                            Mark Customer Confirmed
                          </button>
                        )}
                        {/* Reset to Draft - only for non-draft schedules */}
                        {ticketDetailModal.schedule.schedule_status !== 'draft' && (
                          <button
                            onClick={() => handleResetToDraft(ticketDetailModal.schedule)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors text-white text-sm"
                          >
                            <Edit3 size={14} />
                            Reset to Draft
                          </button>
                        )}
                        {/* Remove from Schedule */}
                        <button
                          onClick={() => handleRemoveSchedule(ticketDetailModal.schedule)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 transition-colors text-white text-sm"
                        >
                          <Trash2 size={14} />
                          Remove from Schedule
                        </button>
                      </div>
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
