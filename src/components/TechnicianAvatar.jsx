/**
 * TechnicianAvatar.jsx
 * Reusable avatar component for displaying technicians/users with their custom profile color
 * Falls back to a consistent hash-based color when no custom color is set
 */

import React, { memo } from 'react';

// Default color palette for hash-based color generation
const DEFAULT_COLORS = [
  '#8B5CF6', // violet
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#6366F1', // indigo
  '#14B8A6', // teal
];

const DEFAULT_COLOR = '#71717A'; // zinc-500

/**
 * Generate a consistent color based on name hash
 * Same name will always produce the same color
 */
export const getColorFromName = (name) => {
  if (!name) return DEFAULT_COLOR;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
};

/**
 * Generate initials from a name
 * "John Smith" -> "JS", "John" -> "J"
 */
export const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * TechnicianAvatar Component
 *
 * @param {Object} props
 * @param {string} props.name - The technician/user name
 * @param {string} props.color - Custom avatar color (from profile), overrides hash-based color
 * @param {string} props.size - Size variant: 'xs' | 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showBorder - Whether to show a border (default: false)
 * @param {string} props.borderColor - Border color (default: 'border-zinc-800')
 * @param {function} props.onClick - Click handler
 * @param {string} props.title - Tooltip title (defaults to name)
 */
const TechnicianAvatar = memo(({
  name,
  color,
  size = 'md',
  className = '',
  showBorder = false,
  borderColor = 'border-zinc-800',
  onClick,
  title
}) => {
  const avatarColor = color || getColorFromName(name);
  const initials = getInitials(name);

  // Size configurations
  const sizes = {
    xs: { container: 'w-4 h-4', text: 'text-[8px]', border: 'border' },
    sm: { container: 'w-5 h-5', text: 'text-[10px]', border: 'border' },
    md: { container: 'w-8 h-8', text: 'text-xs', border: 'border-2' },
    lg: { container: 'w-10 h-10', text: 'text-sm', border: 'border-2' },
    xl: { container: 'w-12 h-12', text: 'text-base', border: 'border-2' },
  };

  const sizeConfig = sizes[size] || sizes.md;

  const containerClasses = `
    ${sizeConfig.container}
    ${sizeConfig.text}
    ${showBorder ? `${sizeConfig.border} ${borderColor}` : ''}
    rounded-full flex items-center justify-center font-bold text-white
    ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={containerClasses}
      style={{ backgroundColor: avatarColor }}
      onClick={onClick}
      title={title || name || 'Unknown'}
      type={onClick ? 'button' : undefined}
    >
      {initials}
    </Component>
  );
});

TechnicianAvatar.displayName = 'TechnicianAvatar';

/**
 * UnassignedAvatar Component
 * Shows a placeholder when no technician is assigned
 */
export const UnassignedAvatar = memo(({
  size = 'md',
  className = '',
  onClick,
  title = 'Unassigned'
}) => {
  const sizes = {
    xs: { container: 'w-4 h-4', text: 'text-[8px]' },
    sm: { container: 'w-5 h-5', text: 'text-[10px]' },
    md: { container: 'w-8 h-8', text: 'text-xs' },
    lg: { container: 'w-10 h-10', text: 'text-sm' },
    xl: { container: 'w-12 h-12', text: 'text-base' },
  };

  const sizeConfig = sizes[size] || sizes.md;

  const containerClasses = `
    ${sizeConfig.container}
    ${sizeConfig.text}
    rounded-full flex items-center justify-center font-medium
    bg-zinc-600 text-zinc-400 border border-dashed border-zinc-500
    ${onClick ? 'cursor-pointer hover:bg-zinc-500 hover:text-zinc-300 transition-colors' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={containerClasses}
      onClick={onClick}
      title={title}
      type={onClick ? 'button' : undefined}
    >
      ?
    </Component>
  );
});

UnassignedAvatar.displayName = 'UnassignedAvatar';

export default TechnicianAvatar;
