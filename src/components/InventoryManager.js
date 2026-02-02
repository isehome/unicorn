import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Package, AlertCircle, CheckCircle, Plus, Minus, Save, RefreshCw } from 'lucide-react';
import Button from './ui/Button';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';

const InventoryManager = ({ projectId }) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  useAuth(); // Auth context required for authenticated API calls
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();

  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'in_stock', 'needs_order'
  const [selectedRoom, setSelectedRoom] = useState('all');

  const loadInventory = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('project_equipment')
        .select(`
          *,
          project_rooms(name, is_headend),
          project_equipment_inventory(
            id,
            quantity_on_hand,
            quantity_assigned,
            needs_order,
            warehouse
          ),
          global_part:global_part_id(
            id,
            part_number,
            name,
            manufacturer,
            model,
            quantity_on_hand,
            reorder_point,
            warehouse_location
          )
        `)
        .eq('project_id', projectId)
        .eq('equipment_type', 'part')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;

      setEquipment(data || []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleQuantityChange = (equipmentId, inventoryId, newQuantity) => {
    const qty = Math.max(0, Number(newQuantity) || 0);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(equipmentId, {
        inventoryId,
        quantity_on_hand: qty
      });
      return next;
    });
  };

  const handleSaveChanges = useCallback(async () => {
    if (pendingChanges.size === 0) return;

    setSaving(true);
    setError(null);

    try {
      const updates = Array.from(pendingChanges.entries()).map(([equipmentId, change]) => {
        const item = equipment.find((e) => e.id === equipmentId);

        // NEW inventory method: Update global_parts table (global inventory)
        if (item?.global_part_id) {
          return supabase
            .from('global_parts')
            .update({
              quantity_on_hand: change.quantity_on_hand,
              last_inventory_check: new Date().toISOString()
            })
            .eq('id', item.global_part_id);
        } else {
          // Fallback to OLD method for backward compatibility
          const needsOrder = change.quantity_on_hand < (item?.planned_quantity || 0);
          return supabase
            .from('project_equipment_inventory')
            .update({
              quantity_on_hand: change.quantity_on_hand,
              needs_order: needsOrder,
              updated_at: new Date().toISOString()
            })
            .eq('id', change.inventoryId);
        }
      });

      await Promise.all(updates);

      setPendingChanges(new Map());
      await loadInventory();
    } catch (err) {
      console.error('Failed to save inventory changes:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }, [pendingChanges, equipment, loadInventory]);

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  const getInventoryStatus = useCallback((item) => {
    const pendingChange = pendingChanges.get(item.id);
    // Use NEW inventory method: global_part.quantity_on_hand (global inventory)
    // Fallback to OLD method: project_equipment_inventory for backward compatibility
    const onHand = pendingChange
      ? pendingChange.quantity_on_hand
      : item.global_part?.quantity_on_hand ?? item.project_equipment_inventory?.[0]?.quantity_on_hand ?? 0;
    const needed = item.quantity_required || item.planned_quantity || 0;
    const shortage = Math.max(0, needed - onHand);

    return {
      onHand,
      needed,
      shortage,
      hasStock: onHand >= needed,
      isModified: pendingChanges.has(item.id)
    };
  }, [pendingChanges]);

  const groupByRoom = (items) => {
    const groups = new Map();
    items.forEach((item) => {
      const roomName = item.project_rooms?.name || 'Unassigned';
      if (!groups.has(roomName)) {
        groups.set(roomName, []);
      }
      groups.get(roomName).push(item);
    });
    return Array.from(groups.entries());
  };

  // Memoized list of unique rooms
  const rooms = useMemo(() => {
    const uniqueRooms = new Set();
    equipment.forEach((item) => {
      const roomName = item.project_rooms?.name || 'Unassigned';
      uniqueRooms.add(roomName);
    });
    return Array.from(uniqueRooms).sort((a, b) => a.localeCompare(b));
  }, [equipment]);

  // Memoized filtered equipment based on search and filters
  const filteredEquipment = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return equipment.filter((item) => {
      // Room filter
      if (selectedRoom !== 'all') {
        const roomName = item.project_rooms?.name || 'Unassigned';
        if (roomName !== selectedRoom) return false;
      }

      // Status filter
      const status = getInventoryStatus(item);
      if (statusFilter === 'in_stock' && !status.hasStock) return false;
      if (statusFilter === 'needs_order' && status.hasStock) return false;

      // Search filter
      if (query) {
        const searchFields = [
          item.name,
          item.part_number,
          item.manufacturer,
          item.model,
          item.project_rooms?.name
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchFields.includes(query)) return false;
      }

      return true;
    });
  }, [equipment, searchQuery, selectedRoom, statusFilter, getInventoryStatus]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    const inStockCount = equipment.filter((item) => getInventoryStatus(item).hasStock).length;
    const needsOrderCount = equipment.length - inStockCount;
    const totalShortage = equipment.reduce((sum, item) => {
      const status = getInventoryStatus(item);
      return sum + status.shortage;
    }, 0);

    publishState({
      view: 'project-inventory',
      projectId: projectId,
      stats: {
        total: equipment.length,
        inStock: inStockCount,
        needsOrder: needsOrderCount,
        totalShortage: totalShortage,
        roomCount: rooms.length
      },
      filters: {
        searchQuery: searchQuery,
        statusFilter: statusFilter,
        selectedRoom: selectedRoom
      },
      rooms: rooms,
      filteredCount: filteredEquipment.length,
      hasPendingChanges: pendingChanges.size > 0,
      pendingChangesCount: pendingChanges.size,
      visibleInventory: filteredEquipment.slice(0, 10).map((item) => {
        const status = getInventoryStatus(item);
        return {
          id: item.id,
          name: item.name,
          partNumber: item.part_number,
          room: item.project_rooms?.name || 'Unassigned',
          onHand: status.onHand,
          needed: status.needed,
          shortage: status.shortage,
          hasStock: status.hasStock
        };
      }),
      hint: 'Project inventory page. Shows equipment items with stock levels. Can search, filter by room, filter by stock status (in_stock/needs_order). Users can adjust quantity on hand and save changes.'
    });
  }, [publishState, projectId, equipment, searchQuery, statusFilter, selectedRoom, rooms, filteredEquipment, pendingChanges, getInventoryStatus]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_inventory: async ({ query }) => {
        if (typeof query === 'string') {
          setSearchQuery(query);
          return { success: true, message: `Searching inventory for "${query}"` };
        }
        return { success: false, error: 'Invalid search query' };
      },
      clear_search: async () => {
        setSearchQuery('');
        return { success: true, message: 'Search cleared' };
      },
      filter_by_location: async ({ roomName }) => {
        if (roomName === 'all' || !roomName) {
          setSelectedRoom('all');
          return { success: true, message: 'Showing all locations' };
        }
        const matchingRoom = rooms.find((r) => r.toLowerCase().includes(roomName.toLowerCase()));
        if (matchingRoom) {
          setSelectedRoom(matchingRoom);
          return { success: true, message: `Filtering by location: ${matchingRoom}` };
        }
        return { success: false, error: `Location "${roomName}" not found. Available locations: ${rooms.join(', ')}` };
      },
      filter_by_status: async ({ status }) => {
        const validStatuses = ['all', 'in_stock', 'needs_order'];
        if (validStatuses.includes(status)) {
          setStatusFilter(status);
          const statusLabels = {
            all: 'all statuses',
            in_stock: 'in stock items',
            needs_order: 'items needing order'
          };
          return { success: true, message: `Filtering by: ${statusLabels[status]}` };
        }
        return { success: false, error: `Invalid status. Use: ${validStatuses.join(', ')}` };
      },
      refresh_inventory: async () => {
        await loadInventory();
        return { success: true, message: 'Inventory refreshed' };
      },
      save_changes: async () => {
        if (pendingChanges.size === 0) {
          return { success: false, error: 'No pending changes to save' };
        }
        await handleSaveChanges();
        return { success: true, message: `Saved ${pendingChanges.size} change(s)` };
      },
      discard_changes: async () => {
        if (pendingChanges.size === 0) {
          return { success: false, error: 'No pending changes to discard' };
        }
        handleDiscardChanges();
        return { success: true, message: 'Changes discarded' };
      },
      get_inventory_summary: async () => {
        const inStockCount = equipment.filter((item) => getInventoryStatus(item).hasStock).length;
        const needsOrderCount = equipment.length - inStockCount;
        const totalShortage = equipment.reduce((sum, item) => {
          const status = getInventoryStatus(item);
          return sum + status.shortage;
        }, 0);
        return {
          success: true,
          summary: {
            total: equipment.length,
            inStock: inStockCount,
            needsOrder: needsOrderCount,
            totalShortage: totalShortage,
            rooms: rooms.length
          },
          message: `${equipment.length} total items: ${inStockCount} in stock, ${needsOrderCount} need ordering (${totalShortage} total shortage) across ${rooms.length} locations`
        };
      },
      go_back: async () => {
        navigate(`/projects/${projectId}`);
        return { success: true, message: 'Navigating back to project' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, equipment, rooms, projectId, navigate, loadInventory, handleSaveChanges, handleDiscardChanges, pendingChanges, getInventoryStatus]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-violet-500" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading inventory...</p>
        </div>
      </div>
    );
  }

  const roomGroups = groupByRoom(filteredEquipment);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Inventory Management
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Validate stock levels and identify items that need ordering
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadInventory}
            disabled={loading || saving}
          >
            Refresh
          </Button>
          {pendingChanges.size > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscardChanges}
                disabled={saving}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                onClick={handleSaveChanges}
                disabled={saving}
              >
                Save {pendingChanges.size} Change{pendingChanges.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div style={sectionStyles.card} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Items</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {equipment.length}
              </p>
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div style={sectionStyles.card} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">In Stock</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color: '#94AF32' }}>
                {equipment.filter((item) => getInventoryStatus(item).hasStock).length}
              </p>
            </div>
            <CheckCircle style={{ color: '#94AF32' }} />
          </div>
        </div>

        <div style={sectionStyles.card} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Need Order</p>
              <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                {equipment.filter((item) => !getInventoryStatus(item).hasStock).length}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Items by Room */}
      <div className="space-y-4">
        {roomGroups.map(([roomName, items]) => (
          <div key={roomName} style={sectionStyles.card} className="overflow-hidden">
            <div className="border-b px-4 py-3 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white">{roomName}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="divide-y dark:divide-gray-700">
              {items.map((item) => {
                const status = getInventoryStatus(item);
                const inventoryId =
                  item.project_equipment_inventory?.[0]?.id || null;

                return (
                  <div
                    key={item.id}
                    className={`p-4 transition-colors ${
                      status.isModified ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Item Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </h4>
                          {status.hasStock ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }}>
                              <CheckCircle className="h-3 w-3" />
                              In Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                              <AlertCircle className="h-3 w-3" />
                              Need {status.shortage}
                            </span>
                          )}
                          {status.isModified && (
                            <span className="text-xs text-blue-600 dark:text-blue-400">
                              (Modified)
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                          {item.part_number && <span>P/N: {item.part_number}</span>}
                          {item.manufacturer && <span>• {item.manufacturer}</span>}
                          {item.model && <span>• {item.model}</span>}
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex flex-shrink-0 items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Needed</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                            {status.needed}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleQuantityChange(
                                item.id,
                                inventoryId,
                                status.onHand - 1
                              )
                            }
                            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-zinc-800"
                            disabled={saving || status.onHand === 0}
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          <div className="w-20 text-center">
                            <input
                              type="number"
                              value={status.onHand}
                              onChange={(e) =>
                                handleQuantityChange(
                                  item.id,
                                  inventoryId,
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800"
                              disabled={saving}
                              min="0"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              On Hand
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              handleQuantityChange(
                                item.id,
                                inventoryId,
                                status.onHand + 1
                              )
                            }
                            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-zinc-800"
                            disabled={saving}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {equipment.length === 0 && (
        <div style={sectionStyles.card} className="px-6 py-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
            No equipment found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Import a project equipment CSV to get started
          </p>
        </div>
      )}
    </div>
  );
};

InventoryManager.propTypes = {
  projectId: PropTypes.string.isRequired
};

export default InventoryManager;
