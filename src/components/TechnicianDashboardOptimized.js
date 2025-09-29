import React, { useCallback, useMemo, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useDashboardData } from '../hooks/useOptimizedQueries';
import Button from './ui/Button';
import { ListTodo, AlertTriangle, Loader, Calendar } from 'lucide-react';

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

// Memoized Project Card Component
const ProjectCard = memo(({ project, onClick }) => (
  <div
    onClick={onClick}
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
));

const TechnicianDashboardOptimized = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const { login, user } = useAuth();
  
  // Use the combined dashboard data hook
  const { projects, userProjectIds, calendar, counts, isLoading, error } = useDashboardData(user?.email);
  
  const [showMyProjects, setShowMyProjects] = useState(() => {
    const saved = localStorage.getItem('dashboard-show-my-projects');
    return saved === 'true' || saved === null;
  });

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
          <ListTodo className="w-8 h-8 text-violet-600" />
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
              <span className="text-sm font-medium ml-2 text-amber-600 dark:text-amber-400">blocked</span>
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(TechnicianDashboardOptimized);
