const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // CORS headers
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
        const { headers } = req.body;

        if (!headers || !Array.isArray(headers)) {
            return res.status(400).json({ error: 'headers array is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('Missing GEMINI_API_KEY');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
        You are an expert in Lutron Shade data import.
        Your task is to map the provided CSV headers to our internal standard schema.

        Internal Schema Keys (Target):
        - technology (e.g. "Sivoia QS Wireless", "System")
        - product_type (e.g. "Roller", "Honeycomb")
        - model (e.g. "Product Details", "Model", "Product")
        - mount_type (e.g. "Mounting", "System Mount", "Inside/Outside")
        - width (e.g. "Width", "Quoted Width")
        - height (e.g. "Height", "Quoted Height")
        - area (e.g. "Area", "Room", "Location")
        - name (e.g. "Name", "Shade Name")
        - fabric (e.g. "Fabric", "Cloth")

        Input Headers: ${JSON.stringify(headers)}

        Instructions:
        1. For each Target Key, find the best matching Input Header.
        2. If multiple input headers seem relevant, pick the most specific one that likely contains the value (e.g. "Width" is better than "Width Type").
        3. If NO matching input header is found for a key, set it to null.
        4. Return a JSON object where keys are the Target Keys and values are the Input Header strings.

        Return ONLY JSON:
        {
            "technology": "Input Header Name",
            "product_type": "Input Header Name",
            ...
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let mapping;
        try {
            mapping = JSON.parse(cleanText);
        } catch (e) {
            console.error('Failed to parse LLM response:', text);
            return res.status(500).json({ error: 'Failed to process headers', raw: text });
        }

        return res.status(200).json(mapping);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
