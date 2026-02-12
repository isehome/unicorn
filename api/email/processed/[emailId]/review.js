/**
 * Mark Email as Reviewed
 *
 * POST /api/email/processed/:emailId/review
 * Body: { notes: "optional review notes" }
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { emailId } = req.query;
  const { notes = '' } = req.body || {};

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  try {
    const { data, error } = await supabase
      .from('processed_emails')
      .update({
        requires_human_review: false,
        review_notes: notes,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailId)
      .select('id, subject, requires_human_review, reviewed_at')
      .single();

    if (error) {
      console.error('[EmailReview] Update failed:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, email: data });
  } catch (error) {
    console.error('[EmailReview] Exception:', error);
    res.status(500).json({ error: error.message });
  }
};
