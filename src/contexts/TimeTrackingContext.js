/**
 * TimeTrackingContext.js
 * Global context for managing active time tracking sessions across the app
 *
 * Features:
 * - Monitors all active check-ins (service tickets & projects)
 * - Updates browser tab title to show running timer
 * - Auto-stops timers at 6:00 PM to prevent bad data
 * - Provides global visibility of timer status
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { serviceTimeService } from '../services/serviceTimeService';
import { timeLogsService } from '../services/supabaseService';

const TimeTrackingContext = createContext(null);

// localStorage keys
const SERVICE_CHECKINS_KEY = 'service_time_checkins';
const PROJECT_CHECKINS_KEY = 'project_checkins';

// Auto-stop configuration
const AUTO_STOP_HOUR = 18; // 6:00 PM in 24-hour format
const AUTO_STOP_MINUTE = 0;

/**
 * Get stored service check-ins from localStorage
 */
const getStoredServiceCheckIns = () => {
  try {
    const stored = localStorage.getItem(SERVICE_CHECKINS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

/**
 * Get stored project check-ins from localStorage
 */
const getStoredProjectCheckIns = () => {
  try {
    const stored = localStorage.getItem(PROJECT_CHECKINS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

/**
 * Save service check-ins to localStorage
 */
const saveServiceCheckIns = (checkIns) => {
  try {
    localStorage.setItem(SERVICE_CHECKINS_KEY, JSON.stringify(checkIns));
  } catch (err) {
    console.warn('[TimeTrackingContext] Failed to save service check-ins:', err);
  }
};

/**
 * Save project check-ins to localStorage
 */
const saveProjectCheckIns = (checkIns) => {
  try {
    localStorage.setItem(PROJECT_CHECKINS_KEY, JSON.stringify(checkIns));
  } catch (err) {
    console.warn('[TimeTrackingContext] Failed to save project check-ins:', err);
  }
};

/**
 * Format elapsed time as HH:MM:SS
 */
const formatElapsedTime = (startTime) => {
  if (!startTime) return '00:00:00';
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Check if current time is past auto-stop time (6:00 PM)
 */
const isPastAutoStopTime = () => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  return hour > AUTO_STOP_HOUR || (hour === AUTO_STOP_HOUR && minute >= AUTO_STOP_MINUTE);
};

/**
 * Get milliseconds until 6:00 PM today (or tomorrow if already past)
 */
const getMsUntilAutoStop = () => {
  const now = new Date();
  const autoStopTime = new Date(now);
  autoStopTime.setHours(AUTO_STOP_HOUR, AUTO_STOP_MINUTE, 0, 0);

  // If we're past 6 PM, set to tomorrow
  if (now >= autoStopTime) {
    autoStopTime.setDate(autoStopTime.getDate() + 1);
  }

  return autoStopTime - now;
};

export const TimeTrackingProvider = ({ children, user }) => {
  const [activeServiceCheckIns, setActiveServiceCheckIns] = useState({});
  const [activeProjectCheckIns, setActiveProjectCheckIns] = useState({});
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [longestRunningTimer, setLongestRunningTimer] = useState(null);
  const [formattedTime, setFormattedTime] = useState('00:00:00');
  const [autoStopTriggered, setAutoStopTriggered] = useState(false);

  const timerIntervalRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);
  const originalTitleRef = useRef(document.title);

  const userEmail = user?.email;
  const userId = user?.id;
  const userName = user?.name || user?.full_name || user?.email;

  /**
   * Load active check-ins from localStorage
   */
  const loadCheckIns = useCallback(() => {
    const serviceCheckIns = getStoredServiceCheckIns();
    const projectCheckIns = getStoredProjectCheckIns();

    // Filter to only user's check-ins
    const userServiceCheckIns = {};
    const userProjectCheckIns = {};

    Object.entries(serviceCheckIns).forEach(([ticketId, data]) => {
      if (data.user === userEmail) {
        userServiceCheckIns[ticketId] = data;
      }
    });

    Object.entries(projectCheckIns).forEach(([projectId, data]) => {
      if (data.user === userId) {
        userProjectCheckIns[projectId] = data;
      }
    });

    setActiveServiceCheckIns(userServiceCheckIns);
    setActiveProjectCheckIns(userProjectCheckIns);
  }, [userEmail, userId]);

  /**
   * Find the longest running timer
   */
  const findLongestRunningTimer = useCallback(() => {
    let oldest = null;
    let oldestTime = null;
    let oldestType = null;
    let oldestId = null;
    let oldestName = null;

    // Check service check-ins
    Object.entries(activeServiceCheckIns).forEach(([ticketId, data]) => {
      const checkInTime = new Date(data.checkIn);
      if (!oldestTime || checkInTime < oldestTime) {
        oldestTime = checkInTime;
        oldest = data;
        oldestType = 'service';
        oldestId = ticketId;
        oldestName = data.ticketTitle || `Ticket ${ticketId.slice(0, 8)}`;
      }
    });

    // Check project check-ins
    Object.entries(activeProjectCheckIns).forEach(([projectId, data]) => {
      const checkInTime = new Date(data.checkIn);
      if (!oldestTime || checkInTime < oldestTime) {
        oldestTime = checkInTime;
        oldest = data;
        oldestType = 'project';
        oldestId = projectId;
        oldestName = data.projectName || `Project ${projectId.slice(0, 8)}`;
      }
    });

    if (oldest) {
      return {
        ...oldest,
        type: oldestType,
        id: oldestId,
        name: oldestName,
        checkInTime: oldestTime
      };
    }
    return null;
  }, [activeServiceCheckIns, activeProjectCheckIns]);

  /**
   * Auto-checkout all active sessions
   */
  const autoCheckoutAll = useCallback(async (reason = 'Auto-checkout at 6:00 PM') => {
    console.log('[TimeTrackingContext] Auto-checkout triggered:', reason);

    // Checkout all service tickets
    for (const [ticketId, data] of Object.entries(activeServiceCheckIns)) {
      try {
        await serviceTimeService.checkOut(ticketId, data.user, `[Auto] ${reason}`);
        console.log(`[TimeTrackingContext] Auto-checked out from service ticket: ${ticketId}`);
      } catch (err) {
        console.error(`[TimeTrackingContext] Failed to auto-checkout service ticket ${ticketId}:`, err);
      }
    }

    // Checkout all projects
    for (const [projectId, data] of Object.entries(activeProjectCheckIns)) {
      try {
        await timeLogsService.checkOut(projectId, data.user);
        console.log(`[TimeTrackingContext] Auto-checked out from project: ${projectId}`);
      } catch (err) {
        console.error(`[TimeTrackingContext] Failed to auto-checkout project ${projectId}:`, err);
      }
    }

    // Clear localStorage
    const serviceCheckIns = getStoredServiceCheckIns();
    const projectCheckIns = getStoredProjectCheckIns();

    Object.keys(activeServiceCheckIns).forEach(ticketId => {
      delete serviceCheckIns[ticketId];
    });
    Object.keys(activeProjectCheckIns).forEach(projectId => {
      delete projectCheckIns[projectId];
    });

    saveServiceCheckIns(serviceCheckIns);
    saveProjectCheckIns(projectCheckIns);

    // Clear state
    setActiveServiceCheckIns({});
    setActiveProjectCheckIns({});
    setAutoStopTriggered(true);
  }, [activeServiceCheckIns, activeProjectCheckIns]);

  /**
   * Schedule auto-stop at 6:00 PM
   */
  const scheduleAutoStop = useCallback(() => {
    // Clear existing timeout
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
    }

    // If already past 6 PM and there are active timers, trigger auto-stop
    if (isPastAutoStopTime() && isTimerRunning && !autoStopTriggered) {
      autoCheckoutAll('Auto-checkout - timer was running past 6:00 PM');
      return;
    }

    // Schedule for 6:00 PM
    const msUntilAutoStop = getMsUntilAutoStop();
    console.log(`[TimeTrackingContext] Scheduling auto-stop in ${Math.round(msUntilAutoStop / 60000)} minutes`);

    autoStopTimeoutRef.current = setTimeout(() => {
      if (isTimerRunning) {
        autoCheckoutAll('Automatic 6:00 PM checkout');
      }
      // Reset for next day
      setAutoStopTriggered(false);
      scheduleAutoStop();
    }, msUntilAutoStop);
  }, [autoCheckoutAll, isTimerRunning, autoStopTriggered]);

  /**
   * Update browser title with timer
   */
  const updateBrowserTitle = useCallback((timer) => {
    if (timer && timer.checkInTime) {
      const elapsed = formatElapsedTime(timer.checkInTime);
      setFormattedTime(elapsed);
      document.title = `⏱️ ${elapsed} - Unicorn`;
    } else {
      document.title = originalTitleRef.current || 'Unicorn';
      setFormattedTime('00:00:00');
    }
  }, []);

  /**
   * Start timer interval
   */
  const startTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    timerIntervalRef.current = setInterval(() => {
      const longest = findLongestRunningTimer();
      setLongestRunningTimer(longest);
      updateBrowserTitle(longest);
    }, 1000);
  }, [findLongestRunningTimer, updateBrowserTitle]);

  /**
   * Stop timer interval
   */
  const stopTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    document.title = originalTitleRef.current || 'Unicorn';
    setFormattedTime('00:00:00');
    setLongestRunningTimer(null);
  }, []);

  /**
   * Manually trigger refresh of check-ins
   */
  const refreshCheckIns = useCallback(() => {
    loadCheckIns();
  }, [loadCheckIns]);

  /**
   * Register a new check-in (called by time tracking hooks)
   */
  const registerCheckIn = useCallback((type, id, data) => {
    if (type === 'service') {
      setActiveServiceCheckIns(prev => ({
        ...prev,
        [id]: { ...data, user: userEmail }
      }));
    } else if (type === 'project') {
      setActiveProjectCheckIns(prev => ({
        ...prev,
        [id]: { ...data, user: userId }
      }));
    }
  }, [userEmail, userId]);

  /**
   * Unregister a check-out (called by time tracking hooks)
   */
  const unregisterCheckIn = useCallback((type, id) => {
    if (type === 'service') {
      setActiveServiceCheckIns(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else if (type === 'project') {
      setActiveProjectCheckIns(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  // Load check-ins on mount and when user changes
  useEffect(() => {
    if (userEmail || userId) {
      loadCheckIns();
    }
  }, [userEmail, userId, loadCheckIns]);

  // Update timer running state when check-ins change
  useEffect(() => {
    const hasActiveTimers =
      Object.keys(activeServiceCheckIns).length > 0 ||
      Object.keys(activeProjectCheckIns).length > 0;

    setIsTimerRunning(hasActiveTimers);

    if (hasActiveTimers) {
      startTimerInterval();
      const longest = findLongestRunningTimer();
      setLongestRunningTimer(longest);
    } else {
      stopTimerInterval();
    }
  }, [activeServiceCheckIns, activeProjectCheckIns, findLongestRunningTimer, startTimerInterval, stopTimerInterval]);

  // Schedule auto-stop when timer state changes
  useEffect(() => {
    if (isTimerRunning) {
      scheduleAutoStop();
    }
    return () => {
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
    };
  }, [isTimerRunning, scheduleAutoStop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimerInterval();
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
      document.title = originalTitleRef.current || 'Unicorn';
    };
  }, [stopTimerInterval]);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === SERVICE_CHECKINS_KEY || e.key === PROJECT_CHECKINS_KEY) {
        loadCheckIns();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadCheckIns]);

  const value = {
    // State
    isTimerRunning,
    activeServiceCheckIns,
    activeProjectCheckIns,
    longestRunningTimer,
    formattedTime,
    autoStopTriggered,

    // Counts
    activeServiceCount: Object.keys(activeServiceCheckIns).length,
    activeProjectCount: Object.keys(activeProjectCheckIns).length,
    totalActiveCount: Object.keys(activeServiceCheckIns).length + Object.keys(activeProjectCheckIns).length,

    // Actions
    refreshCheckIns,
    registerCheckIn,
    unregisterCheckIn,
    autoCheckoutAll,

    // Helpers
    formatElapsedTime
  };

  return (
    <TimeTrackingContext.Provider value={value}>
      {children}
    </TimeTrackingContext.Provider>
  );
};

export const useTimeTrackingContext = () => {
  const context = useContext(TimeTrackingContext);
  if (!context) {
    // Return a default object if context is not available
    // This allows components to work even when not wrapped in provider
    return {
      isTimerRunning: false,
      activeServiceCheckIns: {},
      activeProjectCheckIns: {},
      longestRunningTimer: null,
      formattedTime: '00:00:00',
      autoStopTriggered: false,
      activeServiceCount: 0,
      activeProjectCount: 0,
      totalActiveCount: 0,
      refreshCheckIns: () => {},
      registerCheckIn: () => {},
      unregisterCheckIn: () => {},
      autoCheckoutAll: () => {},
      formatElapsedTime: () => '00:00:00'
    };
  }
  return context;
};

export default TimeTrackingContext;
