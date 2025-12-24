import { useEffect, useMemo, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/AIBrainContext';

/**
 * usePrewireTools - Voice AI tools for the Prewire Mode page
 *
 * Provides hands-free control for:
 * - Getting overview of wire drops to print/photograph
 * - Opening specific wire drops by name or room
 * - Printing labels via voice
 * - Filtering by room/floor
 * - Navigating to wire drop details
 *
 * IMPORTANT: Uses refs for all callbacks to prevent stale closure issues.
 */
export const usePrewireTools = ({
    wireDrops = [],
    filteredDrops = [],
    selectedFloor,
    selectedRoom,
    availableFloors = [],
    availableRooms = [],
    printerConnected,
    onOpenPrintModal,
    onOpenPhotoModal,
    onSetFloor,
    onSetRoom,
    onNavigateToWireDrop
}) => {
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // ===== REFS FOR STABLE CALLBACKS =====
    const wireDropsRef = useRef(wireDrops);
    const filteredDropsRef = useRef(filteredDrops);
    const selectedFloorRef = useRef(selectedFloor);
    const selectedRoomRef = useRef(selectedRoom);
    const availableFloorsRef = useRef(availableFloors);
    const availableRoomsRef = useRef(availableRooms);
    const printerConnectedRef = useRef(printerConnected);
    const onOpenPrintModalRef = useRef(onOpenPrintModal);
    const onOpenPhotoModalRef = useRef(onOpenPhotoModal);
    const onSetFloorRef = useRef(onSetFloor);
    const onSetRoomRef = useRef(onSetRoom);
    const onNavigateToWireDropRef = useRef(onNavigateToWireDrop);

    // Keep refs updated
    useEffect(() => {
        wireDropsRef.current = wireDrops;
        filteredDropsRef.current = filteredDrops;
        selectedFloorRef.current = selectedFloor;
        selectedRoomRef.current = selectedRoom;
        availableFloorsRef.current = availableFloors;
        availableRoomsRef.current = availableRooms;
        printerConnectedRef.current = printerConnected;
        onOpenPrintModalRef.current = onOpenPrintModal;
        onOpenPhotoModalRef.current = onOpenPhotoModal;
        onSetFloorRef.current = onSetFloor;
        onSetRoomRef.current = onSetRoom;
        onNavigateToWireDropRef.current = onNavigateToWireDrop;
    }, [wireDrops, filteredDrops, selectedFloor, selectedRoom, availableFloors, availableRooms, printerConnected, onOpenPrintModal, onOpenPhotoModal, onSetFloor, onSetRoom, onNavigateToWireDrop]);

    // Define tools
    const tools = useMemo(() => [
        {
            name: "get_prewire_overview",
            description: "Get an overview of the prewire status - how many wire drops need labels printed, how many need photos, grouped by room.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const drops = wireDropsRef.current;
                const total = drops.length;
                const printed = drops.filter(d => d.labels_printed).length;
                const notPrinted = total - printed;

                // Count by room
                const byRoom = {};
                drops.forEach(drop => {
                    const room = drop.room_name || 'Unknown';
                    if (!byRoom[room]) {
                        byRoom[room] = { total: 0, printed: 0, needsPrint: 0 };
                    }
                    byRoom[room].total++;
                    if (drop.labels_printed) {
                        byRoom[room].printed++;
                    } else {
                        byRoom[room].needsPrint++;
                    }
                });

                // Current filters
                const currentFloor = selectedFloorRef.current;
                const currentRoom = selectedRoomRef.current;

                return {
                    summary: `${notPrinted} of ${total} wire drops need labels printed.`,
                    total,
                    printed,
                    needsPrint: notPrinted,
                    byRoom: Object.entries(byRoom).map(([room, stats]) => ({
                        room,
                        ...stats
                    })),
                    currentFilters: {
                        floor: currentFloor || 'All Floors',
                        room: currentRoom || 'All Rooms'
                    },
                    printerConnected: printerConnectedRef.current,
                    hint: printerConnectedRef.current
                        ? "You can say 'print labels for [drop name]' or 'show me drops in [room]'"
                        : "Printer not connected. Tell the user to connect in Settings first."
                };
            }
        },
        {
            name: "list_wire_drops_in_room",
            description: "List all wire drops in a specific room, showing which ones have been printed.",
            parameters: {
                type: "object",
                properties: {
                    roomName: {
                        type: "string",
                        description: "The room name to filter by (partial match allowed)"
                    }
                },
                required: ["roomName"]
            },
            execute: async ({ roomName }) => {
                const drops = wireDropsRef.current;
                const searchTerm = roomName.toLowerCase();

                const matchingDrops = drops.filter(d =>
                    (d.room_name || '').toLowerCase().includes(searchTerm)
                );

                if (matchingDrops.length === 0) {
                    const allRooms = [...new Set(drops.map(d => d.room_name).filter(Boolean))];
                    return {
                        success: false,
                        error: `No drops found in room matching "${roomName}"`,
                        availableRooms: allRooms.slice(0, 10),
                        hint: "Try one of the available rooms listed"
                    };
                }

                return {
                    room: matchingDrops[0].room_name,
                    drops: matchingDrops.map(d => ({
                        id: d.id,
                        name: d.drop_name,
                        wireType: d.wire_type,
                        printed: d.labels_printed,
                        uid: d.uid
                    })),
                    count: matchingDrops.length,
                    printedCount: matchingDrops.filter(d => d.labels_printed).length,
                    hint: "Say 'print labels for [name]' or 'open [name]' to work with a specific drop"
                };
            }
        },
        {
            name: "filter_by_floor",
            description: "Filter wire drops to show only a specific floor.",
            parameters: {
                type: "object",
                properties: {
                    floor: {
                        type: "string",
                        description: "Floor name to filter by, or 'all' to show all floors"
                    }
                },
                required: ["floor"]
            },
            execute: async ({ floor }) => {
                const floors = availableFloorsRef.current;
                const setFloor = onSetFloorRef.current;

                if (floor.toLowerCase() === 'all') {
                    if (setFloor) setFloor('');
                    return { success: true, message: "Showing all floors" };
                }

                // Find matching floor
                const match = floors.find(f =>
                    f.toLowerCase().includes(floor.toLowerCase())
                );

                if (!match) {
                    return {
                        success: false,
                        error: `No floor matching "${floor}"`,
                        availableFloors: floors,
                        hint: "Try one of the available floors"
                    };
                }

                if (setFloor) setFloor(match);
                return { success: true, message: `Filtered to ${match}` };
            }
        },
        {
            name: "filter_by_room",
            description: "Filter wire drops to show only a specific room.",
            parameters: {
                type: "object",
                properties: {
                    room: {
                        type: "string",
                        description: "Room name to filter by, or 'all' to show all rooms"
                    }
                },
                required: ["room"]
            },
            execute: async ({ room }) => {
                const rooms = availableRoomsRef.current;
                const setRoom = onSetRoomRef.current;

                if (room.toLowerCase() === 'all') {
                    if (setRoom) setRoom('');
                    return { success: true, message: "Showing all rooms" };
                }

                // Find matching room
                const match = rooms.find(r =>
                    r.toLowerCase().includes(room.toLowerCase())
                );

                if (!match) {
                    return {
                        success: false,
                        error: `No room matching "${room}"`,
                        availableRooms: rooms.slice(0, 10),
                        hint: "Try one of the available rooms"
                    };
                }

                if (setRoom) setRoom(match);
                return { success: true, message: `Filtered to ${match}` };
            }
        },
        {
            name: "open_print_modal",
            description: "Open the print dialog for a specific wire drop to print 1 or 2 labels.",
            parameters: {
                type: "object",
                properties: {
                    dropName: {
                        type: "string",
                        description: "Name of the wire drop to print labels for (partial match)"
                    }
                },
                required: ["dropName"]
            },
            execute: async ({ dropName }) => {
                const drops = filteredDropsRef.current;
                const openPrintModal = onOpenPrintModalRef.current;
                const searchTerm = dropName.toLowerCase();

                // Find matching drop
                const match = drops.find(d =>
                    (d.drop_name || '').toLowerCase().includes(searchTerm) ||
                    (d.uid || '').toLowerCase().includes(searchTerm)
                );

                if (!match) {
                    return {
                        success: false,
                        error: `No wire drop found matching "${dropName}"`,
                        hint: "Try saying the exact drop name or use get_prewire_overview to see available drops"
                    };
                }

                if (!printerConnectedRef.current) {
                    return {
                        success: false,
                        error: "Printer not connected",
                        hint: "Tell the user to connect the printer in Settings first"
                    };
                }

                if (openPrintModal) {
                    openPrintModal(match, { stopPropagation: () => {} });
                }

                return {
                    success: true,
                    message: `Opening print dialog for ${match.drop_name}`,
                    drop: {
                        name: match.drop_name,
                        room: match.room_name,
                        alreadyPrinted: match.labels_printed
                    },
                    hint: match.labels_printed
                        ? "This drop already has labels printed. User can reprint if needed."
                        : "Tell the user to tap Print 1 or Print 2 to print labels."
                };
            }
        },
        {
            name: "open_photo_modal",
            description: "Open the camera to take a prewire completion photo for a wire drop.",
            parameters: {
                type: "object",
                properties: {
                    dropName: {
                        type: "string",
                        description: "Name of the wire drop to photograph (partial match)"
                    }
                },
                required: ["dropName"]
            },
            execute: async ({ dropName }) => {
                const drops = filteredDropsRef.current;
                const openPhotoModal = onOpenPhotoModalRef.current;
                const searchTerm = dropName.toLowerCase();

                // Find matching drop
                const match = drops.find(d =>
                    (d.drop_name || '').toLowerCase().includes(searchTerm) ||
                    (d.uid || '').toLowerCase().includes(searchTerm)
                );

                if (!match) {
                    return {
                        success: false,
                        error: `No wire drop found matching "${dropName}"`,
                        hint: "Try saying the exact drop name"
                    };
                }

                if (openPhotoModal) {
                    openPhotoModal(match, { stopPropagation: () => {} });
                }

                return {
                    success: true,
                    message: `Opening camera for ${match.drop_name}`,
                    drop: {
                        name: match.drop_name,
                        room: match.room_name
                    }
                };
            }
        },
        {
            name: "open_wire_drop_details",
            description: "Navigate to the full details page for a wire drop.",
            parameters: {
                type: "object",
                properties: {
                    dropName: {
                        type: "string",
                        description: "Name of the wire drop to open (partial match)"
                    }
                },
                required: ["dropName"]
            },
            execute: async ({ dropName }) => {
                const drops = filteredDropsRef.current;
                const navigateTo = onNavigateToWireDropRef.current;
                const searchTerm = dropName.toLowerCase();

                // Find matching drop
                const match = drops.find(d =>
                    (d.drop_name || '').toLowerCase().includes(searchTerm) ||
                    (d.uid || '').toLowerCase().includes(searchTerm)
                );

                if (!match) {
                    return {
                        success: false,
                        error: `No wire drop found matching "${dropName}"`,
                        hint: "Try saying the exact drop name"
                    };
                }

                if (navigateTo) {
                    navigateTo(match.id);
                }

                return {
                    success: true,
                    message: `Opening details for ${match.drop_name}`,
                    drop: {
                        name: match.drop_name,
                        room: match.room_name,
                        wireType: match.wire_type
                    }
                };
            }
        },
        {
            name: "get_next_unprinted",
            description: "Get the next wire drop that needs labels printed.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const drops = filteredDropsRef.current;
                const unprinted = drops.filter(d => !d.labels_printed);

                if (unprinted.length === 0) {
                    return {
                        success: true,
                        message: "All visible wire drops have labels printed!",
                        remaining: 0
                    };
                }

                const next = unprinted[0];
                return {
                    success: true,
                    nextDrop: {
                        id: next.id,
                        name: next.drop_name,
                        room: next.room_name,
                        wireType: next.wire_type
                    },
                    remaining: unprinted.length,
                    hint: `Say "print labels for ${next.drop_name}" to print, or "open ${next.drop_name}" to see details`
                };
            }
        }
    ], []); // Empty deps - all data accessed via refs

    // Register/unregister tools
    useEffect(() => {
        console.log('[usePrewireTools] Registering prewire tools');
        registerTools(tools);

        return () => {
            console.log('[usePrewireTools] Unregistering prewire tools');
            unregisterTools(tools.map(t => t.name));
        };
    }, [tools, registerTools, unregisterTools]);
};

export default usePrewireTools;
