import React, { useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useDashboardData } from '../hooks/useOptimizedQueries';
import { useTechnicianProjects } from '../hooks/useTechnicianProjects';
import { useTimeTracking } from '../hooks/useTimeTracking';
import { Loader } from 'lucide-react';
import CalendarSection from './dashboard/CalendarSection';
import DashboardStats from './dashboard/DashboardStats';
import ProjectsList from './dashboard/ProjectsList';

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

  // Fetch dashboard data (projects, calendar, counts)
  const { projects, userProjectIds, calendar, counts, isLoading, error } = useDashboardData(user?.email, authContext);

  // Get user ID for time logs
  const userId = user?.email || 'anonymous';

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

  // Loading state
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
      <CalendarSection
        sectionStyles={sectionStyles}
        calendar={calendar}
        onConnectCalendar={handleConnectCalendar}
      />

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
