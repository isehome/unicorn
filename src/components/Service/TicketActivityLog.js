/**
 * TicketActivityLog.js
 * Collapsible activity/audit log for service tickets
 * Shows timestamped history of all changes with user info
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  FileText,
  Package,
  Camera,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Play,
  Pause,
  Trash2,
  Edit2,
  Plus,
  Loader2,
  History
} from 'lucide-react';
import { ticketActivityService, ACTIVITY_TYPES } from '../../services/ticketActivityService';

// Icon mapping for activity types
const getActivityIcon = (actionType) => {
  switch (actionType) {
    case ACTIVITY_TYPES.CREATED:
      return <Plus size={14} className="text-green-400" />;
    case ACTIVITY_TYPES.STATUS_CHANGE:
      return <CheckCircle size={14} className="text-blue-400" />;
    case ACTIVITY_TYPES.TIME_ENTRY_ADDED:
      return <Play size={14} className="text-emerald-400" />;
    case ACTIVITY_TYPES.TIME_ENTRY_UPDATED:
      return <Edit2 size={14} className="text-amber-400" />;
    case ACTIVITY_TYPES.TIME_ENTRY_DELETED:
      return <Trash2 size={14} className="text-red-400" />;
    case ACTIVITY_TYPES.PART_ADDED:
      return <Package size={14} className="text-purple-400" />;
    case ACTIVITY_TYPES.PART_UPDATED:
      return <Package size={14} className="text-amber-400" />;
    case ACTIVITY_TYPES.PART_REMOVED:
      return <Package size={14} className="text-red-400" />;
    case ACTIVITY_TYPES.TRIAGE_NOTE:
      return <FileText size={14} className="text-cyan-400" />;
    case ACTIVITY_TYPES.PHOTO_ADDED:
      return <Camera size={14} className="text-pink-400" />;
    case ACTIVITY_TYPES.QBO_INVOICE_CREATED:
      return <DollarSign size={14} className="text-green-400" />;
    case ACTIVITY_TYPES.ASSIGNMENT_CHANGE:
      return <User size={14} className="text-violet-400" />;
    case ACTIVITY_TYPES.PRIORITY_CHANGE:
      return <AlertCircle size={14} className="text-orange-400" />;
    default:
      return <Clock size={14} className="text-zinc-400" />;
  }
};

// Format relative time
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

// Format full timestamp
const formatFullTimestamp = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const TicketActivityLog = ({ ticketId, refreshTrigger = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load activities when expanded (lazy loading)
  useEffect(() => {
    if (isExpanded && ticketId && !hasLoaded) {
      loadActivities();
    }
  }, [isExpanded, ticketId]);

  // Reload when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && hasLoaded) {
      loadActivities();
    }
  }, [refreshTrigger]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ticketActivityService.getTicketActivity(ticketId);
      setActivities(data);
      setHasLoaded(true);
    } catch (err) {
      const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('[TicketActivityLog] Error loading activities:', errorMessage);
      setError(`Failed to load activity history: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-800/50">
      {/* Header - Always visible */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown size={18} className="text-zinc-400" />
          ) : (
            <ChevronRight size={18} className="text-zinc-400" />
          )}
          <History size={18} className="text-zinc-400" />
          <span className="font-medium text-white">Activity Log</span>
          {hasLoaded && activities.length > 0 && (
            <span className="text-xs text-zinc-500 ml-2">
              ({activities.length} {activities.length === 1 ? 'entry' : 'entries'})
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">
          {isExpanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      </button>

      {/* Content - Only visible when expanded */}
      {isExpanded && (
        <div className="border-t border-zinc-700">
          {loading && !hasLoaded ? (
            <div className="flex items-center justify-center py-8 text-zinc-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading activity...
            </div>
          ) : error ? (
            <div className="p-4 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          ) : activities.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">
              <History size={24} className="mx-auto mb-2 opacity-50" />
              <p>No activity recorded yet</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <div className="divide-y divide-zinc-700/50">
                {activities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="px-4 py-3 hover:bg-zinc-700/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="mt-0.5 flex-shrink-0">
                        {getActivityIcon(activity.action_type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Description */}
                        <p className="text-sm text-zinc-200">
                          {activity.description}
                        </p>

                        {/* User & Time */}
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                          {activity.user_name || activity.user_email ? (
                            <>
                              <User size={12} />
                              <span>{activity.user_name || activity.user_email}</span>
                              <span>•</span>
                            </>
                          ) : null}
                          <span title={formatFullTimestamp(activity.created_at)}>
                            {formatRelativeTime(activity.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refresh button at bottom if loaded */}
          {hasLoaded && (
            <div className="px-4 py-2 border-t border-zinc-700 bg-zinc-800/30">
              <button
                onClick={loadActivities}
                disabled={loading}
                className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <History size={12} />
                )}
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TicketActivityLog;
