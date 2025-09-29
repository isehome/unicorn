import React, { useMemo, useState, useCallback, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { projectStakeholdersService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../utils/debounce';

// Memoized Issue Card Component
const IssueCard = memo(({ issue, project, onClick, sectionStyles }) => (
  <button
    onClick={onClick}
    style={sectionStyles.card}
    className="w-full text-left p-4 rounded-2xl border hover:shadow transition-transform hover:scale-[1.01]"
  >
    <div className="flex items-center justify-between">
      <div className="font-semibold text-gray-900 dark:text-white">{issue.title}</div>
      <span className="text-xs px-2 py-1 rounded-full border">
        {(issue.status || 'open').toUpperCase()}
      </span>
    </div>
    {issue.description && (
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
        {issue.description}
      </p>
    )}
    <div className="text-xs text-gray-500 mt-1">
      Project: {project?.name || issue.project_id}
    </div>
  </button>
));

const IssuesListPageOptimized = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [filter, setFilter] = useState('open');
  const [projectFilter, setProjectFilter] = useState('all');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const isDark = mode === 'dark';
  const selectClass = useMemo(() => 
    `px-3 py-2 rounded-xl border pr-8 ${
      isDark ? 'bg-slate-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'
    }`,
    [isDark]
  );

  // Query for user's project IDs
  const userProjectsQuery = useQuery({
    queryKey: queryKeys.userProjects(user?.email),
    queryFn: () => projectStakeholdersService.getInternalProjectIdsByEmail(user?.email),
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  });

  // Query for projects data
  const projectsQuery = useQuery({
    queryKey: ['user-projects-details', userProjectsQuery.data],
    queryFn: async () => {
      if (!userProjectsQuery.data?.length || !supabase) return [];
      const { data } = await supabase
        .from('projects')
        .select('id,name')
        .in('id', userProjectsQuery.data);
      return data || [];
    },
    enabled: !!userProjectsQuery.data?.length && !!supabase,
    staleTime: 10 * 60 * 1000,
  });

  // Query for issues
  const issuesQuery = useQuery({
    queryKey: ['user-issues', userProjectsQuery.data],
    queryFn: async () => {
      if (!userProjectsQuery.data?.length || !supabase) return [];
      
      // Try to use the view first for better performance
      let { data, error } = await supabase
        .from('issues_with_stats')
        .select('*')
        .in('project_id', userProjectsQuery.data)
        .order('created_at', { ascending: false });
      
      // Fallback to regular table if view doesn't exist
      if (error) {
        ({ data, error } = await supabase
          .from('issues')
          .select('*')
          .in('project_id', userProjectsQuery.data)
          .order('created_at', { ascending: false }));
      }
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!userProjectsQuery.data?.length && !!supabase,
    staleTime: 3 * 60 * 1000, // Issues change more frequently
  });

  // Memoized filtered issues
  const visibleIssues = useMemo(() => {
    let list = issuesQuery.data || [];
    
    // Apply status filter
    if (filter !== 'all') {
      const wantClosed = filter === 'closed';
      list = list.filter(i => {
        const s = (i.status || '').toLowerCase();
        const isClosed = s === 'closed' || s === 'resolved';
        return wantClosed ? isClosed : !isClosed;
      });
    }
    
    // Apply blocked filter
    if (blockedOnly) {
      list = list.filter(i => (i.status || '').toLowerCase() === 'blocked');
    }
    
    // Apply project filter
    if (projectFilter !== 'all') {
      list = list.filter(i => i.project_id === projectFilter);
    }
    
    // Apply search filter
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      list = list.filter(i => 
        (i.title || '').toLowerCase().includes(query) ||
        (i.description || '').toLowerCase().includes(query)
      );
    }
    
    return list;
  }, [issuesQuery.data, filter, blockedOnly, projectFilter, debouncedSearchQuery]);

  // Optimized handlers
  const handleNavigateToIssue = useCallback((issue) => {
    navigate(`/project/${issue.project_id}/issues/${issue.id}`);
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    issuesQuery.refetch();
    projectsQuery.refetch();
  }, [issuesQuery, projectsQuery]);

  const handleFilterChange = useCallback((e) => {
    setFilter(e.target.value);
  }, []);

  const handleProjectFilterChange = useCallback((e) => {
    setProjectFilter(e.target.value);
  }, []);

  const handleBlockedToggle = useCallback((e) => {
    setBlockedOnly(e.target.checked);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // Loading state
  if (userProjectsQuery.isLoading || issuesQuery.isLoading) {
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
        
        {/* Search Input */}
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search issues..."
            className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{
              backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
              borderColor: isDark ? '#374151' : '#E5E7EB',
              color: isDark ? '#F9FAFB' : '#111827'
            }}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            value={projectFilter} 
            onChange={handleProjectFilterChange} 
            className={selectClass}
          >
            <option value="all">All projects</option>
            {projectsQuery.data?.map(p => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
          
          <select 
            value={filter} 
            onChange={handleFilterChange} 
            className={selectClass}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          
          <label className="text-sm flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={blockedOnly} 
              onChange={handleBlockedToggle} 
            />
            <span className="text-gray-700 dark:text-gray-300">Blocked only</span>
          </label>
        </div>
      </div>

      {(userProjectsQuery.error || issuesQuery.error) && (
        <div className="text-sm text-rose-500 flex items-center gap-2">
          <span>{userProjectsQuery.error?.message || issuesQuery.error?.message}</span>
          <button
            onClick={handleRefresh}
            className="ml-2 px-3 py-1 rounded bg-violet-500 text-white text-xs hover:bg-violet-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {debouncedSearchQuery && `Found ${visibleIssues.length} issues matching "${debouncedSearchQuery}"`}
        {!debouncedSearchQuery && `Showing ${visibleIssues.length} of ${issuesQuery.data?.length || 0} issues`}
      </div>

      <div className="space-y-3">
        {visibleIssues.map(issue => {
          const project = projectsQuery.data?.find(p => p.id === issue.project_id);
          return (
            <IssueCard
              key={issue.id}
              issue={issue}
              project={project}
              onClick={() => handleNavigateToIssue(issue)}
              sectionStyles={sectionStyles}
            />
          );
        })}
        
        {visibleIssues.length === 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {debouncedSearchQuery 
              ? `No issues found matching "${debouncedSearchQuery}"`
              : 'No issues match this filter.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(IssuesListPageOptimized);
