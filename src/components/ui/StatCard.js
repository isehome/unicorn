// /src/components/ui/StatCard.js
import React from 'react';
import { brandColors } from '../../styles/styleSystem';

/**
 * StatCard - Displays a metric with icon, label, value, and optional subtext
 *
 * @param {React.ComponentType} icon - Lucide icon component
 * @param {string} label - Label text shown above the value
 * @param {string|number} value - Main value to display
 * @param {string} subtext - Optional smaller text below the value
 * @param {string} color - Color theme: 'violet', 'blue', 'green', 'amber', 'red', 'teal', 'indigo'
 * @param {boolean} isDark - Whether dark mode is active
 *
 * Note: 'green' uses brand olive color (#94AF32) instead of Tailwind green per AGENT.md
 */
const StatCard = ({ icon: Icon, label, value, subtext, color = 'violet', isDark = true }) => {
  // Debug: verify component is loaded
  if (!Icon) {
    console.warn('StatCard: No icon provided for label:', label);
  }
  // Color configurations - green uses brand olive (#94AF32) per AGENT.md
  const colorStyles = {
    violet: {
      bgClass: 'bg-violet-100 dark:bg-violet-900/30',
      textClass: 'text-violet-600 dark:text-violet-400'
    },
    blue: {
      bgClass: 'bg-blue-100 dark:bg-blue-900/30',
      textClass: 'text-blue-600 dark:text-blue-400'
    },
    green: {
      // Brand olive green (#94AF32) - NEVER use Tailwind green classes
      bgStyle: { backgroundColor: 'rgba(148, 175, 50, 0.15)' },
      textStyle: { color: brandColors.success }
    },
    amber: {
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
      textClass: 'text-amber-600 dark:text-amber-400'
    },
    red: {
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      textClass: 'text-red-600 dark:text-red-400'
    },
    teal: {
      bgClass: 'bg-teal-100 dark:bg-teal-900/30',
      textClass: 'text-teal-600 dark:text-teal-400'
    },
    indigo: {
      bgClass: 'bg-indigo-100 dark:bg-indigo-900/30',
      textClass: 'text-indigo-600 dark:text-indigo-400'
    }
  };

  const colorConfig = colorStyles[color] || colorStyles.violet;

  // Text colors from zinc palette
  const secondaryTextColor = isDark ? '#A1A1AA' : '#52525B';  // zinc-400 / zinc-600
  const mutedTextColor = isDark ? '#71717A' : '#52525B';       // zinc-500 / zinc-600

  return (
    <div
      className={`rounded-xl p-4 min-h-[100px] ${colorConfig.bgClass || ''}`}
      style={colorConfig.bgStyle || undefined}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${colorConfig.textClass || ''}`}
          style={colorConfig.textStyle || undefined}
          aria-hidden="true"
        />
        <span
          className="text-sm font-medium truncate"
          style={{ color: secondaryTextColor }}
        >
          {label}
        </span>
      </div>
      <div
        className={`text-2xl font-bold ${colorConfig.textClass || ''}`}
        style={colorConfig.textStyle || undefined}
      >
        {value}
      </div>
      {subtext && (
        <div
          className="text-xs mt-1 truncate"
          style={{ color: mutedTextColor }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
};

export default StatCard;
