const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    // 1. Basic Security Check (ensure internal call or auth, for prototype we allow same-origin)
    // Ideally verify MSAL token header here.

    // 2. Return Key (for client-side WebSocket connection)
    // WARNING: In production, use a proxy. For internal prototype, this is acceptable.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    return res.status(200).json({ key: apiKey });
};
