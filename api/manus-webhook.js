/**
 * Manus Webhook Handler
 *
 * Receives task lifecycle notifications from Manus API.
 * Events: task_created, task_progress, task_stopped
 *
 * When a task_stopped event is received with stop_reason: "finish",
 * this endpoint processes the results and updates the part.
 *
 * Document Flow (two-stage):
 * 1. Download documents from Manus/external URLs into Supabase storage
 * 2. Upload from Supabase storage to SharePoint
 * 3. Store references to both original source and SharePoint URLs
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
    const { event_type, event_id, task_detail, progress_detail } = req.body;

    // Handle different event types
    if (event_type === 'task_created') {
      console.log(`[Manus Webhook] Task created: ${task_detail?.task_id}`);
      // Update task status to running
      if (task_detail?.task_id) {
        await getSupabase()
          .from('manus_tasks')
          .update({ status: 'running' })
          .eq('manus_task_id', task_detail.task_id);
      }
      return res.status(200).json({ received: true, event_type });
    }

    if (event_type === 'task_progress') {
      console.log(`[Manus Webhook] Task progress: ${progress_detail?.task_id} - ${progress_detail?.message}`);
      return res.status(200).json({ received: true, event_type });
    }

    if (event_type !== 'task_stopped') {
      console.log(`[Manus Webhook] Unknown event type: ${event_type}`);
      return res.status(200).json({ received: true, event_type, note: 'Unknown event type' });
    }

    // Handle task_stopped event
    const task_id = task_detail?.task_id;
    const stop_reason = task_detail?.stop_reason;
    const message = task_detail?.message;
    const attachments = task_detail?.attachments || [];

    if (!task_id) {
      console.error('[Manus Webhook] No task_id in task_detail');
      return res.status(400).json({ error: 'Missing task_id in task_detail' });
    }

    console.log(`[Manus Webhook] Task ${task_id} stopped, reason: ${stop_reason}`);

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

    if (stop_reason === 'finish') {
      // Task completed successfully - process the results
      console.log(`[Manus Webhook] Processing completed task with ${attachments.length} attachments`);

      // Parse and process the results from task_detail
      const enrichmentData = parseManusResponse({
        message,
        attachments,
        task_detail,
        ...req.body
      });

      // Get the part details
      const { data: part } = await getSupabase()
        .from('global_parts')
        .select('*')
        .eq('id', partId)
        .single();

      if (part) {
        // Two-stage document processing:
        // 1. Download all documents into Unicorn (Supabase storage)
        // 2. Upload from Unicorn to SharePoint
        const documentResults = await processDocumentsTwoStage(part, enrichmentData);
        if (documentResults) {
          Object.assign(enrichmentData, documentResults);
        }
      }

      // Save results
      const { error: saveError } = await getSupabase()
        .rpc('save_parts_enrichment', {
          p_part_id: partId,
          p_enrichment_data: enrichmentData,
          p_confidence: enrichmentData.confidence || 0.95,
          p_notes: `Researched via Manus AI (webhook) - ${attachments.length} files attached`
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

    } else if (stop_reason === 'ask') {
      // Task needs user input - update status to waiting
      console.log(`[Manus Webhook] Task ${task_id} needs user input: ${message}`);

      await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'waiting_input',
          result: { message, task_url: task_detail?.task_url }
        })
        .eq('manus_task_id', task_id);

      await getSupabase()
        .from('global_parts')
        .update({
          ai_enrichment_status: 'waiting',
          ai_enrichment_notes: message || 'Manus task needs user input'
        })
        .eq('id', partId);
    } else {
      // Unknown stop reason - treat as error
      console.log(`[Manus Webhook] Unknown stop_reason: ${stop_reason}`);

      await getSupabase()
        .from('manus_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: `Unknown stop_reason: ${stop_reason}`
        })
        .eq('manus_task_id', task_id);
    }

    return res.status(200).json({ received: true, task_id, stop_reason });

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
  let rawText = manusResult.message || '';
  let createdFiles = [];

  console.log('[Manus Webhook] Parsing response, keys:', Object.keys(manusResult || {}));

  try {
    // Extract files from attachments array (Manus standard format)
    const attachments = manusResult.attachments || [];
    for (const attachment of attachments) {
      console.log('[Manus Webhook] Found attachment:', attachment.file_name);
      createdFiles.push({
        url: attachment.url,
        name: attachment.file_name,
        size: attachment.size_bytes,
        type: guessFileType(attachment.file_name)
      });
    }

    // Also check for legacy files array format
    if (Array.isArray(manusResult.files)) {
      for (const file of manusResult.files) {
        console.log('[Manus Webhook] Found file:', file.name || file.fileName);
        createdFiles.push({
          url: file.url || file.fileUrl,
          name: file.name || file.fileName,
          type: file.mimeType || file.type || guessFileType(file.name || file.fileName),
          content: file.content
        });
      }
    }

    // Try to parse JSON from message text
    if (rawText && Object.keys(data).length === 0) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          data = JSON.parse(jsonMatch[0]);
          console.log('[Manus Webhook] Parsed JSON data from message');
        } catch (e) {
          console.log('[Manus Webhook] Could not parse JSON from message');
        }
      }
    }
  } catch (parseError) {
    console.error('[Manus Webhook] Error parsing response:', parseError);
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
    // Specifications
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

  // Extract URLs by type from found documents in JSON
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

  // Also extract URLs from attachments by file type
  for (const file of createdFiles) {
    if (!file.url) continue;
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) {
      if (name.includes('manual') || name.includes('guide') || name.includes('install')) {
        enrichmentData.install_manual_urls.push(file.url);
      } else if (name.includes('spec') || name.includes('datasheet')) {
        enrichmentData.technical_manual_urls.push(file.url);
      } else {
        // Default PDFs to technical manuals
        enrichmentData.technical_manual_urls.push(file.url);
      }
    }
  }

  console.log('[Manus Webhook] Found', documents.length, 'documents,', createdFiles.length, 'attachments');

  return enrichmentData;
}

/**
 * Guess file MIME type from filename
 */
function guessFileType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = filename.toLowerCase().split('.').pop();
  const types = {
    'pdf': 'application/pdf',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'json': 'application/json',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'html': 'text/html',
    'ts': 'text/typescript',
    'js': 'text/javascript'
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Two-stage document processing:
 * 1. Download all documents from Manus/external sources into Supabase storage
 * 2. Upload from Supabase storage to SharePoint
 *
 * This ensures we have a local copy before attempting SharePoint upload,
 * and provides better reliability and audit trail.
 */
async function processDocumentsTwoStage(part, enrichmentData) {
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
    const storagePath = `parts/${part.id}/documents`;
    // Path structure: {manufacturer}/{partNumber}/manuals (no "Parts/" prefix)
    const sharePointPath = `${manufacturer}/${partNumber}/manuals`;

    // Track all downloaded and uploaded files
    const downloadedFiles = [];
    const uploadedToSharePoint = [];
    const originalSourceUrls = [];

    // ============================================
    // STAGE 1: Download all documents into Unicorn (Supabase storage)
    // ============================================
    console.log('[Manus Webhook] === STAGE 1: Downloading documents to Unicorn ===');

    // 1a. Download PDFs from external URLs (manufacturer sites, etc.)
    const allUrls = [
      ...(enrichmentData.install_manual_urls || []),
      ...(enrichmentData.technical_manual_urls || [])
    ];

    for (let i = 0; i < Math.min(allUrls.length, 5); i++) {
      const sourceUrl = allUrls[i];
      console.log(`[Manus Webhook] Downloading external PDF ${i + 1}/${allUrls.length}: ${sourceUrl}`);

      const downloaded = await downloadToSupabaseStorage(sourceUrl, storagePath, part, `doc-${i + 1}`);
      if (downloaded) {
        downloadedFiles.push(downloaded);
        originalSourceUrls.push({ source: sourceUrl, local: downloaded.storagePath, filename: downloaded.filename });
        console.log(`[Manus Webhook] ✓ Downloaded to Unicorn: ${downloaded.filename}`);
      }
    }

    // 1b. Download/store Manus-created files (markdown, etc.)
    const createdFiles = enrichmentData.created_files || [];
    for (const file of createdFiles) {
      if (file.url || file.content) {
        console.log(`[Manus Webhook] Downloading Manus file: ${file.name || 'unknown'}`);

        const downloaded = await downloadManusFileToStorage(file, storagePath, part);
        if (downloaded) {
          downloadedFiles.push(downloaded);
          originalSourceUrls.push({ source: file.url || 'inline-content', local: downloaded.storagePath, filename: downloaded.filename });
          console.log(`[Manus Webhook] ✓ Downloaded to Unicorn: ${downloaded.filename}`);
        }
      }
    }

    console.log(`[Manus Webhook] Stage 1 complete: ${downloadedFiles.length} files downloaded to Unicorn`);

    if (downloadedFiles.length === 0) {
      console.log('[Manus Webhook] No documents to upload to SharePoint');
      return null;
    }

    // ============================================
    // STAGE 2: Upload from Unicorn to SharePoint
    // ============================================
    console.log('[Manus Webhook] === STAGE 2: Uploading from Unicorn to SharePoint ===');

    for (const file of downloadedFiles) {
      console.log(`[Manus Webhook] Uploading to SharePoint: ${file.filename}`);

      const sharePointUrl = await uploadFromStorageToSharePoint(file, rootUrl, sharePointPath);
      if (sharePointUrl) {
        uploadedToSharePoint.push({
          filename: file.filename,
          sharePointUrl: sharePointUrl,
          localStoragePath: file.storagePath,
          contentType: file.contentType,
          size: file.size
        });
        console.log(`[Manus Webhook] ✓ Uploaded to SharePoint: ${file.filename}`);
      }
    }

    console.log(`[Manus Webhook] Stage 2 complete: ${uploadedToSharePoint.length} files uploaded to SharePoint`);

    // Build result with both original and SharePoint URLs
    const partsFolderUrl = `${rootUrl}/${manufacturer}/${partNumber}`;

    // Separate PDFs and markdown files
    const pdfUploads = uploadedToSharePoint.filter(f => f.contentType === 'application/pdf');
    const markdownUploads = uploadedToSharePoint.filter(f => f.contentType === 'text/markdown' || f.filename.endsWith('.md'));

    return {
      // SharePoint folder URL for direct access
      parts_folder_sharepoint_url: partsFolderUrl,
      // First PDF becomes install manual
      install_manual_sharepoint_url: pdfUploads[0]?.sharePointUrl || markdownUploads[0]?.sharePointUrl || null,
      // All markdown files as technical manuals
      technical_manual_sharepoint_urls: markdownUploads.map(f => f.sharePointUrl),
      // All SharePoint URLs
      sharepoint_urls: uploadedToSharePoint.map(f => f.sharePointUrl),
      // Original source URLs (for reference/audit)
      original_source_urls: originalSourceUrls,
      // Local storage paths (for debugging)
      local_storage_paths: downloadedFiles.map(f => f.storagePath),
      // Summary
      documents_downloaded: downloadedFiles.length,
      documents_uploaded_to_sharepoint: uploadedToSharePoint.length
    };

  } catch (error) {
    console.error('[Manus Webhook] Document processing error:', error);
    return null;
  }
}

/**
 * Download a file from external URL and store in Supabase storage
 */
async function downloadToSupabaseStorage(sourceUrl, storagePath, part, prefix) {
  try {
    console.log(`[Manus Webhook] Fetching: ${sourceUrl}`);

    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error(`[Manus Webhook] Failed to fetch: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';

    // Accept PDFs and common document types
    const isPdf = contentType.includes('pdf') || contentType.includes('octet-stream');
    if (!isPdf) {
      console.log(`[Manus Webhook] Skipping non-PDF content type: ${contentType}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const fileSize = buffer.byteLength;

    // Skip files larger than 50MB
    if (fileSize > 50 * 1024 * 1024) {
      console.log(`[Manus Webhook] Skipping large file: ${fileSize} bytes`);
      return null;
    }

    // Generate filename
    const urlPath = new URL(sourceUrl).pathname;
    let filename = decodeURIComponent(urlPath.split('/').pop() || `${prefix}.pdf`);
    filename = filename.replace(/[<>:"/\\|?*]/g, '-');
    if (!filename.toLowerCase().endsWith('.pdf')) filename = `${filename}.pdf`;

    const partNum = sanitizePathSegment(part.part_number || 'unknown');
    if (!filename.toLowerCase().includes(partNum.toLowerCase())) {
      filename = `${partNum}-${filename}`;
    }

    // Upload to Supabase storage
    const fullPath = `${storagePath}/${filename}`;
    const { data, error } = await getSupabase()
      .storage
      .from('part-documents')
      .upload(fullPath, buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error(`[Manus Webhook] Storage upload error:`, error.message);
      return null;
    }

    return {
      filename,
      storagePath: fullPath,
      contentType: 'application/pdf',
      size: fileSize,
      buffer: Buffer.from(buffer) // Keep buffer for SharePoint upload
    };

  } catch (error) {
    console.error(`[Manus Webhook] Error downloading ${sourceUrl}:`, error.message);
    return null;
  }
}

/**
 * Download a Manus-created file and store in Supabase storage
 */
async function downloadManusFileToStorage(file, storagePath, part) {
  try {
    let content;
    let filename = file.name || 'document.md';

    // If file has inline content, use that
    if (file.content) {
      content = file.content;
    } else if (file.url) {
      // Download from Manus file URL
      console.log(`[Manus Webhook] Fetching Manus file: ${file.url}`);
      const response = await fetch(file.url);
      if (!response.ok) {
        console.error(`[Manus Webhook] Failed to fetch Manus file: ${response.status}`);
        return null;
      }
      content = await response.text();
    } else {
      return null;
    }

    // Ensure filename is valid
    filename = filename.replace(/[<>:"/\\|?*]/g, '-');
    const partNum = sanitizePathSegment(part.part_number || 'unknown');
    if (!filename.toLowerCase().includes(partNum.toLowerCase())) {
      filename = `${partNum}-${filename}`;
    }

    // Determine content type
    const contentType = file.type || guessFileType(filename);

    // Convert to buffer
    const buffer = Buffer.from(content, 'utf-8');
    const fileSize = buffer.byteLength;

    // Upload to Supabase storage
    const fullPath = `${storagePath}/${filename}`;
    const { data, error } = await getSupabase()
      .storage
      .from('part-documents')
      .upload(fullPath, buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error(`[Manus Webhook] Storage upload error:`, error.message);
      return null;
    }

    return {
      filename,
      storagePath: fullPath,
      contentType,
      size: fileSize,
      buffer // Keep buffer for SharePoint upload
    };

  } catch (error) {
    console.error(`[Manus Webhook] Error processing Manus file:`, error.message);
    return null;
  }
}

/**
 * Upload a file from Supabase storage to SharePoint
 */
async function uploadFromStorageToSharePoint(file, rootUrl, subPath) {
  try {
    // Get file from Supabase storage (or use cached buffer)
    let fileBuffer = file.buffer;

    if (!fileBuffer) {
      // Download from Supabase storage if buffer not cached
      const { data, error } = await getSupabase()
        .storage
        .from('part-documents')
        .download(file.storagePath);

      if (error) {
        console.error(`[Manus Webhook] Failed to read from storage:`, error.message);
        return null;
      }

      fileBuffer = Buffer.from(await data.arrayBuffer());
    }

    // Convert to base64 for SharePoint API
    const base64 = fileBuffer.toString('base64');

    // Upload to SharePoint via our graph-upload API
    const uploadUrl = 'https://unicorn-one.vercel.app/api/graph-upload';

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootUrl,
        subPath,
        filename: file.filename,
        fileBase64: base64,
        contentType: file.contentType
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`[Manus Webhook] SharePoint upload failed: ${errorText}`);
      return null;
    }

    const uploadResult = await uploadResponse.json();
    return uploadResult.url || uploadResult.webUrl;

  } catch (error) {
    console.error(`[Manus Webhook] Error uploading to SharePoint:`, error.message);
    return null;
  }
}

function sanitizePathSegment(str) {
  if (!str) return 'unknown';
  return str.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 100);
}
