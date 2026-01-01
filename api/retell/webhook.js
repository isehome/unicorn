/**
 * api/retell/webhook.js
 * Receives webhooks from Retell AI when calls end
 * Stores transcript in service ticket
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

        // We care about call_ended and call_analyzed events
        if (event.event !== 'call_ended' && event.event !== 'call_analyzed') {
            return res.status(200).json({ received: true, processed: false });
        }

        const call = event.call;
        if (!call) {
            console.log('[Retell Webhook] No call data in event');
            return res.status(200).json({ received: true, processed: false });
        }

        const callId = call.call_id;
        const transcript = call.transcript;
        const transcriptObject = call.transcript_object; // Detailed with timestamps
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

        console.log('[Retell Webhook] Call ID:', callId, '| Duration:', callDuration, 's | Transcript length:', formattedTranscript?.length);

        // Find the service ticket created during this call
        // We stored call_id in source_reference when creating the ticket
        const { data: tickets, error: findError } = await supabase
            .from('service_tickets')
            .select('id, ticket_number, triage_comments')
            .eq('source', 'phone_ai')
            .order('created_at', { ascending: false })
            .limit(10);

        if (findError) {
            console.error('[Retell Webhook] Error finding tickets:', findError);
        }

        // For now, update the most recent phone_ai ticket within the last 5 minutes
        // In production, we should pass call_id to create_ticket and store it
        let ticketToUpdate = null;
        if (tickets && tickets.length > 0) {
            ticketToUpdate = tickets[0];
        }

        if (ticketToUpdate && formattedTranscript) {
            // Add transcript as a triage comment
            const existingComments = Array.isArray(ticketToUpdate.triage_comments) 
                ? ticketToUpdate.triage_comments 
                : [];

            const transcriptComment = {
                content: '=== CALL TRANSCRIPT ===\n\n' + formattedTranscript + 
                         (callSummary ? '\n\n=== AI SUMMARY ===\n' + callSummary : '') +
                         (callDuration ? '\n\nCall duration: ' + callDuration + ' seconds' : ''),
                author_name: 'Retell AI (Automated)',
                author_id: null,
                created_at: new Date().toISOString()
            };

            const updatedComments = [...existingComments, transcriptComment];

            const { error: updateError } = await supabase
                .from('service_tickets')
                .update({ 
                    triage_comments: updatedComments,
                    source_reference: callId
                })
                .eq('id', ticketToUpdate.id);

            if (updateError) {
                console.error('[Retell Webhook] Error updating ticket:', updateError);
            } else {
                console.log('[Retell Webhook] Updated ticket:', ticketToUpdate.ticket_number, 'with transcript');
            }
        }

        // Also log to retell_call_logs if table exists
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

        return res.status(200).json({ 
            received: true, 
            processed: true,
            ticket_updated: ticketToUpdate?.ticket_number || null
        });

    } catch (error) {
        console.error('[Retell Webhook] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
