import React from 'react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  className = '',
  ...props 
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const variantClasses = {
    primary: 'bg-violet-500 text-white hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-700 shadow-sm hover:shadow-md disabled:bg-gray-300 dark:disabled:bg-gray-700',
    secondary: 'bg-transparent border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800',
    danger: 'bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700',
    success: 'text-white', // Uses inline style for brand olive #94AF32
    warning: 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700',
    ghost: 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800',
  };

  // Brand olive color for success variant
  const successStyle = variant === 'success' ? {
    backgroundColor: '#94AF32',
    ':hover': { backgroundColor: '#7d9429' }
  } : {};

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={variant === 'success' ? { backgroundColor: '#94AF32' } : {}}
      onMouseEnter={variant === 'success' ? (e) => e.target.style.backgroundColor = '#7d9429' : undefined}
      onMouseLeave={variant === 'success' ? (e) => e.target.style.backgroundColor = '#94AF32' : undefined}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {Icon && iconPosition === 'left' && !loading && (
        <Icon className="w-5 h-5 mr-2" />
      )}
      {children}
      {Icon && iconPosition === 'right' && !loading && (
        <Icon className="w-5 h-5 ml-2" />
      )}
    </button>
  );
};

export default Button;