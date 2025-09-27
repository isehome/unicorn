import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectStakeholdersService, projectTodosService } from '../services/supabaseService';
import { CheckSquare, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TodosListPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('all');
  const dragId = useRef(null);
  const [missingSort, setMissingSort] = useState(false);

  const isDark = mode === 'dark';
  const selectClass = `px-3 py-2 rounded-xl border pr-8 ${isDark ? 'bg-slate-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`;

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
        // Try to order by sort_order if present; otherwise fall back gracefully
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
        setTodos(Array.isArray(data) ? data : []);
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
    let list = todos.filter(t => showCompleted ? true : !t.is_complete);
    if (projectFilter !== 'all') list = list.filter(t => t.project_id === projectFilter);
    return list;
  }, [todos, showCompleted, projectFilter]);

  const onDragStart = (id) => { dragId.current = id; };
  const onDropOn = async (targetId) => {
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    if (missingSort) {
      alert('To enable drag-to-reorder, add a sort_order column to project_todos (see migration note).');
      return;
    }
    // Require a specific project to avoid cross-project reorder confusion
    if (projectFilter === 'all') {
      alert('Select a specific project from the filter to reorder its to-dos.');
      return;
    }
    const srcIdx = visible.findIndex(t => t.id === sourceId);
    const tgtIdx = visible.findIndex(t => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const projectId = projectFilter !== 'all' ? projectFilter : visible[tgtIdx]?.project_id;
    const projectTodos = visible.filter(t => t.project_id === projectId);
    const reordered = [...projectTodos];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    // Recompute sort_order 0..n for this project's list
    const updates = reordered.map((t, idx) => ({ id: t.id, sort_order: idx }));
    // Update UI immediately across the full dataset
    setTodos(prev => prev.map(t => {
      const u = updates.find(x => x.id === t.id);
      return u ? { ...t, sort_order: u.sort_order } : t;
    }));
    try {
      await projectTodosService.reorder(projectId, updates);
    } catch (e) {
      // fallback silently; UI still reordered
      console.warn('Failed to persist sort order', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My To-dos</h1>
        <div className="flex items-center gap-2">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={selectClass}>
            <option value="all">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">Show completed</span>
          </label>
        </div>
      </div>
      {error && <div className="text-sm text-rose-500">{error}</div>}
      <div className="space-y-3">
        {visible.map((todo) => (
          <div
            key={todo.id}
            style={sectionStyles.card}
            className="p-4 rounded-2xl border"
            draggable
            onDragStart={() => onDragStart(todo.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropOn(todo.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      await projectTodosService.toggleCompletion(todo.id, !todo.is_complete);
                      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_complete: !t.is_complete } : t));
                    } catch (_) {}
                  }}
                  className="p-1"
                  title={todo.is_complete ? 'Mark as open' : 'Mark as done'}
                >
                  {todo.is_complete ? (
                    <CheckSquare className="w-4 h-4 text-green-600" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <div className="font-medium text-gray-900 dark:text-white">{todo.title}</div>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${todo.is_complete ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                {todo.is_complete ? 'Done' : 'Open'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">Project: {projects.find(p => p.id === todo.project_id)?.name || todo.project_id}</div>
              {!missingSort && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <span className="text-gray-500">Due</span>
                    <input
                      type="date"
                      value={todo.due_by ? String(todo.due_by).substring(0,10) : ''}
                      onChange={async (e) => {
                        const value = e.target.value || null;
                        try {
                          await supabase.from('project_todos').update({ due_by: value }).eq('id', todo.id);
                          setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, due_by: value } : t));
                        } catch (_) {}
                      }}
                      className={selectClass}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-gray-500">Do</span>
                    <input
                      type="date"
                      value={todo.do_by ? String(todo.do_by).substring(0,10) : ''}
                      onChange={async (e) => {
                        const value = e.target.value || null;
                        try {
                          await supabase.from('project_todos').update({ do_by: value }).eq('id', todo.id);
                          setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, do_by: value } : t));
                        } catch (_) {}
                      }}
                      className={selectClass}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-300">No to-dos match this filter.</div>
        )}
      </div>
    </div>
  );
};

export default TodosListPage;
