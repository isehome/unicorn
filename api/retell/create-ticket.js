/**
 * api/retell/create-ticket.js
 * Create service ticket from Retell AI call
 * Uses service_tickets table
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

// Map priority values
const mapPriority = (p) => {
    const map = {
        'urgent': 'urgent',
        'high': 'high',
        'normal': 'medium',
        'medium': 'medium',
        'low': 'low'
    };
    return map[p?.toLowerCase()] || 'medium';
};

// Valid categories from database constraint
const VALID_CATEGORIES = ['network', 'av', 'shades', 'control', 'wiring', 'installation', 'maintenance', 'general'];

// Simple category mapping - if not valid, use 'general'
const mapCategory = (c) => {
    if (!c) return 'general';
    const lower = c.toLowerCase().trim();
    
    // Direct match
    if (VALID_CATEGORIES.includes(lower)) return lower;
    
    // Common aliases
    if (lower.includes('audio') || lower.includes('video') || lower.includes('tv') || lower.includes('speaker')) return 'av';
    if (lower.includes('network') || lower.includes('wifi') || lower.includes('internet')) return 'network';
    if (lower.includes('shade') || lower.includes('blind')) return 'shades';
    if (lower.includes('automat') || lower.includes('control') || lower.includes('light') || lower.includes('security')) return 'control';
    
    // Default fallback
    return 'general';
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        console.log('[Retell CreateTicket] Incoming request');
        
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
            contact_id,
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

        const ticketNumber = generateTicketNumber();
        const mappedPriority = mapPriority(priority);
        const mappedCategory = mapCategory(category);

        // Build description with scheduling preference
        let fullDescription = description || title;
        if (preferred_time) {
            fullDescription += '\n\nScheduling Preference: ' + preferred_time;
        }

        console.log('[Retell CreateTicket] Creating:', ticketNumber, '| Cat:', mappedCategory, '| Pri:', mappedPriority);

        const { data: ticket, error } = await supabase
            .from('service_tickets')
            .insert([{
                ticket_number: ticketNumber,
                title: title,
                description: fullDescription,
                category: mappedCategory,
                priority: mappedPriority,
                status: 'open',
                source: 'ai_phone',
                source_reference: call_id || null,
                customer_name: customer_name || null,
                customer_phone: customer_phone || null,
                customer_email: customer_email || null,
                customer_address: customer_address || null,
                contact_id: contact_id || null,
                initial_customer_comment: 'Created via AI phone agent (Sarah). ' + (preferred_time ? 'Customer requested: ' + preferred_time : '')
            }])
            .select('id, ticket_number, title, status')
            .single();

        if (error) {
            console.error('[Retell CreateTicket] DB error:', JSON.stringify(error));
            return res.json({
                result: {
                    success: false,
                    error_code: error.code,
                    message: "I was unable to create the ticket. Let me have someone call you back to help."
                }
            });
        }

        console.log('[Retell CreateTicket] SUCCESS:', ticket.ticket_number);

        return res.json({
            result: {
                success: true,
                ticket_id: ticket.id,
                ticket_number: ticket.ticket_number,
                message: 'Service ticket ' + ticket.ticket_number + ' created. Someone from our team will reach out to schedule.'
            }
        });

    } catch (error) {
        console.error('[Retell CreateTicket] Exception:', error.message || error);
        return res.json({
            result: {
                success: false,
                message: "I encountered an error. Let me have someone call you back."
            }
        });
    }
};
