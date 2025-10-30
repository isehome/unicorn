import React, { memo } from 'react';
import { Loader } from 'lucide-react';
import ProjectCard from './ProjectCard';

/**
 * ProjectsList - Displays filtered project list with toggle
 *
 * Features:
 * - Toggle between "My Projects" and "All Projects"
 * - Filters projects based on user assignment
 * - Shows loading states
 * - Renders project cards with all interactions
 */
const ProjectsList = ({
  sectionStyles,
  showMyProjects,
  displayedProjects,
  userProjectIds,
  user,
  error,
  checkedInProjects,
  milestonePercentages,
  projectOwners,
  onToggleProjectView,
  onNavigateToProject,
  onCheckIn,
  onCheckOut,
  onLogIssue
}) => {
  return (
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
            onClick={() => onToggleProjectView(true)}
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
            onClick={() => onToggleProjectView(false)}
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
              onClick={() => onNavigateToProject(project.id)}
              onCheckIn={(e) => onCheckIn(e, project.id)}
              onCheckOut={(e) => onCheckOut(e, project.id)}
              onLogIssue={(e) => onLogIssue(e, project.id)}
              isCheckedIn={checkedInProjects.has(project.id)}
              milestonePercentages={milestonePercentages[project.id]}
              projectOwners={projectOwners[project.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(ProjectsList);
