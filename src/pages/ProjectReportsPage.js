import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { reportService } from '../services/reportService';
import { milestoneService } from '../services/milestoneService';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import MilestoneGaugesDisplay from '../components/MilestoneGaugesDisplay';
import {
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronRight,
  Send,
  Copy,
  Check,
  Mail,
  Cable,
  Package,
  AlertCircle,
  ClipboardCheck,
  Calendar,
  Target,
  TrendingUp,
  CheckCircle2,
  Clock,
  FileBarChart2,
  FileBox,
  Download,
  Eye,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { submittalsReportService } from '../services/submittalsReportService';
import { downloadSubmittalsPackage, hasDownloadableContent } from '../services/zipDownloadService';

const ProjectReportsPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  const sectionStyles = enhancedStyles.sections[mode];
  const { publishState, registerActions, unregisterActions } = useAppState();

  // Data state
  const [fullReportData, setFullReportData] = useState(null);
  const [issueReportData, setIssueReportData] = useState(null);
  const [milestonePercentages, setMilestonePercentages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'issues', 'wiredrops', 'equipment'
  const [stakeholderFilter, setStakeholderFilter] = useState('all'); // 'all', 'external', 'internal', or specific stakeholder ID
  const [issueStatusFilter, setIssueStatusFilter] = useState('open'); // 'all', 'open', 'blocked', 'resolved'

  // UI state
  const [expandedStakeholders, setExpandedStakeholders] = useState({});
  const [copied, setCopied] = useState(false);
  const [copiedStakeholder, setCopiedStakeholder] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [showFilters, setShowFilters] = useState(false);

  // Progress Report state
  const [progressReportHtml, setProgressReportHtml] = useState(null);
  const [loadingProgressReport, setLoadingProgressReport] = useState(false);
  const [progressReportError, setProgressReportError] = useState(null);

  // Submittals state
  const [submittalsManifest, setSubmittalsManifest] = useState(null);
  const [loadingSubmittals, setLoadingSubmittals] = useState(false);
  const [submittalsError, setSubmittalsError] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ percent: 0, message: '' });

  // Load all report data including milestone percentages
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [fullReport, issueReport, milestones] = await Promise.all([
        reportService.generateFullProjectReport(projectId),
        reportService.generateIssueReport(projectId),
        milestoneService.getAllPercentagesOptimized(projectId)
      ]);

      setFullReportData(fullReport);
      setIssueReportData(issueReport);
      setMilestonePercentages(milestones);

      // Expand all stakeholders by default
      if (issueReport.stakeholderGroups) {
        const expanded = {};
        issueReport.stakeholderGroups.forEach(g => {
          expanded[g.stakeholder.id] = true;
        });
        setExpandedStakeholders(expanded);
      }
    } catch (err) {
      console.error('Failed to generate reports:', err);
      setError(err.message || 'Failed to generate reports');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadReports();
    }
  }, [projectId, loadReports]);

  // Load progress report HTML when tab is selected
  const loadProgressReport = useCallback(async () => {
    if (progressReportHtml) return; // Already loaded

    setLoadingProgressReport(true);
    setProgressReportError(null);

    try {
      const response = await fetch('/api/project-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      if (!response.ok) {
        throw new Error('Failed to generate progress report');
      }
      const data = await response.json();
      setProgressReportHtml(data.html);
    } catch (err) {
      console.error('Failed to load progress report:', err);
      setProgressReportError(err.message || 'Failed to load progress report');
    } finally {
      setLoadingProgressReport(false);
    }
  }, [projectId, progressReportHtml]);

  // Load submittals manifest when tab is selected
  const loadSubmittalsManifest = useCallback(async () => {
    if (submittalsManifest) return; // Already loaded

    setLoadingSubmittals(true);
    setSubmittalsError(null);

    try {
      const manifest = await submittalsReportService.generateSubmittalsManifest(projectId);
      setSubmittalsManifest(manifest);
    } catch (err) {
      console.error('Failed to load submittals manifest:', err);
      setSubmittalsError(err.message || 'Failed to load submittals');
    } finally {
      setLoadingSubmittals(false);
    }
  }, [projectId, submittalsManifest]);

  // Load data when switching to progress or submittals tabs
  useEffect(() => {
    if (activeTab === 'progress') {
      loadProgressReport();
    } else if (activeTab === 'submittals') {
      loadSubmittalsManifest();
    }
  }, [activeTab, loadProgressReport, loadSubmittalsManifest]);

  // Handle submittals ZIP download
  const handleDownloadSubmittals = useCallback(async () => {
    if (!submittalsManifest || downloadingZip) return;

    setDownloadingZip(true);
    setDownloadProgress({ percent: 0, message: 'Starting download...' });

    try {
      await downloadSubmittalsPackage(
        projectId,
        submittalsManifest.projectName,
        submittalsManifest,
        (percent, message) => setDownloadProgress({ percent, message })
      );
    } catch (err) {
      console.error('Failed to download submittals:', err);
      alert('Failed to download submittals package: ' + err.message);
    } finally {
      setDownloadingZip(false);
      setDownloadProgress({ percent: 0, message: '' });
    }
  }, [projectId, submittalsManifest, downloadingZip]);

  // Get ALL project stakeholders for filter dropdown (not just those with issues)
  const stakeholders = useMemo(() => {
    // Debug: Log what we have
    console.log('[Reports] issueReportData:', issueReportData);
    console.log('[Reports] allStakeholders:', issueReportData?.allStakeholders);
    console.log('[Reports] stakeholderGroups:', issueReportData?.stakeholderGroups);
    console.log('[Reports] unassignedIssues:', issueReportData?.unassignedIssues);
    console.log('[Reports] summary:', issueReportData?.summary);

    // Use allStakeholders which includes ALL project stakeholders
    if (issueReportData?.allStakeholders) {
      console.log('[Reports] Using allStakeholders, count:', issueReportData.allStakeholders.length);
      return issueReportData.allStakeholders;
    }
    // Fallback to stakeholder groups if allStakeholders not available
    if (issueReportData?.stakeholderGroups) {
      console.log('[Reports] Falling back to stakeholderGroups');
      return issueReportData.stakeholderGroups.map(g => g.stakeholder);
    }
    return [];
  }, [issueReportData]);

  // Filter stakeholder groups based on selection
  const filteredStakeholderGroups = useMemo(() => {
    if (!issueReportData?.stakeholderGroups) {
      console.log('[Reports Filter] No stakeholderGroups in issueReportData');
      return [];
    }

    let groups = issueReportData.stakeholderGroups;
    console.log('[Reports Filter] Starting with groups:', groups.length, groups.map(g => ({ id: g.stakeholder.id, name: g.stakeholder.name })));
    console.log('[Reports Filter] stakeholderFilter:', stakeholderFilter);

    if (stakeholderFilter === 'external') {
      groups = groups.filter(g => !g.stakeholder.is_internal);
      console.log('[Reports Filter] After external filter:', groups.length);
    } else if (stakeholderFilter === 'internal') {
      groups = groups.filter(g => g.stakeholder.is_internal);
      console.log('[Reports Filter] After internal filter:', groups.length);
    } else if (stakeholderFilter !== 'all') {
      // Filter by specific stakeholder ID - use String() to ensure consistent comparison
      // (select option values are always strings, but IDs from DB might be UUIDs)
      const filterIdStr = String(stakeholderFilter);
      console.log('[Reports Filter] Filtering by specific ID:', filterIdStr);
      console.log('[Reports Filter] Available IDs:', groups.map(g => String(g.stakeholder.id)));
      groups = groups.filter(g => {
        const matches = String(g.stakeholder.id) === filterIdStr;
        console.log(`[Reports Filter] ${g.stakeholder.name} (${g.stakeholder.id}) === ${filterIdStr}: ${matches}`);
        return matches;
      });
      console.log('[Reports Filter] After specific stakeholder filter:', groups.length);
    }

    // Apply issue status filter to each group's issues
    if (issueStatusFilter !== 'all') {
      groups = groups.map(g => ({
        ...g,
        issues: g.issues.filter(issue => {
          if (issueStatusFilter === 'open') return !['resolved', 'closed'].includes(issue.status?.toLowerCase());
          if (issueStatusFilter === 'blocked') return issue.status?.toLowerCase() === 'blocked';
          if (issueStatusFilter === 'resolved') return ['resolved', 'closed'].includes(issue.status?.toLowerCase());
          return true;
        })
      })).filter(g => g.issues.length > 0);
      console.log('[Reports Filter] After issue status filter:', groups.length);
    }

    console.log('[Reports Filter] Final groups:', groups.length);
    return groups;
  }, [issueReportData, stakeholderFilter, issueStatusFilter]);

  const toggleStakeholder = useCallback((stakeholderId) => {
    setExpandedStakeholders(prev => ({
      ...prev,
      [stakeholderId]: !prev[stakeholderId]
    }));
  }, []);

  // Copy button: Plain text version for easy pasting
  const handleCopyToClipboard = useCallback(async (stakeholderGroup = null) => {
    if (!issueReportData) return;

    try {
      let textContent;

      if (stakeholderGroup) {
        textContent = reportService.generateStakeholderEmail(issueReportData, stakeholderGroup, 'text');
      } else {
        textContent = reportService.generateEmailBody(issueReportData, 'text');
      }

      await navigator.clipboard.writeText(textContent);

      if (stakeholderGroup) {
        setCopiedStakeholder(stakeholderGroup.stakeholder.id);
        setTimeout(() => setCopiedStakeholder(null), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [issueReportData]);

  // Email button: Rich HTML version - copies HTML to clipboard and opens email client
  // Note: mailto doesn't support HTML, so we copy HTML to clipboard for pasting into rich email
  const handleOpenInEmail = useCallback(async (stakeholderGroup = null) => {
    if (!issueReportData) return;

    let subject, htmlContent, textContent, to;

    if (stakeholderGroup) {
      subject = reportService.generateEmailSubject(issueReportData.project, 'Status Update', stakeholderGroup.stakeholder);
      htmlContent = reportService.generateStakeholderEmail(issueReportData, stakeholderGroup, 'html');
      textContent = reportService.generateStakeholderEmail(issueReportData, stakeholderGroup, 'text');
      to = stakeholderGroup.stakeholder.email || '';
    } else {
      subject = reportService.generateEmailSubject(issueReportData.project, 'Status Report');
      htmlContent = reportService.generateEmailBody(issueReportData, 'html');
      textContent = reportService.generateEmailBody(issueReportData, 'text');
      to = '';
    }

    // Copy rich HTML to clipboard so user can paste into email body
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([textContent], { type: 'text/plain' });
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
      }
    } catch (err) {
      console.error('Failed to copy HTML to clipboard:', err);
    }

    // Open email client with basic info - user can paste the rich content
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('(Rich HTML content copied to clipboard - paste here with Ctrl+V / Cmd+V)')}`;
    window.location.href = mailtoUrl;
  }, [issueReportData]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Available report types for AI awareness
  const reportTypes = useMemo(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'progress', label: 'Progress Report' },
    { id: 'submittals', label: 'Submittals' },
    { id: 'issues', label: 'Issues' },
    { id: 'wiredrops', label: 'Wire Drops' },
    { id: 'equipment', label: 'Equipment' }
  ], []);

  // Publish state for AI awareness
  useEffect(() => {
    const projectName = fullReportData?.project?.name || issueReportData?.project?.name;
    const { milestoneProgress, wireDropProgress, equipmentStatus, issueStats, permitStatus } = fullReportData || {};

    publishState({
      view: 'project-reports',
      project: {
        id: projectId,
        name: projectName || 'Unknown Project'
      },
      activeTab,
      reportTypes: reportTypes.map(rt => rt.id),
      stats: {
        openIssues: issueStats?.open || 0,
        blockedIssues: issueStats?.blocked || 0,
        totalIssues: issueStats?.total || 0,
        milestoneProgress: milestoneProgress?.completedCount || 0,
        totalMilestones: milestoneProgress?.milestones?.length || 0,
        wireDrops: wireDropProgress?.total || milestonePercentages?.commissioning?.totalItems || 0,
        equipment: equipmentStatus?.total || milestonePercentages?.trim_orders?.totalItems || 0,
        permits: permitStatus?.completed || 0,
        totalPermits: permitStatus?.total || 0
      },
      filters: {
        stakeholder: stakeholderFilter,
        issueStatus: issueStatusFilter
      },
      stakeholders: stakeholders.slice(0, 10).map(s => ({
        id: s.id,
        name: s.name,
        role: s.role,
        isInternal: s.is_internal
      })),
      hint: `Project reports page for ${projectName || 'project'}. Shows overview, issues, wire drops, and equipment reports. Current tab: ${activeTab}.`
    });
  }, [
    publishState, projectId, activeTab, fullReportData, issueReportData,
    milestonePercentages, stakeholders, stakeholderFilter, issueStatusFilter, reportTypes
  ]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      select_report_type: async ({ reportType }) => {
        const validTypes = ['overview', 'progress', 'submittals', 'issues', 'wiredrops', 'equipment'];
        const normalized = reportType?.toLowerCase();
        if (validTypes.includes(normalized)) {
          setActiveTab(normalized);
          return { success: true, message: `Switched to ${normalized} report` };
        }
        return { success: false, error: `Invalid report type. Use: ${validTypes.join(', ')}` };
      },
      generate_report: async ({ reportType }) => {
        // Refresh report data
        try {
          await loadReports();
          if (reportType) {
            const validTypes = ['overview', 'progress', 'submittals', 'issues', 'wiredrops', 'equipment'];
            const normalized = reportType.toLowerCase();
            if (validTypes.includes(normalized)) {
              setActiveTab(normalized);
            }
          }
          return { success: true, message: 'Report data refreshed successfully' };
        } catch (err) {
          return { success: false, error: `Failed to generate report: ${err.message}` };
        }
      },
      download_submittals: async () => {
        if (!submittalsManifest) {
          return { success: false, error: 'No submittals data loaded. Switch to Submittals tab first.' };
        }
        if (!hasDownloadableContent(submittalsManifest)) {
          return { success: false, error: 'No downloadable content available.' };
        }
        handleDownloadSubmittals();
        return { success: true, message: 'Starting submittals package download' };
      },
      export_report: async ({ format }) => {
        // Copy report to clipboard
        if (!issueReportData) {
          return { success: false, error: 'No report data available to export' };
        }
        try {
          const textContent = reportService.generateEmailBody(issueReportData, 'text');
          await navigator.clipboard.writeText(textContent);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return { success: true, message: 'Report copied to clipboard' };
        } catch (err) {
          return { success: false, error: `Failed to export report: ${err.message}` };
        }
      },
      filter_by_stakeholder: async ({ stakeholderName }) => {
        if (stakeholderName === 'all') {
          setStakeholderFilter('all');
          return { success: true, message: 'Showing issues for all stakeholders' };
        }
        if (stakeholderName === 'external') {
          setStakeholderFilter('external');
          return { success: true, message: 'Showing external stakeholders only' };
        }
        if (stakeholderName === 'internal') {
          setStakeholderFilter('internal');
          return { success: true, message: 'Showing internal stakeholders only' };
        }
        const found = stakeholders.find(s =>
          s.name.toLowerCase().includes(stakeholderName.toLowerCase())
        );
        if (found) {
          setStakeholderFilter(found.id);
          return { success: true, message: `Filtering by stakeholder: ${found.name}` };
        }
        return { success: false, error: 'Stakeholder not found' };
      },
      filter_issues_by_status: async ({ status }) => {
        const validStatuses = ['all', 'open', 'blocked', 'resolved'];
        if (validStatuses.includes(status)) {
          setIssueStatusFilter(status);
          return { success: true, message: `Filtering issues by status: ${status}` };
        }
        return { success: false, error: `Invalid status. Use: ${validStatuses.join(', ')}` };
      },
      email_report: async ({ stakeholderId }) => {
        if (!issueReportData) {
          return { success: false, error: 'No report data available' };
        }
        if (stakeholderId) {
          const group = issueReportData.stakeholderGroups?.find(g =>
            g.stakeholder.id === stakeholderId ||
            g.stakeholder.name.toLowerCase().includes(stakeholderId.toLowerCase())
          );
          if (group) {
            handleOpenInEmail(group);
            return { success: true, message: `Opening email for ${group.stakeholder.name}` };
          }
          return { success: false, error: 'Stakeholder not found' };
        }
        handleOpenInEmail();
        return { success: true, message: 'Opening email client with full report' };
      },
      go_back: async () => {
        navigate(`/project/${projectId}`);
        return { success: true, message: 'Navigating back to project' };
      },
      get_report_summary: async () => {
        const { milestoneProgress, issueStats, permitStatus } = fullReportData || {};
        return {
          success: true,
          summary: {
            openIssues: issueStats?.open || 0,
            blockedIssues: issueStats?.blocked || 0,
            milestonesComplete: milestoneProgress?.completedCount || 0,
            totalMilestones: milestoneProgress?.milestones?.length || 0,
            permitsComplete: permitStatus?.completed || 0,
            totalPermits: permitStatus?.total || 0,
            prewireProgress: milestonePercentages?.prewire_phase?.percentage || 0,
            trimProgress: milestonePercentages?.trim_phase?.percentage || 0,
            commissioningProgress: milestonePercentages?.commissioning?.percentage || 0
          }
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [
    registerActions, unregisterActions, navigate, projectId, loadReports,
    issueReportData, fullReportData, milestonePercentages, stakeholders,
    handleOpenInEmail, submittalsManifest, handleDownloadSubmittals
  ]);

  // Loading state
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center min-h-[50vh]">
          <LoadingSpinner size="lg" message="Loading project data..." />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={loadReports} className="ml-auto">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const { milestoneProgress, wireDropProgress, equipmentStatus, issueStats, permitStatus } = fullReportData || {};

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Project Status Gauges - Full Milestone Display */}
      <div className="rounded-2xl border p-6" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
            Project Progress
          </h2>
          <div className="flex items-center gap-4">
            {issueStats?.open > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {issueStats.open} Open Issue{issueStats.open !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
        {milestonePercentages ? (
          <MilestoneGaugesDisplay
            milestonePercentages={milestonePercentages}
            startCollapsed={false}
          />
        ) : (
          <div className="text-center py-8 text-gray-500">
            Loading milestone data...
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b pb-2 flex-wrap" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'progress', label: 'Progress Report', icon: FileBarChart2 },
          { id: 'submittals', label: 'Submittals', icon: FileBox, count: submittalsManifest?.totalParts },
          { id: 'issues', label: 'Issues', icon: AlertCircle, count: issueStats?.open },
          { id: 'wiredrops', label: 'Wire Drops', icon: Cable, count: milestonePercentages?.commissioning?.totalItems || wireDropProgress?.total },
          { id: 'equipment', label: 'Equipment', icon: Package, count: milestonePercentages?.trim_orders?.totalItems || equipmentStatus?.total }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
            style={{ color: activeTab !== tab.id ? (isDark ? '#9ca3af' : '#6b7280') : undefined }}
          >
            <tab.icon className="w-4 h-4" />
            <span className="font-medium">{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Prewire Phase */}
            <StatCard
              icon={Cable}
              label="Prewire"
              value={`${milestonePercentages?.prewire_phase?.percentage || 0}%`}
              subtext={`${milestonePercentages?.prewire || 0}% stages done`}
              color="blue"
              isDark={isDark}
            />
            {/* Trim Phase */}
            <StatCard
              icon={Package}
              label="Trim"
              value={`${milestonePercentages?.trim_phase?.percentage || 0}%`}
              subtext={`${milestonePercentages?.trim || 0}% stages done`}
              color="green"
              isDark={isDark}
            />
            {/* Commissioning */}
            <StatCard
              icon={CheckCircle2}
              label="Commissioning"
              value={`${milestonePercentages?.commissioning?.percentage || 0}%`}
              subtext={`${milestonePercentages?.commissioning?.itemCount || 0}/${milestonePercentages?.commissioning?.totalItems || 0}`}
              color="violet"
              isDark={isDark}
            />
            {/* Open Issues */}
            <StatCard
              icon={AlertCircle}
              label="Open Issues"
              value={issueStats?.open || 0}
              subtext={issueStats?.blocked ? `${issueStats.blocked} blocked` : 'none blocked'}
              color={issueStats?.blocked > 0 ? 'red' : 'amber'}
              isDark={isDark}
            />
            {/* Permits */}
            <StatCard
              icon={ClipboardCheck}
              label="Permits"
              value={`${permitStatus?.completed || 0}/${permitStatus?.total || 0}`}
              subtext="completed"
              color="teal"
              isDark={isDark}
            />
            {/* Stakeholders */}
            <StatCard
              icon={Users}
              label="Stakeholders"
              value={issueReportData?.summary?.totalProjectStakeholders || stakeholders.length || 0}
              subtext={`${issueReportData?.summary?.stakeholderCount || 0} with issues`}
              color="indigo"
              isDark={isDark}
            />
          </div>

          {/* Milestone Timeline */}
          {milestoneProgress?.milestones && (
            <div className="rounded-xl border p-4" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                <Calendar className="w-5 h-5 text-violet-500" />
                Project Timeline
              </h3>
              <div className="flex flex-wrap gap-2">
                {milestoneProgress.milestones.map((milestone, idx) => (
                  <div
                    key={milestone.type}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      milestone.completed
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : idx === milestoneProgress.completedCount
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 ring-2 ring-violet-500'
                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {milestone.completed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : idx === milestoneProgress.completedCount ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-current opacity-50" />
                    )}
                    <span>{milestone.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="space-y-4">
          {/* Progress Report Preview */}
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <div className="flex items-center gap-3">
                <FileBarChart2 className="w-5 h-5 text-violet-500" />
                <h3 className="font-semibold" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                  Progress Report
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {progressReportHtml && (
                  <>
                    <Button
                      variant="secondary"
                      icon={Eye}
                      onClick={() => {
                        const newWindow = window.open('', '_blank');
                        newWindow.document.write(progressReportHtml);
                        newWindow.document.close();
                      }}
                    >
                      Open in New Tab
                    </Button>
                    <Button
                      variant="primary"
                      icon={Mail}
                      onClick={async () => {
                        const projectName = fullReportData?.project?.name || 'Project';
                        const subject = `${projectName} - Progress Report`;
                        // Copy HTML to clipboard for pasting
                        try {
                          const htmlBlob = new Blob([progressReportHtml], { type: 'text/html' });
                          const textBlob = new Blob(['Progress report HTML copied to clipboard - paste in email'], { type: 'text/plain' });
                          await navigator.clipboard.write([
                            new window.ClipboardItem({
                              'text/html': htmlBlob,
                              'text/plain': textBlob
                            })
                          ]);
                        } catch (err) {
                          console.error('Failed to copy HTML:', err);
                        }
                        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('(Rich HTML content copied to clipboard - paste here)')}`;
                      }}
                    >
                      Email Report
                    </Button>
                  </>
                )}
              </div>
            </div>

            {loadingProgressReport ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                <span className="ml-3" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                  Generating progress report...
                </span>
              </div>
            ) : progressReportError ? (
              <div className="flex items-center gap-2 p-4 m-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <span>{progressReportError}</span>
                <Button variant="secondary" size="sm" onClick={() => { setProgressReportHtml(null); loadProgressReport(); }} className="ml-auto">
                  Try Again
                </Button>
              </div>
            ) : progressReportHtml ? (
              <div className="p-4">
                <iframe
                  srcDoc={progressReportHtml}
                  title="Progress Report Preview"
                  className="w-full border rounded-lg"
                  style={{ height: '600px', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}
                />
              </div>
            ) : (
              <div className="text-center py-16" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                <FileBarChart2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No progress report data available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'submittals' && (
        <div className="space-y-4">
          {/* Submittals Header Card */}
          <div className="rounded-xl border p-4" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileBox className="w-5 h-5 text-violet-500" />
                <div>
                  <h3 className="font-semibold" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                    Submittals Package
                  </h3>
                  <p className="text-sm" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                    Product documentation and wiremap for this project
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {submittalsManifest && hasDownloadableContent(submittalsManifest) && (
                  <Button
                    variant="primary"
                    icon={downloadingZip ? Loader2 : Download}
                    onClick={handleDownloadSubmittals}
                    disabled={downloadingZip}
                    className={downloadingZip ? 'animate-pulse' : ''}
                  >
                    {downloadingZip ? `${downloadProgress.percent}%` : 'Download ZIP'}
                  </Button>
                )}
              </div>
            </div>
            {downloadingZip && downloadProgress.message && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{downloadProgress.message}</span>
                  <span style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{downloadProgress.percent}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-violet-500 rounded-full h-2 transition-all"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {loadingSubmittals ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <span className="ml-3" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                Loading submittals...
              </span>
            </div>
          ) : submittalsError ? (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <span>{submittalsError}</span>
              <Button variant="secondary" size="sm" onClick={() => { setSubmittalsManifest(null); loadSubmittalsManifest(); }} className="ml-auto">
                Try Again
              </Button>
            </div>
          ) : submittalsManifest ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={FileBox}
                  label="Submittal Documents"
                  value={submittalsManifest.totalParts || 0}
                  subtext="unique part types"
                  color="violet"
                  isDark={isDark}
                />
                <StatCard
                  icon={Package}
                  label="Manufacturers"
                  value={Object.keys(
                    submittalsManifest.parts?.reduce((acc, p) => {
                      acc[p.manufacturer || 'Unknown'] = true;
                      return acc;
                    }, {}) || {}
                  ).length}
                  color="blue"
                  isDark={isDark}
                />
                <StatCard
                  icon={Cable}
                  label="Wiremap"
                  value={submittalsManifest.hasWiremap ? 'Included' : 'Not Available'}
                  subtext={submittalsManifest.hasWiremap ? 'PNG from Lucid' : 'No Lucid URL set'}
                  color={submittalsManifest.hasWiremap ? 'green' : 'amber'}
                  isDark={isDark}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Ready to Download"
                  value={hasDownloadableContent(submittalsManifest) ? 'Yes' : 'No'}
                  subtext={hasDownloadableContent(submittalsManifest) ? 'Click Download ZIP' : 'No content available'}
                  color={hasDownloadableContent(submittalsManifest) ? 'green' : 'red'}
                  isDark={isDark}
                />
              </div>

              {/* Parts with Submittals */}
              {submittalsManifest.parts && submittalsManifest.parts.length > 0 ? (
                <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                  <div className="p-4 border-b" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                    <h4 className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                      Parts with Submittal Documents ({submittalsManifest.parts.length})
                    </h4>
                  </div>
                  <div className="divide-y" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                    {/* Group by manufacturer */}
                    {Object.entries(
                      submittalsManifest.parts.reduce((acc, part) => {
                        const mfg = part.manufacturer || 'Unknown';
                        if (!acc[mfg]) acc[mfg] = [];
                        acc[mfg].push(part);
                        return acc;
                      }, {})
                    ).map(([manufacturer, parts]) => (
                      <div key={manufacturer} className="p-4">
                        <h5 className="font-medium text-sm mb-3" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                          {manufacturer} ({parts.length})
                        </h5>
                        <div className="space-y-2">
                          {parts.map((part) => (
                            <div
                              key={part.id}
                              className="flex items-center justify-between p-3 rounded-lg"
                              style={{ backgroundColor: isDark ? '#374151' : '#f9fafb' }}
                            >
                              <div className="flex items-center gap-3">
                                <FileBox className="w-4 h-4 text-violet-500" />
                                <div>
                                  <span className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                                    {part.model || part.partNumber || part.name}
                                  </span>
                                  {part.name && part.model && (
                                    <span className="text-sm ml-2" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                                      {part.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm px-2 py-1 rounded-lg" style={{ backgroundColor: isDark ? '#4b5563' : '#e5e7eb', color: isDark ? '#9ca3af' : '#6b7280' }}>
                                  {part.usageCount}x used
                                </span>
                                {part.hasUploadedFile && (
                                  <span className="text-xs px-2 py-1 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                                    SharePoint
                                  </span>
                                )}
                                {part.hasExternalUrl && (
                                  <a
                                    href={part.submittalPdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    View PDF
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 rounded-xl" style={{ backgroundColor: isDark ? '#1f2937' : '#f9fafb' }}>
                  <FileBox className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="font-medium" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                    No submittal documents found
                  </p>
                  <p className="text-sm mt-1" style={{ color: isDark ? '#6b7280' : '#9ca3af' }}>
                    Add submittal PDFs to parts in the Parts Manager
                  </p>
                </div>
              )}

              {/* Wiremap Info */}
              {submittalsManifest.lucidUrl && (
                <div className="rounded-xl border p-4" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cable className="w-5 h-5 text-blue-500" />
                      <div>
                        <h4 className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                          Wiremap (Lucid Floor Plan)
                        </h4>
                        <p className="text-sm" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                          {submittalsManifest.hasWiremap
                            ? 'Will be exported as PNG and included in ZIP'
                            : 'Could not extract document ID from Lucid URL'}
                        </p>
                      </div>
                    </div>
                    <a
                      href={submittalsManifest.lucidUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Lucid
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
              <FileBox className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No submittals data available</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'issues' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', border: `1px solid ${isDark ? '#3F3F46' : '#e5e7eb'}` }}>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Stakeholder Filter */}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <select
                  value={stakeholderFilter}
                  onChange={(e) => setStakeholderFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border text-sm bg-white dark:bg-zinc-800"
                  style={{ borderColor: isDark ? '#4b5563' : '#d1d5db', color: isDark ? '#f9fafb' : '#18181B' }}
                >
                  <option value="all">All Stakeholders ({stakeholders.length})</option>
                  <option value="external">External Only</option>
                  <option value="internal">Internal Only</option>
                  <option disabled>──────────</option>
                  {stakeholders.map(s => {
                    // Check if this stakeholder has issues
                    const hasIssues = issueReportData?.stakeholderGroups?.some(g => g.stakeholder.id === s.id);
                    const issueCount = hasIssues
                      ? issueReportData.stakeholderGroups.find(g => g.stakeholder.id === s.id)?.issues.length || 0
                      : 0;
                    const label = `${s.name}${s.role ? ` (${s.role})` : ''}${issueCount > 0 ? ` - ${issueCount} issues` : ''}`;
                    return (
                      <option key={s.id} value={s.id}>{label}</option>
                    );
                  })}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-gray-500" />
                <select
                  value={issueStatusFilter}
                  onChange={(e) => setIssueStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border text-sm bg-white dark:bg-zinc-800"
                  style={{ borderColor: isDark ? '#4b5563' : '#d1d5db', color: isDark ? '#f9fafb' : '#18181B' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open Only</option>
                  <option value="blocked">Blocked Only</option>
                  <option value="resolved">Resolved Only</option>
                </select>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-sm">
                <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  {issueReportData?.summary?.externalCount || 0} External
                </span>
                <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  {issueReportData?.summary?.internalCount || 0} Internal
                </span>
                {issueReportData?.summary?.blockedCount > 0 && (
                  <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    {issueReportData.summary.blockedCount} Blocked
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => handleCopyToClipboard()}>
                {copied ? 'Copied!' : 'Copy Report'}
              </Button>
              <Button variant="primary" icon={Mail} onClick={() => handleOpenInEmail()}>
                Email Report
              </Button>
            </div>
          </div>

          {/* Stakeholder Groups */}
          {filteredStakeholderGroups.map((group) => {
            const isExpanded = expandedStakeholders[group.stakeholder.id];
            const isExternal = !group.stakeholder.is_internal;
            const isCopied = copiedStakeholder === group.stakeholder.id;
            // Use olive green for external (#94AF32), violet for internal (#8B5CF6)
            const dotColor = isExternal ? '#94AF32' : '#8B5CF6';

            return (
              <div
                key={group.stakeholder.id}
                className="rounded-2xl overflow-hidden"
                style={sectionStyles.card}
              >
                {/* Stakeholder Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                  onClick={() => toggleStakeholder(group.stakeholder.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                    {/* Colored dot indicator */}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dotColor }}
                      title={isExternal ? 'External' : 'Internal'}
                    />
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {group.stakeholder.name}
                      </span>
                      {group.stakeholder.role && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {group.stakeholder.role}
                        </span>
                      )}
                      {group.stakeholder.email && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {group.stakeholder.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {group.issues.length} issue{group.issues.length !== 1 ? 's' : ''}
                    </span>
                    {group.blockedCount > 0 && (
                      <span className="text-xs px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                        {group.blockedCount} blocked
                      </span>
                    )}
                    <button
                      onClick={() => handleCopyToClipboard(group)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Copy email for this stakeholder"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenInEmail(group)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm transition-colors hover:opacity-90 bg-violet-600"
                      title={group.stakeholder.email ? `Email ${group.stakeholder.email}` : 'Open in email'}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Email</span>
                    </button>
                  </div>
                </div>

                {/* Issues List */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-3">
                    {group.issues.map((issue) => {
                      const status = (issue.status || 'open').toLowerCase();
                      const getStatusStyle = () => {
                        if (status === 'resolved' || status === 'closed') {
                          return { backgroundColor: '#94AF3220', color: '#94AF32', border: '1px solid #94AF3240' };
                        } else if (status === 'blocked') {
                          return { backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' };
                        } else if (status === 'in_progress' || status === 'in progress') {
                          return { backgroundColor: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f640' };
                        } else if (status === 'critical') {
                          return { backgroundColor: '#dc262620', color: '#dc2626', border: '1px solid #dc262640' };
                        } else {
                          return {
                            backgroundColor: isDark ? '#3F3F46' : '#f3f4f6',
                            color: isDark ? '#d1d5db' : '#6b7280',
                            border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`
                          };
                        }
                      };

                      return (
                        <div
                          key={issue.id}
                          style={sectionStyles.card}
                          className="w-full text-left p-4 rounded-2xl border hover:shadow transition-transform hover:scale-[1.005]"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-gray-900 dark:text-white">{issue.title}</div>
                            <span
                              className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={getStatusStyle()}
                            >
                              {status.toUpperCase().replace('_', ' ')}
                            </span>
                          </div>
                          {issue.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                              {issue.description.substring(0, 200)}{issue.description.length > 200 ? '...' : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Issues */}
          {issueReportData?.unassignedIssues?.length > 0 && stakeholderFilter === 'all' && (
            <div className="border rounded-xl overflow-hidden" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <div className="p-4" style={{ backgroundColor: isDark ? '#3F3F46' : '#f3f4f6' }}>
                <span className="font-semibold text-lg" style={{ color: isDark ? '#9ca3af' : '#3F3F46' }}>
                  Unassigned Issues
                </span>
                <span className="text-sm ml-3 px-3 py-1 bg-white dark:bg-gray-700 rounded-lg" style={{ color: '#666' }}>
                  {issueReportData.unassignedIssues.length}
                </span>
              </div>
              <div className="p-4 space-y-3">
                {issueReportData.unassignedIssues.map((issue) => {
                  const status = (issue.status || 'open').toLowerCase();
                  const getStatusStyle = () => {
                    if (status === 'resolved' || status === 'closed') {
                      return { backgroundColor: '#94AF3220', color: '#94AF32', border: '1px solid #94AF3240' };
                    } else if (status === 'blocked') {
                      return { backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' };
                    } else {
                      return {
                        backgroundColor: isDark ? '#3F3F46' : '#f3f4f6',
                        color: isDark ? '#d1d5db' : '#6b7280',
                        border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`
                      };
                    }
                  };

                  return (
                    <div
                      key={issue.id}
                      style={sectionStyles.card}
                      className="w-full text-left p-4 rounded-2xl border hover:shadow transition-transform hover:scale-[1.005]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-gray-900 dark:text-white">{issue.title}</div>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={getStatusStyle()}
                        >
                          {status.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>
                      {issue.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                          {issue.description.substring(0, 200)}{issue.description.length > 200 ? '...' : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredStakeholderGroups.length === 0 && (
            <div className="text-center py-12 rounded-xl" style={{ backgroundColor: isDark ? '#1f2937' : '#f9fafb' }}>
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p className="font-medium" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                No issues match the selected filters
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'wiredrops' && (
        <div className="space-y-4">
          {/* Wire Drop Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Cable}
              label="Total Wire Drops"
              value={milestonePercentages?.commissioning?.totalItems || wireDropProgress?.total || 0}
              color="violet"
              isDark={isDark}
            />
            <StatCard
              icon={CheckCircle2}
              label="Prewire Phase"
              value={`${milestonePercentages?.prewire_phase?.percentage || 0}%`}
              subtext="orders + receiving + stages"
              color="blue"
              isDark={isDark}
            />
            <StatCard
              icon={CheckCircle2}
              label="Trim Phase"
              value={`${milestonePercentages?.trim_phase?.percentage || 0}%`}
              subtext="orders + receiving + stages"
              color="green"
              isDark={isDark}
            />
            <StatCard
              icon={Target}
              label="Commissioning"
              value={`${milestonePercentages?.commissioning?.percentage || 0}%`}
              subtext={`${milestonePercentages?.commissioning?.itemCount || 0}/${milestonePercentages?.commissioning?.totalItems || 0} complete`}
              color="amber"
              isDark={isDark}
            />
          </div>

          {/* By Floor */}
          {wireDropProgress?.byFloor && Object.keys(wireDropProgress.byFloor).length > 0 && (
            <div className="rounded-xl border p-4" style={{ backgroundColor: isDark ? '#1f2937' : '#fff', borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <h3 className="font-semibold mb-4" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>By Floor</h3>
              <div className="space-y-3">
                {Object.entries(wireDropProgress.byFloor).map(([floor, data]) => (
                  <div key={floor} className="flex items-center gap-4">
                    <span className="w-24 font-medium" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{floor}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="bg-violet-500 rounded-full h-2" style={{ width: `${data.total > 0 ? (data.prewireComplete / data.total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                        {data.prewireComplete}/{data.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'equipment' && (
        <div className="space-y-4">
          {/* Equipment Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Prewire Parts */}
            <StatCard
              icon={Cable}
              label="Prewire Parts"
              value={`${milestonePercentages?.prewire_orders?.percentage || 0}%`}
              subtext={`${milestonePercentages?.prewire_orders?.partsAccountedFor || 0}/${milestonePercentages?.prewire_orders?.totalParts || 0} ordered`}
              color="blue"
              isDark={isDark}
            />
            <StatCard
              icon={CheckCircle2}
              label="Prewire Received"
              value={`${milestonePercentages?.prewire_receiving?.percentage || 0}%`}
              subtext={`${milestonePercentages?.prewire_receiving?.partsReceived || milestonePercentages?.prewire_receiving?.itemCount || 0}/${milestonePercentages?.prewire_receiving?.totalParts || milestonePercentages?.prewire_receiving?.totalItems || 0} received`}
              color="violet"
              isDark={isDark}
            />
            {/* Trim Parts */}
            <StatCard
              icon={Package}
              label="Trim Parts"
              value={`${milestonePercentages?.trim_orders?.percentage || 0}%`}
              subtext={`${milestonePercentages?.trim_orders?.partsAccountedFor || 0}/${milestonePercentages?.trim_orders?.totalParts || 0} ordered`}
              color="green"
              isDark={isDark}
            />
            <StatCard
              icon={CheckCircle2}
              label="Trim Received"
              value={`${milestonePercentages?.trim_receiving?.percentage || 0}%`}
              subtext={`${milestonePercentages?.trim_receiving?.partsReceived || milestonePercentages?.trim_receiving?.itemCount || 0}/${milestonePercentages?.trim_receiving?.totalParts || milestonePercentages?.trim_receiving?.totalItems || 0} received`}
              color="amber"
              isDark={isDark}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, subtext, color, isDark }) => {
  const colors = {
    violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
    red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600 dark:text-teal-400' },
    indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400' }
  };

  const colorClass = colors[color] || colors.violet;

  return (
    <div className={`rounded-xl p-4 ${colorClass.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClass.text}`} />
        <span className="text-sm font-medium" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClass.text}`}>{value}</div>
      {subtext && (
        <div className="text-xs mt-1" style={{ color: isDark ? '#6b7280' : '#9ca3af' }}>{subtext}</div>
      )}
    </div>
  );
};

export default ProjectReportsPage;
