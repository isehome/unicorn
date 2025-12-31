/**
 * api/retell/check-network.js
 * Check UniFi network status for a customer's project
 * Returns detailed network diagnostics for troubleshooting
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
            throw new Error('UniFi API error: ' + response.status);
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

        // Extract all the useful data
        const meta = site.meta || {};
        const stats = site.statistics || {};
        const counts = stats.counts || {};
        const percentages = stats.percentages || {};
        const gateway = stats.gateway || {};
        const ispInfo = stats.ispInfo || {};
        const wans = stats.wans || {};
        const internetIssues = stats.internetIssues || [];
        
        // Build device summary
        const totalDevices = counts.totalDevice || 0;
        const offlineDevices = counts.offlineDevice || 0;
        const offlineGateway = counts.offlineGatewayDevice || 0;
        const offlineWifi = counts.offlineWifiDevice || 0;
        const offlineWired = counts.offlineWiredDevice || 0;
        const pendingUpdates = counts.pendingUpdateDevice || 0;
        
        // Client counts
        const wifiClients = counts.wifiClient || 0;
        const wiredClients = counts.wiredClient || 0;
        const guestClients = counts.guestClient || 0;
        const totalClients = wifiClients + wiredClients;
        
        // WAN info
        const wanUptime = percentages.wanUptime;
        const txRetry = percentages.txRetry;
        const criticalAlerts = counts.criticalNotification || 0;
        
        // Get primary WAN details
        const primaryWan = wans.WAN || {};
        const externalIp = primaryWan.externalIp || null;
        const primaryWanUptime = primaryWan.wanUptime;
        const primaryIsp = primaryWan.ispInfo?.name || ispInfo.name || 'Unknown';
        
        // Check for WAN issues
        const wanIssues = primaryWan.wanIssues || [];
        const hasWanDowntime = wanIssues.some(i => i.wanDowntime);
        
        // Check for latency issues
        const latencyIssues = internetIssues.filter(i => i.highLatency);
        const hasHighLatency = latencyIssues.length > 0;
        let avgLatency = null;
        let maxLatency = null;
        if (hasHighLatency) {
            avgLatency = Math.round(latencyIssues.reduce((sum, i) => sum + (i.latencyAvgMs || 0), 0) / latencyIssues.length);
            maxLatency = Math.max(...latencyIssues.map(i => i.latencyMaxMs || 0));
        }
        
        // Determine overall status
        const online = offlineGateway === 0;
        const healthy = online && offlineDevices === 0 && !hasHighLatency && criticalAlerts === 0;
        
        // Build human-readable summary for Sarah to speak
        let spokenSummary = '';
        if (!online) {
            spokenSummary = 'The network gateway is OFFLINE. This is causing the connectivity issues.';
        } else if (healthy) {
            spokenSummary = 'The network looks healthy. ' + totalClients + ' devices are connected and everything is online.';
        } else {
            let issues = [];
            if (offlineDevices > 0) issues.push(offlineDevices + ' device' + (offlineDevices > 1 ? 's are' : ' is') + ' offline');
            if (hasHighLatency) issues.push('high latency detected (avg ' + avgLatency + 'ms)');
            if (criticalAlerts > 0) issues.push(criticalAlerts + ' critical alert' + (criticalAlerts > 1 ? 's' : ''));
            spokenSummary = 'The network is online but I see some issues: ' + issues.join(', ') + '.';
        }
        
        // Build detailed triage notes (array of separate notes)
        const triageNotes = [];
        
        // Note 1: Overall Status
        triageNotes.push({
            category: 'Network Status',
            content: 'Gateway: ' + (online ? 'ONLINE' : 'OFFLINE') + ' | ISP: ' + primaryIsp + ' | WAN Uptime: ' + (wanUptime !== undefined ? wanUptime + '%' : 'N/A') + (externalIp ? ' | Public IP: ' + externalIp : '')
        });
        
        // Note 2: Device Summary
        triageNotes.push({
            category: 'Devices',
            content: 'Total: ' + totalDevices + ' | Offline: ' + offlineDevices + (offlineWifi > 0 ? ' (WiFi APs: ' + offlineWifi + ')' : '') + (offlineWired > 0 ? ' (Switches: ' + offlineWired + ')' : '') + ' | Pending Updates: ' + pendingUpdates
        });
        
        // Note 3: Connected Clients
        triageNotes.push({
            category: 'Connected Clients',
            content: 'Total: ' + totalClients + ' | WiFi: ' + wifiClients + ' | Wired: ' + wiredClients + (guestClients > 0 ? ' | Guest: ' + guestClients : '')
        });
        
        // Note 4: Issues (only if there are any)
        if (criticalAlerts > 0 || hasHighLatency || hasWanDowntime || offlineDevices > 0) {
            let issueDetails = [];
            if (criticalAlerts > 0) issueDetails.push('Critical Alerts: ' + criticalAlerts);
            if (hasHighLatency) issueDetails.push('High Latency: avg ' + avgLatency + 'ms, max ' + maxLatency + 'ms');
            if (hasWanDowntime) issueDetails.push('WAN Downtime Detected');
            if (offlineDevices > 0) issueDetails.push('Offline Devices: ' + offlineDevices);
            if (txRetry > 15) issueDetails.push('High WiFi Retry Rate: ' + txRetry.toFixed(1) + '%');
            
            triageNotes.push({
                category: 'Issues Detected',
                content: issueDetails.join(' | ')
            });
        }
        
        // Note 5: Gateway Details
        if (gateway.shortname) {
            triageNotes.push({
                category: 'Gateway',
                content: 'Model: ' + gateway.shortname + ' | IPS: ' + (gateway.ipsMode || 'N/A')
            });
        }

        const timing = Date.now() - startTime;

        return res.json({
            result: {
                checked: true,
                online: online,
                healthy: healthy,
                
                // Summary for Sarah to speak
                message: spokenSummary,
                
                // Detailed data
                devices: {
                    total: totalDevices,
                    offline: offlineDevices,
                    offline_wifi: offlineWifi,
                    offline_wired: offlineWired,
                    pending_updates: pendingUpdates
                },
                clients: {
                    total: totalClients,
                    wifi: wifiClients,
                    wired: wiredClients,
                    guest: guestClients
                },
                wan: {
                    uptime_percent: wanUptime,
                    external_ip: externalIp,
                    isp: primaryIsp,
                    has_downtime: hasWanDowntime
                },
                issues: {
                    critical_alerts: criticalAlerts,
                    high_latency: hasHighLatency,
                    latency_avg_ms: avgLatency,
                    latency_max_ms: maxLatency,
                    wifi_retry_percent: txRetry
                },
                
                // Triage notes for ticket
                triage_notes: triageNotes,
                
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
