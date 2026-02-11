import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Mail,
  Phone,
  Building,
  Map as MapIcon,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Bell,
  MessageSquare,
  Globe,
  Clock,
  Loader
} from 'lucide-react';
import Button from './ui/Button';

/**
 * StakeholderDetailModal — shows stakeholder contact info + engagement history.
 *
 * Props:
 *   person          – stakeholder record (contact_name, email, phone, company, address, role_name, etc.)
 *   category        – 'internal' | 'external'
 *   projectId       – current project UUID
 *   palette         – theme palette
 *   styles          – theme styles
 *   mode            – 'light' | 'dark'
 *   withAlpha        – helper
 *   onClose         – close handler
 *   onEdit          – edit handler (opens AddStakeholderModal in edit mode)
 *   onRemove        – remove handler
 *   onContactAction – action handler for email/phone/address clicks
 */
const StakeholderDetailModal = ({
  person,
  category,
  projectId,
  palette,
  styles,
  mode,
  withAlpha,
  onClose,
  onEdit,
  onRemove,
  onContactAction
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const accentColor = category === 'internal' ? palette.accent : palette.success;
  const contactName = person?.contact_name || person?.name || 'Unknown';
  const roleName = person?.role_name || 'Stakeholder';
  const email = person?.email;
  const tagId = person?.tag_id || person?.stakeholder_tag_id || person?.id;

  // Load engagement history (notifications, comments, portal access).
  // We query by contact_email (always available from project stakeholders)
  // rather than issue-level tag_id which only exists on issue stakeholder tags.
  const loadHistory = useCallback(async () => {
    if (!email) return;
    setLoadingHistory(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const events = [];

      // 1. Notification log entries — match by recipient email for this project
      {
        const { data: notifications } = await supabase
          .from('issue_notification_log')
          .select('id, notification_type, subject, sent_at, recipient_email, metadata')
          .eq('project_id', projectId)
          .ilike('recipient_email', normalizedEmail)
          .order('sent_at', { ascending: false })
          .limit(50);
        (notifications || []).forEach((n) => {
          events.push({
            type: 'notification',
            date: n.sent_at,
            label: n.subject || `${n.notification_type} notification`,
            detail: `Sent to ${n.recipient_email}`,
            icon: 'bell'
          });
        });
      }

      // 2. Portal access events — match by contact_email on portal links for this project
      if (category === 'external') {
        const { data: links } = await supabase
          .from('issue_public_access_links')
          .select('id, issue_id, last_accessed_at, access_count, created_at, last_notified_at, contact_email')
          .eq('project_id', projectId)
          .ilike('contact_email', normalizedEmail)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(20);

        (links || []).forEach((link) => {
          if (link.last_accessed_at) {
            events.push({
              type: 'portal_access',
              date: link.last_accessed_at,
              label: 'Accessed the portal',
              detail: `${link.access_count || 1} total visit${(link.access_count || 1) !== 1 ? 's' : ''}`,
              icon: 'globe'
            });
          }
          if (link.created_at) {
            events.push({
              type: 'portal_created',
              date: link.created_at,
              label: 'Portal link created',
              detail: null,
              icon: 'globe'
            });
          }
        });
      }

      // 3. Comments — first get issue IDs for this project, then find comments by email
      {
        // Get all issues for this project so we can filter comments
        const { data: projectIssues } = await supabase
          .from('issues')
          .select('id')
          .eq('project_id', projectId);

        const issueIds = (projectIssues || []).map(i => i.id);

        if (issueIds.length > 0) {
          const { data: comments } = await supabase
            .from('issue_comments')
            .select('id, comment_text, created_at, author_name, author_email, issue_id')
            .ilike('author_email', normalizedEmail)
            .in('issue_id', issueIds)
            .order('created_at', { ascending: false })
            .limit(30);

          (comments || []).forEach((c) => {
            const txt = c.comment_text || '';
            events.push({
              type: 'comment',
              date: c.created_at,
              label: 'Left a comment',
              detail: txt ? (txt.length > 80 ? txt.slice(0, 80) + '…' : txt) : null,
              icon: 'message'
            });
          });
        }
      }

      // Sort all events by date descending
      events.sort((a, b) => new Date(b.date) - new Date(a.date));
      setHistory(events);
    } catch (err) {
      console.warn('[StakeholderDetailModal] Failed to load history:', err);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [email, projectId, category]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const HistoryIcon = ({ type }) => {
    const iconStyle = { ...styles.textSecondary, flexShrink: 0 };
    switch (type) {
      case 'bell': return <Bell size={14} style={iconStyle} />;
      case 'message': return <MessageSquare size={14} style={iconStyle} />;
      case 'globe': return <Globe size={14} style={iconStyle} />;
      default: return <Clock size={14} style={iconStyle} />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          backgroundColor: palette.card,
          border: `1px solid ${palette.border}`,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: palette.border }}
        >
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <div>
              <h3 className="font-semibold text-lg" style={styles.textPrimary}>
                {contactName}
              </h3>
              <p className="text-sm" style={styles.textSecondary}>{roleName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            <X size={18} style={styles.textSecondary} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Contact Info */}
          <div className="space-y-3">
            {email && (
              <div className="flex items-center gap-3">
                <Mail size={16} style={styles.textSecondary} />
                <button
                  onClick={() => onContactAction?.('email', email)}
                  className="text-sm hover:underline"
                  style={{ color: palette.info }}
                >
                  {email}
                </button>
              </div>
            )}
            {person?.phone && (
              <div className="flex items-center gap-3">
                <Phone size={16} style={styles.textSecondary} />
                <button
                  onClick={() => onContactAction?.('phone', person.phone)}
                  className="text-sm hover:underline"
                  style={{ color: palette.info }}
                >
                  {person.phone}
                </button>
              </div>
            )}
            {person?.company && (
              <div className="flex items-center gap-3">
                <Building size={16} style={styles.textSecondary} />
                <span className="text-sm" style={styles.textPrimary}>{person.company}</span>
              </div>
            )}
            {person?.address && (
              <div className="flex items-center gap-3">
                <MapIcon size={16} style={styles.textSecondary} />
                <button
                  onClick={() => onContactAction?.('address', person.address)}
                  className="text-sm hover:underline text-left"
                  style={{ color: palette.info }}
                >
                  {person.address}
                </button>
              </div>
            )}
            {person?.assignment_notes && (
              <div
                className="text-xs italic px-3 py-2 rounded-lg"
                style={{ backgroundColor: withAlpha(palette.cardMuted, 0.5), ...styles.textSecondary }}
              >
                Note: {person.assignment_notes}
              </div>
            )}
          </div>

          {/* Actions: Edit + Delete (delete only in edit mode) */}
          <div className="flex gap-2 pt-1">
            {!isEditing ? (
              <Button
                variant="primary"
                icon={Pencil}
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  icon={Pencil}
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    onEdit?.(person);
                  }}
                >
                  Change Role / Contact
                </Button>
                <Button
                  variant="danger"
                  icon={Trash2}
                  size="sm"
                  onClick={() => {
                    onRemove?.();
                    onClose();
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="secondary"
                  icon={X}
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>

          {/* Engagement History */}
          <div className="border-t pt-4" style={{ borderColor: palette.border }}>
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-2 w-full text-left"
            >
              {historyOpen ? (
                <ChevronDown size={16} style={styles.textSecondary} />
              ) : (
                <ChevronRight size={16} style={styles.textSecondary} />
              )}
              <span className="text-sm font-semibold" style={styles.textPrimary}>
                Engagement History
              </span>
              {history.length > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: withAlpha(palette.info, 0.15), color: palette.info }}
                >
                  {history.length}
                </span>
              )}
            </button>

            {historyOpen && (
              <div className="mt-3 space-y-1">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader size={18} className="animate-spin" style={styles.textSecondary} />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm py-3 px-2" style={styles.textSecondary}>
                    No engagement history yet.
                  </p>
                ) : (
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {history.map((event, idx) => (
                      <div
                        key={`${event.type}-${idx}`}
                        className="flex items-start gap-3 py-2 px-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: idx % 2 === 0
                            ? 'transparent'
                            : withAlpha(palette.cardMuted, mode === 'dark' ? 0.3 : 0.4)
                        }}
                      >
                        <div className="pt-0.5">
                          <HistoryIcon type={event.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium truncate" style={styles.textPrimary}>
                              {event.label}
                            </span>
                            <span className="text-xs flex-shrink-0" style={styles.textSecondary}>
                              {formatDate(event.date)}
                            </span>
                          </div>
                          {event.detail && (
                            <p className="text-xs mt-0.5 truncate" style={styles.textSecondary}>
                              {event.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StakeholderDetailModal;
