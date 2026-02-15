const { GoogleGenerativeAI } = require('@google/generative-ai');
const { requireAuth } = require('./_authMiddleware');

module.exports = async (req, res) => {
    // Auth required — CRITICAL: this endpoint returns API keys
    const user = await requireAuth(req, res);
    if (!user) return;

    // Return Key (for client-side WebSocket connection)
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    return res.status(200).json({ key: apiKey });
};
