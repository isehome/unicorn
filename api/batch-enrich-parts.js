/**
 * Batch Part Enrichment API - Runs multiple Manus tasks in parallel
 *
 * Finds all parts that need AI enrichment (excluding prewire items)
 * and starts Manus research tasks for them in parallel.
 *
 * Endpoint: POST /api/batch-enrich-parts
 * Body: {
 *   limit?: number (default 10, max 20),
 *   dryRun?: boolean (default false - just shows what would be processed)
 * }
 */

const { createClient } = require('@supabase/supabase-js');

const MANUS_API_URL = 'https://api.manus.ai/v1';

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

  const { limit = 10, dryRun = false } = req.body || {};
  const maxLimit = Math.min(limit, 20); // Cap at 20 parallel tasks

  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey && !dryRun) {
    return res.status(500).json({ error: 'MANUS_API_KEY not configured' });
  }

  console.log(`[Batch Enrich] Starting batch enrichment (limit: ${maxLimit}, dryRun: ${dryRun})`);

  try {
    // Find parts that need enrichment, excluding prewire items
    // Skip parts that are: wires, cables, brackets, tools, accessories, or marked as required_for_prewire
    const { data: parts, error: fetchError } = await getSupabase()
      .from('global_parts')
      .select('id, name, part_number, manufacturer, category, required_for_prewire, ai_enrichment_status')
      .or('ai_enrichment_status.is.null,ai_enrichment_status.eq.pending,ai_enrichment_status.eq.error')
      .eq('required_for_prewire', false) // Skip prewire items
      .order('created_at', { ascending: true })
      .limit(100); // Fetch more than we need to filter

    if (fetchError) {
      console.error('[Batch Enrich] Error fetching parts:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch parts' });
    }

    // Additional filtering for categories/names that indicate prewire items
    const skipPatterns = [
      /wire/i, /cable/i, /bracket/i, /tool/i, /mount/i, /screw/i,
      /connector/i, /adapter/i, /plug/i, /jack/i, /plate/i,
      /accessory/i, /accessories/i, /strap/i, /tie/i, /velcro/i,
      /tape/i, /label/i, /marker/i, /sleeve/i, /grommet/i
    ];

    const partsToEnrich = parts.filter(part => {
      const name = (part.name || '').toLowerCase();
      const category = (part.category || '').toLowerCase();

      // Skip if name or category matches skip patterns
      for (const pattern of skipPatterns) {
        if (pattern.test(name) || pattern.test(category)) {
          return false;
        }
      }
      return true;
    }).slice(0, maxLimit);

    console.log(`[Batch Enrich] Found ${parts.length} parts needing enrichment, ${partsToEnrich.length} after filtering prewire items`);

    // Count stats
    const stats = {
      totalNeedingEnrichment: parts.length,
      skippedAsPrewire: parts.length - partsToEnrich.length,
      toBeProcessed: partsToEnrich.length,
      estimatedCredits: partsToEnrich.length * 100, // ~100 credits per part
      partsToProcess: partsToEnrich.map(p => ({
        id: p.id,
        name: p.name,
        partNumber: p.part_number,
        manufacturer: p.manufacturer
      }))
    };

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        message: 'Dry run - no tasks started',
        ...stats
      });
    }

    // Register webhook once
    const webhookUrl = 'https://unicorn-one.vercel.app/api/manus-webhook';
    try {
      await fetch(`${MANUS_API_URL}/webhooks`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'API_KEY': manusApiKey
        },
        body: JSON.stringify({ webhook: { url: webhookUrl } })
      });
    } catch (e) {
      console.log('[Batch Enrich] Webhook registration (may already exist)');
    }

    // Start all tasks in parallel
    const results = await Promise.allSettled(
      partsToEnrich.map(part => startManusTask(part, manusApiKey, webhookUrl))
    );

    // Summarize results
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    const taskDetails = results.map((r, i) => ({
      part: partsToEnrich[i].part_number,
      name: partsToEnrich[i].name,
      status: r.status,
      taskId: r.status === 'fulfilled' ? r.value.taskId : null,
      error: r.status === 'rejected' ? r.reason?.message : null
    }));

    console.log(`[Batch Enrich] ✓ Started ${succeeded} tasks, ${failed} failed`);

    return res.status(200).json({
      success: true,
      message: `Started ${succeeded} Manus research tasks`,
      stats: {
        ...stats,
        succeeded,
        failed
      },
      tasks: taskDetails
    });

  } catch (error) {
    console.error('[Batch Enrich] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Start a single Manus task for a part
 */
async function startManusTask(part, apiKey, webhookUrl) {
  const prompt = buildResearchPrompt(part);

  // Mark as processing
  await getSupabase()
    .from('global_parts')
    .update({ ai_enrichment_status: 'processing' })
    .eq('id', part.id);

  // Create Manus task
  const response = await fetch(`${MANUS_API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'API_KEY': apiKey
    },
    body: JSON.stringify({
      prompt: prompt,
      agentProfile: 'manus-1.6'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Manus API error: ${response.status} - ${errorText}`);
  }

  const taskData = await response.json();
  const taskId = taskData.task_id || taskData.id;

  // Save task to database
  await getSupabase()
    .from('manus_tasks')
    .insert({
      manus_task_id: taskId,
      part_id: part.id,
      status: 'pending',
      prompt: prompt,
      created_at: new Date().toISOString()
    });

  console.log(`[Batch Enrich] Task ${taskId} started for ${part.part_number}`);

  return { taskId, partId: part.id };
}

/**
 * Build the research prompt for Manus
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

**TASK 1: Find the product page**
1. Go to ${manufacturer}'s official website
2. Find the EXACT product page for ${partNumber}
3. Copy the direct URL to this specific product (this is CRITICAL)

**TASK 2: Find existing PDF documentation**
1. On the product page, look for downloadable PDFs
2. Find: User Manual, Installation Guide, Datasheet, Quick Start Guide, Spec Sheet

**TASK 3: Create markdown documentation files**
Create these .md files with information gathered from your research:

1. **${partNumber}-installation-guide.md** - Installation instructions
2. **${partNumber}-specifications.md** - Technical specifications (dimensions, power, etc.)
3. **${partNumber}-quick-reference.md** - Quick reference card

**RESPONSE FORMAT:**
Return a JSON object with:
{
  "manufacturer_website": "https://...",
  "product_page_url": "https://... (DIRECT link to this product's page - REQUIRED)",
  "documents": [
    {"type": "user_manual", "title": "...", "url": "https://...pdf", "found": true}
  ],
  "specifications": {
    "width_inches": null,
    "depth_inches": null,
    "height_inches": null,
    "power_watts": null,
    "is_rack_mountable": false,
    "u_height": null
  },
  "created_files": [
    {"filename": "${partNumber}-installation-guide.md", "type": "install_guide"}
  ],
  "notes": "Summary of findings"
}

**CRITICAL:**
- product_page_url MUST be the direct link to this product on the manufacturer's website
- A technician should click this link and go straight to the product page
- Do NOT use search pages or category pages`;
}
