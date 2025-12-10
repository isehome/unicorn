import React, { useMemo, useState, useCallback, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { projectStakeholdersService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from '../utils/debounce';

// Memoized Issue Card Component
const IssueCard = memo(({ issue, project, onClick, sectionStyles, isDark }) => (
  <button
    onClick={onClick}
    style={sectionStyles.card}
    className="w-full text-left p-4 rounded-2xl border hover:shadow transition-transform hover:scale-[1.01]"
  >
    <div className="flex items-center justify-between">
      <div className="font-semibold text-gray-900 dark:text-white">{issue.title}</div>
      <span 
        className="text-xs px-2.5 py-1 rounded-full font-medium"
        style={(() => {
          const status = (issue.status || 'open').toLowerCase();
          if (status === 'resolved' || status === 'closed') {
            return {
              backgroundColor: '#94AF3220',
              color: '#94AF32',
              border: '1px solid #94AF3240'
            };
          } else if (status === 'blocked') {
            return {
              backgroundColor: '#ef444420',
              color: '#ef4444',
              border: '1px solid #ef444440'
            };
          } else if (status === 'in_progress' || status === 'in progress') {
            return {
              backgroundColor: '#3b82f620',
              color: '#3b82f6',
              border: '1px solid #3b82f640'
            };
          } else if (status === 'critical') {
            return {
              backgroundColor: '#dc262620',
              color: '#dc2626',
              border: '1px solid #dc262640'
            };
          } else {
            // Default for 'open' and other statuses
            return {
              backgroundColor: isDark ? '#3F3F46' : '#f3f4f6',
              color: isDark ? '#d1d5db' : '#6b7280',
              border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`
            };
          }
        })()}
      >
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
  const [searchParams] = useSearchParams();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  // Initialize state from URL params (only on first render)
  const initialProjectParam = searchParams.get('project');
  const initialSearchParam = searchParams.get('search');

  const [filter, setFilter] = useState('open');
  const [projectFilter, setProjectFilter] = useState(initialProjectParam || 'all');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchParam || '');

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const isDark = mode === 'dark';
  const selectClass = useMemo(() => 
    `px-3 py-2 rounded-xl border pr-8 ${
      isDark ? 'bg-zinc-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'
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
    staleTime: 30 * 1000, // 30 seconds - issues change frequently
    refetchOnMount: 'always', // Always refetch when navigating back to this page
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
    <div className="w-full px-3 sm:px-4 py-4 space-y-4">
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
              backgroundColor: isDark ? '#27272A' : '#FFFFFF',
              borderColor: isDark ? '#3F3F46' : '#E5E7EB',
              color: isDark ? '#F9FAFB' : '#18181B'
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
              isDark={isDark}
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
