/**
 * api/retell/identify.js
 * Customer identification for Retell AI voice agent
 * Includes UniFi network status check
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UNIFI_API_KEY = process.env.UNIFI_API_KEY || process.env.REACT_APP_UNIFI_API_KEY;

// Check UniFi network status for a site
async function checkUnifiStatus(unifiSiteId) {
    if (!unifiSiteId || !UNIFI_API_KEY) {
        return null;
    }

    try {
        const response = await fetch('https://api.ui.com/v1/sites', {
            headers: {
                'X-API-KEY': UNIFI_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[UniFi] API error:', response.status);
            return null;
        }

        const data = await response.json();
        const sites = data.data || [];

        // Find the matching site by hostId (the unifi_site_id stored in projects)
        const site = sites.find(s => s.hostId === unifiSiteId);

        if (!site) {
            console.log('[UniFi] Site not found:', unifiSiteId);
            return null;
        }

        const stats = site.statistics?.counts || {};
        const wanUptime = site.statistics?.percentages?.wanUptime;
        const ispInfo = site.statistics?.ispInfo;

        return {
            online: stats.offlineGatewayDevice === 0,
            totalDevices: stats.totalDevice || 0,
            offlineDevices: stats.offlineDevice || 0,
            connectedClients: (stats.wifiClient || 0) + (stats.wiredClient || 0),
            wifiClients: stats.wifiClient || 0,
            wiredClients: stats.wiredClient || 0,
            wanUptime: wanUptime,
            isp: ispInfo?.name || null
        };
    } catch (error) {
        console.error('[UniFi] Error checking status:', error.message);
        return null;
    }
}

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

        // Build equipment summary for AI (limit to key manufacturers)
        const equipmentList = (c.equipment_summary || [])
            .filter(e => e.manufacturer && e.manufacturer !== 'Unknown')
            .slice(0, 5)
            .map(e => e.manufacturer);

        // Build project info for AI
        const projects = c.projects || [];
        let projectSummary = '';
        let teamSummary = '';
        let networkSummary = '';
        let networkStatus = null;

        if (projects.length > 0) {
            const activeProject = projects[0]; // First is most relevant (active/recent)
            projectSummary = `Project: ${activeProject.name} at ${activeProject.address || 'address on file'}. Phase: ${activeProject.phase || 'in progress'}.`;

            // Get team members
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

            // Check UniFi network status if available
            if (activeProject.unifi_site_id) {
                console.log('[Retell Identify] Checking UniFi status for:', activeProject.unifi_site_id);
                networkStatus = await checkUnifiStatus(activeProject.unifi_site_id);

                if (networkStatus) {
                    if (networkStatus.online && networkStatus.offlineDevices === 0) {
                        networkSummary = `Network is online with ${networkStatus.connectedClients} devices connected.`;
                    } else if (!networkStatus.online) {
                        networkSummary = `WARNING: Network appears to be OFFLINE - gateway is not responding.`;
                    } else if (networkStatus.offlineDevices > 0) {
                        networkSummary = `Network is online but ${networkStatus.offlineDevices} device(s) are offline. ${networkStatus.connectedClients} clients connected.`;
                    }
                }
            }
        }

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
                network: networkStatus,
                context: {
                    total_projects: c.total_projects,
                    open_tickets: c.open_tickets,
                    equipment: equipmentList
                },
                // Human-readable summary for the AI to speak naturally
                summary: `Customer: ${c.contact_name}${c.contact_company ? ` from ${c.contact_company}` : ''}. ${projectSummary} ${teamSummary} ${networkSummary} SLA: ${c.sla_tier} (${c.sla_response_hours}hr response). ${c.open_tickets > 0 ? `Has ${c.open_tickets} open ticket(s).` : ''} ${equipmentList.length > 0 ? `Equipment includes: ${equipmentList.join(', ')}.` : ''}`
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
