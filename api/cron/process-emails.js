/**
 * Email Processing Cron Job
 *
 * Runs every 5 minutes to process incoming emails.
 *
 * Endpoint: POST /api/cron/process-emails
 * Schedule: */5 * * * * (every 5 minutes)
 */

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[Cron] Starting email processing job...');

  try {
    // Call the main processor
    const protocol = req.headers.host?.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${req.headers.host}`;

    const response = await fetch(`${baseUrl}/api/email/process-incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    console.log('[Cron] Email processing completed:', result);

    res.json({
      success: true,
      triggered_at: new Date().toISOString(),
      result,
    });

  } catch (error) {
    console.error('[Cron] Email processing failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
