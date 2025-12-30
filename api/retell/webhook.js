/**
 * api/retell/webhook.js
 * Handle Retell webhook events (call_started, call_ended, call_analyzed)
 * Set this URL in Retell Dashboard > Webhooks
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const event = req.body;
        console.log('[Retell Webhook] Event:', event.event, '| Call:', event.call?.call_id);

        const call = event.call || {};

        switch (event.event) {
            case 'call_started':
                await supabase.from('retell_call_logs').insert([{
                    call_id: call.call_id,
                    agent_id: call.agent_id,
                    from_number: call.from_number,
                    to_number: call.to_number,
                    direction: call.direction || 'inbound',
                    start_time: new Date().toISOString(),
                    call_status: 'in_progress',
                    retell_metadata: call
                }]);
                break;

            case 'call_ended':
                await supabase
                    .from('retell_call_logs')
                    .update({
                        end_time: new Date().toISOString(),
                        duration_seconds: call.call_duration_ms ? Math.round(call.call_duration_ms / 1000) : null,
                        call_status: 'completed',
                        transcript: call.transcript,
                        retell_metadata: call
                    })
                    .eq('call_id', call.call_id);
                break;

            case 'call_analyzed':
                const analysis = event.analysis || {};
                await supabase
                    .from('retell_call_logs')
                    .update({
                        call_summary: analysis.call_summary,
                        sentiment: analysis.user_sentiment,
                        issue_category: analysis.custom_analysis_data?.issue_category,
                        issue_resolved: analysis.custom_analysis_data?.resolution_status === 'resolved',
                        post_call_analysis: analysis
                    })
                    .eq('call_id', call.call_id);
                break;
        }

        return res.json({ success: true });

    } catch (error) {
        console.error('[Retell Webhook] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
