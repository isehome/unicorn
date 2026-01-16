/**
 * Date Utilities
 *
 * Comprehensive date formatting and status detection for project milestones and dates.
 * Provides visual hierarchy and color coding based on date proximity and completion status.
 */

/**
 * Format a date string for display
 *
 * TIMEZONE-SAFE: Parses date strings directly without using Date object
 * to avoid timezone conversion issues. Database stores dates as YYYY-MM-DD
 * (date only), and using new Date() interprets these as UTC midnight, which
 * then shifts when converted to local timezone.
 *
 * @param {string|null} dateString - ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
 * @param {object} options - Formatting options
 * @returns {string|null} - Formatted date or null if no date
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return null;

  const {
    format = 'short', // 'short' | 'long' | 'numeric'
    includeYear = true
  } = options;

  try {
    // Extract just the date part (handles both YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS)
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);

    // Validate parsed values
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      console.error('Invalid date string:', dateString);
      return null;
    }

    const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const longMonthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];

    if (format === 'short') {
      return includeYear
        ? `${shortMonthNames[month - 1]} ${day}, ${year}`
        : `${shortMonthNames[month - 1]} ${day}`;
    }

    if (format === 'long') {
      return includeYear
        ? `${longMonthNames[month - 1]} ${day}, ${year}`
        : `${longMonthNames[month - 1]} ${day}`;
    }

    if (format === 'numeric') {
      return `${month}/${day}/${year}`;
    }

    // Default to short format with year
    return `${shortMonthNames[month - 1]} ${day}, ${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
};

/**
 * Calculate days until/since a date
 *
 * TIMEZONE-SAFE: Parses date strings directly to avoid timezone issues.
 * Compares the date portion only, ignoring time components.
 *
 * @param {string} dateString - ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
 * @returns {number} - Positive for future, negative for past, 0 for today
 */
export const getDaysUntil = (dateString) => {
  if (!dateString) return null;

  try {
    // Parse the target date string directly (timezone-safe)
    const datePart = dateString.split('T')[0];
    const [targetYear, targetMonth, targetDay] = datePart.split('-').map(Number);

    // Get today's date in local timezone
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1; // getMonth() is 0-indexed
    const todayDay = now.getDate();

    // Create Date objects using local timezone (year, month-1, day)
    // This ensures both dates are in the same timezone context
    const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
    const today = new Date(todayYear, todayMonth - 1, todayDay);

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  } catch (error) {
    console.error('Error calculating days until:', error);
    return null;
  }
};

/**
 * Determine date status based on proximity and completion
 * @param {string} dateString - ISO date string
 * @param {boolean} isCompleted - Whether the associated task/milestone is completed
 * @param {object} options - Threshold options
 * @returns {object} - Status object with color, label, and urgency
 */
export const getDateStatus = (dateString, isCompleted = false, options = {}) => {
  const {
    warningDays = 7,  // Show warning when within this many days
    urgentDays = 3    // Show urgent when within this many days
  } = options;

  // No date set
  if (!dateString) {
    return {
      status: 'not-set',
      label: 'Not Set',
      color: 'gray',
      urgency: 'none',
      daysUntil: null,
      description: 'No date entered'
    };
  }

  // Completed section - dates are historical
  if (isCompleted) {
    return {
      status: 'completed',
      label: 'Completed',
      color: 'green',
      urgency: 'none',
      daysUntil: getDaysUntil(dateString),
      description: 'Section completed'
    };
  }

  const daysUntil = getDaysUntil(dateString);

  if (daysUntil === null) {
    return {
      status: 'invalid',
      label: 'Invalid Date',
      color: 'red',
      urgency: 'none',
      daysUntil: null,
      description: 'Date format invalid'
    };
  }

  // Past due
  if (daysUntil < 0) {
    const daysPast = Math.abs(daysUntil);
    return {
      status: 'past-due',
      label: 'Past Due',
      color: 'red',
      urgency: 'high',
      daysUntil,
      daysPast,
      description: `${daysPast} day${daysPast !== 1 ? 's' : ''} overdue`
    };
  }

  // Today
  if (daysUntil === 0) {
    return {
      status: 'today',
      label: 'Today',
      color: 'orange',
      urgency: 'high',
      daysUntil,
      description: 'Due today'
    };
  }

  // Urgent (within urgentDays)
  if (daysUntil <= urgentDays) {
    return {
      status: 'urgent',
      label: 'Urgent',
      color: 'orange',
      urgency: 'high',
      daysUntil,
      description: `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`
    };
  }

  // Warning (within warningDays)
  if (daysUntil <= warningDays) {
    return {
      status: 'upcoming',
      label: 'Upcoming',
      color: 'yellow',
      urgency: 'medium',
      daysUntil,
      description: `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`
    };
  }

  // Future (plenty of time)
  return {
    status: 'future',
    label: 'On Track',
    color: 'blue',
    urgency: 'low',
    daysUntil,
    description: `${daysUntil} day${daysUntil !== 1 ? 's' : ''} away`
  };
};

/**
 * Get Tailwind CSS classes for date status
 * @param {object} dateStatus - Date status object from getDateStatus
 * @param {string} variant - 'text' | 'bg' | 'border' | 'badge'
 * @returns {string} - Tailwind CSS classes
 */
export const getDateStatusClasses = (dateStatus, variant = 'text') => {
  if (!dateStatus) return '';

  const { status } = dateStatus;

  // Not set - always greyed out
  if (status === 'not-set') {
    if (variant === 'text') return 'text-gray-400 dark:text-gray-500';
    if (variant === 'bg') return 'bg-gray-100 dark:bg-zinc-800';
    if (variant === 'border') return 'border-gray-200 dark:border-gray-700';
    if (variant === 'badge') return 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700';
  }

  // Completed - subtle green (greyed out but positive)
  if (status === 'completed') {
    if (variant === 'text') return 'text-gray-500 dark:text-gray-400 line-through';
    if (variant === 'bg') return 'bg-gray-50 dark:bg-zinc-800/50';
    if (variant === 'border') return 'border-gray-200 dark:border-gray-700';
    if (variant === 'badge') return 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 opacity-60';
  }

  // Past due - strong red (very visible)
  if (status === 'past-due') {
    if (variant === 'text') return 'text-red-700 dark:text-red-400 font-bold';
    if (variant === 'bg') return 'bg-red-100 dark:bg-red-900/30';
    if (variant === 'border') return 'border-red-500 dark:border-red-600 border-2';
    if (variant === 'badge') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-500 dark:border-red-600 font-bold';
  }

  // Today - strong orange (very visible)
  if (status === 'today') {
    if (variant === 'text') return 'text-orange-700 dark:text-orange-400 font-bold';
    if (variant === 'bg') return 'bg-orange-100 dark:bg-orange-900/30';
    if (variant === 'border') return 'border-orange-500 dark:border-orange-600 border-2';
    if (variant === 'badge') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-500 dark:border-orange-600 font-bold';
  }

  // Urgent - strong orange (very visible)
  if (status === 'urgent') {
    if (variant === 'text') return 'text-orange-600 dark:text-orange-400 font-semibold';
    if (variant === 'bg') return 'bg-orange-50 dark:bg-orange-900/20';
    if (variant === 'border') return 'border-orange-400 dark:border-orange-600';
    if (variant === 'badge') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-400 dark:border-orange-600';
  }

  // Upcoming - yellow warning (visible)
  if (status === 'upcoming') {
    if (variant === 'text') return 'text-yellow-700 dark:text-yellow-400 font-medium';
    if (variant === 'bg') return 'bg-yellow-50 dark:bg-yellow-900/20';
    if (variant === 'border') return 'border-yellow-400 dark:border-yellow-600';
    if (variant === 'badge') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-400 dark:border-yellow-600';
  }

  // Future - calm blue (normal visibility)
  if (status === 'future') {
    if (variant === 'text') return 'text-blue-600 dark:text-blue-400';
    if (variant === 'bg') return 'bg-blue-50 dark:bg-blue-900/20';
    if (variant === 'border') return 'border-blue-300 dark:border-blue-700';
    if (variant === 'badge') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700';
  }

  return '';
};

/**
 * Format date with status context
 * @param {string} dateString - ISO date string
 * @param {boolean} isCompleted - Whether the section is completed
 * @returns {object} - Formatted date with status info
 */
export const formatDateWithStatus = (dateString, isCompleted = false, options = {}) => {
  const dateStatus = getDateStatus(dateString, isCompleted, options);
  const formattedDate = formatDate(dateString, options);

  return {
    formatted: formattedDate || '—',
    status: dateStatus,
    classes: {
      text: getDateStatusClasses(dateStatus, 'text'),
      bg: getDateStatusClasses(dateStatus, 'bg'),
      border: getDateStatusClasses(dateStatus, 'border'),
      badge: getDateStatusClasses(dateStatus, 'badge')
    }
  };
};
