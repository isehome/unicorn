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
  ownerBadge
}) => {
  // Force percentage to be a valid number (0-100), never hide the gauge
  const safePercentage = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)));
  // Always use 140px gauges for consistent sizing
  const circularSize = 140;

  return (
    <div className="flex items-start gap-4">
      {/* LEFT SIDE: Circular Gauge with Title (matching CollapsibleGaugeGroup layout) */}
      <div className="flex flex-col items-center" style={{ minWidth: circularSize, width: circularSize }}>
        {/* Title - Fixed height container for perfect alignment */}
        <div className="flex items-center justify-center mb-2" style={{ height: '20px' }}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {title}
          </h3>
        </div>

        {/* Circular Gauge - ALWAYS SHOWN */}
        <CircularProgressGauge
          percentage={safePercentage}
          size={circularSize}
          showLabel={false}
        />
      </div>

      {/* RIGHT SIDE: Empty space to match layout (no sub-gauges for Commissioning) */}
      <div className="flex-1 pt-2">
        {/* Intentionally empty - maintains consistent layout with other gauge groups */}
      </div>
    </div>
  );
};

export default StandaloneMilestoneGauge;
