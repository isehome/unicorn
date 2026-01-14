import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, AlertCircle, FileText, CalendarPlus, Info, User, Plus, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import Button from './ui/Button';
import DateInput from './ui/DateInput';
import DateField from './ui/DateField';
import TimeSelectionGrid from './ui/TimeSelectionGrid';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, fetchEventsForDate } from '../services/microsoftCalendarService';
import { projectStakeholdersService, todoStakeholdersService } from '../services/supabaseService';
import { stakeholderColors, enhancedStyles, paletteByMode } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';

const TodoDetailPage = () => {
    const { projectId, todoId } = useParams();
    const navigate = useNavigate();
    const { mode } = useTheme();
    const authContext = useAuth();
    const palette = paletteByMode[mode] || {};

    // Create styles object with borderColor for TimeSelectionGrid compatibility
    const styles = useMemo(() => {
        const sectionStyles = enhancedStyles.sections[mode] || {};
        const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
        const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
        const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
        const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';

        return {
            card: {
                backgroundColor: cardBackground,
                borderColor,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: sectionStyles.card?.borderRadius || '0.75rem',
                boxShadow: sectionStyles.card?.boxShadow || '0 1px 3px rgba(0, 0, 0, 0.05)',
                color: textPrimary
            },
            textPrimary: { color: textPrimary },
            textSecondary: { color: textSecondary },
            input: {
                backgroundColor: mode === 'dark' ? '#18181B' : '#F9FAFB',
                borderColor,
                color: textPrimary
            }
        };
    }, [mode]);

    // Loading/Error state
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    // Todo data
    const [todo, setTodo] = useState(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueBy, setDueBy] = useState('');
    const [doBy, setDoBy] = useState('');
    const [doByTime, setDoByTime] = useState('09:00');
    const [plannedHours, setPlannedHours] = useState(1);
    const [importance, setImportance] = useState('normal');
    const [calendarEventId, setCalendarEventId] = useState(null);

    // Calendar sync
    const [syncingCalendar, setSyncingCalendar] = useState(false);
    const [showDoByInfo, setShowDoByInfo] = useState(false);

    // Stakeholders
    const [stakeholders, setStakeholders] = useState([]);
    const [availableStakeholders, setAvailableStakeholders] = useState([]);
    const [showStakeholderDropdown, setShowStakeholderDropdown] = useState(false);

    // Calendar events
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // Load todo data
    const loadTodo = useCallback(async () => {
        if (!todoId) return;

        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('project_todos')
                .select('*')
                .eq('id', todoId)
                .single();

            if (fetchError) throw fetchError;

            setTodo(data);
            setTitle(data.title || '');
            setDescription(data.description || '');
            setDueBy(data.due_by ? String(data.due_by).substring(0, 10) : '');
            setDoBy(data.do_by ? String(data.do_by).substring(0, 10) : '');
            setDoByTime(data.do_by_time || '09:00');
            setPlannedHours(data.planned_hours || 1);
            setImportance(data.importance || 'normal');
            setCalendarEventId(data.calendar_event_id || null);

        } catch (err) {
            console.error('[TodoDetailPage] Failed to load todo:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [todoId]);

    useEffect(() => {
        loadTodo();
    }, [loadTodo]);

    // Load stakeholders
    useEffect(() => {
        const loadStakeholders = async () => {
            if (!projectId || !todoId) return;

            try {
                const [team, assigned] = await Promise.all([
                    projectStakeholdersService.getForProject(projectId),
                    todoStakeholdersService.getForTodo(todoId)
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
    }, [projectId, todoId]);

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
    }, [doBy, authContext.accessToken, authContext]);

    const handleSelectSlot = (startTime, duration) => {
        setDoByTime(startTime);
        setPlannedHours(duration);
    };

    const handleAddStakeholder = async (stakeholder) => {
        if (!todoId) return;
        try {
            const projectStakeholderId = stakeholder.assignment_id || stakeholder.id;
            await todoStakeholdersService.add(todoId, projectStakeholderId);
            const updated = await todoStakeholdersService.getForTodo(todoId);
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

    const handleSave = async () => {
        if (!title.trim()) {
            setError('Title is required');
            return;
        }

        if (doBy && (!plannedHours || plannedHours <= 0)) {
            setError('Planned hours is required when setting a Do By date');
            return;
        }

        try {
            setSaving(true);
            setError('');

            const previousDoBy = todo?.do_by ? String(todo.do_by).substring(0, 10) : '';
            const previousDoByTime = todo?.do_by_time || '09:00';
            const doByChanged = doBy !== previousDoBy;
            const doByTimeChanged = doByTime !== previousDoByTime;
            const plannedHoursChanged = plannedHours !== (todo?.planned_hours || 1);
            let newCalendarEventId = calendarEventId;

            // Handle calendar sync
            if (doBy && (doByChanged || doByTimeChanged || plannedHoursChanged)) {
                if (calendarEventId) {
                    const result = await updateCalendarEvent(authContext, calendarEventId, {
                        title: title.trim(),
                        doBy,
                        doByTime,
                        plannedHours,
                        description: description.trim()
                    });
                    if (!result.success) {
                        console.warn('[TodoDetailPage] Failed to update calendar event:', result.error);
                    }
                } else if (doBy) {
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
                        console.warn('[TodoDetailPage] Failed to create calendar event:', result.error);
                    }
                }
            } else if (!doBy && calendarEventId) {
                const result = await deleteCalendarEvent(authContext, calendarEventId);
                if (result.success) {
                    newCalendarEventId = null;
                    setCalendarEventId(null);
                }
            }

            // Save to database
            const { error: updateError } = await supabase
                .from('project_todos')
                .update({
                    title: title.trim(),
                    description: description.trim() || null,
                    due_by: dueBy || null,
                    do_by: doBy || null,
                    do_by_time: doBy ? doByTime : null,
                    planned_hours: plannedHours || null,
                    calendar_event_id: newCalendarEventId,
                    importance: importance,
                    updated_at: new Date().toISOString()
                })
                .eq('id', todoId);

            if (updateError) throw updateError;

            // Navigate back
            navigate(-1);
        } catch (err) {
            setError(err.message || 'Failed to update todo');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleComplete = async () => {
        try {
            setSaving(true);
            const newCompleted = !todo?.completed;

            const { error: updateError } = await supabase
                .from('project_todos')
                .update({
                    completed: newCompleted,
                    completed_at: newCompleted ? new Date().toISOString() : null,
                    completed_by: newCompleted ? authContext.user?.id : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', todoId);

            if (updateError) throw updateError;

            await loadTodo();
        } catch (err) {
            setError(err.message || 'Failed to update todo');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this todo?')) return;

        try {
            setSaving(true);

            // Delete calendar event if exists
            if (calendarEventId) {
                await deleteCalendarEvent(authContext, calendarEventId);
            }

            const { error: deleteError } = await supabase
                .from('project_todos')
                .delete()
                .eq('id', todoId);

            if (deleteError) throw deleteError;

            navigate(-1);
        } catch (err) {
            setError(err.message || 'Failed to delete todo');
            setSaving(false);
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
                await supabase
                    .from('project_todos')
                    .update({ calendar_event_id: null })
                    .eq('id', todoId);
            } else {
                setError(result.error || 'Failed to remove from calendar');
            }
        } catch (err) {
            setError(err.message || 'Failed to remove from calendar');
        } finally {
            setSyncingCalendar(false);
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

    if (loading) {
        return (
            <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
            </div>
        );
    }

    if (!todo) {
        return (
            <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <div className="max-w-4xl mx-auto px-4 py-8 text-center">
                    <p className={mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}>
                        Todo not found
                    </p>
                    <Button variant="secondary" onClick={() => navigate(-1)} className="mt-4">
                        Go Back
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
            {/* Sticky Header */}
            <div className={`sticky top-0 z-10 border-b ${mode === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className={`p-2 rounded-lg transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                        >
                            <ArrowLeft size={20} className={mode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className={`font-semibold truncate ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                {todo.title || 'Todo Details'}
                            </h1>
                            <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                {todo.completed ? 'Completed' : 'Open'}
                            </p>
                        </div>
                        <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                backgroundColor: todo.completed
                                    ? withAlpha(palette.success || '#22c55e', 0.15)
                                    : withAlpha(palette.warning || '#f59e0b', 0.15),
                                color: todo.completed ? (palette.success || '#22c55e') : (palette.warning || '#f59e0b')
                            }}
                        >
                            {todo.completed ? 'Completed' : 'Open'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-8">
                {/* Title */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <label className={`block text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                        Title
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Todo title"
                        className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                            mode === 'dark'
                                ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                                : 'bg-white border-zinc-300 text-zinc-900'
                        }`}
                        style={{ fontSize: '16px' }}
                        disabled={saving}
                    />
                </div>

                {/* Description */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                        <FileText size={16} />
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add notes or description..."
                        rows={4}
                        className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none ${
                            mode === 'dark'
                                ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                                : 'bg-white border-zinc-300 text-zinc-900'
                        }`}
                        style={{ fontSize: '16px' }}
                        disabled={saving}
                    />
                </div>

                {/* Due Date and Importance */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <div className="grid gap-4 grid-cols-2">
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
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
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                <AlertCircle size={16} />
                                Importance
                            </label>
                            <select
                                value={importance}
                                onChange={(e) => setImportance(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                                    mode === 'dark'
                                        ? 'bg-zinc-800 border-zinc-600'
                                        : 'bg-white border-zinc-300'
                                }`}
                                style={{
                                    fontSize: '16px',
                                    color: importanceColors[importance]?.text
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
                </div>

                {/* Calendar Scheduling */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarPlus size={18} className="text-blue-500" />
                        <span className={`text-sm font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                            Calendar Scheduling
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowDoByInfo(!showDoByInfo)}
                            className={`p-0.5 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-700' : 'hover:bg-zinc-200'}`}
                        >
                            <Info size={14} className={mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'} />
                        </button>
                    </div>
                    <div className="grid gap-4 grid-cols-3">
                        <div>
                            <label className={`block text-xs font-medium mb-1.5 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                Do Date
                            </label>
                            <DateInput
                                value={doBy}
                                onChange={(e) => setDoBy(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                        <div>
                            <label className={`block text-xs font-medium mb-1.5 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                Start Time
                            </label>
                            <input
                                type="time"
                                value={doByTime}
                                onChange={(e) => setDoByTime(e.target.value)}
                                disabled={saving || !doBy}
                                className={`w-full px-3 py-2 border rounded-lg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                                    !doBy
                                        ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                                        : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
                                }`}
                                style={{ fontSize: '16px' }}
                            />
                        </div>
                        <div>
                            <label className={`block text-xs font-medium mb-1.5 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                Duration (hrs)
                            </label>
                            <input
                                type="number"
                                min="0.5"
                                max="24"
                                step="0.5"
                                value={plannedHours}
                                onChange={(e) => setPlannedHours(parseFloat(e.target.value) || 1)}
                                className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                                    mode === 'dark'
                                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                                        : 'bg-white border-zinc-300 text-zinc-900'
                                }`}
                                style={{ fontSize: '16px' }}
                                disabled={saving}
                            />
                        </div>
                    </div>
                </div>

                {/* Time Selection Grid */}
                {doBy && (
                    <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                        <label className={`block text-xs font-medium mb-1.5 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Available Time Slots
                        </label>
                        {loadingEvents ? (
                            <div className={`h-32 flex items-center justify-center border rounded-xl ${mode === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
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
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <User size={16} className={mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'} />
                            <span className={`text-sm font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                Stakeholders & Attendees
                            </span>
                            {stakeholders.length > 0 && (
                                <span
                                    className="px-2 py-0.5 text-xs rounded-full"
                                    style={{ backgroundColor: withAlpha('#8b5cf6', 0.15), color: '#8b5cf6' }}
                                >
                                    {stakeholders.length}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowStakeholderDropdown(!showStakeholderDropdown)}
                                className={`p-1.5 rounded-lg transition-colors ${mode === 'dark' ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'}`}
                                style={{ color: '#8b5cf6' }}
                            >
                                <Plus size={18} />
                            </button>

                            {showStakeholderDropdown && (
                                <div className={`absolute right-0 top-full mt-1 w-64 max-h-60 overflow-y-auto rounded-xl border shadow-lg z-20 ${
                                    mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'
                                }`}>
                                    {availableStakeholders
                                        .filter(s => !stakeholders.some(assigned => assigned.projectStakeholderId === (s.assignment_id || s.id)))
                                        .map(stakeholder => (
                                            <button
                                                key={stakeholder.assignment_id || stakeholder.id}
                                                onClick={() => handleAddStakeholder(stakeholder)}
                                                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                                                    mode === 'dark' ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-50'
                                                }`}
                                                style={{ borderBottom: `1px solid ${mode === 'dark' ? '#3f3f46' : '#e4e4e7'}` }}
                                            >
                                                <div
                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: stakeholder.category === 'internal' ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                                                />
                                                <div className="truncate">
                                                    <div className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                                                        {stakeholder.contact_name}
                                                    </div>
                                                    <div className={`text-xs opacity-75 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                        {stakeholder.role_name}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    {availableStakeholders.filter(s => !stakeholders.some(assigned => assigned.projectStakeholderId === (s.assignment_id || s.id))).length === 0 && (
                                        <div className={`px-3 py-2 text-xs text-center opacity-50 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                            No more stakeholders available
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        {stakeholders.length === 0 ? (
                            <div className={`text-sm italic opacity-50 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                No stakeholders assigned
                            </div>
                        ) : (
                            stakeholders.map(stakeholder => (
                                <div
                                    key={stakeholder.id}
                                    className={`flex items-center justify-between p-2 rounded-lg border ${
                                        mode === 'dark' ? 'bg-zinc-800/30 border-zinc-700' : 'bg-zinc-50 border-zinc-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: stakeholder.isInternal ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                                        />
                                        <div>
                                            <div className={`text-sm font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                                                {stakeholder.contactName}
                                            </div>
                                            <div className={`text-xs opacity-75 ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
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
                        className={`px-4 py-3 rounded-xl text-sm border ${
                            mode === 'dark' ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-200'
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
                            <div className={mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}>
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
                                ? withAlpha('#22c55e', 0.1)
                                : withAlpha('#f59e0b', 0.1),
                            color: calendarEventId ? '#22c55e' : '#f59e0b'
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
                <div className={`pt-3 border-t ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                    <div className={`grid grid-cols-2 gap-4 text-xs ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
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

                {/* Action Buttons - at end of content, not fixed footer */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDelete}
                            disabled={saving}
                            icon={Trash2}
                        >
                            Delete
                        </Button>

                        <div className="flex flex-wrap gap-2 justify-end">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleToggleComplete}
                                disabled={saving}
                                icon={CheckCircle}
                            >
                                {todo?.completed ? 'Mark Open' : 'Complete'}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate(-1)}
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

export default TodoDetailPage;
