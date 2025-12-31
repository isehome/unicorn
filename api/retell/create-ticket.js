/**
 * api/retell/create-ticket.js
 * Create service ticket (issue) from Retell AI call
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
            customer_name,
            customer_phone,
            customer_address,
            project_id
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

        // Build the full description with customer info
        const fullDescription = [
            description || title,
            '',
            '--- Customer Info ---',
            customer_name ? 'Name: ' + customer_name : null,
            customer_phone ? 'Phone: ' + customer_phone : null,
            customer_address ? 'Address: ' + customer_address : null,
            'Category: ' + category,
            '',
            'Created via AI Phone Agent (Sarah)'
        ].filter(Boolean).join('\n');

        // Build insert object - only include fields that exist
        const insertData = {
            title: '[Phone] ' + title,
            description: fullDescription,
            status: 'open',
            priority: priority
        };

        // Only add project_id if provided
        if (project_id) {
            insertData.project_id = project_id;
        }

        console.log('[Retell CreateTicket] Insert data:', JSON.stringify(insertData));

        const { data: issue, error } = await supabase
            .from('issues')
            .insert([insertData])
            .select()
            .single();

        if (error) {
            console.error('[Retell CreateTicket] DB error:', JSON.stringify(error));
            
            // If project_id is required, return a helpful message
            if (error.message && error.message.includes('project_id')) {
                return res.json({
                    result: {
                        success: false,
                        message: "I need to link this to a project. Let me have someone call you back to create the ticket properly."
                    }
                });
            }
            throw error;
        }

        console.log('[Retell CreateTicket] Created issue:', issue.id);

        const responseTime = priority === 'urgent' ? '2' : priority === 'high' ? '4' : '24';

        return res.json({
            result: {
                success: true,
                ticket_id: issue.id,
                message: 'I have created a service ticket. Our team will contact you within ' + responseTime + ' hours.'
            }
        });

    } catch (error) {
        console.error('[Retell CreateTicket] Error:', error.message || error);
        return res.status(500).json({
            result: {
                success: false,
                message: "I had trouble creating the ticket. Let me note your information and have someone call you back."
            }
        });
    }
};
