/**
 * Single Part Enrichment API
 *
 * Enriches a single part on-demand using Gemini AI.
 * This is triggered manually from the UI for immediate results.
 *
 * Endpoint: POST /api/enrich-single-part
 * Body: { partId: string }
 */

const { createClient } = require('@supabase/supabase-js');

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

  console.log(`[EnrichSinglePart] Starting enrichment for part: ${partId}`);

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
      console.error('[EnrichSinglePart] Part not found:', fetchError);
      return res.status(404).json({ error: 'Part not found' });
    }

    console.log(`[EnrichSinglePart] Found part: ${part.name || part.part_number}`);

    // Mark as processing
    await getSupabase()
      .from('global_parts')
      .update({ ai_enrichment_status: 'processing' })
      .eq('id', partId);

    // Initialize Gemini
    const GenAI = getGemini();
    const genAI = new GenAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Enrich the part
    const enrichmentData = await enrichPart(model, part);

    console.log(`[EnrichSinglePart] Enrichment complete:`, {
      confidence: enrichmentData.confidence,
      fieldsFound: Object.keys(enrichmentData.data).filter(k =>
        enrichmentData.data[k] !== null &&
        !(Array.isArray(enrichmentData.data[k]) && enrichmentData.data[k].length === 0)
      ).length
    });

    // Save results using RPC
    const { data: saveResult, error: saveError } = await getSupabase()
      .rpc('save_parts_enrichment', {
        p_part_id: partId,
        p_enrichment_data: enrichmentData.data,
        p_confidence: enrichmentData.confidence,
        p_notes: enrichmentData.notes
      });

    if (saveError) {
      console.error('[EnrichSinglePart] Failed to save:', saveError);
      throw saveError;
    }

    return res.status(200).json({
      success: true,
      partId,
      partNumber: part.part_number,
      name: part.name,
      confidence: enrichmentData.confidence,
      notes: enrichmentData.notes,
      data: enrichmentData.data,
      ...saveResult
    });

  } catch (error) {
    console.error('[EnrichSinglePart] Error:', error);

    // Update status to error
    await getSupabase()
      .from('global_parts')
      .update({
        ai_enrichment_status: 'error',
        ai_enrichment_notes: error.message || 'Unknown error during enrichment'
      })
      .eq('id', partId);

    return res.status(500).json({
      error: 'Enrichment failed',
      details: error.message
    });
  }
};

/**
 * Enrich a single part using Gemini AI
 */
async function enrichPart(model, part) {
  const productIdentifier = buildProductIdentifier(part);

  const prompt = `You are a technical product researcher for AV/IT installation equipment used in home automation, commercial AV, and IT infrastructure.

**TASK:** Research and extract technical specifications for this product to auto-populate rack layout and documentation fields.

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

**EXTRACT ALL APPLICABLE SPECIFICATIONS:**

## 1. RACK LAYOUT INFORMATION (Critical for rack planning)
- **Is it rack mountable?** (standard 19" rack mount)
- **Rack unit height** (1U, 2U, 3U, 4U, etc.)
- **Needs a shelf?** (if not rack-mountable but can sit on shelf)
- **Is it a wireless device?** (no network cable needed)

## 2. POWER INFORMATION
- **Power consumption** (operating watts, not peak)
- **Number of power outlets needed** (typically 1, some devices need 2)
- **Is it a power distribution device?** (PDU, UPS, surge protector, power strip)
- If power device:
  - Number of outlets provided
  - Total output watts/VA capacity
  - For UPS: battery backup outlet count vs surge-only outlet count
  - For UPS: VA rating and estimated runtime at half load

## 3. NETWORK SWITCH INFORMATION (if applicable)
- **Is it a network switch/router/hub?**
- **Total number of ports**
- **PoE/PoE+ capable?**
- **Number of PoE ports**
- **Which ports are PoE** (e.g., "1-8" or "1-24")
- **Number of uplink/SFP ports**

## 4. DOCUMENTATION LINKS
- Installation/quick start guide URL
- User manual/guide URL
- Only official manufacturer links

**RESPONSE FORMAT:**
Return ONLY a valid JSON object (no markdown, no explanation):

{
  "device_type": "<rack_equipment|power_device|network_switch|shelf_device|wireless_device|other>",

  "rack_info": {
    "is_rack_mountable": <true/false>,
    "u_height": <1-10 or null>,
    "needs_shelf": <true/false>,
    "is_wireless": <true/false>
  },

  "power_info": {
    "power_watts": <number or null>,
    "power_outlets_required": <number, default 1>,
    "is_power_device": <true/false>,
    "outlets_provided": <number or null>,
    "output_watts": <number or null>,
    "ups_va_rating": <number or null>,
    "ups_battery_outlets": <number or null>,
    "ups_surge_only_outlets": <number or null>,
    "ups_runtime_half_load_minutes": <number or null>
  },

  "network_info": {
    "is_network_switch": <true/false>,
    "total_ports": <number or null>,
    "poe_enabled": <true/false>,
    "poe_ports": <number or null>,
    "poe_port_list": "<string like '1-8' or null>",
    "uplink_ports": <number or null>,
    "has_network_port": <true/false, whether device has ethernet port>
  },

  "documentation": {
    "install_manual_urls": ["<url>"] or [],
    "user_guide_urls": ["<url>"] or []
  },

  "sources": ["<urls where you found this info>"],
  "confidence": <0.0 to 1.0>,
  "notes": "<brief note about what was found/not found>"
}

**IMPORTANT RULES:**
- Use null for values you cannot verify from official sources
- is_rack_mountable: true if product comes with rack ears OR mentions "1U", "2U", etc.
- u_height: Only set if definitely rack mountable
- needs_shelf: true for small devices like Apple TV, media players, small amplifiers
- is_power_device: true for PDU, UPS, surge protectors, power conditioners
- is_network_switch: true for switches, routers, hubs, access points with switching
- confidence: 1.0 = official datasheet, 0.5 = reseller site, 0.3 = uncertain
- Do NOT guess - null is better than wrong data`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

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
      throw new Error('Failed to parse AI response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract nested data with safe access
    const rackInfo = parsed.rack_info || {};
    const powerInfo = parsed.power_info || {};
    const networkInfo = parsed.network_info || {};
    const documentation = parsed.documentation || {};

    return {
      data: {
        // Device classification
        device_type: sanitizeString(parsed.device_type) || 'other',

        // Rack layout fields
        is_rack_mountable: sanitizeBoolean(rackInfo.is_rack_mountable),
        u_height: sanitizeNumber(rackInfo.u_height),
        needs_shelf: sanitizeBoolean(rackInfo.needs_shelf),
        is_wireless: sanitizeBoolean(rackInfo.is_wireless),

        // Power fields
        power_watts: sanitizeNumber(powerInfo.power_watts),
        power_outlets: sanitizeNumber(powerInfo.power_outlets_required) || 1,
        is_power_device: sanitizeBoolean(powerInfo.is_power_device),
        power_outlets_provided: sanitizeNumber(powerInfo.outlets_provided),
        power_output_watts: sanitizeNumber(powerInfo.output_watts),
        ups_va_rating: sanitizeNumber(powerInfo.ups_va_rating),
        ups_battery_outlets: sanitizeNumber(powerInfo.ups_battery_outlets),
        ups_surge_only_outlets: sanitizeNumber(powerInfo.ups_surge_only_outlets),
        ups_runtime_minutes: sanitizeNumber(powerInfo.ups_runtime_half_load_minutes),

        // Network switch fields
        is_network_switch: sanitizeBoolean(networkInfo.is_network_switch),
        switch_ports: sanitizeNumber(networkInfo.total_ports),
        total_ports: sanitizeNumber(networkInfo.total_ports),
        poe_enabled: sanitizeBoolean(networkInfo.poe_enabled),
        poe_ports: sanitizeNumber(networkInfo.poe_ports),
        poe_port_list: sanitizeString(networkInfo.poe_port_list),
        uplink_ports: sanitizeNumber(networkInfo.uplink_ports),
        has_network_port: sanitizeBoolean(networkInfo.has_network_port, true), // default true

        // Documentation
        install_manual_urls: sanitizeUrlArray(documentation.install_manual_urls),
        user_guide_urls: sanitizeUrlArray(documentation.user_guide_urls),

        // Sources
        sources: sanitizeUrlArray(parsed.sources)
      },
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      notes: sanitizeString(parsed.notes) || 'Enrichment completed'
    };

  } catch (error) {
    console.error(`[enrichPart] Error:`, error);
    throw new Error(`AI response parsing failed: ${error.message}`);
  }
}

function buildProductIdentifier(part) {
  const terms = [
    part.manufacturer,
    part.model || part.part_number,
    part.name
  ].filter(Boolean);
  const unique = [...new Set(terms.map(t => t.toLowerCase()))];
  return unique.join(' ');
}

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
