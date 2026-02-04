/**
 * aiContextService.js
 *
 * Builds DYNAMIC context for the AI agent so it's always self-aware
 * of the app structure, data model, and capabilities.
 *
 * Instead of hardcoding "what is Unicorn" in the system prompt,
 * this service pulls from:
 * 1. Page Registry - all available pages/routes
 * 2. Database Schema - what tables/data exist
 * 3. Company Settings - business context
 * 4. AI App Context table - editable app knowledge
 * 5. Trained Page Context - per-page training data
 */

import { supabase } from '../lib/supabase';
import { PAGE_REGISTRY, getAllRoutes } from '../config/pageRegistry';

// Cache for expensive operations
let schemaCache = null;
let schemaCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all available pages from the page registry
 */
export const getAvailablePages = () => {
    const pages = [];
    for (const [route, config] of Object.entries(PAGE_REGISTRY)) {
        pages.push({
            route,
            title: config.title,
            description: config.description || '',
            category: config.category || 'general',
        });
    }
    return pages;
};

/**
 * Get page categories for navigation hints
 */
export const getPageCategories = () => {
    const categories = {};
    for (const [route, config] of Object.entries(PAGE_REGISTRY)) {
        const cat = config.category || 'general';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ route, title: config.title });
    }
    return categories;
};

/**
 * Get database schema - what tables and columns exist
 * This allows the AI to know what data it can query
 */
export const getDatabaseSchema = async () => {
    // Check cache
    if (schemaCache && Date.now() - schemaCacheTime < CACHE_TTL) {
        return schemaCache;
    }

    try {
        // Query Supabase information schema for table info
        // Note: This requires appropriate permissions
        const { data: tables, error } = await supabase
            .rpc('get_table_info')
            .catch(() => ({ data: null, error: 'RPC not available' }));

        if (error || !tables) {
            // Fallback: Return known schema from code
            schemaCache = getKnownSchema();
            schemaCacheTime = Date.now();
            return schemaCache;
        }

        schemaCache = tables;
        schemaCacheTime = Date.now();
        return schemaCache;
    } catch (e) {
        console.warn('[aiContextService] Schema query failed, using known schema');
        schemaCache = getKnownSchema();
        schemaCacheTime = Date.now();
        return schemaCache;
    }
};

/**
 * Known schema - fallback when can't query DB
 * This should be updated when new tables are added
 * TODO: Generate this automatically from migrations
 */
const getKnownSchema = () => ({
    contacts: {
        description: 'Clients/customers - homeowners who have projects',
        keyFields: ['id', 'full_name', 'email', 'phone', 'company', 'contact_type'],
        relationships: ['Has many projects (customer_id)'],
    },
    projects: {
        description: 'Jobs/installations at client homes',
        keyFields: ['id', 'name', 'address', 'status', 'customer_id', 'project_manager'],
        relationships: ['Belongs to contact', 'Has many shades, equipment, wire_drops'],
    },
    equipment: {
        description: 'Devices deployed at projects (Apple TV, Sonos, switches, etc.)',
        keyFields: ['id', 'name', 'manufacturer', 'model', 'serial_number', 'location', 'project_id'],
        relationships: ['Belongs to project'],
    },
    shades: {
        description: 'Window treatments/blinds with measurements',
        keyFields: ['id', 'name', 'room_name', 'product_type', 'width_top', 'height', 'project_id'],
        relationships: ['Belongs to project'],
    },
    wire_drops: {
        description: 'Cable/wire installations for structured wiring',
        keyFields: ['id', 'label', 'location', 'cable_type', 'status', 'project_id'],
        relationships: ['Belongs to project'],
    },
    service_tickets: {
        description: 'Support/service requests from clients',
        keyFields: ['id', 'title', 'status', 'priority', 'customer_name', 'assigned_to'],
        relationships: ['May link to project or contact'],
    },
    todos: {
        description: 'Task items for team members',
        keyFields: ['id', 'title', 'status', 'priority', 'due_date', 'assigned_to'],
        relationships: ['May link to project'],
    },
    issues: {
        description: 'Problems/issues tracked on projects',
        keyFields: ['id', 'title', 'status', 'priority', 'project_id'],
        relationships: ['Belongs to project'],
    },
    global_parts: {
        description: 'Master parts catalog with manufacturer info',
        keyFields: ['id', 'name', 'manufacturer', 'model', 'sku', 'category'],
        relationships: ['Referenced by project parts'],
    },
    vendors: {
        description: 'Suppliers and distributors',
        keyFields: ['id', 'name', 'contact_name', 'email', 'phone'],
        relationships: ['Supplies parts'],
    },
    profiles: {
        description: 'User profiles and settings',
        keyFields: ['id', 'email', 'full_name', 'role', 'avatar_color'],
        relationships: ['Links to auth user'],
    },
});

/**
 * Get app context from database (editable business knowledge)
 */
export const getAppContext = async () => {
    try {
        const { data, error } = await supabase
            .from('ai_app_context')
            .select('*')
            .order('category', { ascending: true });

        if (error) {
            console.warn('[aiContextService] ai_app_context table not found, using defaults');
            return getDefaultAppContext();
        }

        // Convert array to structured object
        const context = {};
        for (const row of data) {
            if (!context[row.category]) context[row.category] = {};
            context[row.category][row.key] = row.value;
        }
        return context;
    } catch (e) {
        return getDefaultAppContext();
    }
};

/**
 * Default app context when table doesn't exist
 */
const getDefaultAppContext = () => ({
    company: {
        name: 'ISE (Integrated Smart Environments)',
        description: 'Low-voltage and smart home installation company',
        services: 'Motorized shades, home automation (Control4, Lutron), networking (Ubiquiti), audio/video (Sonos), structured cabling',
    },
    app: {
        name: 'Unicorn',
        purpose: 'Project management for smart home installations',
        users: 'Technicians, Project Managers, Admins',
    },
    workflow: {
        stages: 'Prewire → Trim-out → Commissioning → Service',
        prewire: 'Installing cables and wire drops before drywall',
        trimout: 'Installing devices after drywall (shades, switches, etc.)',
        commissioning: 'Programming and testing systems',
        service: 'Ongoing support and maintenance',
    },
});

/**
 * Get trained pages summary
 */
export const getTrainedPagesSummary = async () => {
    try {
        const { data, error } = await supabase
            .from('page_ai_context')
            .select('page_route, page_title, is_trained, is_published')
            .eq('is_trained', true);

        if (error) return { trained: 0, pages: [] };

        return {
            trained: data.length,
            pages: data.map(p => ({ route: p.page_route, title: p.page_title, published: p.is_published })),
        };
    } catch (e) {
        return { trained: 0, pages: [] };
    }
};

/**
 * Build complete AI context - call this to get everything the AI needs
 */
export const buildAIContext = async () => {
    const [appContext, schema, trainedPages] = await Promise.all([
        getAppContext(),
        getDatabaseSchema(),
        getTrainedPagesSummary(),
    ]);

    const pages = getAvailablePages();
    const categories = getPageCategories();

    return {
        app: appContext,
        schema,
        pages: {
            total: pages.length,
            categories,
            list: pages,
        },
        training: trainedPages,
        generatedAt: new Date().toISOString(),
    };
};

/**
 * Build system prompt section from dynamic context
 * This replaces hardcoded descriptions in AIBrainContext
 */
export const buildDynamicSystemPrompt = async () => {
    const ctx = await buildAIContext();

    const schemaDescription = Object.entries(ctx.schema)
        .map(([table, info]) => `- **${table}**: ${info.description}`)
        .join('\n');

    const pageList = Object.entries(ctx.pages.categories)
        .map(([cat, pages]) => `- ${cat}: ${pages.map(p => p.title).join(', ')}`)
        .join('\n');

    return `## About ${ctx.app.app?.name || 'Unicorn'}
${ctx.app.company?.description || 'Smart home installation company'}
Services: ${ctx.app.company?.services || 'Shades, automation, networking, A/V'}

## Workflow Stages
${ctx.app.workflow?.stages || 'Prewire → Trim-out → Commissioning → Service'}

## Data You Can Query (query_data tool)
${schemaDescription}

## Available Pages (${ctx.pages.total} total)
${pageList}

## Trained Pages (${ctx.training.trained} pages have detailed training)
${ctx.training.pages.map(p => p.title).join(', ') || 'None yet'}

## Key Relationships
- Contacts → have Projects → have Equipment, Shades, Wire Drops
- Service Tickets may link to Contacts or Projects
- Parts catalog (global_parts) is referenced across projects`;
};

/**
 * Quick context for voice (smaller, faster)
 */
export const buildQuickContext = () => {
    const pages = getAvailablePages();
    const schema = getKnownSchema();

    return {
        tables: Object.keys(schema),
        pageCount: pages.length,
        queryTypes: ['contact', 'project', 'equipment', 'contact_equipment', 'shades', 'tickets'],
    };
};

export default {
    getAvailablePages,
    getPageCategories,
    getDatabaseSchema,
    getAppContext,
    getTrainedPagesSummary,
    buildAIContext,
    buildDynamicSystemPrompt,
    buildQuickContext,
};
