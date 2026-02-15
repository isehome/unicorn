/**
 * Replay Manus Enrichment
 *
 * Re-processes stored Manus task results without re-running Manus.
 * Useful for:
 * - Fixing data that failed to save due to type mismatches
 * - Re-applying improved parsing logic to existing data
 *
 * Endpoint: POST /api/replay-manus-enrichment
 * Body: { partId: string } or { taskId: string }
 */

const { requireAuth } = require('./_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

// Lazy initialize Supabase client
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

/**
 * Safely extract an integer from a value that might be a string with extra text
 * e.g., "2U for two Amps" -> 2, "125W per channel" -> 125
 */
function safeParseInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Safely extract a float from a value that might be a string with extra text
 * e.g., "4.63 lbs" -> 4.63
 */
function safeParseFloat(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const match = value.match(/^([\d.]+)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Safely parse a boolean from various formats
 */
function safeParseBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0') return false;
  }
  return null;
}

/**
 * Sanitize enrichment data to ensure correct types for database
 */
function sanitizeEnrichmentData(data) {
  const sanitized = { ...data };

  // Sanitize numeric fields
  const intFields = ['u_height', 'power_watts', 'num_channels'];
  const floatFields = ['width_inches', 'height_inches', 'depth_inches', 'weight_lbs', 'msrp', 'confidence'];
  const boolFields = ['poe_powered', 'rack_mountable'];

  for (const field of intFields) {
    if (field in sanitized) {
      sanitized[field] = safeParseInt(sanitized[field]);
    }
  }

  for (const field of floatFields) {
    if (field in sanitized) {
      sanitized[field] = safeParseFloat(sanitized[field]);
    }
  }

  for (const field of boolFields) {
    if (field in sanitized) {
      sanitized[field] = safeParseBoolean(sanitized[field]);
    }
  }

  return sanitized;
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

  // Auth required for parts enrichment
  const user = await requireAuth(req, res);
  if (!user) return;

  const { partId, taskId } = req.body;

  if (!partId && !taskId) {
    return res.status(400).json({ error: 'Must provide either partId or taskId' });
  }

  console.log('[Replay Manus] Starting replay for:', partId || taskId);

  try {
    // Find the most recent completed Manus task for this part
    let query = getSupabase()
      .from('manus_tasks')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    if (partId) {
      query = query.eq('part_id', partId);
    } else {
      query = query.eq('manus_task_id', taskId);
    }

    const { data: task, error: taskError } = await query.single();

    if (taskError || !task) {
      console.error('[Replay Manus] Task not found:', taskError);
      return res.status(404).json({ error: 'No completed Manus task found for this part' });
    }

    console.log('[Replay Manus] Found task:', task.manus_task_id);
    console.log('[Replay Manus] Task created at:', task.created_at);

    const storedResult = task.result;
    if (!storedResult) {
      return res.status(400).json({ error: 'Task has no stored result data' });
    }

    // Log what we're replaying
    console.log('[Replay Manus] Stored result keys:', Object.keys(storedResult));
    console.log('[Replay Manus] Original manufacturer_website:', storedResult.manufacturer_website);
    console.log('[Replay Manus] Original product_page_url:', storedResult.product_page_url);
    console.log('[Replay Manus] Original install_manual_urls:', storedResult.install_manual_urls);
    console.log('[Replay Manus] Original u_height:', storedResult.u_height);

    // Sanitize the data with our fixed parsing
    const sanitizedData = sanitizeEnrichmentData(storedResult);

    console.log('[Replay Manus] Sanitized u_height:', sanitizedData.u_height);
    console.log('[Replay Manus] Sanitized power_watts:', sanitizedData.power_watts);

    // Save via RPC
    const { data: saveResult, error: saveError } = await getSupabase()
      .rpc('save_parts_enrichment', {
        p_part_id: task.part_id,
        p_enrichment_data: sanitizedData,
        p_confidence: sanitizedData.confidence || 0.95,
        p_notes: `Replayed from Manus task ${task.manus_task_id} with fixed data sanitization`
      });

    if (saveError) {
      console.error('[Replay Manus] Save failed:', saveError);
      return res.status(500).json({
        error: 'Failed to save enrichment',
        details: saveError.message,
        code: saveError.code
      });
    }

    console.log('[Replay Manus] Save result:', JSON.stringify(saveResult));

    // Update task to mark it as replayed
    await getSupabase()
      .from('manus_tasks')
      .update({
        result: {
          ...storedResult,
          _replayed_at: new Date().toISOString(),
          _sanitized: true
        }
      })
      .eq('id', task.id);

    // Verify the save by reading back the part
    const { data: updatedPart } = await getSupabase()
      .from('global_parts')
      .select('manufacturer_website, product_page_url, install_manual_urls, technical_manual_urls, u_height')
      .eq('id', task.part_id)
      .single();

    console.log('[Replay Manus] Updated part data:', JSON.stringify(updatedPart));

    return res.status(200).json({
      success: true,
      taskId: task.manus_task_id,
      partId: task.part_id,
      savedFields: {
        manufacturer_website: updatedPart?.manufacturer_website,
        product_page_url: updatedPart?.product_page_url,
        install_manual_urls: updatedPart?.install_manual_urls,
        technical_manual_urls: updatedPart?.technical_manual_urls,
        u_height: updatedPart?.u_height
      }
    });

  } catch (error) {
    console.error('[Replay Manus] Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
