/**
 * BugTodosTab.js
 * Admin tab for managing AI-analyzed bug reports
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bug, Clock, CheckCircle, AlertCircle, XCircle,
  Loader2, RefreshCw, ExternalLink, Trash2, RotateCw,
  ChevronDown, ChevronUp, FileText, Github, Mail
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const BugTodosTab = () => {
  const { mode } = useTheme();

  const [bugs, setBugs] = useState([]);
  const [stats, setStats] = useState({ pending: 0, processing: 0, analyzed: 0, failed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedBug, setExpandedBug] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Styles
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-gray-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-gray-500';
  const cardBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const borderColor = mode === 'dark' ? 'border-zinc-700' : 'border-gray-200';
  const hoverBg = mode === 'dark' ? 'hover:bg-zinc-700' : 'hover:bg-gray-50';

  // Severity colors
  const severityColors = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/30',
    high: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    low: 'bg-green-500/10 text-green-500 border-green-500/30',
    trivial: 'bg-gray-500/10 text-gray-500 border-gray-500/30'
  };

  // Status colors
  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    processing: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    analyzed: 'bg-green-500/10 text-green-600 border-green-500/30',
    failed: 'bg-red-500/10 text-red-500 border-red-500/30'
  };

  /**
   * Load bug reports from API
   */
  const loadBugs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: filter,
        limit: '50'
      });
      const response = await fetch(`/api/bugs/list?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load bug reports');
      }

      setBugs(data.bugs || []);
      setStats(data.stats || { pending: 0, processing: 0, analyzed: 0, failed: 0, total: 0 });
    } catch (err) {
      console.error('Error loading bugs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadBugs();
  }, [loadBugs]);

  /**
   * Delete a bug report
   */
  const handleDelete = async (bugId) => {
    if (!window.confirm('Delete this bug report? This will also close the GitHub PR if one exists.')) {
      return;
    }

    setActionLoading(bugId);
    try {
      const response = await fetch(`/api/bugs/${bugId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete bug report');
      }

      await loadBugs();
    } catch (err) {
      console.error('Error deleting bug:', err);
      alert('Failed to delete: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Reanalyze a bug report
   */
  const handleReanalyze = async (bugId) => {
    setActionLoading(bugId);
    try {
      const response = await fetch(`/api/bugs/${bugId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reanalyze' })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reanalyze bug report');
      }

      await loadBugs();
    } catch (err) {
      console.error('Error reanalyzing bug:', err);
      alert('Failed to reanalyze: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Format date for display
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  /**
   * Get status icon
   */
  const StatusIcon = ({ status }) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'analyzed':
        return <CheckCircle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Bug className="w-4 h-4" />;
    }
  };

  if (loading && bugs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${textPrimary}`}>Bug Todos</h2>
          <p className={textSecondary}>
            AI-analyzed bug reports from user submissions
          </p>
        </div>
        <button
          onClick={loadBugs}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'dark'
              ? 'bg-zinc-700 text-white hover:bg-zinc-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:opacity-50`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className={`${cardBg} p-4 rounded-xl border ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Bug className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${textPrimary}`}>{stats.total}</div>
              <div className={`text-sm ${textSecondary}`}>Total</div>
            </div>
          </div>
        </div>

        <div className={`${cardBg} p-4 rounded-xl border ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${textPrimary}`}>{stats.pending}</div>
              <div className={`text-sm ${textSecondary}`}>Pending</div>
            </div>
          </div>
        </div>

        <div className={`${cardBg} p-4 rounded-xl border ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Loader2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${textPrimary}`}>{stats.processing}</div>
              <div className={`text-sm ${textSecondary}`}>Processing</div>
            </div>
          </div>
        </div>

        <div className={`${cardBg} p-4 rounded-xl border ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${textPrimary}`}>{stats.analyzed}</div>
              <div className={`text-sm ${textSecondary}`}>Analyzed</div>
            </div>
          </div>
        </div>

        <div className={`${cardBg} p-4 rounded-xl border ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${textPrimary}`}>{stats.failed}</div>
              <div className={`text-sm ${textSecondary}`}>Failed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={`flex gap-1 p-1 rounded-lg ${mode === 'dark' ? 'bg-zinc-800' : 'bg-gray-100'}`}>
        {['all', 'pending', 'analyzed', 'failed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-violet-500 text-white'
                : mode === 'dark'
                  ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && ` (${stats[status] || 0})`}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Bug List */}
      <div className="space-y-3">
        {bugs.length === 0 ? (
          <div className={`${cardBg} p-8 rounded-xl border ${borderColor} text-center`}>
            <Bug className={`w-12 h-12 mx-auto mb-4 ${textSecondary}`} />
            <p className={textSecondary}>No bug reports found</p>
          </div>
        ) : (
          bugs.map((bug) => (
            <div
              key={bug.id}
              className={`${cardBg} rounded-xl border ${borderColor} overflow-hidden transition-shadow hover:shadow-md`}
            >
              {/* Bug Header - Always visible */}
              <div
                className={`p-4 cursor-pointer ${hoverBg}`}
                onClick={() => setExpandedBug(expandedBug === bug.id ? null : bug.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {bug.bug_report_id && (
                        <span className={`text-xs font-mono ${textSecondary}`}>
                          {bug.bug_report_id}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${statusColors[bug.status]}`}>
                        <span className="flex items-center gap-1">
                          <StatusIcon status={bug.status} />
                          {bug.status}
                        </span>
                      </span>
                      {bug.ai_severity && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${severityColors[bug.ai_severity]}`}>
                          {bug.ai_severity}
                        </span>
                      )}
                    </div>

                    <h3 className={`font-medium ${textPrimary} line-clamp-1`}>
                      {bug.ai_summary || bug.description}
                    </h3>

                    <div className={`flex items-center gap-4 mt-2 text-sm ${textSecondary}`}>
                      <span>{bug.reported_by_name || bug.reported_by_email || 'Anonymous'}</span>
                      <span>{formatDate(bug.created_at)}</span>
                      <span className="truncate max-w-[200px]">{bug.url}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {bug.pr_url && (
                      <a
                        href={bug.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg text-violet-500 hover:bg-violet-500/10 transition-colors"
                        title="View Pull Request"
                      >
                        <Github className="w-5 h-5" />
                      </a>
                    )}
                    {expandedBug === bug.id ? (
                      <ChevronUp className={`w-5 h-5 ${textSecondary}`} />
                    ) : (
                      <ChevronDown className={`w-5 h-5 ${textSecondary}`} />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedBug === bug.id && (
                <div className={`border-t ${borderColor} p-4 space-y-4`}>
                  {/* Description */}
                  <div>
                    <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>User Description</h4>
                    <p className={`${textPrimary} whitespace-pre-wrap`}>{bug.description}</p>
                  </div>

                  {/* AI Analysis */}
                  {bug.ai_fix_prompt && (
                    <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'}`}>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>AI Suggested Fix</h4>
                      <pre className={`${textPrimary} whitespace-pre-wrap text-sm font-mono`}>
                        {bug.ai_fix_prompt}
                      </pre>
                    </div>
                  )}

                  {/* Suggested Files */}
                  {bug.ai_suggested_files?.length > 0 && (
                    <div>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>Affected Files</h4>
                      <ul className="space-y-1">
                        {bug.ai_suggested_files.map((file, i) => (
                          <li key={i} className={`text-sm ${textPrimary} font-mono`}>
                            {file.file || file}{file.line ? `:${file.line}` : ''}
                            {file.description && (
                              <span className={`ml-2 ${textSecondary} font-sans`}>- {file.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Console Errors */}
                  {bug.console_errors?.length > 0 && (
                    <div>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>Console Errors</h4>
                      <pre className={`p-3 rounded-lg text-xs font-mono overflow-x-auto ${
                        mode === 'dark' ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'
                      }`}>
                        {bug.console_errors.join('\n\n')}
                      </pre>
                    </div>
                  )}

                  {/* Processing Error */}
                  {bug.processing_error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <h4 className="text-sm font-medium text-red-500 mb-1">Processing Error</h4>
                      <p className="text-sm text-red-400">{bug.processing_error}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className={`flex items-center justify-between pt-4 border-t ${borderColor}`}>
                    <div className={`text-sm ${textSecondary}`}>
                      {bug.processed_at && (
                        <span>Analyzed {formatDate(bug.processed_at)}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {bug.md_file_path && (
                        <a
                          href={`https://github.com/isehome/unicorn/blob/main/${bug.md_file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            mode === 'dark'
                              ? 'bg-zinc-700 text-white hover:bg-zinc-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          View Report
                        </a>
                      )}

                      <button
                        onClick={() => handleReanalyze(bug.id)}
                        disabled={actionLoading === bug.id || bug.status === 'processing'}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          mode === 'dark'
                            ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === bug.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCw className="w-4 h-4" />
                        )}
                        Reanalyze
                      </button>

                      <button
                        onClick={() => handleDelete(bug.id)}
                        disabled={actionLoading === bug.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          mode === 'dark'
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === bug.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Mark Fixed
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BugTodosTab;
