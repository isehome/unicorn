import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';
import { supabase } from '../lib/supabase';
import { getToolsForContext, PAGE_CONTEXTS } from '../services/voiceToolRegistry';

/**
 * useAgentContext - Provides location awareness and global navigation tools to the AI agent
 *
 * This hook should be used ONCE at the app level (in App.js or a layout component)
 * to give the agent awareness of where the user is in the app.
 *
 * The agent can:
 * 1. Know what page/project the user is viewing
 * 2. Navigate to different projects or sections
 * 3. List available projects
 * 4. Get project details
 *
 * IMPORTANT: Uses refs for navigate to prevent stale closure issues.
 * Tool execute functions read from refs to always get the current navigate function.
 */
export const useAgentContext = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // ===== REFS FOR STABLE CALLBACKS =====
    // These refs ensure tool execute functions always have access to current navigate
    const navigateRef = useRef(navigate);
    const locationRef = useRef(location);

    // Keep refs updated
    useEffect(() => {
        navigateRef.current = navigate;
        locationRef.current = location;
    }, [navigate, location]);

    // Extract project ID from URL path (more reliable than useParams at app level)
    const extractProjectId = (path) => {
        // Match various project URL patterns
        const patterns = [
            /\/pm-project\/([a-f0-9-]+)/i,
            /\/pm\/project\/([a-f0-9-]+)/i,
            /\/project\/([a-f0-9-]+)/i,
            /\/projects\/([a-f0-9-]+)/i
        ];
        for (const pattern of patterns) {
            const match = path.match(pattern);
            if (match) return match[1];
        }
        return null;
    };

    // Parse current location into structured context
    const currentContext = useMemo(() => {
        const path = location.pathname;
        const projectId = extractProjectId(path);

        // Determine current section
        let section = 'unknown';
        let subsection = null;

        if (path === '/' || path === '/pm-dashboard') {
            section = 'dashboard';
        } else if (path.includes('/project/') || path.includes('/pm-project/') || path.includes('/pm/project/')) {
            section = 'project';
            if (path.includes('/equipment')) subsection = 'equipment';
            else if (path.includes('/shades')) subsection = 'shades';
            else if (path.includes('/procurement')) subsection = 'procurement';
            else if (path.includes('/receiving')) subsection = 'receiving';
            else if (path.includes('/issues') || path.includes('/pm-issues')) subsection = 'issues';
            else if (path.includes('/wire-drops')) subsection = 'wire-drops';
            else if (path.includes('/floor-plan')) subsection = 'floor-plan';
            else if (path.includes('/reports')) subsection = 'reports';
            else if (path.includes('/secure-data')) subsection = 'secure-data';
            else subsection = 'overview';
        } else if (path === '/prewire-mode') {
            section = 'prewire';
        } else if (path === '/wire-drops' || path === '/wire-drops-list') {
            section = 'wire-drops';
        } else if (path === '/issues') {
            section = 'issues';
        } else if (path === '/todos') {
            section = 'todos';
        } else if (path === '/people') {
            section = 'people';
        } else if (path === '/vendors') {
            section = 'vendors';
        } else if (path === '/parts' || path === '/global-parts') {
            section = 'parts';
        } else if (path === '/settings') {
            section = 'settings';
        }

        return {
            path,
            section,
            subsection,
            projectId: projectId || null,
            isInProject: !!projectId
        };
    }, [location.pathname]);

    // Fetch project details when in a project
    const fetchProjectDetails = useCallback(async (projectId) => {
        if (!projectId) return null;

        const { data, error } = await supabase
            .from('projects')
            .select('id, name, address, status, project_manager')
            .eq('id', projectId)
            .single();

        if (error) {
            console.error('[AgentContext] Error fetching project:', error);
            return null;
        }
        return data;
    }, []);

    // Fetch rooms and shades for a project (for window treatment context)
    const fetchProjectRoomsAndShades = useCallback(async (projectId) => {
        if (!projectId) return null;

        try {
            // Fetch rooms
            const { data: rooms, error: roomsError } = await supabase
                .from('project_rooms')
                .select('id, name')
                .eq('project_id', projectId)
                .order('name');

            if (roomsError) throw roomsError;

            // Fetch shades with room info
            const { data: shades, error: shadesError } = await supabase
                .from('project_shades')
                .select(`
                    id, name, room_id,
                    m1_width_top, m1_width_middle, m1_width_bottom, m1_height, m1_mount_depth,
                    m2_width_top, m2_width_middle, m2_width_bottom, m2_height, m2_mount_depth,
                    room:project_rooms(id, name)
                `)
                .eq('project_id', projectId)
                .order('name');

            if (shadesError) throw shadesError;

            // Group shades by room
            const roomsWithShades = rooms.map(room => {
                const roomShades = shades.filter(s => s.room_id === room.id);
                return {
                    roomName: room.name,
                    roomId: room.id,
                    shadeCount: roomShades.length,
                    shades: roomShades.map(s => ({
                        id: s.id,
                        name: s.name,
                        hasM1: Boolean(s.m1_width_top || s.m1_height),
                        hasM2: Boolean(s.m2_width_top || s.m2_height),
                        needsMeasuring: !s.m1_width_top && !s.m1_height
                    }))
                };
            });

            // Summary stats
            const totalShades = shades.length;
            const measuredM1 = shades.filter(s => s.m1_width_top || s.m1_height).length;
            const measuredM2 = shades.filter(s => s.m2_width_top || s.m2_height).length;

            return {
                rooms: roomsWithShades,
                totalRooms: rooms.length,
                totalShades,
                measuredM1,
                measuredM2,
                pendingM1: totalShades - measuredM1
            };
        } catch (err) {
            console.error('[AgentContext] Error fetching rooms/shades:', err);
            return null;
        }
    }, []);

    // Global tools that are always available
    const globalTools = useMemo(() => [
        {
            name: "get_current_location",
            description: `CALL THIS FIRST when the session starts. Returns the user's current context including:
- Which project they're viewing (if any)
- Which section (window treatments, equipment, wire drops, etc.)
- Full details about windows/rooms if in window treatment section
This app is DATABASE-DRIVEN: Projects contain Rooms, Rooms contain Windows (also called Shades).
"Windows" and "Shades" are the SAME THING - they are window treatments that need measuring.`,
            parameters: { type: "object", properties: {} },
            execute: async () => {
                let projectDetails = null;
                let roomsAndShades = null;

                if (currentContext.projectId) {
                    projectDetails = await fetchProjectDetails(currentContext.projectId);

                    // Fetch rich context for shades/windows section
                    if (currentContext.subsection === 'shades') {
                        roomsAndShades = await fetchProjectRoomsAndShades(currentContext.projectId);
                    }
                }

                // Generate a human-readable description of where we are
                let locationDescription = '';
                if (currentContext.section === 'dashboard') {
                    locationDescription = 'You are on the main Dashboard showing all projects.';
                } else if (currentContext.section === 'project') {
                    const projectName = projectDetails?.name || 'a project';
                    if (currentContext.subsection === 'shades') {
                        // Provide rich context about windows/shades
                        if (roomsAndShades) {
                            const { totalRooms, totalShades, measuredM1, pendingM1 } = roomsAndShades;
                            locationDescription = `You are in the Window Treatment section for project "${projectName}". ` +
                                `This project has ${totalRooms} rooms with ${totalShades} windows total. ` +
                                `${measuredM1} windows have been measured, ${pendingM1} still need measuring.`;
                        } else {
                            locationDescription = `You are in the Window Treatment section for project "${projectName}".`;
                        }
                    } else if (currentContext.subsection === 'equipment') {
                        locationDescription = `You are viewing Equipment for ${projectName}.`;
                    } else if (currentContext.subsection === 'wire-drops') {
                        locationDescription = `You are in Wire Drops for ${projectName}.`;
                    } else if (currentContext.subsection === 'issues') {
                        locationDescription = `You are viewing Issues for ${projectName}.`;
                    } else {
                        locationDescription = `You are viewing the overview for ${projectName}.`;
                    }
                } else if (currentContext.section === 'prewire') {
                    locationDescription = 'You are in Prewire Mode - a dedicated view for technicians to print wire drop labels and capture prewire photos. You can help print labels, filter by room, or navigate to specific wire drops.';
                } else if (currentContext.section === 'settings') {
                    locationDescription = 'You are on the Settings page.';
                } else if (currentContext.section === 'issues') {
                    locationDescription = 'You are on the global Issues page.';
                } else if (currentContext.section === 'todos') {
                    locationDescription = 'You are on the Todos page.';
                } else if (currentContext.section === 'people') {
                    locationDescription = 'You are on the People/Contacts page.';
                } else if (currentContext.section === 'vendors') {
                    locationDescription = 'You are on the Vendors page.';
                } else if (currentContext.section === 'parts') {
                    locationDescription = 'You are on the Parts catalog page.';
                } else {
                    locationDescription = `You are on the ${currentContext.section} page.`;
                }

                // Build response with rich context
                const response = {
                    locationDescription,
                    currentContext: {
                        section: currentContext.section,
                        subsection: currentContext.subsection,
                        projectId: currentContext.projectId
                    },
                    // Database entity hierarchy explanation
                    dataModel: "This app manages Projects. Each Project has Rooms. Each Room has Windows (also called Shades) that need measuring. Use open_project, open_project_section, or open_window to navigate to specific database records.",
                    project: projectDetails ? {
                        id: projectDetails.id,
                        name: projectDetails.name,
                        address: projectDetails.address,
                        status: projectDetails.status
                    } : null,
                    availableActions: getAvailableActions(currentContext),
                    hint: "Tell the user where they are and ask how you can help."
                };

                // Add room/shade context when in shades section
                if (roomsAndShades) {
                    response.windowTreatments = {
                        terminology: "'Windows' and 'Shades' are the SAME THING in this app - window treatments that need measuring.",
                        summary: {
                            totalRooms: roomsAndShades.totalRooms,
                            totalWindows: roomsAndShades.totalShades,
                            measured: roomsAndShades.measuredM1,
                            pendingMeasurement: roomsAndShades.pendingM1
                        },
                        rooms: roomsAndShades.rooms.map(r => ({
                            name: r.roomName,
                            windowCount: r.shadeCount,
                            windows: r.shades.map(s => ({
                                id: s.id,
                                name: s.name,
                                hasMeasurements: s.hasM1,
                                needsMeasuring: s.needsMeasuring
                            }))
                        }))
                    };
                    response.hint = "You can help measure windows. Use open_window with a window ID to start measuring, or ask which room/window they want to work on.";
                }

                return response;
            }
        },
        // ===== DATABASE ENTITY TOOLS =====
        // These tools work with database records, not URLs
        {
            name: "list_projects",
            description: "Query the database for all projects. Returns project records with IDs you can use with open_project.",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        description: "Optional filter: 'active', 'completed', 'on-hold', or 'all' (default)"
                    }
                }
            },
            execute: async ({ status = 'all' }) => {
                let query = supabase
                    .from('projects')
                    .select('id, name, address, status')
                    .order('name');

                if (status && status !== 'all') {
                    query = query.eq('status', status);
                }

                const { data, error } = await query.limit(20);

                if (error) {
                    return { error: error.message };
                }

                return {
                    projects: data.map(p => ({
                        id: p.id,
                        name: p.name,
                        address: p.address,
                        status: p.status
                    })),
                    count: data.length,
                    hint: "Use open_project with a project ID or name to view a project"
                };
            }
        },
        {
            name: "open_project",
            description: "Open a project from the database. Can search by name or use ID directly. Optionally go to a specific section within the project.",
            parameters: {
                type: "object",
                properties: {
                    projectId: {
                        type: "string",
                        description: "The project UUID (if you have it from get_current_location or list_projects)"
                    },
                    projectName: {
                        type: "string",
                        description: "Search for project by name (partial match works)"
                    },
                    section: {
                        type: "string",
                        description: "Which section to open: 'overview' (default), 'windows' (or 'shades'), 'equipment', 'wire-drops', 'issues', 'procurement', 'receiving'"
                    }
                }
            },
            execute: async ({ projectId, projectName, section = 'overview' }) => {
                let targetId = projectId;
                let targetName = '';

                // If name provided instead of ID, search for it
                if (!targetId && projectName) {
                    const { data, error } = await supabase
                        .from('projects')
                        .select('id, name')
                        .ilike('name', `%${projectName}%`)
                        .limit(5);

                    if (error || !data?.length) {
                        return {
                            success: false,
                            error: `No project found matching "${projectName}"`,
                            hint: "Use list_projects to see all available projects"
                        };
                    }

                    if (data.length > 1) {
                        return {
                            success: false,
                            error: `Multiple projects match "${projectName}"`,
                            matches: data.map(p => ({ id: p.id, name: p.name })),
                            hint: "Be more specific or use the project ID"
                        };
                    }

                    targetId = data[0].id;
                    targetName = data[0].name;
                }

                if (!targetId) {
                    return { success: false, error: "Please provide projectId or projectName" };
                }

                // Normalize section name - all window treatment terms map to 'shades'
                let normalizedSection = section.toLowerCase();
                const windowTerms = ['windows', 'window treatments', 'window coverings', 'blinds', 'shades'];
                if (windowTerms.includes(normalizedSection) || normalizedSection.includes('window') || normalizedSection.includes('blind') || normalizedSection.includes('shade')) {
                    normalizedSection = 'shades';
                }

                // Build the URL based on section
                const sectionMap = {
                    'overview': `/pm-project/${targetId}`,
                    'shades': `/projects/${targetId}/shades`,
                    'equipment': `/projects/${targetId}/equipment`,
                    'procurement': `/projects/${targetId}/procurement`,
                    'receiving': `/projects/${targetId}/receiving`,
                    'issues': `/project/${targetId}/pm-issues`,
                    'wire-drops': `/projects/${targetId}/wire-drops`,
                    'floor-plan': `/projects/${targetId}/floor-plan`,
                    'reports': `/projects/${targetId}/reports`
                };

                const url = sectionMap[normalizedSection] || `/pm-project/${targetId}`;

                console.log('[AgentContext] open_project: Navigating to', url);
                navigateRef.current(url);

                // Friendly section name for response
                const sectionNames = {
                    'overview': 'project overview',
                    'shades': 'window treatments',
                    'equipment': 'equipment',
                    'procurement': 'procurement',
                    'receiving': 'receiving',
                    'issues': 'issues',
                    'wire-drops': 'wire drops',
                    'floor-plan': 'floor plan',
                    'reports': 'reports'
                };

                return {
                    success: true,
                    message: `Opening ${sectionNames[normalizedSection] || normalizedSection}${targetName ? ` for ${targetName}` : ''}`,
                    projectId: targetId
                };
            }
        },
        {
            name: "open_window",
            description: "Open a specific window/shade for measuring. Use the window ID from get_current_location's windowTreatments data, or search by name within the current project.",
            parameters: {
                type: "object",
                properties: {
                    windowId: {
                        type: "string",
                        description: "The window/shade UUID from windowTreatments data"
                    },
                    windowName: {
                        type: "string",
                        description: "Search for window by name within current project (partial match)"
                    }
                }
            },
            execute: async ({ windowId, windowName }) => {
                let targetId = windowId;
                let projectId = currentContext.projectId;

                // If searching by name, need to find the window in current project
                if (!targetId && windowName && projectId) {
                    const { data, error } = await supabase
                        .from('project_shades')
                        .select('id, name, project_id')
                        .eq('project_id', projectId)
                        .ilike('name', `%${windowName}%`)
                        .limit(5);

                    if (error || !data?.length) {
                        return {
                            success: false,
                            error: `No window found matching "${windowName}" in this project`,
                            hint: "Check windowTreatments.rooms in get_current_location for available windows"
                        };
                    }

                    if (data.length > 1) {
                        return {
                            success: false,
                            error: `Multiple windows match "${windowName}"`,
                            matches: data.map(s => ({ id: s.id, name: s.name })),
                            hint: "Be more specific or use the window ID"
                        };
                    }

                    targetId = data[0].id;
                    projectId = data[0].project_id;
                }

                if (!targetId) {
                    return {
                        success: false,
                        error: "Please provide windowId or windowName. Make sure you're in a project first.",
                        hint: "Use get_current_location to see available windows in the current project"
                    };
                }

                // Get project ID if we don't have it
                if (!projectId) {
                    const { data: shade } = await supabase
                        .from('project_shades')
                        .select('project_id')
                        .eq('id', targetId)
                        .single();

                    if (shade) {
                        projectId = shade.project_id;
                    }
                }

                const url = `/projects/${projectId}/shades/${targetId}`;
                console.log('[AgentContext] open_window: Navigating to', url);
                navigateRef.current(url);

                return {
                    success: true,
                    message: "Opening window for measuring",
                    windowId: targetId
                };
            }
        },
        {
            name: "go_to_app_section",
            description: "Navigate to a main app section (not project-specific). Use open_project for project sections.",
            parameters: {
                type: "object",
                properties: {
                    section: {
                        type: "string",
                        description: "Section: 'dashboard', 'prewire', 'settings', 'issues', 'todos', 'people', 'vendors', 'parts'"
                    }
                },
                required: ["section"]
            },
            execute: async ({ section }) => {
                const sectionMap = {
                    'dashboard': '/pm-dashboard',
                    'home': '/pm-dashboard',
                    'issues': '/issues',
                    'todos': '/todos',
                    'people': '/people',
                    'vendors': '/vendors',
                    'parts': '/global-parts',
                    'settings': '/settings',
                    'prewire': '/prewire-mode',
                    'prewire-mode': '/prewire-mode'
                };

                const url = sectionMap[section.toLowerCase()];
                if (!url) {
                    return {
                        success: false,
                        error: `Unknown section: ${section}`,
                        availableSections: Object.keys(sectionMap)
                    };
                }

                console.log('[AgentContext] go_to_app_section: Navigating to', url);
                navigateRef.current(url);
                return { success: true, message: `Going to ${section}` };
            }
        },
        {
            name: "go_back",
            description: "Go back to the previous view.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                console.log('[AgentContext] go_back: Navigating back');
                navigateRef.current(-1);
                return { success: true, message: "Going back" };
            }
        }
    ], [currentContext, fetchProjectDetails, fetchProjectRoomsAndShades]); // Added fetchProjectRoomsAndShades

    // Helper to determine what actions are available in current context
    // Uses the centralized voice tool registry for scalability
    const getAvailableActions = (ctx) => {
        // Map our context to the registry's page context
        let pageContext = PAGE_CONTEXTS.GLOBAL;

        if (ctx.section === 'prewire') {
            pageContext = PAGE_CONTEXTS.PREWIRE;
        } else if (ctx.subsection === 'shades') {
            // Check if we're on shade detail or shade list based on URL
            const path = locationRef.current?.pathname || '';
            pageContext = path.includes('/measure') ? PAGE_CONTEXTS.SHADE_DETAIL : PAGE_CONTEXTS.SHADE_LIST;
        } else if (ctx.subsection === 'equipment') {
            pageContext = PAGE_CONTEXTS.EQUIPMENT;
        } else if (ctx.section === 'dashboard') {
            pageContext = PAGE_CONTEXTS.DASHBOARD;
        } else if (ctx.section === 'settings') {
            pageContext = PAGE_CONTEXTS.SETTINGS;
        } else if (ctx.isInProject) {
            pageContext = PAGE_CONTEXTS.PROJECT;
        }

        // Get tools from registry for this context
        return getToolsForContext(pageContext);
    };

    // Register/update global tools when they change
    useEffect(() => {
        try {
            console.log('[AgentContext] Registering global navigation tools');
            registerTools(globalTools);
        } catch (err) {
            console.error('[AgentContext] Failed to register tools:', err);
        }

        return () => {
            try {
                console.log('[AgentContext] Unregistering global navigation tools');
                unregisterTools(globalTools.map(t => t.name));
            } catch (err) {
                console.error('[AgentContext] Failed to unregister tools:', err);
            }
        };
    }, [globalTools, registerTools, unregisterTools]);

    return {
        currentContext,
        fetchProjectDetails
    };
};

export default useAgentContext;
