import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertCircle, FileText, Clock, CalendarPlus, Info } from 'lucide-react';
import Button from './ui/Button';
import DateInput from './ui/DateInput';
import DateField from './ui/DateField';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '../services/microsoftCalendarService';

const TodoDetailModal = ({
  todo,
  onClose,
  onUpdate,
  onSave,
  onToggleComplete,
  onDelete,
  styles,
  palette
}) => {
  useTheme(); // Ensure theme context is available
  const authContext = useAuth();
  const [title, setTitle] = useState(todo?.title || '');
  const [description, setDescription] = useState(todo?.description || '');
  const [dueBy, setDueBy] = useState(todo?.dueBy ? String(todo.dueBy).substring(0,10) : '');
  const [doBy, setDoBy] = useState(todo?.doBy ? String(todo.doBy).substring(0,10) : '');
  const [doByTime, setDoByTime] = useState(todo?.doByTime || todo?.do_by_time || '09:00');
  const [plannedHours, setPlannedHours] = useState(todo?.plannedHours || todo?.planned_hours || 1);
  const [importance, setImportance] = useState(todo?.importance || 'normal');
  const [calendarEventId, setCalendarEventId] = useState(todo?.calendarEventId || todo?.calendar_event_id || null);
  const [saving, setSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [error, setError] = useState('');
  const [showDoByInfo, setShowDoByInfo] = useState(false);

  useEffect(() => {
    setTitle(todo?.title || '');
    setDescription(todo?.description || '');
    setDueBy(todo?.dueBy ? String(todo.dueBy).substring(0,10) : '');
    setDoBy(todo?.doBy ? String(todo.doBy).substring(0,10) : '');
    setDoByTime(todo?.doByTime || todo?.do_by_time || '09:00');
    setPlannedHours(todo?.plannedHours || todo?.planned_hours || 1);
    setImportance(todo?.importance || 'normal');
    setCalendarEventId(todo?.calendarEventId || todo?.calendar_event_id || null);
  }, [todo]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    // If Do By date is set, require planned hours
    if (doBy && (!plannedHours || plannedHours <= 0)) {
      setError('Planned hours is required when setting a Do By date');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const previousDoBy = todo?.doBy ? String(todo.doBy).substring(0,10) : '';
      const previousDoByTime = todo?.doByTime || todo?.do_by_time || '09:00';
      const doByChanged = doBy !== previousDoBy;
      const doByTimeChanged = doByTime !== previousDoByTime;
      const plannedHoursChanged = plannedHours !== (todo?.plannedHours || todo?.planned_hours || 1);
      let newCalendarEventId = calendarEventId;

      console.log('[TodoModal] Save triggered:', {
        doBy,
        doByTime,
        previousDoBy,
        doByChanged,
        doByTimeChanged,
        plannedHours,
        plannedHoursChanged,
        calendarEventId,
        hasAuthToken: !!authContext?.accessToken
      });

      // Handle calendar sync
      if (doBy && (doByChanged || doByTimeChanged || plannedHoursChanged)) {
        console.log('[TodoModal] Calendar sync condition met, creating/updating event');
        // Create or update calendar event
        if (calendarEventId) {
          // Update existing event
          const result = await updateCalendarEvent(authContext, calendarEventId, {
            title: title.trim(),
            doBy,
            doByTime,
            plannedHours,
            description: description.trim()
          });
          if (!result.success) {
            console.warn('[TodoModal] Failed to update calendar event:', result.error);
          }
        } else if (doBy) {
          // Create new event
          const result = await createCalendarEvent(authContext, {
            title: title.trim(),
            doBy,
            doByTime,
            plannedHours,
            description: description.trim()
          });
          if (result.success) {
            newCalendarEventId = result.eventId;
            setCalendarEventId(newCalendarEventId);
          } else {
            console.warn('[TodoModal] Failed to create calendar event:', result.error);
            // Don't block save if calendar sync fails
          }
        }
      } else if (!doBy && calendarEventId) {
        // Do By date was cleared, delete calendar event
        const result = await deleteCalendarEvent(authContext, calendarEventId);
        if (result.success) {
          newCalendarEventId = null;
          setCalendarEventId(null);
        }
      }

      // Use onUpdate if provided, otherwise fall back to onSave
      const updateFunc = onUpdate || onSave;
      if (!updateFunc) {
        throw new Error('No update function provided');
      }

      await updateFunc(todo.id, {
        title: title.trim(),
        description: description.trim() || null,
        due_by: dueBy || null,
        do_by: doBy || null,
        do_by_time: doBy ? doByTime : null,  // Only save time if date is set
        planned_hours: plannedHours || null,
        calendar_event_id: newCalendarEventId,
        importance: importance
      });

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update todo');
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!doBy) {
      setError('Please set a Do By date first');
      return;
    }
    if (!plannedHours || plannedHours <= 0) {
      setError('Please set planned hours');
      return;
    }

    try {
      setSyncingCalendar(true);
      setError('');

      const result = await createCalendarEvent(authContext, {
        title: title.trim() || todo?.title,
        doBy,
        plannedHours,
        description: description.trim()
      });

      if (result.success) {
        setCalendarEventId(result.eventId);
        // Save the calendar event ID to the todo
        const updateFunc = onUpdate || onSave;
        if (updateFunc) {
          await updateFunc(todo.id, { calendar_event_id: result.eventId });
        }
      } else {
        setError(result.error || 'Failed to add to calendar');
      }
    } catch (err) {
      setError(err.message || 'Failed to add to calendar');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleRemoveFromCalendar = async () => {
    if (!calendarEventId) return;

    try {
      setSyncingCalendar(true);
      setError('');

      const result = await deleteCalendarEvent(authContext, calendarEventId);

      if (result.success) {
        setCalendarEventId(null);
        // Remove the calendar event ID from the todo
        const updateFunc = onUpdate || onSave;
        if (updateFunc) {
          await updateFunc(todo.id, { calendar_event_id: null });
        }
      } else {
        setError(result.error || 'Failed to remove from calendar');
      }
    } catch (err) {
      setError(err.message || 'Failed to remove from calendar');
    } finally {
      setSyncingCalendar(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this todo?')) {
      try {
        await onDelete(todo.id);
        onClose();
      } catch (err) {
        setError(err.message || 'Failed to delete todo');
      }
    }
  };

  const importanceColors = {
    low: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22c55e' },
    normal: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
    high: { bg: 'rgba(251, 146, 60, 0.1)', text: '#fb923c' },
    critical: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' }
  };

  const withAlpha = (hex, alpha) => {
    if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
    const fullHex = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const r = parseInt(fullHex.slice(1, 3), 16);
    const g = parseInt(fullHex.slice(3, 5), 16);
    const b = parseInt(fullHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl rounded-2xl border overflow-hidden"
        style={{ ...styles.card, boxShadow: '0 24px 65px rgba(15, 23, 42, 0.35)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" 
             style={{ borderColor: styles.card.borderColor }}>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>
              Todo Details
            </h2>
            <span 
              className="px-2 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: todo?.completed 
                  ? withAlpha(palette.success, 0.15)
                  : withAlpha(palette.warning, 0.15),
                color: todo?.completed ? palette.success : palette.warning
              }}
            >
              {todo?.completed ? 'Completed' : 'Open'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: palette.textSecondary }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Todo title"
              className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
              <FileText size={16} />
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes or description..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              style={styles.input}
              disabled={saving}
            />
          </div>

          {/* Dates, Hours, and Importance */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <Calendar size={16} />
                Due Date
              </label>
              <DateInput
                value={dueBy}
                onChange={(e) => setDueBy(e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <Clock size={16} />
                Do Date
                <button
                  type="button"
                  onClick={() => setShowDoByInfo(!showDoByInfo)}
                  className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  style={{ color: palette.textSecondary }}
                >
                  <Info size={14} />
                </button>
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <DateInput
                    value={doBy}
                    onChange={(e) => setDoBy(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <input
                  type="time"
                  value={doByTime}
                  onChange={(e) => setDoByTime(e.target.value)}
                  disabled={saving || !doBy}
                  className={`w-24 px-2 py-2 border rounded-lg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                    !doBy
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50'
                  }`}
                  title={doBy ? 'Start time for calendar event' : 'Set a Do Date first'}
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <Clock size={16} />
                Planned Hours
              </label>
              <input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={plannedHours}
                onChange={(e) => setPlannedHours(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
                disabled={saving}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <AlertCircle size={16} />
                Importance
              </label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={{
                  ...styles.input,
                  color: importanceColors[importance]?.text || styles.input.color
                }}
                disabled={saving}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Do By Info Tooltip */}
          {showDoByInfo && (
            <div
              className="px-4 py-3 rounded-xl text-sm border"
              style={{
                backgroundColor: withAlpha(palette.info || '#3b82f6', 0.1),
                borderColor: withAlpha(palette.info || '#3b82f6', 0.3),
                color: styles.textPrimary.color
              }}
            >
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 flex-shrink-0" style={{ color: palette.info || '#3b82f6' }} />
                <div>
                  <p className="font-medium mb-1">Do Date vs Due Date</p>
                  <p className="opacity-80">
                    <strong>Due Date</strong> is when the task must be completed (the deadline).<br />
                    <strong>Do Date</strong> is when you plan to work on the task. Setting a Do Date will add this task to your calendar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Calendar Sync Status */}
          {doBy && (
            <div
              className="px-4 py-3 rounded-xl text-sm flex items-center justify-between"
              style={{
                backgroundColor: calendarEventId
                  ? withAlpha(palette.success, 0.1)
                  : withAlpha(palette.warning, 0.1),
                color: calendarEventId ? palette.success : palette.warning
              }}
            >
              <div className="flex items-center gap-2">
                <CalendarPlus size={16} />
                <span>
                  {calendarEventId
                    ? 'Synced to Outlook Calendar'
                    : 'Will sync to calendar on save'}
                </span>
              </div>
              {calendarEventId && (
                <button
                  type="button"
                  onClick={handleRemoveFromCalendar}
                  disabled={syncingCalendar}
                  className="text-xs px-2 py-1 rounded-lg hover:bg-white/20 transition-colors"
                >
                  {syncingCalendar ? 'Removing...' : 'Remove from Calendar'}
                </button>
              )}
            </div>
          )}

          {/* Importance indicator */}
          <div 
            className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: importanceColors[importance].bg,
              color: importanceColors[importance].text
            }}
          >
            <AlertCircle size={16} />
            This task has {importance === 'critical' ? 'critical' : importance} importance
          </div>

          {/* Metadata */}
          <div className="pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
            <div className="grid grid-cols-2 gap-4 text-xs" style={styles.textSecondary}>
              {todo?.created_at && (
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  <DateField date={todo.created_at} variant="inline" colorMode="timestamp" showTime={true} />
                </div>
              )}
              {todo?.updated_at && (
                <div>
                  <span className="font-medium">Updated:</span>{' '}
                  <DateField date={todo.updated_at} variant="inline" colorMode="timestamp" showTime={true} />
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" 
             style={{ borderColor: styles.card.borderColor }}>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleComplete(todo)}
              disabled={saving}
            >
              Mark as {todo?.completed ? 'Open' : 'Completed'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={saving}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoDetailModal;
