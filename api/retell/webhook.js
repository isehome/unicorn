/**
 * api/retell/webhook.js
 * Receives webhooks from Retell AI when calls end
 * Stores transcript in dedicated field (not triage comments)
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

        // Only process call_analyzed (has full transcript + summary)
        // Ignore call_ended to avoid duplicates
        if (event.event !== 'call_analyzed') {
            console.log('[Retell Webhook] Ignoring event:', event.event);
            return res.status(200).json({ received: true, processed: false, reason: 'not call_analyzed' });
        }

        const call = event.call;
        if (!call) {
            console.log('[Retell Webhook] No call data in event');
            return res.status(200).json({ received: true, processed: false });
        }

        const callId = call.call_id;
        const transcript = call.transcript;
        const transcriptObject = call.transcript_object;
        const callSummary = call.call_analysis?.call_summary;
        const callDuration = call.end_timestamp && call.start_timestamp 
            ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
            : null;

        // Format transcript for readability
        let formattedTranscript = '';
        if (transcriptObject && Array.isArray(transcriptObject)) {
            formattedTranscript = transcriptObject.map(turn => {
                const speaker = turn.role === 'agent' ? 'Sarah' : 'Customer';
                return speaker + ': ' + turn.content;
            }).join('\n\n');
        } else if (transcript) {
            formattedTranscript = transcript;
        }

        console.log('[Retell Webhook] Call:', callId, '| Duration:', callDuration, 's | Transcript:', formattedTranscript?.length, 'chars');

        // Find ticket by source_reference (call_id)
        const { data: ticket, error: findError } = await supabase
            .from('service_tickets')
            .select('id, ticket_number, call_transcript')
            .eq('source_reference', callId)
            .single();

        if (findError || !ticket) {
            // Try finding most recent phone_ai ticket as fallback
            const { data: recentTicket } = await supabase
                .from('service_tickets')
                .select('id, ticket_number, call_transcript')
                .eq('source', 'phone_ai')
                .is('call_transcript', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (recentTicket) {
                console.log('[Retell Webhook] Using fallback ticket:', recentTicket.ticket_number);
                await updateTicket(recentTicket, callId, formattedTranscript, callSummary, callDuration);
            } else {
                console.log('[Retell Webhook] No ticket found for call:', callId);
            }
        } else {
            // Skip if transcript already exists (avoid duplicates)
            if (ticket.call_transcript) {
                console.log('[Retell Webhook] Transcript already exists for:', ticket.ticket_number);
                return res.status(200).json({ received: true, processed: false, reason: 'already_has_transcript' });
            }
            await updateTicket(ticket, callId, formattedTranscript, callSummary, callDuration);
        }

        // Also log to retell_call_logs
        try {
            await supabase.from('retell_call_logs').upsert({
                call_id: callId,
                agent_id: call.agent_id,
                call_type: call.call_type,
                from_number: call.from_number,
                to_number: call.to_number,
                direction: call.direction,
                call_status: call.call_status,
                start_timestamp: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
                end_timestamp: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
                duration_seconds: callDuration,
                transcript: formattedTranscript,
                call_summary: callSummary,
                disconnection_reason: call.disconnection_reason,
                user_sentiment: call.call_analysis?.user_sentiment,
                call_successful: call.call_analysis?.call_successful,
                updated_at: new Date().toISOString()
            }, { onConflict: 'call_id' });
        } catch (e) {
            console.log('[Retell Webhook] Could not log to retell_call_logs:', e.message);
        }

        return res.status(200).json({ received: true, processed: true });

    } catch (error) {
        console.error('[Retell Webhook] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function updateTicket(ticket, callId, transcript, summary, duration) {
    const { error } = await supabase
        .from('service_tickets')
        .update({ 
            call_transcript: transcript,
            call_summary: summary,
            call_duration_seconds: duration,
            source_reference: callId
        })
        .eq('id', ticket.id);

    if (error) {
        console.error('[Retell Webhook] Error updating ticket:', error);
    } else {
        console.log('[Retell Webhook] Updated ticket:', ticket.ticket_number);
    }
}
