import React, { useState, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { reportService } from '../services/reportService';
import Button from './ui/Button';
import {
  FileText,
  Mail,
  Copy,
  Check,
  Loader,
  X,
  AlertTriangle,
  BookOpen,
  FileCheck,
  Users,
  ChevronDown,
  ChevronRight,
  Send
} from 'lucide-react';

const REPORT_TYPES = [
  {
    id: 'status',
    label: 'Project Status Report',
    description: 'Open issues grouped by stakeholder with project progress',
    icon: FileText,
    available: true
  },
  {
    id: 'training',
    label: 'Training Docs',
    description: 'Client training documentation and guides',
    icon: BookOpen,
    available: false
  },
  {
    id: 'asbuilt',
    label: 'As-Built',
    description: 'Final as-built documentation package',
    icon: FileCheck,
    available: false
  }
];

const ProjectReportsSection = ({ projectId }) => {
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedStakeholder, setCopiedStakeholder] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedStakeholders, setExpandedStakeholders] = useState({});
  const [previewMode, setPreviewMode] = useState('full'); // 'full' or stakeholder id

  const generateReport = useCallback(async (reportType) => {
    if (reportType !== 'status') {
      setError('This report type is not yet available.');
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedReport(reportType);

    try {
      const data = await reportService.generateIssueReport(projectId);
      setReportData(data);
      setShowPreview(true);
      setPreviewMode('full');
      // Expand all stakeholders by default
      const expanded = {};
      data.stakeholderGroups.forEach(g => {
        expanded[g.stakeholder.id] = true;
      });
      setExpandedStakeholders(expanded);
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const toggleStakeholder = useCallback((stakeholderId) => {
    setExpandedStakeholders(prev => ({
      ...prev,
      [stakeholderId]: !prev[stakeholderId]
    }));
  }, []);

  const handleCopyToClipboard = useCallback(async (stakeholderGroup = null) => {
    if (!reportData) return;

    try {
      let htmlContent, textContent;

      if (stakeholderGroup) {
        htmlContent = reportService.generateStakeholderEmail(reportData, stakeholderGroup, 'html');
        textContent = reportService.generateStakeholderEmail(reportData, stakeholderGroup, 'text');
      } else {
        htmlContent = reportService.generateEmailBody(reportData, 'html');
        textContent = reportService.generateEmailBody(reportData, 'text');
      }

      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([textContent], { type: 'text/plain' });
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(textContent);
      }

      if (stakeholderGroup) {
        setCopiedStakeholder(stakeholderGroup.stakeholder.id);
        setTimeout(() => setCopiedStakeholder(null), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      const textContent = stakeholderGroup
        ? reportService.generateStakeholderEmail(reportData, stakeholderGroup, 'text')
        : reportService.generateEmailBody(reportData, 'text');
      const textArea = document.createElement('textarea');
      textArea.value = textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      if (stakeholderGroup) {
        setCopiedStakeholder(stakeholderGroup.stakeholder.id);
        setTimeout(() => setCopiedStakeholder(null), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [reportData]);

  const handleOpenInEmail = useCallback((stakeholderGroup = null) => {
    if (!reportData) return;

    let subject, body, to;

    if (stakeholderGroup) {
      subject = reportService.generateEmailSubject(reportData.project, 'Status Update', stakeholderGroup.stakeholder);
      body = reportService.generateStakeholderEmail(reportData, stakeholderGroup, 'text');
      to = stakeholderGroup.stakeholder.email || '';
    } else {
      subject = reportService.generateEmailSubject(reportData.project, 'Status Report');
      body = reportService.generateEmailBody(reportData, 'text');
      to = '';
    }

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  }, [reportData]);

  const closePreview = useCallback(() => {
    setShowPreview(false);
    setReportData(null);
    setSelectedReport(null);
    setError(null);
    setPreviewMode('full');
  }, []);

  const viewStakeholderPreview = useCallback((stakeholderGroup) => {
    setPreviewMode(stakeholderGroup.stakeholder.id);
  }, []);

  return (
    <div className="space-y-4">
      {/* Report Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isSelected = selectedReport === report.id && loading;

          return (
            <button
              key={report.id}
              onClick={() => report.available && generateReport(report.id)}
              disabled={!report.available || loading}
              className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
                report.available
                  ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              style={{
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                borderColor: isSelected ? '#8b5cf6' : isDark ? '#3F3F46' : '#e5e7eb'
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    backgroundColor: report.available
                      ? isDark ? '#8b5cf620' : '#ede9fe'
                      : isDark ? '#37415120' : '#f3f4f6'
                  }}
                >
                  {isSelected ? (
                    <Loader className="w-5 h-5 animate-spin text-violet-500" />
                  ) : (
                    <Icon className="w-5 h-5" style={{ color: report.available ? '#8b5cf6' : isDark ? '#6b7280' : '#9ca3af' }} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                      {report.label}
                    </span>
                    {!report.available && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                    {report.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      {error && !showPreview && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && reportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="relative w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ backgroundColor: isDark ? '#1f2937' : '#ffffff' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                  {previewMode === 'full' ? 'Project Status Report' : 'Stakeholder Email Preview'}
                </h3>
                <p className="text-sm" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                  {reportData.project?.name || reportData.project?.project_number}
                  {reportData.project?.fullAddress && ` - ${reportData.project.fullAddress}`}
                </p>
              </div>
              <button onClick={closePreview} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Project Status Banner */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-700 p-4 text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-sm opacity-80">Current Phase</div>
                  <div className="text-xl font-bold">{reportData.milestoneProgress?.currentPhase || 'N/A'}</div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold">{reportData.milestoneProgress?.progressPercent || 0}%</div>
                    <div className="text-xs opacity-80">Progress</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold">{reportData.summary?.totalOpen || 0}</div>
                    <div className="text-xs opacity-80">Open Issues</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-300">{reportData.summary?.blockedCount || 0}</div>
                    <div className="text-xs opacity-80">Blocked</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 bg-white/20 rounded-full h-2">
                <div
                  className="bg-white rounded-full h-2 transition-all duration-500"
                  style={{ width: `${reportData.milestoneProgress?.progressPercent || 0}%` }}
                />
              </div>
            </div>

            {/* Summary Stats Bar */}
            <div className="flex gap-3 p-4 border-b flex-wrap" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{reportData.summary?.externalCount || 0}</span>
                <span className="text-sm text-amber-600 dark:text-amber-400">External</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{reportData.summary?.internalCount || 0}</span>
                <span className="text-sm text-blue-600 dark:text-blue-400">Internal</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800">
                <Users className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">{reportData.summary?.stakeholderCount || 0} stakeholders</span>
              </div>
              {previewMode !== 'full' && (
                <button
                  onClick={() => setPreviewMode('full')}
                  className="ml-auto text-sm text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Back to full report
                </button>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
              {previewMode === 'full' ? (
                <div className="p-4 space-y-4">
                  {/* Stakeholder Groups */}
                  {(reportData.stakeholderGroups || []).map((group) => {
                    const isExpanded = expandedStakeholders[group.stakeholder.id];
                    const isExternal = !group.stakeholder.is_internal;
                    const isCopied = copiedStakeholder === group.stakeholder.id;

                    return (
                      <div
                        key={group.stakeholder.id}
                        className="border rounded-xl overflow-hidden"
                        style={{ borderColor: isExternal ? '#fcd34d' : '#93c5fd' }}
                      >
                        {/* Stakeholder Header */}
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer"
                          style={{ backgroundColor: isExternal ? '#fef3c7' : '#dbeafe' }}
                          onClick={() => toggleStakeholder(group.stakeholder.id)}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" style={{ color: isExternal ? '#92400e' : '#1e40af' }} />
                            ) : (
                              <ChevronRight className="w-4 h-4" style={{ color: isExternal ? '#92400e' : '#1e40af' }} />
                            )}
                            <div>
                              <span className="font-semibold" style={{ color: isExternal ? '#92400e' : '#1e40af' }}>
                                {group.stakeholder.name}
                              </span>
                              {group.stakeholder.role && (
                                <span className="text-sm ml-2 opacity-70" style={{ color: isExternal ? '#92400e' : '#1e40af' }}>
                                  {group.stakeholder.role}
                                </span>
                              )}
                              <span
                                className="text-xs ml-2 px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: isExternal ? '#f59e0b20' : '#3b82f620',
                                  color: isExternal ? '#b45309' : '#1d4ed8'
                                }}
                              >
                                {isExternal ? 'External' : 'Internal'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-sm px-2 py-1 bg-white rounded-md" style={{ color: '#666' }}>
                              {group.issues.length} issue{group.issues.length !== 1 ? 's' : ''}
                            </span>
                            {group.blockedCount > 0 && (
                              <span className="text-xs px-2 py-1 bg-red-600 text-white rounded-md">
                                {group.blockedCount} blocked
                              </span>
                            )}
                            <button
                              onClick={() => viewStakeholderPreview(group)}
                              className="p-1.5 rounded-md hover:bg-white/50 transition-colors"
                              title="Preview email for this stakeholder"
                            >
                              <FileText className="w-4 h-4" style={{ color: isExternal ? '#92400e' : '#1e40af' }} />
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(group)}
                              className="p-1.5 rounded-md hover:bg-white/50 transition-colors"
                              title="Copy email for this stakeholder"
                            >
                              {isCopied ? (
                                <Check className="w-4 h-4" style={{ color: '#94AF32' }} />
                              ) : (
                                <Copy className="w-4 h-4" style={{ color: isExternal ? '#92400e' : '#1e40af' }} />
                              )}
                            </button>
                            <button
                              onClick={() => handleOpenInEmail(group)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-white text-sm transition-colors"
                              style={{ backgroundColor: isExternal ? '#d97706' : '#2563eb' }}
                              title={group.stakeholder.email ? `Email ${group.stakeholder.email}` : 'Open in email'}
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Email</span>
                            </button>
                          </div>
                        </div>

                        {/* Issues List */}
                        {isExpanded && (
                          <div className="divide-y" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                            {group.issues.map((issue) => (
                              <div
                                key={issue.id}
                                className="p-3"
                                style={{ backgroundColor: issue.isBlocked ? '#fef2f2' : isDark ? '#1f2937' : '#fff' }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    {issue.isBlocked && (
                                      <span className="inline-block text-xs px-2 py-0.5 bg-red-600 text-white rounded mr-2">
                                        BLOCKED
                                      </span>
                                    )}
                                    <span className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                                      {issue.title}
                                    </span>
                                    {issue.description && (
                                      <p className="text-sm mt-1" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                                        {issue.description.substring(0, 150)}{issue.description.length > 150 ? '...' : ''}
                                      </p>
                                    )}
                                  </div>
                                  <span
                                    className="text-xs px-2 py-1 rounded-md whitespace-nowrap"
                                    style={{
                                      backgroundColor: issue.isBlocked ? '#dc262620' : '#6b728020',
                                      color: issue.isBlocked ? '#dc2626' : '#6b7280'
                                    }}
                                  >
                                    {(issue.status || 'open').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unassigned Issues */}
                  {(reportData.unassignedIssues || []).length > 0 && (
                    <div className="border rounded-xl overflow-hidden" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                      <div className="p-3" style={{ backgroundColor: isDark ? '#3F3F46' : '#f3f4f6' }}>
                        <span className="font-semibold" style={{ color: isDark ? '#9ca3af' : '#3F3F46' }}>
                          Unassigned Issues
                        </span>
                        <span className="text-sm ml-2 px-2 py-1 bg-white dark:bg-gray-700 rounded-md" style={{ color: '#666' }}>
                          {reportData.unassignedIssues.length}
                        </span>
                      </div>
                      <div className="divide-y" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
                        {reportData.unassignedIssues.map((issue) => (
                          <div key={issue.id} className="p-3" style={{ backgroundColor: isDark ? '#1f2937' : '#fff' }}>
                            <span className="font-medium" style={{ color: isDark ? '#f9fafb' : '#18181B' }}>
                              {issue.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {reportData.summary?.totalOpen === 0 && (
                    <div className="text-center py-8" style={{ color: '#94AF32' }}>
                      <Check className="w-12 h-12 mx-auto mb-2" />
                      <p className="font-medium">No open issues!</p>
                    </div>
                  )}
                </div>
              ) : (
                // Stakeholder-specific preview
                <div className="p-4">
                  {(() => {
                    const group = reportData.stakeholderGroups.find(g => g.stakeholder.id === previewMode);
                    if (!group) return null;
                    return (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: reportService.generateStakeholderEmail(reportData, group, 'html')
                        }}
                      />
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 p-4 border-t" style={{ borderColor: isDark ? '#3F3F46' : '#e5e7eb' }}>
              <div className="text-sm" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                {previewMode === 'full'
                  ? 'Click a stakeholder to preview their personalized email'
                  : 'Previewing email for: ' + reportData.stakeholderGroups.find(g => g.stakeholder.id === previewMode)?.stakeholder.name
                }
              </div>
              <div className="flex gap-3">
                {previewMode === 'full' ? (
                  <>
                    <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => handleCopyToClipboard()}>
                      {copied ? 'Copied!' : 'Copy Full Report'}
                    </Button>
                    <Button variant="primary" icon={Mail} onClick={() => handleOpenInEmail()}>
                      Email Full Report
                    </Button>
                  </>
                ) : (
                  <>
                    {(() => {
                      const group = reportData.stakeholderGroups.find(g => g.stakeholder.id === previewMode);
                      const isCopied = copiedStakeholder === previewMode;
                      return (
                        <>
                          <Button variant="secondary" icon={isCopied ? Check : Copy} onClick={() => handleCopyToClipboard(group)}>
                            {isCopied ? 'Copied!' : 'Copy Email'}
                          </Button>
                          <Button variant="primary" icon={Send} onClick={() => handleOpenInEmail(group)}>
                            Send to {group?.stakeholder.name}
                          </Button>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectReportsSection;
