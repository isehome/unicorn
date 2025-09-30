import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { Search, Filter, Plus, Loader } from 'lucide-react';

const WireDropsList = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [allDrops, setAllDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);

  useEffect(() => {
    loadWireDrops();
  }, [projectId]);

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

      setAllDrops(data || []);
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

  const filteredDrops = useMemo(() => {
    if (!searchTerm) return allDrops;
    
    const query = searchTerm.toLowerCase();
    return allDrops.filter(drop =>
      [drop.name, drop.location, drop.uid, drop.type, drop.projects?.name]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query))
    );
  }, [allDrops, searchTerm]);

  const handleAddWireDrop = () => {
    navigate(`/wire-drops/new${projectId ? `?project=${projectId}` : ''}`);
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
                placeholder="Search drops..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <Button variant="secondary" size="sm" icon={Filter}>
              Filter
            </Button>
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
                
                return (
                  <div
                    key={drop.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate(`/wire-drops/${drop.id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {drop.room_name || drop.name || 'Wire Drop'}
                            {drop.drop_name && ` - ${drop.drop_name}`}
                          </h3>
                          {drop.uid && (
                            <span className="text-xs font-mono px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {drop.uid}
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                          {drop.location && (
                            <p>Location: {drop.location}</p>
                          )}
                          {drop.projects?.name && !projectId && (
                            <p className="text-violet-600 dark:text-violet-400">
                              Project: {drop.projects.name}
                            </p>
                          )}
                          {drop.type && (
                            <p>Type: {drop.type}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right space-y-2">
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
