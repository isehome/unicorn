/**
 * VoiceToolRegistry - Centralized registry for all voice AI tools
 *
 * This provides a scalable architecture for voice tools across the entire app:
 *
 * 1. TOOL CATEGORIES - Tools are organized by category (navigation, prewire, shades, equipment, etc.)
 * 2. CONTEXT FILTERING - Tools can specify which pages/contexts they're available on
 * 3. AUTOMATIC DECLARATIONS - All tools are declared to Gemini at session start
 * 4. DYNAMIC EXECUTION - Only tools registered for current page are executable
 *
 * Usage:
 * - Page components call registerPageTools() to add their tools
 * - VoiceCopilotContext calls getAllToolDeclarations() at session start
 * - Tool execution checks if tool is active for current context
 */

// Tool categories for organization and documentation
export const TOOL_CATEGORIES = {
    NAVIGATION: 'navigation',      // Global navigation (always available)
    PREWIRE: 'prewire',           // Wire drop printing/photos
    SHADES: 'shades',             // Shade measuring
    SHADE_LIST: 'shade_list',     // Shade list management
    EQUIPMENT: 'equipment',        // Equipment management
    PROJECTS: 'projects',          // Project management
    KNOWLEDGE: 'knowledge',        // Knowledge base queries
};

// Page contexts where tools can be active
export const PAGE_CONTEXTS = {
    GLOBAL: 'global',              // Available on all pages
    DASHBOARD: 'dashboard',
    PREWIRE: 'prewire',
    SHADE_LIST: 'shade_list',
    SHADE_DETAIL: 'shade_detail',
    EQUIPMENT: 'equipment',
    WIRE_DROPS: 'wire_drops',
    PROJECT: 'project',
    SETTINGS: 'settings',
};

/**
 * Master registry of all possible voice tools
 * This is used to declare ALL tools to Gemini at session start
 *
 * Each tool has:
 * - name: Unique tool name
 * - category: Which category it belongs to
 * - contexts: Array of page contexts where it's available
 * - description: What Gemini sees
 * - parameters: JSON schema for parameters
 */
export const TOOL_DEFINITIONS = {
    // ===== ENTITY NAVIGATION TOOLS (always available) =====
    // These tools work with database entities, not URLs
    get_current_location: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: 'CALL THIS FIRST. Returns current context: project, section, and if in windows section, ALL windows with IDs and measurement status. This app is DATABASE-DRIVEN: Projects → Rooms → Windows (also called Shades).',
        parameters: { type: 'object', properties: {} }
    },
    list_projects: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: 'Query database for all projects. Returns project records with IDs.',
        parameters: {
            type: 'object',
            properties: {
                status: { type: 'string', description: "Filter: 'active', 'completed', 'on-hold', or 'all'" }
            }
        }
    },
    open_project: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: 'Open a project from database. Can search by name. Use section="windows" for window treatments.',
        parameters: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                projectName: { type: 'string', description: 'Search by name (partial match)' },
                section: { type: 'string', description: "Section: 'overview', 'windows' (or 'shades'), 'equipment', 'wire-drops', 'issues'" }
            }
        }
    },
    open_window: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: 'Open a specific window/shade for measuring. Use ID from get_current_location or search by name.',
        parameters: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'Window UUID from windowTreatments data' },
                windowName: { type: 'string', description: 'Search by name in current project' }
            }
        }
    },
    go_to_app_section: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: "Go to main app section (not project-specific): 'dashboard', 'prewire', 'settings', 'issues', etc.",
        parameters: {
            type: 'object',
            properties: {
                section: { type: 'string', description: 'Section name' }
            },
            required: ['section']
        }
    },
    go_back: {
        category: TOOL_CATEGORIES.NAVIGATION,
        contexts: [PAGE_CONTEXTS.GLOBAL],
        description: 'Go back to the previous view.',
        parameters: { type: 'object', properties: {} }
    },

    // ===== PREWIRE TOOLS =====
    get_prewire_overview: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Get overview of wire drops - how many need labels printed, grouped by room.',
        parameters: { type: 'object', properties: {} }
    },
    list_wire_drops_in_room: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'List all wire drops in a specific room.',
        parameters: {
            type: 'object',
            properties: {
                roomName: { type: 'string', description: 'Room name (partial match)' }
            },
            required: ['roomName']
        }
    },
    filter_by_floor: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Filter wire drops to show only a specific floor.',
        parameters: {
            type: 'object',
            properties: {
                floor: { type: 'string', description: "Floor name or 'all'" }
            },
            required: ['floor']
        }
    },
    filter_by_room: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Filter wire drops to show only a specific room.',
        parameters: {
            type: 'object',
            properties: {
                room: { type: 'string', description: "Room name or 'all'" }
            },
            required: ['room']
        }
    },
    open_print_modal: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Open the print dialog for a wire drop to print labels.',
        parameters: {
            type: 'object',
            properties: {
                dropName: { type: 'string', description: 'Wire drop name (partial match)' }
            },
            required: ['dropName']
        }
    },
    open_photo_modal: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Open camera to take a prewire completion photo.',
        parameters: {
            type: 'object',
            properties: {
                dropName: { type: 'string', description: 'Wire drop name (partial match)' }
            },
            required: ['dropName']
        }
    },
    open_wire_drop_details: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Navigate to wire drop details page.',
        parameters: {
            type: 'object',
            properties: {
                dropName: { type: 'string', description: 'Wire drop name (partial match)' }
            },
            required: ['dropName']
        }
    },
    get_next_unprinted: {
        category: TOOL_CATEGORIES.PREWIRE,
        contexts: [PAGE_CONTEXTS.PREWIRE],
        description: 'Get the next wire drop that needs labels printed.',
        parameters: { type: 'object', properties: {} }
    },

    // ===== SHADE MEASURING TOOLS =====
    set_measurement: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Record a measurement for the current shade.',
        parameters: {
            type: 'object',
            properties: {
                field: { type: 'string', description: "Which measurement: 'top width', 'middle width', 'bottom width', 'height', 'mount depth'" },
                value: { type: 'number', description: 'Measurement value in inches' }
            },
            required: ['field', 'value']
        }
    },
    get_shade_context: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Get current shade info - which measurements are complete/missing.',
        parameters: { type: 'object', properties: {} }
    },
    navigate_to_field: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Highlight a specific measurement field (makes it glow violet).',
        parameters: {
            type: 'object',
            properties: {
                field: { type: 'string', description: 'Field to highlight' }
            },
            required: ['field']
        }
    },
    save_shade_measurements: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Save and finalize the current shade measurements.',
        parameters: { type: 'object', properties: {} }
    },
    read_back_measurements: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Read back all recorded measurements for verification.',
        parameters: { type: 'object', properties: {} }
    },
    clear_measurement: {
        category: TOOL_CATEGORIES.SHADES,
        contexts: [PAGE_CONTEXTS.SHADE_DETAIL],
        description: 'Clear/undo a recorded measurement.',
        parameters: {
            type: 'object',
            properties: {
                field: { type: 'string', description: 'Field to clear' }
            },
            required: ['field']
        }
    },

    // ===== SHADE LIST TOOLS =====
    get_shades_overview: {
        category: TOOL_CATEGORIES.SHADE_LIST,
        contexts: [PAGE_CONTEXTS.SHADE_LIST],
        description: 'Get summary of all shades - total, pending, completed, by room.',
        parameters: { type: 'object', properties: {} }
    },
    list_shades_in_room: {
        category: TOOL_CATEGORIES.SHADE_LIST,
        contexts: [PAGE_CONTEXTS.SHADE_LIST],
        description: 'Show shades in a specific room.',
        parameters: {
            type: 'object',
            properties: {
                roomName: { type: 'string', description: 'Room name' }
            },
            required: ['roomName']
        }
    },
    open_shade_for_measuring: {
        category: TOOL_CATEGORIES.SHADE_LIST,
        contexts: [PAGE_CONTEXTS.SHADE_LIST],
        description: 'Open a shade to start measuring. Can search by name or get next pending.',
        parameters: {
            type: 'object',
            properties: {
                shadeName: { type: 'string', description: 'Shade name (optional - omit to get next pending)' }
            }
        }
    },
    get_next_pending_shade: {
        category: TOOL_CATEGORIES.SHADE_LIST,
        contexts: [PAGE_CONTEXTS.SHADE_LIST],
        description: 'Get info about the next shade needing measurement.',
        parameters: { type: 'object', properties: {} }
    },
    expand_room: {
        category: TOOL_CATEGORIES.SHADE_LIST,
        contexts: [PAGE_CONTEXTS.SHADE_LIST],
        description: 'Expand or collapse a room section in the list.',
        parameters: {
            type: 'object',
            properties: {
                roomName: { type: 'string', description: 'Room name' },
                expanded: { type: 'boolean', description: 'true to expand, false to collapse' }
            },
            required: ['roomName']
        }
    },
};

/**
 * Get all tool declarations for Gemini session setup
 * This returns schemas only - actual execute functions come from registered tools
 */
export function getAllToolDeclarations() {
    return Object.entries(TOOL_DEFINITIONS).map(([name, def]) => ({
        name,
        description: def.description,
        parameters: def.parameters
    }));
}

/**
 * Get tools available for a specific page context
 */
export function getToolsForContext(context) {
    return Object.entries(TOOL_DEFINITIONS)
        .filter(([_, def]) =>
            def.contexts.includes(PAGE_CONTEXTS.GLOBAL) ||
            def.contexts.includes(context)
        )
        .map(([name]) => name);
}

/**
 * Get tool definition by name
 */
export function getToolDefinition(name) {
    return TOOL_DEFINITIONS[name] || null;
}

/**
 * Map URL path to page context
 */
export function getContextFromPath(path) {
    if (path === '/prewire-mode') return PAGE_CONTEXTS.PREWIRE;
    if (path.includes('/shades/') && path.includes('/measure')) return PAGE_CONTEXTS.SHADE_DETAIL;
    if (path.includes('/shades')) return PAGE_CONTEXTS.SHADE_LIST;
    if (path.includes('/equipment')) return PAGE_CONTEXTS.EQUIPMENT;
    if (path.includes('/wire-drops')) return PAGE_CONTEXTS.WIRE_DROPS;
    if (path === '/pm-dashboard' || path === '/') return PAGE_CONTEXTS.DASHBOARD;
    if (path === '/settings') return PAGE_CONTEXTS.SETTINGS;
    if (path.includes('/project')) return PAGE_CONTEXTS.PROJECT;
    return PAGE_CONTEXTS.GLOBAL;
}

/**
 * Generate context-aware system instruction addition
 * This can be appended to the base system instruction
 */
export function getContextInstructions(context) {
    const instructions = {
        [PAGE_CONTEXTS.PREWIRE]: `
You are in PREWIRE MODE. This is for printing wire drop labels and taking photos.
Available actions: get_prewire_overview, list_wire_drops_in_room, filter_by_floor, filter_by_room, open_print_modal, open_photo_modal, get_next_unprinted
- "How many need printing?" → get_prewire_overview
- "Show [room name]" → filter_by_room or list_wire_drops_in_room
- "Print labels for [drop]" → open_print_modal
- "Take photo of [drop]" → open_photo_modal
- "What's next?" → get_next_unprinted`,

        [PAGE_CONTEXTS.SHADE_LIST]: `
You are viewing the WINDOW TREATMENT LIST for a project.
TERMINOLOGY: "windows", "shades", "blinds", "window treatments", "window coverings" = ALL THE SAME THING
The get_current_location response includes windowTreatments with ALL windows organized by room.
Available tools: open_window (to start measuring), plus page-specific tools
- "Which windows need measuring?" → Look at windowTreatments.summary from get_current_location
- "Measure [window name]" → open_window with windowName
- "Show me [room]" → The data is already in windowTreatments.rooms - just tell them what's there`,

        [PAGE_CONTEXTS.SHADE_DETAIL]: `
You are MEASURING A WINDOW (also called "shade" - same thing!).
Guide the tech through 5 measurements in order.
Available actions: set_measurement, get_shade_context, navigate_to_field, save_shade_measurements, clear_measurement
Order: top width → middle width → bottom width → height → mount depth
- ALWAYS call navigate_to_field BEFORE asking for a measurement (highlights the field)
- When tech says a number, use set_measurement to record it
- Confirm each: "Got it, [value]. Now [next field]."
- When done: "All measurements recorded. Should I save?"`,

        [PAGE_CONTEXTS.DASHBOARD]: `
You are on the DASHBOARD showing all projects.
- "Open [project name]" → open_project with projectName
- "Go to [project] windows" → open_project with projectName and section="windows"
- "Go to prewire" → go_to_app_section with section="prewire"
- "Show my projects" → list_projects`,
    };

    return instructions[context] || '';
}

export default {
    TOOL_CATEGORIES,
    PAGE_CONTEXTS,
    TOOL_DEFINITIONS,
    getAllToolDeclarations,
    getToolsForContext,
    getToolDefinition,
    getContextFromPath,
    getContextInstructions,
};
