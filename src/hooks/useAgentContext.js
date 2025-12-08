import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';
import { supabase } from '../lib/supabase';

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
        } else if (path === '/wire-drops' || path === '/wire-drops-list' || path === '/prewire-mode') {
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

    // Global tools that are always available
    const globalTools = useMemo(() => [
        {
            name: "get_current_location",
            description: "Get information about where the user currently is in the app - which page, which project (if any), etc.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                let projectDetails = null;
                if (currentContext.projectId) {
                    projectDetails = await fetchProjectDetails(currentContext.projectId);
                }

                return {
                    section: currentContext.section,
                    subsection: currentContext.subsection,
                    isInProject: currentContext.isInProject,
                    project: projectDetails ? {
                        id: projectDetails.id,
                        name: projectDetails.name,
                        address: projectDetails.address,
                        status: projectDetails.status
                    } : null,
                    availableActions: getAvailableActions(currentContext)
                };
            }
        },
        {
            name: "list_projects",
            description: "Get a list of all available projects the user can navigate to.",
            parameters: {
                type: "object",
                properties: {
                    status: {
                        type: "string",
                        description: "Optional filter by status: 'active', 'completed', 'on-hold', or 'all' (default)"
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
                    hint: "Use navigate_to_project with a project ID to go to a specific project"
                };
            }
        },
        {
            name: "navigate_to_project",
            description: "Navigate to a specific project by ID or by searching by name.",
            parameters: {
                type: "object",
                properties: {
                    projectId: {
                        type: "string",
                        description: "The UUID of the project to navigate to"
                    },
                    projectName: {
                        type: "string",
                        description: "Search for project by name (partial match). Use this if you don't have the ID."
                    },
                    section: {
                        type: "string",
                        description: "Optional: go directly to a section - 'overview', 'equipment', 'shades', 'procurement', 'receiving', 'issues', 'wire-drops'"
                    }
                }
            },
            execute: async ({ projectId, projectName, section = 'overview' }) => {
                let targetId = projectId;

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
                            hint: "Try list_projects to see available projects"
                        };
                    }

                    if (data.length > 1) {
                        return {
                            success: false,
                            error: `Multiple projects match "${projectName}"`,
                            matches: data.map(p => ({ id: p.id, name: p.name })),
                            hint: "Please be more specific or use the project ID"
                        };
                    }

                    targetId = data[0].id;
                }

                if (!targetId) {
                    return { success: false, error: "Please provide projectId or projectName" };
                }

                // Build the URL based on section
                let url = `/pm-project/${targetId}`;
                if (section && section !== 'overview') {
                    const sectionMap = {
                        'equipment': `/projects/${targetId}/equipment`,
                        'shades': `/projects/${targetId}/shades`,
                        'procurement': `/projects/${targetId}/procurement`,
                        'receiving': `/projects/${targetId}/receiving`,
                        'issues': `/project/${targetId}/pm-issues`,
                        'wire-drops': '/wire-drops',
                        'floor-plan': `/projects/${targetId}/floor-plan`,
                        'reports': `/projects/${targetId}/reports`
                    };
                    url = sectionMap[section] || url;
                }

                // Use ref to avoid stale closure
                console.log('[AgentContext] navigate_to_project: Navigating to', url);
                navigateRef.current(url);
                return {
                    success: true,
                    message: `Navigating to ${section === 'overview' ? 'project overview' : section}`,
                    url
                };
            }
        },
        {
            name: "navigate_to_section",
            description: "Navigate to a main section of the app (not project-specific).",
            parameters: {
                type: "object",
                properties: {
                    section: {
                        type: "string",
                        description: "Section to go to: 'dashboard', 'issues', 'todos', 'people', 'vendors', 'parts', 'settings'"
                    }
                },
                required: ["section"]
            },
            execute: async ({ section }) => {
                const sectionMap = {
                    'dashboard': '/pm-dashboard',
                    'home': '/',
                    'issues': '/issues',
                    'todos': '/todos',
                    'people': '/people',
                    'vendors': '/vendors',
                    'parts': '/global-parts',
                    'settings': '/settings',
                    'wire-drops': '/wire-drops'
                };

                const url = sectionMap[section.toLowerCase()];
                if (!url) {
                    return {
                        success: false,
                        error: `Unknown section: ${section}`,
                        availableSections: Object.keys(sectionMap)
                    };
                }

                // Use ref to avoid stale closure
                console.log('[AgentContext] navigate_to_section: Navigating to', url);
                navigateRef.current(url);
                return { success: true, message: `Navigating to ${section}`, url };
            }
        },
        {
            name: "go_back",
            description: "Go back to the previous page.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                // Use ref to avoid stale closure
                console.log('[AgentContext] go_back: Navigating back');
                navigateRef.current(-1);
                return { success: true, message: "Going back" };
            }
        }
    ], [currentContext, fetchProjectDetails]); // Removed navigate from deps - using ref instead

    // Helper to determine what actions are available in current context
    const getAvailableActions = (ctx) => {
        const actions = ['navigate_to_project', 'navigate_to_section', 'list_projects', 'go_back'];

        if (ctx.isInProject) {
            actions.push('view_equipment', 'view_shades', 'view_issues', 'view_wire_drops');
        }

        if (ctx.subsection === 'shades') {
            actions.push('set_measurement', 'save_shade', 'next_shade');
        }

        if (ctx.subsection === 'equipment') {
            actions.push('search_equipment', 'mark_received');
        }

        return actions;
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
