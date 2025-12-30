/**
 * api/retell/create-ticket.js
 * Create service ticket from Retell AI call
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
        console.log('[Retell CreateTicket] Body:', JSON.stringify(req.body));

        let body = req.body;
        if (req.body?.args) body = req.body.args;

        const {
            title,
            description,
            category = 'general',
            priority = 'normal',
            customer_id,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            troubleshooting_steps,
            call_id
        } = body;

        if (!title) {
            return res.json({
                result: {
                    success: false,
                    message: "I need a brief description of the issue to create a ticket."
                }
            });
        }

        console.log('[Retell CreateTicket] Creating:', title);

        const { data: ticket, error } = await supabase
            .from('service_tickets')
            .insert([{
                title,
                description: description || title,
                category,
                priority,
                contact_id: customer_id || null,
                customer_name,
                customer_phone,
                customer_email,
                service_address: customer_address,
                source: 'phone_ai',
                source_reference: call_id,
                ai_triage_notes: description,
                troubleshooting_attempted: !!troubleshooting_steps,
                troubleshooting_steps
            }])
            .select()
            .single();

        if (error) {
            console.error('[Retell CreateTicket] DB error:', error);
            throw error;
        }

        // Add note to ticket
        await supabase.from('service_ticket_notes').insert([{
            ticket_id: ticket.id,
            note_type: 'note',
            content: `Ticket created via AI Phone Agent.\n\nTroubleshooting attempted: ${troubleshooting_steps || 'None documented'}`,
            author_name: 'AI Phone Agent',
            is_internal: true
        }]).catch(e => console.error('[Retell CreateTicket] Note error:', e));

        // Update call log if we have call_id
        if (call_id) {
            await supabase
                .from('retell_call_logs')
                .update({ ticket_id: ticket.id })
                .eq('call_id', call_id)
                .catch(e => console.error('[Retell CreateTicket] Call log update error:', e));
        }

        console.log('[Retell CreateTicket] Created:', ticket.ticket_number);

        const responseTime = priority === 'urgent' ? '2' : priority === 'high' ? '4' : '24';

        return res.json({
            result: {
                success: true,
                ticket_number: ticket.ticket_number,
                message: `I've created ticket ${ticket.ticket_number}. Our team will contact you within ${responseTime} hours.`
            }
        });

    } catch (error) {
        console.error('[Retell CreateTicket] Error:', error);
        return res.status(500).json({
            result: {
                success: false,
                message: "I had trouble creating the ticket. Let me note your information and have someone call you back."
            }
        });
    }
};
