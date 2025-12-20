/**
 * Lutron Shade Knowledge Base
 *
 * Comprehensive technical knowledge for field technicians
 * measuring and installing Lutron motorized shades.
 *
 * This data is used by the Voice AI to answer questions
 * and guide technicians through the measurement process.
 */

export const LUTRON_SHADE_KNOWLEDGE = {

  // ============================================
  // MEASUREMENT GUIDELINES
  // ============================================
  measurement: {
    general: {
      title: 'General Measurement Guidelines',
      rules: [
        'Always use a metal tape measure - cloth tapes stretch',
        'Measure to the nearest 1/8 inch',
        'Take 3 width measurements (top, middle, bottom) and use the SMALLEST',
        'Take height measurement and note any obstructions',
        'For inside mount: the opening must be square within 1/4 inch',
        'For outside mount: measure where the brackets will mount, not the window',
        'Document obstructions: handles, cranks, sensors, alarm contacts',
        'Take photos of each window for reference'
      ],
      tips: [
        'If widths vary more than 1/4", note it - may need outside mount',
        'Check for plumb - use a level on the sides',
        'Verify depth for inside mount (typically need 3-4" minimum)',
        'Look up for ceiling obstructions on tall windows'
      ]
    },

    insideMount: {
      title: 'Inside Mount Measurements',
      description: 'Shade mounts inside the window frame/opening',
      requirements: {
        minDepth: '3.5 inches for standard roller, 4 inches for dual',
        squareness: 'Opening must be within 1/4" square',
        clearance: 'Minimum 1" clearance from glass for inside mount'
      },
      procedure: [
        '1. Measure width at TOP of opening (bracket mounting point)',
        '2. Measure width at MIDDLE of opening',
        '3. Measure width at BOTTOM of opening',
        '4. Record the SMALLEST width - this is your shade width',
        '5. Measure height on LEFT side',
        '6. Measure height in CENTER',
        '7. Measure height on RIGHT side',
        '8. Record the SMALLEST height',
        '9. Measure depth from front of opening to back'
      ],
      deductions: {
        sivoia: 'Order shade at exact measured width - Lutron deducts automatically',
        palladiom: 'Order shade at exact measured width - Lutron deducts 3/8"',
        triathlon: 'Order shade at exact measured width'
      },
      commonIssues: [
        'Opening not square - consider outside mount',
        'Insufficient depth - need fascia or bracket extensions',
        'Window handles in the way - note for fabric clearance',
        'Uneven drywall returns - may need shimming'
      ]
    },

    outsideMount: {
      title: 'Outside Mount Measurements',
      description: 'Shade mounts on wall/ceiling outside the window opening',
      when: [
        'Window opening is not square (>1/4" variance)',
        'Insufficient depth for inside mount',
        'Want to cover more area for light blocking',
        'Multiple windows to be covered by single shade',
        'Decorative frame you want to cover'
      ],
      procedure: [
        '1. Determine mounting surface (wall or ceiling)',
        '2. Measure desired coverage width (typically 2-3" beyond opening each side)',
        '3. Mark bracket mounting points',
        '4. Measure between bracket centers for shade width',
        '5. Measure from bracket to desired bottom position for height',
        '6. Add 4" to height for roller and hem allowance'
      ],
      recommendations: {
        sideOverlap: '2-3 inches beyond opening on each side for light block',
        topOverlap: '3-4 inches above opening',
        bottomOverlap: '1-2 inches below sill or to floor'
      }
    },

    ceilingMount: {
      title: 'Ceiling Mount Measurements',
      procedure: [
        '1. Determine distance from wall to shade center line',
        '2. Verify ceiling is level at mounting points',
        '3. Check for obstructions (sprinklers, HVAC, lights)',
        '4. Measure width for shade coverage',
        '5. Measure from ceiling to desired bottom position'
      ],
      considerations: [
        'Stack height - how much shade is visible when fully open',
        'Clearance from wall - typically 1-2" minimum',
        'Ceiling material - may need toggle bolts for drywall'
      ]
    },

    pocketMount: {
      title: 'Pocket (Recessed) Mount Measurements',
      description: 'Shade headrail recessed into ceiling pocket',
      critical: [
        'Pocket WIDTH must accommodate headrail + 1/4" clearance each side',
        'Pocket DEPTH must accommodate headrail + fabric roll',
        'Pocket HEIGHT affects how much fabric can stack'
      ],
      dimensions: {
        sivoia: {
          width: 'Shade width + 1" (1/2" clearance each side)',
          depth: '4.5" minimum, 5" recommended',
          height: '4" minimum, 5" for larger shades'
        },
        palladiom: {
          width: 'Shade width + 1.5"',
          depth: '5" minimum, 6" recommended for dual',
          height: '5" minimum'
        }
      },
      procedure: [
        '1. Measure pocket opening WIDTH (inside dimension)',
        '2. Measure pocket DEPTH (front to back)',
        '3. Measure pocket HEIGHT',
        '4. Verify pocket is level and square',
        '5. Check for wiring access for hardwired shades',
        '6. Note any obstructions inside pocket'
      ]
    }
  },

  // ============================================
  // PRODUCT LINES
  // ============================================
  products: {
    sivoia: {
      name: 'Sivoia QS',
      description: 'Commercial-grade roller shades with quiet operation - multiple roller sizes available',
      technologies: ['Roller', 'Tensioned Roller', 'Drapery'],
      features: [
        'Ultra-quiet motor',
        'Precise positioning (stops at 0.125" intervals)',
        'Hardwired power (low voltage)',
        'Integrates with RadioRA 3, HomeWorks, Athena'
      ],
      rollerSizes: {
        roller20: {
          tubeDiameter: '1.25"',
          maxFabricArea: '20 sq ft',
          maxWidth: '8 ft (96")',
          pocketSize: '3.5" w x 3.5" h',
          note: 'Ultra-slim for inside mount in most residential frames'
        },
        roller64: {
          tubeDiameter: '1.625"',
          maxFabricArea: '64 sq ft',
          maxWidth: '8 ft (96")',
          pocketSize: '3.5" w x 3.5" h',
          mountDepthMin: '0.30"',
          mountDepthMax: '3.30"'
        },
        roller100: {
          tubeDiameter: '2.56"',
          maxFabricArea: '100 sq ft',
          maxWidth: '12 ft (144")',
          pocketSize: '4.75" w x 5" h'
        },
        roller150: {
          tubeDiameter: '3.00"',
          maxFabricArea: '150 sq ft',
          maxWidth: '15 ft (180")',
          pocketSize: '5.5" w x 6" h',
          note: 'Two-piece bracket design'
        },
        roller225: {
          tubeDiameter: '3.75"',
          maxFabricArea: '225 sq ft',
          maxWidth: '15 ft (180")',
          pocketSize: '7" w x 7" h',
          note: 'Heavy-duty for atriums and window walls'
        },
        roller300: {
          tubeDiameter: '4.50"',
          maxFabricArea: '300 sq ft',
          maxWidth: '15 ft (180")',
          pocketSize: '8" w x 8" h',
          note: 'Largest size for commercial applications'
        }
      },
      mountOptions: ['Ceiling', 'Wall', 'Jamb (inside)', 'Pocket', 'Fascia']
    },

    palladiom: {
      name: 'Palladiom',
      description: 'Premium architectural shading with whisper-quiet operation and carbon fiber tubes',
      features: [
        'Whisper-quiet motor',
        'Carbon fiber tube (2" diameter) - rigid yet lightweight',
        'Available in wired or wire-free (battery)',
        'Solid aluminum/brass brackets in 7 finishes',
        'Symmetrical light gaps as small as 1/2" (wired) or 3/4" (wire-free)'
      ],
      sizes: {
        wired: {
          maxWidth: '12 ft (144")',
          maxHeight: '14 ft (168")'
        },
        wireFree: {
          minWidth: '21"',
          maxWidth: '12 ft (144")',
          minHeight: '12"',
          maxHeight: '12 ft (144")'
        }
      },
      batteryLife: '3-5 years with 6 D-cell batteries',
      batteryNote: 'Uses Active Energy Optimization for extended life',
      mountDepth: {
        wireFree: 'NOT recommended for pocket/recess - need 6" clearance on room side for battery access',
        bracketCapacity: '400 lbs per bracket'
      }
    },

    triathlon: {
      name: 'Sivoia QS Triathlon',
      description: 'Battery-powered shading - great for retrofits, no wiring needed',
      features: [
        'Battery powered - no wiring required',
        'Ultra-quiet (38 dBa at 3 ft)',
        'Precise positioning (0.125" intervals)',
        'Pico remote included',
        'Battery Boost option for larger shades'
      ],
      sizes: {
        standard: {
          maxWidth: '144" (12 ft)',
          maxHeight: '144" (12 ft)'
        },
        select: {
          maxWidth: '108"',
          maxHeight: '120"'
        },
        woodBlinds: {
          maxWidth: '72"',
          maxHeight: '72"',
          note: '2" slats only, group up to 96" under one valance'
        }
      },
      batteryLife: {
        typical: '3-5 years on 36"x60" shade with 2 moves/day',
        withBoost: 'Up to 6 years (80% extension)',
        boostNote: 'Battery Boost available for shades wider than 37-5/8"'
      },
      mountDepth: {
        exposed: {
          standard: '3" depth x 4.75" height',
          WIDR: '4" depth x 4.875" height'
        },
        fascia: {
          standard: '3.375" depth x 4.9375" height',
          WIDR: '4.5" depth x 4.9375" height'
        }
      },
      mountingRequirement: 'Must mount on blocking or structural material, 75 lbs capacity per fastener'
    },

    triathlonSelect: {
      name: 'Triathlon Select',
      description: 'Entry-level battery shade with smart home integration',
      features: [
        'Works with Apple HomeKit, Alexa, Google Home',
        'Battery powered (D-cell alkaline)',
        'No hub required for basic operation',
        'Direct Bluetooth/WiFi control'
      ],
      sizes: {
        maxWidth: '108"',
        maxHeight: '120"'
      },
      batteryLife: '2 years typical'
    },

    serena: {
      name: 'Serena',
      description: 'Smart shades for residential use with broad smart home compatibility',
      features: [
        'Works with Apple HomeKit, Alexa, Google, SmartThings',
        'Battery powered',
        'Available at retail and through dealers',
        'Easy DIY installation'
      ],
      sizes: {
        maxWidth: '96"',
        maxHeight: '96"'
      },
      batteryLife: '3-5 years'
    }
  },

  // ============================================
  // HEADRAIL STYLES
  // ============================================
  headrails: {
    pocket: {
      name: 'Pocket',
      description: 'Minimal visible headrail, designed for ceiling pocket installations',
      when: ['Recessed ceiling pocket available', 'Clean minimal look desired'],
      note: 'Requires pocket with adequate depth'
    },
    fascia: {
      name: 'Fascia',
      description: 'Decorative cover that wraps around headrail',
      when: ['No pocket available', 'Want finished appearance', 'Covering multiple shades'],
      sizes: {
        small: 'Up to 96" wide',
        large: 'For larger installations'
      },
      materials: ['Aluminum (standard)', 'Wood (custom)']
    },
    fasciaWithTopBackCover: {
      name: 'Fascia + Top Back Cover',
      description: 'Fascia with additional cover to hide top and back of headrail',
      when: ['Visible from above (loft, staircase)', 'Maximum light blocking'],
      note: 'Adds about 1" to required depth'
    },
    topBackCover: {
      name: 'Top Back Cover Only',
      description: 'Cover for top of headrail without front fascia',
      when: ['Pocket mount but need to cover open top', 'Light block at top']
    }
  },

  // ============================================
  // FABRIC TYPES & SELECTION
  // ============================================
  fabrics: {
    types: {
      sheer: {
        name: 'Sheer',
        openness: '10-14%',
        features: ['View through', 'Minimal UV protection', 'Good for preserving views'],
        when: ['Want to see outside', 'Decorative layer', 'Light filtering only']
      },
      lightFiltering: {
        name: 'Light Filtering',
        openness: '3-10%',
        features: ['Reduces glare', 'Some view through', 'Good UV protection'],
        when: ['Balance of view and light control', 'General purpose']
      },
      roomDarkening: {
        name: 'Room Darkening',
        openness: '0-1%',
        features: ['Blocks most light', 'Good privacy', 'Some light at edges'],
        when: ['Media rooms', 'Bedrooms', 'Conference rooms']
      },
      blackout: {
        name: 'Blackout',
        openness: '0%',
        features: ['Total light block', 'Maximum privacy', 'Best with side channels'],
        when: ['Complete darkness needed', 'Home theaters', 'Nurseries'],
        note: 'Light can still leak at edges without side channels'
      }
    },

    considerations: {
      solarHeatGain: 'Lower openness = better heat rejection',
      glareControl: 'Lower openness = better glare control',
      viewPreservation: 'Higher openness = better outdoor view',
      uvProtection: 'All Lutron fabrics block 95%+ UV regardless of openness'
    },

    maintenance: {
      cleaning: 'Vacuum with brush attachment, spot clean with mild soap',
      doNot: ['Machine wash', 'Use bleach', 'Scrub aggressively'],
      replaceWhen: ['Visible wear/tears', 'Fading', 'No longer operating smoothly']
    }
  },

  // ============================================
  // COMMON ISSUES & TROUBLESHOOTING
  // ============================================
  troubleshooting: {
    shadeNotMoving: {
      issue: 'Shade not responding to commands',
      steps: [
        '1. Check power (battery level or hardwired connection)',
        '2. Try local Pico remote (bypasses integration)',
        '3. Check integration link status (RadioRA, HomeWorks)',
        '4. Re-pair shade to system if wireless lost',
        '5. Factory reset if needed (consult product manual)',
        '6. Check for physical obstructions'
      ],
      commonCauses: [
        'Dead battery (most common)',
        'Lost wireless pairing',
        'Integration hub offline',
        'Motor overheated - wait 30 min'
      ]
    },

    shadeNotLevel: {
      issue: 'Shade hangs crooked or uneven',
      steps: [
        '1. Check bracket mounting - are both level?',
        '2. Verify hembar is not caught or twisted',
        '3. Check for fabric binding on one side',
        '4. Adjust limit settings if one side rolls more',
        '5. Contact Lutron for motor/tube issues'
      ],
      commonCauses: [
        'Brackets not level',
        'Fabric installed twisted',
        'Hembar binding on window',
        'Motor tube alignment'
      ]
    },

    shadeMakingNoise: {
      issue: 'Unusual sounds during operation',
      types: {
        clicking: 'Often normal at start/stop, check if excessive',
        grinding: 'May indicate motor issue or debris in track',
        squeaking: 'Check for fabric rubbing on brackets or frame',
        humming: 'Normal for motor during operation'
      },
      steps: [
        '1. Listen to identify location of noise',
        '2. Check for obstructions in path',
        '3. Verify brackets are tight',
        '4. Check fabric is not rubbing',
        '5. Contact Lutron support if motor noise'
      ]
    },

    batteryLife: {
      issue: 'Battery draining quickly',
      expectedLife: {
        palladiom: '3-5 years with normal use',
        triathlon: '5+ years',
        serena: '3-5 years'
      },
      factorsAffecting: [
        'Frequency of use (more = shorter life)',
        'Shade size (larger = more power needed)',
        'Temperature extremes',
        'Integration polling frequency'
      ],
      tips: [
        'Use Pico scenes instead of frequent adjustments',
        'Set integration to poll less frequently',
        'Replace entire battery pack, not individual batteries'
      ]
    },

    fabricWrinkling: {
      issue: 'Fabric has wrinkles or creases',
      causes: [
        'Normal for new fabric - usually relaxes in 2-4 weeks',
        'Humidity changes can cause temporary wrinkling',
        'Fabric stored rolled wrong way',
        'Hembar not weighted properly'
      ],
      solutions: [
        'Lower shade fully and let hang for several days',
        'If persistent, may need tensioned system',
        'Extreme cases may require fabric replacement'
      ]
    }
  },

  // ============================================
  // QUALITY CHECKLIST
  // ============================================
  qualityChecklist: {
    beforeInstall: [
      'Verify shade matches order (size, fabric, headrail)',
      'Inspect fabric for damage or defects',
      'Check all hardware is included',
      'Confirm power source ready (outlet or wiring)',
      'Verify opening measurements match order'
    ],

    duringInstall: [
      'Brackets level and secure',
      'Shade clicks into brackets properly',
      'Fabric hangs straight without twisting',
      'Hembar is level when shade is down',
      'No rubbing on frame or window'
    ],

    afterInstall: [
      'Shade moves smoothly up and down',
      'Limits set correctly (top and bottom)',
      'Paired to control system',
      'Responds to Pico remote',
      'Responds to integration commands',
      'No unusual noises during operation',
      'Customer trained on operation'
    ],

    documentation: [
      'Take final photos showing installation',
      'Record Pico remote location',
      'Note any issues for follow-up',
      'Provide customer with care instructions'
    ]
  },

  // ============================================
  // TOLERANCE REFERENCE
  // ============================================
  tolerances: {
    measurement: {
      acceptable: '1/8 inch',
      preferred: '1/16 inch for premium work'
    },
    width: {
      m1VsM2Variance: '1/4 inch max - if more, investigate',
      actionThreshold: '1/2 inch variance requires review'
    },
    height: {
      m1VsM2Variance: '1/4 inch max',
      actionThreshold: '1/2 inch variance requires review'
    },
    squareness: {
      insideMount: '1/4 inch max diagonal difference',
      outsideMount: 'More forgiving - level brackets most important'
    }
  }
};

// Quick reference for voice AI
export const QUICK_REFERENCE = {
  // Pocket/recess dimensions by roller size
  pocketSizes: {
    'Sivoia Roller 20': '3.5" w x 3.5" h',
    'Sivoia Roller 64': '3.5" w x 3.5" h',
    'Sivoia Roller 100': '4.75" w x 5" h',
    'Sivoia Roller 150': '5.5" w x 6" h',
    'Sivoia Roller 225': '7" w x 7" h',
    'Sivoia Roller 300': '8" w x 8" h',
    'Triathlon Standard': '3" depth x 4.75" h (exposed)',
    'Triathlon WIDR': '4" depth x 4.875" h (exposed)',
    'Palladiom Wire-Free': 'NOT for pocket mount - need 6" room-side clearance'
  },

  // Maximum sizes by product
  maxSizes: {
    'Sivoia Roller 20': '8 ft wide, 20 sq ft fabric',
    'Sivoia Roller 64': '8 ft wide, 64 sq ft fabric',
    'Sivoia Roller 100': '12 ft wide, 100 sq ft fabric',
    'Sivoia Roller 150': '15 ft wide, 150 sq ft fabric',
    'Sivoia Roller 225': '15 ft wide, 225 sq ft fabric',
    'Sivoia Roller 300': '15 ft wide, 300 sq ft fabric',
    'Palladiom Wired': '12 ft wide x 14 ft tall',
    'Palladiom Wire-Free': '12 ft wide x 12 ft tall',
    'Triathlon': '12 ft x 12 ft (144" x 144")',
    'Triathlon Select': '108" x 120"',
    'Serena': '96" x 96"'
  },

  // Tube diameters for roller selection
  tubeDiameters: {
    'Roller 20': '1.25"',
    'Roller 64': '1.625"',
    'Roller 100': '2.56"',
    'Roller 150': '3.00"',
    'Roller 225': '3.75"',
    'Roller 300': '4.50"',
    'Palladiom': '2" (carbon fiber)'
  },

  deductions: {
    'Sivoia': 'Lutron deducts automatically from ordered size',
    'Palladiom': 'Lutron deducts 3/8" from ordered size',
    'Triathlon': 'Order at exact measured size'
  },

  batteryLife: {
    'Palladiom Wire-Free': '3-5 years (6 D-cells)',
    'Triathlon': '3-5 years (36"x60" @ 2 moves/day)',
    'Triathlon with Battery Boost': 'Up to 6 years',
    'Triathlon Select': '2 years',
    'Serena': '3-5 years'
  },

  // Mounting requirements
  mountingCapacity: {
    'Palladiom': '400 lbs per bracket',
    'Triathlon': '75 lbs per fastener',
    'General': 'Mount on blocking or structural material'
  },

  // Noise levels
  noiseLevel: {
    'Triathlon': '38 dBa at 3 ft',
    'Palladiom': 'Whisper quiet (quieter than Triathlon)'
  }
};

export default LUTRON_SHADE_KNOWLEDGE;
