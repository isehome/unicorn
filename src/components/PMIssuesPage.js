import React, { useMemo, useState, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../utils/debounce';
import Button from './ui/Button';
import {
  Users,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download
} from 'lucide-react';

// Memoized Issue Card Component
const IssueCard = memo(({ issue, onClick, sectionStyles, isDark, showStakeholders = false }) => (
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
    {issue.notes && (
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
        {issue.notes}
      </p>
    )}
    {showStakeholders && issue.stakeholder_count > 0 && (
      <div className="text-xs text-gray-500 mt-2">
        <span className="inline-flex items-center gap-1">
          <Users className="w-3 h-3" />
          {issue.stakeholder_count} stakeholder{issue.stakeholder_count > 1 ? 's' : ''} tagged
        </span>
      </div>
    )}
  </button>
));

const PMIssuesPage = () => {
  const { projectId } = useParams();
  useAuth(); // Auth context check
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [filter, setFilter] = useState('open');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stakeholderFilter, setStakeholderFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showReports, setShowReports] = useState(false);
  
  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const isDark = mode === 'dark';
  const selectClass = useMemo(() => 
    `px-3 py-2 rounded-xl border pr-8 ${
      isDark ? 'bg-zinc-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'
    }`,
    [isDark]
  );

  // Query for project details (prefetch for cache)
  useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId || !supabase) return null;
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      return data;
    },
    enabled: !!projectId && !!supabase,
    staleTime: 10 * 60 * 1000,
  });

  // Query for issues with stakeholder information
  const issuesQuery = useQuery({
    queryKey: ['pm-issues', projectId],
    queryFn: async () => {
      if (!projectId || !supabase) return [];
      
      // Try to use the enhanced view first
      let { data, error } = await supabase
        .from('project_issues_with_stakeholders')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      // Fallback to regular table if view doesn't exist
      if (error) {
        console.log('Enhanced view not available, using fallback');
        const fallbackResult = await supabase
          .from('issues')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        
        if (fallbackResult.error) throw fallbackResult.error;
        return fallbackResult.data || [];
      }
      
      return data || [];
    },
    enabled: !!projectId && !!supabase,
    staleTime: 3 * 60 * 1000,
  });

  // Query for stakeholders
  const stakeholdersQuery = useQuery({
    queryKey: ['project-stakeholders', projectId],
    queryFn: async () => {
      if (!projectId || !supabase) return [];
      
      const { data, error } = await supabase
        .from('contacts')
        .select('*, stakeholder_role:stakeholder_roles(*)')
        .eq('project_id', projectId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && !!supabase,
    staleTime: 5 * 60 * 1000,
  });

  // Generate stakeholder report data
  const stakeholderReport = useMemo(() => {
    if (!issuesQuery.data || !stakeholdersQuery.data) return [];
    
    const report = stakeholdersQuery.data.map(stakeholder => {
      const stakeholderIssues = issuesQuery.data.filter(issue => 
        issue.stakeholder_names?.includes(stakeholder.name)
      );
      
      const openIssues = stakeholderIssues.filter(i => 
        !['resolved', 'closed'].includes((i.status || 'open').toLowerCase())
      );
      
      const blockedIssues = stakeholderIssues.filter(i => 
        (i.status || '').toLowerCase() === 'blocked'
      );
      
      return {
        ...stakeholder,
        totalIssues: stakeholderIssues.length,
        openIssues: openIssues.length,
        blockedIssues: blockedIssues.length,
        resolvedIssues: stakeholderIssues.length - openIssues.length
      };
    }).sort((a, b) => b.totalIssues - a.totalIssues);
    
    return report;
  }, [issuesQuery.data, stakeholdersQuery.data]);

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
    
    // Apply specific status filter
    if (statusFilter !== 'all') {
      list = list.filter(i => (i.status || 'open').toLowerCase() === statusFilter.toLowerCase());
    }
    
    // Apply stakeholder filter
    if (stakeholderFilter !== 'all') {
      list = list.filter(i => i.stakeholder_names?.includes(stakeholderFilter));
    }
    
    // Apply search filter
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      list = list.filter(i => 
        (i.title || '').toLowerCase().includes(query) ||
        (i.notes || '').toLowerCase().includes(query) ||
        (i.stakeholder_names || []).some(name => name.toLowerCase().includes(query))
      );
    }
    
    return list;
  }, [issuesQuery.data, filter, statusFilter, stakeholderFilter, debouncedSearchQuery]);

  // Export report as CSV
  const exportReport = useCallback(() => {
    if (!stakeholderReport.length) return;
    
    const csv = [
      'Stakeholder,Role,Total Issues,Open Issues,Blocked Issues,Resolved Issues',
      ...stakeholderReport.map(s => 
        `"${s.name}","${s.stakeholder_role?.name || 'N/A'}",${s.totalIssues},${s.openIssues},${s.blockedIssues},${s.resolvedIssues}`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${projectId}-stakeholder-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [stakeholderReport, projectId]);

  // Optimized handlers
  const handleNavigateToIssue = useCallback((issue) => {
    navigate(`/project/${projectId}/issues/${issue.id}`);
  }, [navigate, projectId]);

  const handleCreateIssue = useCallback(() => {
    navigate(`/project/${projectId}/issues/new`);
  }, [navigate, projectId]);

  // Available for UI refresh button if needed
  const _handleRefresh = useCallback(() => {
    issuesQuery.refetch();
    stakeholdersQuery.refetch();
  }, [issuesQuery, stakeholdersQuery]);
  void _handleRefresh; // Suppress unused warning

  const handleFilterChange = useCallback((e) => {
    setFilter(e.target.value);
  }, []);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.target.value);
  }, []);

  // Available for stakeholder dropdown if re-enabled
  const _handleStakeholderFilterChange = useCallback((e) => {
    setStakeholderFilter(e.target.value);
  }, []);
  void _handleStakeholderFilterChange; // Suppress unused warning

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  // Loading state
  if (issuesQuery.isLoading || stakeholdersQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={BarChart3}
            onClick={() => setShowReports(!showReports)}
          >
            {showReports ? 'Hide' : 'Show'} Reports
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateIssue}
          >
            New Issue
          </Button>
        </div>
      </div>

      {/* Stakeholder Reports Section */}
      {showReports && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Stakeholder Issue Report
            </h2>
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={exportReport}
            >
              Export CSV
            </Button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Stakeholder</th>
                  <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Role</th>
                  <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Total</th>
                  <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Open</th>
                  <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Blocked</th>
                  <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {stakeholderReport.map((stakeholder) => (
                  <tr key={stakeholder.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setStakeholderFilter(stakeholder.name)}
                        className="text-violet-600 hover:text-violet-700 font-medium"
                      >
                        {stakeholder.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {stakeholder.stakeholder_role?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold">
                      {stakeholder.totalIssues}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stakeholder.openIssues > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <Clock className="w-3 h-3" />
                          {stakeholder.openIssues}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stakeholder.blockedIssues > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          {stakeholder.blockedIssues}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stakeholder.resolvedIssues > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                          style={{
                            backgroundColor: 'rgba(148, 175, 50, 0.15)',
                            color: '#94AF32'
                          }}
                        >
                          <CheckCircle className="w-3 h-3" />
                          {stakeholder.resolvedIssues}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {stakeholderReport.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No stakeholders assigned to issues yet
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
          {stakeholderFilter !== 'all' && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/20">
              <span className="text-sm text-violet-700 dark:text-violet-400">
                Filtering by: {stakeholderFilter}
              </span>
              <button
                onClick={() => setStakeholderFilter('all')}
                className="text-violet-600 hover:text-violet-700"
              >
                ×
              </button>
            </div>
          )}
          
          <select 
            value={filter} 
            onChange={handleFilterChange} 
            className={selectClass}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          
          <select 
            value={statusFilter} 
            onChange={handleStatusFilterChange} 
            className={selectClass}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="blocked">Blocked</option>
            <option value="in_progress">In Progress</option>
            <option value="critical">Critical</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {debouncedSearchQuery && `Found ${visibleIssues.length} issues matching "${debouncedSearchQuery}"`}
        {!debouncedSearchQuery && `Showing ${visibleIssues.length} of ${issuesQuery.data?.length || 0} issues`}
      </div>

      {/* Issues list */}
      <div className="space-y-3">
        {visibleIssues.map(issue => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onClick={() => handleNavigateToIssue(issue)}
            sectionStyles={sectionStyles}
            isDark={isDark}
            showStakeholders={true}
          />
        ))}
        
        {visibleIssues.length === 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {debouncedSearchQuery 
              ? `No issues found matching "${debouncedSearchQuery}"`
              : 'No issues match the selected filters.'}
          </div>
        )}
      </div>

    </div>
  );
};

export default memo(PMIssuesPage);
