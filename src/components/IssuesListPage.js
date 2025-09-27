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
  const [filter, setFilter] = useState('open'); // open | blocked | resolved | all
  const [error, setError] = useState('');

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
    if (filter === 'all') return issues;
    return issues.filter(i => (i.status || '').toLowerCase() === filter);
  }, [issues, filter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My Issues</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 rounded-xl border">
          <option value="open">Open</option>
          <option value="blocked">Blocked</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
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
            <div className="text-xs text-gray-500 mt-1">Project: {issue.project_id}</div>
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

