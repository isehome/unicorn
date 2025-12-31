/**
 * api/retell/create-ticket.js
 * Create service ticket (issue) from Retell AI call
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map Retell priority values to valid database values
const mapPriority = (p) => {
    const map = {
        'urgent': 'urgent',
        'high': 'high',
        'normal': 'medium',  // Map normal -> medium
        'medium': 'medium',
        'low': 'low'
    };
    return map[p?.toLowerCase()] || 'medium';
};

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
            priority = 'medium',
            customer_name,
            customer_phone,
            customer_email,
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

        if (!project_id) {
            return res.json({
                result: {
                    success: false,
                    message: "I need to link this to your project. Let me have someone call you back."
                }
            });
        }

        const mappedPriority = mapPriority(priority);
        console.log('[Retell CreateTicket] Creating:', title, 'priority:', mappedPriority, 'project:', project_id);

        // Build the full description with customer info
        const fullDescription = [
            description || title,
            '',
            '--- Customer Info ---',
            customer_name ? 'Name: ' + customer_name : null,
            customer_phone ? 'Phone: ' + customer_phone : null,
            customer_email ? 'Email: ' + customer_email : null,
            customer_address ? 'Address: ' + customer_address : null,
            'Category: ' + category,
            '',
            'Created via AI Phone Agent (Sarah)'
        ].filter(Boolean).join('\n');

        const { data: issue, error } = await supabase
            .from('issues')
            .insert([{
                title: '[Phone] ' + title,
                description: fullDescription,
                status: 'open',
                priority: mappedPriority,
                project_id: project_id
            }])
            .select('id, title, status')
            .single();

        if (error) {
            console.error('[Retell CreateTicket] DB error:', JSON.stringify(error));
            return res.json({
                result: {
                    success: false,
                    error_code: error.code,
                    message: "I was unable to create the ticket. I will have someone call you back to confirm."
                }
            });
        }

        if (!issue || !issue.id) {
            console.error('[Retell CreateTicket] No issue returned');
            return res.json({
                result: {
                    success: false,
                    message: "Something went wrong. I will have someone call you back."
                }
            });
        }

        console.log('[Retell CreateTicket] SUCCESS - Created issue:', issue.id, issue.title);

        return res.json({
            result: {
                success: true,
                ticket_id: issue.id,
                ticket_title: issue.title,
                message: 'I have created a service ticket for ' + title + '. Someone from our team will reach out to schedule.'
            }
        });

    } catch (error) {
        console.error('[Retell CreateTicket] Exception:', error.message || error);
        return res.json({
            result: {
                success: false,
                message: "I encountered an error. I will have someone call you back."
            }
        });
    }
};
