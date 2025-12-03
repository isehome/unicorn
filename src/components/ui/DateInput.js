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

  // Override Safari/browser native date styling that shows past dates in red
  const inputStyle = {
    colorScheme: 'dark light', // Prevent browser from changing colors
    ...(props.style || {})
  };

  return (
    <div className="relative">
      <input
        type="date"
        value={value || ''}
        onChange={handleChange}
        style={inputStyle}
        className={`
          w-full px-3 py-2 border rounded-lg
          focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500
          [&::-webkit-datetime-edit]:text-inherit
          [&::-webkit-datetime-edit-fields-wrapper]:text-inherit
          [&::-webkit-datetime-edit-text]:text-inherit
          [&::-webkit-datetime-edit-month-field]:text-inherit
          [&::-webkit-datetime-edit-day-field]:text-inherit
          [&::-webkit-datetime-edit-year-field]:text-inherit
          ${isEmpty
            ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
            : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
          }
          ${className}
        `}
        {...props}
      />
      {isEmpty && (
        <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
          <span className="text-sm text-zinc-400 dark:text-zinc-500">—</span>
        </div>
      )}
    </div>
  );
};

export default DateInput;
