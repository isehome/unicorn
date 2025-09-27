import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useTheme } from '../contexts/ThemeContext';
import { projectStakeholdersService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';

const TodosListPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [myProjectIds, setMyProjectIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const ids = user?.email ? await projectStakeholdersService.getInternalProjectIdsByEmail(user.email) : [];
      setMyProjectIds(ids);
      if (ids.length && supabase) {
        const { data } = await supabase
          .from('project_todos')
          .select('*')
          .in('project_id', ids)
          .order('created_at', { ascending: false });
        setTodos(Array.isArray(data) ? data : []);
      } else {
        setTodos([]);
      }
      setLoading(false);
    };
    load();
  }, [user?.email]);

  const visible = useMemo(() => {
    return todos.filter(t => showCompleted ? true : !t.is_complete);
  }, [todos, showCompleted]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My To-dos</h1>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">Show completed</span>
        </label>
      </div>
      <div className="space-y-3">
        {visible.map((todo) => (
          <div key={todo.id} style={sectionStyles.card} className="p-4 rounded-2xl border">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{todo.title}</div>
                <div className="text-xs text-gray-500">Project: {todo.project_id}</div>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${todo.is_complete ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                {todo.is_complete ? 'Done' : 'Open'}
              </span>
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

