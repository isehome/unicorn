/**
 * api/ai/scan-business-card.js
 * Use Gemini Vision to extract contact information from a business card image
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

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Extract base64 data from data URL
    const base64Match = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ error: 'Invalid image format. Expected base64 data URL.' });
    }

    const mimeType = `image/${base64Match[1]}`;
    const base64Data = base64Match[2];

    console.log('[Scan Business Card] Processing image, mime type:', mimeType, ', size:', Math.round(base64Data.length / 1024), 'KB');

    const prompt = `Analyze this business card image and extract all contact information. Return ONLY a JSON object with these fields (use empty string for missing fields):

{
  "first_name": "Person's first name",
  "last_name": "Person's last name",
  "email": "Email address",
  "phone": "Phone number formatted as (XXX) XXX-XXXX",
  "company": "Company name",
  "role": "Job title or role",
  "address1": "Street address line 1",
  "address2": "Suite, apartment, etc. (optional)",
  "city": "City",
  "state": "State abbreviation (2 letters)",
  "zip": "ZIP code",
  "website": "Website URL if present"
}

Important:
- Extract ONLY information visible on the card
- Format phone numbers as (XXX) XXX-XXXX
- Use 2-letter state abbreviations (IN, CA, NY, etc.)
- If you see multiple phone numbers, use the main/office one
- If name appears as "John D. Smith", first_name="John D.", last_name="Smith"
- Return ONLY the JSON object, no explanation or markdown`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Scan Business Card] Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('[Scan Business Card] Gemini response:', text.substring(0, 500));

    // Extract JSON from response
    let jsonStr = text.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object in the response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    try {
      const contact = JSON.parse(jsonStr);

      // Clean up empty fields
      Object.keys(contact).forEach(key => {
        if (contact[key] === '' || contact[key] === null || contact[key] === undefined) {
          delete contact[key];
        }
      });

      // Ensure we have at least some contact info
      if (!contact.first_name && !contact.last_name && !contact.email && !contact.phone && !contact.company) {
        return res.status(200).json({
          success: false,
          error: 'Could not extract contact information from the image'
        });
      }

      console.log('[Scan Business Card] Extracted contact:', contact);

      return res.status(200).json({
        success: true,
        contact: contact
      });

    } catch (parseErr) {
      console.error('[Scan Business Card] JSON parse error:', parseErr.message);
      console.error('[Scan Business Card] Raw response:', text);
      return res.status(200).json({
        success: false,
        error: 'Could not parse contact information'
      });
    }

  } catch (error) {
    console.error('[Scan Business Card] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
