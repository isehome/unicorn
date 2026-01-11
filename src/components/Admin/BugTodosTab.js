/**
 * BugTodosTab.js
 * Admin tab for managing AI-analyzed bug reports
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bug, Clock, CheckCircle, AlertCircle, XCircle,
  Loader2, RefreshCw, Trash2, RotateCw,
  ChevronDown, ChevronUp, Github,
  Copy, Check, Image, Code, Download
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
  const [copiedField, setCopiedField] = useState(null);
  const [bugDetails, setBugDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});

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
   * Load full bug details (including screenshot) when expanding
   */
  const loadBugDetails = async (bugId) => {
    if (bugDetails[bugId] || loadingDetails[bugId]) return;

    setLoadingDetails(prev => ({ ...prev, [bugId]: true }));
    try {
      const response = await fetch(`/api/bugs/${bugId}`);
      if (response.ok) {
        const data = await response.json();
        setBugDetails(prev => ({ ...prev, [bugId]: data.bug }));
      }
    } catch (err) {
      console.error('Error loading bug details:', err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [bugId]: false }));
    }
  };

  /**
   * Handle bug expand/collapse
   */
  const handleExpandBug = (bugId) => {
    if (expandedBug === bugId) {
      setExpandedBug(null);
    } else {
      setExpandedBug(bugId);
      // Load full details when expanding
      loadBugDetails(bugId);
    }
  };

  /**
   * Copy text to clipboard
   */
  const copyToClipboard = async (text, fieldId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  /**
   * Generate comprehensive fix prompt for AI assistants
   */
  const generateFixPrompt = (bug) => {
    const lines = [];
    lines.push(`# Bug Fix Request: ${bug.bug_report_id || 'Bug Report'}`);
    lines.push('');

    if (bug.ai_summary) {
      lines.push(`## Summary`);
      lines.push(bug.ai_summary);
      lines.push('');
    }

    lines.push(`## User Description`);
    lines.push(bug.description || 'No description provided');
    lines.push('');

    if (bug.url) {
      lines.push(`## Page URL`);
      lines.push(bug.url);
      lines.push('');
    }

    if (bug.ai_suggested_files?.length > 0) {
      lines.push(`## Affected Files`);
      bug.ai_suggested_files.forEach(file => {
        const filePath = file.file || file;
        const line = file.line ? `:${file.line}` : '';
        const desc = file.description ? ` - ${file.description}` : '';
        lines.push(`- ${filePath}${line}${desc}`);
      });
      lines.push('');
    }

    if (bug.console_errors?.length > 0) {
      lines.push(`## Console Errors`);
      lines.push('```');
      lines.push(bug.console_errors.join('\n\n'));
      lines.push('```');
      lines.push('');
    }

    if (bug.ai_fix_prompt) {
      lines.push(`## AI Analysis & Suggested Fix`);
      lines.push(bug.ai_fix_prompt);
      lines.push('');
    }

    lines.push(`## Instructions`);
    lines.push(`Please analyze this bug report and implement a fix. Focus on:`);
    lines.push(`1. Review the affected files listed above`);
    lines.push(`2. Check the console errors for clues`);
    lines.push(`3. Implement the suggested fix or a better alternative`);
    lines.push(`4. Test the fix to ensure it resolves the issue`);
    lines.push('');
    lines.push(`---`);
    lines.push(`*Bug ID: ${bug.bug_report_id || bug.id}*`);

    return lines.join('\n');
  };

  /**
   * Generate complete bug report markdown (like the email format)
   * This includes ALL data for pasting into AI assistants
   */
  const generateCompleteBugReport = (bug, screenshotUrl) => {
    const lines = [];

    // Header
    lines.push(`# Bug Report: ${bug.bug_report_id || 'Bug Report'}`);
    lines.push('');

    // App Context - Brief primer for AI assistants
    lines.push(`## App Context`);
    lines.push(`This is the **Unicorn** app - a React-based field operations management system.`);
    lines.push(`- **Stack:** React 18, Supabase (PostgreSQL), Vercel serverless functions`);
    lines.push(`- **UI:** Tailwind CSS, Lucide icons, dark/light mode support`);
    lines.push(`- **Key patterns:** Service-based architecture, React hooks, async/await`);
    lines.push(`- **Repo:** https://github.com/isehome/unicorn`);
    lines.push('');

    // Metadata
    lines.push(`## Bug Details`);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **Severity** | ${(bug.ai_severity || 'unknown').toUpperCase()} |`);
    lines.push(`| **Status** | ${bug.status} |`);
    lines.push(`| **Reported** | ${formatDate(bug.created_at)} |`);
    lines.push(`| **Reporter** | ${bug.reported_by_name || 'Anonymous'} (${bug.reported_by_email || 'No email'}) |`);
    lines.push(`| **Page URL** | ${bug.url || 'N/A'} |`);
    lines.push('');

    // AI Summary
    if (bug.ai_summary) {
      lines.push(`## Summary`);
      lines.push(bug.ai_summary);
      lines.push('');
    }

    // User Description
    lines.push(`## User Description`);
    lines.push(bug.description || 'No description provided');
    lines.push('');

    // Screenshot - Use GitHub raw URL so it actually renders
    if (screenshotUrl) {
      lines.push(`## Screenshot`);
      lines.push(`> **Important:** Review this screenshot to understand the visual context of the bug.`);
      lines.push('');
      lines.push(`![Bug Screenshot](${screenshotUrl})`);
      lines.push('');
    }

    // Root Cause (if available in AI analysis)
    if (bug.ai_fix_prompt) {
      lines.push(`## AI Analysis & Suggested Fix`);
      lines.push(bug.ai_fix_prompt);
      lines.push('');
    }

    // Affected Files
    if (bug.ai_suggested_files?.length > 0) {
      lines.push(`## Affected Files`);
      bug.ai_suggested_files.forEach(file => {
        const filePath = file.file || file;
        const line = file.line ? `:${file.line}` : '';
        lines.push(`- \`${filePath}${line}\``);
        if (file.description) {
          lines.push(`  - ${file.description}`);
        }
      });
      lines.push('');
    }

    // Console Errors
    if (bug.console_errors?.length > 0) {
      lines.push(`## Console Errors`);
      lines.push('```');
      lines.push(bug.console_errors.join('\n\n'));
      lines.push('```');
      lines.push('');
    }

    // Environment
    if (bug.user_agent) {
      lines.push(`## Environment`);
      lines.push(`- **User Agent:** ${bug.user_agent}`);
      lines.push('');
    }

    // Instructions for AI - Dual perspective verification
    lines.push(`---`);
    lines.push('');
    lines.push(`## Instructions for AI Assistant`);
    lines.push('');
    lines.push(`> **Important:** This bug report includes a suggested fix from our internal Gemini AI agent.`);
    lines.push(`> Your task is to provide a **second, independent analysis** to verify or improve upon it.`);
    lines.push('');
    lines.push(`### Step 1: Independent Analysis`);
    lines.push(`Before reading the suggested fix above, perform your own analysis:`);
    lines.push(`1. **Examine the screenshot** to understand the visual context of the bug`);
    lines.push(`2. **Read the console errors** for stack traces and error messages`);
    lines.push(`3. **Review the affected files** in the codebase`);
    lines.push(`4. **Form your own hypothesis** about the root cause`);
    lines.push('');
    lines.push(`### Step 2: Compare Approaches`);
    lines.push(`Now review the "AI Analysis & Suggested Fix" section above and compare:`);
    lines.push(`- Does the suggested fix align with your independent analysis?`);
    lines.push(`- Are there edge cases or issues the suggested fix might miss?`);
    lines.push(`- Is there a simpler or more robust solution?`);
    lines.push('');
    lines.push(`### Step 3: Implement the Best Solution`);
    lines.push(`Based on both perspectives, implement the fix that:`);
    lines.push(`- Addresses the root cause (not just symptoms)`);
    lines.push(`- Handles edge cases appropriately`);
    lines.push(`- Follows the codebase's existing patterns`);
    lines.push(`- Includes any necessary error handling`);
    lines.push('');
    lines.push(`### Step 4: Verify`);
    lines.push(`After implementing, briefly explain:`);
    lines.push(`- Which approach you chose and why`);
    lines.push(`- Any improvements you made over the suggested fix`);
    lines.push(`- How to test the fix works correctly`);
    lines.push('');
    lines.push(`---`);
    lines.push(`*Bug ID: ${bug.bug_report_id || bug.id} | Generated by Unicorn AI Bug Analyzer*`);
    lines.push(`*Dual-perspective verification enabled for higher fix confidence*`);

    return lines.join('\n');
  };

  /**
   * Download complete bug report as .md file
   */
  const downloadBugReport = (bug) => {
    // Build GitHub raw URL for the screenshot (renders in markdown viewers and AI assistants)
    // Screenshot is stored at: bug-reports/attachments/{bugId}/screenshot.jpg on the bug's branch
    let screenshotUrl = null;
    if (bug.bug_report_id && bug.branch_name) {
      screenshotUrl = `https://raw.githubusercontent.com/isehome/unicorn/${bug.branch_name}/bug-reports/attachments/${bug.bug_report_id}/screenshot.jpg`;
    }

    const content = generateCompleteBugReport(bug, screenshotUrl);

    // Create blob and download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use AI-generated slug if available for descriptive filename
    const slug = bug.ai_filename_slug || (bug.ai_summary || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
    const filename = slug ? `${bug.bug_report_id}-${slug}.md` : `${bug.bug_report_id || 'bug-report'}.md`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Copy complete bug report to clipboard for pasting into Antigravity or other apps
   */
  const copyBugReportToClipboard = async (bug) => {
    // Build GitHub raw URL for the screenshot
    let screenshotUrl = null;
    if (bug.bug_report_id && bug.branch_name) {
      screenshotUrl = `https://raw.githubusercontent.com/isehome/unicorn/${bug.branch_name}/bug-reports/attachments/${bug.bug_report_id}/screenshot.jpg`;
    }

    const content = generateCompleteBugReport(bug, screenshotUrl);

    try {
      await navigator.clipboard.writeText(content);
      setCopiedField(`report-${bug.id}`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy bug report:', err);
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
                onClick={() => handleExpandBug(bug.id)}
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

              {/* Expanded Content - Matches Email Format */}
              {expandedBug === bug.id && (
                <div className={`border-t ${borderColor}`}>
                  {/* Loading indicator for details */}
                  {loadingDetails[bug.id] && (
                    <div className="flex items-center gap-2 p-4">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span className={textSecondary}>Loading full bug details...</span>
                    </div>
                  )}

                  {/* Header Banner - Like Email */}
                  <div className="bg-gradient-to-r from-violet-600 to-violet-800 p-4">
                    <h2 className="text-white text-lg font-semibold">AI Bug Analysis Complete</h2>
                    <p className="text-violet-200 text-sm">{bug.bug_report_id || bug.id}</p>
                  </div>

                  <div className="p-4 space-y-5">
                    {/* Severity & Confidence Cards - Side by Side */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-3 rounded-lg border ${
                        bug.ai_severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                        bug.ai_severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' :
                        bug.ai_severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
                        'bg-green-500/10 border-green-500/30'
                      }`}>
                        <div className={`text-xs uppercase tracking-wide ${textSecondary}`}>Severity</div>
                        <div className={`text-lg font-semibold uppercase ${
                          bug.ai_severity === 'critical' ? 'text-red-500' :
                          bug.ai_severity === 'high' ? 'text-orange-500' :
                          bug.ai_severity === 'medium' ? 'text-yellow-500' :
                          'text-green-500'
                        }`}>
                          {bug.ai_severity || 'Unknown'}
                        </div>
                      </div>
                      <div className={`p-3 rounded-lg ${mode === 'dark' ? 'bg-zinc-700' : 'bg-gray-100'}`}>
                        <div className={`text-xs uppercase tracking-wide ${textSecondary}`}>Confidence</div>
                        <div className={`text-lg font-semibold ${textPrimary}`}>
                          {bug.ai_confidence ? `${Math.round(bug.ai_confidence * 100)}%` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Token Usage - If available */}
                    {bug.ai_token_usage && (
                      <div className={`flex items-center gap-4 text-xs ${textSecondary}`}>
                        <span>Tokens: {bug.ai_token_usage.prompt_tokens?.toLocaleString() || 0} prompt + {bug.ai_token_usage.completion_tokens?.toLocaleString() || 0} completion = {bug.ai_token_usage.total_tokens?.toLocaleString() || 0} total</span>
                        <span className="text-violet-500">~${((bug.ai_token_usage.total_tokens || 0) * 0.000001).toFixed(4)} est.</span>
                      </div>
                    )}

                    {/* Summary - Gray Box */}
                    {bug.ai_summary && (
                      <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-gray-50'}`}>
                        <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>Summary</h4>
                        <p className={`${textPrimary}`}>{bug.ai_summary}</p>
                      </div>
                    )}

                    {/* AI Analysis & Suggested Fix - Green Box (Moved up like email) */}
                    {bug.ai_fix_prompt && (
                      <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className={`text-sm font-medium ${mode === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
                            Suggested Fix
                          </h4>
                          <button
                            onClick={() => copyToClipboard(bug.ai_fix_prompt, `ai-${bug.id}`)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                              copiedField === `ai-${bug.id}`
                                ? 'bg-green-500 text-white'
                                : mode === 'dark'
                                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                                  : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}
                          >
                            {copiedField === `ai-${bug.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className={`whitespace-pre-wrap text-sm font-mono ${mode === 'dark' ? 'text-green-200' : 'text-green-800'} ${mode === 'dark' ? 'bg-green-900/30' : 'bg-white/50'} p-3 rounded`}>
                          {bug.ai_fix_prompt}
                        </pre>
                      </div>
                    )}

                    {/* Affected Files */}
                    {bug.ai_suggested_files?.length > 0 && (
                      <div>
                        <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>Affected Files</h4>
                        <ul className="space-y-1">
                          {bug.ai_suggested_files.map((file, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-mono ${mode === 'dark' ? 'bg-zinc-700 text-zinc-300' : 'bg-gray-100 text-gray-700'}`}>
                                {file.file || file}{file.line ? `:${file.line}` : ''}
                              </span>
                              {file.description && (
                                <span className={`text-sm ${textSecondary}`}>{file.description}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* PR Link - Blue Box */}
                    {bug.pr_url && (
                      <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                        <h4 className={`text-sm font-medium ${mode === 'dark' ? 'text-blue-300' : 'text-blue-700'} mb-1`}>
                          Pull Request Created
                        </h4>
                        <a
                          href={bug.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline break-all"
                        >
                          {bug.pr_url}
                        </a>
                      </div>
                    )}

                    <hr className={borderColor} />

                    {/* Reporter - Gray Box */}
                    <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-gray-50'}`}>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-1`}>Reporter</h4>
                      <p className={textPrimary}>
                        {bug.reported_by_name || 'Anonymous'}
                        {bug.reported_by_email && ` (${bug.reported_by_email})`}
                      </p>
                    </div>

                    {/* Original Description - Gray Box */}
                    <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-gray-50'}`}>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-1`}>Original Description</h4>
                      <p className={`${textPrimary} whitespace-pre-wrap`}>{bug.description}</p>
                    </div>

                    {/* Page URL - Gray Box */}
                    {bug.url && (
                      <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-gray-50'}`}>
                        <h4 className={`text-sm font-medium ${textSecondary} mb-1`}>Page URL</h4>
                        <a
                          href={bug.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-violet-500 hover:underline break-all"
                        >
                          {bug.url}
                        </a>
                      </div>
                    )}

                    {/* Console Errors - Red Box */}
                    {bug.console_errors?.length > 0 && (
                      <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-red-900/20 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className={`text-sm font-medium ${mode === 'dark' ? 'text-red-300' : 'text-red-700'}`}>
                            Console Errors
                          </h4>
                          <button
                            onClick={() => copyToClipboard(bug.console_errors.join('\n\n'), `errors-${bug.id}`)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                              copiedField === `errors-${bug.id}`
                                ? 'bg-green-500 text-white'
                                : mode === 'dark'
                                  ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                  : 'bg-red-100 text-red-600 hover:bg-red-200'
                            }`}
                          >
                            {copiedField === `errors-${bug.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className={`text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto ${mode === 'dark' ? 'text-red-200' : 'text-red-700'}`}>
                          {bug.console_errors.join('\n\n')}
                        </pre>
                      </div>
                    )}

                    {/* Screenshot */}
                    <div>
                      <h4 className={`text-sm font-medium ${textSecondary} mb-2`}>Screenshot</h4>
                      {(bugDetails[bug.id]?.screenshot_base64 || bug.screenshot_base64) ? (
                        <div className={`rounded-lg overflow-hidden border ${borderColor}`}>
                          <img
                            src={(() => {
                              const screenshot = bugDetails[bug.id]?.screenshot_base64 || bug.screenshot_base64;
                              return screenshot.startsWith('data:') ? screenshot : `data:image/jpeg;base64,${screenshot}`;
                            })()}
                            alt="Bug screenshot"
                            className="w-full h-auto"
                          />
                        </div>
                      ) : loadingDetails[bug.id] ? (
                        <div className={`p-8 rounded-lg border ${borderColor} text-center ${textSecondary}`}>
                          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-violet-500" />
                          <p className="text-sm">Loading screenshot...</p>
                        </div>
                      ) : (
                        <div className={`p-8 rounded-lg border ${borderColor} text-center ${textSecondary}`}>
                          <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No screenshot available</p>
                        </div>
                      )}
                    </div>

                    {/* Copy Fix Prompt for AI - Green Box */}
                    <div className={`p-4 rounded-lg ${mode === 'dark' ? 'bg-violet-900/20 border border-violet-500/30' : 'bg-violet-50 border border-violet-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className={`text-sm font-medium ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'} flex items-center gap-2`}>
                          <Code className="w-4 h-4" />
                          Copy Complete Bug Report for AI Assistant
                        </h4>
                        <button
                          onClick={() => copyToClipboard(generateFixPrompt(bug), `fix-${bug.id}`)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            copiedField === `fix-${bug.id}`
                              ? 'bg-green-500 text-white'
                              : mode === 'dark'
                                ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                                : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                          }`}
                        >
                          {copiedField === `fix-${bug.id}` ? (
                            <>
                              <Check className="w-4 h-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy Prompt
                            </>
                          )}
                        </button>
                      </div>
                      <pre className={`text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto ${mode === 'dark' ? 'text-violet-200' : 'text-violet-800'}`}>
                        {generateFixPrompt(bug)}
                      </pre>
                    </div>

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
                        {/* Download Complete Report Button - Primary Action */}
                        <button
                          onClick={() => downloadBugReport(bug)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-violet-500 text-white hover:bg-violet-600"
                          title="Download complete bug report as .md file"
                        >
                          <Download className="w-4 h-4" />
                          Download Report
                        </button>

                        {/* Copy full report to clipboard */}
                        <button
                          onClick={() => copyBugReportToClipboard(bug)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            copiedField === `report-${bug.id}`
                              ? 'bg-green-500 text-white'
                              : mode === 'dark'
                                ? 'bg-zinc-700 text-white hover:bg-zinc-600'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                          title="Copy complete bug report to clipboard"
                        >
                          {copiedField === `report-${bug.id}` ? (
                            <>
                              <Check className="w-4 h-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copy Report
                            </>
                          )}
                        </button>

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
