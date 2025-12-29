/**
 * useServiceTimeTracking.js
 * React hook for managing service ticket time tracking
 * Handles check-in/check-out state and elapsed time display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { serviceTimeService } from '../services/serviceTimeService';

const STORAGE_KEY = 'service_time_checkins';

/**
 * Get stored check-ins from localStorage (fallback for offline)
 */
const getStoredCheckIns = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

/**
 * Save check-ins to localStorage
 */
const saveStoredCheckIns = (checkIns) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkIns));
  } catch (err) {
    console.warn('[useServiceTimeTracking] Failed to save to localStorage:', err);
  }
};

/**
 * Format elapsed time as HH:MM:SS
 */
export const formatElapsedTime = (minutes) => {
  if (!minutes && minutes !== 0) return '--:--:--';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes * 60) % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format elapsed time as human readable (e.g., "2h 30m")
 */
export const formatElapsedTimeHuman = (minutes) => {
  if (!minutes && minutes !== 0) return '--';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
};

/**
 * Hook for tracking time on a single service ticket
 */
export const useServiceTimeTracking = (ticketId, user) => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeLogs, setTimeLogs] = useState([]);
  const [timeSummary, setTimeSummary] = useState([]);
  const timerRef = useRef(null);

  const userEmail = user?.email;
  const userName = user?.name || user?.full_name || user?.email;
  const userId = user?.id;

  /**
   * Calculate elapsed minutes from check-in time
   */
  const calculateElapsed = useCallback((checkInTime) => {
    if (!checkInTime) return 0;
    const checkIn = new Date(checkInTime);
    const now = new Date();
    return (now - checkIn) / 60000; // Convert ms to minutes
  }, []);

  /**
   * Start the elapsed time timer
   */
  const startTimer = useCallback((checkInTime) => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Update every second
    timerRef.current = setInterval(() => {
      setElapsedMinutes(calculateElapsed(checkInTime));
    }, 1000);
  }, [calculateElapsed]);

  /**
   * Stop the elapsed time timer
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Load active session and time logs
   */
  const loadTimeData = useCallback(async () => {
    if (!ticketId || !userEmail) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch active session, time logs, and summary in parallel
      const [session, logs, summary] = await Promise.all([
        serviceTimeService.getActiveSession(ticketId, userEmail),
        serviceTimeService.getTimeLogsForTicket(ticketId),
        serviceTimeService.getTicketTimeSummary(ticketId)
      ]);

      setTimeLogs(logs);
      setTimeSummary(summary);

      if (session) {
        setIsCheckedIn(true);
        setActiveSession(session);
        setElapsedMinutes(calculateElapsed(session.check_in));
        startTimer(session.check_in);

        // Update localStorage
        const stored = getStoredCheckIns();
        stored[ticketId] = {
          user: userEmail,
          checkIn: session.check_in,
          sessionId: session.id
        };
        saveStoredCheckIns(stored);
      } else {
        setIsCheckedIn(false);
        setActiveSession(null);
        setElapsedMinutes(0);
        stopTimer();

        // Clear from localStorage
        const stored = getStoredCheckIns();
        delete stored[ticketId];
        saveStoredCheckIns(stored);
      }
    } catch (err) {
      console.error('[useServiceTimeTracking] Load error:', err);
      setError(err.message);

      // Try localStorage fallback
      const stored = getStoredCheckIns();
      if (stored[ticketId]?.user === userEmail) {
        setIsCheckedIn(true);
        setElapsedMinutes(calculateElapsed(stored[ticketId].checkIn));
        startTimer(stored[ticketId].checkIn);
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId, userEmail, calculateElapsed, startTimer, stopTimer]);

  /**
   * Check in to the ticket
   */
  const checkIn = useCallback(async () => {
    if (!ticketId || !userEmail) {
      setError('Missing ticket ID or user email');
      return false;
    }

    try {
      setError(null);
      const result = await serviceTimeService.checkIn(ticketId, userEmail, userName, userId);

      if (result.success) {
        const checkInTime = new Date().toISOString();
        setIsCheckedIn(true);
        setActiveSession({ id: result.sessionId, check_in: checkInTime });
        setElapsedMinutes(0);
        startTimer(checkInTime);

        // Update localStorage
        const stored = getStoredCheckIns();
        stored[ticketId] = {
          user: userEmail,
          checkIn: checkInTime,
          sessionId: result.sessionId
        };
        saveStoredCheckIns(stored);

        // Reload time data to get updated logs
        await loadTimeData();
        return true;
      }
    } catch (err) {
      console.error('[useServiceTimeTracking] Check-in error:', err);
      setError(err.message);
    }
    return false;
  }, [ticketId, userEmail, userName, userId, startTimer, loadTimeData]);

  /**
   * Check out from the ticket
   */
  const checkOut = useCallback(async (notes = null) => {
    if (!ticketId || !userEmail) {
      setError('Missing ticket ID or user email');
      return false;
    }

    try {
      setError(null);
      const result = await serviceTimeService.checkOut(ticketId, userEmail, notes);

      if (result.success) {
        setIsCheckedIn(false);
        setActiveSession(null);
        stopTimer();
        setElapsedMinutes(0);

        // Clear from localStorage
        const stored = getStoredCheckIns();
        delete stored[ticketId];
        saveStoredCheckIns(stored);

        // Reload time data to get updated logs
        await loadTimeData();
        return true;
      }
    } catch (err) {
      console.error('[useServiceTimeTracking] Check-out error:', err);
      setError(err.message);
    }
    return false;
  }, [ticketId, userEmail, stopTimer, loadTimeData]);

  /**
   * Refresh time data
   */
  const refresh = useCallback(() => {
    return loadTimeData();
  }, [loadTimeData]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadTimeData();

    return () => {
      stopTimer();
    };
  }, [loadTimeData, stopTimer]);

  // Calculate total hours across all technicians
  const totalHours = timeSummary.reduce((sum, tech) => sum + (tech.total_hours || 0), 0);
  const totalMinutes = timeSummary.reduce((sum, tech) => sum + (tech.total_minutes || 0), 0);

  return {
    // State
    isCheckedIn,
    activeSession,
    elapsedMinutes,
    loading,
    error,
    timeLogs,
    timeSummary,
    totalHours,
    totalMinutes,

    // Actions
    checkIn,
    checkOut,
    refresh,

    // Helpers
    formatElapsedTime,
    formatElapsedTimeHuman
  };
};

/**
 * Hook for managing multiple service ticket check-ins
 * (For technician dashboard showing all tickets)
 */
export const useServiceTimeTrackingMultiple = (user) => {
  const [checkedInTickets, setCheckedInTickets] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const userEmail = user?.email;

  // Load checked-in tickets from localStorage on mount
  useEffect(() => {
    setLoading(true);
    const stored = getStoredCheckIns();
    const ticketIds = Object.entries(stored)
      .filter(([, data]) => data.user === userEmail)
      .map(([ticketId]) => ticketId);
    setCheckedInTickets(new Set(ticketIds));
    setLoading(false);
  }, [userEmail]);

  const isCheckedIn = useCallback((ticketId) => {
    return checkedInTickets.has(ticketId);
  }, [checkedInTickets]);

  const updateCheckedIn = useCallback((ticketId, isCheckedIn) => {
    setCheckedInTickets(prev => {
      const next = new Set(prev);
      if (isCheckedIn) {
        next.add(ticketId);
      } else {
        next.delete(ticketId);
      }
      return next;
    });
  }, []);

  return {
    checkedInTickets,
    isCheckedIn,
    updateCheckedIn,
    loading
  };
};

export default useServiceTimeTracking;
