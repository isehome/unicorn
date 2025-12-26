/**
 * api/service/identify.js
 * Identifies caller by phone number for Retell AI
 *
 * Endpoint: POST /api/service/identify
 * Body: { phone }
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
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number required' });
        }

        console.log(`[Service Identify] Looking up phone: ${phone}`);

        // Use database function for lookup
        const { data, error } = await supabase.rpc('find_customer_by_phone', {
            phone_input: phone
        });

        if (error) {
            console.error('[Service Identify] Database error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log(`[Service Identify] Customer not found for phone: ${phone}`);
            return res.json({
                success: true,
                identified: false,
                message: 'Customer not found in system',
                phone: phone
            });
        }

        const customer = data[0];
        console.log(`[Service Identify] Found customer: ${customer.contact_name}`);

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
