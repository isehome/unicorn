/**
 * Manufacturer Documentation API
 * 
 * Provides access to product specs, installation guides, and 
 * troubleshooting info from manufacturers commonly used by IS.
 * 
 * Sources:
 * - Ubiquiti (UniFi) - ui.com
 * - Lutron - lutron.com
 * - Control4 - control4.com
 * - Sonos - sonos.com
 * - And more...
 */

const { requireAuth } = require('./_authMiddleware');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required
  const user = await requireAuth(req, res);
  if (!user) return;

  const { action, manufacturer, product, query } = req.body;

  try {
    switch (action) {
      case 'search_product':
        return await searchProduct(res, manufacturer, query);
      
      case 'get_specs':
        return await getProductSpecs(res, manufacturer, product);
      
      case 'list_manufacturers':
        return res.status(200).json({ 
          success: true, 
          manufacturers: MANUFACTURERS 
        });
      
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('[Manufacturer API Error]', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Manufacturer configurations
 * Add API keys and endpoints as you get access
 */
const MANUFACTURERS = {
  ubiquiti: {
    name: 'Ubiquiti (UniFi)',
    categories: ['networking', 'wireless', 'cameras', 'access'],
    docBase: 'https://help.ui.com',
    products: {
      // Access Points
      'U6-Enterprise': {
        name: 'UniFi 6 Enterprise',
        type: 'Access Point',
        specs: {
          wifi: 'WiFi 6E (6 GHz)',
          maxSpeed: '10.2 Gbps aggregate',
          poe: '802.3at PoE+ (48V, 0.5A)',
          power: '25W max',
          mounting: 'Ceiling/Wall',
          ports: '2.5 GbE uplink'
        },
        installNotes: [
          'Requires PoE+ switch or injector (802.3at)',
          'For 6 GHz, ensure country allows and clients support',
          'Minimum 20m spacing for enterprise density',
          'Use UniFi Network 7.x+ for full features'
        ]
      },
      'U6-Pro': {
        name: 'UniFi 6 Pro',
        type: 'Access Point',
        specs: {
          wifi: 'WiFi 6 (802.11ax)',
          maxSpeed: '5.3 Gbps aggregate',
          poe: '802.3at PoE+ (48V, 0.3A)',
          power: '13W typical',
          mounting: 'Ceiling/Wall',
          ports: 'GbE uplink'
        },
        installNotes: [
          'Requires PoE+ switch or injector',
          'Good for 1500-2000 sq ft coverage',
          'Recommended for most residential installs'
        ]
      },
      'U6-Lite': {
        name: 'UniFi 6 Lite',
        type: 'Access Point',
        specs: {
          wifi: 'WiFi 6 (802.11ax)',
          maxSpeed: '1.5 Gbps aggregate',
          poe: '802.3af PoE (48V, 0.2A)',
          power: '12W max',
          mounting: 'Ceiling/Wall',
          ports: 'GbE uplink'
        },
        installNotes: [
          'Standard PoE (802.3af) - works with most switches',
          'Good for 1000-1500 sq ft coverage',
          'Budget-friendly option for smaller spaces'
        ]
      },
      // Switches
      'USW-Pro-48-PoE': {
        name: 'UniFi Switch Pro 48 PoE',
        type: 'Switch',
        specs: {
          ports: '48x GbE PoE+, 4x 10G SFP+',
          poeTotal: '600W PoE budget',
          layer: 'Layer 3',
          management: 'UniFi Network'
        },
        installNotes: [
          'Can power up to 48 PoE devices',
          'Use SFP+ ports for uplinks to UDM',
          'Rack mount - 1U height'
        ]
      },
      'USW-Pro-24-PoE': {
        name: 'UniFi Switch Pro 24 PoE',
        type: 'Switch',
        specs: {
          ports: '24x GbE PoE+, 2x 10G SFP+',
          poeTotal: '400W PoE budget',
          layer: 'Layer 3',
          management: 'UniFi Network'
        },
        installNotes: [
          'Good for medium deployments',
          '400W budget for PoE devices',
          'Rack mount - 1U height'
        ]
      },
      'USW-Lite-16-PoE': {
        name: 'UniFi Switch Lite 16 PoE',
        type: 'Switch',
        specs: {
          ports: '16x GbE (8 PoE+)',
          poeTotal: '45W PoE budget',
          layer: 'Layer 2',
          management: 'UniFi Network'
        },
        installNotes: [
          'Compact desktop switch',
          '8 ports support PoE+',
          'Good for small closets'
        ]
      },
      // Gateways
      'UDM-Pro': {
        name: 'UniFi Dream Machine Pro',
        type: 'Gateway/Controller',
        specs: {
          throughput: '3.5 Gbps IDS/IPS',
          ports: '8x GbE LAN, 1x 10G SFP+ WAN',
          storage: '3.5" HDD bay for Protect',
          apps: 'Network, Protect, Access, Talk'
        },
        installNotes: [
          'All-in-one controller and gateway',
          'Mount in rack (1U)',
          'Add HDD for camera recordings'
        ]
      },
      'UDM-SE': {
        name: 'UniFi Dream Machine SE',
        type: 'Gateway/Controller',
        specs: {
          throughput: '3.5 Gbps IDS/IPS',
          ports: '8x GbE PoE LAN, 1x 2.5G PoE WAN, 1x 10G SFP+ WAN',
          poeTotal: '130W PoE budget',
          storage: '3.5" HDD bay for Protect',
          apps: 'Network, Protect, Access, Talk'
        },
        installNotes: [
          'Built-in PoE switch - no separate switch needed for small installs',
          'Best for projects with < 8 PoE devices',
          'Mount in rack (1U)'
        ]
      },
      // Cameras
      'G4-Pro': {
        name: 'UniFi Protect G4 Pro',
        type: 'Camera',
        specs: {
          resolution: '4K (8MP)',
          poe: '802.3at PoE+ required',
          power: '12.5W max',
          ir: '25m night vision',
          audio: 'Built-in mic and speaker',
          weatherproof: 'IP67'
        },
        installNotes: [
          'High-end camera - use for main entrances',
          'Requires PoE+ (802.3at)',
          'Requires UDM-Pro/SE or NVR for recording'
        ]
      },
      'G4-Bullet': {
        name: 'UniFi Protect G4 Bullet',
        type: 'Camera',
        specs: {
          resolution: '4MP (1440p)',
          poe: '802.3af PoE',
          power: '4W typical',
          ir: '25m night vision',
          weatherproof: 'IP67'
        },
        installNotes: [
          'Standard PoE - works with most switches',
          'Good all-around camera',
          'Easy outdoor mounting'
        ]
      }
    }
  },

  lutron: {
    name: 'Lutron',
    categories: ['shades', 'lighting', 'keypads'],
    docBase: 'https://www.lutron.com/en-US/pages/SupportCenter',
    products: {
      'Palladiom': {
        name: 'Palladiom Shading System',
        type: 'Motorized Shades',
        specs: {
          motorType: 'Quiet Electronic Drive (QED)',
          powerOptions: ['Wired 24V DC', 'PoE (select models)', 'Battery'],
          maxWidth: '144" (single shade)',
          fabricTypes: ['Roller', 'Honeycomb', 'Roman', 'Drapery']
        },
        measurementNotes: [
          'Always measure width at 3 points (top, middle, bottom)',
          'Height measured from mounting surface to sill',
          'Inside mount: deduct 1/4" from width for clearance',
          'Note any obstructions (handles, cranks, sensors)'
        ]
      },
      'Sivoia-QS': {
        name: 'Sivoia QS Shades',
        type: 'Motorized Shades',
        specs: {
          motorType: 'Quiet Electronic Drive (QED)',
          powerOptions: ['Wired 24V DC', 'PoE', 'Battery (Triathlon)'],
          maxWidth: '192" (coupled)',
          protocol: 'QS wired or wireless',
          fabricTypes: ['Roller', 'Honeycomb', 'Roman', 'Drapery', 'Tensioned']
        },
        installNotes: [
          'Wire home runs to shade locations during rough-in',
          'Low-voltage (24V) - no electrician needed',
          'Can couple multiple shades for wide openings'
        ]
      },
      'Triathlon': {
        name: 'Sivoia QS Triathlon',
        type: 'Battery Motorized Shades',
        specs: {
          motorType: 'Battery-powered (Triathlon)',
          battery: 'Rechargeable lithium-ion',
          batteryLife: '3-5 years typical',
          protocol: 'Wireless only',
          charging: 'USB-C or solar panel'
        },
        installNotes: [
          'No wiring required - retrofit friendly',
          'Battery lasts 3-5 years with normal use',
          'Solar panel option for hard-to-reach shades'
        ]
      },
      'RadioRA3': {
        name: 'RadioRA 3',
        type: 'Lighting Control',
        specs: {
          protocol: 'Clear Connect RF (434 MHz)',
          maxDevices: '100 per processor',
          integration: 'Control4, Savant, Crestron, Sonos',
          processor: 'RA3 Processor required'
        },
        installNotes: [
          'Requires RA3 Processor as brain',
          'Use Pico remotes for easy scene control',
          'Program with Lutron Designer software'
        ]
      },
      'Caseta': {
        name: 'Caseta Wireless',
        type: 'Lighting Control',
        specs: {
          protocol: 'Clear Connect RF',
          maxDevices: '75 devices per bridge',
          integration: 'HomeKit, Alexa, Google',
          bridge: 'Smart Bridge or Smart Bridge Pro'
        },
        installNotes: [
          'DIY-friendly installation',
          'Smart Bridge Pro for integration with Control4/Sonos',
          'Pico remotes work without neutral wire'
        ]
      },
      'Pico-Remote': {
        name: 'Pico Remote',
        type: 'Remote Control',
        specs: {
          buttons: '2-button, 3-button, or 4-button options',
          battery: 'CR2032 (10-year life)',
          mounting: 'Table stand, wall plate, or portable'
        },
        installNotes: [
          'Battery included and lasts 10+ years',
          'Can mount with wall plate for switch appearance',
          'Program scenes using Lutron app'
        ]
      }
    }
  },

  control4: {
    name: 'Control4',
    categories: ['automation', 'av', 'lighting'],
    docBase: 'https://dealer.control4.com',
    requiresDealer: true,
    products: {
      'CA-1': {
        name: 'CA-1 Automation Controller',
        type: 'Controller',
        specs: {
          zigbee: '250 devices',
          audio: '1 HDMI output',
          network: 'Dual NIC',
          ram: '2GB'
        },
        installNotes: [
          'Entry-level controller',
          'Good for basic automation projects',
          'Can control lights, locks, thermostats'
        ]
      },
      'EA-5': {
        name: 'EA-5 Entertainment Controller',
        type: 'Controller',
        specs: {
          audio: '6 zone audio matrix',
          video: '4K HDR passthrough',
          zigbee: '500 devices',
          ram: '4GB'
        },
        installNotes: [
          'Full-featured entertainment controller',
          'Built-in 6-zone audio matrix',
          'Use for projects with distributed audio'
        ]
      },
      'EA-3': {
        name: 'EA-3 Controller',
        type: 'Controller',
        specs: {
          audio: 'Audio over IP support',
          video: '4K HDR passthrough',
          zigbee: '400 devices',
          ram: '4GB'
        },
        installNotes: [
          'Mid-range controller',
          'Good balance of features and cost',
          'Supports Triad audio'
        ]
      },
      'T4-8': {
        name: 'T4 8" In-Wall Touchscreen',
        type: 'Touch Panel',
        specs: {
          display: '8" capacitive touchscreen',
          mounting: 'In-wall (2-gang box)',
          poe: '802.3af PoE powered',
          camera: 'Built-in camera for intercom'
        },
        installNotes: [
          'Mount in 2-gang electrical box',
          'Powered via PoE - run Cat6 to location',
          'Includes intercom with door stations'
        ]
      }
    }
  },

  sonos: {
    name: 'Sonos',
    categories: ['audio', 'streaming'],
    docBase: 'https://support.sonos.com',
    products: {
      'Port': {
        name: 'Sonos Port',
        type: 'Streaming Component',
        specs: {
          outputs: 'RCA line-out, digital coax',
          input: 'RCA line-in (auto-detect)',
          network: 'Ethernet or WiFi',
          airplay: 'AirPlay 2'
        },
        installNotes: [
          'Use for connecting to existing amps/receivers',
          'Line-in allows streaming from turntables, etc.',
          'Prefer Ethernet connection for reliability'
        ]
      },
      'Amp': {
        name: 'Sonos Amp',
        type: 'Streaming Amplifier',
        specs: {
          power: '125W x 2 @ 8 ohm',
          hdmi: 'HDMI ARC input',
          subOut: 'Yes',
          speakers: '4-8 ohm compatible'
        },
        installNotes: [
          'Powers passive speakers directly',
          'Use HDMI ARC for TV audio',
          'Can add subwoofer via RCA out'
        ]
      },
      'Era-300': {
        name: 'Sonos Era 300',
        type: 'Spatial Audio Speaker',
        specs: {
          drivers: '6 drivers with Dolby Atmos',
          connectivity: 'WiFi, Bluetooth, Line-in (adapter)',
          voiceControl: 'Alexa built-in, works with Google',
          airplay: 'AirPlay 2'
        },
        installNotes: [
          'Best placement: 2-3 feet from walls',
          'Pair two for stereo spatial audio',
          'Use for rooms where ceiling speakers not possible'
        ]
      },
      'Era-100': {
        name: 'Sonos Era 100',
        type: 'Compact Speaker',
        specs: {
          drivers: '2 tweeters, 1 woofer',
          connectivity: 'WiFi, Bluetooth, Line-in (adapter)',
          voiceControl: 'Alexa built-in',
          airplay: 'AirPlay 2'
        },
        installNotes: [
          'Good for bedrooms, offices, smaller rooms',
          'Can be used as surround speakers',
          'Bluetooth allows easy phone pairing'
        ]
      }
    }
  },

  araknis: {
    name: 'Araknis Networks',
    categories: ['networking', 'wireless'],
    docBase: 'https://www.araknisnetworks.com/support',
    products: {
      'AN-310-SW-24-POE': {
        name: 'Araknis 310 24-Port PoE Switch',
        type: 'Switch',
        specs: {
          ports: '24x GbE PoE+, 2x SFP',
          poeTotal: '370W PoE budget',
          layer: 'Layer 2+',
          management: 'OvrC cloud managed'
        },
        installNotes: [
          'Works with OvrC for remote management',
          'Good for residential AV installs',
          'Front-facing ports for rack access'
        ]
      },
      'AN-510-AP-I': {
        name: 'Araknis 510 Indoor Access Point',
        type: 'Access Point',
        specs: {
          wifi: 'WiFi 5 (802.11ac)',
          maxSpeed: '1.3 Gbps',
          poe: '802.3af PoE',
          mounting: 'Ceiling'
        },
        installNotes: [
          'Standard PoE (802.3af)',
          'OvrC managed for remote support',
          'Good coverage for typical rooms'
        ]
      },
      'AN-310-RT-4L2W': {
        name: 'Araknis 310 Router',
        type: 'Router/Gateway',
        specs: {
          wan: '2x GbE WAN (failover)',
          lan: '4x GbE LAN',
          vpn: 'OpenVPN, L2TP, PPTP',
          management: 'OvrC cloud managed'
        },
        installNotes: [
          'Dual WAN for internet failover',
          'OvrC enables remote troubleshooting',
          'Good for residential installs'
        ]
      }
    }
  }
};

/**
 * Search for product info
 */
async function searchProduct(res, manufacturer, query) {
  const mfr = MANUFACTURERS[manufacturer?.toLowerCase()];
  
  if (!manufacturer) {
    // Search across all manufacturers
    const results = [];
    for (const [key, mfrData] of Object.entries(MANUFACTURERS)) {
      for (const [sku, product] of Object.entries(mfrData.products || {})) {
        if (
          sku.toLowerCase().includes(query.toLowerCase()) ||
          product.name.toLowerCase().includes(query.toLowerCase())
        ) {
          results.push({
            manufacturer: key,
            manufacturerName: mfrData.name,
            sku,
            ...product
          });
        }
      }
    }
    return res.status(200).json({ success: true, results });
  }
  
  if (!mfr) {
    return res.status(404).json({ 
      error: `Unknown manufacturer: ${manufacturer}`,
      available: Object.keys(MANUFACTURERS)
    });
  }

  // Search within manufacturer
  const results = [];
  for (const [sku, product] of Object.entries(mfr.products || {})) {
    if (
      sku.toLowerCase().includes(query.toLowerCase()) ||
      product.name.toLowerCase().includes(query.toLowerCase())
    ) {
      results.push({ sku, ...product });
    }
  }
  
  return res.status(200).json({ 
    success: true,
    manufacturer: mfr.name,
    results 
  });
}

/**
 * Get detailed product specs
 */
async function getProductSpecs(res, manufacturer, product) {
  const mfr = MANUFACTURERS[manufacturer?.toLowerCase()];
  if (!mfr) {
    return res.status(404).json({ error: 'Unknown manufacturer' });
  }

  const productData = mfr.products?.[product];
  if (!productData) {
    return res.status(404).json({ 
      error: `Product not found: ${product}`,
      available: Object.keys(mfr.products || {})
    });
  }

  return res.status(200).json({
    success: true,
    manufacturer: mfr.name,
    product: productData,
    docLink: `${mfr.docBase}/${product}`
  });
}
