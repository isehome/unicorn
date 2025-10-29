import React from 'react';
import CircularProgressGauge from './CircularProgressGauge';

/**
 * CollapsibleGaugeGroup Component
 * Horizontal layout: Circular gauge on left, flat sub-gauges on right
 * Visibility controlled by parent MilestoneGaugesDisplay component
 * Always uses 140px gauges for consistent sizing
 */
const CollapsibleGaugeGroup = ({
  title,
  rollupPercentage = 0,
  children
}) => {
  const safeRollup = Math.min(100, Math.max(0, Math.round(Number(rollupPercentage) || 0)));

  // Always use 140px gauges for consistent sizing
  const circularSize = 140;

  return (
    <div className="flex items-start gap-6">
      {/* LEFT SIDE: Circular Gauge with Title */}
      <div className="flex flex-col items-center" style={{ minWidth: circularSize, width: circularSize }}>
        {/* Title - Fixed height container */}
        <div className="flex items-center justify-center mb-3" style={{ height: '20px' }}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {title}
          </h3>
        </div>

        {/* Circular Gauge */}
        <div>
          <CircularProgressGauge
            percentage={safeRollup}
            size={circularSize}
            showLabel={false}
          />
        </div>
      </div>

      {/* RIGHT SIDE: Child Gauges - Aligned to match circular gauge height */}
      <div className="flex-1 flex flex-col justify-between" style={{ height: circularSize, marginTop: '23px' }}>
        {children}
      </div>
    </div>
  );
};

export default CollapsibleGaugeGroup;
