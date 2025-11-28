import React from 'react';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

// Brand colors from styleSystem.js
const brandColors = {
  success: '#94AF32',  // brand success (olive green)
  warning: '#F59E0B',  // amber
  danger: '#EF4444',   // red
  accent: '#8B5CF6',   // violet
};

const StatusBadge = ({ status, size = 'sm' }) => {
  const statusConfig = {
    active: { color: brandColors.success, label: 'Active', icon: CheckCircle },
    pending: { color: brandColors.warning, label: 'Pending', icon: Clock },
    critical: { color: brandColors.danger, label: 'Critical', icon: AlertCircle },
    complete: { color: brandColors.accent, label: 'Complete', icon: CheckCircle },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
        border: `1px solid ${config.color}40`
      }}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export default StatusBadge;