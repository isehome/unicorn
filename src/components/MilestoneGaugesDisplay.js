import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import UnifiedProgressGauge from './UnifiedProgressGauge';
import CollapsibleGaugeGroup from './CollapsibleGaugeGroup';
import StandaloneMilestoneGauge from './StandaloneMilestoneGauge';
import CircularProgressGauge from './CircularProgressGauge';

/**
 * MilestoneGaugesDisplay Component
 *
 * Centralized component for displaying milestone gauges with two view modes:
 * - COLLAPSED: Horizontal layout with 3 circular gauges side-by-side (for dashboard lists)
 * - EXPANDED: Vertical layout with circular gauges on left and sub-gauges on right (for detail pages)
 *
 * Always uses 140px circular gauges for consistent sizing across all views.
 *
 * @param {Object} milestonePercentages - Object containing all milestone percentages from milestoneService.getAllPercentagesOptimized()
 * @param {Object} projectOwners - Object with { pm: string, technician: string } names from stakeholders
 * @param {boolean} startCollapsed - Whether to start in collapsed view (dashboard list) or expanded view (detail pages)
 * @param {Array} milestoneDates - Array of milestone date records from project_milestones table
 */
const MilestoneGaugesDisplay = ({
  milestonePercentages = {},
  projectOwners = { pm: null, technician: null },
  startCollapsed = true,
  milestoneDates = []
}) => {
  // State to track if view is expanded
  const [isExpanded, setIsExpanded] = useState(!startCollapsed);

  // Responsive sizing: 90px on mobile, 140px on desktop
  const circularSizeMobile = 90;
  const circularSizeDesktop = 140;

  // Helper function to get milestone dates by type
  const getMilestoneDate = (milestoneType) => {
    return milestoneDates.find(m => m.milestone_type === milestoneType);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper to render milestone dates
  const renderMilestoneDates = (milestoneType, label) => {
    const milestone = getMilestoneDate(milestoneType);
    if (!milestone || (!milestone.target_date && !milestone.actual_date)) return null;

    return (
      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
        {milestone.target_date && (
          <div className="flex items-center gap-2">
            <span className="font-medium">Target:</span>
            <span>{formatDate(milestone.target_date)}</span>
          </div>
        )}
        {milestone.actual_date && (
          <div className="flex items-center gap-2">
            <span className="font-medium">Actual:</span>
            <span className="text-green-600 dark:text-green-400">{formatDate(milestone.actual_date)}</span>
          </div>
        )}
      </div>
    );
  };

  // COLLAPSED VIEW: Horizontal layout with 3 gauges side-by-side
  if (!isExpanded) {
    return (
      <div>
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(true)}
          className="mb-3 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
          <span>Show Details</span>
        </button>

        {/* Three Gauges Horizontal - Distributed evenly across width */}
        <div className="grid grid-cols-3 gap-4 md:gap-6">
          {/* Prewire Phase */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center mb-2 h-5">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200 text-center">
                Prewire
              </h3>
            </div>
            <div className="w-full flex justify-center">
              {/* Mobile: 90px, Desktop: 140px */}
              <div className="block md:hidden">
                <CircularProgressGauge
                  percentage={milestonePercentages.prewire_phase?.percentage || 0}
                  size={circularSizeMobile}
                  showLabel={false}
                />
              </div>
              <div className="hidden md:block">
                <CircularProgressGauge
                  percentage={milestonePercentages.prewire_phase?.percentage || 0}
                  size={circularSizeDesktop}
                  showLabel={false}
                />
              </div>
            </div>
            {renderMilestoneDates('prewire', 'Prewire')}
          </div>

          {/* Trim Phase */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center mb-2 h-5">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200 text-center">
                Trim
              </h3>
            </div>
            <div className="w-full flex justify-center">
              {/* Mobile: 90px, Desktop: 140px */}
              <div className="block md:hidden">
                <CircularProgressGauge
                  percentage={milestonePercentages.trim_phase?.percentage || 0}
                  size={circularSizeMobile}
                  showLabel={false}
                />
              </div>
              <div className="hidden md:block">
                <CircularProgressGauge
                  percentage={milestonePercentages.trim_phase?.percentage || 0}
                  size={circularSizeDesktop}
                  showLabel={false}
                />
              </div>
            </div>
            {renderMilestoneDates('trim', 'Trim')}
          </div>

          {/* Commissioning */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center mb-2 h-5">
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200 text-center">
                Commission
              </h3>
            </div>
            <div className="w-full flex justify-center">
              {/* Mobile: 90px, Desktop: 140px */}
              <div className="block md:hidden">
                <CircularProgressGauge
                  percentage={milestonePercentages.commissioning?.percentage || 0}
                  size={circularSizeMobile}
                  showLabel={false}
                />
              </div>
              <div className="hidden md:block">
                <CircularProgressGauge
                  percentage={milestonePercentages.commissioning?.percentage || 0}
                  size={circularSizeDesktop}
                  showLabel={false}
                />
              </div>
            </div>
            {renderMilestoneDates('commissioning', 'Commissioning')}
          </div>
        </div>
      </div>
    );
  }

  // EXPANDED VIEW: Vertical layout with sub-gauges
  return (
    <div>
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(false)}
        className="mb-3 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <ChevronUp className="w-4 h-4" />
        <span>Hide Details</span>
      </button>

      <div className="space-y-6">
        {/* Prewire Phase - Circular Gauge on Left, Sub-Gauges on Right */}
        <CollapsibleGaugeGroup
          title="Prewire Phase"
          rollupPercentage={milestonePercentages.prewire_phase?.percentage || 0}
        >
          <UnifiedProgressGauge
            label="Prewire Orders"
            percentage={milestonePercentages.prewire_orders?.percentage || 0}
            itemCount={milestonePercentages.prewire_orders?.partsAccountedFor}
            totalItems={milestonePercentages.prewire_orders?.totalParts}
            ownerBadge={projectOwners.pm || 'PM'}
          />
          <UnifiedProgressGauge
            label="Prewire Receiving"
            percentage={milestonePercentages.prewire_receiving?.percentage || 0}
            itemCount={milestonePercentages.prewire_receiving?.itemCount}
            totalItems={milestonePercentages.prewire_receiving?.totalItems}
            ownerBadge={projectOwners.pm || 'PM'}
          />
          <UnifiedProgressGauge
            label="Prewire Stages"
            percentage={milestonePercentages.prewire || 0}
            ownerBadge={projectOwners.technician || 'Technician'}
          />
        </CollapsibleGaugeGroup>

        {/* Trim Phase - Circular Gauge on Left, Sub-Gauges on Right */}
        <CollapsibleGaugeGroup
          title="Trim Phase"
          rollupPercentage={milestonePercentages.trim_phase?.percentage || 0}
        >
          <UnifiedProgressGauge
            label="Trim Orders"
            percentage={milestonePercentages.trim_orders?.percentage || 0}
            itemCount={milestonePercentages.trim_orders?.partsAccountedFor}
            totalItems={milestonePercentages.trim_orders?.totalParts}
            ownerBadge={projectOwners.pm || 'PM'}
          />
          <UnifiedProgressGauge
            label="Trim Receiving"
            percentage={milestonePercentages.trim_receiving?.percentage || 0}
            itemCount={milestonePercentages.trim_receiving?.itemCount}
            totalItems={milestonePercentages.trim_receiving?.totalItems}
            ownerBadge={projectOwners.pm || 'PM'}
          />
          <UnifiedProgressGauge
            label="Trim Stages"
            percentage={milestonePercentages.trim || 0}
            ownerBadge={projectOwners.technician || 'Technician'}
          />
        </CollapsibleGaugeGroup>

        {/* Commissioning - Standalone Circular Gauge (always show, even if 0%) */}
        <StandaloneMilestoneGauge
          title="Commissioning"
          percentage={milestonePercentages.commissioning?.percentage || 0}
          itemCount={milestonePercentages.commissioning?.itemCount}
          totalItems={milestonePercentages.commissioning?.totalItems}
        />

        {/* Milestone Dates Section */}
        {milestoneDates.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Milestone Timeline
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { type: 'planning_design', label: 'Planning & Design' },
                { type: 'prewire_prep', label: 'Prewire Prep' },
                { type: 'prewire', label: 'Prewire' },
                { type: 'trim_prep', label: 'Trim Prep' },
                { type: 'trim', label: 'Trim' },
                { type: 'commissioning', label: 'Commissioning' },
                { type: 'handoff_training', label: 'Handoff / Training' }
              ].map(({ type, label }) => {
                const milestone = getMilestoneDate(type);
                if (!milestone || (!milestone.target_date && !milestone.actual_date)) return null;

                return (
                  <div
                    key={type}
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="text-xs font-semibold text-gray-900 dark:text-white mb-2">
                      {label}
                    </div>
                    {milestone.target_date && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Target: </span>
                        {formatDate(milestone.target_date)}
                      </div>
                    )}
                    {milestone.actual_date && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        <span className="font-medium">Actual: </span>
                        {formatDate(milestone.actual_date)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MilestoneGaugesDisplay;
