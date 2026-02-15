const { GoogleGenerativeAI } = require('@google/generative-ai');
const { requireAuth } = require('./_authMiddleware');

module.exports = async (req, res) => {
    // CORS headers
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
        const { importedAreas, projectRooms } = req.body;

        if (!importedAreas || !Array.isArray(importedAreas)) {
            return res.status(400).json({ error: 'importedAreas array is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('Missing GEMINI_API_KEY');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `
        You are an intelligent construction project manager. 
        Your task is to map "Imported Room Names" from a shade quote to "Existing Project Rooms".
        
        Rules:
        1. Fuzzy match heavily: "Mstr Bdrm" -> "Primary Bedroom", "Living" -> "Living Room", "Kit" -> "Kitchen".
        2. If a match is found, return the room ID.
        3. If NO match is found (e.g. "Garage" and no garage exists), list it as a "newRoom".
        4. Normalize creating new rooms: "Living Rm" -> "Living Room". Use standard capitalization.
        
        Input Data:
        Imported Areas: ${JSON.stringify(importedAreas)}
        Existing Project Rooms: ${JSON.stringify(projectRooms)}

        Return ONLY JSON structure:
        {
            "mappings": { "Imported Name": "Existing_Room_ID" },
            "newRooms": ["Standardized Name 1", "Standardized Name 2"]
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let data;
        try {
            data = JSON.parse(cleanText);
        } catch (e) {
            console.error('Failed to parse LLM response:', text);
            data = { mappings: {}, newRooms: importedAreas }; // Fallback to treating all as new
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
