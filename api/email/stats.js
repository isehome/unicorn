/**
 * Email Agent Statistics
 *
 * GET /api/email/stats?days=7
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get counts
    const { data: emails } = await supabase
      .from('processed_emails')
      .select('ai_classification, action_taken, status, ai_confidence, processing_time_ms')
      .gte('processed_at', since.toISOString());

    const stats = {
      total: emails?.length || 0,
      by_classification: {},
      by_action: {},
      by_status: {},
      avg_confidence: 0,
      avg_processing_time_ms: 0,
      pending_review: 0,
    };

    if (emails && emails.length > 0) {
      let totalConfidence = 0;
      let totalTime = 0;
      let confidenceCount = 0;
      let timeCount = 0;

      emails.forEach(e => {
        // By classification
        const cls = e.ai_classification || 'unknown';
        stats.by_classification[cls] = (stats.by_classification[cls] || 0) + 1;

        // By action
        const action = e.action_taken || 'unknown';
        stats.by_action[action] = (stats.by_action[action] || 0) + 1;

        // By status
        const status = e.status || 'unknown';
        stats.by_status[status] = (stats.by_status[status] || 0) + 1;

        // Pending review count
        if (e.status === 'pending_review') {
          stats.pending_review++;
        }

        // Averages
        if (e.ai_confidence != null) {
          totalConfidence += parseFloat(e.ai_confidence);
          confidenceCount++;
        }
        if (e.processing_time_ms != null) {
          totalTime += e.processing_time_ms;
          timeCount++;
        }
      });

      stats.avg_confidence = confidenceCount > 0
        ? Math.round((totalConfidence / confidenceCount) * 100) / 100
        : 0;
      stats.avg_processing_time_ms = timeCount > 0
        ? Math.round(totalTime / timeCount)
        : 0;
    }

    res.json({ success: true, days, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
