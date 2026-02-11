/**
 * EmailAgentPage.js
 *
 * Standalone Email Agent page showing inbox, outbox, and settings
 * for the Unicorn AI Email Agent (unicorn@isehome.com).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Inbox, Send, Settings, Bot, Play, RefreshCw,
  CheckCircle, AlertTriangle, Clock, TrendingUp,
  ChevronDown, ChevronRight, Eye, ArrowUpRight,
  Ticket, XCircle, Filter,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import EmailAgentSettings from '../components/Admin/EmailAgentSettings';
import {
  getProcessedEmails,
  getEmailAgentStats,
  triggerEmailProcessing,
} from '../services/emailAgentService';

const TABS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'outbox', label: 'Outbox', icon: Send },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const CLASSIFICATION_STYLES = {
  support: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', label: 'Support' },
  sales: { bg: 'rgba(148, 175, 50, 0.1)', color: '#94AF32', label: 'Sales' },
  spam: { bg: 'rgba(113, 113, 122, 0.1)', color: '#71717a', label: 'Spam' },
  internal: { bg: 'rgba(113, 113, 122, 0.1)', color: '#71717a', label: 'Internal' },
  reply_to_notification: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6', label: 'Reply' },
  unknown: { bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', label: 'Unknown' },
};

const ACTION_STYLES = {
  ticket_created: { bg: 'rgba(148, 175, 50, 0.1)', color: '#94AF32', label: 'Ticket Created', icon: Ticket },
  replied: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', label: 'Replied', icon: Send },
  forwarded: { bg: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6', label: 'Forwarded', icon: ArrowUpRight },
  ignored: { bg: 'rgba(113, 113, 122, 0.1)', color: '#71717a', label: 'Ignored', icon: XCircle },
  pending_review: { bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', label: 'Needs Review', icon: AlertTriangle },
  failed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', label: 'Failed', icon: XCircle },
};

const EmailAgentPage = () => {
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  const [activeTab, setActiveTab] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [filterClassification, setFilterClassification] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const filterOpts = { page, limit: 25 };

      // For outbox, filter by action
      if (activeTab === 'outbox') {
        filterOpts.status = 'processed';
      }
      if (filterClassification !== 'all' && activeTab === 'inbox') {
        filterOpts.classification = filterClassification;
      }

      const [emailsRes, statsRes] = await Promise.all([
        getProcessedEmails(filterOpts),
        getEmailAgentStats(7),
      ]);

      let emailList = emailsRes.emails || [];

      // Filter outbox to only show replied/forwarded
      if (activeTab === 'outbox') {
        emailList = emailList.filter(e =>
          e.action_taken === 'replied' || e.action_taken === 'ticket_created' || e.action_taken === 'forwarded'
        );
      }

      setEmails(emailList);
      setPagination(emailsRes.pagination);
      setStats(statsRes.stats);
    } catch (err) {
      console.error('[EmailAgentPage] Fetch error:', err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterClassification, page]);

  useEffect(() => {
    if (activeTab !== 'settings') {
      fetchData();
    }
  }, [fetchData, activeTab]);

  const handleProcessNow = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const result = await triggerEmailProcessing();
      const r = result.results || {};
      setMessage({
        type: 'success',
        text: `Processed ${r.processed || 0} emails · ${r.tickets_created || 0} tickets · ${r.replies_sent || 0} replies`,
      });
      await fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  const renderBadge = (styles) => (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: styles.bg, color: styles.color }}
    >
      {styles.label}
    </span>
  );

  const renderEmailRow = (email) => {
    const classStyle = CLASSIFICATION_STYLES[email.ai_classification] || CLASSIFICATION_STYLES.unknown;
    const actionStyle = ACTION_STYLES[email.action_taken] || ACTION_STYLES.pending_review;
    const isExpanded = expandedEmail === email.id;
    const confidence = email.ai_confidence != null ? Math.round(email.ai_confidence * 100) : null;

    return (
      <div key={email.id} className="border-b last:border-b-0" style={{ borderColor: isDark ? '#3f3f46' : '#e4e4e7' }}>
        {/* Row */}
        <button
          onClick={() => setExpandedEmail(isExpanded ? null : email.id)}
          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          {isExpanded
            ? <ChevronDown size={14} className="text-zinc-400 flex-shrink-0" />
            : <ChevronRight size={14} className="text-zinc-400 flex-shrink-0" />
          }

          {/* From */}
          <div className="w-40 flex-shrink-0 min-w-0">
            <p className="text-sm font-medium truncate text-zinc-900 dark:text-white">
              {email.from_name || email.from_email?.split('@')[0] || 'Unknown'}
            </p>
            <p className="text-xs truncate text-zinc-500 dark:text-zinc-400">
              {email.from_email}
            </p>
          </div>

          {/* Subject + summary */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-zinc-900 dark:text-white">
              {email.subject || '(No Subject)'}
            </p>
            <p className="text-xs truncate text-zinc-500 dark:text-zinc-400">
              {email.ai_summary || email.body_preview || ''}
            </p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {renderBadge(classStyle)}
            {renderBadge(actionStyle)}
            {confidence != null && (
              <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 w-10 text-right">
                {confidence}%
              </span>
            )}
          </div>

          {/* Time */}
          <span className="text-xs text-zinc-400 w-16 text-right flex-shrink-0">
            {formatDate(email.received_at)}
          </span>
        </button>

        {/* Expanded Detail */}
        {isExpanded && (
          <div
            className="px-12 pb-4 space-y-3"
            style={{ backgroundColor: isDark ? '#1a1a1e' : '#fafafa' }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Classification</p>
                <p className="text-zinc-900 dark:text-white">{email.ai_classification}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Urgency</p>
                <p className="text-zinc-900 dark:text-white">{email.ai_urgency || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sentiment</p>
                <p className="text-zinc-900 dark:text-white">{email.ai_sentiment || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Customer Match</p>
                <p className="text-zinc-900 dark:text-white">{email.matched_customer_name || 'Not matched'}</p>
              </div>
            </div>

            {email.ai_summary && (
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">AI Summary</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{email.ai_summary}</p>
              </div>
            )}

            {email.ai_suggested_response && (
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">AI Suggested Response</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 p-3 rounded-lg">
                  {email.ai_suggested_response}
                </p>
              </div>
            )}

            {email.ticket_id && (
              <div className="flex items-center gap-2">
                <Ticket size={14} style={{ color: '#94AF32' }} />
                <a
                  href={`/service/tickets/${email.ticket_id}`}
                  className="text-sm text-violet-600 hover:underline"
                >
                  View Service Ticket →
                </a>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span>Processed: {formatDate(email.processed_at)}</span>
              {email.processing_time_ms && <span>{email.processing_time_ms}ms</span>}
              {email.forwarded_to && <span>Forwarded to: {email.forwarded_to}</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-4">

        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">unicorn@isehome.com</p>
            </div>
          </div>
          <button
            onClick={handleProcessNow}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Process Now
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            className="rounded-lg p-3 flex items-center gap-2 mb-4"
            style={message.type === 'success'
              ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }
              : { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }
            }
          >
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatCard icon={<Mail className="w-4 h-4 text-violet-500" />} label="Processed (7d)" value={stats.total || 0} isDark={isDark} />
            <StatCard icon={<Ticket className="w-4 h-4" style={{ color: '#94AF32' }} />} label="Tickets" value={stats.by_action?.ticket_created || 0} isDark={isDark} />
            <StatCard icon={<Send className="w-4 h-4 text-blue-500" />} label="Replies" value={stats.by_action?.replied || 0} isDark={isDark} />
            <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} label="Needs Review" value={stats.pending_review || 0} isDark={isDark} highlight={stats.pending_review > 0} />
            <StatCard icon={<TrendingUp className="w-4 h-4 text-blue-500" />} label="Avg Confidence" value={`${Math.round((stats.avg_confidence || 0) * 100)}%`} isDark={isDark} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: isDark ? '#3f3f46' : '#e4e4e7' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(1); setExpandedEmail(null); }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}

          {/* Inbox filter */}
          {activeTab === 'inbox' && (
            <div className="ml-auto flex items-center gap-2 pb-2">
              <Filter size={14} className="text-zinc-400" />
              <select
                value={filterClassification}
                onChange={(e) => { setFilterClassification(e.target.value); setPage(1); }}
                className="text-xs bg-transparent border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-zinc-600 dark:text-zinc-300"
              >
                <option value="all">All</option>
                <option value="support">Support</option>
                <option value="sales">Sales</option>
                <option value="spam">Spam</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'settings' ? (
          <EmailAgentSettings mode={mode} />
        ) : (
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: isDark ? '#18181b' : '#ffffff',
              borderColor: isDark ? '#3f3f46' : '#e4e4e7',
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                <span className="ml-3 text-sm text-zinc-500">Loading emails...</span>
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <Mail className="w-10 h-10 mb-3" />
                <p className="text-sm font-medium">No emails yet</p>
                <p className="text-xs mt-1">
                  {activeTab === 'inbox'
                    ? 'Send an email to unicorn@isehome.com to test'
                    : 'No outgoing emails have been sent yet'
                  }
                </p>
              </div>
            ) : (
              <>
                {emails.map(renderEmailRow)}

                {/* Pagination */}
                {pagination && pagination.total_pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: isDark ? '#3f3f46' : '#e4e4e7' }}>
                    <span className="text-xs text-zinc-500">
                      Page {pagination.page} of {pagination.total_pages} · {pagination.total} total
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 text-xs rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
                        disabled={page >= pagination.total_pages}
                        className="px-3 py-1 text-xs rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, isDark, highlight = false }) => (
  <div
    className={`rounded-lg p-3 ${highlight ? 'ring-2 ring-amber-500' : ''}`}
    style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}
  >
    <div className="flex items-center gap-1.5 mb-0.5">
      {icon}
      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
    <p className="text-xl font-bold text-zinc-900 dark:text-white">{value}</p>
  </div>
);

export default EmailAgentPage;
