/**
 * Email Agent Service
 *
 * Frontend service for managing the AI Email Agent.
 */

const API_BASE = '/api/email';

/**
 * Manually trigger email processing
 */
export async function triggerEmailProcessing() {
  const response = await fetch(`${API_BASE}/process-incoming`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Processing failed');
  }

  return await response.json();
}

/**
 * Get processed emails with pagination
 */
export async function getProcessedEmails(options = {}) {
  const { page = 1, limit = 20, status = null, classification = null } = options;

  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (status) params.set('status', status);
  if (classification) params.set('classification', classification);

  const response = await fetch(`${API_BASE}/processed?${params}`);

  if (!response.ok) {
    throw new Error('Failed to fetch processed emails');
  }

  return await response.json();
}

/**
 * Get email agent statistics
 */
export async function getEmailAgentStats(daysBack = 7) {
  const response = await fetch(`${API_BASE}/stats?days=${daysBack}`);

  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }

  return await response.json();
}

/**
 * Get email agent configuration
 */
export async function getEmailAgentConfig() {
  const response = await fetch(`${API_BASE}/config`);

  if (!response.ok) {
    throw new Error('Failed to fetch config');
  }

  return await response.json();
}

/**
 * Update email agent configuration
 */
export async function updateEmailAgentConfig(updates) {
  const response = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Update failed');
  }

  return await response.json();
}

/**
 * Mark email as reviewed
 */
export async function markEmailReviewed(emailId, notes = '') {
  const response = await fetch(`${API_BASE}/processed/${emailId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark as reviewed');
  }

  return await response.json();
}

/**
 * Reprocess an email
 */
export async function reprocessEmail(emailId) {
  const response = await fetch(`${API_BASE}/processed/${emailId}/reprocess`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to reprocess');
  }

  return await response.json();
}

export default {
  triggerEmailProcessing,
  getProcessedEmails,
  getEmailAgentStats,
  getEmailAgentConfig,
  updateEmailAgentConfig,
  markEmailReviewed,
  reprocessEmail,
};
