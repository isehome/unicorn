import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Server, RotateCcw, Zap, Loader, RefreshCw, Plus, ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { projectsService } from '../services/supabaseService';
import * as rackService from '../services/rackService';
import Button from '../components/ui/Button';
import RackFrontView from '../components/Rack/RackFrontView';
import RackBackView from '../components/Rack/RackBackView';
import RackPowerView from '../components/Rack/RackPowerView';

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
  const [refreshing, setRefreshing] = useState(false);

  // Rack management state
  const [racks, setRacks] = useState([]); // All racks for this project
  const [selectedRack, setSelectedRack] = useState(null); // Currently selected rack
  const [rackEquipment, setRackEquipment] = useState([]); // Equipment that IS a rack (for creating new racks)
  const [showRackSelector, setShowRackSelector] = useState(false);
  const [showAddRackModal, setShowAddRackModal] = useState(false);

  // View state
  const [activeView, setActiveView] = useState('front'); // 'front', 'back', 'power'

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

      // Auto-select first rack if available
      if (racksData?.length > 0 && !selectedRack) {
        setSelectedRack(racksData[0]);
      }

    } catch (err) {
      console.error('Failed to load rack layout data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedRack]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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
    const placed = equipment.filter(eq =>
      eq.rack_id === selectedRack.id ||
      (eq.rack_position_u != null && !eq.rack_id) // Legacy: equipment with position but no rack_id
    );

    // Head-end equipment not placed in any rack
    const unplaced = equipment.filter(eq =>
      eq.rack_position_u == null &&
      eq.rack_id == null &&
      eq.install_side === 'head_end' &&
      // Exclude equipment that IS a rack (those are the rack enclosures themselves)
      !rackEquipment.some(re => re.id === eq.id) &&
      // Exclude equipment marked as non-rack equipment
      !eq.exclude_from_rack
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
    try {
      await projectEquipmentService.updateEquipment(equipmentId, {
        rack_position_u: newPositionU,
        shelf_id: shelfId,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to move equipment:', err);
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

  // Handle shelf addition
  const handleAddShelf = useCallback(async (shelfData) => {
    // TODO: Implement shelf management
    console.log('Add shelf:', shelfData);
  }, []);

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

      // Update shelf requirements on project_equipment
      if (updates.needsShelf !== undefined) {
        await projectEquipmentService.updateEquipment(equipmentId, {
          needs_shelf: updates.needsShelf,
          shelf_u_height: updates.shelfUHeight || null,
        });
        console.log('[handleEquipmentEdit] Updated shelf requirements:', { needsShelf: updates.needsShelf, shelfUHeight: updates.shelfUHeight });
      }

      await loadData();
    } catch (err) {
      console.error('Failed to update equipment:', err);
    }
  }, [equipment, loadData]);

  // Handle moving equipment to a different room
  const handleMoveRoom = useCallback(async (equipmentId, newRoomId) => {
    try {
      await projectEquipmentService.updateEquipment(equipmentId, {
        room_id: newRoomId,
        // Moving to a room means it's no longer head-end equipment
        install_side: 'room',
      });
      console.log('[handleMoveRoom] Moved equipment to room:', newRoomId);
      await loadData();
    } catch (err) {
      console.error('Failed to move equipment to room:', err);
    }
  }, [loadData]);

  // Handle excluding equipment from rack layout
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
        {/* Project Name & Controls */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {/* Project badge */}
            <span
              className="text-sm px-3 py-1.5 rounded-lg font-medium"
              style={{
                backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                color: styles.textPrimary,
              }}
            >
              {project?.name || 'Project'}
            </span>

            {/* Rack Selector */}
            <div className="relative">
            <button
              onClick={() => setShowRackSelector(!showRackSelector)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                mode === 'dark'
                  ? 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'
                  : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Server size={18} className="text-violet-500" />
              <span className="font-medium">
                {selectedRack?.name || 'Select Rack'}
              </span>
              {selectedRack && (
                <span className="text-sm opacity-70">
                  ({currentRack.total_u}U)
                </span>
              )}
              <ChevronDown size={16} className="opacity-50" />
            </button>

            {/* Rack Dropdown */}
            {showRackSelector && (
              <div
                className={`absolute top-full left-0 mt-1 w-72 rounded-lg border shadow-xl z-50 ${
                  mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'
                }`}
              >
                {racks.length > 0 ? (
                  <div className="py-1">
                    {racks.map((rack) => (
                      <button
                        key={rack.id}
                        onClick={() => {
                          setSelectedRack(rack);
                          setShowRackSelector(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          selectedRack?.id === rack.id
                            ? 'bg-violet-500/20 text-violet-400'
                            : mode === 'dark'
                              ? 'hover:bg-zinc-700 text-white'
                              : 'hover:bg-gray-100 text-gray-900'
                        }`}
                      >
                        <Server size={16} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{rack.name}</div>
                          <div className="text-xs opacity-70 truncate">
                            {rack.total_u}U • {rack.location_description || 'No location'}
                          </div>
                        </div>
                        {selectedRack?.id === rack.id && (
                          <Check size={16} className="text-violet-400" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-center" style={{ color: styles.textSecondary }}>
                    No racks configured yet
                  </div>
                )}
                <div className="border-t border-zinc-700">
                  <button
                    onClick={() => {
                      setShowRackSelector(false);
                      setShowAddRackModal(true);
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-left transition-colors ${
                      mode === 'dark'
                        ? 'hover:bg-zinc-700 text-violet-400'
                        : 'hover:bg-gray-100 text-violet-600'
                    }`}
                  >
                    <Plus size={16} />
                    <span className="font-medium">Add New Rack</span>
                  </button>
                </div>
              </div>
            )}
            </div>

            {/* Rack count badge */}
            <span
              className="text-sm px-2 py-1 rounded-full"
              style={{
                backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                color: styles.textSecondary,
              }}
            >
              {racks.length} rack{racks.length !== 1 ? 's' : ''} configured
            </span>
          </div>

          {/* Refresh button */}
          <Button
            onClick={handleRefresh}
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
          >
            Refresh
          </Button>
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
            {/* View Toggle Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveView('front')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeView === 'front'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <Server size={18} />
                Front View
              </button>
              <button
                onClick={() => setActiveView('back')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeView === 'back'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <RotateCcw size={18} />
                Back View
              </button>
              <button
                onClick={() => setActiveView('power')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeView === 'power'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                <Zap size={18} />
                Power View
              </button>
            </div>

            {/* Equipment Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div
                className="rounded-xl border p-4"
                style={styles.card}
              >
                <p className="text-sm" style={{ color: styles.textSecondary }}>Total Equipment</p>
                <p className="text-2xl font-semibold" style={{ color: styles.textPrimary }}>
                  {equipment.filter(e => e.install_side === 'head_end').length}
                </p>
              </div>
              <div
                className="rounded-xl border p-4"
                style={styles.card}
              >
                <p className="text-sm" style={{ color: styles.textSecondary }}>In This Rack</p>
                <p className="text-2xl font-semibold text-green-500">
                  {placedEquipment.length}
                </p>
              </div>
              <div
                className="rounded-xl border p-4"
                style={styles.card}
              >
                <p className="text-sm" style={{ color: styles.textSecondary }}>Unplaced</p>
                <p className="text-2xl font-semibold text-yellow-500">
                  {unplacedEquipment.length}
                </p>
              </div>
              <div
                className="rounded-xl border p-4"
                style={styles.card}
              >
                <p className="text-sm" style={{ color: styles.textSecondary }}>Rack Size</p>
                <p className="text-2xl font-semibold" style={{ color: styles.textPrimary }}>
                  {currentRack.total_u}U
                </p>
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
                  equipment={placedEquipment}
                  unplacedEquipment={unplacedEquipment}
                  projectId={projectId}
                  onEquipmentDrop={handleEquipmentDrop}
                  onEquipmentMove={handleEquipmentMove}
                  onEquipmentRemove={handleEquipmentRemove}
                  onEquipmentEdit={handleEquipmentEdit}
                  onEquipmentExclude={handleEquipmentExclude}
                  onMoveRoom={handleMoveRoom}
                  onAddShelf={handleAddShelf}
                  onRefresh={handleRefresh}
                />
              )}
              {activeView === 'back' && (
                <RackBackView
                  rack={currentRack}
                  equipment={placedEquipment}
                  onRefresh={handleRefresh}
                />
              )}
              {activeView === 'power' && (
                <RackPowerView
                  rack={currentRack}
                  equipment={placedEquipment}
                  onRefresh={handleRefresh}
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
