/**
 * api/service/log-call.js
 * Log completed phone calls from Retell AI
 *
 * Endpoint: POST /api/service/log-call
 * Body: { external_call_id, caller_phone, caller_name, summary, ... }
 */

const { requireAuth } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth required — called from frontend ServiceAITest page with MSAL token
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        const {
            external_call_id,
            caller_phone,
            caller_name,
            caller_identified,
            contact_id,
            project_id,
            ticket_id,
            call_start_time,
            call_end_time,
            call_duration_seconds,
            transcript,
            summary,
            sentiment,
            ticket_created,
            schedule_created,
            escalated_to_human,
            issue_resolved,
            troubleshooting_steps,
            recording_url
        } = req.body;

        if (!caller_phone) {
            return res.status(400).json({ error: 'Caller phone is required' });
        }

        console.log(`[Service Log Call] Logging call from: ${caller_phone} | Duration: ${call_duration_seconds || 0}s | Resolved: ${issue_resolved || false}`);

        const { data, error } = await supabase
            .from('service_call_logs')
            .insert([{
                external_call_id,
                caller_phone,
                caller_name,
                caller_identified: caller_identified || false,
                contact_id,
                project_id,
                ticket_id,
                call_direction: 'inbound',
                call_start_time: call_start_time || new Date().toISOString(),
                call_end_time,
                call_duration_seconds,
                handled_by: 'ai',
                ai_agent_name: 'Retell Support Agent',
                transcript,
                summary,
                sentiment,
                ticket_created: ticket_created || false,
                schedule_created: schedule_created || false,
                escalated_to_human: escalated_to_human || false,
                issue_resolved: issue_resolved || false,
                troubleshooting_steps,
                recording_url
            }])
            .select()
            .single();

        if (error) {
            console.error('[Service Log Call] Insert error:', error);
            throw error;
        }

        // If ticket was created, add call log reference to ticket
        if (ticket_id) {
            await supabase.from('service_ticket_notes').insert([{
                ticket_id,
                note_type: 'phone_call',
                content: summary || 'Phone call logged',
                call_duration_seconds,
                caller_phone,
                author_name: 'AI Phone Agent'
            }]);
            console.log(`[Service Log Call] Added call note to ticket: ${ticket_id}`);
        }

        console.log(`[Service Log Call] Call logged successfully: ${data.id}`);

        return res.json({ success: true, call_log_id: data.id });

    } catch (error) {
        console.error('[Service Log Call] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
