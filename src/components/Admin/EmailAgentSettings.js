/**
 * Email Agent Settings Component
 *
 * Configuration panel for the AI Email Agent.
 * Stats, header, and Process Now button live in the parent EmailAgentPage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Save,
} from 'lucide-react';
import {
  getEmailAgentConfig,
  updateEmailAgentConfig,
} from '../../services/emailAgentService';

const EmailAgentSettings = ({ mode = 'light' }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const configRes = await getEmailAgentConfig();
      setEditedConfig(
        Object.fromEntries(
          Object.entries(configRes.config || {}).map(([k, v]) => [k, v.value])
        )
      );
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

  const updateField = (key, value) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }));
  };

  // Helper: is auto-reply enabled?
  const autoReplyOn = editedConfig.auto_reply === 'true' || (editedConfig.auto_reply !== 'false' && editedConfig.auto_reply !== undefined);

  // Slider value (0.90 – 1.00)
  const sliderValue = parseFloat(editedConfig.auto_reply_threshold) || 0.98;
  const sliderPercent = Math.round(sliderValue * 100);
  const sliderFill = ((sliderValue - 0.90) / 0.10) * 100;

  if (loading) {
    return (
      <div className="rounded-xl border p-6" style={styles.card}>
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" style={styles.text.secondary} />
          <span style={styles.text.secondary}>Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Save feedback */}
      {message && (
        <div
          className="rounded-lg p-3 flex items-center gap-2"
          style={message.type === 'success'
            ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }
            : { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }
          }
        >
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Configuration Card */}
      <div className="rounded-xl border p-6 space-y-5" style={styles.card}>
        <h4 className="font-medium flex items-center gap-2" style={styles.text.primary}>
          <Settings className="w-4 h-4" />
          Configuration
        </h4>

        {/* Enable/Disable Agent */}
        <ToggleRow
          label="Enable Email Agent"
          description="Process incoming emails automatically"
          checked={editedConfig.enabled !== 'false'}
          onChange={(on) => updateField('enabled', on ? 'true' : 'false')}
          styles={styles}
        />

        {/* Auto Reply */}
        <ToggleRow
          label="Auto Reply"
          description="Automatically send AI-generated replies"
          checked={autoReplyOn}
          onChange={(on) => updateField('auto_reply', on ? 'true' : 'false')}
          styles={styles}
        />

        {/* Confidence slider — only when auto-reply is on */}
        {autoReplyOn && (
          <div
            className="ml-6 pl-4 border-l-2"
            style={{ borderColor: '#8b5cf6' }}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={styles.text.secondary}>
                Auto-Reply Confidence
              </label>
              <span
                className="text-base font-bold tabular-nums px-2.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  color: '#8b5cf6',
                }}
              >
                {sliderPercent}%
              </span>
            </div>
            <input
              type="range"
              min="0.90"
              max="1.00"
              step="0.01"
              value={sliderValue}
              onChange={(e) => updateField('auto_reply_threshold', e.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #8b5cf6 ${sliderFill}%, ${isDark ? '#3f3f46' : '#e4e4e7'} ${sliderFill}%)`,
                accentColor: '#8b5cf6',
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={styles.text.secondary}>90%</span>
              <span className="text-xs" style={styles.text.secondary}>95%</span>
              <span className="text-xs" style={styles.text.secondary}>100%</span>
            </div>
            <p className="text-xs mt-1.5" style={styles.text.secondary}>
              Only auto-reply when AI confidence meets this threshold.
            </p>
          </div>
        )}

        {/* Auto Create Tickets */}
        <ToggleRow
          label="Auto Create Tickets"
          description="Automatically create service tickets from emails"
          checked={editedConfig.auto_create_tickets !== 'false'}
          onChange={(on) => updateField('auto_create_tickets', on ? 'true' : 'false')}
          styles={styles}
        />

        {/* Divider */}
        <div className="border-t" style={{ borderColor: styles.card.borderColor }} />

        {/* CC Email */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.text.secondary}>
            CC Email (Manager Notifications)
          </label>
          <input
            type="email"
            value={editedConfig.cc_email || ''}
            onChange={(e) => updateField('cc_email', e.target.value)}
            placeholder="managers@isehome.com"
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={styles.input}
          />
          <p className="text-xs mt-1" style={styles.text.secondary}>
            CC'd on all customer replies
          </p>
        </div>

        {/* Forward Email */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.text.secondary}>
            Forward Email (Unclassified)
          </label>
          <input
            type="email"
            value={editedConfig.forward_email || ''}
            onChange={(e) => updateField('forward_email', e.target.value)}
            placeholder="support@isehome.com"
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={styles.input}
          />
          <p className="text-xs mt-1" style={styles.text.secondary}>
            Emails needing human review get forwarded here
          </p>
        </div>

        {/* Review Threshold */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.text.secondary}>
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
              className="w-24 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={styles.input}
            />
            <span className="text-sm" style={styles.text.secondary}>
              ({Math.round((parseFloat(editedConfig.require_review_threshold) || 0.7) * 100)}%)
            </span>
          </div>
          <p className="text-xs mt-1" style={styles.text.secondary}>
            Below this confidence → flagged for human review, no ticket created
          </p>
        </div>

        {/* Divider */}
        <div className="border-t" style={{ borderColor: styles.card.borderColor }} />

        {/* System Prompt — collapsible */}
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
              rows={8}
              className="w-full mt-2 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
              style={styles.input}
            />
          )}
        </div>

        {/* Email Signature */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.text.secondary}>
            Email Signature
          </label>
          <textarea
            value={editedConfig.signature || ''}
            onChange={(e) => updateField('signature', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
            style={styles.input}
          />
        </div>

        {/* Save */}
        <div className="flex justify-end pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

/** Reusable toggle row */
const ToggleRow = ({ label, description, checked, onChange, styles }) => (
  <div className="flex items-center justify-between">
    <div>
      <p className="font-medium" style={styles.text.primary}>{label}</p>
      <p className="text-sm" style={styles.text.secondary}>{description}</p>
    </div>
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
    </label>
  </div>
);

export default EmailAgentSettings;
