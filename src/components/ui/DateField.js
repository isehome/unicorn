import React from 'react';
import { Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { formatDateWithStatus } from '../../utils/dateUtils';

/**
 * DateField Component
 *
 * A comprehensive date display component with automatic color coding and status indicators.
 *
 * Features:
 * - Shows "—" (dash) for unset dates instead of displaying today's date
 * - Color codes dates based on proximity: red (past due), orange (urgent), yellow (upcoming), blue (future)
 * - Greys out dates in completed sections
 * - Makes active/upcoming dates prominent with bold styling
 * - Provides visual hierarchy: active > upcoming > future > not set/completed
 *
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @param {string} label - Label for the date field (e.g., "Target Date", "Delivery Date")
 * @param {boolean} isCompleted - Whether the associated section/milestone is completed
 * @param {boolean} showIcon - Whether to show calendar icon
 * @param {boolean} showBadge - Whether to show status badge
 * @param {boolean} showDescription - Whether to show description (e.g., "3 days away")
 * @param {string} variant - Display variant: 'default' | 'compact' | 'inline'
 * @param {object} thresholds - Custom urgency thresholds { warningDays, urgentDays }
 */
const DateField = ({
  date,
  label,
  isCompleted = false,
  showIcon = true,
  showBadge = false,
  showDescription = true,
  variant = 'default',
  thresholds = {}
}) => {
  const dateInfo = formatDateWithStatus(date, isCompleted, thresholds);
  const { formatted, status, classes } = dateInfo;

  // Icon based on status
  const getIcon = () => {
    if (status.status === 'completed') return CheckCircle;
    if (status.status === 'past-due' || status.status === 'urgent') return AlertCircle;
    if (status.status === 'not-set') return Calendar;
    return Clock;
  };

  const Icon = getIcon();

  // Compact variant - single line
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        {showIcon && <Icon className={`w-4 h-4 ${classes.text}`} />}
        <div className="flex items-center gap-2">
          {label && <span className="text-sm text-gray-600 dark:text-gray-400">{label}:</span>}
          <span className={`text-sm ${classes.text}`}>
            {formatted}
          </span>
          {showBadge && status.status !== 'not-set' && status.status !== 'future' && (
            <span className={`text-xs px-2 py-0.5 rounded border ${classes.badge}`}>
              {status.label}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Inline variant - minimal
  if (variant === 'inline') {
    return (
      <span className={`${classes.text}`}>
        {formatted}
      </span>
    );
  }

  // Default variant - full display
  return (
    <div className={`${classes.bg} ${classes.border} rounded-lg p-3 transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {label && (
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {label}
            </div>
          )}
          <div className="flex items-center gap-2">
            {showIcon && (
              <Icon className={`w-5 h-5 ${classes.text} flex-shrink-0`} />
            )}
            <div className={`text-lg font-semibold ${classes.text}`}>
              {formatted}
            </div>
          </div>
          {showDescription && status.description && (
            <div className={`text-xs mt-1 ${classes.text} opacity-75`}>
              {status.description}
            </div>
          )}
        </div>
        {showBadge && status.status !== 'not-set' && (
          <span className={`text-xs px-2 py-1 rounded border ${classes.badge} whitespace-nowrap`}>
            {status.label}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * DateFieldRow Component
 *
 * Displays multiple dates in a row (e.g., Target Date and Actual Date)
 */
export const DateFieldRow = ({
  dates = [], // Array of { date, label, isCompleted } objects
  isCompleted = false,
  showIcons = true
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {dates.map((dateConfig, index) => (
        <DateField
          key={index}
          date={dateConfig.date}
          label={dateConfig.label}
          isCompleted={dateConfig.isCompleted ?? isCompleted}
          showIcon={showIcons}
          showBadge={true}
          variant="default"
        />
      ))}
    </div>
  );
};

/**
 * DateBadge Component
 *
 * Simple badge variant for displaying dates in lists or tables
 */
export const DateBadge = ({
  date,
  isCompleted = false,
  thresholds = {}
}) => {
  const dateInfo = formatDateWithStatus(date, isCompleted, thresholds);
  const { formatted, classes } = dateInfo;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${classes.badge}`}>
      <Calendar className="w-3 h-3" />
      {formatted}
    </span>
  );
};

export default DateField;
