import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useProjects, useIssues } from '../hooks/useSupabase';
import BottomNavigation from './BottomNavigation';
import Button from './ui/Button';
import { 
  Clock, CheckCircle, AlertCircle, Folder, 
  Plus, Loader, Calendar
} from 'lucide-react';

const TechnicianDashboard = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const { projects, loading: projectsLoading } = useProjects();
  const { issues, loading: issuesLoading } = useIssues();

  // Calculate stats
  const stats = {
    activeProjects: projects.filter(p => p.status === 'active').length,
    totalProjects: projects.length,
    openIssues: issues.filter(i => i.status === 'open').length,
    totalIssues: issues.length
  };

  const recentProjects = projects.slice(0, 5);
  const recentIssues = issues.filter(i => i.status === 'open').slice(0, 5);

  if (projectsLoading || issuesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div style={sectionStyles.header} className="shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Technician Dashboard
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
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

        {/* Recent Projects */}
        <div style={sectionStyles.card}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Projects
            </h2>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => navigate('/pm-dashboard')}
            >
              View All
            </Button>
          </div>
          
          {recentProjects.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No projects yet</p>
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
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

      <BottomNavigation />
    </div>
  );
};

export default TechnicianDashboard;