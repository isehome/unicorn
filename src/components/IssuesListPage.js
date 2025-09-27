import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectStakeholdersService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const IssuesListPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState([]);
  const [filter, setFilter] = useState('open'); // open | closed | all
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]); // {id,name}
  const [projectFilter, setProjectFilter] = useState('all');
  const [blockedOnly, setBlockedOnly] = useState(false);

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
          setIssues([]);
          return;
        }
        // load project names for filter + display
        const { data: projectRows } = await supabase
          .from('projects')
          .select('id,name')
          .in('id', ids);
        setProjects(Array.isArray(projectRows) ? projectRows : []);
        // Prefer view if available
        let { data, error } = await supabase
          .from('issues_with_stats')
          .select('*')
          .in('project_id', ids)
          .order('created_at', { ascending: false });
        if (error) {
          ({ data, error } = await supabase
            .from('issues')
            .select('*')
            .in('project_id', ids)
            .order('created_at', { ascending: false }));
        }
        if (error) throw error;
        setIssues(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Failed to load issues');
        setIssues([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.email]);

  const visible = useMemo(() => {
    let list = issues;
    if (filter !== 'all') {
      const wantClosed = filter === 'closed';
      list = list.filter(i => {
        const s = (i.status || '').toLowerCase();
        const isClosed = s === 'closed' || s === 'resolved';
        return wantClosed ? isClosed : !isClosed; // open vs closed
      });
    }
    if (blockedOnly) list = list.filter(i => Boolean(i.is_blocked));
    if (projectFilter !== 'all') list = list.filter(i => i.project_id === projectFilter);
    return list;
  }, [issues, filter, projectFilter, blockedOnly]);

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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My Issues</h1>
        <div className="flex items-center gap-2">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={selectClass}>
            <option value="all">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectClass}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">Blocked only</span>
          </label>
        </div>
      </div>
      {error && <div className="text-sm text-rose-500">{error}</div>}
      <div className="space-y-3">
        {visible.map(issue => (
          <button
            key={issue.id}
            onClick={() => navigate(`/project/${issue.project_id}/issues/${issue.id}`)}
            style={sectionStyles.card}
            className="w-full text-left p-4 rounded-2xl border hover:shadow"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900 dark:text-white">{issue.title}</div>
              <span className="text-xs px-2 py-1 rounded-full border">{(issue.status || 'open').toUpperCase()}</span>
            </div>
            {issue.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{issue.description}</p>
            )}
            <div className="text-xs text-gray-500 mt-1">Project: {projects.find(p => p.id === issue.project_id)?.name || issue.project_id}</div>
          </button>
        ))}
        {visible.length === 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-300">No issues match this filter.</div>
        )}
      </div>
    </div>
  );
};

export default IssuesListPage;
