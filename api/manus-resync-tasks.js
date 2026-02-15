/**
 * Manus Task Resync API
 *
 * Fetches task results directly from Manus API and processes them.
 * Use this to recover results when webhooks didn't fire properly.
 *
 * Endpoint: POST /api/manus-resync-tasks
 * Body: { taskIds?: string[], status?: 'pending' | 'running' | 'processing' }
 */

const { requireAuth } = require('./_authMiddleware');
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

  // Auth required for parts enrichment
  const user = await requireAuth(req, res);
  if (!user) return;

  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return res.status(500).json({ error: 'Manus API key not configured' });
  }

  const { taskIds, status, limit = 20 } = req.body;

  console.log('[Manus Resync] Starting resync...');
  console.log('[Manus Resync] taskIds:', taskIds);
  console.log('[Manus Resync] status filter:', status);

  try {
    // Find tasks to resync
    let query = getSupabase()
      .from('manus_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (taskIds && taskIds.length > 0) {
      query = query.in('manus_task_id', taskIds);
    } else if (status) {
      query = query.eq('status', status);
    } else {
      // Default: get tasks that might need resync (not completed or failed)
      query = query.in('status', ['pending', 'running', 'processing']);
    }

    const { data: tasks, error: queryError } = await query;

    if (queryError) {
      console.error('[Manus Resync] Query error:', queryError);
      return res.status(500).json({ error: 'Failed to query tasks', details: queryError.message });
    }

    if (!tasks || tasks.length === 0) {
      return res.status(200).json({
        message: 'No tasks to resync',
        tasks_checked: 0,
        tasks_updated: 0
      });
    }

    console.log(`[Manus Resync] Found ${tasks.length} tasks to check`);

    const results = {
      tasks_checked: tasks.length,
      tasks_updated: 0,
      tasks_completed: 0,
      tasks_still_running: 0,
      tasks_failed: 0,
      details: []
    };

    // Check each task with Manus API
    for (const task of tasks) {
      const taskId = task.manus_task_id;
      console.log(`[Manus Resync] Checking task: ${taskId}`);

      try {
        // Fetch task status from Manus API
        const taskResponse = await fetch(`${MANUS_API_URL}/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'API_KEY': manusApiKey
          }
        });

        if (!taskResponse.ok) {
          const errorText = await taskResponse.text();
          console.error(`[Manus Resync] Failed to fetch task ${taskId}: ${taskResponse.status} - ${errorText}`);
          results.details.push({ taskId, error: `API error: ${taskResponse.status}` });
          results.tasks_failed++;
          continue;
        }

        const taskData = await taskResponse.json();
        console.log(`[Manus Resync] Task ${taskId} status: ${taskData.status}`);

        // Check if task is completed
        if (taskData.status === 'stopped' || taskData.status === 'finished' || taskData.status === 'completed') {
          console.log(`[Manus Resync] Task ${taskId} is completed, processing results...`);

          // Process the results similar to webhook handler
          const enrichmentData = parseManusResponse(taskData);

          // Get the part details
          const { data: part } = await getSupabase()
            .from('global_parts')
            .select('*')
            .eq('id', task.part_id)
            .single();

          if (part) {
            // Process documents
            const documentResults = await processDocumentsTwoStage(part, enrichmentData);
            if (documentResults) {
              Object.assign(enrichmentData, documentResults);
            }
          }

          // Save results via RPC
          const attachmentCount = (taskData.attachments || []).length;
          const { error: saveError } = await getSupabase()
            .rpc('save_parts_enrichment', {
              p_part_id: task.part_id,
              p_enrichment_data: enrichmentData,
              p_confidence: enrichmentData.confidence || 0.95,
              p_notes: `Researched via Manus AI (resync) - ${attachmentCount} files attached`
            });

          if (saveError) {
            console.error(`[Manus Resync] Failed to save enrichment for ${taskId}:`, saveError);
            results.details.push({ taskId, partId: task.part_id, error: saveError.message });
            results.tasks_failed++;
            continue;
          }

          // Update task status
          await getSupabase()
            .from('manus_tasks')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              result: enrichmentData
            })
            .eq('manus_task_id', taskId);

          // Update part status
          await getSupabase()
            .from('global_parts')
            .update({
              ai_enrichment_status: 'completed',
              ai_last_enriched_at: new Date().toISOString()
            })
            .eq('id', task.part_id);

          results.tasks_completed++;
          results.tasks_updated++;
          results.details.push({
            taskId,
            partId: task.part_id,
            status: 'completed',
            attachments: attachmentCount
          });

          console.log(`[Manus Resync] ✓ Task ${taskId} processed successfully`);

        } else if (taskData.status === 'running' || taskData.status === 'pending') {
          results.tasks_still_running++;
          results.details.push({ taskId, partId: task.part_id, status: taskData.status });
          console.log(`[Manus Resync] Task ${taskId} still running`);
        } else {
          // Unknown status - mark as failed
          await getSupabase()
            .from('manus_tasks')
            .update({ status: 'failed', error: `Unknown status: ${taskData.status}` })
            .eq('manus_task_id', taskId);

          await getSupabase()
            .from('global_parts')
            .update({ ai_enrichment_status: 'error', ai_enrichment_notes: `Unknown task status: ${taskData.status}` })
            .eq('id', task.part_id);

          results.tasks_failed++;
          results.details.push({ taskId, partId: task.part_id, status: 'failed', reason: taskData.status });
        }

      } catch (taskError) {
        console.error(`[Manus Resync] Error processing task ${taskId}:`, taskError);
        results.details.push({ taskId, error: taskError.message });
        results.tasks_failed++;
      }
    }

    console.log(`[Manus Resync] Complete: ${results.tasks_completed} completed, ${results.tasks_still_running} still running, ${results.tasks_failed} failed`);

    return res.status(200).json(results);

  } catch (error) {
    console.error('[Manus Resync] Error:', error);
    return res.status(500).json({ error: 'Resync failed', details: error.message });
  }
};

/**
 * Parse Manus response into our standard format (same as webhook handler)
 */
function parseManusResponse(manusResult) {
  let data = {};
  let rawText = manusResult.message || manusResult.result?.message || '';
  let createdFiles = [];

  console.log('[Manus Resync] Parsing response, keys:', Object.keys(manusResult || {}));

  try {
    // Extract files from attachments array
    const attachments = manusResult.attachments || manusResult.result?.attachments || [];
    for (const attachment of attachments) {
      console.log('[Manus Resync] Found attachment:', attachment.file_name);
      createdFiles.push({
        url: attachment.url,
        name: attachment.file_name,
        size: attachment.size_bytes,
        type: guessFileType(attachment.file_name)
      });
    }

    // Try to parse JSON from message text
    if (rawText && Object.keys(data).length === 0) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          data = JSON.parse(jsonMatch[0]);
          console.log('[Manus Resync] Parsed JSON data from message');
        } catch (e) {
          console.log('[Manus Resync] Could not parse JSON from message');
        }
      }
    }
  } catch (parseError) {
    console.error('[Manus Resync] Error parsing response:', parseError);
  }

  // Convert to enrichment format
  const documents = data.documents || [];
  const specifications = data.specifications || {};

  const enrichmentData = {
    manufacturer_website: data.manufacturer_website || null,
    product_page_url: data.product_page_url || null,
    documents: documents,
    created_files: createdFiles,
    install_manual_urls: [],
    technical_manual_urls: [],
    width_inches: specifications.width_inches || null,
    depth_inches: specifications.depth_inches || null,
    height_inches: specifications.height_inches || null,
    power_watts: specifications.power_watts || null,
    is_rack_mountable: specifications.is_rack_mountable || null,
    u_height: specifications.u_height || null,
    notes: rawText || data.notes || 'Researched via Manus AI',
    manus_message: rawText,
    confidence: 0.95
  };

  // Extract URLs by type
  for (const doc of documents) {
    if (!doc.url || doc.found === false) continue;
    const type = (doc.type || '').toLowerCase();
    if (type.includes('manual') || type.includes('guide')) {
      enrichmentData.install_manual_urls.push(doc.url);
    }
    if (type.includes('datasheet') || type.includes('spec')) {
      enrichmentData.technical_manual_urls.push(doc.url);
    }
  }

  for (const file of createdFiles) {
    if (!file.url) continue;
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) {
      if (name.includes('manual') || name.includes('guide') || name.includes('install')) {
        enrichmentData.install_manual_urls.push(file.url);
      } else {
        enrichmentData.technical_manual_urls.push(file.url);
      }
    }
  }

  return enrichmentData;
}

function guessFileType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = filename.toLowerCase().split('.').pop();
  const types = {
    'pdf': 'application/pdf',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'json': 'application/json'
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Placeholder for document processing - simplified version
 * Full version is in manus-webhook.js
 */
async function processDocumentsTwoStage(part, enrichmentData) {
  // For resync, we'll skip the full SharePoint upload and just return the URLs from Manus
  // The webhook handler has the full implementation
  console.log('[Manus Resync] Skipping full document processing, using Manus URLs directly');

  return {
    install_manual_urls: enrichmentData.install_manual_urls || [],
    technical_manual_urls: enrichmentData.technical_manual_urls || []
  };
}
