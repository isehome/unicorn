/**
 * RackBackView.jsx
 * Back view of rack equipment showing device network status and connectivity
 * Supports both physical (rack grid) and functional (list) layout modes
 */

import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import { WifiOff, Wifi, Globe, ExternalLink, Zap, Plug, Link2, ChevronDown, GripVertical, Settings, Server, Layers, X, Plus, Check, Network, Cable } from 'lucide-react';
import EquipmentEditModal from './EquipmentEditModal';

// Constants - same as RackFrontView for consistency
const U_HEIGHT = 50;

/**
 * Get equipment U height from global_part or default to 1
 */
const getEquipmentUHeight = (equipment) => {
  return equipment?.global_part?.u_height || equipment?.u_height || 1;
};

/**
 * Get display name for equipment
 * Priority: HA hostname (UniFi friendly name) > model + instance > global_part name > fallbacks
 * @param {object} item - Equipment item
 * @param {string} haHostname - Optional HA client hostname (UniFi friendly name)
 */
const getEquipmentDisplayName = (item, haHostname = null) => {
  // If linked to HA and has a hostname, use the UniFi friendly name
  if (haHostname) {
    return haHostname;
  }

  const fullName = item?.instance_name || item?.name || '';
  const instanceMatch = fullName.match(/\s(\d+)$/);
  const instanceNum = instanceMatch ? instanceMatch[1] : '';

  if (item?.model) {
    return instanceNum ? `${item.model} ${instanceNum}` : item.model;
  }

  if (item.global_part?.name) return item.global_part.name;

  if (fullName && fullName.includes(' - ')) {
    const parts = fullName.split(' - ');
    if (parts.length > 1) {
      return parts.slice(1).join(' - ');
    }
  }

  return item.part_number || fullName || 'Unknown Equipment';
};

/**
 * Equipment Block for Physical View - shows equipment with network info
 */
const EquipmentBlockPhysical = memo(({
  equipment,
  top,
  height,
  isDragging = false,
  networkInfo,
  onDragStart,
  onClick,
}) => {
  const uHeight = getEquipmentUHeight(equipment);
  const displayName = getEquipmentDisplayName(equipment);
  const isLinked = networkInfo?.linked;
  const ip = networkInfo?.ip;
  const isPowerDevice = equipment?.global_part?.is_power_device;
  const watts = equipment?.global_part?.power_watts;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      equipmentId: equipment.id,
      uHeight,
      isMove: true,
    }));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(equipment);
  };

  const handleClick = (e) => {
    if (e.defaultPrevented) return;
    onClick?.(equipment);
  };

  const handleIpClick = (e) => {
    e.stopPropagation();
    if (ip) {
      window.open(`http://${ip}`, '_blank');
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`absolute left-0 right-0 bg-zinc-800 border border-zinc-600 rounded px-3 py-2 cursor-pointer hover:border-violet-500 transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height - 4, 36)}px`,
        zIndex: isDragging ? 50 : 20,
      }}
    >
      <div className="flex items-center justify-between gap-2 h-full">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical size={14} className="text-zinc-500 flex-shrink-0 cursor-grab" />

          {/* Status dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isLinked
              ? networkInfo?.isOnline ? 'bg-green-500' : 'bg-red-500'
              : 'bg-zinc-500'
          }`} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100 truncate">
                {displayName}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 flex-shrink-0">
                {uHeight}U
              </span>
              {isPowerDevice && (
                <span className="text-xs px-1 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700 flex-shrink-0">
                  ⚡
                </span>
              )}
            </div>

            {/* Show IP if linked and enough height */}
            {height >= 60 && ip && (
              <button
                onClick={handleIpClick}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-0.5 group"
              >
                <Globe size={10} />
                <span className="font-mono">{ip}</span>
                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>

        {/* IP badge (compact) when not enough height for full display */}
        {height < 60 && ip && (
          <button
            onClick={handleIpClick}
            className="text-xs font-mono text-blue-400 hover:text-blue-300 flex-shrink-0"
            title={`Open http://${ip}`}
          >
            {ip}
          </button>
        )}

        {/* Power consumption */}
        {watts && !isPowerDevice && (
          <span className="text-xs text-yellow-400 flex-shrink-0">{watts}W</span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onClick?.(equipment); }}
          className="p-1 rounded hover:bg-zinc-700 transition-colors"
          title="Edit equipment"
        >
          <Settings size={14} className="text-zinc-500 hover:text-zinc-300" />
        </button>
      </div>
    </div>
  );
});

EquipmentBlockPhysical.displayName = 'EquipmentBlockPhysical';

/**
 * Empty Slot Component
 */
const EmptySlot = memo(({ uPosition, top, height }) => {
  return (
    <div
      className="absolute left-0 right-0 border border-dashed rounded border-zinc-700/50"
      style={{
        top: `${top}px`,
        height: `${height - 2}px`,
      }}
    />
  );
});

EmptySlot.displayName = 'EmptySlot';

/**
 * Drop Preview Component
 */
const DropPreview = memo(({ top, height }) => {
  return (
    <div
      className="absolute left-0 right-0 rounded border-2 border-dashed border-violet-500 bg-violet-500/10 pointer-events-none flex items-center justify-center"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        zIndex: 30,
      }}
    >
      <span className="text-sm text-violet-400">Drop here</span>
    </div>
  );
});

DropPreview.displayName = 'DropPreview';

/**
 * Shelf Equipment Item - for shelf equipment in physical view
 */
const ShelfEquipmentItem = memo(({ equipment, width, onClick, networkInfo }) => {
  const displayName = getEquipmentDisplayName(equipment);
  const isLinked = networkInfo?.linked;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(equipment); }}
      className="h-full flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded cursor-pointer hover:border-violet-400 transition-colors overflow-hidden"
      style={{ width }}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isLinked ? (networkInfo?.isOnline ? 'bg-green-500' : 'bg-red-500') : 'bg-zinc-500'
      }`} />
      <span className="text-xs text-zinc-200 truncate">{displayName}</span>
    </div>
  );
});

ShelfEquipmentItem.displayName = 'ShelfEquipmentItem';

/**
 * Shelf Block Component for Physical View
 */
const ShelfBlock = memo(({ shelf, top, height, shelfEquipment = [], maxItemsPerShelf = 4, onDragStart, onDelete, onEquipmentClick, onEquipmentDrop, getNetworkInfo }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      shelfId: shelf.id,
      uHeight: shelf.u_height,
      isShelf: true,
      currentPositionU: shelf.rack_position_u,
    }));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(shelf);
  };

  const handleDragEnd = () => setIsDragging(false);
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!data.isShelf && data.equipmentId) {
        onEquipmentDrop?.(data.equipmentId, shelf.id);
      }
    } catch (err) {
      console.error('Shelf drop error:', err);
    }
  };

  const itemWidth = `calc(${100 / maxItemsPerShelf}% - 4px)`;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`absolute left-0 right-0 rounded border-2 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-50' : ''
      } ${
        isDragOver
          ? 'border-green-500 bg-green-900/40 shadow-lg shadow-green-500/20'
          : 'border-blue-500 bg-transparent'
      }`}
      style={{
        top: `${top}px`,
        height: `${height - 2}px`,
        zIndex: 15,
      }}
    >
      {/* Shelf header */}
      <div className={`flex items-center justify-between px-2 py-0.5 border-b transition-colors ${
        isDragOver ? 'bg-green-900/50 border-green-700' : 'bg-blue-900/30 border-blue-700/50'
      }`}>
        <div className="flex items-center gap-1">
          <GripVertical size={12} className={isDragOver ? 'text-green-400' : 'text-blue-400'} />
          <Layers size={12} className={isDragOver ? 'text-green-400' : 'text-blue-400'} />
          <span className={`text-xs font-medium ${isDragOver ? 'text-green-200' : 'text-blue-200'}`}>
            {shelf.name || 'Shelf'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${isDragOver ? 'text-green-400' : 'text-blue-400'}`}>
            {shelf.u_height}U @ U{shelf.rack_position_u}
          </span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(shelf.id); }}
              className="p-0.5 hover:bg-red-900/50 rounded text-blue-400 hover:text-red-400 transition-colors"
              title="Remove shelf"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Shelf content area */}
      <div className="flex items-center gap-1 px-2 py-1 h-[calc(100%-24px)] overflow-hidden">
        {shelfEquipment.length > 0 ? (
          shelfEquipment.slice(0, maxItemsPerShelf).map((eq) => (
            <ShelfEquipmentItem
              key={eq.id}
              equipment={eq}
              width={itemWidth}
              onClick={onEquipmentClick}
              networkInfo={getNetworkInfo?.(eq)}
            />
          ))
        ) : (
          <span className={`text-xs italic ${isDragOver ? 'text-green-400' : 'text-blue-400/50'}`}>
            {isDragOver ? 'Drop here!' : 'Drop shelf items here'}
          </span>
        )}
        {shelfEquipment.length > maxItemsPerShelf && (
          <span className="text-xs text-blue-400 ml-1">+{shelfEquipment.length - maxItemsPerShelf} more</span>
        )}
      </div>
    </div>
  );
});

ShelfBlock.displayName = 'ShelfBlock';


/**
 * RackBackView - Network + Power View
 * Shows equipment with their network status and power consumption
 * Supports physical (rack grid) and functional (list) layout modes
 */
const RackBackView = ({
  rack,
  racks = [],
  selectedRackId,
  onRackSelect,
  onAddRack,
  equipment = [],
  unplacedEquipment = [],
  haClients = [],
  haDevices = [],
  layoutMode = 'functional',
  onEquipmentDrop,
  onEquipmentMove,
  onEquipmentRemove,
  onEquipmentEdit,
  onEquipmentExclude,
  onEquipmentExcludeGlobal,
  onEquipmentDropOnShelf,
  onMoveRoom,
  onLinkToHA,
  onAddShelf,
  onShelfMove,
  onShelfDelete,
  getNetworkInfo: getNetworkInfoProp,
  // New props for power connections
  connections = [],
  onCreateConnection,
  onDeleteConnection,
  onAddPowerStrip,
  projectId,
  // Connection tab is now controlled externally
  connectionTab = 'power',
}) => {
  const [linkingEquipmentId, setLinkingEquipmentId] = useState(null);
  const [showRackSelector, setShowRackSelector] = useState(false);
  // State for power connection drag-and-drop
  const [draggingPowerInput, setDraggingPowerInput] = useState(null);
  // State for network connection drag-and-drop
  const [draggingNetworkPort, setDraggingNetworkPort] = useState(null);
  const [highlightedConnection, setHighlightedConnection] = useState(null);
  // State for connection line visualization on hover
  const [hoveredConnection, setHoveredConnection] = useState(null);
  const [lineCoords, setLineCoords] = useState(null);
  // State for pinned/clicked connection (persists until click elsewhere)
  const [pinnedConnection, setPinnedConnection] = useState(null);
  const [pinnedLineCoords, setPinnedLineCoords] = useState(null);
  // State for wire drop modal
  const [wireDropModal, setWireDropModal] = useState(null);
  const functionalContainerRef = useRef(null);
  const containerRef = useRef(null);
  const outletRefs = useRef({});
  const inputRefs = useRef({});
  // Network port refs
  const switchPortRefs = useRef({});
  const devicePortRefs = useRef({});
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedEquipment: null,
    draggedShelf: null,
    dropPreview: null,
  });

  // State for equipment edit modal (same as RackFrontView)
  const [editingEquipment, setEditingEquipment] = useState(null);

  const totalU = rack?.total_u || 42;

  // Debug: Log gateway devices when they change
  React.useEffect(() => {
    const gateways = haDevices.filter(d => d.category === 'gateway');
    if (gateways.length > 0) {
      console.log('[RackBackView] Gateway devices found:', gateways.map(g => ({
        name: g.name,
        mac: g.mac,
        category: g.category,
        portTableLength: g.port_table?.length || 0,
        portTable: g.port_table
      })));
    }
    console.log('[RackBackView] Total haDevices:', haDevices.length);
    console.log('[RackBackView] Total haClients:', haClients.length);

    // Log equipment with their MAC addresses for debugging connections
    console.log('[RackBackView] Equipment MAC mappings:', equipment.map(e => ({
      id: e.id,
      name: e.instance_name || e.name,
      ha_client_mac: e.ha_client_mac,
    })));
  }, [haDevices, haClients, equipment]);

  // Find the selected rack index for display
  const selectedRackIndex = racks.findIndex(r => r.id === selectedRackId);
  const rackCountDisplay = racks.length > 0 ? `${selectedRackIndex + 1}/${racks.length}` : '0/0';

  // Get network status info from equipment
  const getNetworkInfo = useCallback((item) => {
    // Use prop function if available
    if (getNetworkInfoProp) {
      return getNetworkInfoProp(item);
    }

    let haClient = item.ha_client;

    if (!haClient && item.ha_client_mac) {
      const mac = item.ha_client_mac.toLowerCase();

      const matchedDevice = haDevices.find(d => d.mac?.toLowerCase() === mac);
      if (matchedDevice) {
        haClient = {
          mac: matchedDevice.mac,
          hostname: matchedDevice.name,
          ip: matchedDevice.ip,
          is_online: matchedDevice.is_online,
          is_wired: true,
        };
      }

      if (!haClient) {
        const matchedClient = haClients.find(c => c.mac?.toLowerCase() === mac);
        if (matchedClient) {
          haClient = {
            mac: matchedClient.mac,
            hostname: matchedClient.hostname,
            ip: matchedClient.ip,
            is_online: matchedClient.is_online,
            is_wired: matchedClient.is_wired,
            switch_name: matchedClient.switch_name,
            switch_port: matchedClient.switch_port,
          };
        }
      }
    }

    if (!haClient) {
      return { linked: false, isOnline: null, ip: null, mac: null, hostname: null };
    }

    return {
      linked: true,
      isOnline: haClient.is_online,
      ip: haClient.ip,
      mac: haClient.mac,
      hostname: haClient.hostname,
      switchName: haClient.switch_name,
      switchPort: haClient.switch_port,
      isWired: haClient.is_wired,
    };
  }, [getNetworkInfoProp, haDevices, haClients]);

  // Helper to check if equipment is a "port host" (switch or gateway with ports)
  // These devices show their ports on the RIGHT side and other devices connect to them
  const isPortHost = useCallback((eq) => {
    // Check if marked as network switch in global_parts
    if (eq.global_part?.is_network_switch) return true;

    // Check if it's a gateway in HA device data (like Dream Machine)
    const mac = eq.ha_client_mac?.toLowerCase();
    if (mac) {
      const haDevice = haDevices.find(d => d.mac?.toLowerCase() === mac);
      // Debug: log gateway port detection
      if (haDevice?.category === 'gateway') {
        console.log('[Gateway Debug]', eq.instance_name, {
          mac,
          haDevice,
          portTableLength: haDevice?.port_table?.length
        });
      }
      if (haDevice?.category === 'gateway' && haDevice?.port_table?.length > 0) {
        return true;
      }
    }

    return false;
  }, [haDevices]);

  // Find gateway device and its WAN port info for the WAN modem visualization
  const gatewayWanInfo = useMemo(() => {
    // Find gateway in HA devices
    const gateway = haDevices.find(d => d.category === 'gateway');
    if (!gateway || !gateway.port_table) return null;

    // Find WAN ports (is_uplink: true on gateway means WAN)
    const wanPorts = gateway.port_table.filter(p => p.is_uplink);
    const activeWanPorts = wanPorts.filter(p => p.up);

    // Find equipment in rack that matches this gateway
    const gatewayEquipment = equipment.find(eq =>
      eq.ha_client_mac?.toLowerCase() === gateway.mac?.toLowerCase()
    );

    return {
      gateway: {
        name: gateway.name,
        mac: gateway.mac,
        ip: gateway.ip, // This is the WAN IP
        model: gateway.model,
        category: gateway.category,
        portTable: gateway.port_table,
        equipment: gatewayEquipment,
      },
      wanPorts: wanPorts.map(p => ({
        portIdx: p.port_idx,
        name: p.name,
        up: p.up,
        speed: p.speed,
      })),
      activeWanCount: activeWanPorts.length,
      wanIp: gateway.ip, // WAN IP address
    };
  }, [haDevices, equipment]);

  // Sort equipment by rack position (descending - top of rack first)
  const sortedEquipment = useMemo(() => {
    return [...equipment].sort((a, b) => {
      const posA = a.rack_position_u || 0;
      const posB = b.rack_position_u || 0;
      return posB - posA;
    });
  }, [equipment]);

  // Group equipment by shelf_id for physical view
  const equipmentByShelf = useMemo(() => {
    const byShelf = new Map();
    equipment.forEach((eq) => {
      if (eq.shelf_id) {
        if (!byShelf.has(eq.shelf_id)) {
          byShelf.set(eq.shelf_id, []);
        }
        byShelf.get(eq.shelf_id).push(eq);
      }
    });
    return byShelf;
  }, [equipment]);

  // Calculate occupied U positions (for physical view)
  const occupiedPositions = useMemo(() => {
    const positions = new Map();

    equipment.forEach((eq) => {
      const posU = eq.rack_position_u;
      if (posU && !eq.shelf_id) {
        const uHeight = getEquipmentUHeight(eq);
        for (let u = posU; u < posU + uHeight; u++) {
          positions.set(u, { type: 'equipment', item: eq });
        }
      }
    });

    (rack?.shelves || []).forEach((shelf) => {
      for (let u = shelf.rack_position_u; u < shelf.rack_position_u + shelf.u_height; u++) {
        positions.set(u, { type: 'shelf', item: shelf });
      }
    });

    return positions;
  }, [equipment, rack?.shelves]);

  // Build positioned equipment and empty slots for physical view
  const { positionedEquipment, emptySlots } = useMemo(() => {
    const positionedEquipment = [];
    const emptySlots = [];
    const processedUs = new Set();

    equipment.forEach((eq) => {
      const posU = eq.rack_position_u;
      if (posU && !eq.shelf_id) {
        const uHeight = getEquipmentUHeight(eq);
        const topU = totalU - posU - uHeight + 1;
        positionedEquipment.push({
          ...eq,
          top: topU * U_HEIGHT,
          height: uHeight * U_HEIGHT,
        });
        for (let u = posU; u < posU + uHeight; u++) {
          processedUs.add(u);
        }
      }
    });

    (rack?.shelves || []).forEach((shelf) => {
      for (let u = shelf.rack_position_u; u < shelf.rack_position_u + shelf.u_height; u++) {
        processedUs.add(u);
      }
    });

    for (let u = 1; u <= totalU; u++) {
      if (!processedUs.has(u)) {
        const topU = totalU - u;
        emptySlots.push({ uPosition: u, top: topU * U_HEIGHT, height: U_HEIGHT });
      }
    }

    return { positionedEquipment, emptySlots };
  }, [equipment, rack?.shelves, totalU]);

  // Build positioned shelves
  const positionedShelves = useMemo(() => {
    const shelves = rack?.shelves || [];
    return shelves.map((shelf) => {
      const topU = totalU - shelf.rack_position_u - shelf.u_height + 1;
      return {
        ...shelf,
        top: topU * U_HEIGHT,
        height: shelf.u_height * U_HEIGHT,
        equipment: equipmentByShelf.get(shelf.id) || [],
      };
    });
  }, [rack?.shelves, totalU, equipmentByShelf]);

  // Calculate power totals
  const powerTotals = useMemo(() => {
    return equipment.reduce((acc, item) => {
      const gp = item.global_part;
      const isPowerDevice = gp?.is_power_device;
      const wattsConsumed = gp?.power_watts || 0;
      const outletsRequired = gp?.power_outlets || 0;
      const surgeOutletsProvided = gp?.power_outlets_provided || 0;
      const upsOutletsProvided = gp?.ups_outlets_provided || 0;
      const totalOutletsProvided = surgeOutletsProvided + upsOutletsProvided;
      const powerOutput = gp?.power_output_watts || 0;

      return {
        wattsConsumed: acc.wattsConsumed + wattsConsumed,
        outletsRequired: acc.outletsRequired + (isPowerDevice ? 0 : outletsRequired),
        outletsProvided: acc.outletsProvided + totalOutletsProvided,
        surgeOutletsProvided: acc.surgeOutletsProvided + surgeOutletsProvided,
        upsOutletsProvided: acc.upsOutletsProvided + upsOutletsProvided,
        powerCapacity: acc.powerCapacity + powerOutput,
        powerDeviceCount: acc.powerDeviceCount + (isPowerDevice ? 1 : 0),
      };
    }, { wattsConsumed: 0, outletsRequired: 0, outletsProvided: 0, surgeOutletsProvided: 0, upsOutletsProvided: 0, powerCapacity: 0, powerDeviceCount: 0 });
  }, [equipment]);

  // Build network entities list for linking
  const networkEntities = useMemo(() => {
    const linkedMacs = new Set(
      equipment
        .map(e => e.ha_client_mac?.toLowerCase())
        .filter(Boolean)
    );

    const entities = [];

    haDevices.forEach(device => {
      if (!linkedMacs.has(device.mac?.toLowerCase())) {
        entities.push({
          type: 'device',
          mac: device.mac,
          name: device.name,
          ip: device.ip,
          isOnline: device.is_online,
        });
      }
    });

    haClients.forEach(client => {
      if (!linkedMacs.has(client.mac?.toLowerCase())) {
        entities.push({
          type: 'client',
          mac: client.mac,
          name: client.hostname || 'Unknown',
          ip: client.ip,
          isOnline: client.is_online,
          switchName: client.switch_name,
          switchPort: client.switch_port,
        });
      }
    });

    return entities;
  }, [haDevices, haClients, equipment]);

  // Drag handlers for physical view
  const handleDragStart = useCallback((eq) => {
    setDragState(prev => ({ ...prev, isDragging: true, draggedEquipment: eq, draggedShelf: null }));
  }, []);

  const handleShelfDragStart = useCallback((shelf) => {
    setDragState(prev => ({ ...prev, isDragging: true, draggedShelf: shelf, draggedEquipment: null }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedEquipment: null, draggedShelf: null, dropPreview: null });
  }, []);

  const calculateDropPosition = useCallback((e, containerRect) => {
    const relativeY = e.clientY - containerRect.top;
    const uFromTop = Math.floor(relativeY / U_HEIGHT);
    return Math.max(1, Math.min(totalU - uFromTop, totalU));
  }, [totalU]);

  const isValidDropPosition = useCallback((targetU, uHeight, draggedItemId = null, isShelf = false) => {
    for (let u = targetU; u < targetU + uHeight; u++) {
      if (u > totalU) return false;
      const occupied = occupiedPositions.get(u);
      if (occupied) {
        if (isShelf && occupied.type === 'shelf' && occupied.item.id === draggedItemId) {
          continue;
        }
        if (!isShelf && occupied.type === 'equipment' && occupied.item.id === draggedItemId) {
          continue;
        }
        return false;
      }
    }
    return true;
  }, [occupiedPositions, totalU]);

  const handleRackDragOver = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const targetU = calculateDropPosition(e, rect);

    let uHeight = 1;
    let draggedId = null;
    let isShelf = false;

    if (dragState.draggedShelf) {
      uHeight = dragState.draggedShelf.u_height;
      draggedId = dragState.draggedShelf.id;
      isShelf = true;
    } else if (dragState.draggedEquipment) {
      uHeight = getEquipmentUHeight(dragState.draggedEquipment);
      draggedId = dragState.draggedEquipment.id;
    }

    if (isValidDropPosition(targetU, uHeight, draggedId, isShelf)) {
      const topU = totalU - targetU - uHeight + 1;
      setDragState(prev => ({
        ...prev,
        dropPreview: { targetU, top: topU * U_HEIGHT, height: uHeight * U_HEIGHT, isShelf },
      }));
    } else {
      setDragState(prev => ({ ...prev, dropPreview: null }));
    }
  }, [calculateDropPosition, dragState.draggedEquipment, dragState.draggedShelf, isValidDropPosition, totalU]);

  const handleRackDrop = useCallback(async (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const rect = e.currentTarget.getBoundingClientRect();
      const targetU = calculateDropPosition(e, rect);

      if (data.isShelf) {
        if (isValidDropPosition(targetU, data.uHeight, data.shelfId, true)) {
          onShelfMove?.(data.shelfId, targetU);
        }
      } else if (data.needsShelf && onAddShelf) {
        const shelfUHeight = data.shelfUHeight || 2;
        if (isValidDropPosition(targetU, shelfUHeight, null, true)) {
          const newShelf = await onAddShelf({
            rackId: rack?.id,
            uHeight: shelfUHeight,
            rackPositionU: targetU,
            name: `Shelf at U${targetU}`,
          });
          if (newShelf?.id && onEquipmentDropOnShelf) {
            await onEquipmentDropOnShelf(data.equipmentId, newShelf.id);
          }
        }
      } else {
        const isValid = isValidDropPosition(targetU, data.uHeight, data.equipmentId, false);
        if (isValid) {
          if (data.isMove) {
            onEquipmentMove?.(data.equipmentId, targetU, null);
          } else {
            onEquipmentDrop?.(data.equipmentId, targetU, null);
          }
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
    handleDragEnd();
  }, [calculateDropPosition, isValidDropPosition, onEquipmentDrop, onEquipmentMove, onShelfMove, onAddShelf, onEquipmentDropOnShelf, rack?.id, handleDragEnd]);

  // Handle linking equipment to network entity
  const handleLinkClick = (equipmentId, mac) => {
    if (onLinkToHA) {
      onLinkToHA(equipmentId, mac);
      setLinkingEquipmentId(null);
    }
  };

  // Handle unlinking
  const handleUnlink = (equipmentId) => {
    if (onLinkToHA) {
      onLinkToHA(equipmentId, null);
    }
  };

  // Render Physical Layout (Rack Grid View)
  const renderPhysicalLayout = () => (
    <div className="p-4">
      <div className="flex gap-3">
        {/* U Labels */}
        <div className="flex-shrink-0 w-10">
          <div className="relative" style={{ height: `${totalU * U_HEIGHT}px` }}>
            {Array.from({ length: totalU }, (_, i) => {
              const uPosition = totalU - i;
              return (
                <div
                  key={uPosition}
                  className="absolute right-0 text-xs text-zinc-500 font-mono"
                  style={{ top: `${i * U_HEIGHT + (U_HEIGHT / 2) - 8}px` }}
                >
                  U{uPosition}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rack Content */}
        <div
          className="flex-1 relative bg-zinc-800/50 border border-zinc-700 rounded-lg"
          style={{ height: `${totalU * U_HEIGHT}px` }}
          onDragOver={handleRackDragOver}
          onDragLeave={() => setDragState(prev => ({ ...prev, dropPreview: null }))}
          onDrop={handleRackDrop}
        >
          {/* Grid Lines */}
          {Array.from({ length: totalU }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-zinc-700/30"
              style={{ top: `${i * U_HEIGHT}px` }}
            />
          ))}

          {/* Empty Slots */}
          {emptySlots.map((slot) => (
            <EmptySlot key={slot.uPosition} {...slot} />
          ))}

          {/* Shelves */}
          {positionedShelves.map((shelf) => (
            <ShelfBlock
              key={shelf.id}
              shelf={shelf}
              top={shelf.top}
              height={shelf.height}
              shelfEquipment={shelf.equipment}
              maxItemsPerShelf={4}
              onDragStart={handleShelfDragStart}
              onDelete={onShelfDelete}
              onEquipmentClick={onEquipmentEdit}
              onEquipmentDrop={onEquipmentDropOnShelf}
              getNetworkInfo={getNetworkInfo}
            />
          ))}

          {/* Equipment */}
          {positionedEquipment.map((eq) => (
            <EquipmentBlockPhysical
              key={eq.id}
              equipment={eq}
              top={eq.top}
              height={eq.height}
              isDragging={dragState.draggedEquipment?.id === eq.id}
              networkInfo={getNetworkInfo(eq)}
              onDragStart={handleDragStart}
              onClick={onEquipmentEdit}
            />
          ))}

          {/* Drop Preview */}
          {dragState.dropPreview && (
            <DropPreview top={dragState.dropPreview.top} height={dragState.dropPreview.height} />
          )}
        </div>
      </div>
    </div>
  );

  // Render Functional Layout (List View) - matches FrontView structure with shelf containers
  // Shows power information instead of IP addresses
  const renderFunctionalLayout = () => {
    // Build list of items: regular equipment and shelves (with their equipment inside)
    const allItems = [];

    // Add rack-mounted equipment (not on shelves)
    positionedEquipment.forEach(eq => {
      allItems.push({ type: 'equipment', item: eq, posU: eq.rack_position_u });
    });

    // Add shelves as single items (equipment will be rendered inside)
    positionedShelves.forEach(shelf => {
      allItems.push({ type: 'shelf', item: shelf, posU: shelf.rack_position_u });
    });

    // Sort by position descending (top of rack first)
    allItems.sort((a, b) => b.posU - a.posU);

    // Get connections for this equipment
    const getEquipmentConnections = (eqId) => {
      const inbound = connections.filter(c => c.target_equipment_id === eqId);
      const outbound = connections.filter(c => c.source_equipment_id === eqId);
      return { inbound, outbound };
    };

    // Handle power input drag start
    const handleInputDragStart = (e, eq, inputNumber) => {
      e.stopPropagation();
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'power-input',
        equipmentId: eq.id,
        inputNumber,
        equipmentName: getEquipmentDisplayName(eq),
      }));
      e.dataTransfer.effectAllowed = 'link';
      setDraggingPowerInput({ equipmentId: eq.id, inputNumber });
    };

    // Handle power input drag end
    const handleInputDragEnd = () => {
      setDraggingPowerInput(null);
    };

    // Handle outlet drag over
    const handleOutletDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Handle outlet drop
    const handleOutletDrop = async (e, sourceEq, outletNumber, portType) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'power-input' && onCreateConnection) {
          await onCreateConnection({
            projectId,
            sourceEquipmentId: sourceEq.id,
            sourcePortNumber: outletNumber,
            sourcePortType: portType,
            targetEquipmentId: data.equipmentId,
            targetPortNumber: data.inputNumber,
            connectionType: 'power',
          });
        }
      } catch (err) {
        console.error('Drop error:', err);
      }
      setDraggingPowerInput(null);
    };

    // Handle disconnect click
    const handleDisconnect = async (e, connectionId) => {
      e.stopPropagation();
      if (onDeleteConnection) {
        await onDeleteConnection(connectionId);
      }
    };

    // Helper to render power info for an equipment item
    const renderPowerInfo = (eq) => {
      const watts = eq.global_part?.power_watts;
      const outletsRequired = eq.global_part?.power_outlets || 1;
      const isPowerDevice = eq.global_part?.is_power_device;
      const surgeOutlets = eq.global_part?.power_outlets_provided || 0;
      const upsOutlets = eq.global_part?.ups_outlets_provided || 0;
      const totalOutlets = surgeOutlets + upsOutlets;

      // Get this equipment's connections
      const { inbound, outbound } = getEquipmentConnections(eq.id);
      const inboundByPort = new Map(inbound.map(c => [c.target_port_number, c]));
      const outboundByPort = new Map(outbound.map(c => [c.source_port_number, c]));

      // Brand colors from styleSystem.js
      const BRAND = {
        success: '#94AF32',    // olive green - UPS battery backup
        info: '#3B82F6',       // blue - surge/standard protection (normal operation)
        warning: '#F59E0B',    // amber - reserved for trouble/warning conditions
        primary: '#8B5CF6',    // violet - accent/hover
        danger: '#EF4444',     // red - disconnect
      };

      // Render a single outlet (droppable)
      // Border color = power type (olive green=UPS, blue=surge/standard)
      // Fill = gray when empty, solid color when connected
      const renderOutlet = (outletNum, portType, isUps) => {
        const conn = outboundByPort.get(outletNum);
        const isConnected = !!conn;
        const isDragTarget = draggingPowerInput && !isConnected;
        const outletRefKey = `${eq.id}-outlet-${outletNum}`;

        const connectedDevice = conn?.target_equipment;
        const connectedName = connectedDevice?.instance_name || connectedDevice?.name || connectedDevice?.global_part?.name;

        // Use brand colors with inline styles
        // Olive green = UPS battery backup, Blue = surge/standard protection
        const borderColorValue = isUps ? BRAND.success : BRAND.info;
        const bgColorValue = isConnected
          ? (isUps ? BRAND.success : BRAND.info)
          : '#3f3f46'; // zinc-700
        // Icon: gray when empty, white when connected
        const iconColorValue = isConnected ? '#ffffff' : '#a1a1aa'; // zinc-400 when empty

        // Check if this outlet is the source of the hovered connection
        const isHighlighted = hoveredConnection?.source_equipment_id === eq.id &&
                             hoveredConnection?.source_port_number === outletNum;

        // Handle hover on outlet to show connection line (bidirectional - works from outlet too)
        const handleOutletHover = (e) => {
          if (isConnected && conn) {
            // Set the hovered connection to trigger line drawing
            setHoveredConnection(conn);

            // Calculate line coordinates
            const outletEl = e.currentTarget;
            const container = functionalContainerRef.current;
            if (outletEl && container) {
              const outletRect = outletEl.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();

              // Find the target input element
              const inputRefKey = `${conn.target_equipment_id}-input-${conn.target_port_number}`;
              const inputEl = inputRefs.current[inputRefKey];

              if (inputEl) {
                const inputRect = inputEl.getBoundingClientRect();
                setLineCoords({
                  x1: outletRect.left + outletRect.width / 2 - containerRect.left,
                  y1: outletRect.top + outletRect.height / 2 - containerRect.top,
                  x2: inputRect.left + inputRect.width / 2 - containerRect.left,
                  y2: inputRect.top + inputRect.height / 2 - containerRect.top,
                  color: isUps ? BRAND.success : BRAND.info,
                  connectionType: conn.connection_type || 'power',
                });
              }
            }
          }
        };

        const handleOutletLeave = () => {
          setHoveredConnection(null);
          setLineCoords(null);
        };

        return (
          <div
            key={`outlet-${outletNum}`}
            ref={(el) => { outletRefs.current[outletRefKey] = el; }}
            onDragOver={handleOutletDragOver}
            onDrop={(e) => handleOutletDrop(e, eq, outletNum, portType)}
            onClick={isConnected ? (e) => handleDisconnect(e, conn.id) : undefined}
            className="w-6 h-6 rounded flex items-center justify-center relative transition-all duration-150"
            style={{
              backgroundColor: isHighlighted ? (isUps ? BRAND.success : BRAND.info) : bgColorValue,
              border: `2px solid ${isDragTarget ? BRAND.primary : (isHighlighted ? '#ffffff' : borderColorValue)}`,
              transform: isDragTarget ? 'scale(1.25)' : (isHighlighted ? 'scale(1.15)' : 'scale(1)'),
              boxShadow: isDragTarget ? `0 0 12px ${BRAND.primary}80` : (isHighlighted ? `0 0 12px ${borderColorValue}` : 'none'),
              cursor: isConnected ? 'pointer' : 'default',
            }}
            title={isConnected ? `${connectedName} - Click to disconnect` : `Outlet ${outletNum} - Drop device here`}
            onMouseEnter={handleOutletHover}
            onMouseLeave={handleOutletLeave}
          >
            <Plug size={14} style={{ color: isHighlighted ? '#ffffff' : iconColorValue }} />
          </div>
        );
      };

      // Render a power input (draggable)
      // Border = gray (neutral)
      // Fill = gray when unplugged, olive green when connected to UPS, blue when connected to surge
      const renderInput = (inputNum) => {
        const conn = inboundByPort.get(inputNum);
        const isConnected = !!conn;
        const portType = conn?.source_port_type;
        const inputRefKey = `${eq.id}-input-${inputNum}`;

        // Check if this input is the target of the hovered connection (when hovering outlet)
        const isHighlighted = hoveredConnection?.target_equipment_id === eq.id &&
                             hoveredConnection?.target_port_number === inputNum;

        // Background shows connection status using brand colors
        let bgColorValue = '#3f3f46'; // zinc-700 - unplugged = gray
        let iconColorValue = '#a1a1aa'; // zinc-400
        let title = 'Drag to connect to power outlet';

        if (isConnected) {
          if (portType === 'ups') {
            bgColorValue = BRAND.success; // olive green - connected to UPS
            iconColorValue = '#ffffff';
            title = 'Connected to UPS battery backup - Click to disconnect';
          } else if (portType === 'surge') {
            bgColorValue = BRAND.info; // blue - connected to surge/standard protection
            iconColorValue = '#ffffff';
            title = 'Connected to surge protected outlet - Click to disconnect';
          } else {
            bgColorValue = BRAND.primary; // violet - other connection
            iconColorValue = '#ffffff';
            title = 'Connected - Click to disconnect';
          }
        }

        // Handle hover to show connection line
        const handleInputHover = (e) => {
          if (isConnected && conn) {
            // Set the hovered connection to trigger line drawing
            setHoveredConnection(conn);

            // Calculate line coordinates
            const inputEl = e.currentTarget;
            const container = functionalContainerRef.current;
            if (inputEl && container) {
              const inputRect = inputEl.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();

              // Find the source outlet element
              const outletRefKey = `${conn.source_equipment_id}-outlet-${conn.source_port_number}`;
              const outletEl = outletRefs.current[outletRefKey];

              if (outletEl) {
                const outletRect = outletEl.getBoundingClientRect();
                setLineCoords({
                  x1: outletRect.left + outletRect.width / 2 - containerRect.left,
                  y1: outletRect.top + outletRect.height / 2 - containerRect.top,
                  x2: inputRect.left + inputRect.width / 2 - containerRect.left,
                  y2: inputRect.top + inputRect.height / 2 - containerRect.top,
                  color: portType === 'ups' ? BRAND.success : BRAND.info,
                  connectionType: conn.connection_type || 'power', // power goes right, network goes left
                });
              }
            }
          }

          // Hover styling - highlight but don't turn red (red is for click/disconnect)
          if (isConnected) {
            // Connected: highlight with white border to show it's active
            e.currentTarget.style.borderColor = '#ffffff';
            e.currentTarget.style.transform = 'scale(1.15)';
            e.currentTarget.style.boxShadow = `0 0 12px ${bgColorValue}`;
          } else {
            // Unconnected: show violet hover for drag hint
            e.currentTarget.style.borderColor = BRAND.primary;
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = `0 0 8px ${BRAND.primary}50`;
          }
        };

        const handleInputLeave = (e) => {
          setHoveredConnection(null);
          setLineCoords(null);

          if (isConnected) {
            e.currentTarget.style.borderColor = '#71717a';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          } else {
            e.currentTarget.style.borderColor = '#71717a';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }
        };

        return (
          <div
            key={`input-${inputNum}`}
            ref={(el) => { inputRefs.current[inputRefKey] = el; }}
            draggable={!isConnected}
            onDragStart={!isConnected ? (e) => handleInputDragStart(e, eq, inputNum) : undefined}
            onDragEnd={handleInputDragEnd}
            onClick={isConnected ? (e) => handleDisconnect(e, conn.id) : undefined}
            className="w-6 h-6 rounded flex items-center justify-center transition-all duration-150"
            style={{
              backgroundColor: bgColorValue,
              border: `2px solid ${isHighlighted ? '#ffffff' : '#71717a'}`, // white when highlighted, zinc-500 otherwise
              cursor: isConnected ? 'pointer' : 'grab',
              transform: isHighlighted ? 'scale(1.15)' : 'scale(1)',
              boxShadow: isHighlighted ? `0 0 12px ${bgColorValue}` : 'none',
            }}
            title={title}
            onMouseEnter={handleInputHover}
            onMouseLeave={handleInputLeave}
          >
            <Plug size={14} style={{ color: iconColorValue }} />
          </div>
        );
      };

      if (isPowerDevice && totalOutlets > 0) {
        // Power device - show outlets it provides, then power input on right
        return (
          <div className="flex items-center gap-3">
            {/* UPS Battery Backup Outlets (green) */}
            {upsOutlets > 0 && (
              <div className="flex items-center gap-1" title={`${upsOutlets} UPS battery backup outlets`}>
                <Zap size={12} className="text-green-400" />
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(upsOutlets, 6) }).map((_, i) =>
                    renderOutlet(i + 1, 'ups', true)
                  )}
                  {upsOutlets > 6 && (
                    <span className="text-sm text-green-400 ml-1">+{upsOutlets - 6}</span>
                  )}
                </div>
              </div>
            )}
            {/* Surge Protected Only Outlets (amber) */}
            {surgeOutlets > 0 && (
              <div className="flex items-center gap-1" title={`${surgeOutlets} surge protected outlets`}>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(surgeOutlets, 6) }).map((_, i) =>
                    renderOutlet(upsOutlets + i + 1, 'surge', false)
                  )}
                  {surgeOutlets > 6 && (
                    <span className="text-sm text-amber-400 ml-1">+{surgeOutlets - 6}</span>
                  )}
                </div>
              </div>
            )}
            {/* Power input this device requires (gray, on right like other devices) */}
            <div className="flex items-center gap-1 ml-2" title={`Requires ${outletsRequired} outlet(s)`}>
              {renderInput(1)}
            </div>
          </div>
        );
      } else {
        // Regular device - show outlets it needs (larger icons)
        return (
          <div className="flex items-center gap-2">
            {watts && (
              <span className="text-sm font-medium text-yellow-400">{watts}W</span>
            )}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(outletsRequired, 4) }).map((_, i) =>
                renderInput(i + 1)
              )}
              {outletsRequired > 4 && (
                <span className="text-sm text-zinc-400 ml-1">+{outletsRequired - 4}</span>
              )}
            </div>
          </div>
        );
      }
    };

    // Helper to render network info for an equipment item
    // Uses HA data to show live connections based on switch_name/switch_port
    const renderNetworkInfo = (eq) => {
      const isNetworkSwitch = eq.global_part?.is_network_switch;
      const hasNetworkPort = eq.global_part?.has_network_port !== false; // Default true for most devices

      // Get this equipment's HA network info
      const networkInfo = getNetworkInfo(eq);
      const switchName = networkInfo?.switchName;
      const switchPort = networkInfo?.switchPort;

      // Check if this is a gateway or switch with ports from HA
      // Look up the HA device data to get real-time port info
      const mac = eq.ha_client_mac?.toLowerCase();
      const haDevice = mac ? haDevices.find(d => d.mac?.toLowerCase() === mac) : null;
      const isGateway = haDevice?.category === 'gateway';
      const haPortTable = haDevice?.port_table || [];

      // Use HA port count if available, fallback to global_part
      const switchPorts = haPortTable.length > 0
        ? haPortTable.length
        : (haDevice?.ports_total || eq.global_part?.switch_ports || 0);

      // Detect uplink ports from HA data (is_uplink flag) instead of static value
      const uplinkPortsFromHA = haPortTable.filter(p => p.is_uplink).length;
      const uplinkPorts = uplinkPortsFromHA > 0 ? uplinkPortsFromHA : (eq.global_part?.uplink_ports || 0);

      // Detect PoE from HA data per-port, or fallback to global_part
      const hasPoEPorts = haPortTable.some(p => p.poe_enable);
      const poeEnabled = hasPoEPorts || eq.global_part?.poe_enabled;

      // Determine if this device should show switch-style ports
      const showSwitchPorts = (isNetworkSwitch || isGateway) && switchPorts > 0;

      // Network colors
      const NETWORK = {
        standard: '#06B6D4',   // cyan - standard network port
        poe: '#8B5CF6',        // violet - PoE enabled port
        uplink: '#10B981',     // emerald - uplink/SFP port
        warning: '#F59E0B',    // amber - trouble
        connected: '#22C55E',  // green - live connection from HA
      };

      // For switches: build a map of which ports have devices connected (from HA data)
      // This checks THREE sources:
      // 1. Equipment in the rack that's linked to HA clients
      // 2. All HA clients (network devices like computers, phones) reporting connection to this switch
      // 3. All HA devices (infrastructure like APs) with uplink info pointing to this switch
      const getPortConnections = () => {
        const portMap = new Map();

        // Get this switch's HA client data (the friendly name is how other devices identify which switch they're connected to)
        const switchNetInfo = getNetworkInfo(eq);
        const switchMac = switchNetInfo?.mac?.toLowerCase();

        // Build list of possible names for this switch (in priority order)
        // 1. HA client hostname (friendly name from UniFi) - this is what other devices report as switch_name
        // 2. Equipment instance_name
        // 3. Equipment name
        // 4. Global part name
        // 5. Model name
        const possibleSwitchNames = [
          switchNetInfo?.hostname,
          eq.instance_name,
          eq.name,
          eq.global_part?.name,
          eq.model,
          eq.global_part?.model
        ].filter(Boolean).map(n => n.toLowerCase());

        // Helper to check if a switch_name matches this switch
        const matchesSwitchName = (reportedSwitchName) => {
          if (!reportedSwitchName) return false;
          const name = reportedSwitchName.toLowerCase();
          return possibleSwitchNames.some(swName =>
            name.includes(swName) || swName.includes(name)
          );
        };

        // 1. Look through all equipment's HA client data to find what's connected to this switch
        equipment.forEach(otherEq => {
          if (otherEq.id === eq.id) return; // Skip self

          const otherNetInfo = getNetworkInfo(otherEq);
          if (otherNetInfo?.switchName && otherNetInfo?.switchPort) {
            if (matchesSwitchName(otherNetInfo.switchName)) {
              portMap.set(otherNetInfo.switchPort, {
                equipment: otherEq,
                switchPort: otherNetInfo.switchPort,
                isOnline: otherNetInfo.isOnline,
                ip: otherNetInfo.ip,
                hostname: otherNetInfo.hostname,
                source: 'equipment',
              });
            }
          }
        });

        // 2. Check all HA clients (network devices) that report being connected to this switch
        // Try to link them back to rack equipment via MAC address
        haClients.forEach(client => {
          if (!client.switch_name || !client.switch_port) return;
          if (portMap.has(client.switch_port)) return; // Already have equipment on this port

          if (matchesSwitchName(client.switch_name)) {
            // Try to find rack equipment with this MAC
            const linkedEquipment = client.mac
              ? equipment.find(e => e.ha_client_mac?.toLowerCase() === client.mac.toLowerCase())
              : null;

            portMap.set(client.switch_port, {
              equipment: linkedEquipment || null,
              switchPort: client.switch_port,
              isOnline: client.is_online !== false,
              ip: client.ip,
              hostname: client.hostname || client.mac,
              mac: client.mac,
              source: linkedEquipment ? 'ha_client_linked' : 'ha_client',
            });
          }
        });

        // 3. Check all HA devices (infrastructure like APs) that have uplink pointing to this switch
        // Try to link them back to rack equipment via MAC address
        haDevices.forEach(device => {
          if (!device.uplink_switch_port) return;
          if (portMap.has(device.uplink_switch_port)) return; // Already have something on this port

          // Match by switch MAC or name
          const matchesByMac = switchMac && device.uplink_switch_mac?.toLowerCase() === switchMac;
          const matchesByName = matchesSwitchName(device.uplink_switch_name);

          if (matchesByMac || matchesByName) {
            // Try to find rack equipment with this MAC
            const linkedEquipment = device.mac
              ? equipment.find(e => e.ha_client_mac?.toLowerCase() === device.mac.toLowerCase())
              : null;

            portMap.set(device.uplink_switch_port, {
              equipment: linkedEquipment || null,
              switchPort: device.uplink_switch_port,
              isOnline: device.is_online !== false,
              ip: device.ip,
              hostname: device.name,
              mac: device.mac,
              category: device.category, // 'access_point', 'switch', 'gateway'
              numStations: device.num_sta,
              source: linkedEquipment ? 'ha_device_linked' : 'ha_device',
            });
          }
        });

        // 4. Check HA port_table for connected device MACs (lldp_remote_mac, mac, port_mac)
        // This catches devices that are connected but not reporting their switch connection
        if (haPortTable.length > 0) {
          haPortTable.forEach(port => {
            if (portMap.has(port.port_idx)) return; // Already identified
            if (!port.up) return; // Port is down

            const portMac = port.lldp_remote_mac || port.mac || port.port_mac;

            // Always try to find rack equipment by MAC first
            const linkedEquipment = portMac
              ? equipment.find(e => e.ha_client_mac?.toLowerCase() === portMac.toLowerCase())
              : null;

            if (portMac) {
              // Try to find this MAC in haDevices or haClients for additional info
              const connectedDevice = haDevices.find(d =>
                d.mac?.toLowerCase() === portMac.toLowerCase()
              );
              const connectedClient = haClients.find(c =>
                c.mac?.toLowerCase() === portMac.toLowerCase()
              );

              if (connectedDevice) {
                portMap.set(port.port_idx, {
                  equipment: linkedEquipment || null,
                  switchPort: port.port_idx,
                  isOnline: connectedDevice.is_online !== false,
                  ip: connectedDevice.ip,
                  hostname: connectedDevice.name,
                  mac: portMac,
                  category: connectedDevice.category,
                  source: linkedEquipment ? 'ha_port_table_device_linked' : 'ha_port_table_device',
                });
              } else if (connectedClient) {
                portMap.set(port.port_idx, {
                  equipment: linkedEquipment || null,
                  switchPort: port.port_idx,
                  isOnline: connectedClient.is_online !== false,
                  ip: connectedClient.ip,
                  hostname: connectedClient.hostname,
                  mac: portMac,
                  source: linkedEquipment ? 'ha_port_table_client_linked' : 'ha_port_table_client',
                });
              } else if (linkedEquipment) {
                // Found equipment by MAC but not in HA devices/clients
                portMap.set(port.port_idx, {
                  equipment: linkedEquipment,
                  switchPort: port.port_idx,
                  isOnline: true,
                  ip: null,
                  hostname: getEquipmentDisplayName(linkedEquipment),
                  mac: portMac,
                  source: 'ha_port_table_equipment_only',
                });
              } else {
                // Port is up but device not identified - show as active but unknown
                portMap.set(port.port_idx, {
                  equipment: null,
                  switchPort: port.port_idx,
                  isOnline: true,
                  hostname: `Active (${portMac?.substring(0, 8) || 'no MAC'}...)`,
                  mac: portMac,
                  source: 'ha_port_up_unknown',
                });
              }
            } else if (port.up) {
              // Port is up but no MAC - still show as active
              portMap.set(port.port_idx, {
                equipment: null,
                switchPort: port.port_idx,
                isOnline: true,
                hostname: 'Active device',
                source: 'ha_port_up_no_mac',
              });
            }
          });
        }

        return portMap;
      };

      // Render a single switch port with port number
      // isPortUp: whether the physical port shows link (from HA port_table)
      const renderSwitchPort = (portNum, portType, isPoe = false, isUplink = false, connectedDevice = null, isPortUp = null) => {
        const portRefKey = `${eq.id}-switch-${portNum}`;
        const isConnected = !!connectedDevice;
        const isDragTarget = draggingNetworkPort && !isConnected;

        // Color based on connection state and port type
        let portColor = isUplink ? NETWORK.uplink : (isPoe ? NETWORK.poe : NETWORK.standard);
        if (isConnected) {
          portColor = connectedDevice.isOnline ? NETWORK.connected : NETWORK.warning;
        } else if (isPortUp === true && !isConnected) {
          // Port is active but device not identified - show as blue
          portColor = '#3B82F6'; // blue - active but unidentified
        }

        // Dim ports that are definitively down
        const isDown = isPortUp === false;
        const bgColorValue = isConnected || isPortUp ? portColor : '#3f3f46';
        const iconColorValue = isConnected ? '#ffffff' : (isPortUp ? '#ffffff' : '#a1a1aa');
        const portOpacity = isDown ? 0.4 : 1;

        // Build tooltip
        let title = `Port ${portNum}`;
        if (isPoe) title += ' (PoE)';
        if (isUplink) title += ' (Uplink)';
        if (isConnected) {
          // Get device name - either from linked equipment or from HA data
          let deviceName;
          if (connectedDevice.equipment) {
            deviceName = getEquipmentDisplayName(connectedDevice.equipment);
          } else {
            deviceName = connectedDevice.hostname || connectedDevice.mac || 'Unknown Device';
            // Add category indicator for infrastructure devices
            if (connectedDevice.category === 'access_point') {
              deviceName = `📡 ${deviceName}`;
              if (connectedDevice.numStations) {
                deviceName += ` (${connectedDevice.numStations} stations)`;
              }
            } else if (connectedDevice.category === 'switch') {
              deviceName = `🔀 ${deviceName}`;
            } else if (connectedDevice.category === 'gateway') {
              deviceName = `🌐 ${deviceName}`;
            }
          }
          title = `Port ${portNum}: ${deviceName}`;
          if (connectedDevice.ip) title += ` (${connectedDevice.ip})`;
          title += connectedDevice.isOnline ? ' - Online' : ' - Offline';
          // Show source for debugging
          if (!connectedDevice.equipment && connectedDevice.source) {
            title += ` [${connectedDevice.source}]`;
          }
        }

        // Check if this port is highlighted (hover or pinned)
        const isHighlighted = (hoveredConnection?.switchId === eq.id && hoveredConnection?.portNum === portNum) ||
                             (pinnedConnection?.switchId === eq.id && pinnedConnection?.portNum === portNum);

        // Helper to calculate connection line coords between this switch port and the connected device
        const calculateLineCoords = () => {
          const container = functionalContainerRef.current;
          const switchPortEl = switchPortRefs.current[portRefKey];
          if (!switchPortEl || !container) {
            console.log('[Line Coords] Missing container or switch port element', { portRefKey, hasContainer: !!container });
            return null;
          }

          const switchRect = switchPortEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Calculate switch port position - line connects to BOTTOM of port icon (like a cable plugging in)
          const x1 = switchRect.left + switchRect.width / 2 - containerRect.left;
          const y1 = switchRect.bottom - containerRect.top; // Bottom of port, not center

          // Find the switch card element to get its bottom edge
          const switchCardEl = switchPortEl.closest('[data-equipment-card]');
          const switchCardBottom = switchCardEl
            ? switchCardEl.getBoundingClientRect().bottom - containerRect.top + 8
            : y1 + 40;

          // Find the target device element
          let targetEl = null;
          let targetName = 'unknown';

          // For equipment connections, find the connected device's network port
          if (connectedDevice?.equipment) {
            const deviceRefKey = `${connectedDevice.equipment.id}-device-1`;
            targetEl = devicePortRefs.current[deviceRefKey];
            targetName = `equipment:${connectedDevice.equipment.id}`;
          }

          // If not found, try by MAC in equipment list
          if (!targetEl && connectedDevice?.mac) {
            const matchingEquipment = equipment.find(e =>
              e.ha_client_mac?.toLowerCase() === connectedDevice.mac?.toLowerCase()
            );
            if (matchingEquipment) {
              const deviceRefKey = `${matchingEquipment.id}-device-1`;
              targetEl = devicePortRefs.current[deviceRefKey];
              targetName = `mac-match:${matchingEquipment.id}`;
            }
          }

          if (targetEl) {
            const deviceRect = targetEl.getBoundingClientRect();
            // Line connects to BOTTOM of device port (like a cable plugging in from below)
            const x2 = deviceRect.left + deviceRect.width / 2 - containerRect.left;
            const y2 = deviceRect.bottom - containerRect.top; // Bottom of port, not center

            // Find the device card element to get its bottom edge
            const deviceCardEl = targetEl.closest('[data-equipment-card]');
            const deviceCardBottom = deviceCardEl
              ? deviceCardEl.getBoundingClientRect().bottom - containerRect.top + 8
              : y2 + 40;

            console.log('[Line Coords] Success', {
              portNum,
              targetName,
              from: { x1, y1 },
              to: { x2, y2 },
              switchCardBottom,
              deviceCardBottom,
            });

            return {
              x1,
              y1,
              x2,
              y2,
              sourceCardBottom: switchCardBottom,
              destCardBottom: deviceCardBottom,
              color: portColor,
              connectionType: 'network',
            };
          }

          console.log('[Line Coords] No target element found', {
            portNum,
            hasEquipment: !!connectedDevice?.equipment,
            mac: connectedDevice?.mac,
            availableRefs: Object.keys(devicePortRefs.current),
          });

          return null;
        };

        // Handle click to pin/toggle connection line
        const handlePortClick = (e) => {
          e.stopPropagation();

          // If already pinned to this port, unpin
          if (pinnedConnection?.switchId === eq.id && pinnedConnection?.portNum === portNum) {
            setPinnedConnection(null);
            setPinnedLineCoords(null);
            setWireDropModal(null);
            return;
          }

          // If port has a connection, pin it
          if (isConnected && connectedDevice) {
            const connectionInfo = {
              switchId: eq.id,
              portNum,
              deviceId: connectedDevice.equipment?.id || null,
              connectedDevice,
              portColor,
            };
            setPinnedConnection(connectionInfo);

            // Calculate line coords after a short delay to ensure refs are set
            setTimeout(() => {
              const coords = calculateLineCoords();
              setPinnedLineCoords(coords);
            }, 10);

            // If connected via wire drop, show wire drop modal
            if (connectedDevice.wireDrop) {
              setWireDropModal({
                wireDrop: connectedDevice.wireDrop,
                equipment: connectedDevice.equipment,
                portNum,
              });
            }
          } else if (isPortUp) {
            // Active port but no identified device - still allow highlighting
            setPinnedConnection({ switchId: eq.id, portNum, deviceId: null });
            setPinnedLineCoords(null);
          }
        };

        // Handle hover to show connection line
        const handlePortHover = () => {
          if (isConnected && connectedDevice) {
            // Check if device is linked to rack equipment (either directly or via MAC match)
            const hasEquipment = connectedDevice.equipment ||
              (connectedDevice.mac && equipment.some(e =>
                e.ha_client_mac?.toLowerCase() === connectedDevice.mac?.toLowerCase()
              ));

            if (hasEquipment) {
              setHoveredConnection({
                switchId: eq.id,
                portNum,
                deviceId: connectedDevice.equipment?.id || null,
                mac: connectedDevice.mac
              });
              // Calculate coords after a short delay
              setTimeout(() => {
                const coords = calculateLineCoords();
                if (coords) setLineCoords(coords);
              }, 10);
            } else {
              // For non-equipment connections (HA clients/devices not in rack),
              // just highlight the port without drawing a line
              setHoveredConnection({ switchId: eq.id, portNum, deviceId: null });
            }
          }
        };

        const handlePortLeave = () => {
          setHoveredConnection(null);
          setLineCoords(null);
        };

        return (
          <div
            key={`switch-${portNum}`}
            ref={(el) => { switchPortRefs.current[portRefKey] = el; }}
            className="flex flex-col items-center gap-0.5 cursor-pointer"
            style={{ opacity: portOpacity }}
            onMouseEnter={handlePortHover}
            onMouseLeave={handlePortLeave}
            onClick={handlePortClick}
          >
            {/* Port number ABOVE the port */}
            <span
              className="text-[9px] font-mono transition-all duration-150"
              style={{
                color: isHighlighted ? '#ffffff' : '#71717a',
                fontWeight: isHighlighted ? 'bold' : 'normal',
                textShadow: isHighlighted ? `0 0 6px ${portColor}` : 'none',
              }}
            >
              {portNum}
            </span>
            <div
              className="w-5 h-5 rounded flex items-center justify-center relative transition-all duration-150"
              style={{
                backgroundColor: isHighlighted ? portColor : bgColorValue,
                border: `2px solid ${isDragTarget ? '#8B5CF6' : (isHighlighted ? '#ffffff' : (isConnected || isPortUp ? portColor : '#52525b'))}`,
                transform: isHighlighted ? 'scale(1.15)' : 'scale(1)',
                boxShadow: isHighlighted ? `0 0 8px ${portColor}` : 'none',
              }}
              title={title}
            >
              <Cable size={10} style={{ color: isHighlighted ? '#ffffff' : iconColorValue }} />
            </div>
          </div>
        );
      };

      // Render a device's network port (LEFT side of card)
      const renderDevicePort = (portNum) => {
        const portRefKey = `${eq.id}-device-${portNum}`;

        // Check if this device is connected via HA data
        const isConnectedViaHA = switchName && switchPort;

        // Check if highlighted (when hovering OR pinned)
        const isHighlighted = hoveredConnection?.deviceId === eq.id ||
                             pinnedConnection?.deviceId === eq.id;

        // Color based on connection state
        let bgColorValue = '#3f3f46'; // disconnected = gray
        let iconColorValue = '#a1a1aa';
        let title = 'Not connected to network';
        let borderColor = '#71717a';

        if (isConnectedViaHA) {
          bgColorValue = networkInfo?.isOnline ? NETWORK.connected : NETWORK.warning;
          iconColorValue = '#ffffff';
          borderColor = bgColorValue;
          title = `${switchName} Port ${switchPort}`;
          if (networkInfo?.ip) title += ` (${networkInfo.ip})`;
          title += networkInfo?.isOnline ? ' - Online' : ' - Offline';
        }

        // Find the switch/gateway equipment that this device connects to
        const findSwitchEquipment = () => {
          if (!isConnectedViaHA) return null;

          // First, try to find by checking HA devices/clients to get the switch MAC
          const myMac = eq.ha_client_mac?.toLowerCase();
          let upstreamSwitchMac = null;

          // Check HA clients for this device's upstream switch
          const myHaClient = haClients.find(c => c.mac?.toLowerCase() === myMac);
          if (myHaClient?.switch_mac) {
            upstreamSwitchMac = myHaClient.switch_mac.toLowerCase();
          }

          // Check HA devices for this device's upstream switch
          const myHaDevice = haDevices.find(d => d.mac?.toLowerCase() === myMac);
          if (myHaDevice?.uplink_switch_mac) {
            upstreamSwitchMac = myHaDevice.uplink_switch_mac.toLowerCase();
          }

          console.log('[findSwitchEquipment] Debug:', {
            myMac,
            switchName,
            upstreamSwitchMac,
            myHaClient: myHaClient ? { mac: myHaClient.mac, switch_mac: myHaClient.switch_mac, switch_name: myHaClient.switch_name } : null,
            equipmentCount: equipment.length,
          });

          // If we have the upstream switch MAC, find equipment by MAC
          if (upstreamSwitchMac) {
            const matchByMac = equipment.find(sw =>
              sw.ha_client_mac?.toLowerCase() === upstreamSwitchMac
            );
            console.log('[findSwitchEquipment] MAC match result:', matchByMac?.name || matchByMac?.instance_name || 'null');
            if (matchByMac) return matchByMac;
          }

          // Fallback: match by switch name (for switches and gateways)
          const nameMatch = equipment.find(sw => {
            // Check if it's a network switch or gateway
            const isPortHost = sw.global_part?.is_network_switch ||
              haDevices.some(d =>
                d.mac?.toLowerCase() === sw.ha_client_mac?.toLowerCase() &&
                (d.category === 'switch' || d.category === 'gateway')
              );
            if (!isPortHost) return false;

            const swName = (sw.instance_name || sw.name || sw.global_part?.name || '').toLowerCase();
            const targetName = switchName.toLowerCase();
            const matches = swName.includes(targetName) || targetName.includes(swName) ||
                   (sw.model && targetName.includes(sw.model.toLowerCase()));
            console.log('[findSwitchEquipment] Name compare:', { swName, targetName, isPortHost, matches });
            return matches;
          });
          console.log('[findSwitchEquipment] Name match result:', nameMatch?.name || nameMatch?.instance_name || 'null');
          return nameMatch;
        };

        // Handle click to pin/toggle connection line
        const handleDevicePortClick = (e) => {
          e.stopPropagation();

          // If already pinned to this device, unpin
          if (pinnedConnection?.deviceId === eq.id) {
            setPinnedConnection(null);
            setPinnedLineCoords(null);
            return;
          }

          // If connected, find switch and pin the connection
          if (isConnectedViaHA) {
            const switchEq = findSwitchEquipment();
            if (switchEq) {
              setPinnedConnection({ switchId: switchEq.id, portNum: switchPort, deviceId: eq.id });

              // Calculate line coords
              const portEl = e.currentTarget;
              const container = functionalContainerRef.current;
              if (portEl && container) {
                const portRect = portEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const switchPortRefKey = `${switchEq.id}-switch-${switchPort}`;
                const switchPortEl = switchPortRefs.current[switchPortRefKey];
                if (switchPortEl) {
                  const switchRect = switchPortEl.getBoundingClientRect();

                  // Find card bottoms for routing
                  const switchCardEl = switchPortEl.closest('[data-equipment-card]');
                  const switchCardBottom = switchCardEl
                    ? switchCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : switchRect.bottom - containerRect.top + 40;

                  const deviceCardEl = portEl.closest('[data-equipment-card]');
                  const deviceCardBottom = deviceCardEl
                    ? deviceCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : portRect.bottom - containerRect.top + 40;

                  setPinnedLineCoords({
                    x1: switchRect.left + switchRect.width / 2 - containerRect.left,
                    y1: switchRect.bottom - containerRect.top, // Bottom of switch port
                    x2: portRect.left + portRect.width / 2 - containerRect.left,
                    y2: portRect.bottom - containerRect.top, // Bottom of device port
                    sourceCardBottom: switchCardBottom,
                    destCardBottom: deviceCardBottom,
                    color: bgColorValue,
                    connectionType: 'network',
                  });
                }
              }
            }
          }
        };

        // Handle hover to find and highlight the switch port
        const handleDevicePortHover = (e) => {
          console.log('[DevicePortHover]', {
            equipmentName: eq.name || eq.instance_name,
            isConnectedViaHA,
            switchName,
            switchPort
          });
          if (isConnectedViaHA) {
            const switchEq = findSwitchEquipment();
            console.log('[DevicePortHover] findSwitchEquipment result:', switchEq?.name || switchEq?.instance_name || 'null');
            if (switchEq) {
              setHoveredConnection({ switchId: switchEq.id, portNum: switchPort, deviceId: eq.id });

              const portEl = e.currentTarget;
              const container = functionalContainerRef.current;
              if (portEl && container) {
                const portRect = portEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                // Find the switch port element
                const switchPortRefKey = `${switchEq.id}-switch-${switchPort}`;
                const switchPortEl = switchPortRefs.current[switchPortRefKey];
                console.log('[DevicePortHover] switchPortRefKey:', switchPortRefKey, 'found:', !!switchPortEl);

                if (switchPortEl) {
                  const switchRect = switchPortEl.getBoundingClientRect();

                  // Find card bottoms for routing
                  const switchCardEl = switchPortEl.closest('[data-equipment-card]');
                  const switchCardBottom = switchCardEl
                    ? switchCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : switchRect.bottom - containerRect.top + 40;

                  const deviceCardEl = portEl.closest('[data-equipment-card]');
                  const deviceCardBottom = deviceCardEl
                    ? deviceCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : portRect.bottom - containerRect.top + 40;

                  setLineCoords({
                    x1: switchRect.left + switchRect.width / 2 - containerRect.left,
                    y1: switchRect.bottom - containerRect.top, // Bottom of switch port
                    x2: portRect.left + portRect.width / 2 - containerRect.left,
                    y2: portRect.bottom - containerRect.top, // Bottom of device port
                    sourceCardBottom: switchCardBottom,
                    destCardBottom: deviceCardBottom,
                    color: bgColorValue,
                    connectionType: 'network',
                  });
                }
              }
            }
          }

          // Hover style
          e.currentTarget.style.transform = 'scale(1.15)';
          e.currentTarget.style.boxShadow = `0 0 8px ${bgColorValue}`;
        };

        const handleDevicePortLeave = (e) => {
          setHoveredConnection(null);
          setLineCoords(null);
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        };

        return (
          <div
            key={`device-${portNum}`}
            ref={(el) => { devicePortRefs.current[portRefKey] = el; }}
            className="w-6 h-6 rounded flex items-center justify-center transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: bgColorValue,
              border: `2px solid ${isHighlighted ? '#ffffff' : borderColor}`,
              transform: isHighlighted ? 'scale(1.15)' : 'scale(1)',
              boxShadow: isHighlighted ? `0 0 12px ${bgColorValue}` : 'none',
            }}
            title={title}
            onMouseEnter={(e) => {
              console.log('[DevicePort INLINE] mouseEnter for', eq.name || eq.instance_name);
              handleDevicePortHover(e);
            }}
            onMouseLeave={handleDevicePortLeave}
            onClick={handleDevicePortClick}
          >
            <Cable size={14} style={{ color: iconColorValue }} />
          </div>
        );
      };

      if (showSwitchPorts) {
        // Network switch or gateway - show ALL ports in numerical order
        const portConnections = getPortConnections();

        // If we have HA port_table data, use it for accurate per-port info
        if (haPortTable.length > 0) {
          // Sort ALL ports by port_idx - no separation of uplinks
          const sortedPorts = [...haPortTable].sort((a, b) => a.port_idx - b.port_idx);
          const portsUp = haPortTable.filter(p => p.up).length;

          return (
            <div className="flex flex-col gap-2 w-full">
              {/* Port grid - ALL ports in numerical order */}
              <div className="flex flex-wrap gap-1 justify-end">
                {sortedPorts.map(port => {
                  const connectedDevice = portConnections.get(port.port_idx);
                  const isPoe = port.poe_enable;
                  const isPortUp = port.up;
                  const isUplink = port.is_uplink;
                  // Determine port type for coloring: uplink gets emerald, PoE gets violet, standard gets cyan
                  const portType = isUplink ? 'uplink' : (isPoe ? 'poe' : 'standard');
                  return renderSwitchPort(
                    port.port_idx,
                    portType,
                    isPoe,
                    isUplink,
                    connectedDevice,
                    isPortUp
                  );
                })}
              </div>
              {/* Summary: Show active ports from HA data */}
              <div className="text-xs text-zinc-500 text-right">
                {portsUp} of {haPortTable.length} ports active
              </div>
            </div>
          );
        }

        // Fallback: use static port count from global_part
        // Show ALL ports in numerical order (no separation)
        return (
          <div className="flex flex-col gap-2 w-full">
            {/* Port grid - ALL ports in numerical order */}
            <div className="flex flex-wrap gap-1 justify-end">
              {Array.from({ length: switchPorts }).map((_, i) => {
                const portNum = i + 1;
                // Last 'uplinkPorts' are uplinks (if any)
                const isUplink = uplinkPorts > 0 && portNum > (switchPorts - uplinkPorts);
                const isPoe = poeEnabled && !isUplink;
                const connectedDevice = portConnections.get(portNum);
                const portType = isUplink ? 'uplink' : (isPoe ? 'poe' : 'standard');
                return renderSwitchPort(portNum, portType, isPoe, isUplink, connectedDevice);
              })}
            </div>
            {/* Summary: X of Y ports in use */}
            <div className="text-xs text-zinc-500 text-right">
              {portConnections.size} of {switchPorts} ports connected
            </div>
          </div>
        );
      } else if (hasNetworkPort) {
        // Regular device - show network port on LEFT side OR WiFi indicator for wireless
        // Check if this is a wireless device (has network info but no switchName/switchPort means wireless)
        const isWireless = networkInfo?.linked && networkInfo?.isWired === false;
        const ssid = networkInfo?.ssid;
        const signal = networkInfo?.signal;

        if (isWireless) {
          // Wireless device - show WiFi icon with signal strength
          // Signal strength: typically -30 to -90 dBm, lower absolute value is better
          // -30 to -50: Excellent, -50 to -60: Good, -60 to -70: Fair, -70 to -90: Weak
          const signalStrength = signal ? Math.abs(signal) : 0;
          let signalColor = '#22C55E'; // green - excellent
          let signalBars = 3;
          if (signalStrength > 70) {
            signalColor = '#EF4444'; // red - weak
            signalBars = 1;
          } else if (signalStrength > 60) {
            signalColor = '#F59E0B'; // amber - fair
            signalBars = 2;
          } else if (signalStrength > 50) {
            signalColor = '#22C55E'; // green - good
            signalBars = 3;
          }

          const signalLabel = signal ? `${signal} dBm` : 'Unknown';
          const title = ssid ? `WiFi: ${ssid} (${signalLabel})` : `WiFi (${signalLabel})`;

          return (
            <div
              className="flex items-center gap-2 group cursor-pointer"
              title={title}
            >
              <div
                className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${signalColor}20`,
                  border: `2px solid ${signalColor}`,
                  boxShadow: `0 0 0 0 ${signalColor}`,
                  animation: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.animation = 'wifi-pulse 1.5s ease-in-out infinite';
                  e.currentTarget.style.boxShadow = `0 0 12px ${signalColor}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.animation = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <Wifi size={16} style={{ color: signalColor }} />
                {/* Signal strength indicator bars */}
                <div className="absolute -bottom-1 -right-1 flex gap-0.5">
                  {[1, 2, 3].map((bar) => (
                    <div
                      key={bar}
                      className="w-1 rounded-sm transition-all"
                      style={{
                        height: `${bar * 3 + 2}px`,
                        backgroundColor: bar <= signalBars ? signalColor : '#52525b',
                      }}
                    />
                  ))}
                </div>
              </div>
              {ssid && (
                <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
                  {ssid}
                </span>
              )}
            </div>
          );
        }

        // Wired device - show network port
        // For APs, also show connected stations count
        const isAccessPoint = networkInfo?.category === 'access_point';
        const numStations = networkInfo?.numStations;

        return (
          <div className="flex items-center gap-2">
            {renderDevicePort(1)}
            <div className="flex flex-col gap-0.5">
              {switchName && switchPort && (
                <span className="text-xs text-zinc-400">
                  → {switchName} P{switchPort}
                </span>
              )}
              {isAccessPoint && numStations !== null && numStations !== undefined && (
                <span className="text-xs text-cyan-400/70">
                  📡 {numStations} station{numStations !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        );
      } else {
        // Device has no network port
        return (
          <div className="flex items-center gap-2 text-zinc-500">
            <WifiOff size={14} />
            <span className="text-xs">No network</span>
          </div>
        );
      }
    };

    // Calculate the routed path for network connections
    // Orthogonal routing that runs along the BOTTOM of equipment cards:
    // 1. Down from source port to bottom of source device card
    // 2. Horizontally along bottom of source card to left edge
    // 3. Vertically through left side channel
    // 4. Horizontally along bottom of destination device card
    // 5. Up to destination port (entering from bottom)
    const getRoutedPath = (coords) => {
      if (!coords) return '';

      const { x1, y1, x2, y2, connectionType, sourceCardBottom, destCardBottom } = coords;
      const containerWidth = functionalContainerRef.current?.offsetWidth || 800;
      const r = 5; // corner radius

      const ispower = connectionType === 'power';

      if (ispower) {
        // Power: right-side routing
        const sideX = containerWidth - 8;
        return `
          M ${x1} ${y1}
          L ${sideX - r} ${y1}
          Q ${sideX} ${y1} ${sideX} ${y1 + (y2 > y1 ? r : -r)}
          L ${sideX} ${y2 - (y2 > y1 ? r : -r)}
          Q ${sideX} ${y2} ${sideX - r} ${y2}
          L ${x2} ${y2}
        `;
      } else {
        // Network: orthogonal routing through left side channel
        // Lines run along the BOTTOM of each equipment card
        const sideX = 10; // Left edge channel

        // Use provided card bottoms or estimate
        const srcBottom = sourceCardBottom || (y1 + 50);
        const dstBottom = destCardBottom || (y2 + 50);

        // Going down (source above destination) or up
        const goingDown = y2 > y1;

        // Build path segments:
        // 1. Source port → straight down
        // 2. Turn left → run along source card bottom
        // 3. Turn down/up → through side channel
        // 4. Turn right → run along dest card bottom
        // 5. Turn up → to dest port

        if (goingDown) {
          // Source is ABOVE destination
          return `
            M ${x1} ${y1}
            L ${x1} ${srcBottom - r}
            Q ${x1} ${srcBottom} ${x1 - r} ${srcBottom}
            L ${sideX + r} ${srcBottom}
            Q ${sideX} ${srcBottom} ${sideX} ${srcBottom + r}
            L ${sideX} ${dstBottom - r}
            Q ${sideX} ${dstBottom} ${sideX + r} ${dstBottom}
            L ${x2 - r} ${dstBottom}
            Q ${x2} ${dstBottom} ${x2} ${dstBottom - r}
            L ${x2} ${y2}
          `;
        } else {
          // Source is BELOW destination (going UP)
          return `
            M ${x1} ${y1}
            L ${x1} ${srcBottom - r}
            Q ${x1} ${srcBottom} ${x1 - r} ${srcBottom}
            L ${sideX + r} ${srcBottom}
            Q ${sideX} ${srcBottom} ${sideX} ${srcBottom - r}
            L ${sideX} ${dstBottom + r}
            Q ${sideX} ${dstBottom} ${sideX + r} ${dstBottom}
            L ${x2 - r} ${dstBottom}
            Q ${x2} ${dstBottom} ${x2} ${dstBottom - r}
            L ${x2} ${y2}
          `;
        }
      }
    };

    // Handle click on container background to clear pinned connection
    const handleContainerClick = (e) => {
      // Only clear if clicking the container itself, not a child element
      if (e.target === e.currentTarget || e.target.closest('[data-clear-pinned]')) {
        setPinnedConnection(null);
        setPinnedLineCoords(null);
        setWireDropModal(null);
      }
    };

    return (
      <div
        className="p-4 relative"
        ref={functionalContainerRef}
        style={{ isolation: 'isolate' }}
        onClick={handleContainerClick}
      >
        {/* Wire Drop Modal */}
        {wireDropModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]" onClick={() => setWireDropModal(null)}>
            <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-zinc-100">Wire Drop Connection</h3>
                <button onClick={() => setWireDropModal(null)} className="text-zinc-400 hover:text-zinc-200">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Room</span>
                  <span className="text-zinc-100">{wireDropModal.wireDrop?.room_name || 'Unknown'}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Wire Drop ID</span>
                  <span className="text-zinc-100 font-mono">{wireDropModal.wireDrop?.label || wireDropModal.wireDrop?.id?.slice(0, 8)}</span>
                </div>
                {wireDropModal.equipment && (
                  <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                    <span className="text-zinc-400">Equipment</span>
                    <span className="text-zinc-100">{getEquipmentDisplayName(wireDropModal.equipment)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Switch Port</span>
                  <span className="text-zinc-100">Port {wireDropModal.portNum}</span>
                </div>
                <div className="flex gap-2 mt-4">
                  {wireDropModal.wireDrop?.id && (
                    <button
                      onClick={() => {
                        // Navigate to wire drop - this would need to be wired up to your routing
                        console.log('Navigate to wire drop:', wireDropModal.wireDrop.id);
                        setWireDropModal(null);
                      }}
                      className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm transition-colors"
                    >
                      View Wire Drop
                    </button>
                  )}
                  {wireDropModal.equipment?.id && (
                    <button
                      onClick={() => {
                        // Navigate to equipment - this would need to be wired up to your routing
                        console.log('Navigate to equipment:', wireDropModal.equipment.id);
                        setWireDropModal(null);
                      }}
                      className="flex-1 px-3 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded text-sm transition-colors"
                    >
                      View Equipment
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* WiFi pulse animation keyframes */}
        <style>{`
          @keyframes wifi-pulse {
            0% {
              box-shadow: 0 0 0 0 currentColor;
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 12px currentColor;
              transform: scale(1.1);
            }
            100% {
              box-shadow: 0 0 0 0 currentColor;
              transform: scale(1);
            }
          }
        `}</style>
        {/* Animated Connection Line SVG Overlay - positioned above all content */}
        {/* Shows pinned line (from click) OR hover line, with pinned taking precedence */}
        {(pinnedLineCoords || lineCoords) && (
          <svg
            className="absolute pointer-events-none"
            style={{
              zIndex: 9999,
              overflow: 'visible',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
          >
            <defs>
              {/* Glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Render pinned line (solid, always visible when pinned) */}
            {pinnedLineCoords && (
              <>
                <path
                  d={getRoutedPath(pinnedLineCoords)}
                  stroke={pinnedLineCoords.color}
                  strokeWidth="8"
                  strokeOpacity="0.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  filter="url(#glow)"
                />
                <path
                  d={getRoutedPath(pinnedLineCoords)}
                  stroke={pinnedLineCoords.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray="8 4"
                  style={{ animation: 'powerFlow 0.5s linear infinite' }}
                />
                <circle cx={pinnedLineCoords.x1} cy={pinnedLineCoords.y1} r="5" fill={pinnedLineCoords.color} filter="url(#glow)" />
                <circle cx={pinnedLineCoords.x2} cy={pinnedLineCoords.y2} r="6" fill={pinnedLineCoords.color} filter="url(#glow)" />
              </>
            )}
            {/* Render hover line only if no pinned line (to avoid visual overlap) */}
            {lineCoords && !pinnedLineCoords && (
              <>
                <path
                  d={getRoutedPath(lineCoords)}
                  stroke={lineCoords.color}
                  strokeWidth="8"
                  strokeOpacity="0.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  filter="url(#glow)"
                />
                <path
                  d={getRoutedPath(lineCoords)}
                  stroke={lineCoords.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray="8 4"
                  style={{ animation: 'powerFlow 0.5s linear infinite' }}
                />
                <circle cx={lineCoords.x1} cy={lineCoords.y1} r="5" fill={lineCoords.color} filter="url(#glow)" />
                <circle cx={lineCoords.x2} cy={lineCoords.y2} r="6" fill={lineCoords.color} filter="url(#glow)" />
              </>
            )}
            <style>
              {`
                @keyframes powerFlow {
                  from { stroke-dashoffset: 12; }
                  to { stroke-dashoffset: 0; }
                }
              `}
            </style>
          </svg>
        )}

        {/* WAN Modem Section - shown when gateway exists and network tab is active */}
        {connectionTab === 'network' && gatewayWanInfo && (
          <div className="mb-4 rounded-lg border border-zinc-600 bg-zinc-800 overflow-hidden">
            {/* Internet Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-700/50 border-b border-zinc-600">
              <div className="flex items-center gap-3">
                <Globe size={18} className="text-zinc-300" />
                <span className="text-sm font-medium text-zinc-200">Internet / WAN</span>
              </div>
              {gatewayWanInfo.wanIp && (
                <span className="text-xs font-mono text-zinc-300 bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-600">
                  {gatewayWanInfo.wanIp}
                </span>
              )}
            </div>

            {/* WAN Modems - clickable to show connection to gateway */}
            <div className="p-3 space-y-2">
              {gatewayWanInfo.wanPorts.map((wanPort, idx) => {
                const isActive = wanPort.up;
                // Detect Starlink by port name or WAN name containing 'starlink'
                const portNameLower = (wanPort.name || '').toLowerCase();
                const isStarlink = portNameLower.includes('starlink') || portNameLower.includes('satellite');
                // Only show satellite icon for Starlink, otherwise use generic modem icon
                const modemIcon = isStarlink ? '🛰️' : '📶';
                // Name based on detection
                const modemName = isStarlink
                  ? (idx === 0 ? 'Starlink Primary' : 'Starlink Backup')
                  : (idx === 0 ? 'Primary Modem' : `Modem ${idx + 1}`);
                const isSelected = pinnedConnection?.wanPortIdx === wanPort.portIdx;

                // Calculate WAN connection line coordinates
                const calculateWanLineCoords = (modemCardEl) => {
                  if (!isActive || !gatewayWanInfo.gateway.equipment) return null;

                  const container = functionalContainerRef.current;
                  const gatewayEqId = gatewayWanInfo.gateway.equipment?.id;

                  // Get the modem's port indicator element
                  const modemPortRefKey = `wan-port-${wanPort.portIdx}`;
                  const modemPortEl = switchPortRefs.current[modemPortRefKey];

                  // Get the gateway's port element
                  const gatewayPortRefKey = `${gatewayEqId}-switch-${wanPort.portIdx}`;
                  const gatewayPortEl = switchPortRefs.current[gatewayPortRefKey];

                  if (container && modemPortEl && gatewayPortEl) {
                    const containerRect = container.getBoundingClientRect();
                    const modemPortRect = modemPortEl.getBoundingClientRect();
                    const gatewayPortRect = gatewayPortEl.getBoundingClientRect();
                    const modemCardRect = modemCardEl.getBoundingClientRect();

                    // Find gateway card bottom
                    const gatewayCardEl = gatewayPortEl.closest('[data-equipment-card]');
                    const gatewayCardBottom = gatewayCardEl
                      ? gatewayCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                      : gatewayPortRect.bottom - containerRect.top + 40;

                    // Modem card bottom
                    const modemCardBottom = modemCardRect.bottom - containerRect.top + 8;

                    return {
                      // From modem port (bottom of port icon)
                      x1: modemPortRect.left + modemPortRect.width / 2 - containerRect.left,
                      y1: modemPortRect.bottom - containerRect.top,
                      // To gateway port (bottom of port icon)
                      x2: gatewayPortRect.left + gatewayPortRect.width / 2 - containerRect.left,
                      y2: gatewayPortRect.bottom - containerRect.top,
                      sourceCardBottom: modemCardBottom,
                      destCardBottom: gatewayCardBottom,
                      color: '#10B981', // emerald for WAN/uplink
                      connectionType: 'network',
                    };
                  }
                  return null;
                };

                // Handle hover to show WAN connection line
                const handleWanHover = (e) => {
                  if (!isActive || !gatewayWanInfo.gateway.equipment) return;

                  setHoveredConnection({
                    wanPortIdx: wanPort.portIdx,
                    gatewayId: gatewayWanInfo.gateway.equipment?.id,
                    isWanConnection: true,
                  });

                  const coords = calculateWanLineCoords(e.currentTarget);
                  if (coords) setLineCoords(coords);
                };

                const handleWanLeave = () => {
                  setHoveredConnection(null);
                  setLineCoords(null);
                };

                // Handle click to pin/toggle WAN connection line
                const handleWanClick = (e) => {
                  e.stopPropagation();
                  if (!isActive || !gatewayWanInfo.gateway.equipment) return;

                  // If already selected, unpin
                  if (isSelected) {
                    setPinnedConnection(null);
                    setPinnedLineCoords(null);
                    return;
                  }

                  // Pin this WAN connection
                  setPinnedConnection({
                    wanPortIdx: wanPort.portIdx,
                    gatewayId: gatewayWanInfo.gateway.equipment?.id,
                    isWanConnection: true,
                  });

                  const coords = calculateWanLineCoords(e.currentTarget);
                  if (coords) setPinnedLineCoords(coords);
                };

                // Check if this modem is highlighted (hover or pinned)
                const isHighlighted = (hoveredConnection?.wanPortIdx === wanPort.portIdx) ||
                                     (pinnedConnection?.wanPortIdx === wanPort.portIdx);

                return (
                  <div
                    key={`wan-${wanPort.portIdx}`}
                    ref={(el) => { if (el) switchPortRefs.current[`wan-modem-${wanPort.portIdx}`] = el; }}
                    onClick={handleWanClick}
                    onMouseEnter={handleWanHover}
                    onMouseLeave={handleWanLeave}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      isSelected || isHighlighted
                        ? 'bg-emerald-900/30 border-emerald-500 ring-2 ring-emerald-500/50'
                        : isActive
                          ? 'bg-zinc-900/50 border-zinc-500 hover:border-zinc-400'
                          : 'bg-zinc-900/30 border-zinc-700 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{modemIcon}</span>
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{modemName}</div>
                        <div className="text-xs text-zinc-400">
                          WAN {idx + 1} → Gateway {wanPort.name || `Port ${wanPort.portIdx}`}
                          {wanPort.speed > 0 && ` • ${wanPort.speed >= 1000 ? `${wanPort.speed/1000}G` : `${wanPort.speed}M`}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Port indicator - ref for connection line targeting */}
                      <div
                        ref={(el) => { if (el) switchPortRefs.current[`wan-port-${wanPort.portIdx}`] = el; }}
                        className="flex flex-col items-center gap-0.5"
                      >
                        <span
                          className="text-[9px] font-mono transition-all duration-150"
                          style={{
                            color: (isSelected || isHighlighted) ? '#10B981' : '#71717a',
                            fontWeight: (isSelected || isHighlighted) ? 'bold' : 'normal',
                            textShadow: (isSelected || isHighlighted) ? '0 0 6px #10B981' : 'none',
                          }}
                        >
                          {wanPort.portIdx}
                        </span>
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center transition-all duration-150"
                          style={{
                            backgroundColor: isActive ? ((isSelected || isHighlighted) ? '#10B981' : '#22C55E') : '#3f3f46',
                            border: `2px solid ${(isSelected || isHighlighted) ? '#ffffff' : (isActive ? '#10B981' : '#52525b')}`,
                            transform: (isSelected || isHighlighted) ? 'scale(1.15)' : 'scale(1)',
                            boxShadow: (isSelected || isHighlighted) ? '0 0 8px #10B981' : 'none',
                          }}
                        >
                          <Cable size={10} style={{ color: isActive ? '#ffffff' : '#a1a1aa' }} />
                        </div>
                      </div>
                      {isActive ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">Inactive</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {allItems.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              No equipment placed in rack
            </div>
          ) : (
            allItems.map(({ type, item }) => {
              if (type === 'shelf') {
                // Shelf container with equipment inside
                const shelfEquipment = item.equipment || [];
                return (
                  <div
                    key={`shelf-${item.id}`}
                    className="rounded-lg border-2 border-blue-500 bg-blue-950/20 overflow-hidden"
                  >
                    {/* Shelf Header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-blue-900/30 border-b border-blue-500/50">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-blue-400">U{item.rack_position_u}</span>
                        <Layers size={16} className="text-blue-400" />
                        <span className="text-sm font-medium text-blue-200">
                          {item.name || 'Shelf'}
                        </span>
                        <span className="text-xs text-blue-400/70">
                          {item.u_height}U
                        </span>
                      </div>
                      {onShelfDelete && (
                        <button
                          onClick={() => onShelfDelete(item.id)}
                          className="p-1 hover:bg-red-900/50 rounded text-blue-400 hover:text-red-400 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Shelf Equipment */}
                    <div className="p-2 space-y-1">
                      {shelfEquipment.length > 0 ? (
                        shelfEquipment.map(eq => {
                          const isPowerDevice = eq.global_part?.is_power_device;
                          const eqIsPortHost = isPortHost(eq); // Switch or gateway with ports
                          const showNetworkLeft = connectionTab === 'network' && !eqIsPortHost;
                          const eqNetInfo = getNetworkInfo(eq);

                          return (
                            <div
                              key={`shelf-eq-${eq.id}`}
                              data-equipment-card={eq.id}
                              onClick={() => setEditingEquipment(eq)}
                              className="flex flex-col gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                            >
                              {/* Top row: Name and settings */}
                              <div className="flex items-center gap-4">
                                {/* Network port on LEFT for regular devices */}
                                {showNetworkLeft && (
                                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {renderNetworkInfo(eq)}
                                  </div>
                                )}
                                {connectionTab === 'power' && isPowerDevice && (
                                  <Zap size={16} className="text-amber-400 flex-shrink-0" />
                                )}
                                {connectionTab === 'network' && eqIsPortHost && (
                                  <Network size={16} className="text-cyan-400 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-zinc-100 truncate">
                                    {getEquipmentDisplayName(eq, eqNetInfo?.hostname)}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }}
                                  className="p-1 rounded hover:bg-zinc-700 transition-colors"
                                  title="Edit equipment"
                                >
                                  <Settings size={14} className="text-zinc-500 hover:text-zinc-300" />
                                </button>
                              </div>
                              {/* Bottom row: Connection info - Power always right, Port hosts (switches/gateways) right */}
                              {(connectionTab === 'power' || eqIsPortHost) && (
                                <div className="flex items-center justify-end">
                                  {connectionTab === 'power' ? renderPowerInfo(eq) : renderNetworkInfo(eq)}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-4 text-blue-400/50 text-sm italic">
                          Empty shelf - drop equipment here
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                // Regular rack-mounted equipment
                const eq = item;
                const uHeight = getEquipmentUHeight(eq);
                const isPowerDevice = eq.global_part?.is_power_device;
                const eqIsPortHost = isPortHost(eq); // Switch or gateway with ports
                const eqNetInfo = getNetworkInfo(eq);

                // For network tab: non-port-hosts show port on LEFT, port hosts (switches/gateways) show ports on RIGHT
                const showNetworkLeft = connectionTab === 'network' && !eqIsPortHost;

                return (
                  <div
                    key={`eq-${eq.id}`}
                    data-equipment-card={eq.id}
                    onClick={() => setEditingEquipment(eq)}
                    className="flex flex-col gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                  >
                    {/* Top row: U position, name, settings */}
                    <div className="flex items-center gap-4">
                      {/* Network port on LEFT for regular devices */}
                      {showNetworkLeft && (
                        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {renderNetworkInfo(eq)}
                        </div>
                      )}
                      <div className="w-12 text-center">
                        <span className="text-xs font-mono text-zinc-500">U{eq.rack_position_u}</span>
                      </div>
                      {connectionTab === 'power' && isPowerDevice && (
                        <Zap size={16} className="text-amber-400 flex-shrink-0" />
                      )}
                      {connectionTab === 'network' && eqIsPortHost && (
                        <Network size={16} className="text-cyan-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                          {getEquipmentDisplayName(eq, eqNetInfo?.hostname)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 ml-2">
                          {uHeight}U
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }}
                        className="p-1 rounded hover:bg-zinc-700 transition-colors"
                        title="Edit equipment"
                      >
                        <Settings size={14} className="text-zinc-500 hover:text-zinc-300" />
                      </button>
                    </div>
                    {/* Bottom row: Connection info - Power always right, Port hosts (switches/gateways) right, Network devices already shown left */}
                    {(connectionTab === 'power' || eqIsPortHost) && (
                      <div className="flex items-center justify-end">
                        {connectionTab === 'power' ? renderPowerInfo(eq) : renderNetworkInfo(eq)}
                      </div>
                    )}
                  </div>
                );
              }
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
      {/* Header with Rack Selector */}
      <div className="flex items-center justify-between px-6 py-4 bg-zinc-800 border-b border-zinc-700">
        {/* Rack Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRackSelector(!showRackSelector)}
            className="flex items-center gap-3 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors w-96"
          >
            <Server size={18} className="text-violet-400" />
            <div className="text-left flex-1">
              <div className="text-sm font-semibold text-white">
                {rack?.name || 'Select Rack'}
              </div>
              <div className="text-xs text-zinc-400">
                {rack?.total_u}U • {rackCountDisplay}
              </div>
            </div>
            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${showRackSelector ? 'rotate-180' : ''}`} />
          </button>

          {/* Rack Dropdown Menu */}
          {showRackSelector && (
            <div className="absolute top-full left-0 mt-1 w-96 rounded-lg border border-zinc-600 bg-zinc-800 shadow-xl z-50">
              {racks.length > 0 ? (
                <div className="py-1 max-h-64 overflow-y-auto">
                  {racks.map((r, idx) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        onRackSelect?.(r);
                        setShowRackSelector(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        r.id === selectedRackId
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'hover:bg-zinc-700 text-white'
                      }`}
                    >
                      <Server size={16} className="text-zinc-400" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          {r.total_u}U • {r.location_description || 'No location'}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-500">{idx + 1}/{racks.length}</span>
                      {r.id === selectedRackId && (
                        <Check size={16} className="text-violet-400" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-center text-zinc-500">
                  No racks configured yet
                </div>
              )}
              <div className="border-t border-zinc-700">
                <button
                  onClick={() => {
                    setShowRackSelector(false);
                    onAddRack?.();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-zinc-700 text-violet-400 transition-colors"
                >
                  <Plus size={16} />
                  <span className="font-medium">Add New Rack</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Power Summary */}
        <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-900 rounded-lg text-sm">
          <div className="flex items-center gap-1.5" title="Total power consumed">
            <Zap size={14} className="text-yellow-400" />
            <span className="font-medium text-zinc-200">{powerTotals.wattsConsumed}W</span>
            {powerTotals.powerCapacity > 0 && (
              <span className="text-zinc-500">/ {powerTotals.powerCapacity}W</span>
            )}
          </div>
          <div className="flex items-center gap-1.5" title="Outlets used / available">
            <Plug size={14} className="text-blue-400" />
            <span className={`font-medium ${
              powerTotals.outletsRequired > powerTotals.outletsProvided
                ? 'text-red-400'
                : 'text-zinc-200'
            }`}>
              {powerTotals.outletsRequired}
            </span>
            {powerTotals.outletsProvided > 0 && (
              <span className="text-zinc-500">
                / <span style={{ color: '#94AF32' }} title="UPS battery backup">{powerTotals.upsOutletsProvided}</span>
                {powerTotals.surgeOutletsProvided > 0 && (
                  <span style={{ color: '#3B82F6' }} title="Surge protected"> + {powerTotals.surgeOutletsProvided}</span>
                )}
              </span>
            )}
          </div>
          {powerTotals.powerDeviceCount > 0 && (
            <div className="flex items-center gap-1" style={{ color: '#F59E0B' }} title="Power distribution devices">
              <span>⚡ {powerTotals.powerDeviceCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Power Key Legend - show only when power tab is active */}
      {connectionTab === 'power' && (
        <div className="flex items-center gap-6 px-6 py-2 bg-zinc-800/50 border-b border-zinc-700">
          <span className="text-xs text-zinc-500 font-medium">POWER KEY:</span>
          <div className="flex items-center gap-4 flex-wrap">
            {/* UPS Battery Backup */}
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #94AF32' }}
              >
                <Plug size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">UPS Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#94AF32', border: '2px solid #94AF32' }}
              >
                <Plug size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">UPS Connected</span>
            </div>

            {/* Surge Protection */}
            <div className="flex items-center gap-2 ml-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #3B82F6' }}
              >
                <Plug size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Surge Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3B82F6', border: '2px solid #3B82F6' }}
              >
                <Plug size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">Surge Connected</span>
            </div>

            {/* Unplugged Input */}
            <div className="flex items-center gap-2 ml-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #71717a' }}
              >
                <Plug size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Unplugged</span>
            </div>

            {/* Trouble/Warning State */}
            <div className="flex items-center gap-2 ml-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#F59E0B', border: '2px solid #F59E0B' }}
              >
                <Plug size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">Trouble</span>
            </div>
          </div>
        </div>
      )}

      {/* Network Key Legend - show only when network tab is active */}
      {connectionTab === 'network' && (
        <div className="flex items-center gap-6 px-6 py-2 bg-zinc-800/50 border-b border-zinc-700">
          <span className="text-xs text-zinc-500 font-medium">NETWORK KEY:</span>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Switch Port States */}
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #52525b' }}
              >
                <Cable size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Port Empty</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#22C55E', border: '2px solid #22C55E' }}
              >
                <Cable size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#F59E0B', border: '2px solid #F59E0B' }}
              >
                <Cable size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">Offline</span>
            </div>

            {/* Port Types */}
            <div className="flex items-center gap-2 ml-4">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #06B6D4' }}
              >
                <Cable size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Standard</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #8B5CF6' }}
              >
                <Cable size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">PoE</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #10B981' }}
              >
                <Cable size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Uplink</span>
            </div>

            {/* Disconnected Device Port */}
            <div className="flex items-center gap-2 ml-4">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#3f3f46', border: '2px solid #71717a' }}
              >
                <Cable size={12} style={{ color: '#a1a1aa' }} />
              </div>
              <span className="text-xs text-zinc-400">Not Linked</span>
            </div>
          </div>
        </div>
      )}

      {/* Content - based on layout mode */}
      {layoutMode === 'physical' ? renderPhysicalLayout() : renderFunctionalLayout()}

      {/* Unplaced Equipment */}
      <div className="px-4 pb-4">
        <div className="text-sm font-medium text-zinc-400 mb-3">
          Unplaced Equipment ({unplacedEquipment.length})
        </div>
        <div
          className="min-h-[80px] p-3 border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-800/30"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            try {
              const data = JSON.parse(e.dataTransfer.getData('application/json'));
              if (data.isMove) onEquipmentRemove?.(data.equipmentId);
            } catch (err) {}
          }}
        >
          {unplacedEquipment.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {unplacedEquipment.map((eq) => {
                const uHeight = eq?.global_part?.u_height || eq?.u_height || 1;
                const needsShelf = eq.needs_shelf || eq.global_part?.needs_shelf;
                const shelfUHeight = eq.shelf_u_height || eq.global_part?.shelf_u_height;
                const displayUHeight = needsShelf ? shelfUHeight : uHeight;
                const hasUHeight = needsShelf ? !!shelfUHeight : (uHeight > 0 && eq.global_part?.u_height);
                const displayName = eq?.model || eq?.global_part?.name || eq?.instance_name || eq?.name || 'Unnamed Equipment';

                return (
                  <div
                    key={eq.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        equipmentId: eq.id,
                        uHeight: needsShelf ? shelfUHeight || 2 : uHeight,
                        isMove: false,
                        needsShelf,
                        shelfUHeight: shelfUHeight || 2,
                        maxItemsPerShelf: eq.max_items_per_shelf || eq.global_part?.max_items_per_shelf || 1,
                      }));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => setEditingEquipment(eq)}
                    className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 cursor-grab active:cursor-grabbing hover:border-zinc-500 transition-all"
                  >
                    <GripVertical size={14} className="text-zinc-500 flex-shrink-0" />
                    {needsShelf ? (
                      <Layers size={14} className="text-blue-400" />
                    ) : (
                      <Server size={14} className="text-zinc-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-200 truncate">{displayName}</div>
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                        needsShelf
                          ? hasUHeight
                            ? 'bg-blue-900/50 text-blue-400 border border-blue-700'
                            : 'bg-blue-900/30 text-blue-400 border border-dashed border-blue-600'
                          : hasUHeight
                            ? 'bg-zinc-700 text-zinc-300'
                            : 'bg-yellow-900/50 text-yellow-400 border border-dashed border-yellow-600'
                      }`}
                      title={needsShelf
                        ? (hasUHeight ? `Needs ${displayUHeight}U shelf space` : 'Shelf height not set')
                        : (hasUHeight ? `${displayUHeight} rack units` : 'U-height not set')
                      }
                    >
                      {hasUHeight ? `${displayUHeight}U` : '?U'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
              All equipment placed
            </div>
          )}
        </div>
      </div>

      {/* UniFi Site Link - show only on Network tab */}
      {connectionTab === 'network' && (
        <div className="px-6 py-3 border-t border-zinc-700 bg-zinc-800/30">
          <a
            href="https://unifi.ui.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <Globe size={14} />
            Open UniFi Site Manager
            <ExternalLink size={12} className="opacity-60" />
          </a>
        </div>
      )}

      {/* Equipment Edit Modal */}
      {editingEquipment && (
        <EquipmentEditModal
          equipment={editingEquipment}
          projectId={projectId}
          networkInfo={getNetworkInfo ? getNetworkInfo(editingEquipment) : null}
          haClients={haClients}
          haDevices={haDevices}
          onClose={() => setEditingEquipment(null)}
          onSave={onEquipmentEdit}
          onRemove={onEquipmentRemove}
          onExclude={onEquipmentExclude}
          onExcludeGlobal={onEquipmentExcludeGlobal}
          onMoveRoom={onMoveRoom}
          onLinkToHA={onLinkToHA}
        />
      )}
    </div>
  );
};

RackBackView.propTypes = {
  rack: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    total_u: PropTypes.number,
    shelves: PropTypes.array,
  }),
  racks: PropTypes.array,
  selectedRackId: PropTypes.string,
  onRackSelect: PropTypes.func,
  onAddRack: PropTypes.func,
  equipment: PropTypes.array,
  unplacedEquipment: PropTypes.array,
  haClients: PropTypes.array,
  haDevices: PropTypes.array,
  layoutMode: PropTypes.oneOf(['physical', 'functional']),
  onEquipmentDrop: PropTypes.func,
  onEquipmentMove: PropTypes.func,
  onEquipmentRemove: PropTypes.func,
  onEquipmentEdit: PropTypes.func,
  onEquipmentExclude: PropTypes.func,
  onEquipmentExcludeGlobal: PropTypes.func,
  onEquipmentDropOnShelf: PropTypes.func,
  onMoveRoom: PropTypes.func,
  onLinkToHA: PropTypes.func,
  onAddShelf: PropTypes.func,
  onShelfMove: PropTypes.func,
  onShelfDelete: PropTypes.func,
  getNetworkInfo: PropTypes.func,
  // Power connection props
  connections: PropTypes.array,
  onCreateConnection: PropTypes.func,
  onDeleteConnection: PropTypes.func,
  onAddPowerStrip: PropTypes.func,
  projectId: PropTypes.string,
};

export default memo(RackBackView);
