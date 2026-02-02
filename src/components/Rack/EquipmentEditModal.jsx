/**
 * EquipmentEditModal.jsx
 * Shared modal component for editing equipment properties
 * Used by both RackFrontView and RackBackView
 */

import React, { useState, useEffect, memo } from 'react';
import { X, Link2, ExternalLink, ChevronDown, Server, Layers, Zap, Plug, Home, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Get display name for equipment
 */
const getEquipmentDisplayName = (item, haHostname = null) => {
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
  onExcludeGlobal,
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

  // Power device settings
  const [isPowerDevice, setIsPowerDevice] = useState(equipment?.global_part?.is_power_device || false);
  const [powerOutletsProvided, setPowerOutletsProvided] = useState(equipment?.global_part?.power_outlets_provided || 0);
  const [powerOutputWatts, setPowerOutputWatts] = useState(equipment?.global_part?.power_output_watts || 0);
  const [upsVaRating, setUpsVaRating] = useState(equipment?.global_part?.ups_va_rating || 0);
  const [upsRuntimeMinutes, setUpsRuntimeMinutes] = useState(equipment?.global_part?.ups_runtime_minutes || 0);
  const [powerWatts, setPowerWatts] = useState(equipment?.global_part?.power_watts || 0);
  const [powerOutletsRequired, setPowerOutletsRequired] = useState(equipment?.global_part?.power_outlets || 1);

  const displayName = getEquipmentDisplayName(equipment);
  const manufacturer = equipment?.global_part?.manufacturer || equipment?.manufacturer || '';
  const model = equipment?.global_part?.model || equipment?.model || '';
  const hasGlobalPart = !!equipment?.global_part_id;
  const isPlaced = equipment?.rack_position_u != null;
  const isLinked = networkInfo?.linked;

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

  const handleSavePowerSettings = async () => {
    if (!hasGlobalPart) return;
    setSaving(true);
    try {
      await onSave(equipment.id, {
        powerSettings: {
          is_power_device: isPowerDevice,
          power_outlets_provided: isPowerDevice ? powerOutletsProvided : 0,
          power_output_watts: isPowerDevice ? powerOutputWatts : null,
          ups_va_rating: isPowerDevice ? upsVaRating : null,
          ups_runtime_minutes: isPowerDevice ? upsRuntimeMinutes : null,
          power_watts: powerWatts,
          power_outlets: powerOutletsRequired,
        },
      });
      onClose();
    } catch (err) {
      console.error('Failed to save power settings:', err);
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

  const handleExcludeGlobal = async () => {
    setSaving(true);
    try {
      // Only pass equipment ID - we no longer update global_parts from here
      await onExcludeGlobal(equipment.id);
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
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={networkInfo?.isOnline
                    ? { backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' }
                    : { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#EF4444' }}
                >
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

          {/* Power Settings Section */}
          {hasGlobalPart && (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 bg-zinc-800/50 flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                <span className="text-sm font-medium text-zinc-200">Power Settings</span>
              </div>
              <div className="p-4 space-y-4">
                {/* Power Device Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPowerDevice}
                    onChange={(e) => setIsPowerDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-amber-500"
                  />
                  <span className="text-sm text-zinc-300">This is a power distribution device</span>
                  <span className="text-xs text-zinc-500">(UPS, PDU, surge protector)</span>
                </label>

                {isPowerDevice ? (
                  /* Power Device Settings */
                  <div className="space-y-3 p-3 rounded-lg bg-amber-900/20 border border-amber-800/50">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-amber-400 w-28">Outlets provided:</label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={powerOutletsProvided}
                        onChange={(e) => setPowerOutletsProvided(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: Math.min(powerOutletsProvided, 8) }).map((_, i) => (
                          <Plug key={i} size={10} className="text-amber-400" />
                        ))}
                        {powerOutletsProvided > 8 && <span className="text-xs text-amber-400 ml-1">+{powerOutletsProvided - 8}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-amber-400 w-28">Max output (W):</label>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={powerOutputWatts}
                        onChange={(e) => setPowerOutputWatts(parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-amber-400 w-28">VA rating (UPS):</label>
                      <input
                        type="number"
                        min="0"
                        max="20000"
                        value={upsVaRating}
                        onChange={(e) => setUpsVaRating(parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        placeholder="0 = N/A"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-amber-400 w-28">Runtime (min):</label>
                      <input
                        type="number"
                        min="0"
                        max="480"
                        value={upsRuntimeMinutes}
                        onChange={(e) => setUpsRuntimeMinutes(parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        placeholder="0 = N/A"
                      />
                    </div>
                  </div>
                ) : (
                  /* Regular Device Power Consumption */
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-400 w-28">Power draw (W):</label>
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        value={powerWatts}
                        onChange={(e) => setPowerWatts(parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-zinc-400 w-28">Outlets needed:</label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            onClick={() => setPowerOutletsRequired(n)}
                            className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                              powerOutletsRequired === n
                                ? 'bg-zinc-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSavePowerSettings}
                  disabled={saving}
                  className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Save Power Settings to Parts Database
                </button>
              </div>
            </div>
          )}

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
              className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-medium transition-colors"
            >
              Hide This Item
            </button>
            {equipment?.global_part_id && (
              <button
                onClick={handleExcludeGlobal}
                disabled={saving}
                className="w-full px-3 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 rounded-lg text-red-400 text-sm font-medium transition-colors"
              >
                Never Show This Part Type
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

EquipmentEditModal.displayName = 'EquipmentEditModal';

export default EquipmentEditModal;
