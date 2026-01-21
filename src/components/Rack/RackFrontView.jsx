/**
 * RackFrontView.jsx
 * Visual drag-and-drop rack layout view showing the front of the rack
 * Full-width layout matching back view style with improved readability
 */

import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, Server, GripVertical, X, Settings, Layers, Home, ChevronDown, Link2, Trash2, ExternalLink, Globe, Zap, Plug, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EquipmentEditModal from './EquipmentEditModal';

// Constants
const U_HEIGHT = 50; // pixels per rack unit (slightly smaller for cleaner look)

/**
 * Get equipment U height from global_part or default to 1
 */
const getEquipmentUHeight = (equipment) => {
  return equipment?.global_part?.u_height || equipment?.u_height || 1;
};

/**
 * Extract part name for rack view display
 * Full name format is "Room Name - Part Name N" for organization,
 * but in rack view we strip the room prefix to show just the part name
 */
const getEquipmentDisplayName = (equipment) => {
  // Get instance number from the full name (format: "Room - Part Name N")
  // Extract the trailing number if present
  const fullName = equipment?.instance_name || equipment?.name || '';
  const instanceMatch = fullName.match(/\s(\d+)$/);
  const instanceNum = instanceMatch ? instanceMatch[1] : '';

  // Priority 1: Model + instance number (shows "U7-Pro 1", "U7-Pro 2", etc)
  if (equipment?.model) {
    return instanceNum ? `${equipment.model} ${instanceNum}` : equipment.model;
  }

  // Priority 2: Global part name if linked
  if (equipment?.global_part?.name) return equipment.global_part.name;

  // Priority 3: Extract part name from name (format: "Room - Part Name N")
  if (fullName && fullName.includes(' - ')) {
    const parts = fullName.split(' - ');
    if (parts.length > 1) {
      return parts.slice(1).join(' - ');
    }
  }

  // Fallback
  return equipment?.part_number || fullName || 'Unnamed Equipment';
};

/**
 * Equipment Block Component - Displays a single piece of equipment in the rack
 * Clean design with white/light text on dark background
 */
const EquipmentBlock = memo(({
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

EquipmentBlock.displayName = 'EquipmentBlock';

/**
 * Empty Slot Component - Represents an empty U position in the rack
 */
const EmptySlot = memo(({ uPosition, top, height, isDragOver }) => {
  return (
    <div
      className={`absolute left-0 right-0 border border-dashed rounded transition-all ${
        isDragOver
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-zinc-700/50'
      }`}
      style={{
        top: `${top}px`,
        height: `${height - 2}px`,
      }}
    />
  );
});

EmptySlot.displayName = 'EmptySlot';

/**
 * Drop Preview Component - Shows where equipment will be placed
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
 * Shelf Equipment Item - A single piece of equipment displayed on a shelf
 */
const ShelfEquipmentItem = memo(({ equipment, width, onClick }) => {
  const displayName = getEquipmentDisplayName(equipment);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(equipment); }}
      className="h-full flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded cursor-pointer hover:border-violet-400 transition-colors overflow-hidden"
      style={{ width }}
    >
      <Server size={12} className="text-zinc-400 flex-shrink-0" />
      <span className="text-xs text-zinc-200 truncate">{displayName}</span>
    </div>
  );
});

ShelfEquipmentItem.displayName = 'ShelfEquipmentItem';

/**
 * Shelf Component - Represents a draggable shelf in the rack that can hold non-rack-mountable equipment
 */
const ShelfBlock = memo(({ shelf, top, height, totalU, shelfEquipment = [], maxItemsPerShelf = 4, onDragStart, onDelete, onEquipmentClick, onEquipmentDrop }) => {
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      // Only accept equipment drops (not shelf drops)
      if (!data.isShelf && data.equipmentId) {
        onEquipmentDrop?.(data.equipmentId, shelf.id);
      }
    } catch (err) {
      console.error('Shelf drop error:', err);
    }
  };

  // Calculate item widths based on max items per shelf
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

      {/* Shelf content area - equipment displayed side-by-side */}
      <div className="flex items-center gap-1 px-2 py-1 h-[calc(100%-24px)] overflow-hidden">
        {shelfEquipment.length > 0 ? (
          shelfEquipment.slice(0, maxItemsPerShelf).map((eq) => (
            <ShelfEquipmentItem
              key={eq.id}
              equipment={eq}
              width={itemWidth}
              onClick={onEquipmentClick}
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
 * Unplaced Equipment Card - Small card for equipment not yet in the rack
 */
const UnplacedEquipmentCard = memo(({ equipment, onDragStart, onClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  const uHeight = getEquipmentUHeight(equipment);
  const displayName = getEquipmentDisplayName(equipment);
  const needsShelf = equipment.needs_shelf || equipment.global_part?.needs_shelf;
  const shelfUHeight = equipment.shelf_u_height || equipment.global_part?.shelf_u_height;

  // For shelf equipment: show shelf_u_height; for rack equipment: show u_height
  const displayUHeight = needsShelf ? shelfUHeight : uHeight;
  const hasUHeight = needsShelf ? !!shelfUHeight : (uHeight > 0 && equipment.global_part?.u_height);

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      equipmentId: equipment.id,
      uHeight: needsShelf ? shelfUHeight || 2 : uHeight,
      isMove: false,
      needsShelf,
      shelfUHeight: shelfUHeight || 2,
      maxItemsPerShelf: equipment.max_items_per_shelf || equipment.global_part?.max_items_per_shelf || 1,
    }));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(equipment);
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleClick = (e) => {
    if (isDragging || e.defaultPrevented) return;
    onClick?.(equipment);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
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
});

UnplacedEquipmentCard.displayName = 'UnplacedEquipmentCard';

const RackFrontView = ({
  rack,
  racks = [],
  selectedRackId,
  onRackSelect,
  onAddRack,
  equipment = [],
  unplacedEquipment = [],
  projectId,
  haClients = [],
  haDevices = [],
  layoutMode = 'physical', // 'physical' = full grid, 'functional' = collapsed
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
  getNetworkInfo,
}) => {
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedEquipment: null,
    draggedShelf: null,
    dropPreview: null,
  });
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [showAddShelfModal, setShowAddShelfModal] = useState(false);
  const [showRackSelector, setShowRackSelector] = useState(false);
  const [newShelfU, setNewShelfU] = useState(2);
  const [newShelfPosition, setNewShelfPosition] = useState(1);

  // Find the selected rack index for display
  const selectedRackIndex = racks.findIndex(r => r.id === selectedRackId);
  const rackCountDisplay = racks.length > 0 ? `${selectedRackIndex + 1}/${racks.length}` : '0/0';

  const totalU = rack?.total_u || 42;

  // Group equipment by shelf_id
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

  // Calculate occupied U positions (including shelves)
  const occupiedPositions = useMemo(() => {
    const positions = new Map();

    // Mark equipment positions
    equipment.forEach((eq) => {
      const posU = eq.rack_position_u;
      if (posU && !eq.shelf_id) {
        const uHeight = getEquipmentUHeight(eq);
        for (let u = posU; u < posU + uHeight; u++) {
          positions.set(u, { type: 'equipment', item: eq });
        }
      }
    });

    // Mark shelf positions
    (rack?.shelves || []).forEach((shelf) => {
      for (let u = shelf.rack_position_u; u < shelf.rack_position_u + shelf.u_height; u++) {
        positions.set(u, { type: 'shelf', item: shelf });
      }
    });

    return positions;
  }, [equipment, rack?.shelves]);

  // Build positioned equipment and empty slots (excluding shelf equipment)
  const { positionedEquipment, emptySlots } = useMemo(() => {
    const positionedEquipment = [];
    const emptySlots = [];
    const processedUs = new Set();

    // Process rack-mounted equipment (not on shelves)
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

    // Also mark shelf U positions as processed
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

  // Build positioned shelves with their equipment
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

  // Drag handlers
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

  // Check if position is valid for drop (considering what's being dragged)
  const isValidDropPosition = useCallback((targetU, uHeight, draggedItemId = null, isShelf = false) => {
    for (let u = targetU; u < targetU + uHeight; u++) {
      if (u > totalU) return false;
      const occupied = occupiedPositions.get(u);
      if (occupied) {
        // If dragging a shelf, allow dropping over its own current position
        if (isShelf && occupied.type === 'shelf' && occupied.item.id === draggedItemId) {
          continue;
        }
        // If dragging equipment, allow dropping over its own current position
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

    // Determine what's being dragged
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

      console.log('[handleRackDrop] Drop data:', data, 'targetU:', targetU);

      // Handle shelf drop
      if (data.isShelf) {
        if (isValidDropPosition(targetU, data.uHeight, data.shelfId, true)) {
          onShelfMove?.(data.shelfId, targetU);
        }
      } else if (data.needsShelf && onAddShelf) {
        // Equipment needs a shelf - auto-create one
        const shelfUHeight = data.shelfUHeight || 2;
        if (isValidDropPosition(targetU, shelfUHeight, null, true)) {
          // Create shelf and add equipment to it
          const newShelf = await onAddShelf({
            rackId: rack?.id,
            uHeight: shelfUHeight,
            rackPositionU: targetU,
            name: `Shelf at U${targetU}`,
          });
          // If shelf was created successfully, drop equipment onto it
          if (newShelf?.id && onEquipmentDropOnShelf) {
            await onEquipmentDropOnShelf(data.equipmentId, newShelf.id);
          }
        }
      } else {
        // Handle regular equipment drop
        const isValid = isValidDropPosition(targetU, data.uHeight, data.equipmentId, false);
        console.log('[handleRackDrop] Regular equipment drop - isValid:', isValid, 'isMove:', data.isMove);
        if (isValid) {
          if (data.isMove) {
            console.log('[handleRackDrop] Calling onEquipmentMove for:', data.equipmentId, 'to U:', targetU);
            onEquipmentMove?.(data.equipmentId, targetU, null);
          } else {
            console.log('[handleRackDrop] Calling onEquipmentDrop for:', data.equipmentId, 'to U:', targetU);
            onEquipmentDrop?.(data.equipmentId, targetU, null);
          }
        } else {
          console.log('[handleRackDrop] Drop position invalid');
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
    handleDragEnd();
  }, [calculateDropPosition, isValidDropPosition, onEquipmentDrop, onEquipmentMove, onShelfMove, onAddShelf, onEquipmentDropOnShelf, rack?.id, handleDragEnd]);

  // Get network info for editing equipment
  const editingNetworkInfo = editingEquipment && getNetworkInfo ? getNetworkInfo(editingEquipment) : null;

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

        {/* Add Shelf Button */}
        <button
          onClick={() => setShowAddShelfModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors"
        >
          <Plus size={14} />
          <span>Shelf</span>
        </button>
      </div>

      {/* Rack Body */}
      <div className="p-4">
        {layoutMode === 'physical' ? (
          /* Physical Layout - Full rack grid with all U positions */
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

            {/* Rack Content - Full Width */}
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
                <EmptySlot key={slot.uPosition} {...slot} isDragOver={false} />
              ))}

              {/* Shelves */}
              {positionedShelves.map((shelf) => (
                <ShelfBlock
                  key={shelf.id}
                  shelf={shelf}
                  top={shelf.top}
                  height={shelf.height}
                  totalU={totalU}
                  shelfEquipment={shelf.equipment}
                  maxItemsPerShelf={4}
                  onDragStart={handleShelfDragStart}
                  onDelete={onShelfDelete}
                  onEquipmentClick={setEditingEquipment}
                  onEquipmentDrop={onEquipmentDropOnShelf}
                />
              ))}

              {/* Equipment */}
              {positionedEquipment.map((eq) => (
                <EquipmentBlock
                  key={eq.id}
                  equipment={eq}
                  top={eq.top}
                  height={eq.height}
                  isDragging={dragState.draggedEquipment?.id === eq.id}
                  networkInfo={getNetworkInfo?.(eq)}
                  onDragStart={handleDragStart}
                  onClick={setEditingEquipment}
                />
              ))}

              {/* Drop Preview */}
              {dragState.dropPreview && (
                <DropPreview top={dragState.dropPreview.top} height={dragState.dropPreview.height} />
              )}
            </div>
          </div>
        ) : (
          /* Functional Layout - Clean uniform blocks, sorted by U position (top to bottom) */
          /* Shelves are rendered as containers that group their equipment */
          <div className="space-y-2">
            {(() => {
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

              if (allItems.length === 0) {
                return (
                  <div className="text-center py-12 text-zinc-500">
                    No equipment placed in rack
                  </div>
                );
              }

              return allItems.map(({ type, item }) => {
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
                            const networkInfo = getNetworkInfo?.(eq);
                            return (
                              <div
                                key={`shelf-eq-${eq.id}`}
                                onClick={() => setEditingEquipment(eq)}
                                className="flex items-center gap-4 px-4 h-24 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                              >
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  networkInfo?.linked
                                    ? networkInfo?.isOnline ? 'bg-green-500' : 'bg-red-500'
                                    : 'bg-zinc-600'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-zinc-100 truncate">
                                    {getEquipmentDisplayName(eq)}
                                  </span>
                                </div>
                                {networkInfo?.ip && (
                                  <span className="text-xs text-blue-400 font-mono flex-shrink-0">{networkInfo.ip}</span>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }}
                                  className="p-1 rounded hover:bg-zinc-700 transition-colors"
                                  title="Edit equipment"
                                >
                                  <Settings size={14} className="text-zinc-500 hover:text-zinc-300" />
                                </button>
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
                  const networkInfo = getNetworkInfo?.(eq);
                  const uHeight = getEquipmentUHeight(eq);
                  return (
                    <div
                      key={`eq-${eq.id}`}
                      onClick={() => setEditingEquipment(eq)}
                      className="flex items-center gap-4 px-4 h-24 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors"
                    >
                      <div className="w-12 text-center">
                        <span className="text-xs font-mono text-zinc-500">U{eq.rack_position_u}</span>
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        networkInfo?.linked
                          ? networkInfo?.isOnline ? 'bg-green-500' : 'bg-red-500'
                          : 'bg-zinc-600'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                          {getEquipmentDisplayName(eq)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 ml-2">
                          {uHeight}U
                        </span>
                      </div>
                      {networkInfo?.ip && (
                        <span className="text-xs text-blue-400 font-mono flex-shrink-0">{networkInfo.ip}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingEquipment(eq); }}
                        className="p-1 rounded hover:bg-zinc-700 transition-colors"
                        title="Edit equipment"
                      >
                        <Settings size={14} className="text-zinc-500 hover:text-zinc-300" />
                      </button>
                    </div>
                  );
                }
              });
            })()}
          </div>
        )}

        {/* Unplaced Equipment */}
        <div className="mt-6">
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
              handleDragEnd();
            }}
          >
            {unplacedEquipment.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unplacedEquipment.map((eq) => (
                  <UnplacedEquipmentCard
                    key={eq.id}
                    equipment={eq}
                    onDragStart={handleDragStart}
                    onClick={setEditingEquipment}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                All equipment placed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingEquipment && (
        <EquipmentEditModal
          equipment={editingEquipment}
          projectId={projectId}
          networkInfo={editingNetworkInfo}
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

      {/* Add Shelf Modal */}
      {showAddShelfModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowAddShelfModal(false)}>
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Layers size={20} className="text-blue-400" />
                Add Shelf to Rack
              </h3>
              <button onClick={() => setShowAddShelfModal(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Shelf Height */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Shelf Height (U)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((u) => (
                    <button
                      key={u}
                      onClick={() => setNewShelfU(u)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        newShelfU === u
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {u}U
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Starting Position (U)</label>
                <input
                  type="number"
                  min={1}
                  max={totalU - newShelfU + 1}
                  value={newShelfPosition}
                  onChange={(e) => setNewShelfPosition(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
                <p className="text-xs text-zinc-500 mt-1">Position from bottom of rack (U1 = bottom)</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddShelfModal(false)}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onAddShelf?.({
                      rackId: rack?.id,
                      uHeight: newShelfU,
                      rackPositionU: newShelfPosition,
                      name: `Shelf at U${newShelfPosition}`,
                    });
                    setShowAddShelfModal(false);
                    setNewShelfU(2);
                    setNewShelfPosition(1);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
                >
                  Add Shelf
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RackFrontView);

export { U_HEIGHT };
