/**
 * System Account Settings Component
 *
 * Admin UI for configuring the system account.
 * Uses Application Permissions - just configure the email address.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Send,
  Save,
} from 'lucide-react';
import {
  getSystemAccountStatus,
  configureSystemAccount,
  sendTestEmail,
} from '../../services/systemAccountService';

const SystemAccountSettings = ({ mode = 'light' }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);

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

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSystemAccountStatus();
      setStatus(data);
      if (data.accountEmail) {
        setEmail(data.accountEmail);
      }
    } catch (err) {
      setStatus({ connected: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSave = async () => {
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await configureSystemAccount(email);
      setStatus(result.status);
      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const result = await sendTestEmail();
      setMessage({ type: 'success', text: `Test email sent to ${result.sentFrom}` });
    } catch (err) {
      setMessage({ type: 'error', text: `Test failed: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-6" style={styles.card}>
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" style={styles.text.secondary} />
          <span style={styles.text.secondary}>Checking system account...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h3 className="font-semibold" style={styles.text.primary}>
            System Account
          </h3>
          <p className="text-sm" style={styles.text.secondary}>
            Microsoft 365 account for system emails and calendar
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-lg p-3 flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Main Card */}
      <div className="rounded-xl border p-6 space-y-5" style={styles.card}>
        {/* Status Indicator */}
        <div className="flex items-center gap-3">
          {status?.healthy ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium" style={styles.text.primary}>
                Connected & Working
              </span>
            </>
          ) : status?.connected ? (
            <>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="font-medium" style={styles.text.primary}>
                Connected (Limited Access)
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium" style={styles.text.primary}>
                Not Connected
              </span>
            </>
          )}
        </div>

        {/* Error Display */}
        {status?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-600 dark:text-red-400">{status.error}</p>
            {status.details && (
              <p className="text-xs text-red-500/70 mt-1 font-mono">{status.details}</p>
            )}
          </div>
        )}

        {/* Email Configuration */}
        <div>
          <label className="block text-sm font-medium mb-2" style={styles.text.secondary}>
            System Account Email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="unicorn@yourcompany.com"
              className="flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              style={styles.input}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
          <p className="text-xs mt-2" style={styles.text.secondary}>
            This Microsoft 365 account must exist in your tenant with a mailbox license.
          </p>
        </div>

        {/* Account Info (when connected) */}
        {status?.accountName && (
          <div className="rounded-lg p-4" style={{ backgroundColor: isDark ? '#27272a' : '#f4f4f5' }}>
            <p className="text-sm font-medium" style={styles.text.primary}>
              {status.accountName}
            </p>
            <p className="text-xs" style={styles.text.secondary}>
              {status.accountEmail}
            </p>
          </div>
        )}

        {/* Test Email Button */}
        {status?.healthy && (
          <button
            onClick={handleTestEmail}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            style={{ borderColor: styles.card.borderColor }}
          >
            {testing ? (
              <RefreshCw className="w-4 h-4 animate-spin" style={styles.text.secondary} />
            ) : (
              <Send className="w-4 h-4" style={styles.text.secondary} />
            )}
            <span style={styles.text.primary}>Send Test Email</span>
          </button>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-4">
        <div className="flex gap-3">
          <Mail className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
              How it works
            </p>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
              The app uses <strong>Application Permissions</strong> to send email and manage
              calendar as this account. No login required - just configure the email address
              above and ensure the Azure AD app has Mail.Send and Calendars.ReadWrite
              application permissions with admin consent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemAccountSettings;
