import React, { useCallback, useMemo, useState, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useDashboardData } from '../hooks/useOptimizedQueries';
import { timeLogsService, projectProgressService, issuesService } from '../services/supabaseService';
import Button from './ui/Button';
import { ListTodo, AlertTriangle, Loader, Calendar, LogIn, LogOut, FileWarning } from 'lucide-react';

// Memoized Calendar Event Component
const CalendarEvent = memo(({ event, formatEventTime }) => (
  <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" />
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{event.subject}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {formatEventTime(event.start, event.end)}
        {event.location ? ` • ${event.location}` : ''}
      </p>
    </div>
  </div>
));

// Progress Bar Component
const ProgressBar = memo(({ label, percentage }) => {
  const getBarColor = (percent) => {
    if (percent < 33) return 'bg-red-500';
    if (percent < 67) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 dark:text-gray-400 w-16">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${getBarColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 dark:text-gray-400 w-10 text-right">{percentage}%</span>
    </div>
  );
});

// Memoized Project Card Component
const ProjectCard = memo(({ 
  project, 
  onClick, 
  onCheckIn, 
  onCheckOut, 
  onLogIssue, 
  isCheckedIn, 
  progress,
  userId 
}) => {
  const handleCardClick = (e) => {
    // Only trigger onClick if clicking on the card itself, not buttons
    if (e.target === e.currentTarget || e.target.closest('.card-content')) {
      onClick();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="card-content flex gap-4">
        {/* Left side - Project info and buttons */}
        <div className="flex-1 min-w-0">
          <div className="mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {project.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {project.project_number && `#${project.project_number} • `}
              {project.status}
            </p>
            {project.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
                {project.description}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onLogIssue}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
            >
              <FileWarning className="w-3 h-3 inline mr-1" />
              Log Issue
            </button>
            
            {isCheckedIn ? (
              <button
                onClick={onCheckOut}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/30 transition-colors"
              >
                <LogOut className="w-3 h-3 inline mr-1" />
                Check Out
              </button>
            ) : (
              <button
                onClick={onCheckIn}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors"
              >
                <LogIn className="w-3 h-3 inline mr-1" />
                Check In
              </button>
            )}
          </div>
        </div>

        {/* Right side - Progress Bars */}
        <div className="flex flex-col justify-center space-y-1.5 w-48">
          <ProgressBar label="Prewire" percentage={progress?.prewire || 0} />
          <ProgressBar label="Trim" percentage={progress?.trim || 0} />
          <ProgressBar label="Commission" percentage={progress?.commission || 0} />
        </div>
      </div>
    </div>
  );
});

const TechnicianDashboardOptimized = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const authContext = useAuth(); // Get the full auth context
  const { login, user } = authContext;
  
  // Pass auth context to dashboard data hook for proper calendar token management
  const { projects, userProjectIds, calendar, counts, isLoading, error } = useDashboardData(user?.email, authContext);
  
  const [showMyProjects, setShowMyProjects] = useState(() => {
    const saved = localStorage.getItem('dashboard-show-my-projects');
    return saved === 'true' || saved === null;
  });

  const [checkedInProjects, setCheckedInProjects] = useState(new Set());
  const [projectProgress, setProjectProgress] = useState({});
  const [loadingActions, setLoadingActions] = useState(new Set());

  // Get user ID for time logs (using email as fallback)
  const userId = user?.email || 'anonymous';

  // Load progress for all projects
  useEffect(() => {
    const loadProgress = async () => {
      if (!projects.data) return;
      
      const progressData = {};
      for (const project of projects.data) {
        try {
          const progress = await projectProgressService.getProjectProgress(project.id);
          progressData[project.id] = progress;
        } catch (error) {
          console.error(`Failed to load progress for project ${project.id}:`, error);
          progressData[project.id] = { prewire: 0, trim: 0, commission: 0 };
        }
      }
      setProjectProgress(progressData);
    };

    loadProgress();
  }, [projects.data]);

  // Load checked-in status for all projects
  useEffect(() => {
    const loadCheckInStatus = async () => {
      if (!projects.data || !userId) return;
      
      const checkedIn = new Set();
      
      // First check local storage
      const localCheckIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      Object.keys(localCheckIns).forEach(projectId => {
        if (localCheckIns[projectId].user === userId) {
          checkedIn.add(projectId);
        }
      });
      
      // Then try to check database
      for (const project of projects.data) {
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
  }, [projects.data, userId]);

  // Memoized event time formatter
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
      return 'All day';
    }
  }, []);

  // Memoized calendar data
  const calendarData = useMemo(() => {
    if (!calendar.data) return { connected: false, events: [] };
    return {
      connected: calendar.data.connected || false,
      events: calendar.data.events || []
    };
  }, [calendar.data]);

  // Memoized project filtering
  const displayedProjects = useMemo(() => {
    if (!projects.data) return [];
    if (!showMyProjects) return projects.data;
    if (!userProjectIds.data?.length) return [];
    
    const idSet = new Set(userProjectIds.data);
    return projects.data.filter((project) => idSet.has(project.id));
  }, [projects.data, showMyProjects, userProjectIds.data]);

  // Optimized handlers with useCallback
  const handleConnectCalendar = useCallback(async () => {
    try {
      await login();
      calendar.refetch();
    } catch (error) {
      console.error('Calendar connection failed', error);
    }
  }, [login, calendar]);

  const handleNavigateToProject = useCallback((projectId) => {
    navigate(`/project/${projectId}`);
  }, [navigate]);

  const handleNavigateToTodos = useCallback(() => {
    navigate('/todos');
  }, [navigate]);

  const handleNavigateToIssues = useCallback(() => {
    navigate('/issues');
  }, [navigate]);

  const handleToggleProjectView = useCallback((showMy) => {
    setShowMyProjects(showMy);
    localStorage.setItem('dashboard-show-my-projects', String(showMy));
  }, []);

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
          projectName: projects.data?.find(p => p.id === projectId)?.name
        };
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
      } else if (result.message?.includes('metadata')) {
        // Fallback to local storage if database doesn't support metadata
        setCheckedInProjects(prev => new Set(prev).add(projectId));
        const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
        checkIns[projectId] = {
          user: userId,
          checkIn: new Date().toISOString(),
          projectName: projects.data?.find(p => p.id === projectId)?.name
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
        projectName: projects.data?.find(p => p.id === projectId)?.name
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
  }, [userId, loadingActions, projects.data]);

  const handleCheckOut = useCallback(async (e, projectId) => {
    e.stopPropagation();
    if (loadingActions.has(projectId)) return;
    
    setLoadingActions(prev => new Set(prev).add(projectId));
    try {
      const checkIns = JSON.parse(localStorage.getItem('project_checkins') || '{}');
      const checkInTime = checkIns[projectId]?.checkIn;
      
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
        
        // Calculate and show time spent
        if (checkInTime) {
          const duration = new Date() - new Date(checkInTime);
          const hours = Math.floor(duration / 3600000);
          const minutes = Math.floor((duration % 3600000) / 60000);
          console.log(`Checked out after ${hours}h ${minutes}m`);
        }
      } else if (result.message?.includes('metadata') || result.message?.includes('No active')) {
        // Fallback to local storage
        setCheckedInProjects(prev => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
        delete checkIns[projectId];
        localStorage.setItem('project_checkins', JSON.stringify(checkIns));
        
        if (checkInTime) {
          const duration = new Date() - new Date(checkInTime);
          const hours = Math.floor(duration / 3600000);
          const minutes = Math.floor((duration % 3600000) / 60000);
          console.log(`Checked out after ${hours}h ${minutes}m (local)`);
        }
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

  const handleLogIssue = useCallback(async (e, projectId) => {
    e.stopPropagation();
    // Navigate to project detail view with issues section expanded
    navigate(`/project/${projectId}?action=new-issue`);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Calendar Section */}
      <div style={sectionStyles.card} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Today's Schedule</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Synced from Microsoft 365</p>
          </div>
          <div className="flex gap-2">
            {calendarData.connected ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Calendar}
                onClick={() => calendar.refetch()}
                disabled={calendar.isFetching}
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
        
        {calendar.error && (
          <p className="text-sm text-rose-500">{calendar.error.message}</p>
        )}
        
        {calendar.isFetching ? (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-4 h-4 animate-spin text-violet-500" />
            <span>Loading calendar…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {calendarData.connected && calendarData.events.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-300">No events scheduled for today.</p>
            )}
            {!calendarData.connected && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Connect your Microsoft account to see today's appointments.
              </p>
            )}
            {calendarData.events.map((event) => (
              <CalendarEvent key={event.id} event={event} formatEventTime={formatEventTime} />
            ))}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={handleNavigateToTodos}
          style={sectionStyles.card}
          className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
        >
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">To-do Items</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {counts.data?.todos?.open ?? 0}
              <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">open</span>
              <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">
                / {counts.data?.todos?.total ?? 0} total
              </span>
            </div>
          </div>
          <ListTodo className="w-8 h-8" style={{ color: '#ACB3D1' }} />
        </button>
        
        <button
          type="button"
          onClick={handleNavigateToIssues}
          style={sectionStyles.card}
          className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
        >
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Issues</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {counts.data?.issues?.blocked ?? 0}
              <span 
                className="text-sm font-medium ml-2"
                style={{ 
                  color: (counts.data?.issues?.blocked ?? 0) > 0 ? '#EF4444' : '#F59E0B'
                }}
              >
                blocked
              </span>
              <span className="text-sm font-medium ml-3 text-gray-600 dark:text-gray-400">
                • {counts.data?.issues?.open ?? 0} open
              </span>
            </div>
          </div>
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </button>
      </div>

      {/* Projects Section */}
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
              onClick={() => handleToggleProjectView(true)}
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
              onClick={() => handleToggleProjectView(false)}
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

        {userProjectIds.isFetching && showMyProjects && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-4 h-4 animate-spin text-violet-500" />
            <span>Loading your projects…</span>
          </div>
        )}

        {error && showMyProjects && (
          <p className="text-sm text-rose-500">{error.message}</p>
        )}

        {!userProjectIds.isFetching && displayedProjects.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm">
            {showMyProjects ? 'You are not assigned to any projects yet.' : 'No projects available.'}
          </p>
        ) : (
          <div className="space-y-3">
            {displayedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => handleNavigateToProject(project.id)}
                onCheckIn={(e) => handleCheckIn(e, project.id)}
                onCheckOut={(e) => handleCheckOut(e, project.id)}
                onLogIssue={(e) => handleLogIssue(e, project.id)}
                isCheckedIn={checkedInProjects.has(project.id)}
                progress={projectProgress[project.id]}
                userId={userId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(TechnicianDashboardOptimized);
