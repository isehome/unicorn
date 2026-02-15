/**
 * api/service/knowledge.js
 * Search knowledge base for troubleshooting steps (for Retell AI)
 *
 * Endpoint: POST /api/service/knowledge
 * Body: { topic?, query?, manufacturer? }
 */

const AZURE_SEARCH_SERVICE = process.env.AZURE_SEARCH_SERVICE_NAME || 'unicorn-rag';
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX_NAME || 'sharepoint-knowledge-index';
const API_VERSION = '2024-07-01';

// Built-in troubleshooting scripts for common issues
const TROUBLESHOOTING_SCRIPTS = {
    'wifi_down': {
        title: 'WiFi Not Working',
        steps: [
            'Check if other devices can connect to WiFi',
            'Try turning WiFi off and on on the device',
            'Check if the UniFi access points have power (look for blue LED)',
            'Try rebooting the router - unplug for 30 seconds',
            'Check if internet is working by plugging directly into router with ethernet'
        ],
        escalation: 'If still not working, may need on-site service visit'
    },
    'internet_down': {
        title: 'No Internet Connection',
        steps: [
            'Check if WiFi is connected (devices show connected but no internet)',
            'Check the modem lights - should have solid online light',
            'Reboot modem by unplugging power for 2 minutes',
            'Check for ISP outage in the area',
            'Try connecting device directly to modem with ethernet'
        ],
        escalation: 'If modem lights show offline, contact ISP'
    },
    'slow_wifi': {
        title: 'Slow WiFi Speed',
        steps: [
            'Run a speed test at speedtest.net',
            'Check how many devices are connected',
            'Move closer to the access point',
            'Check for interference from other networks',
            'Try restarting the access point'
        ],
        escalation: 'May need WiFi survey to optimize coverage'
    },
    'tv_no_signal': {
        title: 'TV No Signal',
        steps: [
            'Check that TV is on correct input (HDMI 1, 2, etc.)',
            'Check that source device (cable box, Apple TV) is powered on',
            'Try unplugging HDMI cable and reconnecting',
            'Reboot the source device',
            'Try a different HDMI input on the TV'
        ],
        escalation: 'May need to check AV receiver or replace HDMI cable'
    },
    'audio_not_working': {
        title: 'No Audio',
        steps: [
            'Check that speakers/soundbar are powered on',
            'Check volume levels on TV and audio system',
            'Verify correct audio input is selected',
            'Check if TV audio output is set to external speakers',
            'Try rebooting the audio system'
        ],
        escalation: 'May need on-site inspection of audio wiring'
    },
    'shades_not_responding': {
        title: 'Lutron Shades Not Responding',
        steps: [
            'Try the shade buttons on the wall keypad',
            'Check if shade motor has power (listen for motor sound)',
            'Try re-pairing the shade with the Pico remote',
            'Reboot the Lutron main processor',
            'Check Lutron app for device status'
        ],
        escalation: 'May need shade motor inspection or processor reset'
    },
    'control4_not_responding': {
        title: 'Control4 System Not Responding',
        steps: [
            'Check if Control4 app shows Offline',
            'Reboot your Control4 controller (power cycle)',
            'Check network connection to the controller',
            'Try using physical buttons instead of app',
            'Check if other smart home devices are working'
        ],
        escalation: 'May need Control4 system reboot or programming update'
    },
    'sonos_not_playing': {
        title: 'Sonos Not Playing',
        steps: [
            'Check if Sonos app shows your speakers',
            'Make sure phone is on same WiFi as Sonos',
            'Try playing from a different source or app',
            'Reboot the Sonos speaker (unplug for 30 seconds)',
            'Check if other Sonos speakers are working'
        ],
        escalation: 'May need Sonos network reset or speaker replacement'
    }
};

const { requireAuth } = require('../_authMiddleware');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth required — called from frontend ServiceAITest page with MSAL token
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
        // Log raw body for debugging
        console.log('[Service Knowledge] Raw body:', JSON.stringify(req.body));
        
        // Handle case where body might be nested in 'args' (Retell format)
        let body = req.body;
        if (req.body && req.body.args) {
            console.log('[Service Knowledge] Found args wrapper, unwrapping');
            body = req.body.args;
        }
        
        const { topic, query, manufacturer } = body;

        console.log('[Service Knowledge] Topic:', topic || 'none', '| Query:', query || 'none', '| Manufacturer:', manufacturer || 'all');

        // Check for built-in scripts first
        if (topic) {
            const normalizedTopic = topic.toLowerCase().replace(/[\s-]+/g, '_');
            const script = TROUBLESHOOTING_SCRIPTS[normalizedTopic];
            
            if (script) {
                console.log('[Service Knowledge] Found built-in script:', script.title);
                return res.json({
                    success: true,
                    found: true,
                    source: 'built-in',
                    result: script
                });
            }
        }

        // Fall back to Azure AI Search
        const searchQuery = query || topic;
        
        if (!searchQuery) {
            // If no query and no topic matched, return a helpful response
            console.log('[Service Knowledge] No query or matching topic');
            return res.json({
                success: true,
                found: false,
                message: 'Please describe the issue so I can help troubleshoot',
                suggestion: 'Common issues include wifi problems, TV signal issues, or audio problems'
            });
        }

        // Check Azure Search configuration
        if (!AZURE_SEARCH_API_KEY) {
            console.warn('[Service Knowledge] Azure Search not configured, returning built-in suggestion');
            return res.json({
                success: true,
                found: false,
                message: 'Knowledge base search not available',
                suggestion: 'Consider creating a support ticket for further assistance'
            });
        }

        const searchUrl = 'https://' + AZURE_SEARCH_SERVICE + '.search.windows.net/indexes/' + AZURE_SEARCH_INDEX + '/docs/search?api-version=' + API_VERSION;

        const searchBody = {
            search: searchQuery,
            queryType: 'semantic',
            semanticConfiguration: 'default',
            top: 3,
            select: 'content,metadata_spo_item_name,metadata_spo_item_path'
        };

        // Add manufacturer filter if specified
        if (manufacturer) {
            searchBody.filter = 'search.ismatch(\'' + manufacturer + '\', \'metadata_spo_item_path\')';
        }

        const azureResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_SEARCH_API_KEY
            },
            body: JSON.stringify(searchBody)
        });

        if (!azureResponse.ok) {
            const errorText = await azureResponse.text();
            console.error('[Service Knowledge] Azure search failed:', azureResponse.status, errorText);
            return res.json({
                success: true,
                found: false,
                message: 'Search temporarily unavailable',
                suggestion: 'Consider creating a support ticket for further assistance'
            });
        }

        const searchResults = await azureResponse.json();

        if (!searchResults.value || searchResults.value.length === 0) {
            console.log('[Service Knowledge] No results found');
            return res.json({
                success: true,
                found: false,
                message: 'No relevant documentation found',
                suggestion: 'Consider creating a support ticket for further assistance'
            });
        }

        console.log('[Service Knowledge] Found', searchResults.value.length, 'results from Azure');

        return res.json({
            success: true,
            found: true,
            source: 'knowledge-base',
            results: searchResults.value.map(function(r) {
                return {
                    title: r.metadata_spo_item_name,
                    content: r.content ? r.content.substring(0, 1000) : '',
                    path: r.metadata_spo_item_path
                };
            })
        });

    } catch (error) {
        console.error('[Service Knowledge] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
