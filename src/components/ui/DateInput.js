import React from 'react';

/**
 * DateInput Component
 *
 * A date input field that follows the application's date input standards.
 * ALL styling comes from styleSystem.js - no hard-coded values.
 *
 * Standards (from styleSystem.js):
 * - Empty fields: Orange background + "—" dash overlay
 * - Filled fields: White/normal background with date value
 * - NO gray backgrounds (too close to white)
 * - NO distinction between required/optional (all empty = orange)
 *
 * @param {string} value - The date value (YYYY-MM-DD format or empty string)
 * @param {function} onChange - Callback when date changes
 * @param {string} className - Additional CSS classes
 * @param {object} ...props - Additional input props
 */
const DateInput = ({
  value,
  onChange,
  className = '',
  ...props
}) => {
  const isEmpty = !value || value === '';

  // Auto-close the date picker after selection
  const handleChange = (e) => {
    onChange(e);
    // Blur the input to close the date picker
    e.target.blur();
  };

  return (
    <div className="relative">
      <input
        type="date"
        value={value || ''}
        onChange={handleChange}
        className={`
          w-full px-3 py-2 border rounded-lg
          focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500
          ${isEmpty
            ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 text-gray-500 dark:text-gray-400'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50'
          }
          ${className}
        `}
        {...props}
      />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
        </div>
      )}
    </div>
  );
};

export default DateInput;
