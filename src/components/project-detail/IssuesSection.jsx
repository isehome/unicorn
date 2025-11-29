import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  Plus
} from 'lucide-react';
import Button from '../ui/Button';

/**
 * IssuesSection - Collapsible section for project issues
 *
 * Displays:
 * - List of project issues with filtering (resolved/unresolved)
 * - Issue status badges
 * - Create new issue button
 * - Click to navigate to issue detail page
 */
const IssuesSection = ({
  projectId,
  issues,
  openIssues,
  showResolvedIssues,
  setShowResolvedIssues,
  expandedSection,
  toggleSection,
  handleNewIssue,
  styles,
  palette,
  withAlpha,
  formatDate,
  statusChipStyle
}) => {
  const navigate = useNavigate();

  return (
    <div>
      <button
        onClick={() => toggleSection('issues')}
        className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
        style={styles.card}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} style={styles.textPrimary} />
          <span className="font-medium" style={styles.textPrimary}>Issues</span>
        </div>
        <div className="flex items-center gap-3">
          {openIssues.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: withAlpha(palette.danger, 0.18), color: palette.danger }}>
              {openIssues.length}
            </span>
          )}
          <ChevronRight
            size={20}
            className={`transition-transform duration-200 ${expandedSection === 'issues' ? 'rotate-90' : ''}`}
            style={styles.textSecondary}
          />
        </div>
      </button>

      {expandedSection === 'issues' && (
        <div className="mt-3 p-4 rounded-2xl border space-y-4" style={{ ...styles.card, boxShadow: styles.innerShadow }}>
          <div className="flex items-center justify-between text-xs">
            <div style={styles.textSecondary}>
              {showResolvedIssues ? 'Showing resolved' : 'Hiding resolved'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowResolvedIssues((prev) => !prev)}
                className="text-xs underline"
                style={styles.textSecondary}
              >
                {showResolvedIssues ? 'Hide resolved' : 'Show resolved'}
              </button>
              <Button size="sm" variant="ghost" icon={Plus} onClick={handleNewIssue}>
                New Issue
              </Button>
            </div>
          </div>
          {issues.length === 0 ? (
            <p className="text-sm" style={styles.textSecondary}>No issues logged for this project.</p>
          ) : (
            issues
              .filter((issue) => showResolvedIssues || (issue.status || '').toLowerCase() !== 'resolved')
              .map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => navigate(`/project/${projectId}/issues/${issue.id}`)}
                  className="w-full text-left px-3 py-3 rounded-xl border transition-transform duration-200 hover:-translate-y-0.5"
                  style={styles.mutedCard}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium" style={styles.textPrimary}>{issue.title}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={statusChipStyle(palette, issue.status)}
                    >
                      {(issue.status || 'open').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={styles.textSecondary}>
                    {formatDate(issue.created_at)}
                  </p>
                  {issue.description && (
                    <p className="text-sm mt-1 line-clamp-2" style={styles.textSecondary}>
                      {issue.description}
                    </p>
                  )}
                </button>
              ))
          )}
        </div>
      )}
    </div>
  );
};

export default memo(IssuesSection);
