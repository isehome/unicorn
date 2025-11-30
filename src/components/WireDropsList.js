import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { Search, Plus, Loader, Trash2, Printer, CheckSquare, Square, AlertTriangle, RefreshCw } from 'lucide-react';
import { wireDropService } from '../services/wireDropService';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';
import labelRenderService from '../services/labelRenderService';
import { usePrinter } from '../contexts/PrinterContext';

const WireDropsList = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const sectionStyles = enhancedStyles.sections[mode];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [allDrops, setAllDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [showFloorFilter, setShowFloorFilter] = useState(false);
  const [deletingDropId, setDeletingDropId] = useState(null);

  // Bulk selection states
  const [selectedDropIds, setSelectedDropIds] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Printer states from context
  const { connected: printerConnected, printLabel: printerPrintLabel } = usePrinter();
  const [printingDropId, setPrintingDropId] = useState(null);

  // Reload data on mount and whenever we return to this page
  useEffect(() => {
    loadWireDrops();

    // Also reload when navigating back to this page or window regains focus
    const handleFocus = () => {
      loadWireDrops();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadWireDrops();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [projectId]); // Reload whenever projectId changes OR component remounts

  const loadWireDrops = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build the query
      let query = supabase
        .from('wire_drops')
        .select(`
          *,
          projects(name, id),
          wire_drop_stages(
            stage_type,
            completed,
            completed_at,
            completed_by,
            photo_url,
            notes
          )
        `)
        .order('uid');

      // Filter by project if specified
      if (projectId) {
        query = query.eq('project_id', projectId);

        // Also load project info for the header
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('name, id')
          .eq('id', projectId)
          .single();

        if (projectError) {
          console.error('Error loading project:', projectError);
        } else {
          setProject(projectData);
        }
      }

      const { data, error: wireDropsError } = await query;

      if (wireDropsError) throw wireDropsError;

      const normalizedDrops = (data || []).map((drop) => {
        if (drop.shape_data && typeof drop.shape_data === 'string') {
          try {
            return { ...drop, shape_data: JSON.parse(drop.shape_data) };
          } catch {
            return drop;
          }
        }
        if (!drop.shape_data && drop.notes) {
          try {
            const parsed = JSON.parse(drop.notes);
            if (parsed && typeof parsed === 'object') {
              return { ...drop, shape_data: parsed };
            }
          } catch {
            return drop;
          }
        }
        return drop;
      });

      setAllDrops(normalizedDrops);
    } catch (err) {
      console.error('Failed to load wire drops:', err);
      setError(err.message || 'Failed to load wire drops');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintSingleLabel = async (wireDrop, e) => {
    e.stopPropagation(); // Prevent navigation to detail view

    if (!printerConnected) {
      alert('Please connect to printer in Settings first');
      return;
    }

    setPrintingDropId(wireDrop.id);

    try {
      // Generate label bitmap
      const bitmap = await labelRenderService.generateWireDropLabelBitmap(wireDrop);

      // Print 2 copies from list view, cut after each label
      await printerPrintLabel(bitmap, 2, true);

      console.log(`Successfully printed 2 labels for ${wireDrop.uid}`);
      alert(`Successfully printed 2 labels for ${wireDrop.uid}`);
    } catch (err) {
      console.error('Print error:', err);
      alert(`Print failed: ${err.message}`);
    } finally {
      setPrintingDropId(null);
    }
  };

  const getDropCompletion = (drop) => {
    // Use wire_drop_stages array to check completion status
    const stages = drop.wire_drop_stages || [];

    const prewireStage = stages.find(s => s.stage_type === 'prewire');
    const trimOutStage = stages.find(s => s.stage_type === 'trim_out');
    const commissionStage = stages.find(s => s.stage_type === 'commission');

    const prewireComplete = Boolean(prewireStage?.completed);
    const installComplete = Boolean(trimOutStage?.completed);
    const commissionComplete = Boolean(commissionStage?.completed);

    // Calculate percentage (33.33% per stage for 3 stages)
    let completion = 0;
    if (prewireComplete) completion += 33.33;
    if (installComplete) completion += 33.33;
    if (commissionComplete) completion += 33.34;
    completion = Math.round(completion);

    return {
      percentage: completion,
      prewireComplete,
      installComplete,
      commissionComplete
    };
  };

  // Get unique floors for filtering
  const availableFloors = useMemo(() => {
    const floors = new Set();
    allDrops.forEach(drop => {
      if (drop.floor) floors.add(drop.floor);
    });
    return Array.from(floors).sort();
  }, [allDrops]);

  const filteredDrops = useMemo(() => {
    let filtered = allDrops;

    // Apply floor filter
    if (selectedFloor) {
      filtered = filtered.filter(drop => drop.floor === selectedFloor);
    }

    // Apply search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter(drop =>
        [drop.name, drop.room_name, drop.location, drop.type, drop.projects?.name]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allDrops, searchTerm, selectedFloor]);

  const handleAddWireDrop = () => {
    navigate(`/wire-drops/new${projectId ? `?project=${projectId}` : ''}`);
  };

  const handleDeleteDrop = async (event, dropId) => {
    event.stopPropagation();
    if (!dropId) return;
    const confirmed = window.confirm('Delete this wire drop? This action cannot be undone.');
    if (!confirmed) return;

    try {
      setDeletingDropId(dropId);
      await wireDropService.deleteWireDrop(dropId);
      setAllDrops((prev) => prev.filter((drop) => drop.id !== dropId));
    } catch (err) {
      console.error('Failed to delete wire drop:', err);
      alert(err.message || 'Failed to delete wire drop');
    } finally {
      setDeletingDropId(null);
    }
  };

  const handleToggleSelect = (dropId, event) => {
    event.stopPropagation();
    setSelectedDropIds(prev =>
      prev.includes(dropId)
        ? prev.filter(id => id !== dropId)
        : [...prev, dropId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDropIds.length === filteredDrops.length) {
      setSelectedDropIds([]);
    } else {
      setSelectedDropIds(filteredDrops.map(drop => drop.id));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    let successCount = 0;
    let failedDrops = [];

    for (const dropId of selectedDropIds) {
      try {
        await wireDropService.deleteWireDrop(dropId);
        successCount++;
      } catch (err) {
        console.error(`Failed to delete wire drop ${dropId}:`, err);
        failedDrops.push(dropId);
      }
    }

    if (successCount > 0) {
      setAllDrops(prev => prev.filter(drop => !selectedDropIds.includes(drop.id) || failedDrops.includes(drop.id)));
      setSelectedDropIds(failedDrops);
    }

    if (failedDrops.length > 0) {
      alert(`Successfully deleted ${successCount} wire drops. Failed to delete ${failedDrops.length} wire drops.`);
    } else {
      alert(`Successfully deleted ${successCount} wire drops.`);
    }

    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
  };

  // --- MIGRATION TOOL: Normalize Drop Names ---
  const [normalizing, setNormalizing] = useState(false);

  const normalizeAllDropNames = async () => {
    // If no projectId from URL, try to derive it from the filtered list
    // We only allow this if exactly ONE project is visible to avoid accidents
    let targetProjectId = projectId;

    if (!targetProjectId) {
      const uniqueProjects = new Set(filteredDrops.map(d => d.project_id).filter(Boolean));
      if (uniqueProjects.size === 1) {
        targetProjectId = Array.from(uniqueProjects)[0];
      } else if (uniqueProjects.size > 1) {
        alert('Please filter the list to a single project before running this tool.');
        return;
      } else {
        alert('No project found to normalize.');
        return;
      }
    }

    if (!targetProjectId) return;

    const confirmed = window.confirm(
      'This will update generic wire drop names (e.g. "IP", "AP") to the standard "Room Type Number" format.\n\nCustom names you have manually edited will be PRESERVED.\n\nAre you sure?'
    );
    if (!confirmed) return;

    setNormalizing(true);
    try {
      // 1. Fetch ALL drops for this project
      const { data: drops, error } = await supabase
        .from('wire_drops')
        .select(`
          id, 
          drop_name, 
          room_name, 
          drop_type,
          project_rooms(name)
        `)
        .eq('project_id', targetProjectId)
        .order('uid');

      if (error) throw error;

      // 2. Calculate new names (Logic from ProjectDetailView.js)
      const roomDropTypeCounts = {};
      const dropNumbers = {};

      // Pass 1: Count types per room
      drops.forEach((drop) => {
        const roomName = drop.project_rooms?.name || drop.room_name || 'Unknown Room';
        const dropType = drop.drop_type || 'Drop';
        const key = `${roomName}:::${dropType}`;

        if (!roomDropTypeCounts[key]) {
          roomDropTypeCounts[key] = [];
        }
        roomDropTypeCounts[key].push(drop.id);
      });

      // Pass 2: Assign numbers
      drops.forEach((drop) => {
        const roomName = drop.project_rooms?.name || drop.room_name || 'Unknown Room';
        const dropType = drop.drop_type || 'Drop';
        const key = `${roomName}:::${dropType}`;

        const dropsOfSameType = roomDropTypeCounts[key];
        const dropIndex = dropsOfSameType.indexOf(drop.id);

        // Only add number if there's more than one drop of this type in the room
        dropNumbers[drop.id] = dropsOfSameType.length > 1 ? dropIndex + 1 : 0;
      });

      // 3. Update records with UNIQUENESS CHECK
      let updatedCount = 0;
      const usedNames = new Set();

      // First, populate usedNames with names we are NOT changing (custom names)
      // We need to do this in two passes or be careful. 
      // Simplest approach: Calculate ALL intended names first, then resolve conflicts.

      const dropsToUpdate = [];

      for (const drop of drops) {
        const roomName = drop.project_rooms?.name || drop.room_name || 'Unknown Room';
        const dropType = drop.drop_type || 'Drop';
        const dropNumber = dropNumbers[drop.id];

        // Check if generic
        const isGeneric = !drop.drop_name ||
          ['IP', 'AP', 'WAP', 'Data'].includes(drop.drop_name) ||
          drop.drop_name === drop.drop_type ||
          drop.drop_name.trim() === '';

        let intendedName;
        if (isGeneric) {
          intendedName = dropNumber > 0
            ? `${roomName} ${dropType} ${dropNumber}`
            : `${roomName} ${dropType}`;
        } else {
          intendedName = drop.drop_name;
        }

        dropsToUpdate.push({ drop, intendedName, isGeneric });
      }

      // Resolve collisions
      for (const item of dropsToUpdate) {
        let finalName = item.intendedName;
        let counter = 1;

        // If name is taken, append/increment counter until unique
        while (usedNames.has(finalName.toLowerCase())) {
          // If it already has a number at the end, increment it? 
          // Or just append a new number? 
          // Simple approach: Append " (X)" or just increment if it looks like a counter.
          // Let's just append a counter for safety to ensure uniqueness.
          finalName = `${item.intendedName} ${counter}`;
          counter++;
        }

        usedNames.add(finalName.toLowerCase());

        // Only update if it changed from the DB value
        if (item.drop.drop_name !== finalName) {
          await wireDropService.updateWireDrop(item.drop.id, { drop_name: finalName });
          updatedCount++;
        }
      }

      alert(`Normalization complete! Updated ${updatedCount} wire drops.`);
      loadWireDrops(); // Reload list
    } catch (err) {
      console.error('Normalization failed:', err);
      alert(`Normalization failed: ${err.message}`);
    } finally {
      setNormalizing(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-rose-500 dark:text-rose-300">{error}</p>
          {/* Error state - user will use app bar back button */}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div className="w-full px-3 sm:px-4 py-6">
        <div style={sectionStyles.card}>
          {/* Bulk actions bar */}
          {selectedDropIds.length > 0 && (
            <div className="mb-4 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
                {selectedDropIds.length} wire drop{selectedDropIds.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDropIds([])}
                >
                  Clear Selection
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkDeleting}
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          )}

          {/* Admin / Migration Tools */}
          {(projectId || filteredDrops.length > 0) && (
            <div className="mb-4 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={normalizeAllDropNames}
                loading={normalizing}
                disabled={normalizing}
                className="text-xs"
              >
                Fix All Drop Names
              </Button>
            </div>
          )}

          <div className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, room, location, or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {availableFloors.length > 0 && (
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
              >
                <option value="">All Floors</option>
                {availableFloors.map(floor => (
                  <option key={floor} value={floor}>{floor}</option>
                ))}
              </select>
            )}
            {filteredDrops.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={selectedDropIds.length === filteredDrops.length ? CheckSquare : Square}
                onClick={handleSelectAll}
              >
                {selectedDropIds.length === filteredDrops.length ? 'Deselect All' : 'Select All'}
              </Button>
            )}
            <Button variant="primary" size="sm" icon={Plus} onClick={handleAddWireDrop}>
              Add
            </Button>
          </div>

          {filteredDrops.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchTerm
                  ? 'No wire drops match your search.'
                  : allDrops.length === 0
                    ? 'No wire drops found.'
                    : 'No wire drops match your search.'
                }
              </p>
              {allDrops.length === 0 && (
                <Button variant="primary" icon={Plus} onClick={handleAddWireDrop}>
                  Add First Wire Drop
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDrops.map((drop) => {
                const { percentage, prewireComplete, installComplete, commissionComplete } = getDropCompletion(drop);
                const badgeColor = getWireDropBadgeColor(drop);
                const badgeLetter = getWireDropBadgeLetter(drop);
                const badgeTextColor = getWireDropBadgeTextColor(badgeColor);

                const isSelected = selectedDropIds.includes(drop.id);

                return (
                  <div
                    key={drop.id}
                    className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${isSelected ? 'ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-900/10' : ''
                      }`}
                    onClick={() => navigate(`/wire-drops/${drop.id}`)}
                  >
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0">
                        <button
                          onClick={(e) => handleToggleSelect(drop.id, e)}
                          className="mr-2 mt-1"
                        >
                          {isSelected ? (
                            <CheckSquare size={20} className="text-violet-600 dark:text-violet-400" />
                          ) : (
                            <Square size={20} className="text-gray-400 dark:text-gray-500" />
                          )}
                        </button>
                      </div>
                      <div className="flex-shrink-0">
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center shadow-md select-none"
                          style={{
                            backgroundColor: badgeColor,
                            border: '2px solid rgba(17, 24, 39, 0.08)',
                            color: badgeTextColor
                          }}
                          aria-hidden="true"
                        >
                          <span className="text-lg font-bold">{badgeLetter}</span>
                        </div>
                      </div>

                      <div className="flex-1">
                        {/* Wire Drop Name as main title */}
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">
                          {drop.drop_name || drop.name || 'Unnamed Drop'}
                        </h3>

                        {/* Room Name underneath */}
                        {(drop.room_name || drop.project_room?.name) && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {drop.room_name || drop.project_room?.name}
                          </p>
                        )}

                        {/* Wire Type and Floor as smaller text */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {drop.drop_type && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium uppercase tracking-wide">Type:</span> {drop.drop_type}
                            </span>
                          )}
                          {drop.wire_type && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium uppercase tracking-wide">Wire:</span> {drop.wire_type}
                            </span>
                          )}
                          {drop.floor && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium uppercase tracking-wide">Floor:</span> {drop.floor}
                            </span>
                          )}
                          {drop.location && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium uppercase tracking-wide">Location:</span> {drop.location}
                            </span>
                          )}
                        </div>

                        {/* Project name if viewing all projects */}
                        {drop.projects?.name && !projectId && (
                          <p className="text-xs text-violet-600 dark:text-violet-400 mt-2">
                            Project: {drop.projects.name}
                          </p>
                        )}
                      </div>

                      <div className="text-right space-y-2">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={(e) => handlePrintSingleLabel(drop, e)}
                            disabled={!printerConnected || printingDropId === drop.id}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            style={{
                              backgroundColor: printerConnected ? '#3B82F6' : '#9CA3AF',
                              color: '#FFFFFF',
                            }}
                            title="Print 2 labels"
                          >
                            {printingDropId === drop.id ? (
                              <>
                                <Loader size={14} className="animate-spin" />
                                Printing...
                              </>
                            ) : (
                              <>
                                <Printer size={14} />
                                Print (2x)
                              </>
                            )}
                          </button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={(event) => handleDeleteDrop(event, drop.id)}
                            loading={deletingDropId === drop.id}
                          >
                            Delete
                          </Button>
                        </div>
                        <div className="flex gap-1 justify-end mb-1">
                          <span
                            className="px-2 py-0.5 text-xs font-semibold rounded-full uppercase"
                            style={prewireComplete ? {
                              backgroundColor: 'rgba(148, 175, 50, 0.15)',
                              color: '#94AF32'
                            } : {
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              color: '#F59E0B'
                            }}
                          >
                            Prewire
                          </span>
                          <span
                            className="px-2 py-0.5 text-xs font-semibold rounded-full uppercase"
                            style={installComplete ? {
                              backgroundColor: 'rgba(148, 175, 50, 0.15)',
                              color: '#94AF32'
                            } : {
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              color: '#F59E0B'
                            }}
                          >
                            Installed
                          </span>
                          <span
                            className="px-2 py-0.5 text-xs font-semibold rounded-full uppercase"
                            style={commissionComplete ? {
                              backgroundColor: 'rgba(148, 175, 50, 0.15)',
                              color: '#94AF32'
                            } : {
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              color: '#F59E0B'
                            }}
                          >
                            Comm
                          </span>
                        </div>
                        <div
                          className="text-sm font-bold"
                          style={{
                            color: percentage === 100 ? '#94AF32' :
                              percentage >= 67 ? '#3B82F6' :
                                percentage >= 33 ? '#F59E0B' : '#6B7280'
                          }}
                        >
                          {percentage}% Complete
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <AlertTriangle size={20} className="text-red-500" />
              Delete {selectedDropIds.length} Wire Drop{selectedDropIds.length !== 1 ? 's' : ''}?
            </h3>
            <p className="text-sm mb-6 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete {selectedDropIds.length} wire drop{selectedDropIds.length !== 1 ? 's' : ''}?
              This action cannot be undone and will remove all associated data including photos, equipment details, and stage progress.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={handleBulkDelete}
                loading={bulkDeleting}
                disabled={bulkDeleting}
                className="flex-1"
              >
                Delete {selectedDropIds.length} Drop{selectedDropIds.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WireDropsList;
