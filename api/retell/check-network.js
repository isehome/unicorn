/**
 * api/retell/check-network.js
 * Check UniFi network status for troubleshooting
 * Returns diagnostics formatted for easy inclusion in tickets
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
                    message: "No UniFi site configured for this customer."
                }
            });
        }

        if (!UNIFI_API_KEY) {
            return res.json({
                result: {
                    checked: false,
                    message: "Network monitoring not configured."
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
            throw new Error('UniFi API error: ' + response.status);
        }

        const data = await response.json();
        const sites = data.data || [];
        const site = sites.find(s => s.hostId === unifiSiteId);
        
        if (!site) {
            return res.json({
                result: {
                    checked: false,
                    message: "Could not find network in monitoring system."
                }
            });
        }

        // Extract data
        const stats = site.statistics || {};
        const counts = stats.counts || {};
        const percentages = stats.percentages || {};
        const gateway = stats.gateway || {};
        const ispInfo = stats.ispInfo || {};
        const wans = stats.wans || {};
        const internetIssues = stats.internetIssues || [];
        
        // Device counts
        const totalDevices = counts.totalDevice || 0;
        const offlineDevices = counts.offlineDevice || 0;
        const offlineGateway = counts.offlineGatewayDevice || 0;
        const pendingUpdates = counts.pendingUpdateDevice || 0;
        
        // Clients
        const wifiClients = counts.wifiClient || 0;
        const wiredClients = counts.wiredClient || 0;
        const totalClients = wifiClients + wiredClients;
        
        // WAN
        const wanUptime = percentages.wanUptime;
        const txRetry = percentages.txRetry;
        const criticalAlerts = counts.criticalNotification || 0;
        const primaryWan = wans.WAN || {};
        const externalIp = primaryWan.externalIp || null;
        const isp = primaryWan.ispInfo?.name || ispInfo.name || 'Unknown';
        
        // Issues
        const latencyIssues = internetIssues.filter(i => i.highLatency);
        const hasHighLatency = latencyIssues.length > 0;
        let avgLatency = null;
        if (hasHighLatency) {
            avgLatency = Math.round(latencyIssues.reduce((sum, i) => sum + (i.latencyAvgMs || 0), 0) / latencyIssues.length);
        }
        
        // Status
        const online = offlineGateway === 0;
        const healthy = online && offlineDevices === 0 && !hasHighLatency && criticalAlerts === 0;
        
        // Message for Sarah to speak
        let message = '';
        if (!online) {
            message = 'The network gateway is offline. This is causing the connectivity issues.';
        } else if (healthy) {
            message = 'The network looks healthy. ' + totalClients + ' devices connected, everything online.';
        } else {
            let issues = [];
            if (offlineDevices > 0) issues.push(offlineDevices + ' device(s) offline');
            if (hasHighLatency) issues.push('high latency detected');
            if (criticalAlerts > 0) issues.push(criticalAlerts + ' alert(s)');
            message = 'Network is online but has issues: ' + issues.join(', ');
        }
        
        // TRIAGE SUMMARY - Single string for LLM to include in ticket
        const triageParts = [
            '=== NETWORK DIAGNOSTICS ===',
            'Status: ' + (online ? 'ONLINE' : 'OFFLINE') + (healthy ? ' (Healthy)' : ''),
            'Gateway: ' + (gateway.shortname || 'Unknown') + ' | ISP: ' + isp,
            'WAN Uptime: ' + (wanUptime !== undefined ? wanUptime + '%' : 'N/A') + (externalIp ? ' | IP: ' + externalIp : ''),
            'Devices: ' + totalDevices + ' total, ' + offlineDevices + ' offline, ' + pendingUpdates + ' pending updates',
            'Clients: ' + totalClients + ' connected (' + wifiClients + ' WiFi, ' + wiredClients + ' wired)',
            'WiFi Retry Rate: ' + (txRetry ? txRetry.toFixed(1) + '%' : 'N/A')
        ];
        
        if (criticalAlerts > 0) triageParts.push('Critical Alerts: ' + criticalAlerts);
        if (hasHighLatency) triageParts.push('Latency Issues: avg ' + avgLatency + 'ms');
        
        const triageSummary = triageParts.join('\n');

        const timing = Date.now() - startTime;

        return res.json({
            result: {
                checked: true,
                online: online,
                healthy: healthy,
                message: message,
                
                // Single string for LLM to put in troubleshooting_notes
                triage_summary: triageSummary,
                
                // Detailed data if needed
                devices_total: totalDevices,
                devices_offline: offlineDevices,
                clients_total: totalClients,
                clients_wifi: wifiClients,
                wan_uptime: wanUptime,
                isp: isp,
                critical_alerts: criticalAlerts,
                has_latency_issues: hasHighLatency,
                
                timing_ms: timing
            }
        });

    } catch (error) {
        console.error('[Check Network] Error:', error);
        return res.json({
            result: {
                checked: false,
                message: "Unable to check network status."
            }
        });
    }
};
