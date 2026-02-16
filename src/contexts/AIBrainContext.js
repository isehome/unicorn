/**
 * AIBrainContext - The Voice AI Agent
 * 5 meta-tools, real-time context, Azure AI Search + web search
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from './AppStateContext';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { pageContextService } from '../services/pageContextService';
import { getPatternRoute, PAGE_REGISTRY } from '../config/pageRegistry';
import { companySettingsService } from '../services/companySettingsService';
import aiContextService from '../services/aiContextService';

// Audio settings - Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Verbose logging flag - enable for debugging
const VERBOSE_LOGGING = true;

// Default model - user can override in settings
// Must be a model that supports bidiGenerateContent (Live API)
// See: https://ai.google.dev/gemini-api/docs/models
const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const AIBrainContext = createContext(null);

export const AIBrainProvider = ({ children }) => {
    const navigate = useNavigate();
    const { executeAction, getAvailableActions, getState } = useAppState();
    const { user: authUser } = useAuth();

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [inputSilenceWarning, setInputSilenceWarning] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');

    // Training mode integration - callback to send transcripts to training context
    const transcriptCallbackRef = useRef(null);
    // Training mode state - different prompts when in training mode
    const [isTrainingMode, setIsTrainingModeInternal] = useState(false);
    const trainingContextRef = useRef(null); // { pageRoute, pageTitle, sessionType }

    // Buffer for accumulating transcription (Gemini sends word-by-word)
    const userTranscriptBuffer = useRef('');
    const aiTranscriptBuffer = useRef('');

    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]); // Queue of Float32Array chunks
    const isPlaying = useRef(false); // Track if audio is currently playing
    const navigateRef = useRef(navigate);

    // Web Speech API for transcription (runs in parallel with Gemini audio)
    const speechRecognition = useRef(null);

    // Screen Wake Lock to prevent phone from sleeping during conversation
    const wakeLock = useRef(null);

    // Dynamic AI context - loaded from database/config for self-awareness
    const dynamicContextRef = useRef(null);

    // Debug counters
    const [audioChunksSent, setAudioChunksSent] = useState(0);
    const [audioChunksReceived, setAudioChunksReceived] = useState(0);
    const [debugLog, setDebugLog] = useState([]);

    const addDebugLog = useCallback((message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setDebugLog(prev => [...prev.slice(-50), { timestamp, message, type }]);
        console.log(`[AIBrain] ${message}`);
    }, []);

    const clearDebugLog = useCallback(() => {
        setDebugLog([]);
        setAudioChunksSent(0);
        setAudioChunksReceived(0);
    }, []);

    useEffect(() => { navigateRef.current = navigate; }, [navigate]);
    useEffect(() => {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        setIsConfigured(!!apiKey && apiKey.length > 10);
    }, []);

    // Load dynamic AI context on mount (for self-awareness)
    useEffect(() => {
        const loadDynamicContext = async () => {
            try {
                const ctx = await aiContextService.buildAIContext();
                dynamicContextRef.current = ctx;
                console.log('[AIBrain] Dynamic context loaded:', Object.keys(ctx));
            } catch (e) {
                console.warn('[AIBrain] Failed to load dynamic context:', e);
                // Use fallback from service
                dynamicContextRef.current = {
                    app: aiContextService.buildQuickContext(),
                    schema: {},
                    pages: { total: Object.keys(PAGE_REGISTRY).length },
                };
            }
        };
        loadDynamicContext();
    }, []);

    // Re-acquire wake lock when app becomes visible again during active session
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && status !== 'idle' && 'wakeLock' in navigator) {
                // Session is active and we're visible - re-acquire wake lock
                if (!wakeLock.current) {
                    try {
                        wakeLock.current = await navigator.wakeLock.request('screen');
                        console.log('[AIBrain] Wake Lock re-acquired after visibility change');
                    } catch (err) {
                        console.warn('[AIBrain] Failed to re-acquire wake lock:', err.message);
                    }
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [status]);

    const getSettings = useCallback(() => ({
        voice: localStorage.getItem('ai_voice') || 'Puck',
        persona: localStorage.getItem('ai_persona') || 'brief',
        customInstructions: localStorage.getItem('ai_custom_instructions') || '',
        vadStartSensitivity: parseInt(localStorage.getItem('ai_vad_start') || '1', 10),
        vadEndSensitivity: parseInt(localStorage.getItem('ai_vad_end') || '2', 10),
    }), []);

    const buildContextString = useCallback((state) => {
        const { view, project, shade, form, activeField, shades, rooms } = state;
        let context = `Current View: ${view}\n`;
        if (project) context += `Project: "${project.name}" (${project.address || 'No address'})\n`;

        if (view === 'shade-detail' && shade) {
            context += `\n### Measuring Window: "${shade.name}"${shade.roomName ? ` in ${shade.roomName}` : ''}\n\nMeasurements:\n`;
            context += `- Top Width: ${form?.widthTop || 'NOT SET'}\n`;
            context += `- Middle Width: ${form?.widthMiddle || 'NOT SET'}\n`;
            context += `- Bottom Width: ${form?.widthBottom || 'NOT SET'}\n`;
            context += `- Height: ${form?.height || 'NOT SET'}\n`;
            context += `- Mount Depth: ${form?.mountDepth || 'NOT SET'}\n`;
            if (activeField) context += `\nActive Field: ${activeField}\n`;
            context += `\nAvailable Actions: highlight_field, set_measurement, clear_measurement, save_measurements, read_back, next_shade\n`;
        } else if (view === 'shade-list' && shades) {
            const pending = shades.filter(s => !s.hasMeasurements).length;
            context += `\n### Window List\nTotal: ${shades.length}, Pending: ${pending}, Rooms: ${rooms?.length || 0}\n`;
            context += `Available Actions: open_shade, list_rooms, go_to_next_pending\n`;
        } else if (view === 'prewire') {
            context += `\n### Prewire Mode\nAvailable Actions: get_overview, filter_by_floor, filter_by_room, print_labels, take_photo\n`;
        } else if (view === 'dashboard') {
            context += `\n### Dashboard\nAvailable Actions: list_projects, open_project\n`;
        }
        return context;
    }, []);

    const buildTrainingSystemInstruction = useCallback(() => {
        const ctx = trainingContextRef.current;
        const sessionType = ctx?.sessionType || 'initial';
        const pageTitle = ctx?.pageTitle || 'this page';
        const pageRoute = ctx?.pageRoute || window.location.pathname;

        return `# UNICORN Page Training Mode

You are helping an admin train the AI on how to assist users with "${pageTitle}" (${pageRoute}).

## Your Role
You are a friendly interviewer helping capture knowledge about this page. Your goal is to have a natural conversation that extracts:

1. **What This Page Does** - The functional purpose
2. **Business Context** - Why this page matters to the business
3. **Workflow Position** - Where this fits in the user's workflow
4. **Real-World Use Cases** - Concrete examples of when/how it's used
5. **Common Mistakes** - What users often get wrong
6. **Best Practices** - Tips for using it effectively
7. **FAQs** - Questions users commonly ask

## Conversation Style
- Be conversational and encouraging
- Ask follow-up questions to get specifics
- Summarize key points back to confirm understanding
- If they say something vague, ask for a concrete example
- Keep responses SHORT - don't lecture, just guide the conversation
- IMPORTANT: After each response from the admin, briefly summarize what you learned from that response

## Session Type: ${sessionType}
${sessionType === 'initial' ? 'This is the FIRST training for this page. Start by asking what the page is for.' :
sessionType === 'append' ? 'This page already has some training. Ask what additional info they want to add.' :
'This is a RETRAIN - they want to start fresh. Ask them to describe the page from scratch.'}

## When the Admin Says "Done" or "That's All"
When the admin indicates they're finished training, provide a COMPLETE summary of everything you learned. Say something like:
"Great! Here's what I learned about this page: [full summary of functional description, business context, workflow, best practices, common mistakes, and any FAQs discussed]"

## Start the Conversation
Begin by greeting them and asking your first question based on the session type. Keep it natural and conversational.`;
    }, []);

    const buildSystemInstruction = useCallback(() => {
        // If in training mode, use training-specific instruction
        if (isTrainingMode && trainingContextRef.current) {
            return buildTrainingSystemInstruction();
        }

        const settings = getSettings();
        const state = getState();
        const ctx = dynamicContextRef.current; // Dynamic context from database/config

        const persona = settings.persona === 'brief'
            ? `You are a concise field assistant. Keep responses short. Confirm with "Got it" or "Done".`
            : `You are a helpful teaching assistant. Explain your actions.`;

        // Build dynamic app description from context (or use defaults)
        const appName = ctx?.app?.app?.name || 'Unicorn';
        const companyName = ctx?.app?.company?.name || 'ISE';
        const companyDesc = ctx?.app?.company?.description || 'Low-voltage and smart home installation company';
        const services = ctx?.app?.company?.services || 'Shades, automation, networking, A/V, cabling';
        const workflowStages = ctx?.app?.workflow?.stages || 'Prewire → Trim-out → Commissioning → Service';

        // Build dynamic data model description from schema
        const schemaDesc = ctx?.schema
            ? Object.entries(ctx.schema).map(([table, info]) => `- **${table}**: ${info.description}`).join('\n')
            : `- **contacts**: Clients/homeowners
- **projects**: Jobs at client homes
- **equipment**: Devices deployed (Apple TV, Sonos, etc.)
- **shades**: Window treatments with measurements
- **service_tickets**: Support requests`;

        // Build page count from registry
        const pageCount = ctx?.pages?.total || Object.keys(PAGE_REGISTRY).length;
        const trainedCount = ctx?.training?.trained || 0;

        return `# ${appName} Field Assistant

${persona}

## About ${appName}
${companyName}: ${companyDesc}
Services: ${services}
Workflow: ${workflowStages}

## Data You Can Query (query_data tool)
${schemaDesc}

Example: "Does Bill Thomas have any Apple TVs?" → query_data(contact_equipment, "Bill Thomas", {equipmentSearch: "Apple TV"})

## Your Capabilities
1. **Database Queries** - Find clients, projects, equipment (query_data)
2. **Knowledge Base** - Product docs via Azure AI Search (search_knowledge)
3. **App Navigation** - ${pageCount} pages available (navigate)
4. **Execute Actions** - Interact with current view (execute_action)
5. **Create Items** - Todos, issues, tickets, contacts (quick_create)
6. **Page Training** - ${trainedCount} pages have detailed training (get_page_training)

## Tool Priority
1. For client/equipment questions → query_data (FIRST)
2. For product/installation questions → search_knowledge
3. For current view state → get_context
4. For general info → web_search

## Measurement Order (Shades)
1. Top Width → 2. Middle Width → 3. Bottom Width → 4. Height → 5. Mount Depth

## Terminology
Windows = Shades = Blinds = Window Treatments (same thing)

${settings.customInstructions ? `## Custom Instructions\n${settings.customInstructions}` : ''}

## Current Context
${buildContextString(state)}`;
    }, [getSettings, getState, buildContextString, isTrainingMode, buildTrainingSystemInstruction]);

    // Tool declarations - memoized to prevent unnecessary re-renders
    const tools = React.useMemo(() => [
        { name: 'get_context', description: 'Get current app state. CALL THIS FIRST.', parameters: { type: 'object', properties: {} } },
        { name: 'execute_action', description: 'Execute action: highlight_field, set_measurement, save_measurements, open_shade, etc.', parameters: { type: 'object', properties: { action: { type: 'string' }, params: { type: 'object' } }, required: ['action'] } },
        { name: 'search_knowledge', description: 'Search knowledge base for product info (Lutron, Ubiquiti, etc). USE FIRST for product questions.', parameters: { type: 'object', properties: { query: { type: 'string' }, manufacturer: { type: 'string' } }, required: ['query'] } },
        { name: 'query_data', description: 'Search Unicorn database for contacts, projects, equipment, shades, tickets. Use contact_equipment to find all equipment for a client (e.g., "Does Bill Thomas have any Apple TVs?").', parameters: { type: 'object', properties: { queryType: { type: 'string', enum: ['contact', 'project', 'equipment', 'contact_equipment', 'shades', 'tickets'], description: 'Type of data to query' }, searchTerm: { type: 'string', description: 'Name or keyword to search for' }, filters: { type: 'object', description: 'Optional filters: contactId, projectId, equipmentSearch' } }, required: ['queryType', 'searchTerm'] } },
        { name: 'navigate', description: 'Navigate anywhere: dashboard, home, prewire, service, tickets, todos, issues, people, vendors, parts, settings, admin, knowledge, weekly planning - OR project name with section (shades, equipment, procurement, receiving, inventory, floor plan, reports, secure data).', parameters: { type: 'object', properties: { destination: { type: 'string', description: 'Page name or project name' }, section: { type: 'string', description: 'For projects: shades, equipment, procurement, receiving, inventory, floor plan, reports, secure data' } }, required: ['destination'] } },
        { name: 'quick_create', description: 'Create new items: todo, issue, ticket, contact, note. Provide type and relevant fields.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['todo', 'issue', 'ticket', 'contact', 'note'], description: 'Type of item to create' }, title: { type: 'string', description: 'Title/name of item' }, description: { type: 'string', description: 'Description or details' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' }, projectId: { type: 'string', description: 'Project ID if applicable' }, dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' } }, required: ['type', 'title'] } },
        { name: 'web_search', description: 'Search web for general info not in knowledge base.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'get_page_training', description: 'Get training context for current page - returns business context, workflow info, common mistakes, best practices.', parameters: { type: 'object', properties: { pageRoute: { type: 'string', description: 'Optional: specific page route. If omitted, uses current page.' } } } },
        { name: 'teach_page', description: 'Start teaching the user about the current page using trained context.', parameters: { type: 'object', properties: { style: { type: 'string', enum: ['overview', 'walkthrough', 'tips'], description: 'Teaching style: overview (quick intro), walkthrough (step by step), tips (best practices)' } } } },
        { name: 'answer_page_question', description: 'Answer a question about the current page using trained FAQ and context.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The user question' } }, required: ['question'] } },
    ], []);

    const getContextHint = (view) => {
        const hints = {
            'shade-detail': 'Measuring window. Guide through: top->middle->bottom width, height, mount depth.',
            'shade-list': 'Window list. Can open shade or find next pending.',
            'prewire': 'Prewire mode for wire drop labels.',
            'dashboard': 'Dashboard. Can open projects.',
        };
        return hints[view] || 'Ask how you can help.';
    };

    const searchKnowledgeBase = async (query, manufacturer) => {
        try {
            const response = await fetch('/api/azure-ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, manufacturer, limit: 5 }),
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            if (!data.results?.length) return { found: false, message: `No results for "${query}".`, suggestion: 'Try web_search.' };
            return { found: true, answer: data.results[0].content?.substring(0, 500), source: data.results[0].documentTitle, resultCount: data.results.length };
        } catch (e) { return { found: false, error: e.message }; }
    };

    // ══════════════════════════════════════════════════════════════
    // QUERY DATA - Database search for contacts, projects, equipment
    // ══════════════════════════════════════════════════════════════
    const queryData = async (queryType, searchTerm, filters = {}) => {
        try {
            console.log(`[AIBrain] queryData: ${queryType} - "${searchTerm}"`, filters);

            switch (queryType) {
                case 'contact':
                case 'client':
                case 'person': {
                    // Search contacts by name
                    const { data: contacts, error } = await supabase
                        .from('contacts')
                        .select('id, full_name, email, phone, company, contact_type, created_at')
                        .or(`full_name.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
                        .limit(10);
                    if (error) throw error;
                    if (!contacts?.length) return { found: false, message: `No contacts found matching "${searchTerm}"` };
                    return { found: true, type: 'contacts', count: contacts.length, results: contacts };
                }

                case 'project':
                case 'projects': {
                    // Search projects by name or get projects for a contact
                    let query = supabase
                        .from('projects')
                        .select('id, name, address, status, project_manager, created_at, customer_id, contacts!projects_customer_id_fkey(full_name)')
                        .limit(10);

                    if (filters.contactId) {
                        query = query.eq('customer_id', filters.contactId);
                    } else {
                        query = query.or(`name.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`);
                    }

                    const { data: projects, error } = await query;
                    if (error) throw error;
                    if (!projects?.length) return { found: false, message: `No projects found matching "${searchTerm}"` };
                    return { found: true, type: 'projects', count: projects.length, results: projects };
                }

                case 'equipment':
                case 'device':
                case 'devices': {
                    // Search equipment by name/model, optionally filter by project
                    let query = supabase
                        .from('equipment')
                        .select(`
                            id, name, manufacturer, model, serial_number, location, status, quantity,
                            project_id, projects!equipment_project_id_fkey(name, address)
                        `)
                        .limit(20);

                    if (filters.projectId) {
                        query = query.eq('project_id', filters.projectId);
                    }

                    if (searchTerm) {
                        query = query.or(`name.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%`);
                    }

                    const { data: equipment, error } = await query;
                    if (error) throw error;
                    if (!equipment?.length) return { found: false, message: `No equipment found matching "${searchTerm}"` };
                    return { found: true, type: 'equipment', count: equipment.length, results: equipment };
                }

                case 'contact_equipment': {
                    // Get ALL equipment for a contact across all their projects
                    // First, find the contact
                    const { data: contacts } = await supabase
                        .from('contacts')
                        .select('id, full_name')
                        .ilike('full_name', `%${searchTerm}%`)
                        .limit(1);

                    if (!contacts?.length) return { found: false, message: `No contact found matching "${searchTerm}"` };
                    const contact = contacts[0];

                    // Get their projects
                    const { data: projects } = await supabase
                        .from('projects')
                        .select('id, name, address')
                        .eq('customer_id', contact.id);

                    if (!projects?.length) return { found: true, contact: contact.full_name, message: 'Contact found but has no projects' };

                    // Get equipment for all their projects
                    const projectIds = projects.map(p => p.id);
                    let equipmentQuery = supabase
                        .from('equipment')
                        .select('id, name, manufacturer, model, serial_number, location, status, quantity, project_id')
                        .in('project_id', projectIds);

                    // Optional: filter by equipment type/name
                    if (filters.equipmentSearch) {
                        equipmentQuery = equipmentQuery.or(`name.ilike.%${filters.equipmentSearch}%,manufacturer.ilike.%${filters.equipmentSearch}%,model.ilike.%${filters.equipmentSearch}%`);
                    }

                    const { data: equipment } = await equipmentQuery;

                    // Map equipment to project names
                    const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
                    const enrichedEquipment = (equipment || []).map(e => ({
                        ...e,
                        projectName: projectMap[e.project_id]
                    }));

                    return {
                        found: true,
                        contact: contact.full_name,
                        contactId: contact.id,
                        projectCount: projects.length,
                        projects: projects.map(p => ({ id: p.id, name: p.name, address: p.address })),
                        equipmentCount: enrichedEquipment.length,
                        equipment: enrichedEquipment,
                        summary: `${contact.full_name} has ${projects.length} project(s) with ${enrichedEquipment.length} equipment item(s)`
                    };
                }

                case 'shades':
                case 'windows': {
                    // Search shades/window treatments
                    let query = supabase
                        .from('shades')
                        .select('id, name, room_name, product_type, status, width_top, height, project_id, projects!shades_project_id_fkey(name)')
                        .limit(20);

                    if (filters.projectId) {
                        query = query.eq('project_id', filters.projectId);
                    }
                    if (searchTerm) {
                        query = query.or(`name.ilike.%${searchTerm}%,room_name.ilike.%${searchTerm}%`);
                    }

                    const { data: shades, error } = await query;
                    if (error) throw error;
                    return { found: !!shades?.length, type: 'shades', count: shades?.length || 0, results: shades || [] };
                }

                case 'service_tickets':
                case 'tickets': {
                    // Search service tickets
                    const { data: tickets, error } = await supabase
                        .from('service_tickets')
                        .select('id, title, status, priority, created_at, customer_name, assigned_to')
                        .or(`title.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%`)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    if (error) throw error;
                    return { found: !!tickets?.length, type: 'service_tickets', count: tickets?.length || 0, results: tickets || [] };
                }

                default:
                    return { error: `Unknown query type: ${queryType}. Use: contact, project, equipment, contact_equipment, shades, tickets` };
            }
        } catch (error) {
            console.error('[AIBrain] queryData error:', error);
            return { error: error.message || 'Query failed' };
        }
    };

    const handleNavigation = async (destination, section) => {
        // Comprehensive navigation targets (30+)
        const staticRoutes = {
            // Dashboards
            dashboard: '/pm-dashboard',
            'pm dashboard': '/pm-dashboard',
            'project manager dashboard': '/pm-dashboard',
            home: '/',
            'tech dashboard': '/',
            'technician dashboard': '/',

            // Wire Drops
            prewire: '/prewire-mode',
            'prewire mode': '/prewire-mode',
            'wire drops': '/wire-drops',
            'wire drops hub': '/wire-drops',

            // Service CRM
            service: '/service',
            'service dashboard': '/service',
            tickets: '/service',
            'service tickets': '/service',
            'new ticket': '/service/tickets/new',
            'create ticket': '/service/tickets/new',
            'weekly planning': '/service/weekly-planning',
            'service planning': '/service/weekly-planning',
            'schedule': '/service/weekly-planning',
            'service reports': '/service/reports',

            // Tasks & Issues
            todos: '/todos',
            'my todos': '/todos',
            'todo list': '/todos',
            issues: '/issues',
            'all issues': '/issues',
            'issue list': '/issues',

            // People & Contacts
            people: '/people',
            contacts: '/people',
            'contact list': '/people',
            'people management': '/people',

            // Vendors & Parts
            vendors: '/vendors',
            'vendor management': '/vendors',
            'supplier list': '/vendors',
            parts: '/parts',
            'parts list': '/parts',
            'global parts': '/global-parts',
            'parts catalog': '/global-parts',

            // Admin & Settings
            settings: '/settings',
            'my settings': '/settings',
            'user settings': '/settings',
            admin: '/admin',
            'admin panel': '/admin',
            'administration': '/admin',
            'knowledge': '/settings/knowledge',
            'knowledge base': '/settings/knowledge',
        };

        const dest = destination.toLowerCase().trim();

        // Check static routes first
        if (staticRoutes[dest]) {
            navigateRef.current(staticRoutes[dest]);
            return { success: true, message: `Navigating to ${destination}` };
        }

        // Project section shortcuts (for current project context)
        const currentPath = window.location.pathname;
        const projectMatch = currentPath.match(/\/(?:pm-)?project[s]?\/([^/]+)/);
        const currentProjectId = projectMatch?.[1];

        const projectSections = {
            shades: (id) => `/projects/${id}/shades`,
            windows: (id) => `/projects/${id}/shades`,
            'shade manager': (id) => `/projects/${id}/shades`,
            equipment: (id) => `/projects/${id}/equipment`,
            'equipment list': (id) => `/projects/${id}/equipment`,
            procurement: (id) => `/projects/${id}/procurement`,
            'purchase orders': (id) => `/projects/${id}/procurement`,
            pos: (id) => `/projects/${id}/procurement`,
            receiving: (id) => `/projects/${id}/receiving`,
            'parts receiving': (id) => `/projects/${id}/receiving`,
            inventory: (id) => `/projects/${id}/inventory`,
            'project inventory': (id) => `/projects/${id}/inventory`,
            'floor plan': (id) => `/projects/${id}/floor-plan`,
            floorplan: (id) => `/projects/${id}/floor-plan`,
            reports: (id) => `/projects/${id}/reports`,
            'project reports': (id) => `/projects/${id}/reports`,
            'secure data': (id) => `/projects/${id}/secure-data`,
            credentials: (id) => `/projects/${id}/secure-data`,
        };

        // If user asks for a section and we're in a project, go there
        if (projectSections[dest] && currentProjectId) {
            navigateRef.current(projectSections[dest](currentProjectId));
            return { success: true, message: `Going to ${destination} for current project` };
        }

        // Search for project by name
        const { data: projects } = await supabase.from('projects').select('id, name').ilike('name', `%${destination}%`).limit(5);
        if (!projects?.length) {
            return { success: false, error: `No destination or project found for "${destination}". Try: dashboard, service, tickets, todos, issues, settings, or a project name.` };
        }
        if (projects.length > 1) {
            return { success: false, error: 'Multiple projects match', matches: projects.map(p => p.name), hint: 'Please be more specific' };
        }

        // Navigate to project with optional section
        const projectId = projects[0].id;
        let url = `/pm-project/${projectId}`;

        if (section) {
            const s = section.toLowerCase().trim();
            if (projectSections[s]) {
                url = projectSections[s](projectId);
            }
        }

        navigateRef.current(url);
        return { success: true, message: `Opening ${projects[0].name}${section ? ` - ${section}` : ''}` };
    };

    const handleQuickCreate = async ({ type, title, description, priority, projectId, dueDate }) => {
        const userId = authUser?.id;

        // Get current project context if not provided
        let currentProjectId = projectId;
        if (!currentProjectId) {
            const currentPath = window.location.pathname;
            const projectMatch = currentPath.match(/\/(?:pm-)?project[s]?\/([^/]+)/);
            currentProjectId = projectMatch?.[1];
        }

        try {
            switch (type) {
                case 'todo': {
                    const { data, error } = await supabase.from('todos').insert({
                        title,
                        description: description || null,
                        importance: priority === 'urgent' ? 'critical' : priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
                        project_id: currentProjectId || null,
                        due_date: dueDate || null,
                        created_by: userId,
                        status: 'pending',
                    }).select().single();
                    if (error) throw error;
                    return { success: true, message: `Created todo: ${title}`, id: data?.id };
                }

                case 'issue': {
                    if (!currentProjectId) {
                        return { success: false, error: 'Issues require a project context. Navigate to a project first.' };
                    }
                    const { data, error } = await supabase.from('issues').insert({
                        title,
                        description: description || null,
                        priority: priority || 'medium',
                        project_id: currentProjectId,
                        status: 'open',
                        created_by: userId,
                    }).select().single();
                    if (error) throw error;
                    return { success: true, message: `Created issue: ${title}`, id: data?.id };
                }

                case 'ticket': {
                    // Fetch company default hourly rate for new tickets
                    let defaultHourlyRate = 150;
                    try {
                        const settings = await companySettingsService.getCompanySettings();
                        if (settings?.default_service_hourly_rate) {
                            defaultHourlyRate = settings.default_service_hourly_rate;
                        }
                    } catch (err) {
                        console.log('[AIBrain] Using fallback hourly rate for ticket');
                    }

                    const { data, error } = await supabase.from('service_tickets').insert({
                        title,
                        description: description || null,
                        priority: priority || 'medium',
                        status: 'new',
                        hourly_rate: defaultHourlyRate,
                        created_by: userId,
                    }).select().single();
                    if (error) throw error;
                    navigateRef.current(`/service/tickets/${data?.id}`);
                    return { success: true, message: `Created service ticket: ${title}`, id: data?.id };
                }

                case 'contact': {
                    const { data, error } = await supabase.from('contacts').insert({
                        name: title,
                        notes: description || null,
                        created_by: userId,
                    }).select().single();
                    if (error) throw error;
                    return { success: true, message: `Created contact: ${title}`, id: data?.id };
                }

                case 'note': {
                    // Notes attach to current project or ticket
                    const noteData = {
                        content: `${title}${description ? '\n\n' + description : ''}`,
                        created_by: userId,
                    };
                    if (currentProjectId) {
                        noteData.project_id = currentProjectId;
                    }
                    const { data, error } = await supabase.from('notes').insert(noteData).select().single();
                    if (error) throw error;
                    return { success: true, message: `Added note: ${title}`, id: data?.id };
                }

                default:
                    return { success: false, error: `Unknown type: ${type}. Use: todo, issue, ticket, contact, or note.` };
            }
        } catch (error) {
            console.error('[AIBrain] quick_create error:', error);
            return { success: false, error: error.message || 'Failed to create item' };
        }
    };

    const handleToolCall = useCallback(async (toolCall) => {
        const { name, args = {} } = toolCall;
        console.log(`[AIBrain] Tool: ${name}`, args);
        switch (name) {
            case 'get_context': return { ...getState(), availableActions: getAvailableActions(), hint: getContextHint(getState().view) };
            case 'execute_action': return await executeAction(args.action, args.params || {});
            case 'search_knowledge': return await searchKnowledgeBase(args.query, args.manufacturer);
            case 'query_data': return await queryData(args.queryType, args.searchTerm, args.filters || {});
            case 'navigate': return await handleNavigation(args.destination, args.section);
            case 'quick_create': return await handleQuickCreate(args);
            case 'web_search': return { message: `Searching for "${args.query}"...`, useGrounding: true };
            case 'get_page_training': {
                const route = args.pageRoute || getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context || !context.is_trained) {
                    return { found: false, message: `No training found for ${route}`, route };
                }
                return {
                    found: true,
                    route,
                    pageTitle: context.page_title,
                    functional: context.functional_description,
                    businessContext: context.business_context,
                    workflow: context.workflow_position,
                    realWorldExample: context.real_world_use_case,
                    commonMistakes: context.common_mistakes || [],
                    bestPractices: context.best_practices || [],
                    faq: context.faq || [],
                };
            }
            case 'teach_page': {
                const route = getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context?.is_trained) {
                    return { success: false, message: "This page hasn't been trained yet. I can only provide basic help." };
                }
                const style = args.style || 'overview';
                const script = pageContextService.buildTeachingScript(context);
                return {
                    success: true,
                    teachingStyle: style,
                    content: style === 'overview'
                        ? context.functional_description
                        : style === 'tips'
                            ? { bestPractices: context.best_practices, mistakes: context.common_mistakes }
                            : script,
                };
            }
            case 'answer_page_question': {
                const route = getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context?.is_trained) {
                    return { answered: false, message: "I don't have specific training for this page." };
                }
                // Check FAQ first
                const faq = context.faq || [];
                const matchingFaq = faq.find(qa =>
                    args.question.toLowerCase().includes(qa.question?.toLowerCase()?.slice(0, 20))
                );
                if (matchingFaq) {
                    return { answered: true, source: 'faq', answer: matchingFaq.answer };
                }
                // Return full context for AI to synthesize answer
                return {
                    answered: false,
                    context: {
                        functional: context.functional_description,
                        business: context.business_context,
                        workflow: context.workflow_position,
                        tips: context.best_practices,
                        mistakes: context.common_mistakes,
                    },
                    message: "Use this context to answer the question"
                };
            }
            default: return { error: `Unknown: ${name}` };
        }
    }, [getState, getAvailableActions, executeAction]);

    // Audio utilities - from working VoiceCopilotContext implementation

    // Float32 to 16-bit PCM conversion (working formula)
    const floatTo16BitPCM = (input) => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    };

    // Linear interpolation resampling (simple but effective for voice)
    const resampleAudio = (inputData, inputSampleRate, outputSampleRate) => {
        if (inputSampleRate === outputSampleRate) {
            return inputData;
        }
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
            const t = srcIndex - srcIndexFloor;
            output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
        }
        return output;
    };

    // Downsample to Gemini's expected 16kHz
    const downsampleForGemini = useCallback((inputData, inputSampleRate) => {
        return resampleAudio(inputData, inputSampleRate, GEMINI_INPUT_SAMPLE_RATE);
    }, []);

    // Convert base64 PCM (int16) to Float32 for playback
    const base64ToFloat32 = (base64) => {
        const binary = atob(base64);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        const int16 = new Int16Array(buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        return float32;
    };

    // --- AUDIO PLAYBACK ---
    // This is the SIMPLE, WORKING approach from VoiceCopilotContext (commit 4786ede)
    // It plays chunks immediately as they arrive, without complex scheduling
    const playNextChunk = useCallback(() => {
        if (!audioContext.current) {
            // This should ideally not happen now that startSession creates it, 
            // but we keep as fallback.
            addDebugLog('playNextChunk: No audioContext - creating one (fallback)', 'warn');
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();
        }
        if (audioQueue.current.length === 0) {
            if (VERBOSE_LOGGING) addDebugLog('playNextChunk: Queue empty', 'audio');
            return;
        }
        if (isPlaying.current) {
            if (VERBOSE_LOGGING) addDebugLog(`playNextChunk: Already playing, queue size: ${audioQueue.current.length}`, 'audio');
            return;
        }

        isPlaying.current = true;
        const audioData = audioQueue.current.shift();
        addDebugLog(`Playing chunk: ${audioData.length} samples, queue remaining: ${audioQueue.current.length}`, 'audio');

        try {
            // Gemini sends audio at 24kHz, but device may use different rate (iOS uses 48kHz)
            const deviceSampleRate = audioContext.current.sampleRate;
            const contextState = audioContext.current.state;

            if (VERBOSE_LOGGING) {
                addDebugLog(`Audio playback: contextState=${contextState}, deviceRate=${deviceSampleRate}, inputSamples=${audioData.length}`, 'audio');
            }

            // iOS Safari: AudioContext may be suspended - must resume from user gesture
            if (contextState === 'suspended') {
                addDebugLog('AudioContext suspended - attempting resume...', 'warn');
                audioContext.current.resume().then(() => {
                    addDebugLog('AudioContext resumed successfully', 'audio');
                    // Retry playback after resume
                    isPlaying.current = false;
                    audioQueue.current.unshift(audioData); // Put back in queue
                    playNextChunk();
                }).catch(e => {
                    addDebugLog(`AudioContext resume failed: ${e.message}`, 'error');
                    isPlaying.current = false;
                });
                return;
            }

            const resampledData = resampleAudio(audioData, GEMINI_OUTPUT_SAMPLE_RATE, deviceSampleRate);

            if (VERBOSE_LOGGING) {
                addDebugLog(`Resampled: ${audioData.length} → ${resampledData.length} samples (${GEMINI_OUTPUT_SAMPLE_RATE}→${deviceSampleRate}Hz)`, 'audio');
            }

            const buffer = audioContext.current.createBuffer(1, resampledData.length, deviceSampleRate);
            buffer.getChannelData(0).set(resampledData);

            // Check peak amplitude of the data being played
            let peakAmp = 0;
            for (let i = 0; i < resampledData.length; i++) {
                const amp = Math.abs(resampledData[i]);
                if (amp > peakAmp) peakAmp = amp;
            }
            addDebugLog(`Playing peak: ${peakAmp.toFixed(3)}${peakAmp < 0.01 ? ' (SILENT!)' : ''}`, 'audio');

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;

            // Add gain node to boost audio (iOS Safari can be quiet)
            const gainNode = audioContext.current.createGain();
            gainNode.gain.value = 2.0; // Boost by 2x
            source.connect(gainNode);
            gainNode.connect(audioContext.current.destination);

            source.onended = () => {
                if (VERBOSE_LOGGING) addDebugLog(`Chunk played (${resampledData.length} samples)`, 'audio');
                isPlaying.current = false;
                if (audioQueue.current.length > 0) {
                    playNextChunk();
                } else {
                    addDebugLog('Audio playback complete', 'audio');
                    // Done speaking.
                    // If socket is closed (status logic handled here now), go to idle.
                    // If socket is open, go back to listening.
                    if (ws.current?.readyState === WebSocket.OPEN) {
                        setStatus('listening');
                    } else {
                        addDebugLog('Playback done and socket closed -> IDLE');
                        setStatus('idle');
                    }
                }
            };

            source.onerror = (e) => {
                addDebugLog(`AudioBufferSource error: ${e}`, 'error');
                isPlaying.current = false;
            };

            setStatus('speaking');
            source.start(0);
            if (VERBOSE_LOGGING) addDebugLog('AudioBufferSource started', 'audio');
        } catch (e) {
            addDebugLog(`Audio playback error: ${e.message}`, 'error');
            console.error('[AIBrain] Audio playback error:', e);
            isPlaying.current = false;
            // Try next chunk
            if (audioQueue.current.length > 0) {
                setTimeout(() => playNextChunk(), 100);
            }
        }
    }, [addDebugLog]);

    const sendToolResponse = useCallback((name, result, id) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            // Function Response format for Gemini Live API
            // CRITICAL: result must be the EXACT response object Gemini expects.
            // Do NOT double-wrap it in { result: ... } if it's already an object.
            let responseData = result;
            if (typeof result !== 'object' || result === null) {
                responseData = { result };
            }

            const response = {
                toolResponse: {
                    functionResponses: [{
                        name,
                        response: responseData,
                        id // CRITICAL: ID must match the call ID
                    }]
                }
            };
            addDebugLog(`Sending tool response for ${name} (id: ${id})`);
            ws.current.send(JSON.stringify(response));
        }
    }, [addDebugLog]);

    /**
     * Queue audio for playback - simple approach that works on Safari
     * Just add to queue and trigger playback
     */
    const queueAudioForPlayback = useCallback((audioData) => {
        // Check audio data validity - scan the WHOLE chunk for peak
        let maxAmp = 0;
        for (let i = 0; i < audioData.length; i++) {
            const amp = Math.abs(audioData[i]);
            if (amp > maxAmp) maxAmp = amp;
        }

        // Log peak amplitude for debugging (normal speech = 0.1-0.5+)
        const isLowAmplitude = maxAmp < 0.01;
        addDebugLog(`Queueing audio: ${audioData.length} samples, peak: ${maxAmp.toFixed(3)}${isLowAmplitude ? ' (LOW!)' : ''}`);

        // Add to queue
        audioQueue.current.push(audioData);

        // Start playback if not already playing
        playNextChunk();
    }, [addDebugLog, playNextChunk]);

    // Diagnostic: Play a test beep to verify audio output
    const playTestSound = useCallback(async () => {
        addDebugLog('Playing test sound (Web Audio + HTML5)...', 'audio');
        try {
            // Method 1: Web Audio API Oscillator
            if (!audioContext.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContext.current = new AudioContextClass();
            }
            if (audioContext.current.state === 'suspended') await audioContext.current.resume();

            const osc = audioContext.current.createOscillator();
            const gain = audioContext.current.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, audioContext.current.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioContext.current.currentTime + 0.5);

            gain.gain.setValueAtTime(0.5, audioContext.current.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioContext.current.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(audioContext.current.destination);

            osc.start();
            osc.stop(audioContext.current.currentTime + 0.5);
            addDebugLog('Web Audio test scheduled');

            // Method 2: HTML5 Audio Element (Fallback)
            // Using an external beep sound for cross-browser compatibility
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.volume = 1.0;
            audio.onplay = () => addDebugLog('HTML5 Audio: Playing...', 'audio');
            audio.onerror = (e) => addDebugLog(`HTML5 Audio Error: ${e.message || 'Unknown'}`, 'error');
            audio.play().catch(e => addDebugLog(`HTML5 Audio Play Error: ${e.message}`, 'error'));

        } catch (e) {
            addDebugLog(`Test sound failed: ${e.message}`, 'error');
        }
    }, [addDebugLog]);

    const handleWebSocketMessage = useCallback(async (event) => {
        try {
            // Handle Safari Blob responses
            let messageData = event.data;
            if (event.data instanceof Blob) {
                messageData = await event.data.text();
            }
            const data = JSON.parse(messageData);

            if (data.setupComplete) {
                addDebugLog('Setup complete - ready for voice input');
                setStatus('listening');
                return;
            }

            // Log raw message structure for debugging
            addDebugLog(`WS msg keys: ${Object.keys(data).join(', ')}`);

            if (data.serverContent?.modelTurn?.parts) {
                // AI is starting to respond - flush user transcript buffer first
                if (userTranscriptBuffer.current.trim()) {
                    const fullUserText = userTranscriptBuffer.current.trim();
                    addDebugLog(`User said: "${fullUserText.substring(0, 100)}..."`, 'transcript');
                    if (transcriptCallbackRef.current) {
                        transcriptCallbackRef.current('user', fullUserText);
                    }
                    userTranscriptBuffer.current = ''; // Clear buffer
                }

                for (const part of data.serverContent.modelTurn.parts) {
                    // Log what type of part we received
                    const partKeys = Object.keys(part).join(', ');
                    addDebugLog(`Part: ${partKeys}`);

                    // Audio response - check for inlineData with data first
                    // Gemini may send empty mimeType or various audio/* types
                    if (part.inlineData?.data) {
                        const mimeType = part.inlineData.mimeType || '';
                        // Accept any audio format or empty mimeType (Gemini sends 16-bit PCM)
                        if (mimeType.startsWith('audio/') || mimeType === '' || !mimeType) {
                            setStatus('speaking');
                            const audioData = base64ToFloat32(part.inlineData.data);
                            setAudioChunksReceived(prev => prev + 1);
                            addDebugLog(`Audio received: ${audioData.length} samples, mime="${mimeType}"`);
                            // Use new schedule-ahead playback
                            queueAudioForPlayback(audioData);
                        }
                    }
                    if (part.text) {
                        setLastTranscript(part.text);
                        addDebugLog(`Response: "${part.text.substring(0, 50)}..."`, 'response');
                        // Send AI response to training transcript if callback registered
                        if (transcriptCallbackRef.current) {
                            transcriptCallbackRef.current('ai', part.text);
                        }
                    }
                    // Handle function calls - Gemini sends { name, args }
                    if (part.functionCall) {
                        const funcName = part.functionCall.name || 'unknown';
                        const funcArgs = part.functionCall.args || {};
                        const funcId = part.functionCall.id; // Get ID from function call

                        addDebugLog(`Tool call: ${funcName}, id=${funcId}`, 'tool');
                        const r = await handleToolCall({ name: funcName, args: funcArgs });
                        sendToolResponse(funcName, r, funcId);
                    }
                }
            }

            if (data.serverContent?.turnComplete) {
                addDebugLog('Turn complete - listening');
                setStatus('listening');

                // Flush AI transcript buffer when turn completes
                if (aiTranscriptBuffer.current.trim()) {
                    const fullAIText = aiTranscriptBuffer.current.trim();
                    addDebugLog(`AI said: "${fullAIText.substring(0, 100)}..."`, 'transcript');
                    // Send complete AI transcript to training if callback registered
                    if (transcriptCallbackRef.current) {
                        transcriptCallbackRef.current('ai', fullAIText);
                    }
                    aiTranscriptBuffer.current = ''; // Clear buffer for next turn
                }
            }

            // Capture user input transcription (enabled via inputAudioTranscription config)
            // Buffer the transcription until turn completes (Gemini sends word-by-word)
            if (data.serverContent?.inputTranscription) {
                const userText = data.serverContent.inputTranscription.text;
                if (userText) {
                    // Accumulate user speech in buffer
                    userTranscriptBuffer.current += (userTranscriptBuffer.current ? ' ' : '') + userText;
                    addDebugLog(`User (buffering): "${userText}"`, 'transcript');
                    setLastTranscript(`You: ${userTranscriptBuffer.current}`);
                }
            }

            // Capture AI output transcription (enabled via outputAudioTranscription config)
            // Buffer AI transcription until turn completes (may come in chunks)
            if (data.serverContent?.outputTranscription) {
                const aiText = data.serverContent.outputTranscription.text;
                if (aiText) {
                    // Accumulate AI speech in buffer
                    aiTranscriptBuffer.current += (aiTranscriptBuffer.current ? ' ' : '') + aiText;
                    addDebugLog(`AI (buffering): "${aiText}"`, 'transcript');
                    setLastTranscript(`AI: ${aiTranscriptBuffer.current}`);
                }
            }

            // Handle toolCall at root level - Gemini Live sends { toolCall: { functionCalls: [...] } }
            if (data.toolCall) {
                addDebugLog(`Tool call received: ${JSON.stringify(data.toolCall).substring(0, 200)}`, 'tool');

                // Gemini Live sends functionCalls array inside toolCall
                const functionCalls = data.toolCall.functionCalls || [];
                for (const fc of functionCalls) {
                    const funcName = fc.name;
                    const funcArgs = fc.args || {};
                    const funcId = fc.id; // Get ID

                    addDebugLog(`Executing tool: ${funcName}, id=${funcId}`, 'tool');
                    const r = await handleToolCall({ name: funcName, args: funcArgs });
                    sendToolResponse(funcName, r, funcId);
                }
            }
        } catch (e) {
            addDebugLog(`Message error: ${e.message}`, 'error');
        }
    }, [handleToolCall, sendToolResponse, queueAudioForPlayback, addDebugLog]);

    // Recording state ref (to avoid stale closures)
    const recordingActive = useRef(false);

    // Start Web Speech API recognition for transcription
    // NOTE: This is DISABLED for now as it conflicts with Gemini audio capture
    // Both try to use the microphone simultaneously which causes issues
    const startSpeechRecognition = useCallback(() => {
        // DISABLED - Web Speech API conflicts with Gemini audio stream
        // The browser can't share the microphone between both systems reliably
        addDebugLog('Speech recognition disabled (conflicts with Gemini audio)', 'info');
        return;

        /* Original implementation preserved for reference:
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addDebugLog('Web Speech API not available', 'warn');
            return;
        }
        // ... rest of implementation
        */
    }, [addDebugLog]);

    // Stop Web Speech API recognition
    const stopSpeechRecognition = useCallback(() => {
        if (speechRecognition.current) {
            try {
                speechRecognition.current.stop();
            } catch (e) {
                // Ignore
            }
            speechRecognition.current = null;
            addDebugLog('Speech recognition stopped');
        }
    }, [addDebugLog]);

    const startAudioCapture = useCallback(() => {
        if (!mediaStream.current || !audioContext.current) {
            addDebugLog('Cannot start audio capture - missing stream or context', 'error');
            return;
        }

        recordingActive.current = true;
        sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);

        // Get device's actual sample rate (iOS uses 48kHz, desktop may use 44.1kHz or 48kHz)
        const deviceSampleRate = audioContext.current.sampleRate;
        addDebugLog(`Device sample rate: ${deviceSampleRate}Hz, downsampling to ${GEMINI_INPUT_SAMPLE_RATE}Hz`);

        // Use ScriptProcessor (deprecated but more iOS compatible than AudioWorklet)
        // Buffer size 2048 = ~42ms latency at 48kHz (reduced from 4096 = ~85ms for faster response)
        const processor = audioContext.current.createScriptProcessor(2048, 1, 1);
        processorNode.current = processor;

        let chunkCount = 0;
        processor.onaudioprocess = (e) => {
            if (!recordingActive.current || ws.current?.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);

            // Calculate audio level (RMS) for debug display
            let sum = 0;
            let nonZeroSamples = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
                if (Math.abs(inputData[i]) > 0.0001) nonZeroSamples++;
            }
            // Warn if completely silent for the first few chunks
            if (nonZeroSamples === 0 && chunkCount > 10 && chunkCount % 50 === 0) {
                addDebugLog(`WARNING: Input buffer is completely silent! (zeros)`, 'warn');
                setInputSilenceWarning(true);
            } else if (nonZeroSamples > 0) {
                setInputSilenceWarning(false);
            }
            const rms = Math.sqrt(sum / inputData.length);
            const level = Math.min(100, Math.round(rms * 500)); // Scale to 0-100
            setAudioLevel(level);

            // Downsample to 16kHz for Gemini (device may be 48kHz on iOS)
            const downsampledData = downsampleForGemini(inputData, deviceSampleRate);
            const pcmData = floatTo16BitPCM(downsampledData);

            // Convert to base64
            const bytes = new Uint8Array(pcmData.buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Audio = btoa(binary);

            // Send to Gemini using the CORRECT format (audio, not mediaChunks!)
            // This is the format that worked in the previous version
            ws.current.send(JSON.stringify({
                realtimeInput: {
                    audio: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }
                }
            }));

            chunkCount++;
            setAudioChunksSent(chunkCount);

            // Log every 50 chunks (~3 seconds of audio)
            if (chunkCount === 1) {
                addDebugLog(`First chunk sent (${pcmData.length} samples, level: ${level}%)`);
            } else if (chunkCount % 50 === 0) {
                addDebugLog(`Sent ${chunkCount} audio chunks, level: ${level}%`);
            }
        };

        sourceNode.current.connect(processor);
        processor.connect(audioContext.current.destination);
        addDebugLog('Audio processing started');

        // Start speech recognition for transcription (in parallel)
        startSpeechRecognition();
    }, [addDebugLog, startSpeechRecognition, downsampleForGemini]);

    const stopAudioCapture = useCallback(() => {
        recordingActive.current = false;

        // Stop media stream
        if (mediaStream.current) {
            mediaStream.current.getTracks().forEach(track => track.stop());
            mediaStream.current = null;
        }

        // Disconnect audio nodes
        if (processorNode.current) {
            processorNode.current.disconnect();
            processorNode.current = null;
        }
        if (sourceNode.current) {
            sourceNode.current.disconnect();
            sourceNode.current = null;
        }

        setAudioLevel(0);
        addDebugLog('Audio capture stopped');

        // Stop speech recognition
        stopSpeechRecognition();
    }, [addDebugLog, stopSpeechRecognition]);

    const startSession = useCallback(async () => {
        addDebugLog('startSession called');
        if (status !== 'idle' && status !== 'error') {
            addDebugLog('Session already active, ignoring');
            return;
        }
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            setError('No API key');
            setStatus('error');
            addDebugLog('No API key configured', 'error');
            return;
        }

        try {
            setStatus('connecting');
            setError(null);
            clearDebugLog();

            // CRITICAL FIX: Always create a FRESH AudioContext for a new session
            // This resolves issues where the context becomes stale/suspended/silent
            addDebugLog('Creating FRESH AudioContext...');

            // Close existing if open
            if (audioContext.current) {
                try {
                    await audioContext.current.close();
                } catch (e) { /* ignore */ }
                audioContext.current = null;
            }

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();

            if (audioContext.current.state === 'suspended') {
                addDebugLog('Resuming suspended AudioContext...');
                await audioContext.current.resume();
            }
            addDebugLog(`AudioContext ready. Sample rate: ${audioContext.current.sampleRate}Hz, state: ${audioContext.current.state}`);

            // Reset audio queue
            audioQueue.current = [];
            isPlaying.current = false;

            // Request microphone - iOS Safari needs specific config
            // Request microphone - using Legacy constraints to prevent feedback loop
            // Feedback loop causes browser to auto-mute speakers, killing output
            addDebugLog('Requesting microphone (Legacy constraints)...');
            mediaStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            const audioTrack = mediaStream.current.getAudioTracks()[0];
            addDebugLog(`Microphone acquired: ${audioTrack?.label || 'default mic'}`);
            addDebugLog(`Track state: enabled=${audioTrack?.enabled}, muted=${audioTrack?.muted}, readyState=${audioTrack?.readyState}`);

            // Monitor track ended event
            audioTrack.onended = () => addDebugLog('Microphone track ended unexpectedly', 'error');
            audioTrack.onmute = () => addDebugLog('Microphone track muted by system', 'warn');
            audioTrack.onunmute = () => addDebugLog('Microphone track unmuted', 'info');

            // Acquire Screen Wake Lock to prevent phone from sleeping during conversation
            if ('wakeLock' in navigator) {
                try {
                    wakeLock.current = await navigator.wakeLock.request('screen');
                    addDebugLog('Screen Wake Lock acquired - phone will stay awake');
                    wakeLock.current.addEventListener('release', () => {
                        addDebugLog('Screen Wake Lock released', 'info');
                    });
                } catch (err) {
                    addDebugLog(`Wake Lock failed: ${err.message}`, 'warn');
                }
            } else {
                addDebugLog('Wake Lock API not supported on this device', 'warn');
            }

            // Connect WebSocket
            addDebugLog('Connecting to Gemini Live API...');
            const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`);
            ws.current = socket;

            socket.onopen = () => {
                addDebugLog('WebSocket connected, sending setup...');
                const voiceSettings = getSettings();
                // Get model from settings or use default
                // IMPORTANT: Validate that the model is supported for bidiGenerateContent (Live API)
                // Only native-audio models work with the Live API
                // Only models that support bidiGenerateContent (Live API / WebSocket)
                const VALID_LIVE_MODELS = [
                    'gemini-2.0-flash-exp',
                    'gemini-2.5-flash-native-audio-preview-12-2025',
                    'gemini-2.5-flash-exp-native-audio-thinking-dialog',
                    'gemini-2.5-flash-preview-native-audio-dialog',
                ];
                const LIVE_API_FALLBACK = 'gemini-2.5-flash-native-audio-preview-12-2025';
                let selectedModel = localStorage.getItem('ai_model') || DEFAULT_MODEL;
                // If stored model isn't valid for Live API, fall back to known-good model
                if (!VALID_LIVE_MODELS.includes(selectedModel)) {
                    addDebugLog(`Model "${selectedModel}" not valid for Live API, falling back to ${LIVE_API_FALLBACK}`);
                    selectedModel = LIVE_API_FALLBACK;
                }
                const setupConfig = {
                    setup: {
                        model: `models/${selectedModel}`,
                        generationConfig: {
                            // Use AUDIO only - gemini-2.5 native audio model doesn't support TEXT modality
                            // Transcription is handled via outputAudioTranscription/inputAudioTranscription
                            responseModalities: ['AUDIO'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: voiceSettings.voice }
                                }
                            },
                            // SPEED OPTIMIZATION: Disable thinking mode for instant responses
                            // Thinking adds latency while model "deliberates" - we prioritize speed
                            thinkingConfig: {
                                thinkingBudget: 0  // 0 = disabled, removes thinking latency
                            }
                        },
                        // NOTE: Transcription configs are OMITTED for gemini-2.5-flash-native-audio
                        // Per GitHub issue googleapis/js-genai#1212, these cause connection issues
                        // and don't actually return transcriptions anyway (known bug).
                        // Transcripts will come from the TEXT parts when using gemini-2.0-flash-exp,
                        // or we capture from outputTranscription when/if Google fixes it.
                        systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
                        // CRITICAL: Tools must be a single array with ONE functionDeclarations containing ALL functions
                        // NOT multiple objects each with their own functionDeclarations array!
                        tools: [{
                            functionDeclarations: tools.map(t => ({
                                name: t.name,
                                description: t.description,
                                parameters: t.parameters
                            }))
                        }],
                        realtimeInputConfig: {
                            automaticActivityDetection: {
                                disabled: false,
                                // START: 1=HIGH (triggers easily), 2=LOW (needs clear speech)
                                startOfSpeechSensitivity: voiceSettings.vadStartSensitivity === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW',
                                // END: 1=HIGH (quick cutoff), 2=LOW (patient, waits longer)
                                // User setting: 1=Quick, 2=Patient
                                endOfSpeechSensitivity: voiceSettings.vadEndSensitivity === 1 ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW',
                                // Padding before speech starts (catch beginning of utterance)
                                prefixPaddingMs: 200,  // Reduced from 300ms for faster detection
                                // How long to wait after silence before ending turn
                                // SPEED OPTIMIZED: 500ms base + 250ms if patient mode = 500-750ms (was 1000-1500ms)
                                silenceDurationMs: 500 + (voiceSettings.vadEndSensitivity === 2 ? 250 : 0)
                            }
                        }
                    }
                };
                socket.send(JSON.stringify(setupConfig));
                addDebugLog(`Setup sent. Model: ${selectedModel}, Voice: ${voiceSettings.voice}, VAD: start=${voiceSettings.vadStartSensitivity}, end=${voiceSettings.vadEndSensitivity}`);
                setStatus('connected');
                startAudioCapture();
            };

            socket.onmessage = handleWebSocketMessage;

            socket.onerror = (e) => {
                addDebugLog('WebSocket error', 'error');
                setError('Connection error');
                setStatus('error');
            };

            socket.onclose = (e) => {
                addDebugLog(`WebSocket closed: ${e.code} ${e.reason || ''}`);

                // Code 1000 is generic "normal closure" but if we didn't initiate it, it might be a server timeout or limit
                if (e.code === 1000 && status !== 'idle') {
                    addDebugLog('Session ended by server (Model may have finished turn)', 'warn');
                }

                // CRITICAL FIX: If audio is still playing or queued, DON'T switch to idle yet.
                // Let playNextChunk handle the transition when it finishes.
                if (isPlaying.current || audioQueue.current.length > 0) {
                    addDebugLog('Audio still playing - deferring IDLE state until finish', 'info');
                } else {
                    setStatus('idle');
                }

                stopAudioCapture();
            };

        } catch (e) {
            addDebugLog(`Error: ${e.message}`, 'error');
            setError(e.message);
            setStatus('error');
        }
    }, [status, getSettings, buildSystemInstruction, tools, startAudioCapture, handleWebSocketMessage, stopAudioCapture, addDebugLog, clearDebugLog]);

    const endSession = useCallback(() => {
        console.log('[AIBrain] Ending session');
        stopAudioCapture();
        ws.current?.close(); ws.current = null;

        // Clear audio playback state
        audioQueue.current = [];
        isPlaying.current = false;

        // Release Screen Wake Lock
        if (wakeLock.current) {
            wakeLock.current.release().catch(() => {});
            wakeLock.current = null;
        }

        setStatus('idle');
        setError(null);
    }, [stopAudioCapture]);

    return (
        <AIBrainContext.Provider value={{
            status, error, isConfigured, audioLevel, inputSilenceWarning, lastTranscript, startSession, endSession, playTestSound,
            // Debug state
            debugLog, clearDebugLog, audioChunksSent, audioChunksReceived,
            // Platform info
            platformInfo: { isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent), isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) },
            // Training mode integration
            setTranscriptCallback: (callback) => { transcriptCallbackRef.current = callback; },
            clearTranscriptCallback: () => { transcriptCallbackRef.current = null; },
            // Set training mode context for specialized prompts
            enterTrainingMode: (trainingContext) => {
                console.log('[AIBrain] Entering training mode:', trainingContext);
                trainingContextRef.current = trainingContext;
                setIsTrainingModeInternal(true);
            },
            exitTrainingMode: () => {
                console.log('[AIBrain] Exiting training mode');
                trainingContextRef.current = null;
                setIsTrainingModeInternal(false);
            },
            isTrainingMode,
        }}>
            {children}
        </AIBrainContext.Provider>
    );
};

export const useAIBrain = () => { const ctx = useContext(AIBrainContext); if (!ctx) throw new Error('useAIBrain requires AIBrainProvider'); return ctx; };
export const useVoiceCopilot = useAIBrain;
export default AIBrainContext;
