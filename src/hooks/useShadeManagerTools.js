import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/AIBrainContext';

/**
 * useShadeManagerTools - Voice AI tools for the ShadeManager page (shade list level)
 *
 * This hook provides tools for:
 * - Getting list of shades and their status
 * - Opening a specific shade by name or room
 * - Getting room summary
 * - Navigating through shades sequentially
 *
 * IMPORTANT: Uses refs for callbacks to prevent stale closure issues.
 */
export const useShadeManagerTools = ({
    shades = [],
    rooms = [],
    projectName = '',
    onSelectShade,  // Function to open a shade for measuring
    expandedRooms,
    setExpandedRooms
}) => {
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // ===== REFS FOR STABLE CALLBACKS =====
    const onSelectShadeRef = useRef(onSelectShade);
    const setExpandedRoomsRef = useRef(setExpandedRooms);
    const shadesRef = useRef(shades);
    const projectNameRef = useRef(projectName);

    // Keep refs updated
    useEffect(() => {
        onSelectShadeRef.current = onSelectShade;
        setExpandedRoomsRef.current = setExpandedRooms;
        shadesRef.current = shades;
        projectNameRef.current = projectName;
    }, [onSelectShade, setExpandedRooms, shades, projectName]);

    // Get shades that still need measuring (no M1 complete)
    const getPendingShades = useCallback(() => {
        return shadesRef.current.filter(s => !s.m1_complete);
    }, []);

    // Get shades grouped by room
    const getShadesByRoom = useCallback(() => {
        const grouped = {};
        shadesRef.current.forEach(shade => {
            const roomName = shade.room?.name || 'Unknown Room';
            if (!grouped[roomName]) {
                grouped[roomName] = [];
            }
            grouped[roomName].push(shade);
        });
        return grouped;
    }, []);

    // Find shade by name (fuzzy match)
    const findShadeByName = useCallback((searchName) => {
        const search = searchName.toLowerCase().trim();
        const currentShades = shadesRef.current;

        // Exact match first
        let found = currentShades.find(s =>
            s.name?.toLowerCase() === search
        );

        // Partial match
        if (!found) {
            found = currentShades.find(s =>
                s.name?.toLowerCase().includes(search) ||
                search.includes(s.name?.toLowerCase())
            );
        }

        return found;
    }, []);

    // Find shades in a room
    const findShadesByRoom = useCallback((roomName) => {
        const search = roomName.toLowerCase().trim();
        return shadesRef.current.filter(s =>
            s.room?.name?.toLowerCase().includes(search) ||
            search.includes(s.room?.name?.toLowerCase())
        );
    }, []);

    // Tool Definitions - use refs for all callbacks
    const tools = useMemo(() => [
        {
            name: "get_shades_overview",
            description: "Get an overview of all shades on this project - how many total, how many need measuring, grouped by room.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const currentShades = shadesRef.current;
                const pendingShades = getPendingShades();
                const shadesByRoom = getShadesByRoom();

                const totalShades = currentShades.length;
                const pending = pendingShades.length;
                const completed = totalShades - pending;

                const roomSummary = Object.entries(shadesByRoom).map(([room, roomShades]) => ({
                    room,
                    total: roomShades.length,
                    pending: roomShades.filter(s => !s.m1_complete).length
                }));

                return {
                    projectName: projectNameRef.current,
                    totalShades,
                    pendingMeasurement: pending,
                    completed,
                    rooms: roomSummary,
                    hint: pending > 0
                        ? `There are ${pending} shades that need measuring. Ask which room to start with or say "start measuring" to begin with the first one.`
                        : "All shades have been measured!"
                };
            }
        },
        {
            name: "list_shades_in_room",
            description: "List all shades in a specific room with their measurement status.",
            parameters: {
                type: "object",
                properties: {
                    roomName: {
                        type: "string",
                        description: "The room name to list shades for (e.g., 'Living Room', 'Master Bedroom')"
                    }
                },
                required: ["roomName"]
            },
            execute: async ({ roomName }) => {
                const roomShades = findShadesByRoom(roomName);
                const shadesByRoom = getShadesByRoom();

                if (roomShades.length === 0) {
                    return {
                        success: false,
                        error: `No shades found in a room matching "${roomName}"`,
                        availableRooms: Object.keys(shadesByRoom)
                    };
                }

                return {
                    room: roomShades[0]?.room?.name,
                    shades: roomShades.map(s => ({
                        name: s.name,
                        status: s.m1_complete ? 'measured' : 'needs measuring',
                        quotedSize: `${s.quoted_width}" x ${s.quoted_height}"`,
                        technology: s.technology
                    })),
                    pendingCount: roomShades.filter(s => !s.m1_complete).length
                };
            }
        },
        {
            name: "open_shade_for_measuring",
            description: "Open a specific shade to start measuring it. Can search by shade name or get the next pending shade in a room.",
            parameters: {
                type: "object",
                properties: {
                    shadeName: {
                        type: "string",
                        description: "The name of the shade to open (e.g., 'Window 1', 'Shade A')"
                    },
                    roomName: {
                        type: "string",
                        description: "Optional: If no shade name, open the first pending shade in this room"
                    }
                }
            },
            execute: async ({ shadeName, roomName }) => {
                let targetShade = null;
                const pendingShades = getPendingShades();

                if (shadeName) {
                    targetShade = findShadeByName(shadeName);
                    if (!targetShade) {
                        return {
                            success: false,
                            error: `Couldn't find a shade named "${shadeName}"`,
                            hint: "Try listing shades in a room first, or say the exact shade name"
                        };
                    }
                } else if (roomName) {
                    const roomShades = findShadesByRoom(roomName);
                    targetShade = roomShades.find(s => !s.m1_complete);
                    if (!targetShade) {
                        return {
                            success: false,
                            error: `No pending shades in "${roomName}" - all measured!`,
                            hint: "Try another room or check the overview"
                        };
                    }
                } else {
                    // Get first pending shade overall
                    targetShade = pendingShades[0];
                    if (!targetShade) {
                        return {
                            success: false,
                            error: "All shades have been measured!",
                            hint: "Great job! All measurements are complete."
                        };
                    }
                }

                console.log(`[ShadeManagerTools] Opening shade: ${targetShade.name}`);

                // Expand the room if collapsed (via ref)
                const setExpandedRoomsFn = setExpandedRoomsRef.current;
                if (setExpandedRoomsFn && targetShade.room?.name) {
                    console.log(`[ShadeManagerTools] Expanding room: ${targetShade.room.name}`);
                    setExpandedRoomsFn(prev => new Set([...prev, targetShade.room.name]));
                }

                // Open the shade modal (via ref)
                const onSelectShadeFn = onSelectShadeRef.current;
                if (onSelectShadeFn) {
                    console.log(`[ShadeManagerTools] Calling onSelectShade for: ${targetShade.name}`);
                    onSelectShadeFn(targetShade);
                } else {
                    console.error('[ShadeManagerTools] onSelectShade ref is null!');
                    return {
                        success: false,
                        error: "Unable to open shade - selection handler not available"
                    };
                }

                return {
                    success: true,
                    shade: {
                        name: targetShade.name,
                        room: targetShade.room?.name,
                        quotedWidth: targetShade.quoted_width,
                        quotedHeight: targetShade.quoted_height,
                        mountType: targetShade.mount_type,
                        technology: targetShade.technology
                    },
                    message: `Opening ${targetShade.name} in ${targetShade.room?.name}. It's quoted at ${targetShade.quoted_width} by ${targetShade.quoted_height} inches.`
                };
            }
        },
        {
            name: "get_next_pending_shade",
            description: "Get information about the next shade that needs measuring, without opening it yet.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const pendingShades = getPendingShades();

                if (pendingShades.length === 0) {
                    return {
                        success: false,
                        message: "All shades have been measured! Great work."
                    };
                }

                const next = pendingShades[0];
                return {
                    success: true,
                    nextShade: {
                        name: next.name,
                        room: next.room?.name,
                        quotedWidth: next.quoted_width,
                        quotedHeight: next.quoted_height
                    },
                    remainingCount: pendingShades.length,
                    hint: `Say "open it" or "let's measure it" to start measuring ${next.name}`
                };
            }
        },
        {
            name: "expand_room",
            description: "Expand or collapse a room section in the shade list.",
            parameters: {
                type: "object",
                properties: {
                    roomName: {
                        type: "string",
                        description: "The room to expand/show"
                    }
                },
                required: ["roomName"]
            },
            execute: async ({ roomName }) => {
                const shadesByRoom = getShadesByRoom();
                const matchingRoom = Object.keys(shadesByRoom).find(r =>
                    r.toLowerCase().includes(roomName.toLowerCase())
                );

                if (!matchingRoom) {
                    return {
                        success: false,
                        error: `No room found matching "${roomName}"`,
                        availableRooms: Object.keys(shadesByRoom)
                    };
                }

                const setExpandedRoomsFn = setExpandedRoomsRef.current;
                if (setExpandedRoomsFn) {
                    console.log(`[ShadeManagerTools] Expanding room: ${matchingRoom}`);
                    setExpandedRoomsFn(prev => new Set([...prev, matchingRoom]));
                }

                return {
                    success: true,
                    room: matchingRoom,
                    shadesInRoom: shadesByRoom[matchingRoom]?.length || 0
                };
            }
        }
    ], [getPendingShades, getShadesByRoom, findShadeByName, findShadesByRoom]);

    // Register/update tools when they change
    useEffect(() => {
        console.log('[ShadeManagerTools] Registering shade list tools');
        registerTools(tools);

        return () => {
            console.log('[ShadeManagerTools] Unregistering shade list tools');
            unregisterTools(tools.map(t => t.name));
        };
    }, [tools, registerTools, unregisterTools]);

    return {
        getPendingShades,
        getShadesByRoom
    };
};

export default useShadeManagerTools;
