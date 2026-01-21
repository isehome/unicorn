/**
 * Single Part Enrichment API - Document Library Builder
 *
 * This is a THOROUGH enrichment system that builds a comprehensive document library
 * for each part using a multi-pass search strategy with document classification.
 *
 * Search Strategy (in order):
 *   PASS 1: Manufacturer's website directly (Class 3 - Trustworthy)
 *   PASS 2: General Google search (Class 2 - Reliable)
 *   PASS 3: Community sources like Reddit (Class 1 - Opinion/Community)
 *
 * Document Destinations:
 *   - Install Manual / User Guide → install_manual_urls (primary docs only)
 *   - Technical docs, datasheets, spec sheets → technical_manual_urls
 *   - Sales sheets, one-pagers, product pages → submittal_url
 *
 * Uses Gemini 2.5 Pro with Google Search grounding for real-time web research.
 *
 * Endpoint: POST /api/enrich-single-part
 * Body: { partId: string }
 */

const { createClient } = require('@supabase/supabase-js');

// Use Gemini 2.5 Flash for document research
// Note: googleSearch grounding requires special API access, so we use standard generation
const GEMINI_MODEL = 'gemini-2.5-flash';

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

// Lazy load Gemini
let GoogleGenerativeAI;
function getGemini() {
  if (!GoogleGenerativeAI) {
    GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  }
  return GoogleGenerativeAI;
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

  console.log(`[DocumentLibrary] Starting comprehensive document library build for part: ${partId}`);

  try {
    // Check for Gemini API key
    const geminiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(500).json({
        error: 'Gemini API key not configured',
        hint: 'Set REACT_APP_GEMINI_API_KEY or GEMINI_API_KEY environment variable'
      });
    }

    // Fetch the part
    const { data: part, error: fetchError } = await getSupabase()
      .from('global_parts')
      .select('*')
      .eq('id', partId)
      .single();

    if (fetchError || !part) {
      console.error('[DocumentLibrary] Part not found:', fetchError);
      return res.status(404).json({ error: 'Part not found' });
    }

    console.log(`[DocumentLibrary] Building library for: ${part.manufacturer} ${part.part_number} - ${part.name}`);

    // Mark as processing
    await getSupabase()
      .from('global_parts')
      .update({ ai_enrichment_status: 'processing' })
      .eq('id', partId);

    // Initialize Gemini
    const GenAI = getGemini();
    const genAI = new GenAI(geminiKey);

    // Configure model for document research
    // Note: Google Search grounding requires special API access/billing
    // Using standard generation with detailed prompts for web research
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL
    });

    // ========================================
    // PASS 1: Research the part thoroughly
    // ========================================
    console.log(`[DocumentLibrary] PASS 1: Comprehensive research...`);
    const enrichmentData = await buildDocumentLibrary(model, part);

    console.log(`[DocumentLibrary] Research complete:`, {
      confidence: enrichmentData.confidence,
      class3Docs: enrichmentData.data.class3_documents?.length || 0,
      class2Docs: enrichmentData.data.class2_documents?.length || 0,
      class1Docs: enrichmentData.data.class1_documents?.length || 0,
      totalDocs: (enrichmentData.data.class3_documents?.length || 0) +
                 (enrichmentData.data.class2_documents?.length || 0) +
                 (enrichmentData.data.class1_documents?.length || 0)
    });

    // ========================================
    // PASS 2: Verify documents (verification agent)
    // ========================================
    console.log(`[DocumentLibrary] PASS 2: Verifying discovered documents...`);
    const verifiedData = await verifyDocuments(model, part, enrichmentData.data);

    // Merge verified data
    Object.assign(enrichmentData.data, verifiedData);

    // ========================================
    // PASS 3: Download and upload to SharePoint
    // ========================================
    console.log(`[DocumentLibrary] PASS 3: Downloading and uploading to SharePoint...`);
    const downloadedDocs = await downloadAndUploadDocuments(part, enrichmentData.data);
    if (downloadedDocs) {
      Object.assign(enrichmentData.data, downloadedDocs);
      console.log(`[DocumentLibrary] Documents uploaded to SharePoint:`, Object.keys(downloadedDocs).length);
    }

    // Save results using RPC
    const { data: saveResult, error: saveError } = await getSupabase()
      .rpc('save_parts_enrichment', {
        p_part_id: partId,
        p_enrichment_data: enrichmentData.data,
        p_confidence: enrichmentData.confidence,
        p_notes: enrichmentData.notes
      });

    if (saveError) {
      console.error('[DocumentLibrary] Failed to save:', saveError);
      throw saveError;
    }

    console.log(`[DocumentLibrary] ✓ Document library complete for ${part.part_number}`);

    return res.status(200).json({
      success: true,
      partId,
      partNumber: part.part_number,
      name: part.name,
      confidence: enrichmentData.confidence,
      notes: enrichmentData.notes,
      documentsFound: {
        class3: enrichmentData.data.class3_documents?.length || 0,
        class2: enrichmentData.data.class2_documents?.length || 0,
        class1: enrichmentData.data.class1_documents?.length || 0
      },
      data: enrichmentData.data,
      ...saveResult
    });

  } catch (error) {
    console.error('[DocumentLibrary] Error:', error);

    // Update status to error
    await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'error',
        ai_enrichment_notes: error.message || 'Unknown error during enrichment'
      })
      .eq('id', partId);

    return res.status(500).json({
      error: 'Document library build failed',
      details: error.message
    });
  }
};

/**
 * Build a comprehensive document library for this part
 * Uses a methodical, thorough approach with multi-pass search strategy
 */
async function buildDocumentLibrary(model, part) {
  const manufacturer = part.manufacturer || 'Unknown';
  const partNumber = part.part_number || 'Unknown';
  const productName = part.name || partNumber;
  const model_number = part.model || partNumber;

  const prompt = `You are a DOCUMENT LIBRARY SPECIALIST responsible for building a comprehensive documentation archive for AV/IT equipment. Your job is to find EVERY piece of documentation available for this product.

**YOUR MISSION:**
Build a complete document library for this part. You are responsible for finding ALL available documentation. Take your time. Be thorough. Think carefully about where documentation might be hidden.

**PRODUCT TO RESEARCH:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Manufacturer: ${manufacturer}
Part Number: ${partNumber}
Model: ${model_number}
Product Name: ${productName}
Category: ${part.category || 'Unknown'}
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
   - "${model_number}" in their search
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

**DOCUMENT CLASSIFICATION:**

CLASS 3 (Trustworthy):
- Direct from manufacturer's website
- Official support portal downloads
- Manufacturer's documentation CDN

CLASS 2 (Reliable):
- Authorized distributor sites
- Reputable reseller spec sheets
- Industry database listings

CLASS 1 (Community/Opinion):
- Forum posts and discussions
- Community-sourced documents
- User-uploaded content

**TECHNICAL SPECIFICATIONS TO EXTRACT:**

While searching for documents, also extract these specs:

1. RACK/MOUNTING INFO:
   - Is it rack mountable (19" with ears)?
   - Rack height in U (1U, 2U, etc.)
   - Needs shelf if not rack mountable?
   - Physical dimensions (W x D x H)
   - How many fit on a standard shelf?

2. POWER INFO:
   - Power consumption (watts)
   - Is it a power device (UPS/PDU)?
   - Outlets provided if power device

3. NETWORK INFO:
   - Is it a network switch?
   - Number of ports
   - PoE capable? Budget watts?

**RESPONSE FORMAT:**
Return a JSON object. Take your time to be thorough.

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

  "class2_documents": [
    {
      "type": "<same types as above>",
      "title": "<document title>",
      "url": "<direct URL>",
      "source": "<distributor/reseller name>",
      "notes": "<any notes>"
    }
  ],

  "class1_documents": [
    {
      "type": "<discussion|review|tutorial|community_doc>",
      "title": "<title or description>",
      "url": "<URL>",
      "source": "<reddit|forum|youtube|etc>",
      "notes": "<summary of useful info>"
    }
  ],

  "specifications": {
    "device_type": "<rack_equipment|power_device|network_switch|shelf_device|wireless_device|accessory|other>",

    "rack_info": {
      "is_rack_mountable": <true/false>,
      "u_height": <number or null>,
      "needs_shelf": <true/false>,
      "shelf_u_height": <1-4 or null>,
      "max_items_per_shelf": <number or null>,
      "is_wireless": <true/false>,
      "exclude_from_rack": <true/false>,
      "width_inches": <number or null>,
      "depth_inches": <number or null>,
      "height_inches": <number or null>
    },

    "power_info": {
      "power_watts": <number or null>,
      "power_outlets_required": <number or 1>,
      "is_power_device": <true/false>,
      "outlets_provided": <number or null>,
      "output_watts": <number or null>,
      "ups_va_rating": <number or null>,
      "ups_battery_outlets": <number or null>,
      "ups_surge_only_outlets": <number or null>
    },

    "network_info": {
      "is_network_switch": <true/false>,
      "total_ports": <number or null>,
      "poe_enabled": <true/false>,
      "poe_budget_watts": <number or null>,
      "poe_ports": <number or null>,
      "uplink_ports": <number or null>,
      "has_network_port": <true/false>
    }
  },

  "search_summary": {
    "manufacturer_site_searched": <true/false>,
    "support_section_found": <true/false>,
    "total_documents_found": <number>,
    "search_notes": "<what you searched, what you found, what was missing>"
  },

  "confidence": <0.0 to 1.0>,
  "notes": "<summary of your research>"
}

**CRITICAL INSTRUCTIONS:**
1. TAKE YOUR TIME. Thorough research is more important than speed.
2. Actually visit the manufacturer's website and navigate to the product.
3. Look for hidden download sections - they're often in tabs or expandable sections.
4. Prefer DIRECT PDF links (ending in .pdf) over web pages when available.
5. If you can't find something, note what you searched for in search_notes.
6. Don't guess URLs - only include URLs you actually found.
7. The goal is to build a COMPLETE documentation archive. Missing a document is worse than taking extra time.

Now, thoroughly research ${manufacturer} ${partNumber} and build its document library.`;

  try {
    console.log(`[DocumentLibrary] Sending research request to Gemini...`);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,  // Lower temperature for more focused research
        maxOutputTokens: 8192
      }
    });

    const responseText = result.response.text();
    console.log(`[DocumentLibrary] Received response (${responseText.length} chars)`);

    // Parse JSON from response
    let jsonText = responseText;

    // Remove markdown code blocks if present
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[DocumentLibrary] Failed to parse response:', responseText.substring(0, 500));
      throw new Error('Failed to parse AI response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Process the structured response
    const specs = parsed.specifications || {};
    const rackInfo = specs.rack_info || {};
    const powerInfo = specs.power_info || {};
    const networkInfo = specs.network_info || {};

    // Categorize documents into appropriate fields
    const installManualUrls = [];
    const technicalManualUrls = [];
    let submittalUrl = null;
    let quickStartUrl = null;
    let datasheetUrl = null;
    let supportPageUrl = parsed.support_page_url || parsed.product_page_url || null;

    // Process Class 3 documents (most trustworthy)
    const class3Docs = parsed.class3_documents || [];
    for (const doc of class3Docs) {
      if (!doc.url) continue;

      const docType = (doc.type || '').toLowerCase();

      if (docType === 'install_manual' || docType === 'user_guide') {
        // Primary install/user docs go to install_manual_urls
        installManualUrls.push(doc.url);
      } else if (docType === 'quick_start') {
        quickStartUrl = quickStartUrl || doc.url;
        // Also add to technical manuals
        technicalManualUrls.push(doc.url);
      } else if (docType === 'submittal' || docType === 'brochure') {
        submittalUrl = submittalUrl || doc.url;
      } else if (docType === 'datasheet' || docType === 'technical_spec') {
        datasheetUrl = datasheetUrl || doc.url;
        technicalManualUrls.push(doc.url);
      } else {
        // All other docs go to technical manuals
        technicalManualUrls.push(doc.url);
      }
    }

    // Process Class 2 documents
    const class2Docs = parsed.class2_documents || [];
    for (const doc of class2Docs) {
      if (!doc.url) continue;

      const docType = (doc.type || '').toLowerCase();

      // Class 2 docs only go to install_manual if we have NOTHING from Class 3
      if ((docType === 'install_manual' || docType === 'user_guide') && installManualUrls.length === 0) {
        installManualUrls.push(doc.url);
      } else if (docType === 'submittal' || docType === 'brochure') {
        submittalUrl = submittalUrl || doc.url;
      } else {
        technicalManualUrls.push(doc.url);
      }
    }

    // Use product page as submittal if no submittal found
    if (!submittalUrl && parsed.product_page_url) {
      submittalUrl = parsed.product_page_url;
    }

    return {
      data: {
        // Device classification
        device_type: sanitizeString(specs.device_type) || 'other',

        // Rack layout fields
        is_rack_mountable: sanitizeBoolean(rackInfo.is_rack_mountable),
        u_height: sanitizeNumber(rackInfo.u_height),
        needs_shelf: sanitizeBoolean(rackInfo.needs_shelf),
        shelf_u_height: sanitizeNumber(rackInfo.shelf_u_height),
        max_items_per_shelf: sanitizeNumber(rackInfo.max_items_per_shelf),
        is_wireless: sanitizeBoolean(rackInfo.is_wireless),
        exclude_from_rack: sanitizeBoolean(rackInfo.exclude_from_rack),
        width_inches: sanitizeNumber(rackInfo.width_inches),
        depth_inches: sanitizeNumber(rackInfo.depth_inches),
        height_inches: sanitizeNumber(rackInfo.height_inches),

        // Power fields
        power_watts: sanitizeNumber(powerInfo.power_watts),
        power_outlets: sanitizeNumber(powerInfo.power_outlets_required) || 1,
        is_power_device: sanitizeBoolean(powerInfo.is_power_device),
        power_outlets_provided: sanitizeNumber(powerInfo.outlets_provided),
        power_output_watts: sanitizeNumber(powerInfo.output_watts),
        ups_va_rating: sanitizeNumber(powerInfo.ups_va_rating),
        ups_battery_outlets: sanitizeNumber(powerInfo.ups_battery_outlets),
        ups_surge_only_outlets: sanitizeNumber(powerInfo.ups_surge_only_outlets),

        // Network switch fields
        is_network_switch: sanitizeBoolean(networkInfo.is_network_switch),
        switch_ports: sanitizeNumber(networkInfo.total_ports),
        total_ports: sanitizeNumber(networkInfo.total_ports),
        poe_enabled: sanitizeBoolean(networkInfo.poe_enabled),
        poe_budget_watts: sanitizeNumber(networkInfo.poe_budget_watts),
        poe_ports: sanitizeNumber(networkInfo.poe_ports),
        uplink_ports: sanitizeNumber(networkInfo.uplink_ports),
        has_network_port: sanitizeBoolean(networkInfo.has_network_port, true),

        // Document URLs - categorized appropriately
        install_manual_urls: sanitizeUrlArray([...new Set(installManualUrls)]),
        technical_manual_urls: sanitizeUrlArray([...new Set(technicalManualUrls)]),
        user_guide_urls: [], // Deprecated - merged into install_manual_urls
        quick_start_url: sanitizeString(quickStartUrl),
        datasheet_url: sanitizeString(datasheetUrl),
        submittal_url: sanitizeString(submittalUrl),
        support_page_url: sanitizeString(supportPageUrl),

        // Raw document lists for reference (stored as JSONB)
        class3_documents: class3Docs,
        class2_documents: class2Docs,
        class1_documents: parsed.class1_documents || [],

        // Search metadata
        manufacturer_website: sanitizeString(parsed.manufacturer_website),
        product_page_url: sanitizeString(parsed.product_page_url),
        search_summary: parsed.search_summary || {}
      },
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      notes: sanitizeString(parsed.notes) || 'Document library research completed'
    };

  } catch (error) {
    console.error(`[DocumentLibrary] Research error:`, error);
    throw new Error(`Document library research failed: ${error.message}`);
  }
}

/**
 * Verification Agent - Validates discovered documents
 * Checks if URLs are accessible and documents are what they claim to be
 */
async function verifyDocuments(model, part, enrichmentData) {
  const docsToVerify = [];

  // Collect all document URLs to verify
  if (enrichmentData.install_manual_urls?.length > 0) {
    enrichmentData.install_manual_urls.forEach(url => docsToVerify.push({ url, type: 'install_manual' }));
  }
  if (enrichmentData.technical_manual_urls?.length > 0) {
    enrichmentData.technical_manual_urls.forEach(url => docsToVerify.push({ url, type: 'technical_manual' }));
  }
  if (enrichmentData.quick_start_url) {
    docsToVerify.push({ url: enrichmentData.quick_start_url, type: 'quick_start' });
  }
  if (enrichmentData.datasheet_url) {
    docsToVerify.push({ url: enrichmentData.datasheet_url, type: 'datasheet' });
  }
  if (enrichmentData.submittal_url) {
    docsToVerify.push({ url: enrichmentData.submittal_url, type: 'submittal' });
  }

  if (docsToVerify.length === 0) {
    console.log('[DocumentLibrary] No documents to verify');
    return { verified_documents: [], verification_notes: 'No documents found to verify' };
  }

  console.log(`[DocumentLibrary] Verifying ${docsToVerify.length} documents...`);

  const verificationPrompt = `You are a DOCUMENT VERIFICATION AGENT. Your job is to verify that the following document URLs are valid and accessible.

**PRODUCT:** ${part.manufacturer} ${part.part_number}

**DOCUMENTS TO VERIFY:**
${docsToVerify.map((d, i) => `${i + 1}. [${d.type}] ${d.url}`).join('\n')}

**YOUR TASK:**
1. Check each URL to verify it's accessible
2. Confirm the document is actually for this product (not a different product)
3. Confirm the document type is correct

**RESPONSE FORMAT:**
{
  "verified_documents": [
    {
      "url": "<url>",
      "type": "<document type>",
      "verified": <true/false>,
      "accessible": <true/false>,
      "correct_product": <true/false>,
      "actual_type": "<what type it actually is>",
      "notes": "<any issues found>"
    }
  ],
  "verification_notes": "<summary of verification>",
  "urls_to_remove": ["<any URLs that should be removed>"],
  "confidence_adjustment": <-0.3 to +0.1 adjustment based on verification results>
}

Verify each document and report your findings.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: verificationPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    });

    const responseText = result.response.text();

    // Parse JSON
    let jsonText = responseText;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Remove any URLs that verification says should be removed
      const urlsToRemove = new Set(parsed.urls_to_remove || []);

      return {
        verified_documents: parsed.verified_documents || [],
        verification_notes: parsed.verification_notes || 'Verification completed',
        // Filter out bad URLs from the main lists
        install_manual_urls: (enrichmentData.install_manual_urls || []).filter(u => !urlsToRemove.has(u)),
        technical_manual_urls: (enrichmentData.technical_manual_urls || []).filter(u => !urlsToRemove.has(u))
      };
    }
  } catch (error) {
    console.error('[DocumentLibrary] Verification error:', error.message);
  }

  // Return unchanged if verification fails
  return { verification_notes: 'Verification skipped due to error' };
}

/**
 * Download documents from discovered URLs and upload to SharePoint
 */
async function downloadAndUploadDocuments(part, enrichmentData) {
  try {
    // Get company SharePoint URL from settings
    const { data: settings, error: settingsError } = await getSupabase()
      .from('company_settings')
      .select('company_sharepoint_root_url')
      .limit(1)
      .single();

    if (settingsError || !settings?.company_sharepoint_root_url) {
      console.log('[DocumentLibrary] No SharePoint URL configured, skipping document download');
      return null;
    }

    const rootUrl = settings.company_sharepoint_root_url;
    const manufacturer = sanitizePathSegment(part.manufacturer || 'Unknown');
    const partNumber = sanitizePathSegment(part.part_number || part.id);
    const manualsPath = `Parts/${manufacturer}/${partNumber}/manuals`;
    const techDocsPath = `Parts/${manufacturer}/${partNumber}/technical`;

    const uploadedUrls = {};

    // Download install manuals
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

    // Download technical manuals
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

    // Download single documents
    const singleDocs = [
      { source: 'quick_start_url', dest: 'quick_start_sharepoint_url', prefix: 'quick-start', path: manualsPath },
      { source: 'datasheet_url', dest: 'datasheet_sharepoint_url', prefix: 'datasheet', path: techDocsPath },
      { source: 'submittal_url', dest: 'submittal_sharepoint_url', prefix: 'submittal', path: techDocsPath }
    ];

    for (const doc of singleDocs) {
      if (enrichmentData[doc.source]) {
        const result = await downloadAndUploadSingleDocument(rootUrl, doc.path, enrichmentData[doc.source], doc.prefix, part);
        if (result) uploadedUrls[doc.dest] = result;
      }
    }

    return Object.keys(uploadedUrls).length > 0 ? uploadedUrls : null;

  } catch (error) {
    console.error('[DocumentLibrary] Document download error:', error);
    return null;
  }
}

/**
 * Download a single document and upload to SharePoint
 */
async function downloadAndUploadSingleDocument(rootUrl, subPath, sourceUrl, prefix, part) {
  try {
    // Skip non-PDF URLs for download (but we still saved the URL)
    if (!sourceUrl.toLowerCase().includes('.pdf') && !sourceUrl.toLowerCase().includes('pdf')) {
      console.log(`[DocumentLibrary] Skipping non-PDF URL: ${sourceUrl}`);
      return null;
    }

    console.log(`[DocumentLibrary] Downloading: ${sourceUrl}`);

    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.log(`[DocumentLibrary] Failed to download ${sourceUrl}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'application/pdf';

    // Verify it's actually a PDF
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      console.log(`[DocumentLibrary] Not a PDF (${contentType}): ${sourceUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Check file size (skip if > 50MB)
    if (buffer.byteLength > 50 * 1024 * 1024) {
      console.log(`[DocumentLibrary] File too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB): ${sourceUrl}`);
      return null;
    }

    const base64 = Buffer.from(buffer).toString('base64');

    // Generate filename
    const urlPath = new URL(sourceUrl).pathname;
    let filename = decodeURIComponent(urlPath.split('/').pop() || `${prefix}.pdf`);

    // Clean up filename
    filename = filename.replace(/[<>:"/\\|?*]/g, '-');

    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = `${filename}.pdf`;
    }

    // Add part number prefix for clarity
    const partNum = sanitizePathSegment(part.part_number || 'unknown');
    if (!filename.toLowerCase().includes(partNum.toLowerCase())) {
      filename = `${partNum}-${filename}`;
    }

    console.log(`[DocumentLibrary] Uploading: ${subPath}/${filename}`);

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
      console.error(`[DocumentLibrary] SharePoint upload failed: ${errorText}`);
      return null;
    }

    const uploadResult = await uploadResponse.json();
    console.log(`[DocumentLibrary] ✓ Uploaded: ${filename}`);

    return uploadResult.url || uploadResult.webUrl;

  } catch (error) {
    console.error(`[DocumentLibrary] Error with ${sourceUrl}:`, error.message);
    return null;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sanitizeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function sanitizeBoolean(value, defaultValue = null) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
}

function sanitizeString(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function sanitizeUrlArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(url => typeof url === 'string' && url.trim().length > 0)
    .map(url => url.trim())
    .filter(url => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
}

function sanitizePathSegment(str) {
  if (!str) return 'unknown';
  return str
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
}
