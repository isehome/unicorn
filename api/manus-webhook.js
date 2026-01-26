/**
 * Manus Webhook Handler
 *
 * Receives task completion notifications from Manus API.
 * When a task completes, this endpoint processes the results and updates the part.
 *
 * Endpoint: POST /api/manus-webhook
 */

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

  console.log('[Manus Webhook] Received webhook');
  console.log('[Manus Webhook] Body:', JSON.stringify(req.body, null, 2));

  try {
    const { task_id, status, output, error } = req.body;

    if (!task_id) {
      console.error('[Manus Webhook] No task_id in webhook');
      return res.status(400).json({ error: 'Missing task_id' });
    }

    console.log(`[Manus Webhook] Task ${task_id} status: ${status}`);

    // Find the pending task in our database
    const { data: pendingTask, error: findError } = await getSupabase()
      .from('manus_tasks')
      .select('*')
      .eq('manus_task_id', task_id)
      .single();

    if (findError || !pendingTask) {
      console.error('[Manus Webhook] Task not found in database:', task_id);
      // Still return 200 to acknowledge the webhook
      return res.status(200).json({ received: true, note: 'Task not found in database' });
    }

    const partId = pendingTask.part_id;
    console.log(`[Manus Webhook] Found part: ${partId}`);

    if (status === 'completed') {
      // Parse and process the results
      const enrichmentData = parseManusResponse({ output, ...req.body });

      // Download PDFs and upload to SharePoint
      const { data: part } = await getSupabase()
        .from('global_parts')
        .select('*')
        .eq('id', partId)
        .single();

      if (part) {
        const uploadedDocs = await downloadAndUploadDocuments(part, enrichmentData);
        if (uploadedDocs) {
          Object.assign(enrichmentData, uploadedDocs);
        }
      }

      // Save results
      const { error: saveError } = await getSupabase()
        .rpc('save_parts_enrichment', {
          p_part_id: partId,
          p_enrichment_data: enrichmentData,
          p_confidence: enrichmentData.confidence || 0.95,
          p_notes: `Researched via Manus AI (webhook) - ${enrichmentData.documents?.length || 0} documents found`
        });

      if (saveError) {
        console.error('[Manus Webhook] Failed to save enrichment:', saveError);
      }

      // Update task status
      await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: enrichmentData
        })
        .eq('manus_task_id', task_id);

      // Update part status
      await getSupabase()
        .from('global_parts')
        .update({ ai_enrichment_status: 'completed' })
        .eq('id', partId);

      console.log(`[Manus Webhook] ✓ Task ${task_id} processed successfully`);

    } else if (status === 'failed') {
      // Update task and part status to failed
      await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: error || 'Unknown error'
        })
        .eq('manus_task_id', task_id);

      await getSupabase()
        .from('global_parts')
        .update({
          ai_enrichment_status: 'error',
          ai_enrichment_notes: error || 'Manus task failed'
        })
        .eq('id', partId);

      console.log(`[Manus Webhook] Task ${task_id} failed: ${error}`);
    }

    return res.status(200).json({ received: true, task_id, status });

  } catch (err) {
    console.error('[Manus Webhook] Error:', err);
    // Return 200 anyway to acknowledge receipt
    return res.status(200).json({ received: true, error: err.message });
  }
};

/**
 * Parse Manus response into our standard format
 */
function parseManusResponse(manusResult) {
  let data = {};
  let rawText = '';

  try {
    if (Array.isArray(manusResult.output)) {
      for (const outputItem of manusResult.output) {
        if (outputItem.text) {
          rawText += outputItem.text + '\n';
        }
        if (Array.isArray(outputItem.content)) {
          for (const contentItem of outputItem.content) {
            if (contentItem.text) {
              rawText += contentItem.text + '\n';
            }
          }
        }
      }
    } else if (typeof manusResult.output === 'string') {
      rawText = manusResult.output;
    } else if (typeof manusResult.output === 'object' && manusResult.output !== null) {
      data = manusResult.output;
    }

    if (rawText && Object.keys(data).length === 0) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          data = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.log('[Manus Webhook] Could not parse JSON from text');
        }
      }
    }
  } catch (parseError) {
    console.error('[Manus Webhook] Error parsing response:', parseError);
  }

  // Convert to enrichment format
  const documents = data.documents || [];
  const enrichmentData = {
    manufacturer_website: data.manufacturer_website || null,
    product_page_url: data.product_page_url || null,
    documents: documents,
    install_manual_urls: [],
    technical_manual_urls: [],
    notes: data.notes || 'Researched via Manus AI',
    confidence: 0.95
  };

  // Extract URLs by type
  for (const doc of documents) {
    if (!doc.url) continue;
    const type = (doc.type || '').toLowerCase();
    if (type.includes('manual') || type.includes('guide')) {
      enrichmentData.install_manual_urls.push(doc.url);
    }
    if (type.includes('datasheet') || type.includes('spec')) {
      enrichmentData.technical_manual_urls.push(doc.url);
    }
  }

  return enrichmentData;
}

/**
 * Download documents and upload to SharePoint
 */
async function downloadAndUploadDocuments(part, enrichmentData) {
  try {
    const { data: settings } = await getSupabase()
      .from('company_settings')
      .select('company_sharepoint_root_url')
      .limit(1)
      .single();

    if (!settings?.company_sharepoint_root_url) {
      console.log('[Manus Webhook] No SharePoint URL configured');
      return null;
    }

    const rootUrl = settings.company_sharepoint_root_url;
    const manufacturer = sanitizePathSegment(part.manufacturer || 'Unknown');
    const partNumber = sanitizePathSegment(part.part_number || part.id);
    const docsPath = `Parts/${manufacturer}/${partNumber}/manuals`;

    const uploadedUrls = [];

    // Download and upload documents
    const allUrls = [
      ...(enrichmentData.install_manual_urls || []),
      ...(enrichmentData.technical_manual_urls || [])
    ];

    for (let i = 0; i < Math.min(allUrls.length, 5); i++) {
      const url = allUrls[i];
      const result = await downloadAndUploadSingleDocument(rootUrl, docsPath, url, `doc-${i + 1}`, part);
      if (result) uploadedUrls.push(result);
    }

    return uploadedUrls.length > 0 ? {
      sharepoint_urls: uploadedUrls,
      install_manual_sharepoint_url: uploadedUrls[0]
    } : null;

  } catch (error) {
    console.error('[Manus Webhook] Document download error:', error);
    return null;
  }
}

async function downloadAndUploadSingleDocument(rootUrl, subPath, sourceUrl, prefix, part) {
  try {
    console.log(`[Manus Webhook] Downloading: ${sourceUrl}`);

    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow'
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 50 * 1024 * 1024) return null;

    const base64 = Buffer.from(buffer).toString('base64');

    const urlPath = new URL(sourceUrl).pathname;
    let filename = decodeURIComponent(urlPath.split('/').pop() || `${prefix}.pdf`);
    filename = filename.replace(/[<>:"/\\|?*]/g, '-');
    if (!filename.toLowerCase().endsWith('.pdf')) filename = `${filename}.pdf`;

    const partNum = sanitizePathSegment(part.part_number || 'unknown');
    if (!filename.toLowerCase().includes(partNum.toLowerCase())) {
      filename = `${partNum}-${filename}`;
    }

    const uploadUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/graph-upload`
      : 'https://unicorn-one.vercel.app/api/graph-upload';

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootUrl, subPath, filename, fileBase64: base64, contentType: 'application/pdf' })
    });

    if (!uploadResponse.ok) return null;

    const uploadResult = await uploadResponse.json();
    console.log(`[Manus Webhook] ✓ Uploaded: ${filename}`);
    return uploadResult.url || uploadResult.webUrl;

  } catch (error) {
    console.error(`[Manus Webhook] Error with ${sourceUrl}:`, error.message);
    return null;
  }
}

function sanitizePathSegment(str) {
  if (!str) return 'unknown';
  return str.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 100);
}
