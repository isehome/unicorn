import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useProjects, useIssues } from '../hooks/useSupabase';
import { fetchTodayEvents } from '../services/microsoftCalendarService';
import { projectStakeholdersService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import { ListTodo, AlertTriangle, Loader, Calendar } from 'lucide-react';

const TechnicianDashboard = React.memo(() => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const { login, user } = useAuth();
  
  const { projects, loading: projectsLoading } = useProjects();
  const { loading: issuesLoading } = useIssues();

  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [showMyProjects, setShowMyProjects] = useState(() => {
    const saved = localStorage.getItem('dashboard-show-my-projects');
    if (saved === 'true' || saved === 'false') return saved === 'true';
    return true; // default to My Projects on first load
  });
  const [myProjectIds, setMyProjectIds] = useState([]);
  const [myProjectsLoading, setMyProjectsLoading] = useState(false);
  const [myProjectsError, setMyProjectsError] = useState('');
  
  // Use refs to prevent unnecessary re-renders
  const calendarLoadingRef = useRef(false);
  const projectsLoadingRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef(null);

  const formatEventTime = useCallback((start, end) => {
    try {
      const options = { hour: 'numeric', minute: '2-digit' };
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (startDate && endDate) {
        return `${startDate.toLocaleTimeString([], options)} – ${endDate.toLocaleTimeString([], options)}`;
      }
      if (startDate) {
        return startDate.toLocaleTimeString([], options);
      }
      return 'All day';
    } catch (error) {
      console.warn('Failed to format calendar time', error);
      return 'All day';
    }
  }, []);

  const loadCalendarEvents = useCallback(async (isRetry = false) => {
    // Prevent concurrent calendar loads
    if (calendarLoadingRef.current && !isRetry) {
      return;
    }
    
    calendarLoadingRef.current = true;
    
    try {
      setCalendarLoading(true);
      setCalendarError('');
      
      const result = await fetchTodayEvents();
      
      if (!mountedRef.current) return;
      
      setCalendarConnected(Boolean(result.connected));
      setCalendarEvents(result.events || []);
      
      if (result.error) {
        setCalendarError(result.error);
      }
    } catch (error) {
      console.error('Failed to load calendar events', error);
      if (mountedRef.current) {
        setCalendarError(error.message || 'Unable to load calendar events.');
      }
    } finally {
      if (mountedRef.current) {
        setCalendarLoading(false);
        calendarLoadingRef.current = false;
      }
    }
  }, []);

  // Debounced calendar refresh
  const handleCalendarRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    refreshTimeoutRef.current = setTimeout(() => {
      loadCalendarEvents(true);
    }, 300);
  }, [loadCalendarEvents]);

  // Load calendar events only once on mount or user change
  useEffect(() => {
    if (user?.id) {
      loadCalendarEvents();
    }
  }, [user?.id]); // Only depend on user ID, not the entire loadCalendarEvents function

  // Load user projects with proper cleanup
  useEffect(() => {
    let isCancelled = false;
    
    const loadMyProjects = async () => {
      // Debug logging
      console.log('TechnicianDashboard loadMyProjects:', {
        userEmail: user?.email,
        userId: user?.id,
        userObject: user
      });
      
      if (!user?.email) {
        console.log('Skipping loadMyProjects - no email');
        setMyProjectIds([]);
        return;
      }

      try {
        setMyProjectsLoading(true);
        setMyProjectsError('');
        
        console.log('Calling getInternalProjectIdsByEmail with:', user.email);
        const ids = await projectStakeholdersService.getInternalProjectIdsByEmail(user.email);
        console.log('Got project IDs:', ids);
        
        if (!isCancelled && mountedRef.current) {
          setMyProjectIds(ids);
        }
      } catch (error) {
        console.error('Failed to load user projects', error);
        if (!isCancelled && mountedRef.current) {
          setMyProjectsError(error.message || 'Unable to load your projects.');
          setMyProjectIds([]);
        }
      } finally {
        if (!isCancelled && mountedRef.current) {
          setMyProjectsLoading(false);
        }
      }
    };

    // Reset the loading ref when email changes
    projectsLoadingRef.current = false;
    loadMyProjects();
    
    return () => {
      isCancelled = true;
      projectsLoadingRef.current = false;
    };
  }, [user?.email]);

  const handleConnectCalendar = useCallback(async () => {
    try {
      await login();
    } catch (error) {
      console.error('Calendar connection failed', error);
      setCalendarError(error.message || 'Unable to connect calendar.');
    }
  }, [login]);

  // My-projects counts for Todos and Issues with memoization
  const [todoCounts, setTodoCounts] = useState({ open: 0, total: 0, loading: true });
  const [issueCounts, setIssueCounts] = useState({ open: 0, blocked: 0, total: 0, loading: true });
  
  // Memoize the project IDs to avoid unnecessary effect triggers
  const projectIdsKey = useMemo(() => myProjectIds.join(','), [myProjectIds]);
  
  useEffect(() => {
    let isCancelled = false;
    
    const loadMyCounts = async () => {
      if (!Array.isArray(myProjectIds) || myProjectIds.length === 0) {
        if (!isCancelled) {
          setTodoCounts({ open: 0, total: 0, loading: false });
          setIssueCounts({ open: 0, blocked: 0, total: 0, loading: false });
        }
        return;
      }
      
      try {
        // Batch state updates
        setTodoCounts(prev => ({ ...prev, loading: true }));
        setIssueCounts(prev => ({ ...prev, loading: true }));
        
        const [todosRes, issuesRes] = await Promise.all([
          supabase.from('project_todos').select('id,is_complete,project_id').in('project_id', myProjectIds),
          supabase.from('issues').select('id,status,project_id').in('project_id', myProjectIds)
        ]);
        
        if (isCancelled || !mountedRef.current) return;
        
        const todos = Array.isArray(todosRes?.data) ? todosRes.data : [];
        const issuesAll = Array.isArray(issuesRes?.data) ? issuesRes.data : [];
        
        // Batch state updates
        setTodoCounts({ 
          open: todos.filter(t => !t.is_complete).length, 
          total: todos.length, 
          loading: false 
        });
        
        setIssueCounts({
          open: issuesAll.filter(i => (i.status || '').toLowerCase() === 'open').length,
          blocked: issuesAll.filter(i => (i.status || '').toLowerCase() === 'blocked').length,
          total: issuesAll.length,
          loading: false
        });
      } catch (error) {
        console.error('Failed to load counts:', error);
        if (!isCancelled && mountedRef.current) {
          setTodoCounts({ open: 0, total: 0, loading: false });
          setIssueCounts({ open: 0, blocked: 0, total: 0, loading: false });
        }
      }
    };
    
    loadMyCounts();
    
    return () => {
      isCancelled = true;
    };
  }, [projectIdsKey]); // Use memoized key instead of myProjectIds directly

  // Memoize displayed projects to avoid recalculation
  const displayedProjects = useMemo(() => {
    if (!showMyProjects) return projects;
    if (!Array.isArray(myProjectIds) || myProjectIds.length === 0) return [];
    const idSet = new Set(myProjectIds);
    return projects.filter((project) => idSet.has(project.id));
  }, [projects, showMyProjects, myProjectIds]);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('dashboard-show-my-projects', String(showMyProjects));
  }, [showMyProjects]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Navigation handlers with useCallback to prevent re-creation
  const handleTodosClick = useCallback(() => navigate('/todos'), [navigate]);
  const handleIssuesClick = useCallback(() => navigate('/issues'), [navigate]);
  const handleProjectClick = useCallback((projectId) => navigate(`/project/${projectId}`), [navigate]);
  const handleShowMyProjects = useCallback(() => setShowMyProjects(true), []);
  const handleShowAllProjects = useCallback(() => setShowMyProjects(false), []);

  if (projectsLoading || issuesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div style={sectionStyles.card} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Today's Schedule</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Synced from Microsoft 365</p>
          </div>
          <div className="flex gap-2">
            {calendarConnected ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Calendar}
                onClick={handleCalendarRefresh}
                disabled={calendarLoading}
              >
                Refresh
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={Calendar}
                onClick={handleConnectCalendar}
              >
                Connect Calendar
              </Button>
            )}
          </div>
        </div>
        {calendarError && (
          <p className="text-sm text-rose-500">{calendarError}</p>
        )}
        {calendarLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-4 h-4 animate-spin text-violet-500" />
            <span>Loading calendar…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {calendarConnected && calendarEvents.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-300">No events scheduled for today.</p>
            )}
            {!calendarConnected && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Connect your Microsoft account to see today's appointments.
              </p>
            )}
            {calendarEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2"
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{event.subject}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {formatEventTime(event.start, event.end)}
                    {event.location ? ` • ${event.location}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* My-projects counters */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={handleTodosClick}
          style={sectionStyles.card}
          className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
        >
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">To-do Items</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {todoCounts.open}
              <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">open</span>
              <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">/ {todoCounts.total} total</span>
            </div>
          </div>
          <ListTodo className="w-8 h-8 text-violet-600" />
        </button>
        
        <button
          type="button"
          onClick={handleIssuesClick}
          style={sectionStyles.card}
          className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
        >
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Issues</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {issueCounts.blocked}
              <span className="text-sm font-medium ml-2 text-amber-600 dark:text-amber-400">blocked</span>
              <span className="text-sm font-medium ml-3 text-gray-600 dark:text-gray-400">• {issueCounts.open} open</span>
            </div>
          </div>
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </button>
      </div>

      {/* Projects */}
      <div style={sectionStyles.card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {showMyProjects ? 'My Projects' : 'All Projects'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {showMyProjects ? 'Projects where you are listed as an internal stakeholder.' : 'Full project roster.'}
            </p>
          </div>
          <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={handleShowMyProjects}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                showMyProjects
                  ? 'bg-violet-500 text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-violet-500'
              }`}
            >
              My Projects
            </button>
            <button
              type="button"
              onClick={handleShowAllProjects}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                !showMyProjects
                  ? 'bg-violet-500 text-white shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:text-violet-500'
              }`}
            >
              All Projects
            </button>
          </div>
        </div>

        {showMyProjects && !user?.email && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Sign in with your Microsoft account to load your assigned projects.
          </p>
        )}

        {showMyProjects && myProjectsLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-4 h-4 animate-spin text-violet-500" />
            <span>Loading your projects…</span>
          </div>
        )}

        {myProjectsError && showMyProjects && (
          <p className="text-sm text-rose-500">{myProjectsError}</p>
        )}

        {!myProjectsLoading && displayedProjects.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm">
            {showMyProjects ? 'You are not assigned to any projects yet.' : 'No projects available.'}
          </p>
        ) : (
          <div className="space-y-3">
            {displayedProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {project.project_number && `#${project.project_number} • `}
                      {project.status}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    project.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {project.status}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

TechnicianDashboard.displayName = 'TechnicianDashboard';

export default TechnicianDashboard;
