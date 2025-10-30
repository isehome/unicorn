import React, { memo } from 'react';
import MilestoneGaugesDisplay from '../MilestoneGaugesDisplay';
import { LogIn, LogOut, FileWarning } from 'lucide-react';

/**
 * ProjectCard - Displays a project with actions and progress
 *
 * Features:
 * - Project information display
 * - Check-in/check-out buttons
 * - Log issue button
 * - Milestone progress gauges
 * - Clickable card to navigate to project detail
 */
const ProjectCard = memo(({
  project,
  onClick,
  onCheckIn,
  onCheckOut,
  onLogIssue,
  isCheckedIn,
  milestonePercentages,
  projectOwners
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

ProjectCard.displayName = 'ProjectCard';

export default ProjectCard;
