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
 *
 * This prompt is designed to help Manus build a comprehensive knowledge base
 * with verified manufacturer sources. The focus is on:
 * 1. Capturing actual manufacturer URLs (product pages, support pages, PDF downloads)
 * 2. Downloading or linking to real PDFs from official sources
 * 3. Creating backup markdown files with source links embedded
 */
function buildResearchPrompt(part) {
  const manufacturer = part.manufacturer || 'Unknown';
  const partNumber = part.part_number || 'Unknown';
  const productName = part.name || partNumber;
  const category = part.category || 'AV/IT Equipment';

  return `# ${partNumber} Documentation Research and Creation

## OBJECTIVE
Help us build the most comprehensive and accurate knowledge base possible for this product. We need VERIFIED manufacturer sources that our technicians can reference during installations and service calls.

## PRODUCT INFORMATION
- **Manufacturer:** ${manufacturer}
- **Part/Model Number:** ${partNumber}
- **Product Name:** ${productName}
- **Category:** ${category}

---

## PHASE 1: MANUFACTURER SOURCE DISCOVERY

### Step 1: Find the Official Product Page
1. Navigate to ${manufacturer}'s official website (${manufacturer.toLowerCase().replace(/\\s+/g, '')}.com or search for it)
2. Search for "${partNumber}" on their site
3. Find the OFFICIAL product page URL - this is critical
4. Record the exact URL to the product page

### Step 2: Find Support & Documentation Pages
From the product page or support section, find:
- **Support/Downloads page** - where PDFs and manuals are hosted
- **User Guide / Manual** - the main usage documentation (PDF or web-based)
- **Installation Guide** - step-by-step setup instructions
- **Quick Start Guide** - condensed setup reference
- **Technical Specifications / Datasheet** - detailed specs sheet
- **Service/Troubleshooting Guide** - if available

### Step 3: Locate Downloadable PDFs
Look for direct PDF download links for:
- User Manual PDF
- Installation Manual PDF
- Quick Start PDF
- Specifications/Datasheet PDF
- Any other service-related documentation

**IMPORTANT:** We need the ACTUAL URLs to these PDFs, not just that they exist.

### Step 4: Check Additional Verified Sources
If manufacturer documentation is incomplete, also check:
- FCC ID database (fcc.gov) for internal photos and test reports
- CNET, TechRadar for detailed reviews with specs
- Professional AV integrator resources (AvNation, rAVe, etc.)

**Only include sources that can be verified as legitimate.**

---

## PHASE 2: CREATE BACKUP DOCUMENTATION FILES

Create markdown (.md) files that serve as our knowledge base backup. Each file should include:
- The source URL where information was found
- Key information extracted from that source
- Links to original PDFs and pages

### Required Files:

**1. ${partNumber}-installation-guide.md**
Include:
- Source URL at the top: "Source: [URL]"
- Physical installation steps (mounting, placement)
- Cable connections and wiring diagrams
- Network/IP setup if applicable
- Initial configuration and pairing
- Common installation tips from the manufacturer

**2. ${partNumber}-specifications.md**
Include:
- Source URL at the top
- Physical: dimensions (W x D x H in inches), weight
- Electrical: power consumption (watts), voltage, connector type
- Connectivity: ports, wireless standards, protocols
- Environmental: operating temp, humidity
- Rack mounting: is it rack mountable? U height?

**3. ${partNumber}-quick-reference.md**
Include:
- Source URL at the top
- LED/indicator meanings and status lights
- Button functions and reset procedures
- Common settings and configurations
- Troubleshooting: common issues and solutions
- Factory reset procedure
- Support contact information

---

## PHASE 3: JSON RESULTS FILE - CRITICAL OUTPUT

**THIS IS THE MOST IMPORTANT OUTPUT.** Create a JSON file named "${partNumber.toLowerCase().replace(/[^a-z0-9]/g, '-')}-documentation-results.json".

**CRITICAL: You MUST include the actual URLs you visited during research. Do NOT use placeholder text like "[URL]" - use the REAL URLs you found.**

Example of WRONG output:
  "product_page_url": "[ACTUAL PRODUCT PAGE URL]"  ❌ WRONG

Example of CORRECT output:
  "product_page_url": "https://www.sonos.com/en-us/shop/amp"  ✅ CORRECT

Here is the structure - replace ALL bracketed placeholders with real data:

\`\`\`json
{
  "manufacturer": "${manufacturer}",
  "part_number": "${partNumber}",
  "product_name": "${productName}",
  "manufacturer_website": "https://www.example.com",
  "product_page_url": "https://www.example.com/products/actual-product-page",
  "support_page_url": "https://www.example.com/support/actual-support-page",
  "all_discovered_urls": [
    {
      "url": "https://actual-url-you-visited.com/page",
      "title": "Page title or description",
      "type": "product_page|support|manual|datasheet|other"
    }
  ],
  "documents": [
    {
      "type": "user_guide",
      "title": "Actual Document Title",
      "url": "https://actual-url-to-pdf-or-webpage.com/doc.pdf",
      "format": "pdf",
      "found": true
    },
    {
      "type": "install_guide",
      "title": "Actual Document Title",
      "url": "https://actual-url.com/install-guide",
      "format": "web",
      "found": true
    },
    {
      "type": "quick_start",
      "title": "Actual Document Title",
      "url": "https://actual-url.com/quick-start.pdf",
      "format": "pdf",
      "found": true
    },
    {
      "type": "tech_specs",
      "title": "Actual Document Title",
      "url": "https://actual-url.com/specifications",
      "format": "web",
      "found": true
    }
  ],
  "specifications": {
    "width_inches": 7.5,
    "depth_inches": 5.2,
    "height_inches": 2.1,
    "weight_lbs": 4.5,
    "power_watts": 125,
    "voltage": "100-240V",
    "is_rack_mountable": false,
    "u_height": null,
    "has_network_port": true,
    "wireless": true
  },
  "notes": "Summary of what was found",
  "sources_verified": true,
  "research_date": "2026-01-30"
}
\`\`\`

### MANDATORY URL REQUIREMENTS:

1. **product_page_url** - The EXACT URL to this product's page on the manufacturer website. This is the #1 most important field. A technician clicking this link should land directly on the product page.

2. **support_page_url** - The URL to the support/downloads page for this product.

3. **all_discovered_urls** - List EVERY useful URL you visited during research. Include product pages, support pages, PDF downloads, specification pages, etc. This helps us build a complete knowledge base.

4. **documents[].url** - For each document, include the actual URL where it can be accessed (either a direct PDF download link or a web page URL).

---

## IMPORTANT NOTES

1. **NO PLACEHOLDER TEXT** - Every URL field must contain an actual URL you found, not placeholder text
2. **Include ALL URLs** - Put every useful URL in the all_discovered_urls array
3. **Prefer Official Sources** - Manufacturer website > official distributors > third-party
4. **PDF Links** - If you find a PDF, include the direct download URL
5. **Web-based Guides** - Many manufacturers now have web-based guides instead of PDFs - those URLs are equally valuable
6. **Be Thorough** - Check multiple pages on the manufacturer site (support, downloads, resources, documentation)

The goal is to give our field technicians quick access to accurate documentation during installations and service calls. **We need the actual clickable URLs, not descriptions of where to find them.**`;
}
