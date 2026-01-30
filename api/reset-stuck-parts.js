/**
 * Reset Stuck Parts API
 *
 * Resets parts that are stuck in 'processing' status so they can be re-run.
 *
 * Endpoint: POST /api/reset-stuck-parts
 * Body: { partIds?: string[], resetAll?: boolean }
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { partIds, resetAll } = req.body;

  console.log('[Reset Stuck] Starting reset...');
  console.log('[Reset Stuck] partIds:', partIds);
  console.log('[Reset Stuck] resetAll:', resetAll);

  try {
    let query = getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: null,
        ai_enrichment_notes: 'Reset from stuck processing state'
      })
      .eq('ai_enrichment_status', 'processing');

    // If specific part IDs provided, only reset those
    if (partIds && partIds.length > 0) {
      query = query.in('id', partIds);
    } else if (!resetAll) {
      // Safety: require either partIds or explicit resetAll flag
      return res.status(400).json({
        error: 'Must provide partIds array or set resetAll: true'
      });
    }

    const { data, error, count } = await query.select('id, part_number, manufacturer');

    if (error) {
      console.error('[Reset Stuck] Error:', error);
      return res.status(500).json({ error: 'Failed to reset parts', details: error.message });
    }

    // Also reset associated manus_tasks
    if (data && data.length > 0) {
      const resetPartIds = data.map(p => p.id);

      await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'failed',
          error: 'Part reset from stuck state'
        })
        .in('part_id', resetPartIds)
        .in('status', ['pending', 'running', 'processing']);
    }

    console.log(`[Reset Stuck] Reset ${data?.length || 0} parts`);

    return res.status(200).json({
      success: true,
      message: `Reset ${data?.length || 0} stuck parts`,
      parts: data || []
    });

  } catch (error) {
    console.error('[Reset Stuck] Error:', error);
    return res.status(500).json({ error: 'Reset failed', details: error.message });
  }
};
