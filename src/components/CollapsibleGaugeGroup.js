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

  // Responsive sizing: 90px on mobile, 140px on desktop
  const circularSizeMobile = 90;
  const circularSizeDesktop = 140;

  return (
    <>
      {/* Mobile layout - 90px gauges */}
      <div className="flex items-start gap-4 md:hidden">
        <div className="flex flex-col items-center" style={{ minWidth: circularSizeMobile, width: circularSizeMobile }}>
          <div className="flex items-center justify-center mb-3" style={{ height: '20px' }}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {title}
            </h3>
          </div>
          <div>
            <CircularProgressGauge
              percentage={safeRollup}
              size={circularSizeMobile}
              showLabel={false}
            />
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between" style={{ height: circularSizeMobile, marginTop: '23px' }}>
          {children}
        </div>
      </div>

      {/* Desktop layout - 140px gauges */}
      <div className="hidden md:flex items-start gap-6">
        <div className="flex flex-col items-center" style={{ minWidth: circularSizeDesktop, width: circularSizeDesktop }}>
          <div className="flex items-center justify-center mb-3" style={{ height: '20px' }}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {title}
            </h3>
          </div>
          <div>
            <CircularProgressGauge
              percentage={safeRollup}
              size={circularSizeDesktop}
              showLabel={false}
            />
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-between" style={{ height: circularSizeDesktop, marginTop: '23px' }}>
          {children}
        </div>
      </div>
    </>
  );
};

export default CollapsibleGaugeGroup;
