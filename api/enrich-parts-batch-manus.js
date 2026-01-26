/**
 * Batch Manus Research Endpoint
 *
 * Triggers Manus research for multiple parts at once.
 * Each part gets its own Manus task, and results come back via webhook.
 *
 * Endpoint: POST /api/enrich-parts-batch-manus
 * Body: { partIds?: string[], limit?: number, filter?: 'unenriched' | 'all' }
 *
 * If partIds provided: processes those specific parts
 * If filter='unenriched': processes parts without enrichment data
 * If limit provided: caps the number of parts processed
 */

const { createClient } = require('@supabase/supabase-js');

const MANUS_API_URL = 'https://api.manus.ai/v1/tasks';
const MANUS_API_KEY = process.env.MANUS_API_KEY;

// Rate limiting: Manus may have limits on concurrent tasks
const MAX_CONCURRENT_TASKS = 5;
const DELAY_BETWEEN_TASKS_MS = 2000; // 2 seconds between task creations

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

  // Check API key
  if (!MANUS_API_KEY) {
    return res.status(500).json({ error: 'MANUS_API_KEY not configured' });
  }

  try {
    const { partIds, limit = 10, filter = 'unenriched' } = req.body;

    console.log(`[Batch Manus] Starting batch research: partIds=${partIds?.length || 'none'}, limit=${limit}, filter=${filter}`);

    let partsToProcess = [];

    if (partIds && partIds.length > 0) {
      // Process specific parts
      const { data: parts, error } = await getSupabase()
        .from('global_parts')
        .select('id, part_number, name, manufacturer, category')
        .in('id', partIds);

      if (error) throw error;
      partsToProcess = parts || [];
    } else {
      // Query based on filter
      let query = getSupabase()
        .from('global_parts')
        .select('id, part_number, name, manufacturer, category');

      if (filter === 'unenriched') {
        // Parts that haven't been enriched yet
        query = query.or('ai_enrichment_status.is.null,ai_enrichment_status.eq.pending');
      }

      query = query.limit(limit);

      const { data: parts, error } = await query;
      if (error) throw error;
      partsToProcess = parts || [];
    }

    if (partsToProcess.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No parts to process',
        processed: 0
      });
    }

    console.log(`[Batch Manus] Found ${partsToProcess.length} parts to process`);

    // Get webhook URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://unicorn-one.vercel.app';
    const webhookUrl = `${baseUrl}/api/manus-webhook`;

    // Process parts in batches to avoid overwhelming Manus
    const results = {
      submitted: [],
      failed: [],
      skipped: []
    };

    for (let i = 0; i < partsToProcess.length; i++) {
      const part = partsToProcess[i];

      // Check if already has a pending task
      const { data: existingTask } = await getSupabase()
        .from('manus_tasks')
        .select('id')
        .eq('part_id', part.id)
        .in('status', ['pending', 'running'])
        .single();

      if (existingTask) {
        console.log(`[Batch Manus] Part ${part.part_number} already has pending task, skipping`);
        results.skipped.push({ id: part.id, part_number: part.part_number, reason: 'Already has pending task' });
        continue;
      }

      // Rate limiting
      if (results.submitted.length >= MAX_CONCURRENT_TASKS) {
        console.log(`[Batch Manus] Reached max concurrent tasks (${MAX_CONCURRENT_TASKS}), stopping`);
        break;
      }

      try {
        // Create Manus task
        const taskResult = await createManusTask(part, webhookUrl);

        if (taskResult.success) {
          // Save to database
          await getSupabase()
            .from('manus_tasks')
            .insert({
              manus_task_id: taskResult.taskId,
              part_id: part.id,
              status: 'pending',
              prompt: taskResult.prompt
            });

          // Update part status
          await getSupabase()
            .from('global_parts')
            .update({ ai_enrichment_status: 'processing' })
            .eq('id', part.id);

          results.submitted.push({
            id: part.id,
            part_number: part.part_number,
            taskId: taskResult.taskId
          });

          console.log(`[Batch Manus] ✓ Submitted ${part.part_number} (${results.submitted.length}/${partsToProcess.length})`);
        } else {
          results.failed.push({
            id: part.id,
            part_number: part.part_number,
            error: taskResult.error
          });
        }

        // Delay between tasks
        if (i < partsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TASKS_MS));
        }

      } catch (err) {
        console.error(`[Batch Manus] Error processing ${part.part_number}:`, err.message);
        results.failed.push({
          id: part.id,
          part_number: part.part_number,
          error: err.message
        });
      }
    }

    console.log(`[Batch Manus] Complete: ${results.submitted.length} submitted, ${results.failed.length} failed, ${results.skipped.length} skipped`);

    return res.status(200).json({
      success: true,
      message: `Batch research started for ${results.submitted.length} parts`,
      results
    });

  } catch (err) {
    console.error('[Batch Manus] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Create a Manus task for a single part
 */
async function createManusTask(part, webhookUrl) {
  const prompt = buildPrompt(part);

  try {
    const response = await fetch(MANUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API_KEY': MANUS_API_KEY
      },
      body: JSON.stringify({
        prompt,
        agentProfile: 'manus-1.6',
        webhook: {
          url: webhookUrl,
          events: ['task_created', 'task_stopped']
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Batch Manus] API error for ${part.part_number}: ${response.status} - ${errorText}`);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.task_id || data.id || data.taskId;

    if (!taskId) {
      return { success: false, error: 'No task ID in response' };
    }

    return { success: true, taskId, prompt };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Build the research prompt for a part
 */
function buildPrompt(part) {
  const manufacturer = part.manufacturer || 'Unknown';
  const partNumber = part.part_number || 'Unknown';
  const productName = part.name || partNumber;
  const category = part.category || 'AV/IT Equipment';

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
4. Also check FCC ID database if this is an electronic device

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

**OUTPUT FORMAT:**
Return a comprehensive JSON report with all findings, including:
- manufacturer_website: Official website URL
- product_page_url: Direct product page URL
- documents: Array of found documents with { type, url, found: true/false }
- specifications: Object with width_inches, depth_inches, height_inches, power_watts, is_rack_mountable, u_height
- notes: Summary of findings

Also attach all created markdown files.`;
}
