import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useProjects, useIssues } from '../hooks/useSupabase';
import { fetchTodayEvents } from '../services/microsoftCalendarService';
import { projectStakeholdersService } from '../services/supabaseService';
import Button from './ui/Button';
import {
  Clock, CheckCircle, AlertCircle, Folder,
  Loader, Calendar
} from 'lucide-react';

const TechnicianDashboard = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const { login, user } = useAuth();
  
  const { projects, loading: projectsLoading } = useProjects();
  const { issues, loading: issuesLoading } = useIssues();

  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [showMyProjects, setShowMyProjects] = useState(false);
  const [myProjectIds, setMyProjectIds] = useState([]);
  const [myProjectsLoading, setMyProjectsLoading] = useState(false);
  const [myProjectsError, setMyProjectsError] = useState('');

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

  const loadCalendarEvents = useCallback(async () => {
    try {
      setCalendarLoading(true);
      setCalendarError('');
      const result = await fetchTodayEvents();
      setCalendarConnected(Boolean(result.connected));
      setCalendarEvents(result.events || []);
    } catch (error) {
      console.error('Failed to load calendar events', error);
      setCalendarError(error.message || 'Unable to load calendar events.');
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendarEvents();
  }, [loadCalendarEvents, user?.id]);

  useEffect(() => {
    const loadMyProjects = async () => {
      if (!user?.email) {
        setMyProjectIds([]);
        return;
      }

      try {
        setMyProjectsLoading(true);
        setMyProjectsError('');
        const ids = await projectStakeholdersService.getInternalProjectIdsByEmail(user.email);
        setMyProjectIds(ids);
      } catch (error) {
        console.error('Failed to load user projects', error);
        setMyProjectsError(error.message || 'Unable to load your projects.');
        setMyProjectIds([]);
      } finally {
        setMyProjectsLoading(false);
      }
    };

    loadMyProjects();
  }, [user?.email]);

  const handleConnectCalendar = useCallback(async () => {
    try {
      await login();
    } catch (error) {
      console.error('Calendar connection failed', error);
      setCalendarError(error.message || 'Unable to connect calendar.');
    }
  }, [login]);

  // Calculate stats
  const stats = {
    activeProjects: projects.filter(p => p.status === 'active').length,
    totalProjects: projects.length,
    openIssues: issues.filter(i => i.status === 'open').length,
    totalIssues: issues.length
  };

  const displayedProjects = useMemo(() => {
    if (!showMyProjects) return projects;
    if (!Array.isArray(myProjectIds) || myProjectIds.length === 0) return [];
    const idSet = new Set(myProjectIds);
    return projects.filter((project) => idSet.has(project.id));
  }, [projects, showMyProjects, myProjectIds]);
  const recentIssues = issues.filter(i => i.status === 'open').slice(0, 5);

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
                onClick={loadCalendarEvents}
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
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div style={sectionStyles.card} className="text-center">
          <Folder className="w-8 h-8 text-violet-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.activeProjects}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Active Projects
          </p>
        </div>
        
        <div style={sectionStyles.card} className="text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.openIssues}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Open Issues
          </p>
        </div>
        
        <div style={sectionStyles.card} className="text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalProjects - stats.activeProjects}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Completed
          </p>
        </div>
        
        <div style={sectionStyles.card} className="text-center">
          <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalProjects}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total Projects
          </p>
        </div>
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
              onClick={() => setShowMyProjects(true)}
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
              onClick={() => setShowMyProjects(false)}
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
                onClick={() => navigate(`/project/${project.id}`)}
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

      {/* Recent Issues */}
      <div style={sectionStyles.card}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Open Issues
          </h2>
        </div>
        
        {recentIssues.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No open issues</p>
        ) : (
          <div className="space-y-3">
            {recentIssues.map((issue) => (
              <div
                key={issue.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {issue.title}
                </h3>
                {issue.notes && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {issue.notes}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(issue.created_at).toLocaleDateString()}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${
                    issue.status === 'open'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  }`}>
                    {issue.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TechnicianDashboard;
