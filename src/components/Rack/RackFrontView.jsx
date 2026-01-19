/**
 * RackFrontView.jsx
 * Visual drag-and-drop rack layout view showing the front of the rack
 * Full-width layout matching back view style with improved readability
 */

import React, { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, RefreshCw, Server, GripVertical, X, Settings, Layers, Home, ChevronDown, Link2, Trash2, ExternalLink, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Constants
const U_HEIGHT = 50; // pixels per rack unit (slightly smaller for cleaner look)

/**
 * Get equipment U height from global_part or default to 1
 */
const getEquipmentUHeight = (equipment) => {
  return equipment?.global_part?.u_height || equipment?.u_height || 1;
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
  const displayName = equipment.global_part?.name || equipment.description || equipment.name || 'Unnamed Equipment';
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

        <Settings size={14} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0" />
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
 * Unplaced Equipment Card - Small card for equipment not yet in the rack
 */
const UnplacedEquipmentCard = memo(({ equipment, onDragStart, onClick }) => {
  const [isDragging, setIsDragging] = useState(false);
  const uHeight = getEquipmentUHeight(equipment);
  const displayName = equipment.global_part?.name || equipment.description || 'Unnamed';
  const hasUHeight = uHeight > 0 && equipment.global_part?.u_height;
  const needsShelf = equipment.needs_shelf;

  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      equipmentId: equipment.id,
      uHeight: needsShelf ? equipment.shelf_u_height || 2 : uHeight,
      isMove: false,
      needsShelf,
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
          hasUHeight
            ? 'bg-zinc-700 text-zinc-300'
            : 'bg-yellow-900/50 text-yellow-400 border border-dashed border-yellow-600'
        }`}
        title={hasUHeight ? `${uHeight} rack units` : 'U-height not set'}
      >
        {hasUHeight ? `${uHeight}U` : '?U'}
      </span>
    </div>
  );
});

UnplacedEquipmentCard.displayName = 'UnplacedEquipmentCard';

/**
 * Equipment Edit Modal - Full edit modal with Link, Delete, Move actions
 */
const EquipmentEditModal = memo(({
  equipment,
  projectId,
  networkInfo,
  haClients = [],
  haDevices = [],
  onClose,
  onSave,
  onRemove,
  onExclude,
  onMoveRoom,
  onLinkToHA
}) => {
  const [uHeight, setUHeight] = useState(equipment?.global_part?.u_height || 1);
  const [needsShelf, setNeedsShelf] = useState(equipment?.needs_shelf || false);
  const [shelfUHeight, setShelfUHeight] = useState(equipment?.shelf_u_height || 2);
  const [maxItemsPerShelf, setMaxItemsPerShelf] = useState(equipment?.max_items_per_shelf || 1);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [showRoomSelector, setShowRoomSelector] = useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const displayName = equipment?.global_part?.name || equipment?.description || 'Unnamed Equipment';
  const manufacturer = equipment?.global_part?.manufacturer || '';
  const model = equipment?.global_part?.model || '';
  const hasGlobalPart = !!equipment?.global_part_id;
  const isPlaced = equipment?.rack_position_u != null;
  const isLinked = networkInfo?.linked;

  // Get already linked MACs to filter them out
  const linkedMacs = new Set();
  // This would need to be passed in from parent - for now we show all

  // Load rooms when needed
  useEffect(() => {
    if (showRoomSelector && rooms.length === 0 && projectId) {
      setLoadingRooms(true);
      supabase
        .from('project_rooms')
        .select('id, name')
        .eq('project_id', projectId)
        .order('name')
        .then(({ data, error }) => {
          if (!error && data) setRooms(data);
          setLoadingRooms(false);
        });
    }
  }, [showRoomSelector, rooms.length, projectId]);

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

  const handleSaveShelfRequirement = async () => {
    setSaving(true);
    try {
      await onSave(equipment.id, {
        needsShelf,
        shelfUHeight: needsShelf ? shelfUHeight : null,
        maxItemsPerShelf: needsShelf ? maxItemsPerShelf : 1,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveRoom = async () => {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      await onMoveRoom(equipment.id, selectedRoomId);
      onClose();
    } catch (err) {
      console.error('Failed to move:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromRack = async () => {
    setSaving(true);
    try {
      await onRemove(equipment.id);
      onClose();
    } catch (err) {
      console.error('Failed to remove:', err);
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
      console.error('Failed to exclude:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkNetwork = async (mac) => {
    setSaving(true);
    try {
      await onLinkToHA(equipment.id, mac);
      setShowNetworkSelector(false);
    } catch (err) {
      console.error('Failed to link:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    try {
      await onLinkToHA(equipment.id, null);
    } catch (err) {
      console.error('Failed to unlink:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!equipment) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-zinc-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
            <p className="text-sm text-zinc-400 mt-0.5">
              {[manufacturer, model].filter(Boolean).join(' ') || 'No manufacturer/model'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Network Link Section */}
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 bg-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-zinc-400" />
                <span className="text-sm font-medium text-zinc-200">Network Device</span>
              </div>
              {isLinked && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  networkInfo?.isOnline ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {networkInfo?.isOnline ? 'Online' : 'Offline'}
                </span>
              )}
            </div>
            <div className="p-4">
              {isLinked ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">IP Address</span>
                    <a
                      href={`http://${networkInfo?.ip}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {networkInfo?.ip || 'N/A'}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">MAC Address</span>
                    <span className="text-sm font-mono text-zinc-300">{networkInfo?.mac || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Hostname</span>
                    <span className="text-sm text-zinc-300">{networkInfo?.hostname || 'N/A'}</span>
                  </div>
                  <button
                    onClick={handleUnlink}
                    disabled={saving}
                    className="w-full mt-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    Unlink Device
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setShowNetworkSelector(!showNetworkSelector)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    <span>Select network device...</span>
                    <ChevronDown size={16} className={`transition-transform ${showNetworkSelector ? 'rotate-180' : ''}`} />
                  </button>

                  {showNetworkSelector && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800">
                      {/* UniFi Devices */}
                      {haDevices.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide bg-zinc-900/50">
                            UniFi Devices
                          </div>
                          {haDevices.map(device => (
                            <button
                              key={device.mac}
                              onClick={() => handleLinkNetwork(device.mac)}
                              className="w-full px-3 py-2 text-left hover:bg-violet-600/20 transition-colors flex items-center justify-between"
                            >
                              <div>
                                <div className="text-sm text-zinc-200">{device.name}</div>
                                <div className="text-xs text-zinc-500">{device.ip}</div>
                              </div>
                              <span className="text-xs font-mono text-zinc-500">{device.mac?.toUpperCase()}</span>
                            </button>
                          ))}
                        </>
                      )}
                      {/* Network Clients */}
                      {haClients.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide bg-zinc-900/50">
                            Network Clients
                          </div>
                          {haClients.map(client => (
                            <button
                              key={client.mac}
                              onClick={() => handleLinkNetwork(client.mac)}
                              className="w-full px-3 py-2 text-left hover:bg-violet-600/20 transition-colors flex items-center justify-between"
                            >
                              <div>
                                <div className="text-sm text-zinc-200">{client.hostname || 'Unknown'}</div>
                                <div className="text-xs text-zinc-500">{client.ip}</div>
                              </div>
                              <span className="text-xs font-mono text-zinc-500">{client.mac?.toUpperCase()}</span>
                            </button>
                          ))}
                        </>
                      )}
                      {haDevices.length === 0 && haClients.length === 0 && (
                        <div className="px-3 py-4 text-sm text-zinc-500 text-center">
                          No network devices available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* U-Height Section */}
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 bg-zinc-800/50 flex items-center gap-2">
              <Server size={16} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Rack Size</span>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((u) => (
                  <button
                    key={u}
                    onClick={() => setUHeight(u)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      uHeight === u
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {u}U
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={uHeight}
                  onChange={(e) => setUHeight(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center text-sm"
                />
              </div>
              {hasGlobalPart && (
                <button
                  onClick={handleSaveUHeight}
                  disabled={saving || uHeight === equipment?.global_part?.u_height}
                  className="mt-3 w-full px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Save to Parts Database
                </button>
              )}
            </div>
          </div>

          {/* Shelf Requirement Section */}
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 bg-zinc-800/50 flex items-center gap-2">
              <Layers size={16} className="text-blue-400" />
              <span className="text-sm font-medium text-zinc-200">Shelf Space</span>
            </div>
            <div className="p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsShelf}
                  onChange={(e) => setNeedsShelf(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500"
                />
                <span className="text-sm text-zinc-300">Needs shelf space</span>
              </label>
              {needsShelf && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-24">Space needed:</span>
                    {[1, 2, 3, 4].map((u) => (
                      <button
                        key={u}
                        onClick={() => setShelfUHeight(u)}
                        className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                          shelfUHeight === u
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {u}U
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-24">Per shelf:</span>
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaxItemsPerShelf(n)}
                        className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                          maxItemsPerShelf === n
                            ? 'bg-violet-600 text-white'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {maxItemsPerShelf > 1
                      ? `${maxItemsPerShelf} devices can be shown side-by-side on a ${shelfUHeight}U shelf`
                      : 'One device per shelf'}
                  </p>
                </div>
              )}
              <button
                onClick={handleSaveShelfRequirement}
                disabled={saving}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
              >
                Save Shelf Setting
              </button>
            </div>
          </div>

          {/* Move to Room Section */}
          {onMoveRoom && (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-zinc-800/50 flex items-center gap-2">
                <Home size={16} className="text-amber-400" />
                <span className="text-sm font-medium text-zinc-200">Move to Room</span>
              </div>
              <div className="p-4 space-y-3">
                <button
                  onClick={() => setShowRoomSelector(!showRoomSelector)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm transition-colors"
                >
                  <span>{selectedRoomId ? rooms.find(r => r.id === selectedRoomId)?.name : 'Select room...'}</span>
                  <ChevronDown size={16} className={`transition-transform ${showRoomSelector ? 'rotate-180' : ''}`} />
                </button>
                {showRoomSelector && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800">
                    {loadingRooms ? (
                      <div className="p-3 text-sm text-zinc-500 text-center">Loading...</div>
                    ) : rooms.map(room => (
                      <button
                        key={room.id}
                        onClick={() => { setSelectedRoomId(room.id); setShowRoomSelector(false); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 text-zinc-300 transition-colors"
                      >
                        {room.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleMoveRoom}
                  disabled={saving || !selectedRoomId}
                  className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Move Equipment
                </button>
              </div>
            </div>
          )}

          {/* Actions Section */}
          <div className="pt-2 space-y-2">
            {isPlaced && (
              <button
                onClick={handleRemoveFromRack}
                disabled={saving}
                className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                Remove from Rack
              </button>
            )}
            <button
              onClick={handleExclude}
              disabled={saving}
              className="w-full px-3 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 rounded-lg text-red-400 text-sm font-medium transition-colors"
            >
              Exclude from Rack Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

EquipmentEditModal.displayName = 'EquipmentEditModal';

/**
 * RackFrontView - Main Component
 * Full-width rack view with clean styling
 */
const RackFrontView = ({
  rack,
  equipment = [],
  unplacedEquipment = [],
  projectId,
  haClients = [],
  haDevices = [],
  onEquipmentDrop,
  onEquipmentMove,
  onEquipmentRemove,
  onEquipmentEdit,
  onEquipmentExclude,
  onMoveRoom,
  onLinkToHA,
  onAddShelf,
  onRefresh,
  getNetworkInfo,
}) => {
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedEquipment: null,
    dropPreview: null,
  });
  const [editingEquipment, setEditingEquipment] = useState(null);

  const totalU = rack?.total_u || 42;

  // Calculate occupied U positions
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
    return positions;
  }, [equipment]);

  // Build positioned equipment and empty slots
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

    for (let u = 1; u <= totalU; u++) {
      if (!processedUs.has(u)) {
        const topU = totalU - u;
        emptySlots.push({ uPosition: u, top: topU * U_HEIGHT, height: U_HEIGHT });
      }
    }

    return { positionedEquipment, emptySlots };
  }, [equipment, totalU]);

  // Drag handlers
  const handleDragStart = useCallback((eq) => {
    setDragState(prev => ({ ...prev, isDragging: true, draggedEquipment: eq }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedEquipment: null, dropPreview: null });
  }, []);

  const calculateDropPosition = useCallback((e, containerRect) => {
    const relativeY = e.clientY - containerRect.top;
    const uFromTop = Math.floor(relativeY / U_HEIGHT);
    return Math.max(1, Math.min(totalU - uFromTop, totalU));
  }, [totalU]);

  const isValidDropPosition = useCallback((targetU, uHeight) => {
    for (let u = targetU; u < targetU + uHeight; u++) {
      if (u > totalU) return false;
      const occupied = occupiedPositions.get(u);
      if (occupied && occupied.type !== 'equipment') return false;
    }
    return true;
  }, [occupiedPositions, totalU]);

  const handleRackDragOver = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const targetU = calculateDropPosition(e, rect);
    const uHeight = dragState.draggedEquipment ? getEquipmentUHeight(dragState.draggedEquipment) : 1;

    if (isValidDropPosition(targetU, uHeight)) {
      const topU = totalU - targetU - uHeight + 1;
      setDragState(prev => ({
        ...prev,
        dropPreview: { targetU, top: topU * U_HEIGHT, height: uHeight * U_HEIGHT },
      }));
    } else {
      setDragState(prev => ({ ...prev, dropPreview: null }));
    }
  }, [calculateDropPosition, dragState.draggedEquipment, isValidDropPosition, totalU]);

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
      console.error('Drop error:', err);
    }
    handleDragEnd();
  }, [calculateDropPosition, isValidDropPosition, onEquipmentDrop, onEquipmentMove, handleDragEnd]);

  // Get network info for editing equipment
  const editingNetworkInfo = editingEquipment && getNetworkInfo ? getNetworkInfo(editingEquipment) : null;

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-zinc-800 border-b border-zinc-700">
        <h3 className="text-lg font-semibold text-white">
          {rack?.name || 'Rack'} - Front View
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {}} // TODO: Add shelf modal
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            <Plus size={14} />
            <span>Shelf</span>
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300 transition-colors"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Rack Body - Full Width */}
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
          onMoveRoom={onMoveRoom}
          onLinkToHA={onLinkToHA}
        />
      )}
    </div>
  );
};

export default memo(RackFrontView);

export { U_HEIGHT };
