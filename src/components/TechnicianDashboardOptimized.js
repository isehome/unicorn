import React, { useCallback, useMemo, useState, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useDashboardData } from '../hooks/useOptimizedQueries';
import { timeLogsService, projectProgressService, issuesService } from '../services/supabaseService';
import { milestoneService } from '../services/milestoneService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import MilestoneGaugesDisplay from './MilestoneGaugesDisplay';
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

// Old ProgressBar component removed - now using UnifiedProgressGauge in MilestoneGaugesDisplay

// Memoized Project Card Component
const ProjectCard = memo(({
  project,
  onClick,
  onCheckIn,
  onCheckOut,
  onLogIssue,
  isCheckedIn,
  progress,
  milestonePercentages,
  projectOwners,
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
      <div className="card-content flex flex-col gap-4">
        {/* Top section - Project info and buttons */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mb-1">
              {project.name}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {project.project_number && `#${project.project_number} • `}
              {project.status}
            </p>
            {project.description && (
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-2">
                {project.description}
              </p>
            )}
          </div>

          {/* Action Buttons - Smaller, more compact */}
          <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onLogIssue}
              className="w-[70px] h-[70px] flex flex-col items-center justify-center text-sm font-medium rounded-lg text-red-700 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-2 border-gray-200 dark:border-gray-600"
            >
              <FileWarning className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Log Issue</span>
            </button>

            {isCheckedIn ? (
              <button
                onClick={onCheckOut}
                className="w-[70px] h-[70px] flex flex-col items-center justify-center text-sm font-medium rounded-lg text-yellow-700 dark:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-2 border-gray-200 dark:border-gray-600"
              >
                <LogOut className="w-5 h-5 mb-1" />
                <span className="text-[10px]">Check Out</span>
              </button>
            ) : (
              <button
                onClick={onCheckIn}
                className="w-[70px] h-[70px] flex flex-col items-center justify-center text-sm font-medium rounded-lg text-green-700 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-2 border-gray-200 dark:border-gray-600"
              >
                <LogIn className="w-5 h-5 mb-1" />
                <span className="text-[10px]">Check In</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom section - Progress Gauges (always below on all screen sizes) */}
        <div className="w-full">
          <MilestoneGaugesDisplay
            milestonePercentages={milestonePercentages || {}}
            projectOwners={projectOwners || { pm: null, technician: null }}
            startCollapsed={true}
          />
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
  const [milestonePercentages, setMilestonePercentages] = useState({});
  const [projectOwners, setProjectOwners] = useState({});
  const [loadingActions, setLoadingActions] = useState(new Set());

  // Get user ID for time logs (using email as fallback)
  const userId = user?.email || 'anonymous';

  // Load progress for all projects - OPTIMIZED: Parallel loading using Promise.all
  useEffect(() => {
    const loadProgress = async () => {
      if (!projects.data) return;

      const progressData = {};
      const milestoneData = {};

      // Run all project calculations in parallel
      const progressPromises = projects.data.map(async (project) => {
        try {
          const [progress, percentages] = await Promise.all([
            projectProgressService.getProjectProgress(project.id),
            milestoneService.calculateAllPercentages(project.id)
          ]);

          return {
            projectId: project.id,
            progress,
            percentages
          };
        } catch (error) {
          console.error(`Failed to load progress for project ${project.id}:`, error);
          return {
            projectId: project.id,
            progress: { prewire: 0, trim: 0, commission: 0, ordered: 0, onsite: 0 },
            percentages: {
              planning_design: 0,
              prewire_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
              prewire_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
              prewire: 0,
              prewire_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
              trim_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
              trim_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
              trim: 0,
              trim_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
              commissioning: 0,
              prewire_prep: 0,
              trim_prep: 0
            }
          };
        }
      });

      // Wait for all promises to resolve
      const results = await Promise.all(progressPromises);

      // Populate data objects
      results.forEach(({ projectId, progress, percentages }) => {
        progressData[projectId] = progress;
        milestoneData[projectId] = percentages;
      });

      setProjectProgress(progressData);
      setMilestonePercentages(milestoneData);
    };

    loadProgress();
  }, [projects.data]);

  // Load project owners (stakeholders) for all projects
  useEffect(() => {
    const loadAllProjectOwners = async () => {
      if (!projects.data) return;

      try {
        const projectIds = projects.data.map(p => p.id);

        // Load all stakeholders for all projects in one query
        const { data: stakeholders, error } = await supabase
          .from('project_stakeholders')
          .select(`
            project_id,
            stakeholder_roles (name),
            contacts (first_name, last_name)
          `)
          .in('project_id', projectIds);

        if (error) throw error;

        // Group stakeholders by project
        const ownersByProject = {};
        projectIds.forEach(projectId => {
          const projectStakeholders = stakeholders?.filter(s => s.project_id === projectId) || [];
          const pm = projectStakeholders.find(s => s.stakeholder_roles?.name === 'Project Manager');
          // Check for both 'Lead Technician' and 'Technician' roles
          const tech = projectStakeholders.find(s =>
            s.stakeholder_roles?.name === 'Lead Technician' ||
            s.stakeholder_roles?.name === 'Technician'
          );

          ownersByProject[projectId] = {
            pm: pm?.contacts ? `${pm.contacts.first_name || ''} ${pm.contacts.last_name || ''}`.trim() : null,
            technician: tech?.contacts ? `${tech.contacts.first_name || ''} ${tech.contacts.last_name || ''}`.trim() : null
          };
        });

        setProjectOwners(ownersByProject);
      } catch (error) {
        console.error('Failed to load project owners:', error);
      }
    };

    loadAllProjectOwners();
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
                milestonePercentages={milestonePercentages[project.id]}
                projectOwners={projectOwners[project.id]}
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
