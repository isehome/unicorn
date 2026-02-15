/**
 * Admin endpoint to clear stale AI enrichment statuses
 *
 * This clears:
 * 1. Parts with 'needs_review' status (legacy AI review system)
 * 2. Parts stuck in 'processing' status for more than 1 hour
 *
 * POST /api/admin/clear-stale-statuses
 */

const { requireAuth } = require('../_authMiddleware');
const { strictRateLimit } = require('../_rateLimiter');
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

  // Auth + strict rate limit for admin endpoints
  if (!strictRateLimit(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const results = {
      needs_review_cleared: 0,
      stuck_processing_cleared: 0,
      errors: []
    };

    // 1. Clear all 'needs_review' statuses (legacy AI review system)
    const { data: needsReviewParts, error: needsReviewError } = await getSupabase()
      .from('global_parts')
      .select('id, part_number, name')
      .eq('ai_enrichment_status', 'needs_review');

    if (needsReviewError) {
      results.errors.push(`Failed to fetch needs_review parts: ${needsReviewError.message}`);
    } else if (needsReviewParts && needsReviewParts.length > 0) {
      const { error: updateError } = await getSupabase()
        .from('global_parts')
        .update({
          ai_enrichment_status: null,
          ai_enrichment_notes: 'Status cleared - legacy needs_review removed'
        })
        .eq('ai_enrichment_status', 'needs_review');

      if (updateError) {
        results.errors.push(`Failed to clear needs_review: ${updateError.message}`);
      } else {
        results.needs_review_cleared = needsReviewParts.length;
        console.log(`[Admin] Cleared ${needsReviewParts.length} parts with needs_review status`);
      }
    }

    // 2. Clear stuck 'processing' statuses (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: stuckParts, error: stuckError } = await getSupabase()
      .from('global_parts')
      .select('id, part_number, name, updated_at')
      .eq('ai_enrichment_status', 'processing')
      .lt('updated_at', oneHourAgo);

    if (stuckError) {
      results.errors.push(`Failed to fetch stuck processing parts: ${stuckError.message}`);
    } else if (stuckParts && stuckParts.length > 0) {
      const partIds = stuckParts.map(p => p.id);

      const { error: updateStuckError } = await getSupabase()
        .from('global_parts')
        .update({
          ai_enrichment_status: null,
          ai_enrichment_notes: 'Status cleared - was stuck in processing for >1 hour'
        })
        .in('id', partIds);

      if (updateStuckError) {
        results.errors.push(`Failed to clear stuck processing: ${updateStuckError.message}`);
      } else {
        results.stuck_processing_cleared = stuckParts.length;
        results.stuck_parts = stuckParts.map(p => ({ id: p.id, part_number: p.part_number, name: p.name }));
        console.log(`[Admin] Cleared ${stuckParts.length} parts stuck in processing`);
      }
    }

    // 3. Also clear any manus_tasks that are stuck
    const { data: stuckTasks, error: stuckTasksError } = await getSupabase()
      .from('manus_tasks')
      .select('id, manus_task_id, part_id, status')
      .in('status', ['pending', 'processing', 'running'])
      .lt('created_at', oneHourAgo);

    if (!stuckTasksError && stuckTasks && stuckTasks.length > 0) {
      const { error: updateTasksError } = await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'timeout',
          error_message: 'Task timed out after 1 hour'
        })
        .in('id', stuckTasks.map(t => t.id));

      if (!updateTasksError) {
        results.stuck_tasks_cleared = stuckTasks.length;
        console.log(`[Admin] Cleared ${stuckTasks.length} stuck manus_tasks`);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Stale statuses cleared',
      ...results
    });

  } catch (error) {
    console.error('[Admin] Error clearing stale statuses:', error);
    return res.status(500).json({
      error: 'Failed to clear stale statuses',
      details: error.message
    });
  }
};
