/**
 * System Account Service
 *
 * Frontend service for managing the system account configuration.
 * Uses Application Permissions - no OAuth flow needed.
 */

const API_BASE = '/api/system-account';

/**
 * Get the current status of the system account
 */
export async function getSystemAccountStatus() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[SystemAccount] Status check error:', error);
    return {
      connected: false,
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Configure the system account email
 */
export async function configureSystemAccount(email) {
  const response = await fetch(`${API_BASE}/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Configuration failed');
  }

  return await response.json();
}

/**
 * Send a test email from the system account
 */
export async function sendTestEmail(to = null) {
  const response = await fetch(`${API_BASE}/test-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Test email failed');
  }

  return await response.json();
}

export default {
  getSystemAccountStatus,
  configureSystemAccount,
  sendTestEmail,
};
