/**
 * RackBackView.jsx
 * Back view of rack equipment showing device network status and connectivity
 * Supports both physical (rack grid) and functional (list) layout modes
 */

import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { WifiOff, Wifi, Globe, ExternalLink, Zap, Plug, Link2, ChevronDown, GripVertical, Settings, Server, Layers, X, Plus, Check, Network, Cable, MapPin } from 'lucide-react';
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
  allProjectEquipment = [],  // All project equipment for MAC lookups (includes non-rack equipment)
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
  // React Router hooks for navigation
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams();
  const activeProjectId = projectId || routeProjectId;

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
  // State for wire drop modal (full modal on click)
  const [wireDropModal, setWireDropModal] = useState(null);
  // State for hover popup (mini modal on mouseover)
  const [hoverPopup, setHoverPopup] = useState(null);
  const hoverTimeoutRef = useRef(null);
  // State to track which port is actively highlighted (for clearing on mouse leave)
  const [activePortHighlight, setActivePortHighlight] = useState(null);
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

  // Touch device detection - for touch-friendly interactions
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const lastInteractionRef = useRef('mouse'); // 'mouse' or 'touch'

  // Detect touch device on mount and track interaction type
  React.useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();

    // Track last interaction type to handle hybrid devices (touch laptops)
    const handleTouchStart = () => { lastInteractionRef.current = 'touch'; };
    const handleMouseMove = () => { lastInteractionRef.current = 'mouse'; };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

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
            switch_mac: matchedClient.switch_mac,
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
      switchMac: haClient.switch_mac,
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
      // =============================================================
      // SIMPLE PORT CONNECTION LOOKUP
      // =============================================================
      // Logic:
      // 1. Get MAC address from each port in port_table (lldp_remote_mac)
      // 2. Look up that MAC in haDevices or haClients to get device info
      // 3. Look up that MAC in equipment to find linked Unicorn equipment
      // That's it. No name matching, no bidirectional maps, no special cases.
      // =============================================================
      const getPortConnections = () => {
        const portMap = new Map();
        const thisDeviceMac = eq.ha_client_mac?.toLowerCase();

        // Helper to find equipment by MAC
        const findEquipmentByMac = (mac) => {
          if (!mac) return null;
          const macLower = mac.toLowerCase();
          const lookupArray = allProjectEquipment.length > 0 ? allProjectEquipment : equipment;
          return lookupArray.find(e => e.ha_client_mac?.toLowerCase() === macLower) || null;
        };

        // Helper to find device info by MAC (from haDevices or haClients)
        const findDeviceByMac = (mac) => {
          if (!mac) return null;
          const macLower = mac.toLowerCase();

          // Check haDevices first (infrastructure: switches, APs, gateways)
          const haDevice = haDevices.find(d =>
            d.mac?.toLowerCase() === macLower || d.mac_address?.toLowerCase() === macLower
          );
          if (haDevice) {
            return {
              name: haDevice.name,
              ip: haDevice.ip,
              isOnline: haDevice.is_online !== false,
              category: haDevice.category,
              numStations: haDevice.num_sta,
              type: 'device',
            };
          }

          // Check haClients (end devices: computers, phones, etc)
          const haClient = haClients.find(c => c.mac?.toLowerCase() === macLower);
          if (haClient) {
            return {
              name: haClient.hostname || mac,
              ip: haClient.ip,
              isOnline: haClient.is_online !== false,
              category: null,
              type: 'client',
            };
          }

          return null;
        };

        // Helper to get wire drop from equipment
        const getWireDrop = (linkedEquipment) => {
          if (!linkedEquipment) return null;
          const wireDropLink = linkedEquipment.wire_drop_equipment_links?.find(
            link => link.link_side === 'room_end' || link.wire_drop
          );
          return wireDropLink?.wire_drop || null;
        };

        // MAIN LOGIC: Use multiple sources to map ports to devices
        // 1. downlink_table from UniFi - direct port-to-MAC mapping
        // 2. Reverse lookup from clients (switch_mac/switch_port)
        // 3. Reverse lookup from devices (uplink_switch_mac)
        console.log(`[getPortConnections] ${eq.instance_name || eq.name}: Looking for devices connected to MAC "${thisDeviceMac}"`);
        console.log(`[getPortConnections] haClients count: ${haClients.length}, haDevices count: ${haDevices.length}`);

        // Get this device's HA data for downlink_table access
        const thisHaDevice = haDevices.find(d =>
          d.mac?.toLowerCase() === thisDeviceMac || d.mac_address?.toLowerCase() === thisDeviceMac
        );

        // 0. PRIMARY: Use downlink_table if available (direct UniFi topology data)
        // Format: [{ mac: "aa:bb:cc:dd:ee:ff", port_idx: 1, type: "wire" }, ...]
        if (thisHaDevice?.downlink_table && Array.isArray(thisHaDevice.downlink_table)) {
          console.log(`[getPortConnections] downlink_table has ${thisHaDevice.downlink_table.length} entries:`, thisHaDevice.downlink_table);
          thisHaDevice.downlink_table.forEach(downlink => {
            const dlMac = (downlink.mac || '')?.toLowerCase();
            const dlPort = downlink.port_idx;

            if (dlMac && dlPort && !portMap.has(dlPort)) {
              const deviceInfo = findDeviceByMac(dlMac);
              const linkedEquipment = findEquipmentByMac(dlMac);
              const wireDrop = getWireDrop(linkedEquipment);

              console.log(`[getPortConnections] downlink_table: Port ${dlPort} → ${dlMac} (${deviceInfo?.name || 'unknown'})`);

              portMap.set(dlPort, {
                equipment: linkedEquipment,
                wireDrop,
                switchPort: dlPort,
                isOnline: deviceInfo?.isOnline !== false,
                ip: deviceInfo?.ip || null,
                hostname: deviceInfo?.name || linkedEquipment?.instance_name || dlMac,
                mac: dlMac,
                category: deviceInfo?.category || null,
                numStations: deviceInfo?.numStations || null,
              });
            }
          });
        } else {
          console.log(`[getPortConnections] No downlink_table available for ${eq.instance_name || eq.name}`);
        }

        // 0b. Also check lldp_table for LLDP neighbor discovery data
        // Format: [{ local_port_idx: 1, chassis_id: "mac", port_id: "port", ... }, ...]
        if (thisHaDevice?.lldp_table && Array.isArray(thisHaDevice.lldp_table)) {
          console.log(`[getPortConnections] lldp_table has ${thisHaDevice.lldp_table.length} entries:`, thisHaDevice.lldp_table);
          thisHaDevice.lldp_table.forEach(lldp => {
            const lldpPort = lldp.local_port_idx || lldp.port_idx;
            const lldpMac = (lldp.chassis_id || lldp.mac || '')?.toLowerCase();

            if (lldpMac && lldpPort && !portMap.has(lldpPort)) {
              const deviceInfo = findDeviceByMac(lldpMac);
              const linkedEquipment = findEquipmentByMac(lldpMac);
              const wireDrop = getWireDrop(linkedEquipment);

              console.log(`[getPortConnections] lldp_table: Port ${lldpPort} → ${lldpMac} (${deviceInfo?.name || lldp.chassis_descr || 'unknown'})`);

              portMap.set(lldpPort, {
                equipment: linkedEquipment,
                wireDrop,
                switchPort: lldpPort,
                isOnline: deviceInfo?.isOnline !== false,
                ip: deviceInfo?.ip || null,
                hostname: deviceInfo?.name || lldp.system_name || linkedEquipment?.instance_name || lldpMac,
                mac: lldpMac,
                category: deviceInfo?.category || null,
                numStations: deviceInfo?.numStations || null,
              });
            }
          });
        }

        // Debug: log all clients with their switch info
        haClients.forEach(c => {
          if (c.switch_mac && c.switch_mac !== 'N/A') {
            console.log(`[getPortConnections] Client "${c.hostname}" → switch_mac="${c.switch_mac}", port=${c.switch_port}`);
          }
        });

        // 1. Check haClients - they have switch_mac and switch_port fields (fallback if not in downlink_table)
        haClients.forEach(client => {
          const clientSwitchMac = (client.switch_mac || client.sw_mac || '')?.toLowerCase();
          const clientPort = client.switch_port || client.sw_port;

          // Skip N/A values
          if (clientSwitchMac === 'n/a' || !clientSwitchMac) return;

          console.log(`[getPortConnections] Checking client "${client.hostname}": clientSwitchMac="${clientSwitchMac}" vs thisDeviceMac="${thisDeviceMac}", match=${clientSwitchMac === thisDeviceMac}`);

          if (clientSwitchMac === thisDeviceMac && clientPort) {
            const clientMac = client.mac?.toLowerCase();
            const linkedEquipment = findEquipmentByMac(clientMac);
            const wireDrop = getWireDrop(linkedEquipment);

            console.log(`[getPortConnections] Port ${clientPort}: Client ${client.hostname || clientMac} connected`);

            portMap.set(clientPort, {
              equipment: linkedEquipment,
              wireDrop,
              switchPort: clientPort,
              isOnline: client.is_connected !== false,
              ip: client.ip || client.ip_address || null,
              hostname: client.hostname || linkedEquipment?.instance_name || clientMac,
              mac: clientMac,
              category: null, // clients don't have category
              numStations: null,
            });
          }
        });

        // 2. Check haDevices (switches, APs, gateways) - they report uplink_switch_mac/port
        haDevices.forEach(device => {
          const deviceUplinkMac = (device.uplink_switch_mac || device.uplink_mac || '')?.toLowerCase();
          const deviceUplinkPort = device.uplink_remote_port || device.uplink_switch_port;

          // Debug: log all devices with uplink info
          console.log(`[getPortConnections] Device "${device.name}" (${device.category}): uplink_mac="${deviceUplinkMac}", uplink_port=${deviceUplinkPort}, match=${deviceUplinkMac === thisDeviceMac}`);

          if (deviceUplinkMac === thisDeviceMac && deviceUplinkPort) {
            const deviceMac = (device.mac || device.mac_address || '')?.toLowerCase();
            const linkedEquipment = findEquipmentByMac(deviceMac);
            const wireDrop = getWireDrop(linkedEquipment);

            console.log(`[getPortConnections] Port ${deviceUplinkPort}: Device ${device.name} (${device.category}) connected`);

            portMap.set(deviceUplinkPort, {
              equipment: linkedEquipment,
              wireDrop,
              switchPort: deviceUplinkPort,
              isOnline: device.is_online !== false,
              ip: device.ip || null,
              hostname: device.name || linkedEquipment?.instance_name || deviceMac,
              mac: deviceMac,
              category: device.category,
              numStations: device.num_sta,
            });
          }
        });

        // 3. Check port_table for is_uplink ports - map them to the gateway
        // This handles switch-to-gateway connections where UniFi doesn't report uplink_switch_mac
        // (thisHaDevice was defined earlier for downlink_table access)

        if (thisHaDevice?.port_table && thisHaDevice.gateway_mac) {
          const gatewayMac = thisHaDevice.gateway_mac.toLowerCase();
          const gatewayDevice = haDevices.find(d =>
            d.mac?.toLowerCase() === gatewayMac || d.mac_address?.toLowerCase() === gatewayMac
          );

          thisHaDevice.port_table.forEach(port => {
            if (port.is_uplink && port.up && !portMap.has(port.port_idx)) {
              const linkedEquipment = findEquipmentByMac(gatewayMac);
              const wireDrop = getWireDrop(linkedEquipment);

              console.log(`[getPortConnections] Port ${port.port_idx}: Uplink to gateway ${gatewayDevice?.name || gatewayMac}`);

              portMap.set(port.port_idx, {
                equipment: linkedEquipment,
                wireDrop,
                switchPort: port.port_idx,
                isOnline: gatewayDevice?.is_online !== false,
                ip: gatewayDevice?.ip || null,
                hostname: gatewayDevice?.name || linkedEquipment?.instance_name || 'Gateway',
                mac: gatewayMac,
                category: 'gateway',
                numStations: null,
                isUplink: true,
              });
            }
          });
        }

        // 4. Check if any devices report THIS device as their gateway - they're connected to us somewhere
        // Find devices where gateway_mac matches this device's MAC
        haDevices.forEach(device => {
          if (device.gateway_mac?.toLowerCase() === thisDeviceMac && device.mac?.toLowerCase() !== thisDeviceMac) {
            // This device uses us as gateway. Check if we already have it mapped
            const deviceMac = device.mac?.toLowerCase();
            const alreadyMapped = Array.from(portMap.values()).some(p => p.mac === deviceMac);

            if (!alreadyMapped) {
              // Find which port this device is on by checking port_table for is_uplink
              // Or if it's an AP, it should be on a PoE port
              const linkedEquipment = findEquipmentByMac(deviceMac);

              console.log(`[getPortConnections] Device ${device.name} (${device.category}) uses us as gateway but port unknown`);

              // We can't determine the exact port without more data, but at least log it
            }
          }
        });

        console.log(`[getPortConnections] Found ${portMap.size} port connections for ${eq.instance_name || eq.name}`);
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

        // Check if this port is highlighted
        const isWanHighlighted = (hoveredConnection?.isWanConnection &&
                                  hoveredConnection?.gatewayId === eq.id &&
                                  hoveredConnection?.wanPortIdx === portNum) ||
                                 (pinnedConnection?.isWanConnection &&
                                  pinnedConnection?.gatewayId === eq.id &&
                                  pinnedConnection?.wanPortIdx === portNum);

        // Simple bidirectional check: if another device's hover targets this port
        const isTargetOfHover = hoveredConnection?.targetEquipmentId === eq.id &&
                                hoveredConnection?.targetPort === portNum;

        const isHighlighted = (activePortHighlight?.switchId === eq.id && activePortHighlight?.portNum === portNum) ||
                             (hoveredConnection?.switchId === eq.id && hoveredConnection?.portNum === portNum) ||
                             (pinnedConnection?.switchId === eq.id && pinnedConnection?.portNum === portNum) ||
                             isWanHighlighted ||
                             isTargetOfHover;

        // =============================================================
        // SIMPLE LINE COORDINATE CALCULATION
        // =============================================================
        // If connected device has equipment, draw line to that equipment.
        // For switches/gateways: find the port on that device that has OUR mac
        // For APs/other devices: use their device-1 port
        // =============================================================
        const calculateLineCoords = () => {
          const container = functionalContainerRef.current;
          const switchPortEl = switchPortRefs.current[portRefKey];
          if (!switchPortEl || !container) return null;

          const switchRect = switchPortEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Start point: this switch port
          const x1 = switchRect.left + switchRect.width / 2 - containerRect.left;
          const y1 = switchRect.bottom - containerRect.top;

          const switchCardEl = switchPortEl.closest('[data-equipment-card]');
          const switchCardBottom = switchCardEl
            ? switchCardEl.getBoundingClientRect().bottom - containerRect.top + 8
            : y1 + 40;

          // Find target element
          let targetEl = null;
          const targetEquipment = connectedDevice?.equipment;

          if (targetEquipment) {
            const targetMac = targetEquipment.ha_client_mac?.toLowerCase();
            const targetHaDevice = targetMac ? haDevices.find(d =>
              d.mac?.toLowerCase() === targetMac || d.mac_address?.toLowerCase() === targetMac
            ) : null;

            // Is target a switch/gateway with ports?
            const isTargetPortHost = targetHaDevice?.category === 'switch' ||
                                     targetHaDevice?.category === 'gateway';

            if (isTargetPortHost) {
              // Find which port on target switch THIS equipment is connected to
              // Method 1: Check if THIS is a UniFi device that reports its uplink to target
              const ourMac = eq.ha_client_mac?.toLowerCase();
              const ourHaDevice = ourMac ? haDevices.find(d =>
                d.mac?.toLowerCase() === ourMac || d.mac_address?.toLowerCase() === ourMac
              ) : null;

              if (ourHaDevice) {
                // We are a UniFi device - check if we report connecting to target
                const ourUplinkMac = (ourHaDevice.uplink_switch_mac || ourHaDevice.uplink_mac || '')?.toLowerCase();
                if (ourUplinkMac === targetMac && ourHaDevice.uplink_remote_port) {
                  const targetPortRefKey = `${targetEquipment.id}-switch-${ourHaDevice.uplink_remote_port}`;
                  targetEl = switchPortRefs.current[targetPortRefKey];
                }
              }

              // Method 2: Check if we're a client with switch_port info
              if (!targetEl && ourMac) {
                const ourClient = haClients.find(c => c.mac?.toLowerCase() === ourMac);
                const ourSwitchMac = (ourClient?.switch_mac || ourClient?.sw_mac || '')?.toLowerCase();
                const ourSwitchPort = ourClient?.switch_port || ourClient?.sw_port;

                if (ourSwitchMac === targetMac && ourSwitchPort) {
                  const targetPortRefKey = `${targetEquipment.id}-switch-${ourSwitchPort}`;
                  targetEl = switchPortRefs.current[targetPortRefKey];
                }
              }

              // Method 3: REVERSE LOOKUP - Check if TARGET device reports US as their uplink
              // This handles Gateway->Switch connections where switch has uplink_mac=gateway
              if (!targetEl && targetHaDevice && ourMac) {
                const targetUplinkMac = (targetHaDevice.uplink_switch_mac || targetHaDevice.uplink_mac || '')?.toLowerCase();
                if (targetUplinkMac === ourMac && targetHaDevice.uplink_remote_port) {
                  // Target reports connecting to us - find their uplink port
                  const targetPortRefKey = `${targetEquipment.id}-switch-${targetHaDevice.uplink_remote_port}`;
                  targetEl = switchPortRefs.current[targetPortRefKey];
                  console.log(`[calculateLineCoords] Method 3: Found target port ${targetHaDevice.uplink_remote_port} via reverse uplink lookup`);
                }
              }
            }

            // For APs and other non-port-host devices, use device-1 port
            if (!targetEl) {
              const deviceRefKey = `${targetEquipment.id}-device-1`;
              targetEl = devicePortRefs.current[deviceRefKey];
            }
          }

          if (!targetEl) return null;

          const deviceRect = targetEl.getBoundingClientRect();
          const x2 = deviceRect.left + deviceRect.width / 2 - containerRect.left;
          const y2 = deviceRect.bottom - containerRect.top;

          const deviceCardEl = targetEl.closest('[data-equipment-card]');
          const deviceCardBottom = deviceCardEl
            ? deviceCardEl.getBoundingClientRect().bottom - containerRect.top + 8
            : y2 + 40;

          return {
            x1, y1, x2, y2,
            sourceCardBottom: switchCardBottom,
            destCardBottom: deviceCardBottom,
            color: portColor,
            connectionType: 'network',
          };
        };

        // Handle click/tap to show connection info
        // On touch: First tap shows popup (like hover), second tap opens modal
        // On mouse: Click opens modal directly (hover already showed preview)
        const handlePortClick = (e) => {
          e.stopPropagation();

          // Determine if this is a touch interaction
          const isTouch = lastInteractionRef.current === 'touch' || e.type === 'touchend';

          // Clear hover timeout
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }

          // If port has a connection, check if it's an external device
          if (isConnected && connectedDevice) {
            // Check if this is an external device that should show popup/modal
            const isExternalDevice =
              connectedDevice.wireDrop ||
              connectedDevice.category === 'access_point' ||
              connectedDevice.category === 'wap' ||
              (!connectedDevice.equipment && connectedDevice.mac) ||
              (connectedDevice.equipment && !equipment.some(e => e.id === connectedDevice.equipment?.id));

            // Don't show modal for port-host devices (gateways, switches) that ARE in the rack
            const isPortHostInRack = (connectedDevice.category === 'gateway' || connectedDevice.category === 'switch') &&
              equipment.some(e => e.ha_client_mac?.toLowerCase() === connectedDevice.mac?.toLowerCase());

            if (isExternalDevice && !isPortHostInRack) {
              // TOUCH BEHAVIOR: First tap shows popup, tap popup to navigate
              // If popup is already showing for this port, open the modal
              const popupAlreadyShowing = hoverPopup?.switchId === eq.id && hoverPopup?.portNum === portNum;

              if (isTouch && !popupAlreadyShowing) {
                // First tap on touch - show popup immediately (no delay)
                setActivePortHighlight({ switchId: eq.id, portNum });

                const portEl = switchPortRefs.current[portRefKey];
                if (portEl) {
                  const rect = portEl.getBoundingClientRect();
                  const container = functionalContainerRef.current;
                  const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 };

                  setHoverPopup({
                    x: rect.left - containerRect.left + rect.width / 2,
                    y: rect.bottom - containerRect.top + 8,
                    wireDrop: connectedDevice.wireDrop || null,
                    equipment: connectedDevice.equipment || null,
                    hostname: connectedDevice.hostname || connectedDevice.name,
                    ip: connectedDevice.ip,
                    mac: connectedDevice.mac,
                    portNum,
                    switchId: eq.id,
                    connectedDevice,
                  });
                }

                // Also show connection line on touch
                setHoveredConnection({
                  switchId: eq.id,
                  portNum,
                  deviceId: connectedDevice.equipment?.id || null,
                  targetEquipmentId: connectedDevice.equipment?.id || null,
                  mac: connectedDevice.mac,
                  category: connectedDevice.category,
                  connectedDevice,
                });

                setTimeout(() => {
                  const coords = calculateLineCoords();
                  if (coords) setLineCoords(coords);
                }, 10);

                return; // Don't open modal on first tap
              }

              // MOUSE BEHAVIOR or second tap: Open full modal
              setHoverPopup(null);
              setWireDropModal({
                wireDrop: connectedDevice.wireDrop || null,
                equipment: connectedDevice.equipment || null,
                portNum,
                hostname: connectedDevice.hostname || connectedDevice.name,
                ip: connectedDevice.ip,
                mac: connectedDevice.mac,
                category: connectedDevice.category,
                isOnline: connectedDevice.isOnline,
              });
              return;
            }

            // For in-rack connections, pin/unpin the connection line
            const connectionInfo = {
              switchId: eq.id,
              portNum,
              deviceId: connectedDevice.equipment?.id || null,
              connectedDevice,
              portColor,
            };

            // If already pinned to this port, unpin
            if (pinnedConnection?.switchId === eq.id && pinnedConnection?.portNum === portNum) {
              setPinnedConnection(null);
              setPinnedLineCoords(null);
              return;
            }

            // Pin the connection (works same for touch and mouse)
            setPinnedConnection(connectionInfo);
            setActivePortHighlight({ switchId: eq.id, portNum });

            // Calculate line coords after a short delay to ensure refs are set
            setTimeout(() => {
              const coords = calculateLineCoords();
              setPinnedLineCoords(coords);
            }, 10);
          }
        };

        // Handle hover to show connection line and popup for external devices
        const handlePortHover = (e) => {
          // Set active port highlight
          setActivePortHighlight({ switchId: eq.id, portNum });

          // If we have a connected device, set up for line drawing
          if (isConnected && connectedDevice) {
            // If connected device has equipment, we can draw a line to it
            const targetEquipment = connectedDevice.equipment;

            // Find which port on the target has OUR MAC (for bidirectional highlighting)
            let targetPort = null;
            if (targetEquipment) {
              const targetMac = targetEquipment.ha_client_mac?.toLowerCase();
              const targetHaDevice = targetMac ? haDevices.find(d =>
                d.mac?.toLowerCase() === targetMac || d.mac_address?.toLowerCase() === targetMac
              ) : null;

              // Find which port on target we're connected to
              // Check if THIS equipment (eq) reports being on target's port via uplink or client data
              const ourMac = eq.ha_client_mac?.toLowerCase();

              // Method 1: Check if we're a UniFi device reporting uplink to target
              const ourHaDevice = ourMac ? haDevices.find(d =>
                d.mac?.toLowerCase() === ourMac || d.mac_address?.toLowerCase() === ourMac
              ) : null;

              if (ourHaDevice) {
                const ourUplinkMac = (ourHaDevice.uplink_switch_mac || ourHaDevice.uplink_mac || '')?.toLowerCase();
                if (ourUplinkMac === targetMac && ourHaDevice.uplink_remote_port) {
                  targetPort = ourHaDevice.uplink_remote_port;
                }
              }

              // Method 2: Check if we're a client reporting switch_port
              if (!targetPort && ourMac) {
                const ourClient = haClients.find(c => c.mac?.toLowerCase() === ourMac);
                const ourSwitchMac = (ourClient?.switch_mac || ourClient?.sw_mac || '')?.toLowerCase();
                if (ourSwitchMac === targetMac && (ourClient?.switch_port || ourClient?.sw_port)) {
                  targetPort = ourClient.switch_port || ourClient.sw_port;
                }
              }

              // Method 3: REVERSE LOOKUP - Check if TARGET device reports US as their uplink
              // This is for Gateway->Switch connections where the switch reports uplink_mac=gateway
              if (!targetPort && targetHaDevice) {
                const targetUplinkMac = (targetHaDevice.uplink_switch_mac || targetHaDevice.uplink_mac || '')?.toLowerCase();
                if (targetUplinkMac === ourMac && targetHaDevice.uplink_remote_port) {
                  // The target device is connected to US on their uplink_remote_port
                  // We need to highlight THEIR port (which is the port the switch uses to connect to us)
                  targetPort = targetHaDevice.uplink_remote_port;
                  console.log(`[handlePortHover] Method 3: Target ${targetHaDevice.name} reports uplink to us on port ${targetPort}`);
                }
              }
            }

            setHoveredConnection({
              switchId: eq.id,
              portNum,
              deviceId: targetEquipment?.id || null,
              targetEquipmentId: targetEquipment?.id || null,
              targetPort,
              mac: connectedDevice.mac,
              category: connectedDevice.category,
              connectedDevice, // Pass the full connected device for line drawing
            });

            // Only draw line if we have equipment to draw to
            if (targetEquipment) {
              setTimeout(() => {
                const coords = calculateLineCoords();
                if (coords) setLineCoords(coords);
              }, 10);
            }
            return;
          }

          // Check if this is a WAN port on a gateway (should show connection to WAN modem)
          const isGatewayWanPort = isUplink && gatewayWanInfo?.gateway?.equipment?.id === eq.id &&
            gatewayWanInfo.wanPorts?.some(wp => wp.portIdx === portNum && wp.up);

          if (isGatewayWanPort) {
            // This is a WAN port on the gateway - show connection to WAN modem
            const wanPort = gatewayWanInfo.wanPorts.find(wp => wp.portIdx === portNum);
            if (wanPort) {
              setHoveredConnection({
                wanPortIdx: portNum,
                gatewayId: eq.id,
                isWanConnection: true,
              });

              // Calculate line coordinates to the WAN modem
              setTimeout(() => {
                const container = functionalContainerRef.current;
                const switchPortEl = switchPortRefs.current[portRefKey];
                const modemPortEl = switchPortRefs.current[`wan-port-${portNum}`];

                if (container && switchPortEl && modemPortEl) {
                  const containerRect = container.getBoundingClientRect();
                  const gatewayPortRect = switchPortEl.getBoundingClientRect();
                  const modemPortRect = modemPortEl.getBoundingClientRect();

                  // Find card bottoms
                  const gatewayCardEl = switchPortEl.closest('[data-equipment-card]');
                  const gatewayCardBottom = gatewayCardEl
                    ? gatewayCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : gatewayPortRect.bottom - containerRect.top + 40;

                  const modemCardEl = modemPortEl.closest('.rounded-lg');
                  const modemCardBottom = modemCardEl
                    ? modemCardEl.getBoundingClientRect().bottom - containerRect.top + 8
                    : modemPortRect.bottom - containerRect.top + 40;

                  setLineCoords({
                    // From modem port
                    x1: modemPortRect.left + modemPortRect.width / 2 - containerRect.left,
                    y1: modemPortRect.bottom - containerRect.top,
                    // To gateway port
                    x2: gatewayPortRect.left + gatewayPortRect.width / 2 - containerRect.left,
                    y2: gatewayPortRect.bottom - containerRect.top,
                    sourceCardBottom: modemCardBottom,
                    destCardBottom: gatewayCardBottom,
                    color: '#22C55E', // green for all connections
                    connectionType: 'network',
                  });
                }
              }, 10);
              return; // Exit early, don't process as regular connection
            }
          }

          if (isConnected && connectedDevice) {
            // Check if device is linked to rack equipment (either directly or via MAC match)
            const hasEquipment = connectedDevice.equipment ||
              (connectedDevice.mac && equipment.some(e =>
                e.ha_client_mac?.toLowerCase() === connectedDevice.mac?.toLowerCase()
              ));

            // Also draw lines for gateway/switch connections (port hosts)
            const isPortHostConnection = connectedDevice.category === 'gateway' ||
              connectedDevice.category === 'switch';

            // Check if this is an external device that should show hover popup
            const isExternalDevice =
              connectedDevice.wireDrop ||
              connectedDevice.category === 'access_point' ||
              connectedDevice.category === 'wap' ||
              (!connectedDevice.equipment && connectedDevice.mac) ||
              (connectedDevice.equipment && !equipment.some(e => e.id === connectedDevice.equipment?.id));

            // Don't show popup for port-host devices (gateways, switches) that ARE in the rack
            const isPortHostInRack = (connectedDevice.category === 'gateway' || connectedDevice.category === 'switch') &&
              equipment.some(e => e.ha_client_mac?.toLowerCase() === connectedDevice.mac?.toLowerCase());

            // Show hover popup for external devices (after small delay)
            if (isExternalDevice && !isPortHostInRack) {
              // Clear any existing timeout
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }

              // Set popup after short delay (150ms)
              hoverTimeoutRef.current = setTimeout(() => {
                const portEl = switchPortRefs.current[portRefKey];
                if (portEl) {
                  const rect = portEl.getBoundingClientRect();
                  const container = functionalContainerRef.current;
                  const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 };

                  setHoverPopup({
                    // Position relative to container
                    x: rect.left - containerRect.left + rect.width / 2,
                    y: rect.bottom - containerRect.top + 8,
                    wireDrop: connectedDevice.wireDrop || null,
                    equipment: connectedDevice.equipment || null,
                    hostname: connectedDevice.hostname || connectedDevice.name,
                    ip: connectedDevice.ip,
                    mac: connectedDevice.mac,
                    portNum,
                    switchId: eq.id,
                    connectedDevice,
                  });
                }
              }, 150);
            }

            if (hasEquipment || isPortHostConnection) {
              setHoveredConnection({
                switchId: eq.id,
                portNum,
                deviceId: connectedDevice.equipment?.id || null,
                mac: connectedDevice.mac,
                category: connectedDevice.category
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
          // Clear active port highlight
          setActivePortHighlight(null);

          // Clear hover timeout
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }

          // Clear hover popup (with small delay to allow moving to popup)
          setTimeout(() => {
            // Only clear if we're not over the popup itself
            setHoverPopup(prev => {
              if (prev?.switchId === eq.id && prev?.portNum === portNum) {
                return null;
              }
              return prev;
            });
          }, 100);

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

        // Check if highlighted (when this device is target of a hovered/pinned connection)
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

          // If we have the upstream switch MAC, find equipment by MAC
          if (upstreamSwitchMac) {
            const matchByMac = equipment.find(sw =>
              sw.ha_client_mac?.toLowerCase() === upstreamSwitchMac
            );
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

            // Get all possible names for this equipment, INCLUDING HA hostname
            const swInstanceName = sw.instance_name?.toLowerCase() || '';
            const swName = sw.name?.toLowerCase() || '';
            const swGlobalName = sw.global_part?.name?.toLowerCase() || '';
            const swModel = sw.model?.toLowerCase() || '';
            const targetName = switchName.toLowerCase();

            // IMPORTANT: Also check the HA hostname (what the UI displays for linked equipment)
            // This is the UniFi friendly name that other devices report as their switch_name
            const swMac = sw.ha_client_mac?.toLowerCase();
            const swHaClient = swMac ? haClients.find(c => c.mac?.toLowerCase() === swMac) : null;
            const swHaDevice = swMac ? haDevices.find(d => d.mac?.toLowerCase() === swMac) : null;
            const swHaHostname = (swHaClient?.hostname || swHaDevice?.name || '').toLowerCase();

            // Check various name combinations including HA hostname
            const nameMatches =
              swInstanceName.includes(targetName) || targetName.includes(swInstanceName) ||
              swName.includes(targetName) || targetName.includes(swName) ||
              swGlobalName.includes(targetName) || targetName.includes(swGlobalName) ||
              (swModel && targetName.includes(swModel)) ||
              (swHaHostname && (swHaHostname.includes(targetName) || targetName.includes(swHaHostname)));

            if (!isPortHost) return false;
            return nameMatches;
          });
          return nameMatch;
        };

        // Handle click/tap to pin/toggle connection line
        // Touch-friendly: tap shows connection and pins it
        const handleDevicePortClick = (e) => {
          e.stopPropagation();
          const isTouch = lastInteractionRef.current === 'touch';

          // If already pinned to this device, unpin
          if (pinnedConnection?.deviceId === eq.id) {
            setPinnedConnection(null);
            setPinnedLineCoords(null);
            // Also clear hover state for touch
            if (isTouch) {
              setHoveredConnection(null);
              setLineCoords(null);
            }
            return;
          }

          // If connected, find switch and pin the connection
          if (isConnectedViaHA) {
            const switchEq = findSwitchEquipment();
            if (switchEq) {
              // Set both pinned and hover state (hover for touch devices)
              setPinnedConnection({ switchId: switchEq.id, portNum: switchPort, deviceId: eq.id });
              if (isTouch) {
                setHoveredConnection({ switchId: switchEq.id, portNum: switchPort, deviceId: eq.id });
              }

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

                  const coords = {
                    x1: switchRect.left + switchRect.width / 2 - containerRect.left,
                    y1: switchRect.bottom - containerRect.top, // Bottom of switch port
                    x2: portRect.left + portRect.width / 2 - containerRect.left,
                    y2: portRect.bottom - containerRect.top, // Bottom of device port
                    sourceCardBottom: switchCardBottom,
                    destCardBottom: deviceCardBottom,
                    color: bgColorValue,
                    connectionType: 'network',
                  };
                  setPinnedLineCoords(coords);
                  if (isTouch) setLineCoords(coords);
                }
              }
            }
          }
        };

        // Handle hover to find and highlight the switch port
        const handleDevicePortHover = (e) => {
          // Simple: if this device is connected to a switch, find that switch and highlight the port
          if (isConnectedViaHA) {
            const switchEq = findSwitchEquipment();
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
            onMouseEnter={handleDevicePortHover}
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

    // Handle click on container background to clear pinned connection and popups
    // This is essential for touch devices where tapping elsewhere should dismiss
    const handleContainerClick = (e) => {
      // Only clear if clicking the container itself, not a child element
      if (e.target === e.currentTarget || e.target.closest('[data-clear-pinned]')) {
        setPinnedConnection(null);
        setPinnedLineCoords(null);
        setWireDropModal(null);
        // Also clear hover popup and connection (important for touch)
        setHoverPopup(null);
        setHoveredConnection(null);
        setLineCoords(null);
        setActivePortHighlight(null);
      }
    };

    return (
      <div
        className="p-4 relative"
        ref={functionalContainerRef}
        style={{ isolation: 'isolate' }}
        onClick={handleContainerClick}
      >
        {/* External Device / Wire Drop Modal */}
        {wireDropModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]" onClick={() => setWireDropModal(null)}>
            <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-4 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-zinc-100">
                  {wireDropModal.category === 'access_point' ? '📡 Access Point' :
                   wireDropModal.category === 'switch' ? '🔀 Switch' :
                   wireDropModal.category === 'gateway' ? '🌐 Gateway' :
                   'External Device'}
                </h3>
                <button onClick={() => setWireDropModal(null)} className="text-zinc-400 hover:text-zinc-200">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                {/* Device Name */}
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Device</span>
                  <span className="text-zinc-100 font-medium">{wireDropModal.hostname || 'Unknown Device'}</span>
                </div>

                {/* Wire Drop Link */}
                {wireDropModal.wireDrop && (
                  <div
                    className="flex items-center justify-between py-2 border-b border-zinc-700 cursor-pointer hover:bg-zinc-700/50 -mx-2 px-2 rounded transition-colors"
                    onClick={() => {
                      if (wireDropModal.wireDrop?.id) {
                        navigate(`/wire-drops/${wireDropModal.wireDrop.id}`);
                        setWireDropModal(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-violet-400" />
                      <span className="text-zinc-400">Wire Drop</span>
                    </div>
                    <div className="flex items-center gap-2 text-violet-400 hover:text-violet-300">
                      <span>{wireDropModal.wireDrop?.drop_name || wireDropModal.wireDrop?.uid || 'Unknown'}</span>
                      <ExternalLink size={12} />
                    </div>
                  </div>
                )}

                {/* Room */}
                {(wireDropModal.wireDrop?.room_name || wireDropModal.equipment?.project_rooms?.name) && (
                  <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                    <span className="text-zinc-400">Room</span>
                    <span className="text-zinc-100">
                      {wireDropModal.wireDrop?.room_name || wireDropModal.equipment?.project_rooms?.name}
                    </span>
                  </div>
                )}

                {/* Equipment Link */}
                {wireDropModal.equipment && (
                  <div
                    className="flex items-center justify-between py-2 border-b border-zinc-700 cursor-pointer hover:bg-zinc-700/50 -mx-2 px-2 rounded transition-colors"
                    onClick={() => {
                      if (wireDropModal.equipment?.id) {
                        navigate(`/parts/${wireDropModal.equipment.id}`);
                        setWireDropModal(null);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-cyan-400" />
                      <span className="text-zinc-400">Equipment</span>
                    </div>
                    <div className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300">
                      <span>{getEquipmentDisplayName(wireDropModal.equipment)}</span>
                      <ExternalLink size={12} />
                    </div>
                  </div>
                )}

                {/* IP Address - Clickable to open device */}
                {wireDropModal.ip && (
                  <div
                    className="flex items-center justify-between py-2 border-b border-zinc-700 cursor-pointer hover:bg-zinc-700/50 -mx-2 px-2 rounded transition-colors"
                    onClick={() => {
                      window.open(`http://${wireDropModal.ip}`, '_blank');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-emerald-400" />
                      <span className="text-zinc-400">IP Address</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-mono">
                      <span>{wireDropModal.ip}</span>
                      <ExternalLink size={12} />
                    </div>
                  </div>
                )}

                {/* MAC Address */}
                {wireDropModal.mac && (
                  <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                    <span className="text-zinc-400">MAC</span>
                    <span className="text-zinc-100 font-mono text-sm">{wireDropModal.mac}</span>
                  </div>
                )}

                {/* Switch Port */}
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Switch Port</span>
                  <span className="text-zinc-100">Port {wireDropModal.portNum}</span>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-zinc-400">Status</span>
                  <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                    wireDropModal.isOnline !== false
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {wireDropModal.isOnline !== false ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Help text when no equipment or wire drop is linked */}
                {!wireDropModal.equipment && !wireDropModal.wireDrop && (
                  <div className="mt-3 p-3 bg-zinc-700/50 rounded-lg border border-zinc-600">
                    <p className="text-zinc-400 text-sm">
                      <span className="text-amber-400 font-medium">Not linked:</span> To show wire drop and equipment info, add this device to your project equipment and link it to a wire drop.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hover Popup - Mini modal that appears on port mouseover */}
        {hoverPopup && !wireDropModal && (
          <div
            className="absolute z-[9998] pointer-events-auto"
            style={{
              left: `${hoverPopup.x}px`,
              top: `${hoverPopup.y}px`,
              transform: 'translateX(-50%)',
            }}
            onMouseEnter={() => {
              // Keep popup open when hovering over it
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              // Close popup when leaving
              setHoverPopup(null);
              setActivePortHighlight(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Open full modal on click
              if (hoverPopup.connectedDevice) {
                setWireDropModal({
                  wireDrop: hoverPopup.wireDrop,
                  equipment: hoverPopup.equipment,
                  portNum: hoverPopup.portNum,
                  hostname: hoverPopup.hostname,
                  ip: hoverPopup.ip,
                  mac: hoverPopup.mac,
                  category: hoverPopup.connectedDevice?.category,
                  isOnline: hoverPopup.connectedDevice?.isOnline,
                });
                setHoverPopup(null);
              }
            }}
          >
            {/* Connection line from port to popup */}
            <svg
              className="absolute pointer-events-none"
              style={{
                width: '2px',
                height: '8px',
                left: '50%',
                top: '-8px',
                transform: 'translateX(-50%)',
              }}
            >
              <line x1="1" y1="0" x2="1" y2="8" stroke="#22C55E" strokeWidth="2" />
            </svg>

            {/* Mini popup card */}
            <div className="bg-zinc-800 border border-zinc-500 rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px]">
              {/* Header with device name */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-600">
                <span className={`w-2 h-2 rounded-full ${hoverPopup.connectedDevice?.isOnline !== false ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-zinc-100 truncate">
                  {hoverPopup.hostname || 'Unknown Device'}
                </span>
              </div>

              {/* Compact info rows */}
              <div className="space-y-1.5 text-xs">
                {/* Wire Drop */}
                {hoverPopup.wireDrop && (
                  <div
                    className="flex items-center gap-2 text-violet-400 hover:text-violet-300 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hoverPopup.wireDrop?.id) {
                        navigate(`/wire-drops/${hoverPopup.wireDrop.id}`);
                        setHoverPopup(null);
                      }
                    }}
                  >
                    <MapPin size={12} />
                    <span className="truncate">{hoverPopup.wireDrop?.drop_name || hoverPopup.wireDrop?.uid || 'Wire Drop'}</span>
                    <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
                  </div>
                )}

                {/* Equipment */}
                {hoverPopup.equipment && (
                  <div
                    className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hoverPopup.equipment?.id) {
                        navigate(`/parts/${hoverPopup.equipment.id}`);
                        setHoverPopup(null);
                      }
                    }}
                  >
                    <Server size={12} />
                    <span className="truncate">{getEquipmentDisplayName(hoverPopup.equipment)}</span>
                    <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
                  </div>
                )}

                {/* IP Address */}
                {hoverPopup.ip && (
                  <div
                    className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 cursor-pointer font-mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`http://${hoverPopup.ip}`, '_blank');
                    }}
                  >
                    <Globe size={12} />
                    <span>{hoverPopup.ip}</span>
                    <ExternalLink size={10} className="flex-shrink-0 opacity-60" />
                  </div>
                )}
              </div>

              {/* Tap/Click for more hint */}
              <div className="mt-2 pt-2 border-t border-zinc-600 text-[10px] text-zinc-500 text-center">
                {isTouchDevice ? 'Tap for details' : 'Click for details'}
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
                      color: '#22C55E', // green for all connections
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

                // Handle click/tap to pin/toggle WAN connection line
                // On touch: Tap shows connection, tap again to unpin
                const handleWanClick = (e) => {
                  e.stopPropagation();
                  if (!isActive || !gatewayWanInfo.gateway.equipment) return;

                  const isTouch = lastInteractionRef.current === 'touch';

                  // If already selected, unpin
                  if (isSelected) {
                    setPinnedConnection(null);
                    setPinnedLineCoords(null);
                    // Also clear hover state for touch
                    if (isTouch) {
                      setHoveredConnection(null);
                      setLineCoords(null);
                    }
                    return;
                  }

                  // Pin this WAN connection
                  setPinnedConnection({
                    wanPortIdx: wanPort.portIdx,
                    gatewayId: gatewayWanInfo.gateway.equipment?.id,
                    isWanConnection: true,
                  });

                  // Also show hover state on touch (since there's no hover event)
                  if (isTouch) {
                    setHoveredConnection({
                      wanPortIdx: wanPort.portIdx,
                      gatewayId: gatewayWanInfo.gateway.equipment?.id,
                      isWanConnection: true,
                    });
                  }

                  const coords = calculateWanLineCoords(e.currentTarget);
                  if (coords) {
                    setPinnedLineCoords(coords);
                    if (isTouch) setLineCoords(coords);
                  }
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
                      isActive
                        ? 'bg-zinc-900/50 border-zinc-600 hover:border-zinc-400'
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
                          className="text-[9px] font-mono"
                          style={{ color: '#71717a' }}
                        >
                          {wanPort.portIdx}
                        </span>
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center"
                          style={{
                            backgroundColor: isActive ? '#3B82F6' : '#3f3f46',
                            border: `2px solid ${isActive ? '#3B82F6' : '#52525b'}`,
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
                style={{ backgroundColor: '#3f3f46', border: '2px solid #3f3f46' }}
              >
                <Cable size={12} style={{ color: '#F59E0B' }} />
              </div>
              <span className="text-xs text-zinc-400">Offline</span>
            </div>

            {/* Port Types */}
            <div className="flex items-center gap-2 ml-4">
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
                style={{ backgroundColor: '#3B82F6', border: '2px solid #3B82F6' }}
              >
                <Cable size={12} style={{ color: '#ffffff' }} />
              </div>
              <span className="text-xs text-zinc-400">Uplink</span>
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
