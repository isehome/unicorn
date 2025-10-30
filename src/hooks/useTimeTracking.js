import { useState, useEffect, useCallback } from 'react';
import { timeLogsService } from '../services/supabaseService';

/**
 * Custom hook for managing time tracking (check-in/check-out) functionality.
 *
 * Features:
 * - Check-in/check-out to projects
 * - localStorage fallback for offline operation
 * - Loading state management
 * - Persistent check-in status across page reloads
 */
export const useTimeTracking = (projects, userId) => {
  const [checkedInProjects, setCheckedInProjects] = useState(new Set());
  const [loadingActions, setLoadingActions] = useState(new Set());

  // Load checked-in status for all projects on mount
  useEffect(() => {
    const loadCheckInStatus = async () => {
      if (!projects || !userId) return;

      const checkedIn = new Set();

      // First check local storage
      const localCheckIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      Object.keys(localCheckIns).forEach(projectId => {
        if (localCheckIns[projectId].user === userId) {
          checkedIn.add(projectId);
        }
      });

      // Then try to check database
      for (const project of projects) {
        if (!checkedIn.has(project.id)) {
          try {
            const session = await timeLogsService.getActiveSession(project.id, userId);
            if (session) {
              checkedIn.add(project.id);
            }
          } catch (error) {
            // Silently fail, we have local storage as backup
          }
        }
      }
      setCheckedInProjects(checkedIn);
    };

    loadCheckInStatus();
  }, [projects, userId]);

  // Check-in handler with localStorage fallback for offline support
  const handleCheckIn = useCallback(async (e, projectId) => {
    e.stopPropagation();
    if (loadingActions.has(projectId)) return;

    setLoadingActions(prev => new Set(prev).add(projectId));
    try {
      const result = await timeLogsService.checkIn(projectId, userId);
      if (result.success) {
        setCheckedInProjects(prev => new Set(prev).add(projectId));
        // Store locally as backup
        const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
        checkIns[projectId] = {
          user: userId,
          checkIn: new Date().toISOString(),
          projectName: projects?.find(p => p.id === projectId)?.name
        };
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
      } else if (result.message?.includes('metadata')) {
        // Fallback to local storage if database doesn't support metadata
        setCheckedInProjects(prev => new Set(prev).add(projectId));
        const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
        checkIns[projectId] = {
          user: userId,
          checkIn: new Date().toISOString(),
          projectName: projects?.find(p => p.id === projectId)?.name
        };
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
      } else {
        alert(result.message || 'Failed to check in');
      }
    } catch (error) {
      console.error('Check-in failed:', error);
      // Fallback to local storage
      setCheckedInProjects(prev => new Set(prev).add(projectId));
      const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      checkIns[projectId] = {
        user: userId,
        checkIn: new Date().toISOString(),
        projectName: projects?.find(p => p.id === projectId)?.name
      };
      localStorage.setItem('project_checkins', JSON.stringify(checkIns));
      console.log('Check-in saved locally due to database issue');
    } finally {
      setLoadingActions(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [userId, loadingActions, projects]);

  // Check-out handler with localStorage fallback for offline support
  const handleCheckOut = useCallback(async (e, projectId) => {
    e.stopPropagation();
    if (loadingActions.has(projectId)) return;

    setLoadingActions(prev => new Set(prev).add(projectId));
    try {
      const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      // const checkInTime = checkIns[projectId]?.checkIn; // TODO: Use for time tracking display

      const result = await timeLogsService.checkOut(projectId, userId);
      if (result.success) {
        setCheckedInProjects(prev => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
        // Remove from local storage
        delete checkIns[projectId];
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
        // TODO: Calculate and show time spent to user (duration from checkInTime to now)
      } else if (result.message?.includes('metadata') || result.message?.includes('No active')) {
        // Fallback to local storage
        setCheckedInProjects(prev => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
        delete checkIns[projectId];
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
        // TODO: Calculate and show time spent to user (duration from checkInTime to now)
      } else {
        alert(result.message || 'Failed to check out');
      }
    } catch (error) {
      console.error('Check-out failed:', error);
      // Fallback to local storage
      const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      setCheckedInProjects(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      delete checkIns[projectId];
      localStorage.setItem('project_checkins', JSON.stringify(checkIns));
      console.log('Check-out saved locally due to database issue');
    } finally {
      setLoadingActions(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [userId, loadingActions]);

  return {
    checkedInProjects,
    loadingActions,
    handleCheckIn,
    handleCheckOut
  };
};
