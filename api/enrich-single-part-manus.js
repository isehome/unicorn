/**
 * Single Part Enrichment API - Manus AI Version
 *
 * Uses Manus AI (real browser-based research agent) to find verified documentation
 * URLs for AV/IT equipment. Unlike LLM-based approaches (Gemini, Perplexity),
 * Manus actually browses manufacturer websites and returns real, verified URLs.
 *
 * ARCHITECTURE: Two-phase async approach due to Vercel 10s timeout
 *
 * Phase 1: POST /api/enrich-single-part-manus { partId }
 *   - Creates Manus task
 *   - Stores taskId in database
 *   - Returns immediately with { status: 'processing', taskId }
 *
 * Phase 2: POST /api/enrich-single-part-manus { partId, checkStatus: true }
 *   - Checks Manus task status
 *   - If complete, parses results and saves to database
 *   - Returns { status: 'completed', data } or { status: 'processing' }
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

  const { partId, checkStatus } = req.body;

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

    // PHASE 2: Check status of existing task
    if (checkStatus) {
      return await checkManusTaskStatus(req, res, part, manusApiKey);
    }

    // PHASE 1: Start new research task
    return await startManusResearch(req, res, part, manusApiKey);

  } catch (error) {
    console.error('[Manus] Error:', error);
    return res.status(500).json({
      error: 'Document research failed',
      details: error.message
    });
  }
};

/**
 * PHASE 1: Start a new Manus research task
 */
async function startManusResearch(req, res, part, manusApiKey) {
  console.log(`[Manus] Starting document research for: ${part.manufacturer} ${part.part_number}`);

  // Check if there's already a pending task
  if (part.ai_enrichment_status === 'processing' && part.ai_enrichment_notes?.includes('manus_task_id:')) {
    const existingTaskId = part.ai_enrichment_notes.match(/manus_task_id:([^\s]+)/)?.[1];
    if (existingTaskId) {
      console.log(`[Manus] Task already in progress: ${existingTaskId}`);
      return res.status(200).json({
        status: 'processing',
        taskId: existingTaskId,
        message: 'Research already in progress. Poll with checkStatus: true'
      });
    }
  }

  // Build the research prompt
  const prompt = buildResearchPrompt(part);

  // Create Manus task
  console.log(`[Manus] Creating research task...`);
  const taskResponse = await fetch(`${MANUS_API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'API_KEY': manusApiKey
    },
    body: JSON.stringify({
      prompt: prompt,
      taskMode: 'agent',
      agentProfile: 'quality'
    })
  });

  if (!taskResponse.ok) {
    const errorText = await taskResponse.text();
    console.error('[Manus] Failed to create task:', errorText);

    // Update status to error
    await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'error',
        ai_enrichment_notes: `Manus API error: ${taskResponse.status} - ${errorText}`
      })
      .eq('id', part.id);

    return res.status(500).json({
      error: 'Failed to create Manus task',
      details: errorText
    });
  }

  const taskData = await taskResponse.json();
  const taskId = taskData.task_id || taskData.id;
  console.log(`[Manus] Task created: ${taskId}`);

  // Store taskId in database for later retrieval
  await getSupabase()
    .from('global_parts')
    .update({
      ai_enrichment_status: 'processing',
      ai_enrichment_notes: `manus_task_id:${taskId} - Started ${new Date().toISOString()}`
    })
    .eq('id', part.id);

  // Return immediately - client will poll for completion
  return res.status(200).json({
    status: 'processing',
    taskId: taskId,
    partNumber: part.part_number,
    message: 'Research started. Poll with checkStatus: true to get results (may take 1-3 minutes).'
  });
}

/**
 * PHASE 2: Check status of existing Manus task
 */
async function checkManusTaskStatus(req, res, part, manusApiKey) {
  // Extract task ID from stored notes
  const taskIdMatch = part.ai_enrichment_notes?.match(/manus_task_id:([^\s]+)/);
  if (!taskIdMatch) {
    return res.status(400).json({
      error: 'No active Manus task found for this part',
      hint: 'Call without checkStatus to start a new research task'
    });
  }

  const taskId = taskIdMatch[1];
  console.log(`[Manus] Checking status of task: ${taskId}`);

  // Check Manus task status
  const statusResponse = await fetch(`${MANUS_API_URL}/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'API_KEY': manusApiKey
    }
  });

  if (!statusResponse.ok) {
    console.error('[Manus] Status check failed:', statusResponse.status);
    return res.status(500).json({
      error: 'Failed to check Manus task status',
      taskId: taskId
    });
  }

  const statusData = await statusResponse.json();
  console.log(`[Manus] Task ${taskId} status: ${statusData.status}`);

  // Still processing
  if (statusData.status === 'pending' || statusData.status === 'running' || statusData.status === 'queued') {
    return res.status(200).json({
      status: 'processing',
      taskId: taskId,
      manusStatus: statusData.status,
      message: 'Research still in progress...'
    });
  }

  // Failed
  if (statusData.status === 'failed' || statusData.status === 'error') {
    await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'error',
        ai_enrichment_notes: `Manus task failed: ${statusData.error || 'Unknown error'}`
      })
      .eq('id', part.id);

    return res.status(500).json({
      status: 'failed',
      taskId: taskId,
      error: statusData.error || 'Manus task failed'
    });
  }

  // Completed - process results
  if (statusData.status === 'completed' || statusData.status === 'done') {
    console.log(`[Manus] Task completed, processing results...`);

    try {
      // Parse the Manus response
      const enrichmentData = parseManusResponse(statusData, part);

      // Download PDFs and upload to SharePoint
      console.log(`[Manus] Downloading and uploading documents...`);
      const uploadedDocs = await downloadAndUploadDocuments(part, enrichmentData);
      if (uploadedDocs) {
        Object.assign(enrichmentData, uploadedDocs);
      }

      // Save results using RPC
      const { error: saveError } = await getSupabase()
        .rpc('save_parts_enrichment', {
          p_part_id: part.id,
          p_enrichment_data: enrichmentData,
          p_confidence: enrichmentData.confidence || 0.95,
          p_notes: `Researched via Manus AI - ${enrichmentData.search_summary?.total_documents_found || 0} documents found`
        });

      if (saveError) {
        console.error('[Manus] Failed to save:', saveError);
        throw saveError;
      }

      console.log(`[Manus] ✓ Research complete for ${part.part_number}`);

      return res.status(200).json({
        status: 'completed',
        success: true,
        partId: part.id,
        partNumber: part.part_number,
        name: part.name,
        taskId: taskId,
        documentsFound: {
          class3: enrichmentData.class3_documents?.length || 0,
          class2: enrichmentData.class2_documents?.length || 0,
          class1: enrichmentData.class1_documents?.length || 0
        },
        data: enrichmentData
      });

    } catch (processError) {
      console.error('[Manus] Error processing results:', processError);

      await getSupabase()
        .from('global_parts')
        .update({
          ai_enrichment_status: 'error',
          ai_enrichment_notes: `Error processing Manus results: ${processError.message}`
        })
        .eq('id', part.id);

      return res.status(500).json({
        status: 'failed',
        taskId: taskId,
        error: 'Failed to process Manus results',
        details: processError.message
      });
    }
  }

  // Unknown status
  return res.status(200).json({
    status: 'unknown',
    taskId: taskId,
    manusStatus: statusData.status,
    message: `Unknown task status: ${statusData.status}`
  });
}

/**
 * Build the research prompt for Manus
 */
function buildResearchPrompt(part) {
  const manufacturer = part.manufacturer || 'Unknown';
  const partNumber = part.part_number || 'Unknown';
  const productName = part.name || partNumber;
  const model = part.model || partNumber;
  const category = part.category || 'Unknown';

  return `You are a DOCUMENT LIBRARY SPECIALIST responsible for building a comprehensive documentation archive for AV/IT equipment. Your job is to find EVERY piece of documentation available for this product.

**YOUR MISSION:**
Build a complete document library for this part. You are responsible for finding ALL available documentation. Take your time. Be thorough. Think carefully about where documentation might be hidden.

**PRODUCT TO RESEARCH:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Manufacturer: ${manufacturer}
Part Number: ${partNumber}
Model: ${model}
Product Name: ${productName}
Category: ${category}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**SEARCH STRATEGY - Execute in this EXACT order:**

## PASS 1: MANUFACTURER'S WEBSITE (Class 3 - Trustworthy)
This is your PRIMARY source. Exhaust this before moving on.

1. First, identify the manufacturer's official website domain
2. Navigate directly to their website and find:
   - Product page for this exact part number
   - Support/Downloads section
   - Documentation/Resources section
   - Technical Library
   - Product Registration pages (often have manuals)

3. Search patterns to try on manufacturer site:
   - "${partNumber}" in their search
   - "${model}" in their search
   - "${productName}" in their search
   - Browse to product category and find the product

4. For each product page found, look for:
   - Downloads tab/section
   - Resources tab/section
   - Support tab/section
   - Related documents section
   - "View PDF" or document icons

5. Document types to find (ALL OF THEM):
   □ Installation Manual / Install Guide
   □ User Manual / User Guide
   □ Quick Start Guide
   □ Datasheet / Spec Sheet
   □ Technical Specifications PDF
   □ Submittal Sheet / Cut Sheet
   □ Product Brochure / Sales Sheet
   □ CAD Drawings / Dimensions
   □ Firmware/Software downloads page
   □ FAQ / Troubleshooting guides
   □ Warranty information
   □ Compliance/Certification documents

## PASS 2: GENERAL WEB SEARCH (Class 2 - Reliable)
After exhausting manufacturer site, search the broader web:

1. Search: "${manufacturer} ${partNumber} PDF"
2. Search: "${manufacturer} ${partNumber} manual"
3. Search: "${manufacturer} ${partNumber} datasheet"
4. Search: "${manufacturer} ${partNumber} installation guide"
5. Search: "${manufacturer} ${partNumber} specifications"

Look at:
- Distributor sites (often have spec sheets)
- Reseller product pages
- Industry databases
- PDF hosting sites with legitimate copies

## PASS 3: COMMUNITY SOURCES (Class 1 - Opinion/Community)
Finally, check community resources:

1. Reddit discussions about this product
2. AVS Forum threads
3. Professional forums
4. YouTube video descriptions (for manual links)

**RESPONSE FORMAT:**
Return a JSON object with verified URLs only.

{
  "manufacturer_website": "<official manufacturer domain>",
  "product_page_url": "<direct link to product page>",
  "support_page_url": "<link to support/downloads for this product>",

  "class3_documents": [
    {
      "type": "<install_manual|user_guide|quick_start|datasheet|submittal|technical_spec|brochure|cad|firmware|faq|warranty|compliance>",
      "title": "<document title>",
      "url": "<direct URL, prefer .pdf>",
      "source": "<where you found it>",
      "notes": "<any relevant notes>"
    }
  ],

  "class2_documents": [...],
  "class1_documents": [...],

  "specifications": {
    "device_type": "<rack_equipment|power_device|network_switch|shelf_device|wireless_device|accessory|other>",
    "rack_info": {
      "is_rack_mountable": <true/false>,
      "u_height": <number or null>,
      "needs_shelf": <true/false>,
      "width_inches": <number or null>,
      "depth_inches": <number or null>,
      "height_inches": <number or null>
    },
    "power_info": {
      "power_watts": <number or null>,
      "is_power_device": <true/false>,
      "outlets_provided": <number or null>
    },
    "network_info": {
      "is_network_switch": <true/false>,
      "total_ports": <number or null>,
      "has_network_port": <true/false>
    }
  },

  "search_summary": {
    "manufacturer_site_searched": <true/false>,
    "support_section_found": <true/false>,
    "total_documents_found": <number>,
    "search_notes": "<what you searched, what you found>"
  },

  "confidence": <0.0 to 1.0>,
  "notes": "<summary of your research>"
}

**IMPORTANT:** Only return URLs you have actually verified exist by visiting them. Do not guess or construct URLs.`;
}

/**
 * Parse Manus response into our standard format
 */
function parseManusResponse(manusResult, part) {
  let data = {};

  try {
    // Check if result has a structured output
    if (manusResult.output) {
      if (typeof manusResult.output === 'string') {
        // Try to parse JSON from the output string
        const jsonMatch = manusResult.output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]);
        }
      } else if (typeof manusResult.output === 'object') {
        data = manusResult.output;
      }
    }

    // Check for files/attachments
    if (manusResult.files && manusResult.files.length > 0) {
      for (const file of manusResult.files) {
        if (file.name && file.name.endsWith('.json')) {
          if (file.content) {
            data = JSON.parse(file.content);
          }
        }
      }
    }

    // Check for result field
    if (manusResult.result && typeof manusResult.result === 'object') {
      data = { ...data, ...manusResult.result };
    }

  } catch (parseError) {
    console.error('[Manus] Error parsing response:', parseError);
  }

  // Extract document URLs into our standard format
  const enrichmentData = {
    manufacturer_website: data.manufacturer_website || null,
    product_page_url: data.product_page_url || null,
    support_page_url: data.support_page_url || null,
    class3_documents: data.class3_documents || [],
    class2_documents: data.class2_documents || [],
    class1_documents: data.class1_documents || [],
    install_manual_urls: [],
    technical_manual_urls: [],
    datasheet_url: null,
    submittal_url: null,
    quick_start_url: null,
    device_type: data.specifications?.device_type || null,
    is_rack_mountable: data.specifications?.rack_info?.is_rack_mountable || null,
    u_height: data.specifications?.rack_info?.u_height || null,
    needs_shelf: data.specifications?.rack_info?.needs_shelf || null,
    width_inches: data.specifications?.rack_info?.width_inches || null,
    depth_inches: data.specifications?.rack_info?.depth_inches || null,
    height_inches: data.specifications?.rack_info?.height_inches || null,
    power_watts: data.specifications?.power_info?.power_watts || null,
    is_power_device: data.specifications?.power_info?.is_power_device || null,
    outlets_provided: data.specifications?.power_info?.outlets_provided || null,
    is_network_switch: data.specifications?.network_info?.is_network_switch || null,
    total_ports: data.specifications?.network_info?.total_ports || null,
    has_network_port: data.specifications?.network_info?.has_network_port || null,
    search_summary: data.search_summary || {},
    confidence: data.confidence || 0.9,
    notes: data.notes || 'Researched via Manus AI'
  };

  // Process Class 3 documents into categorized URLs
  for (const doc of enrichmentData.class3_documents) {
    if (!doc.url) continue;
    const type = (doc.type || '').toLowerCase();

    if (type === 'install_manual' || type === 'user_guide') {
      enrichmentData.install_manual_urls.push(doc.url);
    } else if (type === 'quick_start') {
      enrichmentData.quick_start_url = enrichmentData.quick_start_url || doc.url;
      enrichmentData.technical_manual_urls.push(doc.url);
    } else if (type === 'datasheet' || type === 'technical_spec') {
      enrichmentData.datasheet_url = enrichmentData.datasheet_url || doc.url;
      enrichmentData.technical_manual_urls.push(doc.url);
    } else if (type === 'submittal' || type === 'brochure') {
      enrichmentData.submittal_url = enrichmentData.submittal_url || doc.url;
    } else {
      enrichmentData.technical_manual_urls.push(doc.url);
    }
  }

  // Process Class 2 documents (only if we're missing Class 3)
  if (enrichmentData.install_manual_urls.length === 0) {
    for (const doc of enrichmentData.class2_documents) {
      if (!doc.url) continue;
      const type = (doc.type || '').toLowerCase();
      if (type === 'install_manual' || type === 'user_guide') {
        enrichmentData.install_manual_urls.push(doc.url);
      }
    }
  }

  // Deduplicate arrays
  enrichmentData.install_manual_urls = [...new Set(enrichmentData.install_manual_urls)];
  enrichmentData.technical_manual_urls = [...new Set(enrichmentData.technical_manual_urls)];

  return enrichmentData;
}

/**
 * Download documents and upload to SharePoint
 */
async function downloadAndUploadDocuments(part, enrichmentData) {
  try {
    const { data: settings, error: settingsError } = await getSupabase()
      .from('company_settings')
      .select('company_sharepoint_root_url')
      .limit(1)
      .single();

    if (settingsError || !settings?.company_sharepoint_root_url) {
      console.log('[Manus] No SharePoint URL configured, skipping document download');
      return null;
    }

    const rootUrl = settings.company_sharepoint_root_url;
    const manufacturer = sanitizePathSegment(part.manufacturer || 'Unknown');
    const partNumber = sanitizePathSegment(part.part_number || part.id);
    const manualsPath = `Parts/${manufacturer}/${partNumber}/manuals`;
    const techDocsPath = `Parts/${manufacturer}/${partNumber}/technical`;

    const uploadedUrls = {};

    // Download and upload install manuals
    if (enrichmentData.install_manual_urls?.length > 0) {
      const uploadedManuals = [];
      for (let i = 0; i < Math.min(enrichmentData.install_manual_urls.length, 3); i++) {
        const url = enrichmentData.install_manual_urls[i];
        const result = await downloadAndUploadSingleDocument(rootUrl, manualsPath, url, `install-manual-${i + 1}`, part);
        if (result) uploadedManuals.push(result);
      }
      if (uploadedManuals.length > 0) {
        uploadedUrls.install_manual_sharepoint_urls = uploadedManuals;
        uploadedUrls.install_manual_sharepoint_url = uploadedManuals[0];
      }
    }

    // Download and upload technical documents
    if (enrichmentData.technical_manual_urls?.length > 0) {
      const uploadedTechDocs = [];
      for (let i = 0; i < Math.min(enrichmentData.technical_manual_urls.length, 5); i++) {
        const url = enrichmentData.technical_manual_urls[i];
        const result = await downloadAndUploadSingleDocument(rootUrl, techDocsPath, url, `tech-doc-${i + 1}`, part);
        if (result) uploadedTechDocs.push(result);
      }
      if (uploadedTechDocs.length > 0) {
        uploadedUrls.technical_manual_sharepoint_urls = uploadedTechDocs;
      }
    }

    return Object.keys(uploadedUrls).length > 0 ? uploadedUrls : null;

  } catch (error) {
    console.error('[Manus] Document download error:', error);
    return null;
  }
}

/**
 * Download a single document and upload to SharePoint
 */
async function downloadAndUploadSingleDocument(rootUrl, subPath, sourceUrl, prefix, part) {
  try {
    console.log(`[Manus] Downloading: ${sourceUrl}`);

    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.log(`[Manus] Failed to download ${sourceUrl}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';

    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      console.log(`[Manus] Not a PDF (${contentType}): ${sourceUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > 50 * 1024 * 1024) {
      console.log(`[Manus] File too large: ${sourceUrl}`);
      return null;
    }

    const base64 = Buffer.from(buffer).toString('base64');

    const urlPath = new URL(sourceUrl).pathname;
    let filename = decodeURIComponent(urlPath.split('/').pop() || `${prefix}.pdf`);
    filename = filename.replace(/[<>:"/\\|?*]/g, '-');
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = `${filename}.pdf`;
    }

    const partNum = sanitizePathSegment(part.part_number || 'unknown');
    if (!filename.toLowerCase().includes(partNum.toLowerCase())) {
      filename = `${partNum}-${filename}`;
    }

    console.log(`[Manus] Uploading: ${subPath}/${filename}`);

    const uploadUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/graph-upload`
      : 'https://unicorn-one.vercel.app/api/graph-upload';

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootUrl,
        subPath,
        filename,
        fileBase64: base64,
        contentType: 'application/pdf'
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`[Manus] SharePoint upload failed: ${errorText}`);
      return null;
    }

    const uploadResult = await uploadResponse.json();
    console.log(`[Manus] ✓ Uploaded: ${filename}`);

    return uploadResult.url || uploadResult.webUrl;

  } catch (error) {
    console.error(`[Manus] Error with ${sourceUrl}:`, error.message);
    return null;
  }
}

function sanitizePathSegment(str) {
  if (!str) return 'unknown';
  return str
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
}
