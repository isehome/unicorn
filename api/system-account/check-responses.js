/**
 * API Endpoint: Check Calendar Responses
 *
 * POST /api/system-account/check-responses
 *
 * Immediately checks calendar event responses for specific schedules
 * or all pending schedules. This allows the UI to trigger an immediate
 * check instead of waiting for the cron job.
 *
 * Body (optional):
 *   - scheduleIds: Array of schedule IDs to check (if omitted, checks all pending)
 */

const { processCalendarResponses } = require('../cron/process-calendar-responses');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[CheckResponses] Manual check triggered');

  try {
    const { scheduleIds } = req.body || {};

    // Use the same processing function as the cron job
    const results = await processCalendarResponses(scheduleIds);

    console.log('[CheckResponses] Check complete:', results);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('[CheckResponses] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
