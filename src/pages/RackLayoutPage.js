import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Server, RotateCcw, Loader, Plus } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { projectsService } from '../services/supabaseService';
import * as rackService from '../services/rackService';
import Button from '../components/ui/Button';
import RackFrontView from '../components/Rack/RackFrontView';
import RackBackView from '../components/Rack/RackBackView';

/**
 * RackLayoutPage - Head-End rack layout management page
 * Supports multiple racks (main + satellite) with equipment linking
 * Displays front, back, and power views of the selected rack
 */
const RackLayoutPage = () => {
  const { projectId } = useParams();
  const { mode } = useTheme();

  // Core state
  const [project, setProject] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Rack management state
  const [racks, setRacks] = useState([]); // All racks for this project
  const [selectedRack, setSelectedRack] = useState(null); // Currently selected rack
  const [rackEquipment, setRackEquipment] = useState([]); // Equipment that IS a rack (for creating new racks)
  const [showAddRackModal, setShowAddRackModal] = useState(false);

  // View state
  const [activeView, setActiveView] = useState('front'); // 'front', 'back'
  const [layoutMode, setLayoutMode] = useState('physical'); // 'physical', 'functional'

  // Home Assistant network clients and devices state
  const [haClients, setHaClients] = useState([]);
  const [haDevices, setHaDevices] = useState([]); // UniFi infrastructure (switches, APs, gateways)

  // Styles based on theme
  const styles = useMemo(() => ({
    card: {
      backgroundColor: mode === 'dark' ? '#27272A' : '#FFFFFF',
      borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
    },
    textPrimary: mode === 'dark' ? '#F9FAFB' : '#18181B',
    textSecondary: mode === 'dark' ? '#A1A1AA' : '#4B5563',
  }), [mode]);

  // Load project data
  const loadData = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Load project details
      const projectData = await projectsService.getById(projectId);
      setProject(projectData);

      // Load all equipment for the project
      const equipmentData = await projectEquipmentService.fetchProjectEquipment(projectId);
      setEquipment(equipmentData || []);

      // Load racks for this project
      const racksData = await rackService.getProjectRacks(projectId);
      setRacks(racksData || []);

      // Load rack equipment (equipment that IS a rack)
      const rackEqData = await rackService.getProjectRackEquipment(projectId);
      setRackEquipment(rackEqData || []);

      // Update selectedRack with fresh data (including updated shelf positions)
      // Use functional update to avoid dependency on selectedRack
      if (racksData?.length > 0) {
        setSelectedRack(prevSelected => {
          if (prevSelected) {
            // Find the updated version of the currently selected rack
            const updatedRack = racksData.find(r => r.id === prevSelected.id);
            return updatedRack || racksData[0];
          } else {
            // No rack selected, select first available
            return racksData[0];
          }
        });
      }

    } catch (err) {
      console.error('Failed to load rack layout data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch HA network clients AND UniFi devices for back view network linking
  const fetchHAClients = useCallback(async () => {
    if (!projectId) return;

    try {
      // Use Vercel production URL for API calls in development
      const apiBase = window.location.hostname === 'localhost'
        ? 'https://unicorn-one.vercel.app'
        : '';
      const response = await fetch(`${apiBase}/api/ha/network-clients?project_id=${projectId}`);
      const result = await response.json();

      if (response.ok) {
        // Transform clients to expected format for RackBackView
        if (result.clients) {
          const clients = result.clients.map(c => ({
            mac: c.mac_address,
            hostname: c.hostname || c.name,
            ip: c.ip_address,
            is_online: true,
            is_wired: c.is_wired,
            switch_name: c.switch_name,
            switch_port: c.switch_port
          }));
          setHaClients(clients);
        }

        // Transform UniFi devices (switches, APs, gateways) to expected format
        if (result.devices) {
          const devices = result.devices.map(d => ({
            mac: d.mac_address,
            name: d.name,
            model: d.model,
            ip: d.ip_address,
            category: d.category, // 'switch', 'access_point', 'gateway'
            type: d.type,
            is_online: d.is_online,
            version: d.version,
            uptime: d.uptime_formatted,
            ports_total: d.ports_total,
            ports_used: d.ports_used,
            port_table: d.port_table,
            num_sta: d.num_sta, // Connected stations for APs
            cpu: d.cpu,
            mem: d.mem
          }));
          setHaDevices(devices);
          console.log('[RackLayout] Loaded', devices.length, 'UniFi devices:', devices.map(d => d.name));
        }
      }
    } catch (err) {
      console.error('Failed to fetch HA network clients:', err);
    }
  }, [projectId]);

  // Fetch HA clients when view changes to back OR front (front view modal needs them too)
  useEffect(() => {
    if (activeView === 'back' || activeView === 'front') {
      fetchHAClients();
    }
  }, [activeView, fetchHAClients]);

  // Helper function to get network info for an equipment item (used by RackFrontView)
  const getNetworkInfo = useCallback((item) => {
    let haClient = item.ha_client;

    // If no nested object but we have ha_client_mac, look it up
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
  }, [haClients, haDevices]);

  // Handle linking equipment to HA network client
  const handleLinkToHA = useCallback(async (equipmentId, clientMac) => {
    console.log('[handleLinkToHA] Called with equipmentId:', equipmentId, 'clientMac:', clientMac);
    try {
      console.log('[handleLinkToHA] Calling updateEquipment...');
      const result = await projectEquipmentService.updateEquipment(equipmentId, {
        ha_client_mac: clientMac,
        unifi_client_mac: clientMac
      });
      console.log('[handleLinkToHA] updateEquipment result:', result);
      await loadData();
      console.log('[handleLinkToHA] loadData completed');
    } catch (err) {
      console.error('[handleLinkToHA] Failed to link equipment to HA client:', err);
    }
  }, [loadData]);

  // Get equipment that hasn't been assigned to any rack yet (for the "add rack" modal)
  const availableRackEquipment = useMemo(() => {
    const assignedEquipmentIds = new Set(racks.map(r => r.equipment_id).filter(Boolean));
    return rackEquipment.filter(eq => !assignedEquipmentIds.has(eq.id));
  }, [rackEquipment, racks]);

  // Filter equipment by rack placement for the currently selected rack
  const { placedEquipment, unplacedEquipment } = useMemo(() => {
    if (!selectedRack) {
      return { placedEquipment: [], unplacedEquipment: [] };
    }

    // Equipment placed in the selected rack
    // Must have rack placement (either rack_id matching or legacy position)
    // Equipment moved to rooms will have rack_id and rack_position_u cleared, so they won't appear here
    const placed = equipment.filter(eq =>
      eq.rack_id === selectedRack.id ||
      (eq.rack_position_u != null && !eq.rack_id) // Legacy: equipment with position but no rack_id
    );

    // Head-end equipment not placed in any rack
    // Include equipment that:
    // - Has install_side === 'head_end', OR
    // - Is in a room that is marked as head-end (project_rooms?.is_headend === true)
    const unplaced = equipment.filter(eq =>
      eq.rack_position_u == null &&
      eq.rack_id == null &&
      (eq.install_side === 'head_end' || eq.project_rooms?.is_headend === true) &&
      // Exclude equipment that IS a rack (those are the rack enclosures themselves)
      !rackEquipment.some(re => re.id === eq.id) &&
      // Exclude equipment marked as non-rack (either on equipment OR global_part)
      !eq.exclude_from_rack &&
      !eq.global_part?.exclude_from_rack
    );

    return { placedEquipment: placed, unplacedEquipment: unplaced };
  }, [equipment, selectedRack, rackEquipment]);

  // State for U-height prompt modal
  const [uHeightPrompt, setUHeightPrompt] = useState(null);

  // Handle equipment drop on rack
  const handleEquipmentDrop = useCallback(async (equipmentId, positionU, shelfId = null, uHeight = null) => {
    if (!selectedRack) return;

    try {
      // Find the equipment to check if it has u_height
      const eq = equipment.find(e => e.id === equipmentId);
      const currentUHeight = eq?.global_part?.u_height;

      // If no u_height, prompt user to enter it
      if (!currentUHeight && !uHeight) {
        setUHeightPrompt({
          equipmentId,
          positionU,
          shelfId,
          equipmentName: eq?.global_part?.name || eq?.description || 'Equipment',
          globalPartId: eq?.global_part_id,
        });
        return;
      }

      // Update equipment position using rack_id and rack_position_u
      await projectEquipmentService.updateEquipment(equipmentId, {
        rack_id: selectedRack.id,
        rack_position_u: positionU,
        shelf_id: shelfId,
      });

      // Refresh data
      await loadData();
    } catch (err) {
      console.error('Failed to place equipment:', err);
    }
  }, [loadData, equipment, selectedRack]);

  // Handle U-height submit from prompt
  const handleUHeightSubmit = useCallback(async (uHeight) => {
    if (!uHeightPrompt || !selectedRack) return;

    try {
      const { equipmentId, positionU, shelfId, globalPartId } = uHeightPrompt;

      // Update global_parts with the u_height for future use
      if (globalPartId) {
        const { supabase } = await import('../lib/supabase');
        await supabase
          .from('global_parts')
          .update({ u_height: uHeight, is_rack_mountable: true })
          .eq('id', globalPartId);
      }

      // Update equipment position
      await projectEquipmentService.updateEquipment(equipmentId, {
        rack_id: selectedRack.id,
        rack_position_u: positionU,
        shelf_id: shelfId,
      });

      setUHeightPrompt(null);
      await loadData();
    } catch (err) {
      console.error('Failed to update u_height:', err);
    }
  }, [uHeightPrompt, loadData, selectedRack]);

  // Handle equipment move within rack
  const handleEquipmentMove = useCallback(async (equipmentId, newPositionU, shelfId = null) => {
    console.log('[handleEquipmentMove] Moving equipment:', { equipmentId, newPositionU, shelfId });
    try {
      const result = await projectEquipmentService.updateEquipment(equipmentId, {
        rack_position_u: newPositionU,
        shelf_id: shelfId,
      });
      console.log('[handleEquipmentMove] Update result:', result);
      await loadData();
    } catch (err) {
      console.error('[handleEquipmentMove] Failed to move equipment:', err);
    }
  }, [loadData]);

  // Handle equipment removal from rack
  const handleEquipmentRemove = useCallback(async (equipmentId) => {
    try {
      await projectEquipmentService.updateEquipment(equipmentId, {
        rack_id: null,
        rack_position_u: null,
        shelf_id: null,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to remove equipment from rack:', err);
    }
  }, [loadData]);

  // Handle shelf addition - returns the created shelf for auto-create shelf feature
  const handleAddShelf = useCallback(async (shelfData) => {
    try {
      const newShelf = await rackService.createShelf({
        rackId: shelfData.rackId,
        name: shelfData.name || `Shelf at U${shelfData.rackPositionU}`,
        uHeight: shelfData.uHeight || 2,
        rackPositionU: shelfData.rackPositionU,
      });
      await loadData();
      return newShelf; // Return the shelf so drop handler can add equipment to it
    } catch (err) {
      console.error('Failed to add shelf:', err);
      return null;
    }
  }, [loadData]);

  // Handle creating a new rack from equipment
  const handleCreateRack = useCallback(async (equipmentId, name, location) => {
    try {
      const newRack = await rackService.createRackFromEquipment({
        projectId,
        equipmentId,
        name,
        locationDescription: location,
      });

      setShowAddRackModal(false);
      await loadData();

      // Select the newly created rack
      setSelectedRack(newRack);
    } catch (err) {
      console.error('Failed to create rack:', err);
    }
  }, [projectId, loadData]);

  // Handle creating a manual/placeholder rack (no equipment link)
  const handleCreateManualRack = useCallback(async (name, totalU, location) => {
    try {
      const newRack = await rackService.createRack({
        projectId,
        name,
        totalU,
        locationDescription: location,
      });

      setShowAddRackModal(false);
      await loadData();

      // Select the newly created rack
      setSelectedRack(newRack);
    } catch (err) {
      console.error('Failed to create manual rack:', err);
    }
  }, [projectId, loadData]);

  // Handle editing equipment properties (e.g., U-height, shelf requirements)
  const handleEquipmentEdit = useCallback(async (equipmentId, updates) => {
    try {
      const eq = equipment.find(e => e.id === equipmentId);

      // Update global_parts with the u_height using RPC function (bypasses RLS)
      if (updates.uHeight && eq?.global_part_id) {
        const { supabase } = await import('../lib/supabase');
        const { data, error } = await supabase.rpc('update_part_rack_info', {
          p_part_id: eq.global_part_id,
          p_u_height: updates.uHeight,
          p_is_rack_mountable: true,
        });

        if (error) {
          console.error('[handleEquipmentEdit] Failed to update global_parts via RPC:', error);
          throw error;
        }
        console.log('[handleEquipmentEdit] Updated global_part via RPC:', data);
      }

      // Update shelf requirements on project_equipment AND global_parts
      if (updates.needsShelf !== undefined) {
        console.log('[handleEquipmentEdit] Saving shelf requirements:', {
          equipmentId,
          needs_shelf: updates.needsShelf,
          shelf_u_height: updates.shelfUHeight || null,
          max_items_per_shelf: updates.maxItemsPerShelf || 1,
        });

        // Update the individual equipment
        const result = await projectEquipmentService.updateEquipment(equipmentId, {
          needs_shelf: updates.needsShelf,
          shelf_u_height: updates.shelfUHeight || null,
          max_items_per_shelf: updates.maxItemsPerShelf || 1,
        });
        console.log('[handleEquipmentEdit] Shelf update result:', result);

        // Also save to global_parts as default for this part type (using RPC to bypass RLS)
        if (eq?.global_part_id) {
          const { supabase } = await import('../lib/supabase');
          const { data: rpcData, error } = await supabase.rpc('update_global_part', {
            p_part_id: eq.global_part_id,
            p_needs_shelf: updates.needsShelf,
            p_shelf_u_height: updates.shelfUHeight || null,
            p_max_items_per_shelf: updates.maxItemsPerShelf || 1,
          });

          if (error) {
            console.error('[handleEquipmentEdit] Failed to save shelf settings to global_parts:', error);
          } else {
            console.log('[handleEquipmentEdit] Shelf settings saved to global_parts for part:', eq.global_part_id, rpcData);
          }
        }
      }

      // Update power settings on global_parts
      if (updates.powerSettings && eq?.global_part_id) {
        const { supabase } = await import('../lib/supabase');
        console.log('[handleEquipmentEdit] Saving power settings:', updates.powerSettings);

        const { error } = await supabase
          .from('global_parts')
          .update({
            is_power_device: updates.powerSettings.is_power_device,
            power_outlets_provided: updates.powerSettings.power_outlets_provided,
            power_output_watts: updates.powerSettings.power_output_watts,
            ups_va_rating: updates.powerSettings.ups_va_rating,
            ups_runtime_minutes: updates.powerSettings.ups_runtime_minutes,
            power_watts: updates.powerSettings.power_watts,
            power_outlets: updates.powerSettings.power_outlets,
          })
          .eq('id', eq.global_part_id);

        if (error) {
          console.error('[handleEquipmentEdit] Failed to update power settings:', error);
          throw error;
        }
        console.log('[handleEquipmentEdit] Power settings saved successfully');
      }

      await loadData();
    } catch (err) {
      console.error('Failed to update equipment:', err);
    }
  }, [equipment, loadData]);

  // Handle moving equipment to a different room
  const handleMoveRoom = useCallback(async (equipmentId, newRoomId) => {
    try {
      console.log('[handleMoveRoom] Moving equipment', equipmentId, 'to room', newRoomId);
      await projectEquipmentService.updateEquipment(equipmentId, {
        room_id: newRoomId,
        // Moving to a room means it's no longer head-end equipment - use 'room_end' which is a valid DB value
        install_side: 'room_end',
        // Clear rack placement since it's no longer in the rack
        rack_id: null,
        rack_position_u: null,
      });
      console.log('[handleMoveRoom] Successfully moved equipment to room:', newRoomId);
      await loadData();
    } catch (err) {
      console.error('[handleMoveRoom] Failed to move equipment to room:', err);
    }
  }, [loadData]);

  // Handle excluding THIS equipment item from rack layout (individual)
  const handleEquipmentExclude = useCallback(async (equipmentId) => {
    try {
      await projectEquipmentService.updateEquipment(equipmentId, {
        exclude_from_rack: true,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to exclude equipment:', err);
    }
  }, [loadData]);

  // Handle excluding ALL equipment of this part type from rack layout (global)
  const handleEquipmentExcludeGlobal = useCallback(async (equipmentId, globalPartId) => {
    try {
      const { supabase } = await import('../lib/supabase');

      // Find the equipment to get its part_number/model for matching
      const eq = equipment.find(e => e.id === equipmentId);
      const partNumber = eq?.part_number;
      const model = eq?.model;

      // Update the global_part so ALL equipment of this type is excluded
      if (globalPartId) {
        await supabase
          .from('global_parts')
          .update({ exclude_from_rack: true })
          .eq('id', globalPartId);
      }

      // Also update ALL project_equipment with the same part_number in this project
      // This handles cases where equipment isn't linked to a global_part
      if (partNumber) {
        await supabase
          .from('project_equipment')
          .update({ exclude_from_rack: true })
          .eq('project_id', projectId)
          .eq('part_number', partNumber);
      } else if (model) {
        // Fallback to model if no part_number
        await supabase
          .from('project_equipment')
          .update({ exclude_from_rack: true })
          .eq('project_id', projectId)
          .eq('model', model);
      } else {
        // Just update the single item
        await projectEquipmentService.updateEquipment(equipmentId, {
          exclude_from_rack: true,
        });
      }

      await loadData();
    } catch (err) {
      console.error('Failed to exclude equipment globally:', err);
    }
  }, [loadData, equipment, projectId]);

  // Handle moving a shelf to a new position (equipment on the shelf moves with it)
  const handleShelfMove = useCallback(async (shelfId, newPositionU) => {
    try {
      console.log('[handleShelfMove] Moving shelf:', shelfId, 'to U:', newPositionU);
      const result = await rackService.updateShelf(shelfId, { rack_position_u: newPositionU });
      console.log('[handleShelfMove] Update result:', result);
      await loadData();
      console.log('[handleShelfMove] Data reloaded');
    } catch (err) {
      console.error('[handleShelfMove] Failed to move shelf:', err);
    }
  }, [loadData]);

  // Handle deleting a shelf (equipment on it becomes unplaced)
  const handleShelfDelete = useCallback(async (shelfId) => {
    try {
      console.log('[handleShelfDelete] Deleting shelf:', shelfId);

      // First, unlink all equipment from this shelf
      const { supabase } = await import('../lib/supabase');
      await supabase
        .from('project_equipment')
        .update({ shelf_id: null, rack_id: null, rack_position_u: null })
        .eq('shelf_id', shelfId);

      // Then delete the shelf
      await rackService.deleteShelf(shelfId);
      await loadData();
    } catch (err) {
      console.error('[handleShelfDelete] Failed to delete shelf:', err);
    }
  }, [loadData]);

  // Handle dropping equipment onto a shelf
  const handleEquipmentDropOnShelf = useCallback(async (equipmentId, shelfId) => {
    try {
      console.log('[handleEquipmentDropOnShelf] Placing equipment:', equipmentId, 'on shelf:', shelfId);

      // Find the shelf to get its rack_id and position
      const shelf = selectedRack?.shelves?.find(s => s.id === shelfId);
      if (!shelf) {
        console.error('[handleEquipmentDropOnShelf] Shelf not found:', shelfId);
        return;
      }

      const { supabase } = await import('../lib/supabase');
      await supabase
        .from('project_equipment')
        .update({
          rack_id: shelf.rack_id,
          rack_position_u: shelf.rack_position_u,
          shelf_id: shelfId,
        })
        .eq('id', equipmentId);

      await loadData();
    } catch (err) {
      console.error('[handleEquipmentDropOnShelf] Failed:', err);
    }
  }, [loadData, selectedRack]);

  // Get current rack data (selected rack or default)
  const currentRack = useMemo(() => {
    if (selectedRack) {
      return {
        ...selectedRack,
        total_u: selectedRack.total_u || selectedRack.equipment?.global_part?.u_height || 42,
        shelves: selectedRack.shelves || [],
      };
    }
    return { total_u: 42, shelves: [] };
  }, [selectedRack]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={loadData} variant="primary">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'}`}>
      <div className="w-full px-2 sm:px-4 py-4 sm:py-6">
        {/* Project Name */}
        <div className="flex items-center gap-4 mb-6">
          <span
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{
              backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
              color: styles.textPrimary,
            }}
          >
            {project?.name || 'Project'}
          </span>
        </div>

        {/* No Rack Selected State */}
        {!selectedRack && racks.length === 0 && (
          <div
            className="rounded-2xl border p-12 text-center"
            style={styles.card}
          >
            <Server size={48} className="mx-auto mb-4 text-violet-500 opacity-50" />
            <h2
              className="text-xl font-semibold mb-2"
              style={{ color: styles.textPrimary }}
            >
              No Racks Configured
            </h2>
            <p
              className="mb-6 max-w-md mx-auto"
              style={{ color: styles.textSecondary }}
            >
              Start by adding a rack from your equipment list. Select the rack enclosure
              (e.g., "42U Floor Rack" or "12U Wall Mount") to create a rack layout.
            </p>
            <Button
              onClick={() => setShowAddRackModal(true)}
              variant="primary"
              icon={Plus}
            >
              Add First Rack
            </Button>
          </div>
        )}

        {/* Main Content - Only show if a rack is selected */}
        {selectedRack && (
          <>
            {/* Header Row: View Tabs + Layout Toggle + Stats */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              {/* Front/Back View Tabs */}
              <div className="flex gap-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setActiveView('front')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'front'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Server size={14} />
                  Front
                </button>
                <button
                  onClick={() => setActiveView('back')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'back'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <RotateCcw size={14} />
                  Back
                </button>
              </div>

              {/* Physical/Functional Toggle */}
              <div className="flex gap-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setLayoutMode('physical')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    layoutMode === 'physical'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Physical
                </button>
                <button
                  onClick={() => setLayoutMode('functional')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    layoutMode === 'functional'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Functional
                </button>
              </div>

              {/* Equipment Stats - Compact Horizontal */}
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm ml-auto">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">Parts:</span>
                  <span className="font-semibold" style={{ color: styles.textPrimary }}>
                    {equipment.filter(e => e.install_side === 'head_end').length}
                  </span>
                </div>
                <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">Placed:</span>
                  <span className="font-semibold text-green-500">{placedEquipment.length}</span>
                </div>
                <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">Unplaced:</span>
                  <span className="font-semibold text-yellow-500">{unplacedEquipment.length}</span>
                </div>
              </div>
            </div>

            {/* Rack View */}
            <div
              className="rounded-2xl border p-6"
              style={styles.card}
            >
              {activeView === 'front' && (
                <RackFrontView
                  rack={currentRack}
                  racks={racks}
                  selectedRackId={selectedRack?.id}
                  onRackSelect={(rack) => setSelectedRack(rack)}
                  onAddRack={() => setShowAddRackModal(true)}
                  equipment={placedEquipment}
                  unplacedEquipment={unplacedEquipment}
                  projectId={projectId}
                  haClients={haClients}
                  haDevices={haDevices}
                  layoutMode={layoutMode}
                  onEquipmentDrop={handleEquipmentDrop}
                  onEquipmentMove={handleEquipmentMove}
                  onEquipmentRemove={handleEquipmentRemove}
                  onEquipmentEdit={handleEquipmentEdit}
                  onEquipmentExclude={handleEquipmentExclude}
                  onEquipmentExcludeGlobal={handleEquipmentExcludeGlobal}
                  onEquipmentDropOnShelf={handleEquipmentDropOnShelf}
                  onMoveRoom={handleMoveRoom}
                  onLinkToHA={handleLinkToHA}
                  onAddShelf={handleAddShelf}
                  onShelfMove={handleShelfMove}
                  onShelfDelete={handleShelfDelete}
                  getNetworkInfo={getNetworkInfo}
                />
              )}
              {activeView === 'back' && (
                <RackBackView
                  rack={currentRack}
                  racks={racks}
                  selectedRackId={selectedRack?.id}
                  onRackSelect={(rack) => setSelectedRack(rack)}
                  onAddRack={() => setShowAddRackModal(true)}
                  equipment={placedEquipment}
                  unplacedEquipment={unplacedEquipment}
                  haClients={haClients}
                  haDevices={haDevices}
                  layoutMode={layoutMode}
                  onEquipmentDrop={handleEquipmentDrop}
                  onEquipmentMove={handleEquipmentMove}
                  onEquipmentRemove={handleEquipmentRemove}
                  onEquipmentEdit={handleEquipmentEdit}
                  onEquipmentExclude={handleEquipmentExclude}
                  onEquipmentExcludeGlobal={handleEquipmentExcludeGlobal}
                  onEquipmentDropOnShelf={handleEquipmentDropOnShelf}
                  onMoveRoom={handleMoveRoom}
                  onLinkToHA={handleLinkToHA}
                  onAddShelf={handleAddShelf}
                  onShelfMove={handleShelfMove}
                  onShelfDelete={handleShelfDelete}
                  getNetworkInfo={getNetworkInfo}
                />
              )}
            </div>
          </>
        )}

        {/* U-Height Prompt Modal */}
        {uHeightPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              className="rounded-xl border p-6 max-w-md w-full mx-4 shadow-xl"
              style={styles.card}
            >
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: styles.textPrimary }}
              >
                Enter Equipment Size
              </h3>
              <p
                className="mb-4"
                style={{ color: styles.textSecondary }}
              >
                <span className="font-medium" style={{ color: styles.textPrimary }}>
                  {uHeightPrompt.equipmentName}
                </span>
                {' '}doesn't have a rack size specified. Please enter the U-height (rack units) for this equipment.
              </p>
              <p
                className="text-sm mb-4"
                style={{ color: styles.textSecondary }}
              >
                This will be saved to the parts database for future use.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  const uHeight = parseInt(formData.get('uHeight'), 10);
                  if (uHeight >= 1 && uHeight <= 20) {
                    handleUHeightSubmit(uHeight);
                  }
                }}
              >
                <div className="mb-4">
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: styles.textSecondary }}
                  >
                    U-Height (Rack Units)
                  </label>
                  <input
                    type="number"
                    name="uHeight"
                    min="1"
                    max="20"
                    defaultValue="1"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      mode === 'dark'
                        ? 'bg-zinc-800 border-zinc-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-violet-500`}
                    autoFocus
                  />
                  <p
                    className="text-xs mt-1"
                    style={{ color: styles.textSecondary }}
                  >
                    1U = 1.75 inches. Most servers are 1U-4U. Network switches are typically 1U.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition font-medium"
                  >
                    Place Equipment
                  </button>
                  <button
                    type="button"
                    onClick={() => setUHeightPrompt(null)}
                    className={`flex-1 px-4 py-2 rounded-lg transition font-medium ${
                      mode === 'dark'
                        ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Rack Modal */}
        {showAddRackModal && (
          <AddRackModal
            styles={styles}
            mode={mode}
            availableRackEquipment={availableRackEquipment}
            onClose={() => setShowAddRackModal(false)}
            onSubmit={handleCreateRack}
            onSubmitManual={handleCreateManualRack}
          />
        )}
      </div>
    </div>
  );
};

/**
 * AddRackModal - Modal for creating a new rack from equipment or manually
 */
const AddRackModal = ({ styles, mode, availableRackEquipment, onClose, onSubmit, onSubmitManual }) => {
  const [createMode, setCreateMode] = useState('equipment'); // 'equipment' or 'manual'
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [rackName, setRackName] = useState('');
  const [location, setLocation] = useState('');
  const [manualUHeight, setManualUHeight] = useState(42);

  // Get the selected equipment to show its details
  const selectedEquipment = availableRackEquipment.find(e => e.id === selectedEquipmentId);
  const suggestedU = selectedEquipment?.global_part?.u_height || 42;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (createMode === 'equipment') {
      if (!selectedEquipmentId) return;
      onSubmit(selectedEquipmentId, rackName || undefined, location || undefined);
    } else {
      // Manual mode - name is required
      if (!rackName.trim()) return;
      onSubmitManual(rackName.trim(), manualUHeight, location || undefined);
    }
  };

  const commonRackSizes = [10, 12, 15, 18, 22, 24, 42, 45, 48];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="rounded-xl border p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
        style={styles.card}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: styles.textPrimary }}
        >
          Add New Rack
        </h3>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setCreateMode('equipment')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              createMode === 'equipment'
                ? 'bg-violet-600 text-white'
                : mode === 'dark'
                  ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            From Equipment List
          </button>
          <button
            type="button"
            onClick={() => setCreateMode('manual')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              createMode === 'manual'
                ? 'bg-violet-600 text-white'
                : mode === 'dark'
                  ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Manual / Placeholder
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {createMode === 'equipment' ? (
            <>
              <p
                className="mb-4 text-sm"
                style={{ color: styles.textSecondary }}
              >
                Select a rack from your equipment list. The rack size will be determined from the equipment specs.
              </p>

              {/* Equipment Selector */}
              <div className="mb-4">
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: styles.textSecondary }}
                >
                  Select Rack Equipment *
                </label>
                {availableRackEquipment.length > 0 ? (
                  <select
                    value={selectedEquipmentId}
                    onChange={(e) => setSelectedEquipmentId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      mode === 'dark'
                        ? 'bg-zinc-800 border-zinc-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-violet-500`}
                    required={createMode === 'equipment'}
                  >
                    <option value="">-- Select rack --</option>
                    {availableRackEquipment.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.global_part?.name || eq.description}
                        {eq.global_part?.u_height ? ` (${eq.global_part.u_height}U)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    className={`px-3 py-4 rounded-lg border text-center ${
                      mode === 'dark' ? 'bg-zinc-800 border-zinc-600' : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <p style={{ color: styles.textSecondary }}>
                      No rack equipment found in your equipment list.
                    </p>
                    <p className="text-sm mt-1" style={{ color: styles.textSecondary }}>
                      Switch to "Manual / Placeholder" mode to create a rack without an equipment link.
                    </p>
                  </div>
                )}
              </div>

              {/* Show selected equipment details */}
              {selectedEquipment && (
                <div
                  className={`mb-4 p-3 rounded-lg ${
                    mode === 'dark' ? 'bg-zinc-800' : 'bg-gray-50'
                  }`}
                >
                  <div className="text-sm" style={{ color: styles.textSecondary }}>
                    <strong>Rack Size:</strong> {suggestedU}U
                  </div>
                  {selectedEquipment.global_part?.manufacturer && (
                    <div className="text-sm" style={{ color: styles.textSecondary }}>
                      <strong>Manufacturer:</strong> {selectedEquipment.global_part.manufacturer}
                    </div>
                  )}
                  {selectedEquipment.global_part?.model && (
                    <div className="text-sm" style={{ color: styles.textSecondary }}>
                      <strong>Model:</strong> {selectedEquipment.global_part.model}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p
                className="mb-4 text-sm"
                style={{ color: styles.textSecondary }}
              >
                Create a placeholder rack manually. You can link it to equipment later when it's added to the project.
              </p>

              {/* Manual U-Height */}
              <div className="mb-4">
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: styles.textSecondary }}
                >
                  Rack Size (U-Height) *
                </label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {commonRackSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setManualUHeight(size)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        manualUHeight === size
                          ? 'bg-violet-600 text-white'
                          : mode === 'dark'
                            ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {size}U
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={manualUHeight}
                  onChange={(e) => setManualUHeight(parseInt(e.target.value) || 42)}
                  min="1"
                  max="50"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    mode === 'dark'
                      ? 'bg-zinc-800 border-zinc-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-violet-500`}
                />
                <p className="text-xs mt-1" style={{ color: styles.textSecondary }}>
                  Common sizes: 42U (full), 24U (half), 12U (wall mount)
                </p>
              </div>
            </>
          )}

          {/* Rack Name */}
          <div className="mb-4">
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: styles.textSecondary }}
            >
              Rack Name {createMode === 'manual' ? '*' : '(optional)'}
            </label>
            <input
              type="text"
              value={rackName}
              onChange={(e) => setRackName(e.target.value)}
              placeholder="e.g., Main Rack, Media Closet, Garage IDF"
              required={createMode === 'manual'}
              className={`w-full px-3 py-2 rounded-lg border ${
                mode === 'dark'
                  ? 'bg-zinc-800 border-zinc-600 text-white placeholder-zinc-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-violet-500`}
            />
          </div>

          {/* Location */}
          <div className="mb-6">
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: styles.textSecondary }}
            >
              Location Description (optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Utility closet under stairs, Garage north wall"
              className={`w-full px-3 py-2 rounded-lg border ${
                mode === 'dark'
                  ? 'bg-zinc-800 border-zinc-600 text-white placeholder-zinc-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-violet-500`}
            />
          </div>

          {/* Placeholder notice */}
          {createMode === 'manual' && (
            <div
              className={`mb-4 p-3 rounded-lg border border-dashed ${
                mode === 'dark' ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-yellow-400 bg-yellow-50'
              }`}
            >
              <p className="text-sm" style={{ color: mode === 'dark' ? '#EAB308' : '#CA8A04' }}>
                <strong>Note:</strong> This creates a placeholder rack. You can link it to equipment later
                when the rack is added to your project's equipment list.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMode === 'equipment' ? !selectedEquipmentId : !rackName.trim()}
              className={`flex-1 bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 transition font-medium ${
                (createMode === 'equipment' ? !selectedEquipmentId : !rackName.trim())
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              {createMode === 'manual' ? 'Create Placeholder Rack' : 'Create Rack'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg transition font-medium ${
                mode === 'dark'
                  ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RackLayoutPage;
