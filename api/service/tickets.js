/**
 * api/service/tickets.js
 * Create and manage service tickets via API (for Retell AI)
 *
 * Endpoints:
 *   POST /api/service/tickets - Create a ticket
 *   GET /api/service/tickets - List tickets (with optional filters)
 */
const { requireAuth } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Auth required — called from frontend ServiceAITest page with MSAL token
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        if (req.method === 'POST') {
            // Log raw body for debugging
            console.log('[Service Tickets] Raw body type:', typeof req.body);
            console.log('[Service Tickets] Raw body:', JSON.stringify(req.body));
            
            // Handle case where body might be nested in 'args' (Retell format)
            let body = req.body;
            if (req.body && req.body.args) {
                console.log('[Service Tickets] Found args wrapper, unwrapping');
                body = req.body.args;
            }
            
            // Create ticket
            const {
                title,
                description,
                category = 'general',
                priority = 'medium',
                customer_name,
                customer_phone,
                customer_email,
                customer_address,
                contact_id,
                project_id,
                source = 'phone_ai',
                source_reference
            } = body;

            console.log('[Service Tickets] Extracted title:', title);
            
            if (!title) {
                return res.status(400).json({ success: false, error: 'Title is required' });
            }

            console.log('[Service Tickets] Creating ticket:', title, '| Source:', source);

            const { data: ticket, error } = await supabase
                .from('service_tickets')
                .insert([{
                    title,
                    description,
                    category,
                    priority,
                    customer_name,
                    customer_phone,
                    customer_email,
                    customer_address,
                    contact_id,
                    project_id,
                    source,
                    source_reference
                }])
                .select()
                .single();

            if (error) {
                console.error('[Service Tickets] Create error:', error.message, error.details, error.hint);
                return res.status(400).json({
                    success: false,
                    error: error.message || 'Failed to create ticket',
                    details: error.details || null,
                    hint: error.hint || null
                });
            }

            // Add creation note
            await supabase.from('service_ticket_notes').insert([{
                ticket_id: ticket.id,
                note_type: 'note',
                content: 'Ticket created via ' + source + (source_reference ? ' (Ref: ' + source_reference + ')' : ''),
                author_name: source === 'phone_ai' ? 'AI Phone Agent' : 'System'
            }]);

            console.log('[Service Tickets] Created ticket:', ticket.ticket_number);

            return res.json({
                success: true,
                ticket: {
                    id: ticket.id,
                    ticket_number: ticket.ticket_number,
                    title: ticket.title,
                    status: ticket.status,
                    priority: ticket.priority,
                    category: ticket.category
                }
            });

        } else if (req.method === 'GET') {
            // Get tickets (with optional filters)
            const { contact_id, project_id, status, phone, limit = 10 } = req.query;

            console.log('[Service Tickets] Fetching tickets | Status:', status || 'all', '| Limit:', limit);

            let query = supabase
                .from('service_tickets')
                .select('id, ticket_number, title, status, priority, category, created_at, customer_name, customer_phone')
                .order('created_at', { ascending: false })
                .limit(parseInt(limit));

            if (contact_id) query = query.eq('contact_id', contact_id);
            if (project_id) query = query.eq('project_id', project_id);
            if (status) query = query.eq('status', status);
            if (phone) query = query.eq('customer_phone', phone);

            const { data, error } = await query;

            if (error) {
                console.error('[Service Tickets] Fetch error:', error);
                throw error;
            }

            console.log('[Service Tickets] Found', (data && data.length) || 0, 'tickets');

            return res.json({ success: true, tickets: data || [] });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('[Service Tickets] Error:', error.message || error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            details: error.details || null
        });
    }
};
