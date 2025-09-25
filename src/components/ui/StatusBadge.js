import React from 'react';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

const StatusBadge = ({ status, size = 'sm' }) => {
  const statusConfig = {
    active: { color: 'green', label: 'Active', icon: CheckCircle },
    pending: { color: 'amber', label: 'Pending', icon: Clock },
    critical: { color: 'red', label: 'Critical', icon: AlertCircle },
    complete: { color: 'violet', label: 'Complete', icon: CheckCircle },
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
        backgroundColor: `${config.color === 'green' ? '#10B98120' : config.color === 'amber' ? '#F59E0B20' : config.color === 'red' ? '#EF444420' : '#8B5CF620'}`,
        color: `${config.color === 'green' ? '#10B981' : config.color === 'amber' ? '#F59E0B' : config.color === 'red' ? '#EF4444' : '#8B5CF6'}`,
        border: `1px solid ${config.color === 'green' ? '#10B98140' : config.color === 'amber' ? '#F59E0B40' : config.color === 'red' ? '#EF444440' : '#8B5CF640'}`
      }}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export default StatusBadge;