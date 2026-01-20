/**
 * RackBackView.jsx
 * Back view of rack equipment showing device network status and connectivity
 * Supports both physical (rack grid) and functional (list) layout modes
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { WifiOff, Globe, ExternalLink, Zap, Plug, Link2, ChevronDown, GripVertical, Settings, Server, Layers, X, Plus, Check } from 'lucide-react';

// Constants - same as RackFrontView for consistency
const U_HEIGHT = 50;

/**
 * Get equipment U height from global_part or default to 1
 */
const getEquipmentUHeight = (equipment) => {
  return equipment?.global_part?.u_height || equipment?.u_height || 1;
};

/**
 * Get display name for equipment - show model + instance number (e.g., "U7-Pro 1")
 */
const getEquipmentDisplayName = (item) => {
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

        <Settings size={14} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0" />
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
}) => {
  const [linkingEquipmentId, setLinkingEquipmentId] = useState(null);
  const [showRackSelector, setShowRackSelector] = useState(false);
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedEquipment: null,
    draggedShelf: null,
    dropPreview: null,
  });

  const totalU = rack?.total_u || 42;

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

    // Helper to render power info for an equipment item
    const renderPowerInfo = (eq) => {
      const watts = eq.global_part?.power_watts;
      const outletsRequired = eq.global_part?.power_outlets || 1;
      const isPowerDevice = eq.global_part?.is_power_device;
      const surgeOutlets = eq.global_part?.power_outlets_provided || 0;
      const upsOutlets = eq.global_part?.ups_outlets_provided || 0;
      const totalOutlets = surgeOutlets + upsOutlets;

      if (isPowerDevice && totalOutlets > 0) {
        // Power device - show outlets it provides, then power input on right
        return (
          <div className="flex items-center gap-3">
            {/* UPS Battery Backup Outlets (green) */}
            {upsOutlets > 0 && (
              <div className="flex items-center gap-1" title={`${upsOutlets} UPS battery backup outlets`}>
                <Zap size={12} className="text-green-400" />
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(upsOutlets, 6) }).map((_, i) => (
                    <div
                      key={`ups-${i}`}
                      className="w-6 h-6 rounded bg-green-900/50 border border-green-600 flex items-center justify-center"
                    >
                      <Plug size={14} className="text-green-400" />
                    </div>
                  ))}
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
                  {Array.from({ length: Math.min(surgeOutlets, 6) }).map((_, i) => (
                    <div
                      key={`surge-${i}`}
                      className="w-6 h-6 rounded bg-amber-900/50 border border-amber-600 flex items-center justify-center"
                    >
                      <Plug size={14} className="text-amber-400" />
                    </div>
                  ))}
                  {surgeOutlets > 6 && (
                    <span className="text-sm text-amber-400 ml-1">+{surgeOutlets - 6}</span>
                  )}
                </div>
              </div>
            )}
            {/* Power input this device requires (gray, on right like other devices) */}
            <div className="flex items-center gap-1 ml-2" title={`Requires ${outletsRequired} outlet(s)`}>
              <div className="w-6 h-6 rounded bg-zinc-700 border border-zinc-600 flex items-center justify-center">
                <Plug size={14} className="text-zinc-400" />
              </div>
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
              {Array.from({ length: Math.min(outletsRequired, 4) }).map((_, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded bg-zinc-700 border border-zinc-600 flex items-center justify-center"
                  title={`Outlet ${i + 1}`}
                >
                  <Plug size={14} className="text-zinc-400" />
                </div>
              ))}
              {outletsRequired > 4 && (
                <span className="text-sm text-zinc-400 ml-1">+{outletsRequired - 4}</span>
              )}
            </div>
          </div>
        );
      }
    };

    return (
      <div className="p-4">
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
                          return (
                            <div
                              key={`shelf-eq-${eq.id}`}
                              onClick={() => onEquipmentEdit?.(eq)}
                              className="flex flex-col gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                            >
                              {/* Top row: Name and settings */}
                              <div className="flex items-center gap-4">
                                {isPowerDevice && (
                                  <Zap size={16} className="text-amber-400 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-zinc-100 truncate">
                                    {getEquipmentDisplayName(eq)}
                                  </span>
                                </div>
                                <Settings size={14} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0" />
                              </div>
                              {/* Bottom row: Power info */}
                              <div className="flex items-center justify-end">
                                {renderPowerInfo(eq)}
                              </div>
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
                return (
                  <div
                    key={`eq-${eq.id}`}
                    onClick={() => onEquipmentEdit?.(eq)}
                    className="flex flex-col gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                  >
                    {/* Top row: U position, name, settings */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 text-center">
                        <span className="text-xs font-mono text-zinc-500">U{eq.rack_position_u}</span>
                      </div>
                      {isPowerDevice && (
                        <Zap size={16} className="text-amber-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                          {getEquipmentDisplayName(eq)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 ml-2">
                          {uHeight}U
                        </span>
                      </div>
                      <Settings size={14} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0" />
                    </div>
                    {/* Bottom row: Power info */}
                    <div className="flex items-center justify-end">
                      {renderPowerInfo(eq)}
                    </div>
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
                / <span className="text-green-400" title="UPS battery backup">{powerTotals.upsOutletsProvided}</span>
                {powerTotals.surgeOutletsProvided > 0 && (
                  <span className="text-amber-400" title="Surge protected"> + {powerTotals.surgeOutletsProvided}</span>
                )}
              </span>
            )}
          </div>
          {powerTotals.powerDeviceCount > 0 && (
            <div className="flex items-center gap-1 text-amber-400" title="Power distribution devices">
              <span>⚡ {powerTotals.powerDeviceCount}</span>
            </div>
          )}
        </div>
      </div>

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
                    onClick={() => onEquipmentEdit?.(eq)}
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
};

export default memo(RackBackView);
