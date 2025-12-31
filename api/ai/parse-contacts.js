/**
 * api/ai/parse-contacts.js
 * Use Gemini to intelligently parse and clean contact data from CSV imports
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      throw new Error('No contacts provided');
    }

    // Process in batches of 20 to avoid token limits
    const batchSize = 20;
    const results = [];

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const prompt = `You are a contact data parser. Parse each contact and return clean, structured data.

For each contact, extract:
- first_name: First name only
- last_name: Last name only
- name: Full name (or company name if it's a business)
- email: Primary email (if multiple, pick first)
- phone: Primary phone number in format (XXX) XXX-XXXX (extract from formats like "Phone:XXX Mobile:XXX")
- company: Company/organization name (if the "name" looks like a business, put it here too)
- is_company: true if this appears to be a business/organization, false if it's a person

Rules:
- If a name looks like a company (e.g., "Acme Steel Products Corporation", "Ball State University"), set is_company=true
- Extract first phone number from strings like "Phone:(317) 764-1008" or "Mobile:(513) 668-0485"
- If there's both Phone and Mobile, use Phone as primary
- For names like "John Smith", first_name="John", last_name="Smith"
- For names like "Dr. Jane Doe", first_name="Jane", last_name="Doe"
- If name is clearly a business, leave first_name and last_name empty

Input contacts (JSON):
${JSON.stringify(batch, null, 2)}

Return ONLY a JSON array with the parsed contacts. No explanation, just the JSON array.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Parse Contacts] Gemini error:', errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      try {
        const parsed = JSON.parse(jsonStr);
        results.push(...parsed);
      } catch (parseErr) {
        console.error('[AI Parse Contacts] Failed to parse Gemini response:', jsonStr);
        // Fall back to original data for this batch
        results.push(...batch);
      }
    }

    return res.status(200).json({
      success: true,
      contacts: results,
      processed: results.length
    });

  } catch (error) {
    console.error('[AI Parse Contacts] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
