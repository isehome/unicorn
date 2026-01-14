import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertCircle, FileText, Clock, CalendarPlus, Info, User, Plus, Trash2 } from 'lucide-react';
import Button from './ui/Button';
import DateInput from './ui/DateInput';
import DateField from './ui/DateField';
import TimeSelectionGrid from './ui/TimeSelectionGrid';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, fetchEventsForDate } from '../services/microsoftCalendarService';
import { projectStakeholdersService, todoStakeholdersService } from '../services/supabaseService';
import { stakeholderColors } from '../styles/styleSystem';

const TodoDetailModal = ({
  todo,
  onClose,
  onUpdate,
  onSave,
  onToggleComplete,
  onDelete,
  styles,
  palette: rawPalette
}) => {
  useTheme(); // Ensure theme context is available

  // Ensure palette is always a valid object with required properties
  const palette = {
    success: rawPalette?.success || '#94AF32',
    warning: rawPalette?.warning || '#F59E0B',
    info: rawPalette?.info || '#3B82F6',
    primary: rawPalette?.primary || '#8B5CF6',
    textSecondary: rawPalette?.textSecondary || '#71717A',
    textPrimary: rawPalette?.textPrimary || '#18181B',
    ...rawPalette
  };
  const authContext = useAuth();
  const { publishState, registerActions, unregisterActions } = useAppState();

  // Tab state for AI awareness (details vs comments)
  const [activeTab, setActiveTab] = useState('details');
  const [title, setTitle] = useState(todo?.title || '');
  const [description, setDescription] = useState(todo?.description || '');
  const [dueBy, setDueBy] = useState(todo?.dueBy ? String(todo.dueBy).substring(0, 10) : '');
  const [doBy, setDoBy] = useState(todo?.doBy ? String(todo.doBy).substring(0, 10) : '');
  const [doByTime, setDoByTime] = useState(todo?.doByTime || todo?.do_by_time || '09:00');
  const [plannedHours, setPlannedHours] = useState(todo?.plannedHours || todo?.planned_hours || 1);
  const [importance, setImportance] = useState(todo?.importance || 'normal');
  const [calendarEventId, setCalendarEventId] = useState(todo?.calendarEventId || todo?.calendar_event_id || null);
  const [saving, setSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [error, setError] = useState('');
  const [showDoByInfo, setShowDoByInfo] = useState(false);

  // New state for stakeholders and calendar events
  const [stakeholders, setStakeholders] = useState([]);
  const [availableStakeholders, setAvailableStakeholders] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState(false);

  // Load stakeholders
  useEffect(() => {
    const loadStakeholders = async () => {
      const pid = todo?.project_id || todo?.projectId;
      if (!pid) return;

      try {
        const [team, assigned] = await Promise.all([
          projectStakeholdersService.getForProject(pid),
          todo?.id ? todoStakeholdersService.getForTodo(todo.id) : Promise.resolve([])
        ]);

        const internal = (team.internal || []).map(p => ({ ...p, category: 'internal' }));
        const external = (team.external || []).map(p => ({ ...p, category: 'external' }));
        setAvailableStakeholders([...internal, ...external]);
        setStakeholders(assigned);
      } catch (err) {
        console.error('Failed to load stakeholders', err);
      }
    };
    loadStakeholders();
  }, [todo?.project_id, todo?.projectId, todo?.id]);

  // Load calendar events when date changes
  useEffect(() => {
    const loadEvents = async () => {
      if (!doBy || !authContext.accessToken) return;
      setLoadingEvents(true);
      const result = await fetchEventsForDate(authContext, new Date(doBy));
      if (result.connected) {
        setCalendarEvents(result.events);
      }
      setLoadingEvents(false);
    };
    loadEvents();
  }, [doBy, authContext.accessToken]);

  const handleSelectSlot = (startTime, duration) => {
    setDoByTime(startTime);
    setPlannedHours(duration);
  };

  const handleAddStakeholder = async (stakeholder) => {
    if (!todo?.id) return;
    try {
      // Use assignment_id (which is the project_stakeholder.id from the view)
      const projectStakeholderId = stakeholder.assignment_id || stakeholder.id;
      await todoStakeholdersService.add(todo.id, projectStakeholderId);
      // Refresh list
      const updated = await todoStakeholdersService.getForTodo(todo.id);
      setStakeholders(updated);
      setShowStakeholderDropdown(false);
    } catch (err) {
      console.error('Failed to add stakeholder', err);
      setError('Failed to add stakeholder');
    }
  };

  const handleRemoveStakeholder = async (assignmentId) => {
    try {
      await todoStakeholdersService.remove(assignmentId);
      setStakeholders(prev => prev.filter(s => s.id !== assignmentId));
    } catch (err) {
      console.error('Failed to remove stakeholder', err);
      setError('Failed to remove stakeholder');
    }
  };

  useEffect(() => {
    setTitle(todo?.title || '');
    setDescription(todo?.description || '');
    setDueBy(todo?.dueBy ? String(todo.dueBy).substring(0, 10) : '');
    setDoBy(todo?.doBy ? String(todo.doBy).substring(0, 10) : '');
    setDoByTime(todo?.doByTime || todo?.do_by_time || '09:00');
    setPlannedHours(todo?.plannedHours || todo?.planned_hours || 1);
    setImportance(todo?.importance || 'normal');
    setCalendarEventId(todo?.calendarEventId || todo?.calendar_event_id || null);
  }, [todo]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION - Publish modal state
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (todo) {
      // Modal is open - publish state
      publishState({
        modal: {
          type: 'todo-detail',
          title: 'Todo Details',
          todoId: todo.id,
          todoTitle: todo.title,
          activeTab: activeTab,
          formFields: [
            'title',
            'description',
            'due_date',
            'importance',
            'do_date',
            'start_time',
            'duration_hours',
            'stakeholders'
          ],
          currentValues: {
            title,
            description,
            due_date: dueBy,
            importance,
            do_date: doBy,
            start_time: doByTime,
            duration_hours: plannedHours,
            stakeholders: stakeholders.map(s => ({
              id: s.id,
              name: s.contactName,
              role: s.roleName
            })),
            completed: todo.completed
          }
        }
      });
    } else {
      // Modal is closed - clear modal state
      publishState({ modal: null });
    }
  }, [
    publishState,
    todo,
    activeTab,
    title,
    description,
    dueBy,
    importance,
    doBy,
    doByTime,
    plannedHours,
    stakeholders
  ]);

  // Refs to hold latest function references for AI actions
  const handleSaveRef = React.useRef(null);
  const handleAddStakeholderRef = React.useRef(null);

  // Register actions for AI Brain
  useEffect(() => {
    if (!todo) return;

    const actions = {
      set_field: async ({ field, value }) => {
        try {
          switch (field) {
            case 'title':
              setTitle(value);
              return { success: true, message: `Title set to "${value}"` };
            case 'description':
              setDescription(value);
              return { success: true, message: 'Description updated' };
            case 'due_date':
              setDueBy(value || '');
              return { success: true, message: value ? `Due date set to ${value}` : 'Due date cleared' };
            case 'importance':
              if (['low', 'normal', 'high', 'critical'].includes(value)) {
                setImportance(value);
                return { success: true, message: `Importance set to ${value}` };
              }
              return { success: false, error: 'Invalid importance. Use: low, normal, high, critical' };
            case 'do_date':
              setDoBy(value || '');
              return { success: true, message: value ? `Do date set to ${value}` : 'Do date cleared' };
            case 'start_time':
              setDoByTime(value || '09:00');
              return { success: true, message: `Start time set to ${value}` };
            case 'duration_hours':
              const hours = parseFloat(value);
              if (!isNaN(hours) && hours > 0) {
                setPlannedHours(hours);
                return { success: true, message: `Duration set to ${hours} hours` };
              }
              return { success: false, error: 'Invalid duration. Must be a positive number.' };
            default:
              return { success: false, error: `Unknown field: ${field}` };
          }
        } catch (err) {
          return { success: false, error: err.message || 'Failed to set field' };
        }
      },
      switch_tab: async ({ tab }) => {
        if (['details', 'comments'].includes(tab)) {
          setActiveTab(tab);
          return { success: true, message: `Switched to ${tab} tab` };
        }
        return { success: false, error: 'Invalid tab. Use: details or comments' };
      },
      add_comment: async ({ comment }) => {
        // Comments not yet implemented in this modal, but action registered for future
        return { success: false, error: 'Comments feature not yet implemented in this modal' };
      },
      add_stakeholder: async ({ stakeholderName }) => {
        const match = availableStakeholders.find(s =>
          s.contact_name?.toLowerCase().includes(stakeholderName.toLowerCase())
        );
        if (match && handleAddStakeholderRef.current) {
          await handleAddStakeholderRef.current(match);
          return { success: true, message: `Added stakeholder: ${match.contact_name}` };
        }
        return { success: false, error: `Stakeholder "${stakeholderName}" not found in project` };
      },
      save_todo: async () => {
        try {
          if (handleSaveRef.current) {
            await handleSaveRef.current();
          }
          return { success: true, message: 'Todo saved successfully' };
        } catch (err) {
          return { success: false, error: err.message || 'Failed to save todo' };
        }
      },
      mark_complete: async () => {
        try {
          await onToggleComplete(todo);
          return { success: true, message: todo.completed ? 'Todo marked as open' : 'Todo marked as complete' };
        } catch (err) {
          return { success: false, error: err.message || 'Failed to toggle completion' };
        }
      },
      close: async () => {
        onClose();
        return { success: true, message: 'Modal closed' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [
    todo,
    registerActions,
    unregisterActions,
    availableStakeholders,
    onToggleComplete,
    onClose
  ]);

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

      const previousDoBy = todo?.doBy ? String(todo.doBy).substring(0, 10) : '';
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
          }, stakeholders.map(s => ({ email: s.email, name: s.contactName })));
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
      }, stakeholders.map(s => ({ email: s.email, name: s.contactName })));

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

  // Update refs for AI action handlers
  handleSaveRef.current = handleSave;
  handleAddStakeholderRef.current = handleAddStakeholder;

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
        className="w-full max-w-2xl rounded-2xl border overflow-hidden flex flex-col"
        style={{ ...styles.card, boxShadow: '0 24px 65px rgba(15, 23, 42, 0.35)', maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
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
            className="p-2 rounded-xl transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            style={{ color: palette.textSecondary }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
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

          {/* Row 1: Due Date and Importance */}
          <div className="grid gap-4 grid-cols-2">
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
                <AlertCircle size={16} />
                Importance
              </label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
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

          {/* Row 2: Do Date, Time, and Planned Hours (for calendar scheduling) */}
          <div className="p-4 rounded-xl border" style={{ borderColor: styles.card.borderColor, backgroundColor: withAlpha(palette.info || '#3b82f6', 0.05) }}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarPlus size={18} style={{ color: palette.info || '#3b82f6' }} />
              <span className="text-sm font-medium" style={styles.textPrimary}>
                Calendar Scheduling
              </span>
              <button
                type="button"
                onClick={() => setShowDoByInfo(!showDoByInfo)}
                className="p-0.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                style={{ color: palette.textSecondary }}
              >
                <Info size={14} />
              </button>
            </div>
            <div className="grid gap-4 grid-cols-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>
                  Do Date
                </label>
                <DateInput
                  value={doBy}
                  onChange={(e) => setDoBy(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>
                  Start Time
                </label>
                <input
                  type="time"
                  value={doByTime}
                  onChange={(e) => setDoByTime(e.target.value)}
                  disabled={saving || !doBy}
                  className={`w-full px-3 py-2 border rounded-lg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${!doBy
                    ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                    : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
                    }`}
                  style={{ fontSize: '16px' }}
                  title={doBy ? 'Start time for calendar event' : 'Set a Do Date first'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>
                  Duration (hrs)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={plannedHours}
                  onChange={(e) => setPlannedHours(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={{ ...styles.input, fontSize: '16px' }}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Time Selection Grid */}
          {doBy && (
            <div className="mt-4">
              <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>
                Available Time Slots
              </label>
              {loadingEvents ? (
                <div className="h-32 flex items-center justify-center border rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-sm text-zinc-500">Loading calendar...</span>
                </div>
              ) : (
                <TimeSelectionGrid
                  date={new Date(doBy)}
                  events={calendarEvents}
                  selectedStartTime={doByTime}
                  selectedDuration={plannedHours}
                  onSelectSlot={handleSelectSlot}
                  styles={styles}
                  palette={palette}
                />
              )}
            </div>
          )}

          {/* Stakeholders Section */}
          <div className="p-4 rounded-xl border" style={{ borderColor: styles.card.borderColor }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User size={16} style={{ color: palette.textSecondary }} />
                <span className="text-sm font-medium" style={styles.textPrimary}>
                  Stakeholders & Attendees
                </span>
                {stakeholders.length > 0 && (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: withAlpha(palette.primary || '#8b5cf6', 0.15), color: palette.primary || '#8b5cf6' }}
                  >
                    {stakeholders.length}
                  </span>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStakeholderDropdown(!showStakeholderDropdown)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  style={{ color: palette.primary || '#8b5cf6' }}
                >
                  <Plus size={18} />
                </button>

                {showStakeholderDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-64 max-h-60 overflow-y-auto rounded-xl border shadow-lg z-20 bg-white dark:bg-zinc-800" style={{ borderColor: styles.card.borderColor }}>
                    {availableStakeholders
                      .filter(s => !stakeholders.some(assigned => assigned.projectStakeholderId === (s.assignment_id || s.id)))
                      .map(stakeholder => (
                        <button
                          key={stakeholder.assignment_id || stakeholder.id}
                          onClick={() => handleAddStakeholder(stakeholder)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2"
                          style={{ borderBottom: `1px solid ${styles.card.borderColor}` }}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: stakeholder.category === 'internal' ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                          />
                          <div className="truncate">
                            <div className="font-medium" style={styles.textPrimary}>
                              {stakeholder.contact_name}
                            </div>
                            <div className="text-xs opacity-75" style={styles.textSecondary}>
                              {stakeholder.role_name}
                            </div>
                          </div>
                        </button>
                      ))}
                    {availableStakeholders.filter(s => !stakeholders.some(assigned => assigned.projectStakeholderId === (s.assignment_id || s.id))).length === 0 && (
                      <div className="px-3 py-2 text-xs text-center opacity-50" style={styles.textSecondary}>
                        No more stakeholders available
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {stakeholders.length === 0 ? (
                <div className="text-sm italic opacity-50" style={styles.textSecondary}>
                  No stakeholders assigned
                </div>
              ) : (
                stakeholders.map(stakeholder => (
                  <div
                    key={stakeholder.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-zinc-50 dark:bg-zinc-800/30"
                    style={{ borderColor: styles.card.borderColor }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stakeholder.isInternal ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                      />
                      <div>
                        <div className="text-sm font-medium" style={styles.textPrimary}>
                          {stakeholder.contactName}
                        </div>
                        <div className="text-xs opacity-75" style={styles.textSecondary}>
                          {stakeholder.roleName} • {stakeholder.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveStakeholder(stakeholder.id)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
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
        <div className="px-4 sm:px-6 py-4 border-t flex-shrink-0"
          style={{ borderColor: styles.card.borderColor }}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </Button>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onToggleComplete(todo)}
                disabled={saving}
              >
                {todo?.completed ? 'Mark Open' : 'Complete'}
              </Button>
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
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoDetailModal;
