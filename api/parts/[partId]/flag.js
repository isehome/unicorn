/**
 * Flag Part AI Content as Wrong
 *
 * Marks a part's AI-enriched content as incorrect so it can be reviewed and corrected.
 *
 * POST /api/parts/[partId]/flag
 */

const { createClient } = require('@supabase/supabase-js');

let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return supabase;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { partId } = req.query;
  const { reason, flaggedAt } = req.body;

  if (!partId) {
    return res.status(400).json({ error: 'Part ID is required' });
  }

  console.log(`[Flag Part] Flagging part ${partId} as wrong. Reason: ${reason}`);

  try {
    // Update the part's enrichment status to 'flagged'
    const { error: updateError } = await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'flagged',
        ai_enrichment_notes: reason || 'Flagged as incorrect by user',
        ai_flagged_at: flaggedAt || new Date().toISOString()
      })
      .eq('id', partId);

    if (updateError) {
      console.error('[Flag Part] Update error:', updateError);
      return res.status(500).json({ error: 'Failed to flag part', details: updateError.message });
    }

    // Log the flag event for review queue
    await getSupabase()
      .from('ai_review_queue')
      .insert({
        part_id: partId,
        flag_reason: reason || 'No reason provided',
        flagged_at: flaggedAt || new Date().toISOString(),
        status: 'pending'
      })
      .catch(err => {
        // Table might not exist yet, log but don't fail
        console.log('[Flag Part] Could not log to review queue (table may not exist):', err.message);
      });

    console.log(`[Flag Part] ✓ Part ${partId} flagged successfully`);

    return res.status(200).json({
      success: true,
      message: 'Part flagged for review',
      partId
    });

  } catch (error) {
    console.error('[Flag Part] Error:', error);
    return res.status(500).json({ error: 'Failed to flag part', details: error.message });
  }
};
