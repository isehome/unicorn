/**
 * api/retell/create-ticket.js
 * Create service ticket from Retell AI phone call
 * Automatically includes network diagnostics as triage comments
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateTicketNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return 'ST-' + dateStr + '-' + random;
}

const VALID = {
    priorities: ['low', 'medium', 'high', 'urgent']
};

function mapPriority(p) {
    if (!p) return 'medium';
    const lower = p.toLowerCase().trim();
    if (VALID.priorities.includes(lower)) return lower;
    if (lower === 'normal') return 'medium';
    return 'medium';
}

function mapCategory(c) {
    if (!c) return 'general';
    const lower = c.toLowerCase().trim();
    if (lower.includes('audio') || lower.includes('video') || lower.includes('tv') || lower.includes('speaker')) return 'av';
    if (lower.includes('network') || lower.includes('wifi') || lower.includes('internet')) return 'network';
    if (lower.includes('light') || lower.includes('keypad') || lower.includes('switch') || lower.includes('lutron') || lower.includes('dimmer')) return 'lighting';
    if (lower.includes('shade') || lower.includes('blind')) return 'shades';
    if (lower.includes('control') || lower.includes('automat') || lower.includes('crestron') || lower.includes('savant')) return 'control';
    return lower || 'general';
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
            unifi_site_id
        } = body;

        if (!title) {
            return res.json({
                result: { success: false, message: "I need a brief description of the issue." }
            });
        }

        const ticketNumber = generateTicketNumber();
        const mappedCategory = mapCategory(category);
        const isNetworkIssue = mappedCategory === 'network' || 
                              (description && (description.toLowerCase().includes('wifi') || 
                               description.toLowerCase().includes('internet') || 
                               description.toLowerCase().includes('network')));
        
        // Build triage comments array for network issues
        const triageComments = [];
        let networkDiagnostics = null;
        
        if (unifi_site_id && isNetworkIssue) {
            // Try to get cached network diagnostics
            try {
                const { data } = await supabase
                    .from('retell_network_cache')
                    .select('diagnostics')
                    .eq('site_id', unifi_site_id)
                    .single();
                    
                if (data?.diagnostics) {
                    networkDiagnostics = data.diagnostics;
                    console.log('[CreateTicket] Found cached network diagnostics');
                    
                    // Add diagnostics as first triage comment
                    triageComments.push({
                        content: networkDiagnostics,
                        author_name: 'Sarah (AI Phone Agent)',
                        author_id: null,
                        created_at: new Date().toISOString()
                    });
                    
                    // Add UniFi Site Manager link as second triage comment
                    // Extract the host ID (first part before the colon)
                    const hostId = unifi_site_id.split(':')[0];
                    const siteManagerUrl = 'https://unifi.ui.com/consoles/' + hostId;
                    
                    triageComments.push({
                        content: 'UniFi Site Manager: ' + siteManagerUrl,
                        author_name: 'Sarah (AI Phone Agent)',
                        author_id: null,
                        created_at: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.log('[CreateTicket] No cached diagnostics found');
            }
        }

        const ticketData = {
            ticket_number: ticketNumber,
            title: title,
            description: description || title,
            category: mappedCategory,
            priority: mapPriority(priority),
            status: 'open',
            source: 'phone_ai',
            customer_name: customer_name || null,
            customer_phone: customer_phone || null,
            customer_email: customer_email || null,
            customer_address: customer_address || null
        };

        if (preferred_time) {
            ticketData.initial_customer_comment = 'Scheduling preference: ' + preferred_time;
        }
        
        // Add triage comments if we have any
        if (triageComments.length > 0) {
            ticketData.triage_comments = triageComments;
        }

        console.log('[CreateTicket] Creating:', ticketNumber, '| Cat:', ticketData.category, '| Triage comments:', triageComments.length);

        const { data: ticket, error } = await supabase
            .from('service_tickets')
            .insert([ticketData])
            .select('id, ticket_number, title, status')
            .single();

        if (error) {
            console.error('[CreateTicket] DB error:', JSON.stringify(error));
            return res.json({
                result: { success: false, message: "Unable to create ticket. Someone will call you back." }
            });
        }

        console.log('[CreateTicket] SUCCESS:', ticket.ticket_number);

        return res.json({
            result: {
                success: true,
                ticket_id: ticket.id,
                ticket_number: ticket.ticket_number,
                message: 'Ticket ' + ticket.ticket_number + ' created.'
            }
        });

    } catch (error) {
        console.error('[CreateTicket] Exception:', error.message || error);
        return res.json({
            result: { success: false, message: "Error creating ticket. Someone will call you back." }
        });
    }
};
