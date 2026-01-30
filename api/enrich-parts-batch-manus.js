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

    // Get webhook URL - always use production URL for webhooks
    // VERCEL_URL gives preview deployment URLs which change, so we hardcode production
    const webhookUrl = 'https://unicorn-one.vercel.app/api/manus-webhook';

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
 *
 * This prompt is designed to help Manus build a comprehensive knowledge base
 * with verified manufacturer sources. The focus is on:
 * 1. Capturing actual manufacturer URLs (product pages, support pages, PDF downloads)
 * 2. Downloading or linking to real PDFs from official sources
 * 3. Creating backup markdown files with source links embedded
 */
function buildPrompt(part) {
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
1. Navigate to ${manufacturer}'s official website (${manufacturer.toLowerCase().replace(/\s+/g, '')}.com or search for it)
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

## PHASE 3: JSON RESULTS FILE

Create a JSON file named "${partNumber.toLowerCase().replace(/[^a-z0-9]/g, '-')}-documentation-results.json" with this structure:

\`\`\`json
{
  "manufacturer": "${manufacturer}",
  "part_number": "${partNumber}",
  "product_name": "${productName}",
  "manufacturer_website": "https://www.${manufacturer.toLowerCase().replace(/\s+/g, '')}.com",
  "product_page_url": "[ACTUAL PRODUCT PAGE URL]",
  "support_page_url": "[SUPPORT/DOWNLOADS PAGE URL]",
  "documents": [
    {
      "type": "user_guide",
      "title": "[Document Title]",
      "url": "[ACTUAL URL to PDF or web page]",
      "format": "pdf|web",
      "found": true
    },
    {
      "type": "install_guide",
      "title": "[Document Title]",
      "url": "[ACTUAL URL]",
      "format": "pdf|web",
      "found": true
    },
    {
      "type": "quick_start",
      "title": "[Document Title]",
      "url": "[ACTUAL URL]",
      "format": "pdf|web",
      "found": true
    },
    {
      "type": "tech_specs",
      "title": "[Document Title]",
      "url": "[ACTUAL URL]",
      "format": "pdf|web",
      "found": true
    },
    {
      "type": "datasheet",
      "title": "[Document Title]",
      "url": "[ACTUAL URL]",
      "format": "pdf|web",
      "found": true|false
    }
  ],
  "specifications": {
    "width_inches": null,
    "depth_inches": null,
    "height_inches": null,
    "weight_lbs": null,
    "power_watts": null,
    "voltage": null,
    "is_rack_mountable": false,
    "u_height": null,
    "has_network_port": false,
    "wireless": false
  },
  "notes": "[Summary of what was found and any limitations]",
  "sources_verified": true,
  "research_date": "[TODAY'S DATE]"
}
\`\`\`

---

## IMPORTANT NOTES

1. **URL Accuracy is Critical** - We need the ACTUAL URLs that work, not placeholder text
2. **Prefer Official Sources** - Manufacturer website > official distributors > third-party
3. **PDF Links** - If you find a PDF, include the direct download URL
4. **Web-based Guides** - Many manufacturers now have web-based guides instead of PDFs - those URLs are equally valuable
5. **Verification** - Only include information you can verify from official sources
6. **Be Thorough** - Check multiple pages on the manufacturer site (support, downloads, resources, documentation)

The goal is to give our field technicians quick access to accurate documentation during installations and service calls. Quality and accuracy matter more than quantity.`;
}
