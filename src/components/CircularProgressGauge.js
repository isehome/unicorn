import React from 'react';

/**
 * CircularProgressGauge - SVG-based circular progress indicator
 * Used for high-level milestone tracking (Planning & Design, Prewire Phase, Trim Phase, Commissioning)
 *
 * Features:
 * - Gradient color transitions (red -> yellow -> green based on percentage)
 * - Clean, modern design matching example image
 * - Displays percentage in center
 * - Optional label below the gauge
 * - Responsive sizing
 */
const CircularProgressGauge = ({
  percentage = 0,
  label = '',
  size = 140,
  strokeWidth = 12,
  showLabel = true
}) => {
  // Ensure percentage is between 0 and 100
  const normalizedPercentage = Math.min(100, Math.max(0, percentage));

  // Calculate circle properties
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedPercentage / 100) * circumference;

  // Get color based on percentage (matching UnifiedProgressGauge logic)
  const getColor = (pct) => {
    if (pct === 0) return 'rgb(203, 213, 225)'; // Slate gray for 0%
    if (pct < 50) {
      // Red to Yellow (0-50%)
      const ratio = pct / 50;
      const r = 239;
      const g = Math.round(68 + (245 - 68) * ratio);
      const b = Math.round(68 + (11 - 68) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Green (50-100%)
      const ratio = (pct - 50) / 50;
      const r = Math.round(245 - (245 - 16) * ratio);
      const g = Math.round(245 - (245 - 185) * ratio);
      const b = Math.round(11 + (129 - 11) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const progressColor = getColor(normalizedPercentage);
  const backgroundColor = 'rgb(71, 85, 105)'; // Visible gray background (slate-600)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={backgroundColor}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease'
            }}
          />
        </svg>

        {/* Percentage text in center */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: size * 0.22, fontWeight: '600' }}
        >
          <span className="text-white">
            {Math.round(normalizedPercentage)}%
          </span>
        </div>
      </div>

      {/* Label below gauge */}
      {showLabel && label && (
        <div
          className="mt-3 text-center text-white font-medium"
          style={{ fontSize: size * 0.12, maxWidth: size * 1.2 }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default CircularProgressGauge;
