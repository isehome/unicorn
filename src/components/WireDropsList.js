import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { Search, Plus, Loader, Trash2 } from 'lucide-react';
import { wireDropService } from '../services/wireDropService';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';

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
      <div style={sectionStyles.header} className="shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {projectId && (
              <div>{/* Spacer for layout */}</div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {project ? `${project.name} - Wire Drops` : 'All Wire Drops'}
              </h1>
              {filteredDrops.length > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {filteredDrops.length} wire drop{filteredDrops.length === 1 ? '' : 's'}
                  {searchTerm && ` matching "${searchTerm}"`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div style={sectionStyles.card}>
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
                
                return (
                  <div
                    key={drop.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate(`/wire-drops/${drop.id}`)}
                  >
                    <div className="flex gap-4 items-start">
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
                        <div className="flex justify-end">
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
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${
                            prewireComplete 
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            Prewire
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${
                            installComplete
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            Install
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase ${
                            commissionComplete
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            Comm
                          </span>
                        </div>
                        <div className={`text-sm font-bold ${
                          percentage === 100 ? 'text-green-600 dark:text-green-400' :
                          percentage >= 67 ? 'text-blue-600 dark:text-blue-400' :
                          percentage >= 33 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
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
    </div>
  );
};

export default WireDropsList;
