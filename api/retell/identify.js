/**
 * api/retell/identify.js
 * Customer identification for Retell AI voice agent
 * FAST VERSION - No UniFi check on initial lookup
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    const startTime = Date.now();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        let body = req.body;
        if (req.body?.args) body = req.body.args;
        
        let phone = body.phone_number || body.phone;
        if (!phone && req.body?.call?.from_number) {
            phone = req.body.call.from_number;
        }

        if (!phone) {
            return res.json({
                result: {
                    identified: false,
                    message: "I couldn't detect your phone number. Could you tell me your name?"
                }
            });
        }

        console.log('[Retell Identify] Looking up:', phone);

        const { data, error } = await supabase.rpc('find_customer_by_phone', { phone_input: phone });

        const dbTime = Date.now() - startTime;
        console.log('[Retell Identify] DB lookup took:', dbTime, 'ms');

        if (error) {
            console.error('[Retell Identify] DB error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            return res.json({
                result: {
                    identified: false,
                    phone: phone,
                    message: "I don't see this number in our system. Can I get your name and address?",
                    timing_ms: dbTime
                }
            });
        }

        const c = data[0];

        const equipmentList = (c.equipment_summary || [])
            .filter(e => e.manufacturer && e.manufacturer !== 'Unknown')
            .slice(0, 5)
            .map(e => e.manufacturer);

        const projects = c.projects || [];
        let projectSummary = '';
        let teamSummary = '';
        
        if (projects.length > 0) {
            const activeProject = projects[0];
            projectSummary = `Project: ${activeProject.name} at ${activeProject.address || 'address on file'}. Phase: ${activeProject.phase || 'in progress'}.`;
            
            if (activeProject.team && activeProject.team.length > 0) {
                const pm = activeProject.team.find(t => t.role === 'Project Manager');
                const tech = activeProject.team.find(t => t.role === 'Lead Technician');
                const teamParts = [];
                if (pm) teamParts.push(`${pm.name} is your Project Manager`);
                if (tech) teamParts.push(`${tech.name} is your Lead Technician`);
                if (teamParts.length > 0) {
                    teamSummary = teamParts.join(' and ') + '.';
                }
            }
        }

        const totalTime = Date.now() - startTime;

        return res.json({
            result: {
                identified: true,
                customer: {
                    id: c.contact_id,
                    name: c.contact_name,
                    email: c.contact_email,
                    phone: c.contact_phone,
                    company: c.contact_company,
                    address: c.contact_address
                },
                sla: {
                    tier: c.sla_tier,
                    response_hours: c.sla_response_hours,
                    is_24_7: c.sla_24_7
                },
                projects: projects,
                context: {
                    total_projects: c.total_projects,
                    open_tickets: c.open_tickets,
                    equipment: equipmentList
                },
                summary: `Customer: ${c.contact_name}${c.contact_company ? ` from ${c.contact_company}` : ''}. ${projectSummary} ${teamSummary} SLA: ${c.sla_tier} (${c.sla_response_hours}hr response).`.trim(),
                timing_ms: totalTime
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
