/**
 * ServiceTimeTracker.js
 * Time tracking component for service tickets
 * Shows check-in/out button, elapsed time, and time log history
 */

import React, { useState } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  Plus,
  Edit,
  Loader2,
  User,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useServiceTimeTracking, formatElapsedTime } from '../../hooks/useServiceTimeTracking';
import ServiceTimeEntryModal from './ServiceTimeEntryModal';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

/**
 * Format date for display
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Format time for display
 */
const formatTime = (dateStr) => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const ServiceTimeTracker = ({ ticket, technicians = [], onUpdate }) => {
  const { user } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const {
    isCheckedIn,
    elapsedMinutes,
    loading,
    error,
    timeLogs,
    timeSummary,
    totalHours,
    checkIn,
    checkOut,
    refresh
  } = useServiceTimeTracking(ticket?.id, user);

  const hourlyRate = ticket?.hourly_rate || 150;
  const laborCost = Math.round(totalHours * hourlyRate * 100) / 100;

  const handleCheckIn = async () => {
    const success = await checkIn();
    if (success && onUpdate) {
      onUpdate();
    }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    const success = await checkOut();
    setCheckingOut(false);
    if (success && onUpdate) {
      onUpdate();
    }
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setShowEntryModal(true);
  };

  const handleAddManual = () => {
    setEditingEntry(null);
    setShowEntryModal(true);
  };

  const handleEntrySaved = async () => {
    await refresh();
    if (onUpdate) {
      onUpdate();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-zinc-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading time tracking...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Check-in/out button */}
          {isCheckedIn ? (
            <button
              onClick={handleCheckOut}
              disabled={checkingOut}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {checkingOut ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <LogOut size={18} />
              )}
              Check Out
            </button>
          ) : (
            <button
              onClick={handleCheckIn}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: `${brandColors.success}20`,
                border: `1px solid ${brandColors.success}80`,
                color: brandColors.success
              }}
            >
              <LogIn size={18} />
              Check In
            </button>
          )}

          {/* Elapsed time display */}
          {isCheckedIn && (
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              <span className="font-mono text-lg text-amber-400">
                {formatElapsedTime(elapsedMinutes)}
              </span>
            </div>
          )}
        </div>

        {/* Add manual entry */}
        <button
          onClick={handleAddManual}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          <Plus size={16} />
          Add Entry
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-zinc-700/50 rounded-lg">
          <div className="text-xs text-zinc-400 mb-1">Total Time</div>
          <div className="text-lg font-medium text-white">
            {totalHours > 0 ? `${totalHours.toFixed(1)}h` : '--'}
          </div>
        </div>
        <div className="p-3 bg-zinc-700/50 rounded-lg">
          <div className="text-xs text-zinc-400 mb-1">Rate</div>
          <div className="text-lg font-medium text-white">
            ${hourlyRate}/hr
          </div>
        </div>
        <div className="p-3 bg-zinc-700/50 rounded-lg">
          <div className="text-xs text-zinc-400 mb-1">Labor Cost</div>
          <div className="text-lg font-medium" style={{ color: brandColors.success }}>
            ${laborCost.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Time by Technician */}
      {timeSummary.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-zinc-400">Time by Technician</div>
          {timeSummary.map((tech, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-zinc-700/30 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <User size={14} className="text-zinc-400" />
                <span className="text-white text-sm">{tech.technician_name || tech.technician_email}</span>
                {tech.has_active_session && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                    Active
                  </span>
                )}
              </div>
              <span className="text-zinc-300 text-sm font-mono">
                {tech.total_hours?.toFixed(1) || 0}h
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Time Log History - Collapsible */}
      {timeLogs.length > 0 && (
        <div className="border-t border-zinc-700 pt-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-sm text-zinc-400">
              Time Entries ({timeLogs.length})
            </span>
            {showHistory ? (
              <ChevronUp size={16} className="text-zinc-400" />
            ) : (
              <ChevronDown size={16} className="text-zinc-400" />
            )}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {timeLogs.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => handleEditEntry(entry)}
                  className="p-3 bg-zinc-700/30 rounded-lg cursor-pointer hover:bg-zinc-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm text-white mb-1">
                        <span>{formatDate(entry.check_in)}</span>
                        <span className="text-zinc-400">
                          {formatTime(entry.check_in)} - {entry.check_out ? formatTime(entry.check_out) : 'Active'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <User size={12} />
                        <span>{entry.technician_name || entry.technician_email}</span>
                        {entry.is_manual_entry && (
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                            Manual
                          </span>
                        )}
                      </div>
                      {entry.notes && (
                        <div className="text-xs text-zinc-500 mt-1 italic">{entry.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-zinc-300">
                        {entry.duration_hours ? `${entry.duration_hours}h` : '--'}
                      </span>
                      <Edit size={14} className="text-zinc-400" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {timeLogs.length === 0 && !isCheckedIn && (
        <div className="text-center py-4 text-zinc-500 text-sm">
          No time entries yet. Check in to start tracking time.
        </div>
      )}

      {/* Entry Modal */}
      <ServiceTimeEntryModal
        isOpen={showEntryModal}
        onClose={() => {
          setShowEntryModal(false);
          setEditingEntry(null);
        }}
        ticketId={ticket?.id}
        entry={editingEntry}
        technicians={technicians}
        currentUser={user}
        onSaved={handleEntrySaved}
      />
    </div>
  );
};

export default ServiceTimeTracker;
