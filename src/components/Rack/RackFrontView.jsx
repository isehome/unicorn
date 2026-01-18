/**
 * RackFrontView.jsx
 * Visual drag-and-drop rack layout view showing the front of the rack
 * Supports equipment placement, shelf management, and drag-and-drop operations
 */

import React, { memo, useState, useCallback, useMemo } from 'react';
import { Plus, RefreshCw, Server, Trash2, GripVertical, X, EyeOff, Settings } from 'lucide-react';

// Constants - using HOUR_HEIGHT pattern from calendar (60px per U)
const U_HEIGHT = 60; // pixels per rack unit
const RACK_WIDTH = 400; // pixels for rack visualization
const U_LABEL_WIDTH = 40; // pixels for U number labels

/**
 * Equipment type colors
 */
const equipmentColors = {
  placed: {
    bg: 'rgba(139, 92, 246, 0.2)',
    border: '#8B5CF6',
    text: '#A78BFA',
  },
  unplaced: {
    bg: 'rgba(113, 113, 122, 0.2)',
    border: '#71717A',
    text: '#A1A1AA',
  },
  shelf: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '#3B82F6',
    text: '#60A5FA',
  },
  dropTarget: {
    bg: 'rgba(139, 92, 246, 0.1)',
    border: '#8B5CF6',
  },
};

/**
 * Get equipment U height from global_part or default to 1
 */
const getEquipmentUHeight = (equipment) => {
  return equipment?.global_part?.u_height || equipment?.u_height || 1;
};

/**
 * Equipment Block Component - Displays a single piece of equipment in the rack
 */
const EquipmentBlock = memo(({
  equipment,
  top,
  height,
  isPlaced = true,
  isDragging = false,
  onDragStart,
  onRemove,
}) => {
  const colors = isPlaced ? equipmentColors.placed : equipmentColors.unplaced;
  const uHeight = getEquipmentUHeight(equipment);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      equipmentId: equipment.id,
      uHeight,
      isMove: isPlaced,
    }));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(equipment);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`absolute left-0 right-0 rounded-lg border-2 px-3 py-2 cursor-grab active:cursor-grabbing transition-all overflow-hidden ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height - 4, 30)}px`,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        zIndex: isDragging ? 50 : 20,
      }}
    >
      <div className="flex items-start justify-between gap-2 h-full">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical size={14} className="text-zinc-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium truncate"
                style={{ color: colors.text }}
              >
                {equipment.name || 'Unnamed Equipment'}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(139, 92, 246, 0.3)',
                  color: '#A78BFA',
                }}
              >
                {uHeight}U
              </span>
            </div>
            {height >= 50 && (
              <div className="text-xs opacity-70 truncate mt-0.5" style={{ color: colors.text }}>
                {[equipment.manufacturer, equipment.model].filter(Boolean).join(' - ') || 'No details'}
              </div>
            )}
          </div>
        </div>
        {isPlaced && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(equipment.id);
            }}
            className="p-1 rounded hover:bg-zinc-700/50 transition-colors flex-shrink-0"
            title="Remove from rack"
          >
            <Trash2 size={14} className="text-zinc-400 hover:text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
});

EquipmentBlock.displayName = 'EquipmentBlock';

/**
 * Shelf Block Component - Displays a shelf that can hold multiple small items
 */
const ShelfBlock = memo(({
  shelf,
  top,
  height,
  shelfEquipment = [],
  onDrop,
  onRemoveEquipment,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const shelfPosU = shelf.rack_position_u || shelf.position_u;
      onDrop?.(data.equipmentId, shelfPosU, shelf.id);
    } catch (err) {
      console.error('[ShelfBlock] Drop error:', err);
    }
  };

  return (
    <div
      className={`absolute left-0 right-0 rounded-lg border-2 border-dashed px-3 py-2 transition-all ${
        isDragOver ? 'ring-2 ring-violet-500/50' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height - 4, 30)}px`,
        backgroundColor: isDragOver ? equipmentColors.dropTarget.bg : equipmentColors.shelf.bg,
        borderColor: isDragOver ? equipmentColors.dropTarget.border : equipmentColors.shelf.border,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-xs font-medium mb-1" style={{ color: equipmentColors.shelf.text }}>
        Shelf (U{shelf.rack_position_u || shelf.position_u})
      </div>
      <div className="flex flex-wrap gap-1">
        {shelfEquipment.map((eq) => (
          <div
            key={eq.id}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: equipmentColors.placed.bg,
              border: `1px solid ${equipmentColors.placed.border}`,
              color: equipmentColors.placed.text,
            }}
          >
            <span className="truncate max-w-[100px]">{eq.name}</span>
            {onRemoveEquipment && (
              <button
                onClick={() => onRemoveEquipment(eq.id)}
                className="hover:text-red-400"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
        {shelfEquipment.length === 0 && (
          <span className="text-xs text-zinc-500 italic">Drop equipment here</span>
        )}
      </div>
    </div>
  );
});

ShelfBlock.displayName = 'ShelfBlock';

/**
 * Empty Slot Component - Represents an empty U position in the rack
 */
const EmptySlot = memo(({
  uPosition,
  top,
  height,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  return (
    <div
      className={`absolute left-0 right-0 border border-dashed rounded transition-all ${
        isDragOver
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-zinc-700 hover:border-zinc-600'
      }`}
      style={{
        top: `${top}px`,
        height: `${height - 2}px`,
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
      className="absolute left-0 right-0 rounded-lg border-2 border-dashed pointer-events-none"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        zIndex: 30,
      }}
    >
      <div className="flex items-center justify-center h-full text-sm text-violet-400">
        Drop here
      </div>
    </div>
  );
});

DropPreview.displayName = 'DropPreview';

/**
 * U Labels Column Component - Shows U position numbers
 */
const ULabelsColumn = memo(({ totalU }) => {
  return (
    <div className="flex-shrink-0" style={{ width: `${U_LABEL_WIDTH}px` }}>
      <div className="relative" style={{ height: `${totalU * U_HEIGHT}px` }}>
        {Array.from({ length: totalU }, (_, i) => {
          const uPosition = totalU - i;
          return (
            <div
              key={uPosition}
              className="absolute right-2 text-xs text-zinc-500 font-mono"
              style={{
                top: `${i * U_HEIGHT + (U_HEIGHT / 2) - 8}px`,
              }}
            >
              U{uPosition}
            </div>
          );
        })}
      </div>
    </div>
  );
});

ULabelsColumn.displayName = 'ULabelsColumn';

/**
 * Unplaced Equipment Card - Small card for equipment not yet in the rack
 * Clickable to open edit modal, draggable to place in rack
 */
const UnplacedEquipmentCard = memo(({ equipment, onDragStart, onClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  const uHeight = getEquipmentUHeight(equipment);

  // Normalize display data from global_part or fallback to equipment fields
  const displayName = equipment.global_part?.name || equipment.description || 'Unnamed';
  const manufacturer = equipment.global_part?.manufacturer || '';
  const model = equipment.global_part?.model || '';
  const hasUHeight = uHeight > 0 && equipment.global_part?.u_height;

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      equipmentId: equipment.id,
      uHeight,
      isMove: false,
    }));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(equipment);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleClick = (e) => {
    // Don't trigger click when dragging
    if (isDragging || e.defaultPrevented) return;
    e.stopPropagation();
    onClick?.(equipment);
  };

  // Handle settings icon click specifically
  const handleSettingsClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick?.(equipment);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:border-violet-500/50 group"
      style={{
        backgroundColor: equipmentColors.unplaced.bg,
        borderColor: equipmentColors.unplaced.border,
      }}
    >
      <GripVertical size={14} className="text-zinc-500 flex-shrink-0" />
      <Server size={14} style={{ color: equipmentColors.unplaced.text }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" style={{ color: equipmentColors.unplaced.text }}>
          {displayName}
        </div>
        <div className="text-xs text-zinc-500 truncate">
          {[manufacturer, model].filter(Boolean).join(' - ') || 'No details'}
        </div>
      </div>
      <span
        className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${!hasUHeight ? 'border border-dashed border-yellow-500/50' : ''}`}
        style={{
          backgroundColor: hasUHeight ? 'rgba(113, 113, 122, 0.3)' : 'rgba(234, 179, 8, 0.2)',
          color: hasUHeight ? '#A1A1AA' : '#EAB308',
        }}
        title={hasUHeight ? `${uHeight} rack units` : 'U-height not set - will prompt on drop'}
      >
        {hasUHeight ? `${uHeight}U` : '?U'}
      </span>
      {/* Settings icon - always clickable */}
      <button
        type="button"
        onClick={handleSettingsClick}
        className="p-1 rounded hover:bg-zinc-700 transition-colors flex-shrink-0"
        title="Edit equipment settings"
      >
        <Settings
          size={14}
          className="text-zinc-500 group-hover:text-violet-400 transition-colors"
        />
      </button>
    </div>
  );
});

UnplacedEquipmentCard.displayName = 'UnplacedEquipmentCard';

/**
 * Add Shelf Modal - Simple modal for adding a new shelf
 */
const AddShelfModal = memo(({ isOpen, onClose, onSubmit, totalU }) => {
  const [uHeight, setUHeight] = useState(2);
  const [positionU, setPositionU] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(uHeight, positionU);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-80 border border-zinc-700">
        <h3 className="text-lg font-semibold text-white mb-4">Add Shelf</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Shelf Height (U)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={uHeight}
              onChange={(e) => setUHeight(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Position (U)</label>
            <input
              type="number"
              min="1"
              max={totalU}
              value={positionU}
              onChange={(e) => setPositionU(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-white transition-colors"
            >
              Add Shelf
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

AddShelfModal.displayName = 'AddShelfModal';

/**
 * Equipment Edit Modal - Modal for editing equipment properties
 * Allows excluding from rack, setting U-height, etc.
 */
const EquipmentEditModal = memo(({ equipment, onClose, onSave, onExclude }) => {
  const [uHeight, setUHeight] = useState(equipment?.global_part?.u_height || 1);
  const [saving, setSaving] = useState(false);

  const displayName = equipment?.global_part?.name || equipment?.description || 'Unnamed Equipment';
  const manufacturer = equipment?.global_part?.manufacturer || '';
  const model = equipment?.global_part?.model || '';
  const hasGlobalPart = !!equipment?.global_part_id;

  const handleSaveUHeight = async () => {
    if (!hasGlobalPart) return;
    setSaving(true);
    try {
      await onSave(equipment.id, { uHeight });
      onClose();
    } catch (err) {
      console.error('Failed to save U-height:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExclude = async () => {
    setSaving(true);
    try {
      await onExclude(equipment.id);
      onClose();
    } catch (err) {
      console.error('Failed to exclude equipment:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!equipment) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-xl p-6 w-96 border border-zinc-700 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
            <p className="text-sm text-zinc-400">
              {[manufacturer, model].filter(Boolean).join(' - ') || 'No manufacturer/model'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        {/* Equipment Info */}
        <div className="space-y-4">
          {/* U-Height Section */}
          <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-700">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Rack Unit Height (U)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUHeight(u)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      uHeight === u
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    {u}U
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="20"
                value={uHeight}
                onChange={(e) => setUHeight(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-center"
              />
            </div>
            {hasGlobalPart && (
              <button
                onClick={handleSaveUHeight}
                disabled={saving || uHeight === equipment?.global_part?.u_height}
                className="mt-3 w-full px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save U-Height to Parts Database'}
              </button>
            )}
            {!hasGlobalPart && (
              <p className="mt-2 text-xs text-yellow-500">
                This equipment is not linked to a global part. U-height will be set when placed.
              </p>
            )}
          </div>

          {/* Exclude Section */}
          <div className="p-4 bg-red-900/20 rounded-lg border border-red-800/50">
            <div className="flex items-start gap-3">
              <EyeOff size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-300">
                  Not Rack Equipment
                </h4>
                <p className="text-xs text-red-400/80 mt-1">
                  Mark this as non-rack equipment (wire, cable, accessories, etc.) to hide it from the rack layout drop zone.
                </p>
                <button
                  onClick={handleExclude}
                  disabled={saving}
                  className="mt-3 px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  {saving ? 'Excluding...' : 'Exclude from Rack Layout'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

EquipmentEditModal.displayName = 'EquipmentEditModal';

/**
 * RackFrontView - Main Component
 * Visual drag-and-drop rack layout view showing the front of the rack
 */
const RackFrontView = ({
  rack,
  equipment = [],
  unplacedEquipment = [],
  onEquipmentDrop,
  onEquipmentMove,
  onEquipmentRemove,
  onEquipmentEdit,
  onEquipmentExclude,
  onAddShelf,
  onRefresh,
}) => {
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedEquipment: null,
    dropPreview: null,
  });
  const [showAddShelfModal, setShowAddShelfModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);

  const totalU = rack?.total_u || 42;
  const shelves = rack?.shelves || [];

  // Calculate occupied U positions
  const occupiedPositions = useMemo(() => {
    const positions = new Map();

    // Map equipment to their positions (using rack_position_u from database)
    equipment.forEach((eq) => {
      const posU = eq.rack_position_u || eq.position_u;
      if (posU && !eq.shelf_id) {
        const uHeight = getEquipmentUHeight(eq);
        for (let u = posU; u < posU + uHeight; u++) {
          positions.set(u, { type: 'equipment', item: eq });
        }
      }
    });

    // Map shelves to their positions
    shelves.forEach((shelf) => {
      const shelfHeight = shelf.u_height || 2;
      const shelfPosU = shelf.rack_position_u || shelf.position_u;
      for (let u = shelfPosU; u < shelfPosU + shelfHeight; u++) {
        positions.set(u, { type: 'shelf', item: shelf });
      }
    });

    return positions;
  }, [equipment, shelves]);

  // Get equipment on shelves
  const shelfEquipmentMap = useMemo(() => {
    const map = new Map();
    equipment.forEach((eq) => {
      if (eq.shelf_id) {
        if (!map.has(eq.shelf_id)) {
          map.set(eq.shelf_id, []);
        }
        map.get(eq.shelf_id).push(eq);
      }
    });
    return map;
  }, [equipment]);

  // Build positioned equipment and empty slots
  const { positionedEquipment, positionedShelves, emptySlots } = useMemo(() => {
    const positionedEquipment = [];
    const positionedShelves = [];
    const emptySlots = [];
    const processedUs = new Set();

    // Process equipment (using rack_position_u from database)
    equipment.forEach((eq) => {
      const posU = eq.rack_position_u || eq.position_u;
      if (posU && !eq.shelf_id) {
        const uHeight = getEquipmentUHeight(eq);
        const topU = totalU - posU - uHeight + 1;
        positionedEquipment.push({
          ...eq,
          // Normalize equipment data for display
          name: eq.global_part?.name || eq.description || 'Unnamed Equipment',
          manufacturer: eq.global_part?.manufacturer || '',
          model: eq.global_part?.model || '',
          top: topU * U_HEIGHT,
          height: uHeight * U_HEIGHT,
        });
        for (let u = posU; u < posU + uHeight; u++) {
          processedUs.add(u);
        }
      }
    });

    // Process shelves
    shelves.forEach((shelf) => {
      const shelfHeight = shelf.u_height || 2;
      const shelfPosU = shelf.rack_position_u || shelf.position_u;
      const topU = totalU - shelfPosU - shelfHeight + 1;
      positionedShelves.push({
        ...shelf,
        top: topU * U_HEIGHT,
        height: shelfHeight * U_HEIGHT,
      });
      for (let u = shelfPosU; u < shelfPosU + shelfHeight; u++) {
        processedUs.add(u);
      }
    });

    // Find empty slots
    for (let u = 1; u <= totalU; u++) {
      if (!processedUs.has(u)) {
        const topU = totalU - u;
        emptySlots.push({
          uPosition: u,
          top: topU * U_HEIGHT,
          height: U_HEIGHT,
        });
      }
    }

    return { positionedEquipment, positionedShelves, emptySlots };
  }, [equipment, shelves, totalU]);

  // Handle drag start
  const handleDragStart = useCallback((eq) => {
    setDragState((prev) => ({
      ...prev,
      isDragging: true,
      draggedEquipment: eq,
    }));
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedEquipment: null,
      dropPreview: null,
    });
  }, []);

  // Calculate drop position from mouse Y
  const calculateDropPosition = useCallback((e, containerRect) => {
    const relativeY = e.clientY - containerRect.top;
    const uFromTop = Math.floor(relativeY / U_HEIGHT);
    const targetU = totalU - uFromTop;
    return Math.max(1, Math.min(targetU, totalU));
  }, [totalU]);

  // Check if position is valid for drop
  const isValidDropPosition = useCallback((targetU, uHeight) => {
    for (let u = targetU; u < targetU + uHeight; u++) {
      if (u > totalU) return false;
      const occupied = occupiedPositions.get(u);
      if (occupied && occupied.type !== 'equipment') return false;
    }
    return true;
  }, [occupiedPositions, totalU]);

  // Handle drag over on rack area
  const handleRackDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const targetU = calculateDropPosition(e, rect);

    // Get the dragged equipment's height
    const uHeight = dragState.draggedEquipment
      ? getEquipmentUHeight(dragState.draggedEquipment)
      : 1;

    if (isValidDropPosition(targetU, uHeight)) {
      const topU = totalU - targetU - uHeight + 1;
      setDragState((prev) => ({
        ...prev,
        dropPreview: {
          targetU,
          top: topU * U_HEIGHT,
          height: uHeight * U_HEIGHT,
        },
      }));
    } else {
      setDragState((prev) => ({
        ...prev,
        dropPreview: null,
      }));
    }
  }, [calculateDropPosition, dragState.draggedEquipment, isValidDropPosition, totalU]);

  // Handle drag leave on rack area
  const handleRackDragLeave = useCallback(() => {
    setDragState((prev) => ({
      ...prev,
      dropPreview: null,
    }));
  }, []);

  // Handle drop on rack area
  const handleRackDrop = useCallback((e) => {
    e.preventDefault();

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const rect = e.currentTarget.getBoundingClientRect();
      const targetU = calculateDropPosition(e, rect);

      if (isValidDropPosition(targetU, data.uHeight)) {
        if (data.isMove) {
          onEquipmentMove?.(data.equipmentId, targetU, null);
        } else {
          onEquipmentDrop?.(data.equipmentId, targetU, null);
        }
      }
    } catch (err) {
      console.error('[RackFrontView] Drop error:', err);
    }

    handleDragEnd();
  }, [calculateDropPosition, isValidDropPosition, onEquipmentDrop, onEquipmentMove, handleDragEnd]);

  // Handle add shelf
  const handleAddShelf = useCallback((uHeight, positionU) => {
    onAddShelf?.(uHeight, positionU);
  }, [onAddShelf]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 bg-zinc-800">
        <div className="flex items-center gap-3">
          <Server size={20} className="text-violet-400" />
          <h2 className="text-lg font-semibold text-white">
            {rack?.name || 'Rack'} ({totalU}U)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddShelfModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <Plus size={14} />
            <span>Shelf</span>
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Rack Visualization */}
        <div className="flex gap-2 mb-6">
          {/* U Labels */}
          <ULabelsColumn totalU={totalU} />

          {/* Rack Body */}
          <div
            className="relative bg-zinc-800 border border-zinc-700 rounded-lg"
            style={{
              width: `${RACK_WIDTH}px`,
              height: `${totalU * U_HEIGHT}px`,
            }}
            onDragOver={handleRackDragOver}
            onDragLeave={handleRackDragLeave}
            onDrop={handleRackDrop}
          >
            {/* U Grid Lines */}
            {Array.from({ length: totalU }, (_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-zinc-700/30"
                style={{ top: `${i * U_HEIGHT}px` }}
              />
            ))}

            {/* Empty Slots */}
            {emptySlots.map((slot) => (
              <EmptySlot
                key={slot.uPosition}
                uPosition={slot.uPosition}
                top={slot.top}
                height={slot.height}
                isDragOver={false}
              />
            ))}

            {/* Positioned Shelves */}
            {positionedShelves.map((shelf) => (
              <ShelfBlock
                key={shelf.id}
                shelf={shelf}
                top={shelf.top}
                height={shelf.height}
                shelfEquipment={shelfEquipmentMap.get(shelf.id) || []}
                onDrop={onEquipmentDrop}
                onRemoveEquipment={onEquipmentRemove}
              />
            ))}

            {/* Positioned Equipment */}
            {positionedEquipment.map((eq) => (
              <EquipmentBlock
                key={eq.id}
                equipment={eq}
                top={eq.top}
                height={eq.height}
                isPlaced={true}
                isDragging={dragState.draggedEquipment?.id === eq.id}
                onDragStart={handleDragStart}
                onRemove={onEquipmentRemove}
              />
            ))}

            {/* Drop Preview */}
            {dragState.dropPreview && (
              <DropPreview
                top={dragState.dropPreview.top}
                height={dragState.dropPreview.height}
              />
            )}
          </div>
        </div>

        {/* Unplaced Equipment Section */}
        <div className="mt-6">
          <div className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <span>DROP ZONE - Drag equipment here</span>
            <span className="text-xs text-zinc-500">({unplacedEquipment.length} items)</span>
          </div>
          <div
            className="min-h-[100px] p-3 border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-800/50"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.isMove) {
                  onEquipmentRemove?.(data.equipmentId);
                }
              } catch (err) {
                console.error('[RackFrontView] Unplace drop error:', err);
              }
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
                <span>All equipment has been placed in the rack</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Shelf Modal */}
      <AddShelfModal
        isOpen={showAddShelfModal}
        onClose={() => setShowAddShelfModal(false)}
        onSubmit={handleAddShelf}
        totalU={totalU}
      />

      {/* Equipment Edit Modal */}
      {editingEquipment && (
        <EquipmentEditModal
          equipment={editingEquipment}
          onClose={() => setEditingEquipment(null)}
          onSave={onEquipmentEdit}
          onExclude={onEquipmentExclude}
        />
      )}
    </div>
  );
};

export default memo(RackFrontView);

// Export constants for use in parent components
export { U_HEIGHT, RACK_WIDTH, U_LABEL_WIDTH };
