/**
 * api/retell/check-network.js
 * Check UniFi network status and store results for ticket creation
 */
const { createClient } = require('@supabase/supabase-js');

const UNIFI_API_KEY = process.env.UNIFI_API_KEY || process.env.REACT_APP_UNIFI_API_KEY;
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
        
        const unifiSiteId = body.unifi_site_id || body.site_id;
        
        if (!unifiSiteId) {
            return res.json({
                result: { checked: false, message: "No UniFi site configured for this customer." }
            });
        }

        if (!UNIFI_API_KEY) {
            return res.json({
                result: { checked: false, message: "Network monitoring not configured." }
            });
        }

        console.log('[Check Network] Site:', unifiSiteId);

        const response = await fetch('https://api.ui.com/v1/sites', {
            headers: { 'X-API-KEY': UNIFI_API_KEY, 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error('UniFi API error: ' + response.status);

        const data = await response.json();
        const site = (data.data || []).find(s => s.hostId === unifiSiteId);
        
        if (!site) {
            return res.json({
                result: { checked: false, message: "Could not find network in monitoring system." }
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
        
        const totalDevices = counts.totalDevice || 0;
        const offlineDevices = counts.offlineDevice || 0;
        const offlineGateway = counts.offlineGatewayDevice || 0;
        const pendingUpdates = counts.pendingUpdateDevice || 0;
        const wifiClients = counts.wifiClient || 0;
        const wiredClients = counts.wiredClient || 0;
        const totalClients = wifiClients + wiredClients;
        const wanUptime = percentages.wanUptime;
        const txRetry = percentages.txRetry;
        const criticalAlerts = counts.criticalNotification || 0;
        const primaryWan = wans.WAN || {};
        const externalIp = primaryWan.externalIp || null;
        const isp = primaryWan.ispInfo?.name || ispInfo.name || 'Unknown';
        
        const latencyIssues = internetIssues.filter(i => i.highLatency);
        const hasHighLatency = latencyIssues.length > 0;
        let avgLatency = null;
        if (hasHighLatency) {
            avgLatency = Math.round(latencyIssues.reduce((sum, i) => sum + (i.latencyAvgMs || 0), 0) / latencyIssues.length);
        }
        
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
        
        // Build triage summary
        const triageSummary = [
            '=== NETWORK DIAGNOSTICS (Remote Check) ===',
            'Status: ' + (online ? 'ONLINE' : 'OFFLINE') + (healthy ? ' (Healthy)' : ''),
            'Gateway: ' + (gateway.shortname || 'Unknown') + ' | ISP: ' + isp,
            'WAN Uptime: ' + (wanUptime !== undefined ? wanUptime + '%' : 'N/A') + (externalIp ? ' | IP: ' + externalIp : ''),
            'Devices: ' + totalDevices + ' total, ' + offlineDevices + ' offline, ' + pendingUpdates + ' pending updates',
            'Clients: ' + totalClients + ' connected (' + wifiClients + ' WiFi, ' + wiredClients + ' wired)',
            'WiFi Retry Rate: ' + (txRetry ? txRetry.toFixed(1) + '%' : 'N/A'),
            criticalAlerts > 0 ? 'Critical Alerts: ' + criticalAlerts : null,
            hasHighLatency ? 'Latency: avg ' + avgLatency + 'ms' : null
        ].filter(Boolean).join('\n');

        // Store diagnostics temporarily keyed by site ID
        // create-ticket will look this up
        try {
            await supabase.from('retell_network_cache').upsert({
                site_id: unifiSiteId,
                diagnostics: triageSummary,
                created_at: new Date().toISOString()
            }, { onConflict: 'site_id' });
        } catch (e) {
            // Table might not exist yet, that's ok
            console.log('[Check Network] Cache write skipped:', e.message);
        }

        return res.json({
            result: {
                checked: true,
                online,
                healthy,
                message,
                triage_summary: triageSummary,
                timing_ms: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('[Check Network] Error:', error);
        return res.json({
            result: { checked: false, message: "Unable to check network status." }
        });
    }
};
