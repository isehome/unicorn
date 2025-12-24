/**
 * useKnowledgeTools
 *
 * Provides Gemini copilot with access to:
 * 1. Azure AI Search knowledge base (SharePoint-indexed documentation)
 * 2. Manufacturer product documentation (Lutron, Control4, Ubiquiti, etc.)
 * 3. Industry best practices (CEDIA, low-voltage standards)
 * 4. Built-in Lutron shade expertise
 *
 * All knowledge lookups go through Azure AI Search, which indexes
 * the SharePoint Knowledge library. This provides semantic search
 * across all uploaded documentation.
 *
 * These tools are registered globally so the copilot can answer
 * technician questions at any point in the app.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/AIBrainContext';
import { LUTRON_SHADE_KNOWLEDGE, QUICK_REFERENCE } from '../data/lutronShadeKnowledge';
import { searchKnowledgeForVoice } from '../services/knowledgeService';

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
    // 1. Search Knowledge Base (Azure AI Search)
    {
      name: 'search_knowledge_base',
      description: 'Search the company knowledge base for SOPs, procedures, troubleshooting guides, manufacturer documentation, and technical specs. This searches all uploaded documentation including PDFs, manuals, and guides from manufacturers like Lutron, Control4, Ubiquiti, Sonos, Araknis, and more.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query - what to look for in the knowledge base'
          },
          manufacturer: {
            type: 'string',
            description: 'Optional - filter by manufacturer (e.g., "lutron", "control4", "ubiquiti", "sonos")'
          }
        },
        required: ['query']
      },
      execute: async ({ query, manufacturer }) => {
        try {
          console.log(`[KnowledgeTools] search_knowledge_base: "${query}" (manufacturer: ${manufacturer || 'all'})`);
          const result = await searchKnowledgeForVoice(query, manufacturer);

          if (!result.found) {
            return {
              found: false,
              message: result.message,
              suggestions: ['Try different keywords', 'Check spelling', 'Search by topic area']
            };
          }

          return {
            found: true,
            message: `Found ${result.resultCount} results for "${query}"`,
            answer: result.voiceSummary,
            documentTitle: result.documentTitle,
            manufacturer: result.manufacturer,
            relevance: `${result.relevance}% match`,
            sources: result.sources
          };
        } catch (error) {
          console.error('[Knowledge] Search error:', error);
          return { error: 'Failed to search knowledge base. Check your connection.' };
        }
      }
    },

    // 2. Get More Details on a Topic (Azure AI Search)
    {
      name: 'get_knowledge_details',
      description: 'Get more detailed information on a topic from the knowledge base. Use this when the initial search result needs more context or the user asks for more details.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic to get more details about'
          },
          documentTitle: {
            type: 'string',
            description: 'Optional - specific document title to search within'
          }
        },
        required: ['topic']
      },
      execute: async ({ topic, documentTitle }) => {
        try {
          // Search with more context to get deeper results
          const query = documentTitle ? `${topic} ${documentTitle}` : topic;
          console.log(`[KnowledgeTools] get_knowledge_details: "${query}"`);
          const result = await searchKnowledgeForVoice(query, null);

          if (!result.found) {
            return {
              found: false,
              message: `No additional details found for "${topic}".`,
              suggestion: 'Try rephrasing your question or asking about a specific aspect.'
            };
          }

          return {
            found: true,
            topic: topic,
            content: result.voiceSummary,
            documentTitle: result.documentTitle,
            manufacturer: result.manufacturer,
            sources: result.sources
          };
        } catch (error) {
          console.error('[Knowledge] Details fetch error:', error);
          return { error: 'Failed to fetch additional details.' };
        }
      }
    },

    // 3. Search Product Information (Azure AI Search)
    {
      name: 'search_product_info',
      description: 'Search for product information, specs, and installation notes from manufacturers like Ubiquiti/UniFi, Lutron, Control4, Sonos, Araknis, Josh.ai, Savant, Crestron, and more. Use this when the technician asks about product specs, PoE requirements, or installation guidance.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product name, model number, or description to search for (e.g., "U6-LR specs", "Sivoia QS max width", "Control4 EA-5 installation")'
          },
          manufacturer: {
            type: 'string',
            description: 'Optional - filter by manufacturer (e.g., "ubiquiti", "lutron", "control4", "sonos", "araknis", "josh", "savant", "crestron")'
          }
        },
        required: ['query']
      },
      execute: async ({ query, manufacturer }) => {
        try {
          // Add "product" or "specs" context to the query if not already present
          const searchQuery = query.toLowerCase().includes('spec') || query.toLowerCase().includes('product')
            ? query
            : `${query} product specifications`;

          console.log(`[KnowledgeTools] search_product_info: "${searchQuery}" (manufacturer: ${manufacturer || 'all'})`);
          const result = await searchKnowledgeForVoice(searchQuery, manufacturer);

          if (!result.found) {
            return {
              found: false,
              message: `No product information found for "${query}".`,
              suggestion: 'Try the model number or check if documentation has been uploaded.'
            };
          }

          return {
            found: true,
            message: `Found product information for "${query}"`,
            answer: result.voiceSummary,
            documentTitle: result.documentTitle,
            manufacturer: result.manufacturer,
            relevance: `${result.relevance}% match`,
            sources: result.sources
          };
        } catch (error) {
          console.error('[Knowledge] Product search error:', error);
          return { error: 'Failed to search products.' };
        }
      }
    },

    // 4. Get Detailed Product Specs (Azure AI Search)
    {
      name: 'get_product_specs',
      description: 'Get detailed specifications and installation notes for a specific product. Use when the technician needs PoE requirements, power specs, dimensions, or installation guidance.',
      parameters: {
        type: 'object',
        properties: {
          manufacturer: {
            type: 'string',
            description: 'The manufacturer (e.g., "ubiquiti", "lutron", "control4", "sonos", "araknis", "josh", "savant", "crestron")'
          },
          product: {
            type: 'string',
            description: 'The product name, SKU, or model number'
          }
        },
        required: ['product']
      },
      execute: async ({ manufacturer, product }) => {
        try {
          // Build a detailed search query
          const searchQuery = manufacturer
            ? `${manufacturer} ${product} specifications installation`
            : `${product} specifications installation`;

          console.log(`[KnowledgeTools] get_product_specs: "${searchQuery}"`);
          const result = await searchKnowledgeForVoice(searchQuery, manufacturer);

          if (!result.found) {
            return {
              found: false,
              error: `No specifications found for ${manufacturer ? manufacturer + ' ' : ''}${product}`,
              suggestion: 'Try searching with the exact model number or product name.'
            };
          }

          return {
            found: true,
            manufacturer: result.manufacturer || manufacturer,
            product: product,
            specs: result.voiceSummary,
            documentTitle: result.documentTitle,
            sources: result.sources
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
      description: 'List all available manufacturers in the knowledge base. Documentation is available for major home automation manufacturers.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        // Return the known manufacturers that have documentation in SharePoint
        // These are the folders in the SharePoint Knowledge library
        const manufacturers = [
          { name: 'Lutron', slug: 'lutron', categories: ['Shades', 'Lighting Controls', 'Keypads', 'Processors'] },
          { name: 'Control4', slug: 'control4', categories: ['Controllers', 'Drivers', 'Keypads', 'Audio'] },
          { name: 'Ubiquiti', slug: 'ubiquiti', categories: ['Access Points', 'Switches', 'Security', 'Network'] },
          { name: 'Sonos', slug: 'sonos', categories: ['Speakers', 'Amplifiers', 'Installation'] },
          { name: 'Araknis', slug: 'araknis', categories: ['Switches', 'Access Points', 'Network'] },
          { name: 'Josh.ai', slug: 'josh', categories: ['Voice Control', 'Integration'] },
          { name: 'Savant', slug: 'savant', categories: ['Controllers', 'Audio', 'Video'] },
          { name: 'Crestron', slug: 'crestron', categories: ['Control Systems', 'Audio/Video'] },
          { name: 'Snap One', slug: 'snapone', categories: ['OvrC', 'Luma', 'Episode'] },
          { name: 'Nice/ELAN', slug: 'elan', categories: ['Control Systems', 'Security'] }
        ];

        return {
          message: `${manufacturers.length} manufacturers with documentation available`,
          manufacturers: manufacturers,
          hint: 'Use search_knowledge_base or search_product_info with a manufacturer filter to find specific documentation.'
        };
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

    // 7. Troubleshoot Issue (Azure AI Search + Built-in)
    {
      name: 'troubleshoot_issue',
      description: 'Get troubleshooting steps for common issues. Searches the knowledge base first, then falls back to built-in troubleshooting guides for network, WiFi, shades, and PoE issues.',
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
        // First try to find in Azure AI Search knowledge base
        try {
          console.log(`[KnowledgeTools] troubleshoot_issue: "${issue}"`);
          const result = await searchKnowledgeForVoice(`troubleshoot ${issue}`, null);

          if (result.found) {
            return {
              source: 'knowledge_base',
              issue: issue,
              answer: result.voiceSummary,
              documentTitle: result.documentTitle,
              manufacturer: result.manufacturer,
              sources: result.sources
            };
          }
        } catch (error) {
          console.warn('[Knowledge] Azure search failed, using built-in:', error);
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
    },

    // ============================================
    // LUTRON SHADE EXPERT TOOLS
    // ============================================

    // 8. Shade Measurement Guidance
    {
      name: 'get_shade_measurement_guide',
      description: 'Get detailed measurement guidance for Lutron shades. Use when tech asks about how to measure, mount types, or measurement procedures.',
      parameters: {
        type: 'object',
        properties: {
          mountType: {
            type: 'string',
            description: 'The mount type to get guidance for',
            enum: ['inside', 'outside', 'ceiling', 'pocket', 'general']
          }
        },
        required: ['mountType']
      },
      execute: async ({ mountType }) => {
        const guides = LUTRON_SHADE_KNOWLEDGE.measurement;
        const key = mountType === 'inside' ? 'insideMount' :
                    mountType === 'outside' ? 'outsideMount' :
                    mountType === 'ceiling' ? 'ceilingMount' :
                    mountType === 'pocket' ? 'pocketMount' : 'general';

        const guide = guides[key];
        if (!guide) {
          return {
            error: `No guide for mount type: ${mountType}`,
            availableTypes: ['inside', 'outside', 'ceiling', 'pocket', 'general']
          };
        }

        return {
          ...guide,
          hint: 'Walk the tech through the procedure steps one at a time'
        };
      }
    },

    // 9. Shade Product Info
    {
      name: 'get_shade_product_info',
      description: 'Get technical specs and info about Lutron shade products (Sivoia, Palladiom, Triathlon, Serena). Use when tech asks about product features, sizes, or capabilities.',
      parameters: {
        type: 'object',
        properties: {
          product: {
            type: 'string',
            description: 'The Lutron shade product line',
            enum: ['sivoia', 'palladiom', 'triathlon', 'serena']
          }
        },
        required: ['product']
      },
      execute: async ({ product }) => {
        const productInfo = LUTRON_SHADE_KNOWLEDGE.products[product];
        if (!productInfo) {
          return {
            error: `Unknown product: ${product}`,
            availableProducts: Object.keys(LUTRON_SHADE_KNOWLEDGE.products)
          };
        }

        return {
          ...productInfo,
          quickRef: {
            maxSize: QUICK_REFERENCE.maxSizes[productInfo.name] || QUICK_REFERENCE.maxSizes[`${productInfo.name} Standard Motor`],
            mountDepth: QUICK_REFERENCE.mountDepths[`${productInfo.name} Standard`] || productInfo.mountDepth?.minimum,
            batteryLife: QUICK_REFERENCE.batteryLife[productInfo.name]
          }
        };
      }
    },

    // 10. Headrail Style Info
    {
      name: 'get_headrail_info',
      description: 'Get information about Lutron headrail styles (pocket, fascia, top back cover). Use when tech asks about headrail options or which to use.',
      parameters: {
        type: 'object',
        properties: {
          style: {
            type: 'string',
            description: 'The headrail style',
            enum: ['pocket', 'fascia', 'fasciaWithTopBackCover', 'topBackCover', 'all']
          }
        },
        required: ['style']
      },
      execute: async ({ style }) => {
        if (style === 'all') {
          return {
            styles: Object.entries(LUTRON_SHADE_KNOWLEDGE.headrails).map(([key, value]) => ({
              id: key,
              name: value.name,
              description: value.description,
              when: value.when
            })),
            hint: 'Explain each option and when to use it'
          };
        }

        const info = LUTRON_SHADE_KNOWLEDGE.headrails[style];
        if (!info) {
          return {
            error: `Unknown headrail style: ${style}`,
            availableStyles: Object.keys(LUTRON_SHADE_KNOWLEDGE.headrails)
          };
        }

        return info;
      }
    },

    // 11. Fabric Type Info
    {
      name: 'get_fabric_info',
      description: 'Get information about Lutron shade fabric types (sheer, light filtering, room darkening, blackout). Use when tech asks about fabric selection or light control.',
      parameters: {
        type: 'object',
        properties: {
          fabricType: {
            type: 'string',
            description: 'The fabric type',
            enum: ['sheer', 'lightFiltering', 'roomDarkening', 'blackout', 'all']
          }
        },
        required: ['fabricType']
      },
      execute: async ({ fabricType }) => {
        if (fabricType === 'all') {
          return {
            types: Object.entries(LUTRON_SHADE_KNOWLEDGE.fabrics.types).map(([key, value]) => ({
              id: key,
              name: value.name,
              openness: value.openness,
              features: value.features
            })),
            considerations: LUTRON_SHADE_KNOWLEDGE.fabrics.considerations
          };
        }

        const info = LUTRON_SHADE_KNOWLEDGE.fabrics.types[fabricType];
        if (!info) {
          return {
            error: `Unknown fabric type: ${fabricType}`,
            availableTypes: Object.keys(LUTRON_SHADE_KNOWLEDGE.fabrics.types)
          };
        }

        return {
          ...info,
          considerations: LUTRON_SHADE_KNOWLEDGE.fabrics.considerations
        };
      }
    },

    // 12. Shade Troubleshooting
    {
      name: 'troubleshoot_shade',
      description: 'Get troubleshooting steps for common Lutron shade issues. Use when tech reports a problem with a shade.',
      parameters: {
        type: 'object',
        properties: {
          issue: {
            type: 'string',
            description: 'The issue type',
            enum: ['notMoving', 'notLevel', 'makingNoise', 'batteryLife', 'fabricWrinkling']
          }
        },
        required: ['issue']
      },
      execute: async ({ issue }) => {
        const issueKey = issue === 'notMoving' ? 'shadeNotMoving' :
                        issue === 'notLevel' ? 'shadeNotLevel' :
                        issue === 'makingNoise' ? 'shadeMakingNoise' :
                        issue === 'batteryLife' ? 'batteryLife' :
                        issue === 'fabricWrinkling' ? 'fabricWrinkling' : issue;

        const troubleshooting = LUTRON_SHADE_KNOWLEDGE.troubleshooting[issueKey];
        if (!troubleshooting) {
          return {
            error: `Unknown issue type: ${issue}`,
            availableIssues: Object.keys(LUTRON_SHADE_KNOWLEDGE.troubleshooting),
            hint: 'Try describing the problem in more detail'
          };
        }

        return {
          ...troubleshooting,
          hint: 'Walk through the steps one at a time with the tech'
        };
      }
    },

    // 13. Quality Checklist
    {
      name: 'get_quality_checklist',
      description: 'Get quality control checklist for shade installation. Use to ensure installation meets standards.',
      parameters: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            description: 'Which phase of installation',
            enum: ['beforeInstall', 'duringInstall', 'afterInstall', 'documentation', 'all']
          }
        },
        required: ['phase']
      },
      execute: async ({ phase }) => {
        if (phase === 'all') {
          return LUTRON_SHADE_KNOWLEDGE.qualityChecklist;
        }

        const checklist = LUTRON_SHADE_KNOWLEDGE.qualityChecklist[phase];
        if (!checklist) {
          return {
            error: `Unknown phase: ${phase}`,
            availablePhases: Object.keys(LUTRON_SHADE_KNOWLEDGE.qualityChecklist)
          };
        }

        return {
          phase,
          items: checklist,
          hint: 'Go through each item with the tech to verify'
        };
      }
    },

    // 14. Quick Reference Lookup
    {
      name: 'shade_quick_reference',
      description: 'Quick lookup for common shade specs: mount depths, max sizes, deductions, battery life. Use for quick answers.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'What to look up',
            enum: ['mountDepths', 'maxSizes', 'deductions', 'batteryLife', 'tolerances']
          },
          product: {
            type: 'string',
            description: 'Optional - specific product to look up'
          }
        },
        required: ['category']
      },
      execute: async ({ category, product }) => {
        if (category === 'tolerances') {
          return LUTRON_SHADE_KNOWLEDGE.tolerances;
        }

        const data = QUICK_REFERENCE[category];
        if (!data) {
          return {
            error: `Unknown category: ${category}`,
            availableCategories: Object.keys(QUICK_REFERENCE)
          };
        }

        if (product) {
          // Try to find a match for the product
          const productLower = product.toLowerCase();
          const match = Object.entries(data).find(([key]) =>
            key.toLowerCase().includes(productLower)
          );

          if (match) {
            return { [match[0]]: match[1] };
          }

          return {
            message: `No exact match for "${product}"`,
            allValues: data
          };
        }

        return data;
      }
    },

    // ============================================
    // ADDITIONAL SEARCH ALIAS
    // ============================================

    // 15. Search Manufacturer Docs (alias for search_knowledge_base with different wording)
    // Kept for backward compatibility and to give the AI multiple entry points
    {
      name: 'search_manufacturer_docs',
      description: 'Search uploaded manufacturer documentation. Same as search_knowledge_base but named differently for when tech asks specifically about "manufacturer docs" or "uploaded documentation".',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to search for in the documentation (e.g., "lutron roller shade installation", "control4 driver configuration", "ubiquiti ap mounting")'
          },
          manufacturer: {
            type: 'string',
            description: 'Optional - filter by manufacturer slug (e.g., "lutron", "control4", "ubiquiti", "sonos", "araknis", "josh", "savant", "crestron")'
          }
        },
        required: ['query']
      },
      execute: async ({ query, manufacturer }) => {
        try {
          console.log(`[KnowledgeTools] Searching docs: "${query}" (manufacturer: ${manufacturer || 'all'})`);

          const result = await searchKnowledgeForVoice(query, manufacturer);

          if (!result.found) {
            return {
              found: false,
              message: result.message,
              suggestion: 'Try different keywords or check if documentation has been uploaded for this topic.'
            };
          }

          return {
            found: true,
            answer: result.voiceSummary,
            documentTitle: result.documentTitle,
            manufacturer: result.manufacturer,
            relevance: `${result.relevance}% match`,
            sources: result.sources,
            resultCount: result.resultCount,
            hint: 'Read the answer to the tech. They can ask follow-up questions.'
          };
        } catch (error) {
          console.error('[KnowledgeTools] Search error:', error);
          return {
            found: false,
            error: 'Failed to search documentation',
            suggestion: 'Try searching the built-in knowledge tools instead.'
          };
        }
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
