/**
 * SystemAccountSettings.js
 * 
 * Admin UI component for managing the system account connection.
 * Displays connection status, allows connecting/disconnecting, and shows logs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Link2, Link2Off, RefreshCw, CheckCircle, AlertCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronRight, Mail, Calendar,
  HardDrive, Shield, Clock, User, ExternalLink
} from 'lucide-react';
import {
  getSystemAccountStatus,
  initiateSystemAccountAuth,
  disconnectSystemAccount,
  manualRefreshToken,
  getRefreshLogs,
  formatStatusForDisplay
} from '../../services/systemAccountService';
import Button from '../ui/Button';

const SystemAccountSettings = ({ mode = 'dark' }) => {
  const [status, setStatus] = useState(null);
  const [displayStatus, setDisplayStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Load status on mount
  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const statusData = await getSystemAccountStatus();
      setStatus(statusData);
      setDisplayStatus(formatStatusForDisplay(statusData));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Check for success/error from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const successMsg = params.get('system_account_success');
    const errorMsg = params.get('system_account_error');

    if (successMsg) {
      setSuccess(decodeURIComponent(successMsg));
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
      // Reload status
      loadStatus();
    }

    if (errorMsg) {
      setError(decodeURIComponent(errorMsg));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadStatus]);

  // Load logs
  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const logsData = await getRefreshLogs(20);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Handle connect
  const handleConnect = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const authData = await initiateSystemAccountAuth();
      
      if (authData.authUrl) {
        // Redirect to Microsoft login
        window.location.href = authData.authUrl;
      } else {
        throw new Error('No auth URL returned');
      }
    } catch (err) {
      setError(err.message);
      setActionLoading(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect the system account? This will stop all system-level email and calendar operations.')) {
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      await disconnectSystemAccount();
      setSuccess('System account disconnected');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const result = await manualRefreshToken();
      
      if (result.refreshed > 0) {
        setSuccess('Token refreshed successfully');
      } else if (result.failed > 0) {
        setError('Token refresh failed. You may need to reconnect.');
      } else {
        setSuccess('No tokens to refresh');
      }
      
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle logs
  const toggleLogs = () => {
    if (!showLogs && logs.length === 0) {
      loadLogs();
    }
    setShowLogs(!showLogs);
  };

  // Style helpers
  const cardBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const cardBorder = mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200';
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-zinc-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600';
  const textMuted = mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400';

  const getStatusIcon = () => {
    if (!displayStatus) return <AlertCircle className="text-zinc-400" size={24} />;
    
    switch (displayStatus.statusColor) {
      case 'green':
        return <CheckCircle className="text-green-500" size={24} />;
      case 'amber':
        return <AlertTriangle className="text-amber-500" size={24} />;
      case 'red':
        return <AlertCircle className="text-red-500" size={24} />;
      default:
        return <AlertCircle className="text-zinc-400" size={24} />;
    }
  };

  const getStatusBadgeColor = () => {
    if (!displayStatus) return 'bg-zinc-500/20 text-zinc-400';
    
    switch (displayStatus.statusColor) {
      case 'green':
        return 'bg-green-500/20 text-green-400';
      case 'amber':
        return 'bg-amber-500/20 text-amber-400';
      case 'red':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  if (loading) {
    return (
      <div className={`${cardBg} border ${cardBorder} rounded-xl p-6`}>
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-violet-500" />
          <span className={textSecondary}>Loading system account status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardBg} border ${cardBorder} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className="p-6 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
              <Bot size={20} className="text-violet-400" />
            </div>
            <div>
              <h3 className={`font-semibold ${textPrimary}`}>System Account</h3>
              <p className={`text-sm ${textSecondary}`}>
                Unicorn's identity for sending emails and managing calendar
              </p>
            </div>
          </div>
          
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor()}`}>
            {displayStatus?.statusText || 'Unknown'}
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2">
          <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-300">{success}</span>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {/* Status Details */}
        {displayStatus?.details && (
          <div className="mb-6 space-y-3">
            {/* Account Info */}
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <p className={textPrimary}>{displayStatus.details.displayName}</p>
                <p className={`text-sm ${textSecondary}`}>{displayStatus.details.email}</p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className={`p-3 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-zinc-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw size={14} className={textMuted} />
                  <span className={`text-xs ${textMuted}`}>Last Refresh</span>
                </div>
                <p className={`text-sm font-medium ${textPrimary}`}>
                  {displayStatus.details.lastRefresh}
                </p>
              </div>
              
              <div className={`p-3 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-zinc-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className={textMuted} />
                  <span className={`text-xs ${textMuted}`}>Token Expires</span>
                </div>
                <p className={`text-sm font-medium ${textPrimary}`}>
                  {displayStatus.details.tokenExpires}
                </p>
              </div>
            </div>

            {/* Capabilities */}
            <div className="mt-4">
              <p className={`text-xs ${textMuted} mb-2`}>Capabilities</p>
              <div className="flex flex-wrap gap-2">
                {displayStatus.details.scopes?.includes('Mail.Send') && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                    <Mail size={12} /> Email
                  </span>
                )}
                {displayStatus.details.scopes?.some(s => s.includes('Calendar')) && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                    <Calendar size={12} /> Calendar
                  </span>
                )}
                {displayStatus.details.scopes?.some(s => s.includes('Files')) && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                    <HardDrive size={12} /> Files
                  </span>
                )}
              </div>
            </div>

            {/* Configured By */}
            {displayStatus.details.configuredBy && (
              <div className="mt-4 flex items-center gap-2 text-xs">
                <User size={12} className={textMuted} />
                <span className={textMuted}>
                  Configured by {displayStatus.details.configuredBy} on {displayStatus.details.configuredAt}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Message for non-connected state */}
        {!displayStatus?.details && displayStatus?.message && (
          <div className={`mb-6 p-4 rounded-lg ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-zinc-100'}`}>
            <p className={textSecondary}>{displayStatus.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {displayStatus?.canConnect && (
            <Button
              onClick={handleConnect}
              disabled={actionLoading}
              className="flex items-center gap-2"
            >
              {actionLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Link2 size={16} />
              )}
              {status?.connected ? 'Reconnect' : 'Connect System Account'}
            </Button>
          )}

          {displayStatus?.canRefresh && (
            <Button
              onClick={handleRefresh}
              disabled={actionLoading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {actionLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Refresh Token
            </Button>
          )}

          {displayStatus?.canDisconnect && (
            <Button
              onClick={handleDisconnect}
              disabled={actionLoading}
              variant="danger"
              className="flex items-center gap-2"
            >
              <Link2Off size={16} />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* Refresh Logs (Collapsible) */}
      <div className="border-t border-zinc-700">
        <button
          onClick={toggleLogs}
          className={`w-full flex items-center justify-between p-4 hover:bg-zinc-700/30 transition-colors ${textSecondary}`}
        >
          <span className="text-sm font-medium">Token Refresh History</span>
          {showLogs ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {showLogs && (
          <div className="px-4 pb-4">
            {logsLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 size={16} className="animate-spin text-violet-500" />
                <span className={textSecondary}>Loading logs...</span>
              </div>
            ) : logs.length === 0 ? (
              <p className={`text-sm ${textMuted} py-4`}>No refresh logs yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      mode === 'dark' ? 'bg-zinc-700/30' : 'bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {log.success ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <AlertCircle size={14} className="text-red-500" />
                      )}
                      <span className={textSecondary}>
                        {log.refresh_type === 'cron' ? 'Daily refresh' :
                         log.refresh_type === 'on_demand' ? 'On-demand refresh' :
                         log.refresh_type === 'initial_connect' ? 'Initial connection' :
                         log.refresh_type === 'disconnect' ? 'Disconnected' :
                         log.refresh_type}
                      </span>
                    </div>
                    <span className={textMuted}>
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className={`px-6 py-4 border-t ${cardBorder} ${mode === 'dark' ? 'bg-zinc-900/50' : 'bg-zinc-50'}`}>
        <div className="flex items-start gap-2">
          <Shield size={16} className={textMuted} />
          <p className={`text-xs ${textMuted}`}>
            The system account allows Unicorn to send notifications, manage calendar events, and store files 
            as its own identity. Tokens are automatically refreshed daily to maintain connectivity.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SystemAccountSettings;
