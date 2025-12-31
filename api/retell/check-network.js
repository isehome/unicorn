/**
 * api/retell/check-network.js
 * Check UniFi network status for a customer's project
 * Called separately by Sarah when troubleshooting network issues
 */

const UNIFI_API_KEY = process.env.UNIFI_API_KEY || process.env.REACT_APP_UNIFI_API_KEY;

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
        
        const unifiSiteId = body.unifi_site_id || body.site_id;
        
        if (!unifiSiteId) {
            return res.json({
                result: {
                    checked: false,
                    message: "No UniFi site configured for this customer's project."
                }
            });
        }

        if (!UNIFI_API_KEY) {
            return res.json({
                result: {
                    checked: false,
                    message: "Network monitoring is not configured."
                }
            });
        }

        console.log('[Check Network] Looking up site:', unifiSiteId);

        const response = await fetch('https://api.ui.com/v1/sites', {
            headers: {
                'X-API-KEY': UNIFI_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`UniFi API error: ${response.status}`);
        }

        const data = await response.json();
        const sites = data.data || [];
        const site = sites.find(s => s.hostId === unifiSiteId);
        
        if (!site) {
            return res.json({
                result: {
                    checked: false,
                    message: "Could not find this network in our monitoring system."
                }
            });
        }

        const stats = site.statistics?.counts || {};
        const wanUptime = site.statistics?.percentages?.wanUptime;
        const ispInfo = site.statistics?.ispInfo;
        
        const online = stats.offlineGatewayDevice === 0;
        const connectedClients = (stats.wifiClient || 0) + (stats.wiredClient || 0);
        const offlineDevices = stats.offlineDevice || 0;

        let statusMessage = '';
        if (online && offlineDevices === 0) {
            statusMessage = `Network is online and healthy. ${connectedClients} devices connected via ${ispInfo?.name || 'internet'}. WAN uptime is ${wanUptime}%.`;
        } else if (!online) {
            statusMessage = `WARNING: Network gateway appears OFFLINE. This explains connectivity issues.`;
        } else {
            statusMessage = `Network is online but ${offlineDevices} device(s) are offline. ${connectedClients} clients connected.`;
        }

        const timing = Date.now() - startTime;

        return res.json({
            result: {
                checked: true,
                online: online,
                connected_clients: connectedClients,
                offline_devices: offlineDevices,
                total_devices: stats.totalDevice || 0,
                wan_uptime_percent: wanUptime,
                isp: ispInfo?.name || null,
                message: statusMessage,
                timing_ms: timing
            }
        });

    } catch (error) {
        console.error('[Check Network] Error:', error);
        return res.json({
            result: {
                checked: false,
                message: "Unable to check network status right now."
            }
        });
    }
};
