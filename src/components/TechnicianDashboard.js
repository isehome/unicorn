import React, { useCallback, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useDashboardData } from '../hooks/useOptimizedQueries';
import { useTechnicianProjects } from '../hooks/useTechnicianProjects';
import { useTimeTracking } from '../hooks/useTimeTracking';
import { projectTodosService } from '../services/supabaseService';
import { Loader, Calendar as CalendarIcon, List } from 'lucide-react';
import CalendarSection from './dashboard/CalendarSection';
import CalendarDayView from './dashboard/CalendarDayView';
import DashboardStats from './dashboard/DashboardStats';
import ProjectsList from './dashboard/ProjectsList';
import Button from './ui/Button';

/**
 * TechnicianDashboardOptimized - Main dashboard for technicians
 *
 * Displays:
 * - Today's calendar events from Microsoft 365
 * - Todo and issue statistics
 * - Project list with progress tracking
 * - Check-in/check-out functionality
 *
 * This component has been refactored into smaller, focused pieces:
 * - Custom hooks: useTechnicianProjects, useTimeTracking
 * - UI components: CalendarSection, DashboardStats, ProjectsList, ProjectCard
 */
const TechnicianDashboardOptimized = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const authContext = useAuth();
  const { login, user } = authContext;
  const { publishState, registerActions, unregisterActions } = useAppState();

  // Fetch dashboard data (projects, calendar, counts)
  const { projects, userProjectIds, calendar, counts, userTodos, isLoading, error } = useDashboardData(user?.email, authContext);

  // Get user ID for time logs
  const userId = user?.email || 'anonymous';

  // View mode state for calendar (list vs day)
  const [viewMode, setViewMode] = React.useState('list');

  // Selected date for day view
  const [selectedDate, setSelectedDate] = React.useState(new Date());

  // Custom hook: Project filtering and milestone/owner loading
  const {
    showMyProjects,
    displayedProjects,
    milestonePercentages,
    projectOwners,
    handleToggleProjectView
  } = useTechnicianProjects(projects.data, userProjectIds.data, user);

  // Custom hook: Time tracking (check-in/check-out)
  const {
    checkedInProjects,
    handleCheckIn,
    handleCheckOut
  } = useTimeTracking(projects.data, userId);

  // Navigation handlers
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

  const handleLogIssue = useCallback((e, projectId) => {
    e.stopPropagation();
    navigate(`/project/${projectId}?action=new-issue`);
  }, [navigate]);

  // Handle todo resize from calendar day view
  const handleTodoResize = useCallback(async (todo, newDuration) => {
    try {
      await projectTodosService.update(todo.id, { planned_hours: newDuration });
      // Refetch todos to update the display
      userTodos.refetch();
    } catch (err) {
      console.error('Failed to update todo duration:', err);
    }
  }, [userTodos]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'technician-dashboard',
      viewMode: viewMode,
      selectedDate: selectedDate?.toISOString(),
      projects: displayedProjects?.map(p => ({
        id: p.id,
        name: p.name,
        address: p.address,
        status: p.status,
        isCheckedIn: checkedInProjects[p.id] || false
      })) || [],
      projectCount: displayedProjects?.length || 0,
      showingMyProjects: showMyProjects,
      stats: counts?.data ? {
        todosCount: counts.data.todos || 0,
        issuesCount: counts.data.issues || 0
      } : null,
      calendarConnected: calendar?.data?.connected || false,
      todayEvents: calendar?.data?.events?.length || 0,
      hint: 'Technician home dashboard. Can open projects, view calendar, navigate to todos/issues.'
    });
  }, [publishState, viewMode, selectedDate, displayedProjects, checkedInProjects, showMyProjects, counts?.data, calendar?.data]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      open_project: async ({ projectId, projectName }) => {
        const project = projectName
          ? displayedProjects?.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()))
          : displayedProjects?.find(p => p.id === projectId);
        if (project) {
          navigate(`/project/${project.id}`);
          return { success: true, message: `Opening project: ${project.name}` };
        }
        return { success: false, error: 'Project not found' };
      },
      list_projects: async () => {
        return {
          success: true,
          projects: displayedProjects?.map(p => ({
            name: p.name,
            address: p.address,
            status: p.status
          })) || []
        };
      },
      check_in_project: async ({ projectId, projectName }) => {
        const project = projectName
          ? displayedProjects?.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()))
          : displayedProjects?.find(p => p.id === projectId);
        if (project) {
          await handleCheckIn(project.id);
          return { success: true, message: `Checked into ${project.name}` };
        }
        return { success: false, error: 'Project not found' };
      },
      check_out_project: async ({ projectId, projectName }) => {
        const project = projectName
          ? displayedProjects?.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()))
          : displayedProjects?.find(p => p.id === projectId);
        if (project) {
          await handleCheckOut(project.id);
          return { success: true, message: `Checked out of ${project.name}` };
        }
        return { success: false, error: 'Project not found' };
      },
      toggle_my_projects: async () => {
        handleToggleProjectView();
        return { success: true, message: showMyProjects ? 'Showing all projects' : 'Showing my projects only' };
      },
      switch_view: async ({ mode }) => {
        if (mode === 'list' || mode === 'day') {
          setViewMode(mode);
          return { success: true, message: `Switched to ${mode} view` };
        }
        return { success: false, error: 'Invalid view mode. Use "list" or "day"' };
      },
      refresh_calendar: async () => {
        await calendar?.refetch();
        return { success: true, message: 'Calendar refreshed' };
      },
      go_to_todos: async () => {
        navigate('/todos');
        return { success: true, message: 'Navigating to todos' };
      },
      go_to_issues: async () => {
        navigate('/issues');
        return { success: true, message: 'Navigating to issues' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, displayedProjects, navigate, handleCheckIn, handleCheckOut, handleToggleProjectView, showMyProjects, calendar]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="w-full px-3 sm:px-4 py-6 space-y-6">
      {/* Calendar Section with Toggle */}
      <div style={sectionStyles.card} className="space-y-3">
        {/* Header with title and controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {viewMode === 'list' ? "Today's Schedule" : 'Day View'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {viewMode === 'list' ? 'Synced from Microsoft 365' : 'Calendar events & todos'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list'
                    ? 'bg-white dark:bg-zinc-600 shadow-sm text-violet-600 dark:text-violet-400'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                title="List View"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'day'
                    ? 'bg-white dark:bg-zinc-600 shadow-sm text-violet-600 dark:text-violet-400'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                title="Day View"
              >
                <CalendarIcon size={16} />
              </button>
            </div>
            {/* Refresh/Connect button */}
            {calendar?.data?.connected ? (
              <Button
                variant="secondary"
                size="sm"
                icon={CalendarIcon}
                onClick={() => calendar.refetch()}
                disabled={calendar.isFetching}
              >
                Refresh
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon={CalendarIcon}
                onClick={handleConnectCalendar}
              >
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {viewMode === 'list' ? (
          <CalendarSection
            sectionStyles={sectionStyles}
            calendar={calendar}
            onConnectCalendar={handleConnectCalendar}
            hideHeader={true}
          />
        ) : (
          <CalendarDayView
            sectionStyles={sectionStyles}
            calendar={calendar}
            todos={userTodos?.data || []}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onConnectCalendar={handleConnectCalendar}
            hideHeader={true}
            onTodoClick={(todo) => {
              if (todo.projectId) {
                navigate(`/project/${todo.projectId}?todo=${todo.id}`);
              }
            }}
            onTodoResize={handleTodoResize}
          />
        )}
      </div>

      {/* Stats Cards */}
      <DashboardStats
        sectionStyles={sectionStyles}
        counts={counts.data}
        onNavigateToTodos={handleNavigateToTodos}
        onNavigateToIssues={handleNavigateToIssues}
      />

      {/* Projects Section */}
      <ProjectsList
        sectionStyles={sectionStyles}
        showMyProjects={showMyProjects}
        displayedProjects={displayedProjects}
        userProjectIds={userProjectIds}
        user={user}
        error={error}
        checkedInProjects={checkedInProjects}
        milestonePercentages={milestonePercentages}
        projectOwners={projectOwners}
        onToggleProjectView={handleToggleProjectView}
        onNavigateToProject={handleNavigateToProject}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onLogIssue={handleLogIssue}
      />
    </div>
  );
};

export default memo(TechnicianDashboardOptimized);
