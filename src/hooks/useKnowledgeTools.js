/**
 * useKnowledgeTools
 *
 * Provides Gemini copilot with access to:
 * 1. Notion knowledge base (SOPs, procedures, company info)
 * 2. Manufacturer product documentation
 * 3. Industry best practices (CEDIA, low-voltage standards)
 *
 * These tools are registered globally so the copilot can answer
 * technician questions at any point in the app.
 */

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';

const API_BASE = process.env.REACT_APP_API_URL || '';

// Built-in best practices database
const BEST_PRACTICES = {
  'cat6-termination': {
    topic: 'Cat6 Cable Termination',
    standard: 'TIA-568B',
    steps: [
      '1. Strip jacket 1" - avoid nicking conductors',
      '2. Untwist pairs only as needed (max 0.5" for Cat6)',
      '3. Use T568B color code: orange-white, orange, green-white, blue, blue-white, green, brown-white, brown',
      '4. Trim conductors flush with jack',
      '5. Punch down with 110 tool, cut side out',
      '6. Test with cable tester - all 8 wires must pass'
    ],
    tips: [
      'Keep pairs twisted as close to termination as possible',
      'Use Cat6 rated jacks for Cat6 cable',
      'Avoid kinks and tight bends (min 4x cable diameter)'
    ]
  },
  'poe-standards': {
    topic: 'PoE Standards Reference',
    standards: {
      '802.3af': { name: 'PoE', power: '15.4W at PSE, 12.95W at PD', voltage: '48V' },
      '802.3at': { name: 'PoE+', power: '30W at PSE, 25.5W at PD', voltage: '48V' },
      '802.3bt-type3': { name: 'PoE++ Type 3', power: '60W at PSE, 51W at PD', voltage: '48V' },
      '802.3bt-type4': { name: 'PoE++ Type 4', power: '100W at PSE, 71W at PD', voltage: '48V' }
    },
    tips: [
      'Check device PoE class before selecting switch',
      'PoE+ devices may work on PoE at reduced power',
      'Always count total PoE budget when planning'
    ]
  },
  'wifi-ap-placement': {
    topic: 'WiFi Access Point Placement',
    guidelines: [
      'Mount APs on ceiling center of coverage area',
      'Typical coverage: 1500-2500 sq ft per AP depending on model',
      'Avoid placing near metal objects, mirrors, microwaves',
      'Maintain 30-50 ft spacing in open areas',
      'Add APs for each floor (signal drops ~50% per floor)',
      'Use 5GHz for speed, 2.4GHz for range/IoT'
    ],
    channelPlanning: {
      '2.4GHz': 'Use channels 1, 6, or 11 only (non-overlapping)',
      '5GHz': 'Use channels 36-48 (low band) or 149-165 (high band)',
      '6GHz': 'WiFi 6E only - requires U6-Enterprise or similar'
    }
  },
  'shade-measuring': {
    topic: 'Motorized Shade Measurement',
    procedure: [
      '1. WIDTH - Measure at 3 points:',
      '   - Top of window opening',
      '   - Middle of window opening',
      '   - Bottom of window opening',
      '2. HEIGHT - Measure at 3 points:',
      '   - Left side',
      '   - Center',
      '   - Right side',
      '3. Note the smallest width and height (use for ordering)',
      '4. Check for obstructions: handles, cranks, sensors'
    ],
    tips: [
      'Inside mount: deduct 1/4" from smallest width',
      'Outside mount: add 3" to each side for light gap',
      'Always use metal tape measure',
      'Photograph each window for reference'
    ]
  },
  'rack-layout': {
    topic: 'Equipment Rack Layout',
    guidelines: [
      'Top: Patch panels and cable management',
      'Upper-middle: Switches and network gear',
      'Middle: Controllers (Control4, Lutron)',
      'Lower-middle: AVR and video distribution',
      'Bottom: Power conditioner and UPS',
      'Leave 1U space between heat-generating devices'
    ],
    tips: [
      'Keep 2U free for future expansion',
      'Cable manage every 12U',
      'Label all cables at both ends'
    ]
  }
};

// Common troubleshooting database
const TROUBLESHOOTING = {
  'no-internet': {
    issue: 'No Internet Connection',
    steps: [
      '1. Check if ISP is up (call provider or check status page)',
      '2. Reboot modem (unplug 30 sec, plug back in, wait 2 min)',
      '3. Check modem lights - should see solid online/internet light',
      '4. Reboot router/UDM (only after modem is online)',
      '5. Check WAN port cable connection',
      '6. Test with laptop directly connected to modem (bypass router)'
    ],
    commonCauses: [
      'ISP outage',
      'Modem needs reboot',
      'WAN cable unplugged',
      'DHCP not getting IP from ISP'
    ]
  },
  'slow-wifi': {
    issue: 'Slow WiFi Speed',
    steps: [
      '1. Run speed test on wired connection first (baseline)',
      '2. Check which band client is on (2.4 vs 5 GHz)',
      '3. Check channel utilization in UniFi/controller',
      '4. Look for interference sources (microwaves, baby monitors)',
      '5. Verify client is connecting to nearest AP',
      '6. Check for bandwidth hogs (streaming, downloads)'
    ],
    commonCauses: [
      'Client on 2.4GHz instead of 5GHz',
      'Channel congestion from neighbors',
      'Client too far from AP',
      'Old device with slow WiFi chip'
    ]
  },
  'shade-not-responding': {
    issue: 'Motorized Shade Not Responding',
    steps: [
      '1. Check power at shade motor (use voltage tester)',
      '2. Try manual control (Pico remote if available)',
      '3. Check integration link (RadioRA, Control4)',
      '4. Re-pair shade to system if wireless',
      '5. Factory reset shade motor (consult manual)',
      '6. Check for physical obstruction in track'
    ],
    commonCauses: [
      'Power supply issue',
      'RF interference',
      'Integration lost pairing',
      'Motor overheated (let cool 30 min)'
    ]
  },
  'poe-device-offline': {
    issue: 'PoE Device Offline',
    steps: [
      '1. Check switch port status (link light)',
      '2. Verify cable is plugged in at both ends',
      '3. Test cable with tester (all 8 wires needed for PoE)',
      '4. Check PoE budget on switch (may be exhausted)',
      '5. Try different switch port',
      '6. Test device with PoE injector to isolate issue'
    ],
    commonCauses: [
      'Bad cable termination',
      'PoE budget exceeded',
      'Device needs PoE+ but getting PoE',
      'Switch port disabled in software'
    ]
  }
};

export const useKnowledgeTools = () => {
  const { registerTools, unregisterTools, status } = useVoiceCopilot();
  const registeredRef = useRef(false);

  // Tool definitions
  const tools = useMemo(() => [
    // 1. Search Notion Knowledge Base
    {
      name: 'search_knowledge_base',
      description: 'Search the company knowledge base in Notion for SOPs, procedures, troubleshooting guides, and documentation. Use this when the technician asks about company procedures or needs to find documentation.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query - what to look for in the knowledge base'
          }
        },
        required: ['query']
      },
      execute: async ({ query }) => {
        try {
          const response = await fetch(`${API_BASE}/api/notion-knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search', query })
          });
          const data = await response.json();

          if (!data.success) {
            return { error: data.error || 'Search failed' };
          }

          if (data.results.length === 0) {
            return {
              message: `No results found for "${query}". Try different keywords.`,
              suggestions: ['Try broader terms', 'Check spelling', 'Search by topic area']
            };
          }

          return {
            message: `Found ${data.resultCount} results for "${query}"`,
            results: data.results.map(r => ({
              title: r.title,
              preview: r.preview?.substring(0, 200) + '...',
              pageId: r.id
            }))
          };
        } catch (error) {
          console.error('[Knowledge] Notion search error:', error);
          return { error: 'Failed to search knowledge base. Check your connection.' };
        }
      }
    },

    // 2. Get Full Page from Notion
    {
      name: 'get_knowledge_page',
      description: 'Get the full content of a specific page from the Notion knowledge base. Use this after searching to read the complete documentation.',
      parameters: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            description: 'The Notion page ID from a previous search result'
          }
        },
        required: ['pageId']
      },
      execute: async ({ pageId }) => {
        try {
          const response = await fetch(`${API_BASE}/api/notion-knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_page', pageId })
          });
          const data = await response.json();

          if (!data.success) {
            return { error: data.error || 'Failed to get page' };
          }

          return {
            title: data.title,
            content: data.content,
            url: data.url
          };
        } catch (error) {
          console.error('[Knowledge] Notion page fetch error:', error);
          return { error: 'Failed to fetch page content.' };
        }
      }
    },

    // 3. Search Manufacturer Products
    {
      name: 'search_product_info',
      description: 'Search for product information from manufacturers like Ubiquiti/UniFi, Lutron, Control4, Sonos, and Araknis. Use this when the technician asks about product specs, PoE requirements, or installation notes.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product name, model number, or description to search for'
          },
          manufacturer: {
            type: 'string',
            description: 'Optional - filter by manufacturer (ubiquiti, lutron, control4, sonos, araknis)',
            enum: ['ubiquiti', 'lutron', 'control4', 'sonos', 'araknis']
          }
        },
        required: ['query']
      },
      execute: async ({ query, manufacturer }) => {
        try {
          const response = await fetch(`${API_BASE}/api/manufacturer-docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search_product', query, manufacturer })
          });
          const data = await response.json();

          if (!data.success) {
            return { error: data.error || 'Search failed' };
          }

          if (data.results.length === 0) {
            return {
              message: `No products found matching "${query}".`,
              suggestion: 'Try the model number or a different product name.'
            };
          }

          return {
            message: `Found ${data.results.length} matching products`,
            products: data.results.map(p => ({
              name: p.name,
              type: p.type,
              manufacturer: p.manufacturerName || manufacturer,
              sku: p.sku,
              specs: p.specs
            }))
          };
        } catch (error) {
          console.error('[Knowledge] Product search error:', error);
          return { error: 'Failed to search products.' };
        }
      }
    },

    // 4. Get Detailed Product Specs
    {
      name: 'get_product_specs',
      description: 'Get detailed specifications and installation notes for a specific product. Use this when the technician needs PoE requirements, power specs, or installation guidance.',
      parameters: {
        type: 'object',
        properties: {
          manufacturer: {
            type: 'string',
            description: 'The manufacturer (ubiquiti, lutron, control4, sonos, araknis)',
            enum: ['ubiquiti', 'lutron', 'control4', 'sonos', 'araknis']
          },
          product: {
            type: 'string',
            description: 'The product SKU or model number'
          }
        },
        required: ['manufacturer', 'product']
      },
      execute: async ({ manufacturer, product }) => {
        try {
          const response = await fetch(`${API_BASE}/api/manufacturer-docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_specs', manufacturer, product })
          });
          const data = await response.json();

          if (!data.success) {
            return { error: data.error, available: data.available };
          }

          return {
            manufacturer: data.manufacturer,
            product: data.product.name,
            type: data.product.type,
            specs: data.product.specs,
            installNotes: data.product.installNotes || data.product.measurementNotes,
            docLink: data.docLink
          };
        } catch (error) {
          console.error('[Knowledge] Product specs error:', error);
          return { error: 'Failed to get product specifications.' };
        }
      }
    },

    // 5. List Available Manufacturers
    {
      name: 'list_manufacturers',
      description: 'List all available manufacturers and their product categories in the documentation database.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        try {
          const response = await fetch(`${API_BASE}/api/manufacturer-docs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list_manufacturers' })
          });
          const data = await response.json();

          if (!data.success) {
            return { error: data.error };
          }

          const manufacturers = Object.entries(data.manufacturers).map(([key, mfr]) => ({
            id: key,
            name: mfr.name,
            categories: mfr.categories,
            productCount: Object.keys(mfr.products || {}).length
          }));

          return {
            message: `${manufacturers.length} manufacturers available`,
            manufacturers
          };
        } catch (error) {
          console.error('[Knowledge] List manufacturers error:', error);
          return { error: 'Failed to list manufacturers.' };
        }
      }
    },

    // 6. Get Best Practice (Built-in)
    {
      name: 'get_best_practice',
      description: 'Get industry best practices and standards for common installation tasks like cable termination, PoE, WiFi placement, shade measuring, and rack layout.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic to get best practices for',
            enum: ['cat6-termination', 'poe-standards', 'wifi-ap-placement', 'shade-measuring', 'rack-layout']
          }
        },
        required: ['topic']
      },
      execute: async ({ topic }) => {
        const practice = BEST_PRACTICES[topic];

        if (!practice) {
          return {
            error: `Unknown topic: ${topic}`,
            availableTopics: Object.keys(BEST_PRACTICES)
          };
        }

        return {
          topic: practice.topic,
          ...practice
        };
      }
    },

    // 7. Troubleshoot Issue
    {
      name: 'troubleshoot_issue',
      description: 'Get troubleshooting steps for common issues. Checks company knowledge base first, then falls back to built-in troubleshooting guides.',
      parameters: {
        type: 'object',
        properties: {
          issue: {
            type: 'string',
            description: 'Description of the issue to troubleshoot (e.g., "no internet", "slow wifi", "shade not responding", "poe device offline")'
          }
        },
        required: ['issue']
      },
      execute: async ({ issue }) => {
        // First try to find in Notion knowledge base
        try {
          const response = await fetch(`${API_BASE}/api/notion-knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search', query: `troubleshoot ${issue}` })
          });
          const data = await response.json();

          if (data.success && data.results.length > 0) {
            // Found something in Notion - return the first result
            const topResult = data.results[0];
            return {
              source: 'knowledge_base',
              title: topResult.title,
              preview: topResult.preview,
              pageId: topResult.id,
              message: 'Found in company knowledge base. Say "read more" for full content.'
            };
          }
        } catch (error) {
          console.warn('[Knowledge] Notion search failed, using built-in:', error);
        }

        // Fall back to built-in troubleshooting
        const issueKey = issue.toLowerCase().replace(/\s+/g, '-');
        const builtIn = TROUBLESHOOTING[issueKey];

        if (builtIn) {
          return {
            source: 'built_in',
            issue: builtIn.issue,
            steps: builtIn.steps,
            commonCauses: builtIn.commonCauses
          };
        }

        // Try fuzzy match on built-in keys
        const issueLower = issue.toLowerCase();
        for (const [key, value] of Object.entries(TROUBLESHOOTING)) {
          if (issueLower.includes(key.replace(/-/g, ' ')) ||
              value.issue.toLowerCase().includes(issueLower)) {
            return {
              source: 'built_in',
              issue: value.issue,
              steps: value.steps,
              commonCauses: value.commonCauses
            };
          }
        }

        return {
          error: `No troubleshooting guide found for "${issue}".`,
          suggestion: 'Try describing the issue differently, or search the knowledge base.',
          availableGuides: Object.values(TROUBLESHOOTING).map(t => t.issue)
        };
      }
    }
  ], []);

  // Register tools when voice session becomes active
  useEffect(() => {
    const shouldRegister = ['listening', 'speaking', 'idle', 'connecting'].includes(status);

    if (shouldRegister && !registeredRef.current) {
      console.log('[useKnowledgeTools] Registering knowledge tools...');
      registerTools(tools);
      registeredRef.current = true;
    }

    // Don't unregister on cleanup - let them stay registered for the session
    // The VoiceCopilotContext will handle cleanup on session end
  }, [status, tools, registerTools]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (registeredRef.current) {
        console.log('[useKnowledgeTools] Unregistering knowledge tools...');
        unregisterTools(tools.map(t => t.name));
        registeredRef.current = false;
      }
    };
  }, [tools, unregisterTools]);

  return { tools };
};

export default useKnowledgeTools;
