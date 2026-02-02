/**
 * ActiveTimerBadge.js
 * A floating badge that shows when a time tracking timer is running
 *
 * Features:
 * - Shows elapsed time in real-time
 * - Indicates service vs project timer
 * - Stays visible even when navigating between pages
 * - Can be clicked to navigate to active timer location
 * - Shows warning near 6:00 PM auto-stop time
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimeTrackingContext } from '../contexts/TimeTrackingContext';
import { Clock, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';

const ActiveTimerBadge = () => {
  const navigate = useNavigate();
  const {
    isTimerRunning,
    longestRunningTimer,
    formattedTime,
    activeServiceCount,
    activeProjectCount,
    totalActiveCount,
    activeServiceCheckIns,
    activeProjectCheckIns
  } = useTimeTrackingContext();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showAutoStopWarning, setShowAutoStopWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check if we're within 30 minutes of 6 PM
  useEffect(() => {
    const checkAutoStopWarning = () => {
      const now = new Date();
      const autoStopTime = new Date(now);
      autoStopTime.setHours(18, 0, 0, 0);

      const msUntilAutoStop = autoStopTime - now;
      const minutesUntilAutoStop = msUntilAutoStop / 60000;

      // Show warning if within 30 minutes of 6 PM and timer is running
      setShowAutoStopWarning(isTimerRunning && minutesUntilAutoStop > 0 && minutesUntilAutoStop <= 30);
    };

    checkAutoStopWarning();
    const interval = setInterval(checkAutoStopWarning, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Reset dismissed state when timer stops
  useEffect(() => {
    if (!isTimerRunning) {
      setDismissed(false);
    }
  }, [isTimerRunning]);

  // Don't render if no timer is running or dismissed
  if (!isTimerRunning || dismissed) {
    return null;
  }

  const handleNavigateToTimer = (type, id) => {
    if (type === 'service') {
      navigate(`/service/tickets/${id}`);
    } else if (type === 'project') {
      navigate(`/project/${id}`);
    }
    setIsExpanded(false);
  };

  const getTimerIcon = () => {
    if (showAutoStopWarning) {
      return <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />;
    }
    return <Clock className="w-4 h-4 animate-pulse" style={{ color: '#94AF32' }} />;
  };

  const allTimers = [
    ...Object.entries(activeServiceCheckIns).map(([id, data]) => ({
      type: 'service',
      id,
      name: data.ticketTitle || `Service Ticket`,
      checkIn: data.checkIn
    })),
    ...Object.entries(activeProjectCheckIns).map(([id, data]) => ({
      type: 'project',
      id,
      name: data.projectName || `Project`,
      checkIn: data.checkIn
    }))
  ];

  return (
    <div className="fixed bottom-20 right-4 z-50 sm:bottom-6">
      {/* Main Badge */}
      <div
        className={`
          bg-white dark:bg-zinc-800
          rounded-lg shadow-lg border
          ${showAutoStopWarning ? 'border-amber-400' : ''}
          overflow-hidden
          transition-all duration-200
          ${isExpanded ? 'w-72' : 'w-auto'}
        `}
        style={showAutoStopWarning ? {} : { borderColor: 'rgba(148, 175, 50, 0.5)' }}
      >
        {/* Collapsed View */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700"
          onClick={() => totalActiveCount > 1 ? setIsExpanded(!isExpanded) : handleNavigateToTimer(longestRunningTimer?.type, longestRunningTimer?.id)}
        >
          {getTimerIcon()}
          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
            {formattedTime}
          </span>
          {totalActiveCount > 1 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
              +{totalActiveCount - 1}
            </span>
          )}
          {totalActiveCount > 1 && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="ml-1 p-1 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded"
            title="Dismiss (timer keeps running)"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>
        </div>

        {/* Auto-stop Warning */}
        {showAutoStopWarning && (
          <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-700">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⏰ Auto-checkout at 6:00 PM
            </p>
          </div>
        )}

        {/* Expanded View - List of all active timers */}
        {isExpanded && totalActiveCount > 1 && (
          <div className="border-t border-gray-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
            {allTimers.map((timer) => {
              const elapsed = formatElapsedTimeFromDate(timer.checkIn);
              return (
                <div
                  key={`${timer.type}-${timer.id}`}
                  className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer flex items-center justify-between"
                  onClick={() => handleNavigateToTimer(timer.type, timer.id)}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`
                      text-[10px] uppercase font-medium px-1.5 py-0.5 rounded
                      ${timer.type === 'service'
                        ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                        : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'}
                    `}>
                      {timer.type === 'service' ? 'SVC' : 'PRJ'}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {timer.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {elapsed}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Format elapsed time from a date string
 */
const formatElapsedTimeFromDate = (startTime) => {
  if (!startTime) return '00:00:00';
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default ActiveTimerBadge;
