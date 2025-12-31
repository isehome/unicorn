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
                    message: "I need to link this to your project. Let me get your information and have someone call you back."
                }
            });
        }

        console.log('[Retell CreateTicket] Creating:', title, 'for project:', project_id);

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
            'Priority: ' + priority,
            '',
            'Created via AI Phone Agent (Sarah)'
        ].filter(Boolean).join('\n');

        const { data: issue, error } = await supabase
            .from('issues')
            .insert([{
                title: '[Phone] ' + title,
                description: fullDescription,
                status: 'open',
                priority: priority,
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
                    message: "I was unable to create the ticket in our system. I will make a note and have someone call you back to confirm the details."
                }
            });
        }

        if (!issue || !issue.id) {
            console.error('[Retell CreateTicket] No issue returned after insert');
            return res.json({
                result: {
                    success: false,
                    message: "Something went wrong creating the ticket. I will have someone call you back to confirm."
                }
            });
        }

        console.log('[Retell CreateTicket] Successfully created issue:', issue.id, issue.title);

        return res.json({
            result: {
                success: true,
                ticket_id: issue.id,
                ticket_title: issue.title,
                message: 'I have created a service ticket for ' + title + '. Someone from our team will reach out to schedule a time that works for you.'
            }
        });

    } catch (error) {
        console.error('[Retell CreateTicket] Exception:', error.message || error);
        return res.json({
            result: {
                success: false,
                message: "I encountered an error. I will make a note and have someone call you back."
            }
        });
    }
};
