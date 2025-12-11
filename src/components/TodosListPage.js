import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectStakeholdersService, projectTodosService } from '../services/supabaseService';
import { fetchTodayEvents } from '../services/microsoftCalendarService';
import { CheckSquare, Square, Calendar, List, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CalendarDayView from './dashboard/CalendarDayView';

const importanceRanking = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3
};

const importanceColors = {
  critical: '#ef4444',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#94AF32'  // brand success color
};

const getImportanceRank = (value) => {
  const key = typeof value === 'string' ? value.toLowerCase() : '';
  return importanceRanking[key] ?? importanceRanking.normal;
};

const TodosListPage = () => {
  const authContext = useAuth();
  const { user } = authContext;
  const { theme, mode } = useTheme();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('all');
  const [updatingTodoId, setUpdatingTodoId] = useState(null);
  const dragId = useRef(null);
  const [missingSort, setMissingSort] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverPos, setDragOverPos] = useState(null); // 'before' | 'after'
  const dragImageEl = useRef(null);

  // Calendar day view state
  const [viewMode, setViewMode] = useState('calendar'); // 'list' | 'calendar'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState({ data: null, isFetching: false, error: null });

  // Add todo state
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoProject, setNewTodoProject] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);

  // Fetch calendar events
  const fetchCalendar = useCallback(async () => {
    setCalendarData(prev => ({ ...prev, isFetching: true }));
    try {
      const result = await fetchTodayEvents(authContext);
      setCalendarData({ data: result, isFetching: false, error: null });
    } catch (err) {
      setCalendarData({ data: null, isFetching: false, error: err });
    }
  }, [authContext]);

  // Initial calendar fetch
  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchCalendar();
    }
  }, [viewMode, fetchCalendar]);

  const pageClasses = mode === 'dark'
    ? 'bg-zinc-900 text-gray-100'
    : 'bg-gray-50 text-gray-900';

  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';
    const subtleText = mode === 'dark' ? '#71717A' : '#6B7280';

    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        color: textPrimary
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      }
    };
  }, [mode, sectionStyles]);

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

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const ids = user?.email
          ? await projectStakeholdersService.getInternalProjectIdsByEmail(user.email)
          : [];
        if (!ids.length || !supabase) {
          setTodos([]);
          return;
        }
        const { data: projectRows } = await supabase
          .from('projects')
          .select('id,name')
          .in('id', ids);
        setProjects(Array.isArray(projectRows) ? projectRows : []);
        
        // Fetch todos with proper field names
        let { data, error } = await supabase
          .from('project_todos')
          .select('*')
          .in('project_id', ids)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });
        
        if (!error) setMissingSort(false);
        if (error && /sort_order/.test(error.message || '')) {
          setMissingSort(true);
          ({ data, error } = await supabase
            .from('project_todos')
            .select('*')
            .in('project_id', ids)
            .order('created_at', { ascending: false }));
        }
        if (error) throw error;
        
        // Map database fields to component state
        const mappedTodos = (data || []).map(todo => ({
          ...todo,
          completed: todo.is_complete || false,
          dueBy: todo.due_by,
          doBy: todo.do_by,
          doByTime: todo.do_by_time,
          plannedHours: todo.planned_hours,
          calendarEventId: todo.calendar_event_id,
          sortOrder: todo.sort_order
        }));
        
        setTodos(mappedTodos);
      } catch (e) {
        setError(e.message || 'Failed to load to-dos');
        setTodos([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.email]);

  const visible = useMemo(() => {
    let list = todos.filter(t => (showCompleted ? true : !t.completed));
    if (projectFilter !== 'all') list = list.filter(t => t.project_id === projectFilter);
    // Sort open items first, then by importance, manual sort order, created time
    return [...list].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const ai = getImportanceRank(a.importance);
      const bi = getImportanceRank(b.importance);
      if (ai !== bi) return ai - bi;
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  }, [todos, showCompleted, projectFilter]);

  const handleToggleTodo = async (todo) => {
    try {
      setUpdatingTodoId(todo.id);
      await projectTodosService.toggleCompletion(todo.id, !todo.completed);
      setTodos((prev) => prev.map((item) => (
        item.id === todo.id ? { ...item, completed: !todo.completed } : item
      )));
    } catch (err) {
      setError(err.message || 'Failed to update to-do');
    } finally {
      setUpdatingTodoId(null);
    }
  };

  const handleDeleteTodo = async (todoId) => {
    if (!window.confirm('Are you sure you want to delete this todo?')) return;
    try {
      await projectTodosService.remove(todoId);
      setTodos((prev) => prev.filter((todo) => todo.id !== todoId));
    } catch (err) {
      setError(err.message || 'Failed to delete to-do');
    }
  };

  const handleUpdateTodoImportance = async (todoId, value) => {
    try {
      const payload = { importance: value || 'normal' };
      await projectTodosService.update(todoId, payload);
      setTodos(prev => prev.map(t => (
        t.id === todoId ? { ...t, importance: value || 'normal' } : t
      )));
    } catch (e) {
      console.warn('Failed to update todo importance', e);
    }
  };

  // Handle todo resize from calendar day view (drag to change duration)
  const handleTodoResize = async (todo, newDuration) => {
    try {
      await projectTodosService.update(todo.id, { planned_hours: newDuration });
      setTodos(prev => prev.map(t => (
        t.id === todo.id ? { ...t, plannedHours: newDuration, planned_hours: newDuration } : t
      )));
    } catch (e) {
      console.warn('Failed to update todo duration', e);
    }
  };

  const handleOpenTodoDetail = (todo) => {
    navigate(`/projects/${todo.project_id}/todos/${todo.id}`);
  };

  const onDragStart = (e, id) => {
    dragId.current = id;
    setDraggingId(id);
    const card = e.currentTarget.closest('.todo-card');
    if (card && e.dataTransfer) {
      try {
        const clone = card.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        clone.style.width = `${card.offsetWidth}px`;
        document.body.appendChild(clone);
        e.dataTransfer.setDragImage(clone, Math.min(24, card.offsetWidth / 2), 16);
        dragImageEl.current = clone;
      } catch (_) {}
    }
  };

  const onDropOn = async (targetId) => {
    const sourceId = dragId.current;
    dragId.current = null;
    setDraggingId(null);
    setDragOverId(null);
    setDragOverPos(null);
    if (!sourceId || sourceId === targetId) return;
    if (missingSort) {
      alert('To enable drag-to-reorder, add a sort_order column to project_todos (see migration note).');
      return;
    }
    if (projectFilter === 'all') {
      alert('Please select a specific project to reorder its to-dos.');
      return;
    }
    const inferredProjectId = projectFilter;
    if (!inferredProjectId) return;
    const projectVisible = visible.filter(t => t.project_id === inferredProjectId);
    const from = projectVisible.findIndex(t => t.id === sourceId);
    const targetBase = projectVisible.findIndex(t => t.id === targetId);
    if (from === -1 || targetBase === -1) return;
    let to = targetBase + (dragOverPos === 'after' ? 1 : 0);
    const tmp = [...projectVisible];
    const [moved] = tmp.splice(from, 1);
    if (from < to) to -= 1;
    to = Math.min(Math.max(to, 0), tmp.length);
    tmp.splice(to, 0, moved);
    const updates = tmp.map((t, idx) => ({ id: t.id, sort_order: idx }));
    setTodos(prev => prev.map(t => {
      const u = updates.find(x => x.id === t.id);
      return u ? { ...t, sortOrder: u.sort_order } : t;
    }));
    try {
      await projectTodosService.reorder(inferredProjectId, updates);
    } catch (e) {
      console.warn('Failed to persist sort order', e);
    }
  };

  const onDragEndCard = () => {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverPos(null);
    if (dragImageEl.current) {
      try { document.body.removeChild(dragImageEl.current); } catch (_) {}
      dragImageEl.current = null;
    }
  };

  const handleAddTodo = async () => {
    if (!newTodoTitle.trim() || !newTodoProject) return;
    try {
      setAddingTodo(true);
      const created = await projectTodosService.create(newTodoProject, newTodoTitle.trim());
      if (created) {
        setTodos(prev => [{
          ...created,
          completed: false,
          dueBy: null,
          doBy: null,
          doByTime: null,
          plannedHours: null,
          calendarEventId: null,
          sortOrder: 0,
          importance: 'normal'
        }, ...prev]);
      }
      setNewTodoTitle('');
      setNewTodoProject('');
      setShowAddTodo(false);
    } catch (err) {
      setError(err.message || 'Failed to create todo');
    } finally {
      setAddingTodo(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${pageClasses}`}>
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="w-full px-3 sm:px-4 py-4 space-y-4">
        <div className="rounded-2xl border p-4" style={styles.card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold" style={styles.textPrimary}>My To-dos</h1>
              {/* View toggle */}
              <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: styles.card.borderColor }}>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors ${viewMode === 'calendar' ? 'bg-violet-500 text-white' : ''}`}
                  style={viewMode !== 'calendar' ? { color: palette.textSecondary } : {}}
                >
                  <Calendar size={16} />
                  Day
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-violet-500 text-white' : ''}`}
                  style={viewMode !== 'list' ? { color: palette.textSecondary } : {}}
                >
                  <List size={16} />
                  List
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              >
                <option value="all">All projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
              {viewMode === 'list' && (
                <button
                  onClick={() => setShowCompleted((prev) => !prev)}
                  className="text-xs underline"
                  style={styles.textSecondary}
                >
                  {showCompleted ? 'Hide completed' : 'Show completed'}
                </button>
              )}
              <button
                onClick={() => setShowAddTodo(true)}
                className="px-3 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus size={16} />
                Add Todo
              </button>
            </div>
          </div>

          {/* Add Todo Form */}
          {showAddTodo && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Todo title..."
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                  className="flex-1 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                  autoFocus
                />
                <select
                  value={newTodoProject}
                  onChange={(e) => setNewTodoProject(e.target.value)}
                  className="px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="">Select project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddTodo}
                    disabled={addingTodo || !newTodoTitle.trim() || !newTodoProject}
                    className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    {addingTodo ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddTodo(false);
                      setNewTodoTitle('');
                      setNewTodoProject('');
                    }}
                    className="px-4 py-2 rounded-xl border text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    style={{ borderColor: styles.card.borderColor, color: styles.textSecondary.color }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Calendar Day View */}
        {viewMode === 'calendar' && (
          <CalendarDayView
            sectionStyles={sectionStyles}
            calendar={{ ...calendarData, refetch: fetchCalendar }}
            todos={visible}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onConnectCalendar={() => {
              if (authContext?.login) {
                authContext.login();
              }
            }}
            onTodoClick={(todo) => handleOpenTodoDetail(todo)}
            onTodoResize={handleTodoResize}
          />
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-2">
            {visible.map((todo) => {
              const toggling = updatingTodoId === todo.id;
              const projectName = projects.find(p => p.id === todo.project_id)?.name || 'Unknown Project';

              return (
                <div key={todo.id}>
                  {dragOverId === todo.id && dragOverPos === 'before' && (
                    <div className="h-0.5 rounded" style={{ backgroundColor: palette.accent }} />
                  )}
                  <div
                    className="p-4 rounded-xl border todo-card cursor-pointer hover:shadow-md transition-shadow"
                    draggable
                    onClick={() => handleOpenTodoDetail(todo)}
                    onDragStart={(e) => onDragStart(e, todo.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      setDragOverId(todo.id);
                      setDragOverPos(e.clientY < midY ? 'before' : 'after');
                    }}
                    onDragEnter={() => setDragOverId(todo.id)}
                    onDragLeave={() => setDragOverId(null)}
                    onDragEnd={onDragEndCard}
                    onDrop={(e) => { e.stopPropagation(); onDropOn(todo.id); }}
                    style={{
                      ...styles.mutedCard,
                      opacity: draggingId === todo.id ? 0.6 : 1
                    }}
                  >
                    {/* Title row at top */}
                    <div className="flex items-center mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleTodo(todo); }}
                          disabled={toggling}
                          className="p-1"
                        >
                          {todo.completed ? (
                            <CheckSquare size={18} style={{ color: palette.success }} />
                          ) : (
                            <Square size={18} style={styles.textSecondary} />
                          )}
                        </button>
                        <span
                          className="flex-1 text-base font-medium"
                          style={{
                            ...styles.textPrimary,
                            textDecoration: todo.completed ? 'line-through' : 'none',
                            opacity: todo.completed ? 0.6 : 1
                          }}
                        >
                          {todo.title}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-lg" style={{
                          backgroundColor: withAlpha(palette.info, 0.1),
                          color: palette.info
                        }}>
                          {projectName}
                        </span>
                      </div>
                    </div>

                    {/* Controls row at bottom - only show dates if due date is set */}
                    <div className="flex items-center gap-2 text-xs">
                      {todo.dueBy && (
                        <>
                          <span style={styles.subtleText}>
                            Due: {new Date(todo.dueBy).toLocaleDateString()}
                          </span>
                          {todo.doBy && (
                            <span style={styles.subtleText}>
                              • Do: {new Date(todo.doBy).toLocaleDateString()}
                            </span>
                          )}
                        </>
                      )}
                      <select
                        value={todo.importance || 'normal'}
                        onChange={(e) => { e.stopPropagation(); handleUpdateTodoImportance(todo.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-1 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                        style={{
                          ...styles.input,
                          color: importanceColors[(todo.importance || 'normal').toLowerCase()] || styles.input.color
                        }}
                        title="Importance"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  {dragOverId === todo.id && dragOverPos === 'after' && (
                    <div className="h-0.5 rounded" style={{ backgroundColor: palette.accent }} />
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="text-center py-8 text-sm" style={styles.textSecondary}>
                {showCompleted ? 'No to-dos match this filter.' : 'All tasks complete.'}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default TodosListPage;
