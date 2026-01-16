/**
 * Email Processing Cron Job
 *
 * Runs every 5 minutes to process incoming emails.
 *
 * Endpoint: POST /api/cron/process-emails
 * Schedule: every 5 minutes (cron: 0/5 * * * *)
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

    // Check if response is OK before trying to parse JSON
    if (!response.ok) {
      const text = await response.text();
      console.error('[Cron] Email processor returned error:', response.status, text.substring(0, 200));
      throw new Error(`Email processor returned ${response.status}: ${text.substring(0, 100)}`);
    }

    // Check content type to ensure it's JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[Cron] Email processor returned non-JSON:', contentType, text.substring(0, 200));
      throw new Error(`Email processor returned non-JSON response: ${contentType}`);
    }

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
