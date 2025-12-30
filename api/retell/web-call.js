/**
 * api/retell/web-call.js
 * Create web call for browser testing
 */
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const AGENT_ID = 'agent_569081761d8bbd630c0794095d'; // Intelligent Systems - Sarah

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!RETELL_API_KEY) {
            throw new Error('RETELL_API_KEY not configured');
        }

        const { test_phone } = req.body || {};

        const response = await fetch('https://api.retellai.com/v2/create-web-call', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RETELL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                agent_id: AGENT_ID,
                metadata: { source: 'web_test' },
                retell_llm_dynamic_variables: {
                    test_phone: test_phone || '+15125551234'
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Retell API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[Retell WebCall] Created:', data.call_id);

        return res.json({
            success: true,
            call_id: data.call_id,
            access_token: data.access_token
        });

    } catch (error) {
        console.error('[Retell WebCall] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
