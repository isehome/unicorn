/**
 * api/service/identify.js
 * Identifies caller by phone number for Retell AI
 *
 * Endpoint: POST /api/service/identify
 * Body: { phone } - phone number from call metadata
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Log raw body for debugging
        console.log('[Service Identify] Raw body:', JSON.stringify(req.body));
        
        // Handle case where body might be nested in 'args' (Retell format)
        let body = req.body;
        if (req.body && req.body.args) {
            console.log('[Service Identify] Found args wrapper, unwrapping');
            body = req.body.args;
        }
        
        // Also check for call object with caller phone (Retell call metadata)
        let phone = body.phone;
        if (!phone && req.body.call && req.body.call.from_number) {
            phone = req.body.call.from_number;
            console.log('[Service Identify] Got phone from call metadata:', phone);
        }

        if (!phone) {
            console.log('[Service Identify] No phone provided');
            return res.status(400).json({ success: false, error: 'Phone number required' });
        }

        console.log('[Service Identify] Looking up phone:', phone);

        // Use database function for lookup
        const { data, error } = await supabase.rpc('find_customer_by_phone', {
            phone_input: phone
        });

        if (error) {
            console.error('[Service Identify] Database error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log('[Service Identify] Customer not found for phone:', phone);
            return res.json({
                success: true,
                identified: false,
                message: 'Customer not found in system',
                phone: phone
            });
        }

        const customer = data[0];
        console.log('[Service Identify] Found customer:', customer.contact_name);

        return res.json({
            success: true,
            identified: true,
            customer: {
                id: customer.contact_id,
                name: customer.contact_name,
                email: customer.contact_email,
                phone: customer.contact_phone,
                projects: customer.projects,
                recentTickets: customer.recent_tickets,
                equipment: customer.equipment_summary
            }
        });

    } catch (error) {
        console.error('[Service Identify] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
