const { GoogleGenerativeAI } = require('@google/generative-ai');

// Function to handle the Vercel API request
module.exports = async (req, res) => {
    // Enable CORS for local development if needed, though usually handled by Vercel/Next.js dev server
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transcript, context } = req.body;

        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('Missing GEMINI_API_KEY');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        // Prompt engineering for robust parsing
        const prompt = `
        You are a smart construction assistant. Your job is to extract the intended numeric dimension from a spoken transcript.
        
        Context: The user is measuring a ${context || 'window'}.
        
        Rules:
        1. Convert all text numbers to digits ("thirty five" -> 35).
        2. Convert simple fractions to decimals ("half" -> .5, "quarter" -> .25, "five eighths" -> .625).
        3. Handle corrections: If user says "35... no wait 36", the value is 36.
        4. Handle inches: "35 inches" -> 35. "3 feet" -> 36. "3 foot 2" -> 38.
        5. Return ONLY a JSON object with this structure: { "value": number, "confidence": number (0-1), "reasoning": "string" }
        6. If the input is garbage or unrelated, return { "value": null, "confidence": 0 }

        Transcript: "${transcript}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse JSON from the response (handling potential markdown code blocks)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let data;
        try {
            data = JSON.parse(cleanText);
        } catch (e) {
            console.error('Failed to parse LLM response:', text);
            data = { value: null, confidence: 0, reasoning: "Parse error" };
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
