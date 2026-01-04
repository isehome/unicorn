/**
 * systemAccountService.js
 * 
 * Frontend service for managing the system account connection.
 * Used by the Admin page to connect/disconnect and monitor the system account.
 */

/**
 * Get the current status of the system account
 */
export const getSystemAccountStatus = async () => {
  try {
    const response = await fetch('/api/system-account/status');
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to get status');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[SystemAccountService] Status error:', error);
    return {
      connected: false,
      error: error.message
    };
  }
};

/**
 * Initiate the OAuth flow to connect the system account
 * Returns the auth URL to redirect to
 */
export const initiateSystemAccountAuth = async () => {
  try {
    const response = await fetch('/api/system-account/auth');
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to initiate auth');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[SystemAccountService] Auth initiation error:', error);
    throw error;
  }
};

/**
 * Disconnect the system account
 */
export const disconnectSystemAccount = async (accountType = 'microsoft_365') => {
  try {
    const response = await fetch('/api/system-account/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ account_type: accountType })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to disconnect');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[SystemAccountService] Disconnect error:', error);
    throw error;
  }
};

/**
 * Manually trigger a token refresh (for testing/admin purposes)
 */
export const manualRefreshToken = async () => {
  try {
    const response = await fetch('/api/cron/refresh-system-token?manual=true');
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to refresh token');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[SystemAccountService] Manual refresh error:', error);
    throw error;
  }
};

/**
 * Get recent refresh logs for debugging
 */
export const getRefreshLogs = async (limit = 10) => {
  try {
    const { supabase } = await import('../lib/supabase');
    
    const { data, error } = await supabase
      .from('system_account_refresh_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[SystemAccountService] Get logs error:', error);
    return [];
  }
};

/**
 * Format the status for display
 */
export const formatStatusForDisplay = (status) => {
  if (!status) {
    return {
      statusText: 'Unknown',
      statusColor: 'gray',
      canConnect: true
    };
  }
  
  if (!status.connected) {
    return {
      statusText: 'Not Connected',
      statusColor: 'gray',
      canConnect: true,
      message: 'Click "Connect" to set up the system account.'
    };
  }
  
  if (!status.healthy) {
    const reason = status.healthDetails?.reason || 'unknown';
    let message = 'Token needs attention';
    
    switch (reason) {
      case 'no_token':
        message = 'No refresh token stored. Please reconnect.';
        break;
      case 'too_many_failures':
        message = `Token refresh failed ${status.consecutiveFailures} times. Please reconnect.`;
        break;
      case 'stale_token':
        message = 'Token has not been refreshed recently. Click "Refresh Now" to update.';
        break;
      default:
        message = status.healthDetails?.message || 'Please check the connection.';
    }
    
    return {
      statusText: 'Needs Attention',
      statusColor: 'amber',
      canConnect: true,
      canRefresh: reason === 'stale_token',
      message
    };
  }
  
  // Connected and healthy
  const expiresAt = status.tokenExpires ? new Date(status.tokenExpires) : null;
  const lastRefresh = status.lastRefresh ? new Date(status.lastRefresh) : null;
  
  return {
    statusText: 'Connected',
    statusColor: 'green',
    canConnect: false,
    canDisconnect: true,
    canRefresh: true,
    message: `Connected as ${status.accountEmail}`,
    details: {
      displayName: status.displayName,
      email: status.accountEmail,
      lastRefresh: lastRefresh ? formatRelativeTime(lastRefresh) : 'Never',
      tokenExpires: expiresAt ? formatRelativeTime(expiresAt) : 'Unknown',
      scopes: status.grantedScopes || [],
      configuredBy: status.configuredBy,
      configuredAt: status.configuredAt ? new Date(status.configuredAt).toLocaleDateString() : null
    }
  };
};

/**
 * Format a date as relative time (e.g., "2 hours ago", "in 3 days")
 */
const formatRelativeTime = (date) => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  
  if (diffMs < 0) {
    // Past
    if (diffMins > -60) return `${-diffMins} minute${diffMins === -1 ? '' : 's'} ago`;
    if (diffHours > -24) return `${-diffHours} hour${diffHours === -1 ? '' : 's'} ago`;
    return `${-diffDays} day${diffDays === -1 ? '' : 's'} ago`;
  } else {
    // Future
    if (diffMins < 60) return `in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
    if (diffHours < 24) return `in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  }
};

export default {
  getSystemAccountStatus,
  initiateSystemAccountAuth,
  disconnectSystemAccount,
  manualRefreshToken,
  getRefreshLogs,
  formatStatusForDisplay
};
