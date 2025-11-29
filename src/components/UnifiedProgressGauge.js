import React from 'react';

/**
 * Calculate gradient color from red (0%) to yellow (50%) to brand success green (100%)
 * End color: #94AF32 = rgb(148, 175, 50) - brand success color
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
    // Yellow to Brand Success Green (50-100%)
    // End color: #94AF32 = rgb(148, 175, 50)
    const ratio = (percent - 50) / 50;
    const r = Math.round(245 - (97 * ratio));  // 245 → 148
    const g = Math.round(245 - (70 * ratio));  // 245 → 175
    const b = Math.round(11 + (39 * ratio));   // 11 → 50
    return `rgb(${r}, ${g}, ${b})`;
  }
};

/**
 * UnifiedProgressGauge Component
 * Displays a progress gauge with color gradient - NO DATES, just progress!
 */
const UnifiedProgressGauge = ({
  label,
  percentage = 0,
  compact = false,
  itemCount,
  totalItems
}) => {
  const safePercentage = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)));
  const barColor = getGradientColor(safePercentage);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        {/* Show "x of y" if counts are provided, otherwise show percentage */}
        {itemCount !== undefined && totalItems !== undefined ? (
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {itemCount} of {totalItems}
          </span>
        ) : (
          <span className="font-semibold text-gray-900 dark:text-gray-100">{safePercentage}%</span>
        )}
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
};

export default UnifiedProgressGauge;
