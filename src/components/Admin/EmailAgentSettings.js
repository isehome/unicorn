/**
 * Email Agent Settings Component
 *
 * Admin UI for configuring and monitoring the AI Email Agent.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Bot,
  Settings,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Eye,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  getEmailAgentConfig,
  updateEmailAgentConfig,
  getEmailAgentStats,
  triggerEmailProcessing,
  getProcessedEmails,
} from '../../services/emailAgentService';

const EmailAgentSettings = ({ mode = 'light' }) => {
  const [config, setConfig] = useState({});
  const [stats, setStats] = useState(null);
  const [recentEmails, setRecentEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [editedConfig, setEditedConfig] = useState({});

  const isDark = mode === 'dark';

  const styles = {
    card: {
      backgroundColor: isDark ? '#18181b' : '#ffffff',
      borderColor: isDark ? '#3f3f46' : '#e4e4e7',
    },
    text: {
      primary: { color: isDark ? '#fafafa' : '#18181b' },
      secondary: { color: isDark ? '#a1a1aa' : '#71717a' },
    },
    input: {
      backgroundColor: isDark ? '#27272a' : '#ffffff',
      borderColor: isDark ? '#3f3f46' : '#e4e4e7',
      color: isDark ? '#fafafa' : '#18181b',
    },
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, statsRes, emailsRes] = await Promise.all([
        getEmailAgentConfig(),
        getEmailAgentStats(7),
        getProcessedEmails({ limit: 10 }),
      ]);

      setConfig(configRes.config || {});
      setEditedConfig(
        Object.fromEntries(
          Object.entries(configRes.config || {}).map(([k, v]) => [k, v.value])
        )
      );
      setStats(statsRes.stats);
      setRecentEmails(emailsRes.emails || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateEmailAgentConfig(editedConfig);
      setMessage({ type: 'success', text: 'Configuration saved!' });
      await fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setMessage(null);
    try {
      const result = await triggerEmailProcessing();
      setMessage({
        type: 'success',
        text: `Processed ${result.results?.processed || 0} emails, ${result.results?.tickets_created || 0} tickets created`,
      });
      await fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const updateField = (key, value) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-6" style={styles.card}>
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" style={styles.text.secondary} />
          <span style={styles.text.secondary}>Loading email agent...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold" style={styles.text.primary}>
              AI Email Agent
            </h3>
            <p className="text-sm" style={styles.text.secondary}>
              Automatically process incoming emails with AI
            </p>
          </div>
        </div>
        <button
          onClick={handleProcess}
          disabled={processing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {processing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Process Now
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className="rounded-lg p-3 flex items-center gap-2"
          style={message.type === 'success'
            ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }
            : { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }
          }
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Mail className="w-5 h-5" />}
            label="Processed (7d)"
            value={stats.total}
            isDark={isDark}
          />
          <StatCard
            icon={<CheckCircle style={{ color: '#94AF32' }} />}
            label="Tickets Created"
            value={stats.by_action?.ticket_created || 0}
            isDark={isDark}
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            label="Pending Review"
            value={stats.pending_review}
            isDark={isDark}
            highlight={stats.pending_review > 0}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
            label="Avg Confidence"
            value={`${Math.round((stats.avg_confidence || 0) * 100)}%`}
            isDark={isDark}
          />
        </div>
      )}

      {/* Configuration */}
      <div className="rounded-xl border p-6 space-y-5" style={styles.card}>
        <h4 className="font-medium flex items-center gap-2" style={styles.text.primary}>
          <Settings className="w-4 h-4" />
          Configuration
        </h4>

        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium" style={styles.text.primary}>Enable Email Agent</p>
            <p className="text-sm" style={styles.text.secondary}>Process incoming emails automatically</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={editedConfig.enabled !== 'false'}
              onChange={(e) => updateField('enabled', e.target.checked ? 'true' : 'false')}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>

        {/* Auto Reply */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium" style={styles.text.primary}>Auto Reply</p>
            <p className="text-sm" style={styles.text.secondary}>Automatically send AI-generated replies</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={editedConfig.auto_reply !== 'false'}
              onChange={(e) => updateField('auto_reply', e.target.checked ? 'true' : 'false')}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>

        {/* Auto Create Tickets */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium" style={styles.text.primary}>Auto Create Tickets</p>
            <p className="text-sm" style={styles.text.secondary}>Automatically create service tickets</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={editedConfig.auto_create_tickets !== 'false'}
              onChange={(e) => updateField('auto_create_tickets', e.target.checked ? 'true' : 'false')}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>

        {/* CC Email */}
        <div>
          <label className="block text-sm font-medium mb-2" style={styles.text.secondary}>
            CC Email (Manager Notifications)
          </label>
          <input
            type="email"
            value={editedConfig.cc_email || ''}
            onChange={(e) => updateField('cc_email', e.target.value)}
            placeholder="managers@isehome.com"
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={styles.input}
          />
          <p className="text-xs mt-1" style={styles.text.secondary}>
            This email will be CC'd on all customer replies
          </p>
        </div>

        {/* Forward Email */}
        <div>
          <label className="block text-sm font-medium mb-2" style={styles.text.secondary}>
            Forward Email (Unclassified)
          </label>
          <input
            type="email"
            value={editedConfig.forward_email || ''}
            onChange={(e) => updateField('forward_email', e.target.value)}
            placeholder="support@isehome.com"
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={styles.input}
          />
          <p className="text-xs mt-1" style={styles.text.secondary}>
            Emails requiring human review will be forwarded here
          </p>
        </div>

        {/* Auto-Reply Confidence Slider */}
        {editedConfig.auto_reply !== 'false' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={styles.text.secondary}>
                Auto-Reply Confidence Threshold
              </label>
              <span
                className="text-lg font-bold tabular-nums px-3 py-1 rounded-lg"
                style={{
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  color: '#8b5cf6',
                }}
              >
                {Math.round((parseFloat(editedConfig.auto_reply_threshold) || 0.98) * 100)}%
              </span>
            </div>
            <div className="relative pt-1">
              <input
                type="range"
                min="0.90"
                max="1.00"
                step="0.01"
                value={editedConfig.auto_reply_threshold || '0.98'}
                onChange={(e) => updateField('auto_reply_threshold', e.target.value)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${((parseFloat(editedConfig.auto_reply_threshold || 0.98) - 0.90) / 0.10) * 100}%, ${isDark ? '#3f3f46' : '#e4e4e7'} ${((parseFloat(editedConfig.auto_reply_threshold || 0.98) - 0.90) / 0.10) * 100}%)`,
                  accentColor: '#8b5cf6',
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={styles.text.secondary}>90%</span>
                <span className="text-xs" style={styles.text.secondary}>95%</span>
                <span className="text-xs" style={styles.text.secondary}>100%</span>
              </div>
            </div>
            <p className="text-xs mt-2" style={styles.text.secondary}>
              Only auto-reply when AI confidence is at or above this level. Lower values reply more often; higher values are more cautious.
            </p>
          </div>
        )}

        {/* Review Threshold (for ticket creation / human review) */}
        <div>
          <label className="block text-sm font-medium mb-2" style={styles.text.secondary}>
            Review Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={editedConfig.require_review_threshold || '0.7'}
              onChange={(e) => updateField('require_review_threshold', e.target.value)}
              className="w-24 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={styles.input}
            />
            <span className="text-sm" style={styles.text.secondary}>
              ({Math.round((parseFloat(editedConfig.require_review_threshold) || 0.7) * 100)}%)
            </span>
          </div>
          <p className="text-xs mt-1" style={styles.text.secondary}>
            Emails below this confidence won't create tickets and will be flagged for human review
          </p>
        </div>

        {/* System Prompt */}
        <div>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-2 text-sm font-medium"
            style={styles.text.secondary}
          >
            {showPrompt ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            AI System Prompt
          </button>
          {showPrompt && (
            <textarea
              value={editedConfig.system_prompt || ''}
              onChange={(e) => updateField('system_prompt', e.target.value)}
              rows={10}
              className="w-full mt-2 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              style={styles.input}
            />
          )}
        </div>

        {/* Email Signature */}
        <div>
          <label className="block text-sm font-medium mb-2" style={styles.text.secondary}>
            Email Signature
          </label>
          <textarea
            value={editedConfig.signature || ''}
            onChange={(e) => updateField('signature', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            style={styles.input}
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        </div>
      </div>

      {/* Recent Emails */}
      {recentEmails.length > 0 && (
        <div className="rounded-xl border p-6" style={styles.card}>
          <h4 className="font-medium mb-4 flex items-center gap-2" style={styles.text.primary}>
            <Clock className="w-4 h-4" />
            Recent Processed Emails
          </h4>
          <div className="space-y-3">
            {recentEmails.map((email) => (
              <div
                key={email.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={styles.text.primary}>
                    {email.subject}
                  </p>
                  <p className="text-sm truncate" style={styles.text.secondary}>
                    {email.from_name || email.from_email}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span
                    className="px-2 py-1 rounded-full text-xs font-medium"
                    style={
                      email.ai_classification === 'support'
                        ? { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }
                        : email.ai_classification === 'spam'
                        ? { backgroundColor: 'rgba(113, 113, 122, 0.1)', color: '#71717a' }
                        : email.ai_classification === 'sales'
                        ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }
                        : { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }
                    }
                  >
                    {email.ai_classification}
                  </span>
                  {email.status === 'pending_review' && (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Stat Card Component
const StatCard = ({ icon, label, value, isDark, highlight = false }) => (
  <div
    className={`rounded-lg p-4 ${highlight ? 'ring-2 ring-amber-500' : ''}`}
    style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}
  >
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <span className="text-xs font-medium" style={{ color: isDark ? '#a1a1aa' : '#71717a' }}>
        {label}
      </span>
    </div>
    <p className="text-2xl font-bold" style={{ color: isDark ? '#fafafa' : '#18181b' }}>
      {value}
    </p>
  </div>
);

export default EmailAgentSettings;
