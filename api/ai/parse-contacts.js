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

    // Process in batches of 15 to avoid token limits
    const batchSize = 15;
    const results = [];
    let batchNum = 0;

    for (let i = 0; i < contacts.length; i += batchSize) {
      batchNum++;
      const batch = contacts.slice(i, i + batchSize);
      console.log(`[AI Parse Contacts] Processing batch ${batchNum}, contacts ${i + 1}-${Math.min(i + batchSize, contacts.length)}`);

      const prompt = `Parse these contacts into clean structured data. For EACH contact in the input array, output a corresponding object.

RULES:
1. Split "name" into first_name and last_name (e.g. "John Smith" -> first_name: "John", last_name: "Smith")
2. For phone fields containing "Phone:" or "Mobile:", extract JUST the number. Example: "Phone:3179833350 Mobile:(317) 432-2463" -> phone: "(317) 983-3350"
3. Format all phone numbers as (XXX) XXX-XXXX
4. If name looks like a company (contains Corp, LLC, Inc, University, etc), set is_company: true and leave first_name/last_name empty
5. If is_company is true, also put the name in the "company" field
6. Keep the original email value
7. PRESERVE any address, address1, address2 fields exactly as provided - do not modify them

INPUT (${batch.length} contacts):
${JSON.stringify(batch)}

OUTPUT must be a JSON array with ${batch.length} objects, each having: name, first_name, last_name, email, phone, company, is_company, address, address1, address2, notes, role (preserve any fields from input)

JSON ARRAY:`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 8192,
              }
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AI Parse Contacts] Gemini API error:', response.status, errorText);
          // Fall back to basic parsing for this batch
          results.push(...parseContactsLocally(batch));
          continue;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON from response
        let jsonStr = text.trim();

        // Remove markdown code blocks if present
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON array in the response
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }

        console.log('[AI Parse Contacts] Batch', batchNum, 'response length:', jsonStr.length);

        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            // Merge AI results with original data to preserve any fields AI didn't return
            const merged = parsed.map((aiResult, idx) => {
              const original = batch[idx] || {};
              // Start with original, then only overwrite with non-empty AI values
              const result = { ...original };
              Object.entries(aiResult).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                  result[key] = value;
                }
              });
              return result;
            });
            results.push(...merged);
          } else {
            console.error('[AI Parse Contacts] Response is not an array');
            results.push(...parseContactsLocally(batch));
          }
        } catch (parseErr) {
          console.error('[AI Parse Contacts] JSON parse error:', parseErr.message);
          console.error('[AI Parse Contacts] Raw response:', jsonStr.substring(0, 500));
          // Fall back to basic parsing
          results.push(...parseContactsLocally(batch));
        }
      } catch (batchErr) {
        console.error('[AI Parse Contacts] Batch error:', batchErr.message);
        results.push(...parseContactsLocally(batch));
      }
    }

    console.log('[AI Parse Contacts] Total processed:', results.length);

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

/**
 * Basic local parsing fallback when AI fails
 */
function parseContactsLocally(contacts) {
  return contacts.map(contact => {
    const result = { ...contact };

    // Parse name into first/last
    if (contact.name && !contact.first_name && !contact.last_name) {
      const nameParts = contact.name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        // Check if it looks like a company
        const companyKeywords = ['llc', 'inc', 'corp', 'corporation', 'university', 'college', 'company', 'co.', 'ltd', 'group', 'services', 'solutions', 'associates', 'partners'];
        const lowerName = contact.name.toLowerCase();
        const isCompany = companyKeywords.some(kw => lowerName.includes(kw));

        if (isCompany) {
          result.is_company = true;
          result.company = contact.name;
          result.first_name = '';
          result.last_name = '';
        } else {
          result.first_name = nameParts[0];
          result.last_name = nameParts.slice(1).join(' ');
          result.is_company = false;
        }
      } else {
        result.first_name = contact.name;
        result.last_name = '';
        result.is_company = false;
      }
    }

    // Extract phone from "Phone:xxx Mobile:xxx" format
    if (contact.phone) {
      let phone = contact.phone;

      // Extract first phone number
      const phoneMatch = phone.match(/(?:Phone:|Tel:)?\s*\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/i);
      if (phoneMatch) {
        result.phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
      } else {
        // Try to extract any 10-digit number
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10) {
          const d = digits.slice(0, 10);
          result.phone = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
        }
      }
    }

    return result;
  });
}
