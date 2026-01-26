/**
 * Single Part Enrichment API - Manus AI Version (Async with Webhooks)
 *
 * Uses Manus AI (real browser-based research agent) to find verified documentation
 * URLs for AV/IT equipment.
 *
 * This endpoint uses an ASYNC approach:
 * 1. Creates a Manus task
 * 2. Saves task ID to database
 * 3. Returns immediately with task ID
 * 4. Manus webhook (/api/manus-webhook) processes results when complete
 *
 * Endpoint: POST /api/enrich-single-part-manus
 * Body: { partId: string }
 */

const { createClient } = require('@supabase/supabase-js');

// Manus API configuration
const MANUS_API_URL = 'https://api.manus.ai/v1';

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

  const { partId } = req.body;

  if (!partId) {
    return res.status(400).json({ error: 'partId is required' });
  }

  // Check for Manus API key
  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return res.status(500).json({
      error: 'Manus API key not configured',
      hint: 'Set MANUS_API_KEY environment variable'
    });
  }

  console.log(`[Manus] Starting document research for part: ${partId}`);

  try {
    // Fetch the part
    const { data: part, error: fetchError } = await getSupabase()
      .from('global_parts')
      .select('*')
      .eq('id', partId)
      .single();

    if (fetchError || !part) {
      console.error('[Manus] Part not found:', fetchError);
      return res.status(404).json({ error: 'Part not found' });
    }

    console.log(`[Manus] Researching: ${part.manufacturer} ${part.part_number} - ${part.name}`);

    // Mark as processing
    await getSupabase()
      .from('global_parts')
      .update({ ai_enrichment_status: 'processing' })
      .eq('id', partId);

    // Build the research prompt
    const prompt = buildResearchPrompt(part);

    // Get webhook URL - always use production URL for webhooks
    // VERCEL_URL gives preview deployment URLs which change, so we hardcode the production URL
    const webhookUrl = 'https://unicorn-one.vercel.app/api/manus-webhook';

    // First, register the webhook (if not already registered)
    console.log(`[Manus] Registering webhook: ${webhookUrl}`);
    try {
      await fetch(`${MANUS_API_URL}/webhooks`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'API_KEY': manusApiKey
        },
        body: JSON.stringify({
          webhook: {
            url: webhookUrl
          }
        })
      });
    } catch (webhookError) {
      console.log('[Manus] Webhook registration (may already exist):', webhookError.message);
    }

    // Create Manus task
    console.log(`[Manus] Creating research task...`);
    const taskResponse = await fetch(`${MANUS_API_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'API_KEY': manusApiKey
      },
      body: JSON.stringify({
        prompt: prompt,
        agentProfile: 'manus-1.6'  // Options: manus-1.6, manus-1.6-lite, manus-1.6-max
      })
    });

    if (!taskResponse.ok) {
      const errorText = await taskResponse.text();
      console.error('[Manus] Failed to create task:', errorText);
      throw new Error(`Manus API error: ${taskResponse.status} - ${errorText}`);
    }

    const taskData = await taskResponse.json();
    const taskId = taskData.task_id || taskData.id;
    console.log(`[Manus] Task created: ${taskId}`);

    // Save task to database for webhook to find later
    const { error: insertError } = await getSupabase()
      .from('manus_tasks')
      .insert({
        manus_task_id: taskId,
        part_id: partId,
        status: 'pending',
        prompt: prompt,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[Manus] Failed to save task:', insertError);
      // Continue anyway - the task was created in Manus
    }

    console.log(`[Manus] ✓ Task ${taskId} created, will complete via webhook`);

    // Return immediately - webhook will process results
    return res.status(202).json({
      success: true,
      async: true,
      message: 'Research task started. Results will be available when Manus completes (typically 5-10 minutes).',
      partId,
      partNumber: part.part_number,
      name: part.name,
      taskId,
      status: 'processing',
      webhookUrl
    });

  } catch (error) {
    console.error('[Manus] Error:', error);

    // Update status to error
    await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'error',
        ai_enrichment_notes: error.message || 'Unknown error starting Manus research'
      })
      .eq('id', partId);

    return res.status(500).json({
      error: 'Failed to start document research',
      details: error.message
    });
  }
};

/**
 * Build the research prompt for Manus
 * Includes instructions to create markdown docs when PDFs aren't available
 */
function buildResearchPrompt(part) {
  const manufacturer = part.manufacturer || 'Unknown';
  const partNumber = part.part_number || 'Unknown';
  const productName = part.name || partNumber;
  const category = part.category || 'Equipment';

  return `Research documentation for this AV/IT product and create documentation files:

**PRODUCT:**
- Manufacturer: ${manufacturer}
- Part Number: ${partNumber}
- Product Name: ${productName}
- Category: ${category}

**TASK 1: Find existing PDF documentation**
1. Go to ${manufacturer}'s official website
2. Find the product page for ${partNumber}
3. Look for downloadable PDFs: User Manual, Installation Guide, Datasheet, Quick Start Guide, Spec Sheet

**TASK 2: Create markdown documentation files**
For EACH of the following document types, create a .md file with useful information gathered from your research:

1. **${partNumber}-installation-guide.md** - Installation instructions including:
   - Physical installation steps
   - Mounting requirements (rack mount, shelf, wall, etc.)
   - Cable connections and wiring
   - Network setup if applicable
   - Initial configuration steps

2. **${partNumber}-specifications.md** - Technical specifications including:
   - Physical dimensions (width, depth, height in inches)
   - Weight
   - Power requirements (watts, voltage)
   - Network ports and connectivity
   - Environmental requirements
   - Rack mount info (U height if applicable)

3. **${partNumber}-quick-reference.md** - Quick reference card including:
   - Common settings and configurations
   - LED indicator meanings
   - Reset procedures
   - Troubleshooting tips
   - Support contact info

**RESPONSE FORMAT:**
Return a JSON object with:
{
  "manufacturer_website": "https://...",
  "product_page_url": "https://...",
  "documents": [
    {"type": "user_manual", "title": "...", "url": "https://...pdf", "found": true},
    {"type": "install_guide", "title": "...", "url": "https://...pdf", "found": true},
    {"type": "datasheet", "title": "...", "url": null, "found": false}
  ],
  "specifications": {
    "width_inches": null,
    "depth_inches": null,
    "height_inches": null,
    "weight_lbs": null,
    "power_watts": null,
    "is_rack_mountable": false,
    "u_height": null,
    "network_ports": null
  },
  "created_files": [
    {"filename": "${partNumber}-installation-guide.md", "type": "install_guide"},
    {"filename": "${partNumber}-specifications.md", "type": "datasheet"},
    {"filename": "${partNumber}-quick-reference.md", "type": "quick_reference"}
  ],
  "notes": "Summary of what was found and created"
}

**IMPORTANT:**
- Only include document URLs you verified exist
- ALWAYS create the markdown files with researched information
- If you can't find official PDFs, the markdown files become the primary documentation`;
}
