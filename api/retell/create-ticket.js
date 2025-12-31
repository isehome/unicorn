/**
 * api/retell/create-ticket.js
 * Create service ticket from Retell AI phone call
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate ticket number: ST-YYYYMMDD-XXXX
function generateTicketNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return 'ST-' + dateStr + '-' + random;
}

// VALID VALUES FROM DATABASE CONSTRAINTS
const VALID = {
    categories: ['network', 'av', 'shades', 'control', 'wiring', 'installation', 'maintenance', 'general'],
    priorities: ['low', 'medium', 'high', 'urgent'],
    sources: ['manual', 'phone_ai', 'email', 'portal', 'issue_escalation'],
    statuses: ['open', 'triaged', 'scheduled', 'in_progress', 'waiting_parts', 'waiting_customer', 'resolved', 'closed']
};

// Map LLM category to valid category
function mapCategory(c) {
    if (!c) return 'general';
    const lower = c.toLowerCase().trim();
    if (VALID.categories.includes(lower)) return lower;
    
    // Common aliases
    if (lower.includes('audio') || lower.includes('video') || lower.includes('tv') || lower.includes('speaker')) return 'av';
    if (lower.includes('network') || lower.includes('wifi') || lower.includes('internet')) return 'network';
    if (lower.includes('shade') || lower.includes('blind')) return 'shades';
    if (lower.includes('automat') || lower.includes('control') || lower.includes('light') || lower.includes('security')) return 'control';
    
    return 'general';
}

// Map LLM priority to valid priority
function mapPriority(p) {
    if (!p) return 'medium';
    const lower = p.toLowerCase().trim();
    if (VALID.priorities.includes(lower)) return lower;
    if (lower === 'normal') return 'medium';
    return 'medium';
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        console.log('[CreateTicket] Incoming request');
        
        let body = req.body;
        if (req.body?.args) body = req.body.args;

        const {
            title,
            description,
            category,
            priority,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            preferred_time,
            troubleshooting_notes
        } = body;

        if (!title) {
            return res.json({
                result: {
                    success: false,
                    message: "I need a brief description of the issue to create a ticket."
                }
            });
        }

        const ticketNumber = generateTicketNumber();
        
        // Build the ticket with ONLY valid constrained values
        const ticketData = {
            ticket_number: ticketNumber,
            title: title,
            description: description || title,
            category: mapCategory(category),
            priority: mapPriority(priority),
            status: 'open',
            source: 'phone_ai',
            customer_name: customer_name || null,
            customer_phone: customer_phone || null,
            customer_email: customer_email || null,
            customer_address: customer_address || null
        };

        // Optional fields - only add if provided
        if (preferred_time) {
            ticketData.initial_customer_comment = 'Scheduling preference: ' + preferred_time;
        }
        if (troubleshooting_notes) {
            ticketData.triage_notes = troubleshooting_notes;
        }

        console.log('[CreateTicket] Creating:', ticketNumber, '| Category:', ticketData.category, '| Priority:', ticketData.priority);

        const { data: ticket, error } = await supabase
            .from('service_tickets')
            .insert([ticketData])
            .select('id, ticket_number, title, status')
            .single();

        if (error) {
            console.error('[CreateTicket] DB error:', JSON.stringify(error));
            return res.json({
                result: {
                    success: false,
                    message: "I was unable to create the ticket. Let me have someone call you back."
                }
            });
        }

        console.log('[CreateTicket] SUCCESS:', ticket.ticket_number);

        return res.json({
            result: {
                success: true,
                ticket_id: ticket.id,
                ticket_number: ticket.ticket_number,
                message: 'Ticket ' + ticket.ticket_number + ' created. Someone will reach out to schedule.'
            }
        });

    } catch (error) {
        console.error('[CreateTicket] Exception:', error.message || error);
        return res.json({
            result: {
                success: false,
                message: "I encountered an error. Let me have someone call you back."
            }
        });
    }
};
