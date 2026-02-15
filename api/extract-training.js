const { GoogleGenerativeAI } = require('@google/generative-ai');
const { requireAuth } = require('./_authMiddleware');

/**
 * API endpoint to extract structured training data from a conversation transcript
 * This analyzes a training conversation and extracts the key fields needed for page training
 */
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth required
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const { transcript, pageRoute, pageTitle, sessionType } = req.body;

        if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
            return res.status(400).json({ error: 'Transcript array is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('Missing GEMINI_API_KEY');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        // Format transcript for analysis
        const formattedTranscript = transcript
            .map(t => `${t.role === 'ai' ? 'AI' : 'Admin'}: ${t.content}`)
            .join('\n\n');

        // Build prompt for extraction
        const prompt = `
You are analyzing a training conversation between an admin and an AI assistant.
The admin was teaching the AI about a page in their application.

Page: ${pageTitle || 'Unknown'} (${pageRoute || 'Unknown route'})
Session Type: ${sessionType || 'initial'}

Your job is to extract ALL useful information from this conversation and structure it for the AI knowledge base.

TRANSCRIPT:
${formattedTranscript}

---

Extract the following information from the conversation. Only include fields where you found relevant information. Be thorough - capture ALL details mentioned.

Return a JSON object with this exact structure:
{
  "functional_description": "A clear description of what this page does and its purpose",
  "business_context": "Why this page matters to the business, how it fits into operations",
  "workflow_position": "Where this page fits in the user's workflow (what comes before/after)",
  "real_world_use_case": "Concrete example(s) of when and how this page is used",
  "common_mistakes": ["Array of common mistakes users make on this page"],
  "best_practices": ["Array of tips and best practices for using this page effectively"],
  "pro_tips": ["Array of expert/power-user tips mentioned"],
  "faq": [{"question": "Common question", "answer": "Answer to the question"}],
  "training_script": {
    "overview": "Brief introduction to the page",
    "steps": [
      {
        "instruction": "Step description",
        "highlightElement": "CSS selector if mentioned, null otherwise"
      }
    ]
  }
}

Important:
- Only include fields that have actual content from the conversation
- For arrays, only include items if relevant information was mentioned
- Be concise but complete
- If something wasn't discussed, use an empty string or empty array
- Capture specific details, examples, and warnings mentioned
- Return ONLY valid JSON, no markdown formatting`;

        // Call Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        let extractedData;
        try {
            // Remove any markdown code block markers if present
            const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            extractedData = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('Failed to parse Gemini response:', text);
            return res.status(500).json({
                error: 'Failed to parse AI response',
                rawResponse: text
            });
        }

        // Validate the structure and provide defaults
        const validatedData = {
            functional_description: extractedData.functional_description || '',
            business_context: extractedData.business_context || '',
            workflow_position: extractedData.workflow_position || '',
            real_world_use_case: extractedData.real_world_use_case || '',
            common_mistakes: Array.isArray(extractedData.common_mistakes) ? extractedData.common_mistakes : [],
            best_practices: Array.isArray(extractedData.best_practices) ? extractedData.best_practices : [],
            pro_tips: Array.isArray(extractedData.pro_tips) ? extractedData.pro_tips : [],
            faq: Array.isArray(extractedData.faq) ? extractedData.faq : [],
            training_script: extractedData.training_script || null,
        };

        return res.status(200).json({
            success: true,
            data: validatedData,
        });

    } catch (error) {
        console.error('Extract training error:', error);
        return res.status(500).json({
            error: 'Failed to extract training data',
            message: error.message
        });
    }
};
