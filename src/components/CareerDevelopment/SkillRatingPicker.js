/**
 * SkillRatingPicker.js
 * Reusable component for selecting skill proficiency level
 */

import React from 'react';
import { CircleDashed, GraduationCap, CheckCircle, Star } from 'lucide-react';

// Rating level definitions with colors that follow Unicorn brand guidelines
export const RATING_LEVELS = [
  {
    id: 'none',
    label: 'Not Rated',
    shortLabel: 'None',
    icon: CircleDashed,
    color: '#71717A', // zinc-500
    bgClass: 'bg-zinc-100 dark:bg-zinc-800',
    textClass: 'text-zinc-600 dark:text-zinc-400',
    borderClass: 'border-zinc-300 dark:border-zinc-600'
  },
  {
    id: 'training',
    label: 'Training',
    shortLabel: 'Training',
    icon: GraduationCap,
    color: '#F59E0B', // amber-500
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-300 dark:border-amber-600'
  },
  {
    id: 'proficient',
    label: 'Proficient',
    shortLabel: 'Proficient',
    icon: CheckCircle,
    color: '#3B82F6', // blue-500
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-400',
    borderClass: 'border-blue-300 dark:border-blue-600'
  },
  {
    id: 'expert',
    label: 'Expert',
    shortLabel: 'Expert',
    icon: Star,
    color: '#8B5CF6', // violet-500 (primary brand color)
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
    textClass: 'text-violet-700 dark:text-violet-400',
    borderClass: 'border-violet-300 dark:border-violet-600'
  }
];

export const getRatingLevel = (ratingId) => {
  return RATING_LEVELS.find(r => r.id === ratingId) || RATING_LEVELS[0];
};

/**
 * SkillRatingPicker - Button group for selecting skill rating
 */
const SkillRatingPicker = ({
  value,
  onChange,
  disabled = false,
  showLabels = true,
  size = 'md', // 'sm', 'md', 'lg'
  excludeNone = false,
  className = ''
}) => {
  const levels = excludeNone ? RATING_LEVELS.filter(r => r.id !== 'none') : RATING_LEVELS;

  const sizeClasses = {
    sm: 'min-h-[36px] px-2 text-xs',
    md: 'min-h-[44px] px-3 text-sm',
    lg: 'min-h-[52px] px-4 text-base'
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {levels.map((level) => {
        const Icon = level.icon;
        const isSelected = value === level.id;

        return (
          <button
            key={level.id}
            type="button"
            onClick={() => !disabled && onChange(level.id)}
            disabled={disabled}
            className={`
              flex items-center gap-1.5 rounded-lg border-2 transition-all
              touch-manipulation
              ${sizeClasses[size]}
              ${isSelected
                ? `${level.bgClass} ${level.borderClass} ${level.textClass} font-semibold`
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
            `}
            style={isSelected ? { borderColor: level.color } : {}}
          >
            <Icon size={iconSizes[size]} style={isSelected ? { color: level.color } : {}} />
            {showLabels && <span>{level.shortLabel}</span>}
          </button>
        );
      })}
    </div>
  );
};

/**
 * SkillRatingBadge - Display-only badge showing a rating
 */
export const SkillRatingBadge = ({
  rating,
  size = 'md',
  showIcon = true,
  className = ''
}) => {
  const level = getRatingLevel(rating);
  const Icon = level.icon;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-sm gap-1.5',
    lg: 'px-3 py-1.5 text-base gap-2'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 18
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        ${level.bgClass} ${level.textClass}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {showIcon && <Icon size={iconSizes[size]} style={{ color: level.color }} />}
      {level.shortLabel}
    </span>
  );
};

/**
 * SkillRatingComparison - Show two ratings side by side with discrepancy indicator
 */
export const SkillRatingComparison = ({
  selfRating,
  managerRating,
  size = 'sm',
  className = ''
}) => {
  const hasDiscrepancy = selfRating && managerRating && selfRating !== managerRating;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex flex-col items-center">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Self</span>
        <SkillRatingBadge rating={selfRating || 'none'} size={size} />
      </div>

      {hasDiscrepancy && (
        <span className="text-amber-500 text-xs font-medium">≠</span>
      )}

      <div className="flex flex-col items-center">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">Manager</span>
        <SkillRatingBadge rating={managerRating || 'none'} size={size} />
      </div>
    </div>
  );
};

export default SkillRatingPicker;
