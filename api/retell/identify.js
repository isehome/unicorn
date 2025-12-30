/**
 * api/retell/identify.js
 * Customer lookup for Retell AI - called at start of every call
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
        console.log('[Retell Identify] Body:', JSON.stringify(req.body));

        // Handle Retell's nested args format
        let body = req.body;
        if (req.body?.args) body = req.body.args;

        // Get phone from multiple possible sources
        let phone = body.phone_number || body.phone;
        if (!phone && req.body?.call?.from_number) {
            phone = req.body.call.from_number;
        }

        if (!phone) {
            console.log('[Retell Identify] No phone provided');
            return res.json({
                result: {
                    identified: false,
                    message: "I couldn't detect your phone number. Could you tell me your name?"
                }
            });
        }

        console.log('[Retell Identify] Looking up:', phone);

        const { data, error } = await supabase.rpc('find_customer_by_phone', {
            phone_input: phone
        });

        if (error) {
            console.error('[Retell Identify] DB error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.log('[Retell Identify] Not found');
            return res.json({
                result: {
                    identified: false,
                    phone: phone,
                    message: "I don't see this number in our system. Can I get your name and address?"
                }
            });
        }

        const c = data[0];
        console.log('[Retell Identify] Found:', c.contact_name);

        // Build equipment summary for AI
        const equipmentList = (c.equipment_summary || [])
            .filter(e => e.manufacturer && e.manufacturer !== 'Unknown')
            .slice(0, 5)
            .map(e => `${e.manufacturer} ${e.model || ''}`.trim());

        return res.json({
            result: {
                identified: true,
                customer: {
                    id: c.contact_id,
                    name: c.contact_name,
                    email: c.contact_email,
                    phone: c.contact_phone,
                    address: c.contact_address
                },
                sla: {
                    tier: c.sla_tier,
                    response_hours: c.sla_response_hours,
                    is_24_7: c.sla_24_7
                },
                context: {
                    total_projects: c.total_projects,
                    open_tickets: c.open_tickets,
                    equipment: equipmentList
                },
                // Human-readable summary for the AI
                summary: `Customer: ${c.contact_name}. Address: ${c.contact_address || 'not on file'}. SLA: ${c.sla_tier} (${c.sla_response_hours}hr response). ${c.open_tickets > 0 ? `Has ${c.open_tickets} open ticket(s).` : ''} ${equipmentList.length > 0 ? `Equipment: ${equipmentList.join(', ')}.` : ''}`
            }
        });

    } catch (error) {
        console.error('[Retell Identify] Error:', error);
        return res.status(500).json({
            result: {
                identified: false,
                message: "I'm having trouble looking up your account. Can you tell me your name?"
            }
        });
    }
};
