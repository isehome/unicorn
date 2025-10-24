import React from 'react';

/**
 * Calculate gradient color from red (0%) to yellow (50%) to green (100%)
 */
const getGradientColor = (percentage) => {
  const percent = Math.max(0, Math.min(100, percentage));
  
  if (percent <= 50) {
    // Red to Yellow (0-50%)
    const ratio = percent / 50;
    const r = 239; // Red stays at 239
    const g = Math.round(68 + (177 * ratio)); // 68 → 245
    const b = 68; // Blue stays at 68
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Green (50-100%)
    const ratio = (percent - 50) / 50;
    const r = Math.round(245 - (229 * ratio)); // 245 → 16
    const g = Math.round(245 - (60 * ratio)); // 245 → 185
    const b = Math.round(11 + (118 * ratio)); // 11 → 129
    return `rgb(${r}, ${g}, ${b})`;
  }
};

/**
 * UnifiedProgressGauge Component
 * Displays a progress gauge with color gradient, dates, and helper text
 */
const UnifiedProgressGauge = ({
  label,
  percentage = 0,
  targetDate,
  actualDate,
  helperText,
  isAutoCalculated = false,
  canEditTargetDate = true,
  onTargetDateChange,
  onActualDateChange,
  showDates = true,
  compact = false
}) => {
  const safePercentage = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)));
  const barColor = getGradientColor(safePercentage);

  if (compact) {
    // Compact view for list displays
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{safePercentage}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full transition-all duration-300"
            style={{ 
              width: `${safePercentage}%`,
              backgroundColor: barColor
            }}
          />
        </div>
      </div>
    );
  }

  // Full view - horizontal layout matching screenshot
  return (
    <div className="flex items-center gap-4">
      {/* Left side - Dates */}
      {showDates && (
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <span>Target Date</span>
            <input
              type="date"
              value={targetDate || ''}
              onChange={(e) => onTargetDateChange?.(e.target.value)}
              disabled={!canEditTargetDate || isAutoCalculated}
              className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       [&::-webkit-calendar-picker-indicator]:dark:invert"
              style={{ width: '110px' }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span>Actual Date</span>
            <input
              type="date"
              value={actualDate || ''}
              onChange={(e) => onActualDateChange?.(e.target.value)}
              className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       [&::-webkit-calendar-picker-indicator]:dark:invert"
              style={{ width: '110px' }}
            />
          </div>
        </div>
      )}

      {/* Right side - Progress bar */}
      <div className="flex-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full transition-all duration-300"
            style={{ 
              width: `${safePercentage}%`,
              backgroundColor: barColor
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedProgressGauge;
