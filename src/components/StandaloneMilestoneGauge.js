import React from 'react';
import CircularProgressGauge from './CircularProgressGauge';

/**
 * StandaloneMilestoneGauge Component
 * Wrapper for standalone milestone circular gauges (Commissioning)
 * Matches the horizontal layout of CollapsibleGaugeGroup (left-aligned)
 * ALWAYS renders the gauge, even if percentage is 0 or null
 * Always uses 140px gauges for consistent sizing
 */
const StandaloneMilestoneGauge = ({
  title,
  percentage = 0,
  itemCount,
  totalItems,
  ownerBadge
}) => {
  // Force percentage to be a valid number (0-100), never hide the gauge
  const safePercentage = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)));

  // Determine what text to show below gauge
  const showCounts = itemCount !== undefined && totalItems !== undefined;
  const displayText = showCounts ? `${itemCount} of ${totalItems}` : `${safePercentage}%`;

  // Responsive sizing: 90px on mobile, 140px on desktop
  const circularSizeMobile = 90;
  const circularSizeDesktop = 140;

  return (
    <>
      {/* Mobile layout - 90px gauges */}
      <div className="flex items-start gap-4 md:hidden">
        <div className="flex flex-col items-center" style={{ minWidth: circularSizeMobile, width: circularSizeMobile }}>
          <div className="flex items-center justify-center mb-2" style={{ height: '20px' }}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {title}
            </h3>
          </div>
          <CircularProgressGauge
            percentage={safePercentage}
            size={circularSizeMobile}
            showLabel={false}
          />
          {/* Display count below gauge */}
          <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
            {displayText}
          </div>
        </div>
        <div className="flex-1 pt-2"></div>
      </div>

      {/* Desktop layout - 140px gauges */}
      <div className="hidden md:flex items-start gap-4">
        <div className="flex flex-col items-center" style={{ minWidth: circularSizeDesktop, width: circularSizeDesktop }}>
          <div className="flex items-center justify-center mb-2" style={{ height: '20px' }}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {title}
            </h3>
          </div>
          <CircularProgressGauge
            percentage={safePercentage}
            size={circularSizeDesktop}
            showLabel={false}
          />
          {/* Display count below gauge */}
          <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
            {displayText}
          </div>
        </div>
        <div className="flex-1 pt-2"></div>
      </div>
    </>
  );
};

export default StandaloneMilestoneGauge;
