/**
 * Parts Enrichment AI Cron Job
 *
 * Runs nightly to enrich global_parts records with technical specifications
 * by searching manufacturer websites and datasheets using Gemini AI.
 *
 * Endpoint: POST /api/cron/enrich-parts
 * Schedule: 3 AM daily (cron: 0 3 * * *)
 *
 * Flow:
 * 1. Query parts pending enrichment (ai_enrichment_status = 'pending' or NULL)
 * 2. For each part:
 *    - Update status to 'processing'
 *    - Search web for product specifications using Gemini
 *    - Extract: power watts, ports, POE info, UPS outlets, manual URLs
 *    - Save enrichment data
 *    - Mark for human review
 * 3. Return summary of processed parts
 *
 * Enrichment Data Extracted:
 * - power_watts: Power consumption in watts
 * - total_ports: Total network ports (switches)
 * - poe_ports: Number of PoE-enabled ports
 * - poe_port_list: Which ports are PoE (e.g., "1-8")
 * - ups_battery_outlets: Battery backup outlet count
 * - ups_surge_only_outlets: Surge-only outlet count
 * - install_manual_urls: Official installation manual links
 * - user_guide_urls: Official user guide links
 */

const { requireCron } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const MAX_PARTS_PER_RUN = 5; // Prevent Vercel 60s timeout
const GEMINI_MODEL = 'gemini-2.0-flash';

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

// Lazy load Gemini to avoid cold start issues
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!requireCron(req, res)) return;

  console.log('[PartsEnrichment] Starting enrichment cron job...');

  try {
    // Check for Gemini API key
    const geminiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error('[PartsEnrichment] Gemini API key not configured');
      return res.status(500).json({
        error: 'Gemini API key not configured',
        hint: 'Set REACT_APP_GEMINI_API_KEY or GEMINI_API_KEY environment variable'
      });
    }

    // Get parts pending enrichment
    const { data: parts, error: fetchError } = await getSupabase()
      .rpc('get_parts_pending_enrichment', { p_limit: MAX_PARTS_PER_RUN });

    if (fetchError) {
      console.error('[PartsEnrichment] Failed to fetch pending parts:', fetchError);
      throw fetchError;
    }

    if (!parts || parts.length === 0) {
      console.log('[PartsEnrichment] No parts pending enrichment');
      return res.status(200).json({
        success: true,
        message: 'No parts pending enrichment',
        processed: 0
      });
    }

    console.log(`[PartsEnrichment] Found ${parts.length} parts to enrich`);

    // Initialize Gemini
    const GenAI = getGemini();
    const genAI = new GenAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      // Note: googleSearch grounding requires API v1beta and specific model versions
      // Using standard generation with web search instructions in prompt
    });

    const results = [];

    // Process each part
    for (const part of parts) {
      console.log(`[PartsEnrichment] Processing: ${part.name || part.part_number} (${part.id})`);

      try {
        // Mark as processing
        await getSupabase()
          .from('global_parts')
          .update({ ai_enrichment_status: 'processing' })
          .eq('id', part.id);

        // Enrich the part with AI
        const enrichmentData = await enrichPart(model, part);

        console.log(`[PartsEnrichment] Enrichment complete for ${part.id}:`, {
          confidence: enrichmentData.confidence,
          fieldsFound: Object.keys(enrichmentData.data).filter(k =>
            enrichmentData.data[k] !== null &&
            !(Array.isArray(enrichmentData.data[k]) && enrichmentData.data[k].length === 0)
          ).length
        });

        // Save results using RPC
        const { data: saveResult, error: saveError } = await getSupabase()
          .rpc('save_parts_enrichment', {
            p_part_id: part.id,
            p_enrichment_data: enrichmentData.data,
            p_confidence: enrichmentData.confidence,
            p_notes: enrichmentData.notes
          });

        if (saveError) {
          console.error(`[PartsEnrichment] Failed to save for ${part.id}:`, saveError);
          throw saveError;
        }

        results.push({
          partId: part.id,
          partNumber: part.part_number,
          name: part.name,
          success: true,
          confidence: enrichmentData.confidence,
          ...saveResult
        });

      } catch (partError) {
        console.error(`[PartsEnrichment] Failed for part ${part.id}:`, partError);

        // Update status to error
        await getSupabase()
          .from('global_parts')
          .update({
            ai_enrichment_status: 'error',
            ai_enrichment_notes: partError.message || 'Unknown error during enrichment'
          })
          .eq('id', part.id);

        results.push({
          partId: part.id,
          partNumber: part.part_number,
          name: part.name,
          success: false,
          error: partError.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[PartsEnrichment] Completed: ${successCount} success, ${failCount} failed`);

    return res.status(200).json({
      success: true,
      processed: results.length,
      successful: successCount,
      failed: failCount,
      results
    });

  } catch (error) {
    console.error('[PartsEnrichment] Fatal error:', error);
    return res.status(500).json({
      error: 'Enrichment job failed',
      details: error.message
    });
  }
};

/**
 * Enrich a single part using Gemini AI
 */
async function enrichPart(model, part) {
  const productIdentifier = buildProductIdentifier(part);

  const prompt = `You are a technical product researcher for AV/IT installation equipment.

**TASK:** Research and extract technical specifications for this product.

**PRODUCT INFORMATION:**
- Name: ${part.name || 'Unknown'}
- Part Number: ${part.part_number || 'Unknown'}
- Manufacturer: ${part.manufacturer || 'Unknown'}
- Model: ${part.model || part.part_number || 'Unknown'}
- Category: ${part.category || 'Unknown'}

**SEARCH STRATEGY:**
1. Search for "${productIdentifier} specifications" or "${productIdentifier} datasheet"
2. Look for official manufacturer product pages
3. Check for PDF datasheets or spec sheets
4. Focus on verified, official sources only

**EXTRACT THESE SPECIFICATIONS:**

1. **Power Consumption**
   - Operating wattage (not maximum/peak)
   - Look for "power consumption", "power draw", "watts"

2. **Network Ports** (if applicable - switches, routers, hubs)
   - Total number of ports
   - Number of PoE/PoE+ ports
   - Which specific ports are PoE (e.g., "ports 1-8")

3. **UPS Outlets** (if applicable - UPS devices)
   - Number of battery backup outlets
   - Number of surge-only outlets

4. **Documentation Links**
   - Installation manual URL (official manufacturer link)
   - User guide/quick start guide URL (official manufacturer link)
   - Only include direct links to PDFs or official support pages

**RESPONSE FORMAT:**
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):

{
  "power_watts": <number or null>,
  "total_ports": <number or null>,
  "poe_ports": <number or null>,
  "poe_port_list": "<string like '1-8' or null>",
  "ups_battery_outlets": <number or null>,
  "ups_surge_only_outlets": <number or null>,
  "install_manual_urls": ["<url>"] or [],
  "user_guide_urls": ["<url>"] or [],
  "sources": ["<url where you found this info>"],
  "confidence": <0.0 to 1.0>,
  "notes": "<brief note about data quality or missing info>"
}

**IMPORTANT RULES:**
- Use null for any value you cannot verify from official sources
- confidence should reflect how certain you are (1.0 = found on official datasheet, 0.5 = found on reseller site, 0.3 = uncertain)
- Only include URLs that are likely to still be valid (official manufacturer domains)
- Do not make up or guess values - it's better to return null`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = responseText;

    // Remove markdown code blocks if present
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON - no JSON object found');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and sanitize the response
    return {
      data: {
        power_watts: sanitizeNumber(parsed.power_watts),
        total_ports: sanitizeNumber(parsed.total_ports),
        poe_ports: sanitizeNumber(parsed.poe_ports),
        poe_port_list: sanitizeString(parsed.poe_port_list),
        ups_battery_outlets: sanitizeNumber(parsed.ups_battery_outlets),
        ups_surge_only_outlets: sanitizeNumber(parsed.ups_surge_only_outlets),
        install_manual_urls: sanitizeUrlArray(parsed.install_manual_urls),
        user_guide_urls: sanitizeUrlArray(parsed.user_guide_urls),
        sources: sanitizeUrlArray(parsed.sources)
      },
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      notes: sanitizeString(parsed.notes) || 'Enrichment completed'
    };

  } catch (error) {
    console.error(`[enrichPart] Error parsing response:`, error);
    throw new Error(`AI response parsing failed: ${error.message}`);
  }
}

/**
 * Build a product identifier string for searching
 */
function buildProductIdentifier(part) {
  const terms = [
    part.manufacturer,
    part.model || part.part_number,
    part.name
  ].filter(Boolean);

  // Deduplicate similar terms
  const unique = [...new Set(terms.map(t => t.toLowerCase()))];

  return unique.join(' ');
}

/**
 * Sanitize a number value
 */
function sanitizeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Sanitize a string value
 */
function sanitizeString(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/**
 * Sanitize and validate URL array
 */
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
