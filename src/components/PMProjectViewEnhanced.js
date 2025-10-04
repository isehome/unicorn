import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService } from '../services/supabaseService';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { wireDropService } from '../services/wireDropService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import LucidChartCarousel from './LucidChartCarousel';
import { 
  Save, 
  ExternalLink, 
  Clock, 
  Users, 
  CheckCircle, 
  XCircle,
  Edit,
  Loader,
  FolderOpen,
  FileText,
  Camera,
  Plus,
  Calendar,
  Target,
  AlertCircle,
  Settings,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Download,
  RefreshCw,
  Link
} from 'lucide-react';

const PMProjectViewEnhanced = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const { user } = useAuth();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [timeData, setTimeData] = useState({
    summary: [],
    activeUsers: [],
    totalHours: 0
  });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPhaseOrderModal, setShowPhaseOrderModal] = useState(false);
  const [newPhase, setNewPhase] = useState({ name: '', description: '', color: '#6b7280' });
  const [newStatus, setNewStatus] = useState({ name: '', description: '', color: '#6b7280' });
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    address: '',
    phase: '',
    status: 'active',
    project_number: '',
    description: '',
    start_date: '',
    end_date: '',
    wiring_diagram_url: '',
    portal_proposal_url: '',
    one_drive_photos: '',
    one_drive_files: '',
    one_drive_procurement: ''
  });

  // Lucid integration state
  const [lucidData, setLucidData] = useState(null);
  const [lucidLoading, setLucidLoading] = useState(false);
  const [lucidError, setLucidError] = useState(null);
  const [droppableShapes, setDroppableShapes] = useState([]);
  const [selectedShapes, setSelectedShapes] = useState(new Set());
  const [existingWireDrops, setExistingWireDrops] = useState([]);
  const [batchCreating, setBatchCreating] = useState(false);
  const [showLucidSection, setShowLucidSection] = useState(false);

  // Load project data and related information
  useEffect(() => {
    loadProjectData();
    loadTimeData();
    loadPhasesAndStatuses();
    
    // Refresh time data every 30 seconds
    const interval = setInterval(loadTimeData, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  const loadPhasesAndStatuses = async () => {
    try {
      // Load phases
      const { data: phasesData, error: phasesError } = await supabase
        .from('project_phases')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      
      if (!phasesError) setPhases(phasesData || []);
      
      // Load statuses
      const { data: statusesData, error: statusesError } = await supabase
        .from('project_statuses')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      
      if (!statusesError) setStatuses(statusesData || []);
    } catch (error) {
      console.error('Failed to load phases/statuses:', error);
    }
  };

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const projectData = await projectsService.getAll();
      const currentProject = projectData.find(p => p.id === projectId);
      
      if (currentProject) {
        setProject(currentProject);
        setFormData({
          name: currentProject.name || '',
          client: currentProject.client || '',
          address: currentProject.address || '',
          phase: currentProject.phase || '',
          status: currentProject.status || 'active',
          project_number: currentProject.project_number || '',
          description: currentProject.description || '',
          start_date: currentProject.start_date || '',
          end_date: currentProject.end_date || '',
          wiring_diagram_url: currentProject.wiring_diagram_url || '',
          portal_proposal_url: currentProject.portal_proposal_url || '',
          one_drive_photos: currentProject.one_drive_photos || '',
          one_drive_files: currentProject.one_drive_files || '',
          one_drive_procurement: currentProject.one_drive_procurement || ''
        });

        // Load milestones
        const { data: milestonesData } = await supabase
          .from('project_phase_milestones')
          .select(`
            *,
            phase:project_phases(*)
          `)
          .eq('project_id', projectId);
        
        setMilestones(milestonesData || []);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeData = async () => {
    try {
      // Get time summary for all users on this project
      const summary = await timeLogsService.getProjectTimeSummary(projectId);
      
      // Calculate total hours
      const totalHours = summary.reduce((sum, user) => sum + (user.total_hours || 0), 0);
      
      // Get currently checked-in users
      const activeUsers = summary.filter(user => user.has_active_session);
      
      setTimeData({
        summary,
        activeUsers,
        totalHours
      });
    } catch (error) {
      console.error('Failed to load time data:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      console.log('Starting save with formData:', formData);
      
      // Extract Lucid document ID from wiring diagram URL
      let lucidDocId = null;
      let lucidDocUrl = null;
      if (formData.wiring_diagram_url) {
        lucidDocId = extractDocumentIdFromUrl(formData.wiring_diagram_url);
        lucidDocUrl = formData.wiring_diagram_url;
        if (lucidDocId) {
          console.log('Extracted Lucid document ID:', lucidDocId);
        }
      }
      
      // Only send fields that exist in the database
      const validFields = {
        name: formData.name,
        client: formData.client,
        address: formData.address,
        phase: formData.phase,
        status: formData.status,
        project_number: formData.project_number,
        description: formData.description,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        wiring_diagram_url: formData.wiring_diagram_url || null,
        portal_proposal_url: formData.portal_proposal_url || null,
        one_drive_photos: formData.one_drive_photos || null,
        one_drive_files: formData.one_drive_files || null,
        one_drive_procurement: formData.one_drive_procurement || null,
        lucid_document_id: lucidDocId,
        lucid_document_url: lucidDocUrl
      };
      
      console.log('Sending update with fields:', validFields);
      
      // Use supabase directly to avoid any service layer issues
      const { data, error } = await supabase
        .from('projects')
        .update(validFields)
        .eq('id', projectId)
        .select()
        .single();
        
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Update successful:', data);
      setProject({ ...project, ...data });
      setEditMode(false);
      
    } catch (error) {
      console.error('Failed to save project:', error);
      alert(`Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddPhase = async () => {
    if (!newPhase.name) return;
    
    try {
      const { data, error } = await supabase
        .from('project_phases')
        .insert([{
          ...newPhase,
          sort_order: phases.length + 1
        }])
        .select()
        .single();
      
      if (!error) {
        setPhases([...phases, data]);
        setNewPhase({ name: '', description: '', color: '#6b7280' });
        setShowPhaseModal(false);
      }
    } catch (error) {
      console.error('Failed to add phase:', error);
    }
  };

  const handleAddStatus = async () => {
    if (!newStatus.name) return;
    
    try {
      const { data, error } = await supabase
        .from('project_statuses')
        .insert([{
          ...newStatus,
          sort_order: statuses.length + 1
        }])
        .select()
        .single();
      
      if (!error) {
        setStatuses([...statuses, data]);
        setNewStatus({ name: '', description: '', color: '#6b7280' });
        setShowStatusModal(false);
      }
    } catch (error) {
      console.error('Failed to add status:', error);
    }
  };

  const handlePhaseReorder = async (phaseId, direction) => {
    const phaseIndex = phases.findIndex(p => p.id === phaseId);
    if (
      (direction === 'up' && phaseIndex === 0) ||
      (direction === 'down' && phaseIndex === phases.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
    const newPhases = [...phases];
    [newPhases[phaseIndex], newPhases[newIndex]] = [newPhases[newIndex], newPhases[phaseIndex]];

    // Update sort_order in database
    try {
      const updates = newPhases.map((phase, index) => ({
        id: phase.id,
        sort_order: index + 1
      }));

      for (const update of updates) {
        await supabase
          .from('project_phases')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }

      // Update local state
      setPhases(newPhases.map((phase, index) => ({
        ...phase,
        sort_order: index + 1
      })));
    } catch (error) {
      console.error('Failed to reorder phases:', error);
    }
  };

  const handleMilestoneUpdate = async (phaseId, field, value) => {
    const existingMilestone = milestones.find(m => m.phase_id === phaseId);
    
    if (existingMilestone) {
      // Update existing milestone
      const { error } = await supabase
        .from('project_phase_milestones')
        .update({ [field]: value, updated_at: new Date() })
        .eq('id', existingMilestone.id);
      
      if (!error) {
        setMilestones(milestones.map(m => 
          m.id === existingMilestone.id 
            ? { ...m, [field]: value }
            : m
        ));
      }
    } else {
      // Create new milestone
      const { data, error } = await supabase
        .from('project_phase_milestones')
        .insert([{
          project_id: projectId,
          phase_id: phaseId,
          [field]: value
        }])
        .select(`
          *,
          phase:project_phases(*)
        `)
        .single();
      
      if (!error) {
        setMilestones([...milestones, data]);
      }
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatLastActivity = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Lucid Integration Functions
  const handleFetchLucidData = async () => {
    if (!formData.wiring_diagram_url) {
      alert('Please enter a Wiring Diagram URL first');
      return;
    }

    setLucidLoading(true);
    setLucidError(null);

    try {
      // Extract document ID from URL
      const documentId = extractDocumentIdFromUrl(formData.wiring_diagram_url);
      if (!documentId) {
        throw new Error('Invalid Lucid Chart URL format');
      }

      // Fetch document contents
      const docData = await fetchDocumentContents(documentId);
      setLucidData(docData);

      // Extract shapes
      const shapes = extractShapes(docData);
      
      // Filter shapes that have IS Drop = true (case-insensitive for both key and value)
      const droppable = shapes.filter(shape => {
        const customData = shape.customData || {};
        
        // Check for "IS Drop" key in various cases
        let isDropValue = null;
        for (const key in customData) {
          if (key.toLowerCase().trim() === 'is drop') {
            isDropValue = customData[key];
            break;
          }
        }
        
        // Check if value is truthy (case-insensitive)
        if (isDropValue === null || isDropValue === undefined) {
          return false;
        }
        
        const valueStr = String(isDropValue).toLowerCase().trim();
        console.log('Shape:', shape.id, 'IS Drop value:', isDropValue, 'Type:', typeof isDropValue);
        return valueStr === 'true' || valueStr === 'yes' || valueStr === '1' || isDropValue === true || isDropValue === 1;
      });

      setDroppableShapes(droppable);
      console.log(`Found ${droppable.length} droppable shapes out of ${shapes.length} total shapes`);
      console.log('All shapes:', shapes.length);
      console.log('Sample shape customData:', shapes[0]?.customData);

      // Load existing wire drops to check for duplicates
      const { data: wireDrops } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId);
      
      setExistingWireDrops(wireDrops || []);
      setShowLucidSection(true);

    } catch (error) {
      console.error('Failed to fetch Lucid data:', error);
      setLucidError(error.message);
    } finally {
      setLucidLoading(false);
    }
  };

  const handleShapeSelection = (shapeId) => {
    const newSelected = new Set(selectedShapes);
    if (newSelected.has(shapeId)) {
      newSelected.delete(shapeId);
    } else {
      newSelected.add(shapeId);
    }
    setSelectedShapes(newSelected);
  };

  const handleSelectAll = () => {
    // Only select shapes that don't already have wire drops
    const selectableShapes = droppableShapes.filter(shape => 
      !existingWireDrops.some(wd => wd.lucid_shape_id === shape.id)
    );
    setSelectedShapes(new Set(selectableShapes.map(s => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedShapes(new Set());
  };

  const handleCreateWireDropsFromSelected = async () => {
    if (selectedShapes.size === 0) {
      alert('Please select at least one shape');
      return;
    }

    setBatchCreating(true);
    const errors = [];
    const created = [];
    const updated = [];

    try {
      for (const shapeId of selectedShapes) {
        const shape = droppableShapes.find(s => s.id === shapeId);
        if (!shape) continue;

        // Extract data from shape (case-insensitive)
        const customData = shape.customData || {};
        
        // Helper to get case-insensitive custom data value
        const getCustomValue = (key) => {
          for (const k in customData) {
            if (k.toLowerCase().trim() === key.toLowerCase()) {
              return customData[k];
            }
          }
          return null;
        };
        
        const shapeName = shape.text || getCustomValue('Drop Name') || `Drop ${shape.id.substring(0, 8)}`;
        const roomName = getCustomValue('Room Name') || getCustomValue('Room') || '';
        const location = getCustomValue('Location') || '';
        const type = getCustomValue('Type') || getCustomValue('Wire Type') || 'CAT6';
        
        // Create notes field to store all Lucid shape data that we can't store in columns
        const shapeMetadata = {
          pageId: shape.pageId,
          pageTitle: shape.pageTitle,
          position: shape.position,
          size: shape.size,
          customData: customData,
          floor: getCustomValue('Floor') || '',
          device: getCustomValue('Device') || ''
        };
        
        const notesContent = `Lucid Shape Data: ${JSON.stringify(shapeMetadata)}`;

        // Check if wire drop already exists for this shape
        const existingDrop = existingWireDrops.find(wd => wd.lucid_shape_id === shapeId);
        
        if (existingDrop) {
          // Update existing wire drop with latest data from Lucid
          const { data, error } = await supabase
            .from('wire_drops')
            .update({
              name: shapeName,
              room_name: roomName,
              drop_name: shapeName,
              location: location,
              type: type,
              notes: notesContent,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingDrop.id)
            .select()
            .single();

          if (error) {
            errors.push(`Failed to update wire drop for ${shapeName}: ${error.message}`);
          } else {
            updated.push(data);
          }
        } else {
          // Use the service to create wire drop properly with stages
          const wireDropData = {
            drop_name: shapeName,
            room_name: roomName,
            location: location,
            type: type,
            lucid_shape_id: shape.id,
            notes: notesContent
          };

          try {
            const wireDrop = await wireDropService.createWireDrop(projectId, wireDropData);
            created.push(wireDrop);
          } catch (createError) {
            errors.push(`Failed to create wire drop for ${shapeName}: ${createError.message}`);
          }
        }
      }

      // Refresh existing wire drops
      const { data: updatedWireDrops } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId);
      
      setExistingWireDrops(updatedWireDrops || []);
      setSelectedShapes(new Set());

      // Show results
      const messages = [];
      if (created.length > 0) {
        messages.push(`Created ${created.length} new wire drop(s)`);
      }
      if (updated.length > 0) {
        messages.push(`Updated ${updated.length} existing wire drop(s)`);
      }
      if (errors.length > 0) {
        messages.push(`\n\nErrors:\n${errors.join('\n')}`);
      }
      
      if (messages.length > 0) {
        alert(messages.join('\n'));
      }

    } catch (error) {
      console.error('Batch create error:', error);
      alert('Failed to create wire drops: ' + error.message);
    } finally {
      setBatchCreating(false);
    }
  };

  const isShapeLinked = (shapeId) => {
    return existingWireDrops.some(wd => wd.lucid_shape_id === shapeId);
  };

  const getLinkedWireDrop = (shapeId) => {
    return existingWireDrops.find(wd => wd.lucid_shape_id === shapeId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Project not found</p>
          <Button onClick={() => navigate('/pm-dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Project Header */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {project.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {project.project_number && `Project #${project.project_number} • `}
              {project.client && `Client: ${project.client}`}
            </p>
          </div>
          <Button
            onClick={() => editMode ? handleSave() : setEditMode(true)}
            variant={editMode ? 'primary' : 'secondary'}
            icon={editMode ? Save : Edit}
            disabled={saving}
          >
            {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Edit Project'}
          </Button>
        </div>

        {/* Project Information Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client
            </label>
            <input
              type="text"
              name="client"
              value={formData.client}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phase
              {editMode && (
                <button
                  onClick={() => setShowPhaseModal(true)}
                  className="ml-2 text-violet-600 hover:text-violet-700"
                >
                  <Plus className="w-4 h-4 inline" />
                </button>
              )}
            </label>
            <select
              name="phase"
              value={formData.phase}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            >
              <option value="">Select Phase</option>
              {phases.map((phase) => (
                <option key={phase.id} value={phase.name}>
                  {phase.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
              {editMode && (
                <button
                  onClick={() => setShowStatusModal(true)}
                  className="ml-2 text-violet-600 hover:text-violet-700"
                >
                  <Plus className="w-4 h-4 inline" />
                </button>
              )}
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            >
              {/* Always include default options in case statuses table is empty */}
              {statuses.length === 0 ? (
                <>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              ) : (
                statuses.map((status) => (
                  <option key={status.id} value={status.name}>
                    {status.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Number
            </label>
            <input
              type="text"
              name="project_number"
              value={formData.project_number}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleInputChange}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              disabled={!editMode}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            />
          </div>

          {/* Setup URLs - Only visible in edit mode */}
          {editMode && (
            <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
              <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                <Link className="w-4 h-4" />
                Setup URLs
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Wiring Diagram URL (Lucid Chart)
                  </label>
                  <input
                    type="url"
                    name="wiring_diagram_url"
                    value={formData.wiring_diagram_url}
                    onChange={handleInputChange}
                    placeholder="https://lucid.app/..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Portal Proposal URL
                  </label>
                  <input
                    type="url"
                    name="portal_proposal_url"
                    value={formData.portal_proposal_url}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Camera className="w-4 h-4 inline mr-1" />
                    OneDrive Photos
                  </label>
                  <input
                    type="url"
                    name="one_drive_photos"
                    value={formData.one_drive_photos}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FolderOpen className="w-4 h-4 inline mr-1" />
                    OneDrive Files
                  </label>
                  <input
                    type="url"
                    name="one_drive_files"
                    value={formData.one_drive_files}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FolderOpen className="w-4 h-4 inline mr-1" />
                    OneDrive Procurement
                  </label>
                  <input
                    type="url"
                    name="one_drive_procurement"
                    value={formData.one_drive_procurement}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lucid Chart Carousel - Show when there's a wiring diagram URL */}
      {formData.wiring_diagram_url && (
        <LucidChartCarousel 
          documentUrl={formData.wiring_diagram_url}
          projectName={project.name}
        />
      )}

      {/* Phase Milestones */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Phase Milestones
          </h2>
          {editMode && (
            <Button
              variant="secondary"
              size="sm"
              icon={Settings}
              onClick={() => setShowPhaseOrderModal(true)}
            >
              Reorder Phases
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Phase</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Target Date</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Actual Date</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {phases.map((phase) => {
                const milestone = milestones.find(m => m.phase_id === phase.id);
                const isOverdue = milestone?.target_date && 
                  !milestone?.actual_date && 
                  new Date(milestone.target_date) < new Date();
                
                return (
                  <tr key={phase.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: phase.color }}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {phase.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={milestone?.target_date || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'target_date', e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={milestone?.actual_date || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'actual_date', e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {milestone?.actual_date ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <AlertCircle className="w-3 h-3" />
                          Overdue
                        </span>
                      ) : milestone?.target_date ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          <Target className="w-3 h-3" />
                          Scheduled
                        </span>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={milestone?.notes || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'notes', e.target.value)}
                        placeholder="Add notes..."
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time Tracking Section */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Time Tracking
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Project Time</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {timeData.totalHours.toFixed(1)} hours
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={Clock}
              onClick={loadTimeData}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Currently Checked In Users */}
        {timeData.activeUsers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Currently Checked In ({timeData.activeUsers.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {timeData.activeUsers.map((user) => (
                <div
                  key={user.user_email}
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 
                           border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.user_name || user.user_email}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Checked in {formatLastActivity(user.active_session_start)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Users Time Summary */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Time Summary by User
          </h3>
          {timeData.summary.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No time logged for this project yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">User</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Sessions</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Total Time</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Last Activity</th>
                    <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {timeData.summary.map((user) => (
                    <tr key={user.user_email} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {user.user_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {user.user_email}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {user.total_sessions}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        <span className="font-semibold">{user.total_hours}h</span>
                        <span className="text-xs text-gray-500 ml-1">
                          ({formatDuration(user.total_minutes)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {formatLastActivity(user.last_activity || user.last_check_out)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.has_active_session ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                         bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                         bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            <XCircle className="w-3 h-3" />
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lucid Integration Section */}
      {formData.wiring_diagram_url && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Lucid Wiring Diagram Integration
            </h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={ExternalLink}
                onClick={() => window.open(formData.wiring_diagram_url, '_blank')}
              >
                Open Diagram
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={lucidLoading ? Loader : RefreshCw}
                onClick={handleFetchLucidData}
                disabled={lucidLoading}
              >
                {lucidLoading ? 'Fetching...' : showLucidSection ? 'Refresh' : 'Fetch Shape Data'}
              </Button>
            </div>
          </div>

          {/* Document Info */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">URL:</span>
                <p className="text-gray-900 dark:text-white break-all">{formData.wiring_diagram_url}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">Document ID:</span>
                <p className="text-gray-900 dark:text-white font-mono">
                  {extractDocumentIdFromUrl(formData.wiring_diagram_url) || 'Not detected - check URL format'}
                </p>
              </div>
            </div>
          </div>

          {lucidError && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-200">Error fetching Lucid data</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{lucidError}</p>
                </div>
              </div>
            </div>
          )}

          {showLucidSection && droppableShapes.length > 0 && (
            <div>
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  Found <strong>{droppableShapes.length}</strong> shapes with "IS Drop = true"
                  {existingWireDrops.length > 0 && (
                    <span> • <strong>{existingWireDrops.filter(wd => wd.lucid_shape_id).length}</strong> already have wire drops</span>
                  )}
                </p>
              </div>

              {/* Selection Controls */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={droppableShapes.every(s => isShapeLinked(s.id))}
                  >
                    Select All (Available)
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={selectedShapes.size === 0}
                  >
                    Deselect All
                  </Button>
                </div>
                <Button
                  variant="primary"
                  icon={batchCreating ? Loader : Plus}
                  onClick={handleCreateWireDropsFromSelected}
                  disabled={selectedShapes.size === 0 || batchCreating}
                >
                  {batchCreating ? 'Creating...' : `Create ${selectedShapes.size} Wire Drop${selectedShapes.size !== 1 ? 's' : ''}`}
                </Button>
              </div>

              {/* Shape List */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                          checked={selectedShapes.size > 0 && selectedShapes.size === droppableShapes.filter(s => !isShapeLinked(s.id)).length}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Shape Name</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Location</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Type</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Page</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {droppableShapes.map((shape) => {
                      const linked = isShapeLinked(shape.id);
                      const wireDrop = getLinkedWireDrop(shape.id);
                      const shapeName = shape.text || `Drop ${shape.id.substring(0, 8)}`;
                      const location = shape.customData?.Location || shape.customData?.location || '-';
                      const type = shape.customData?.Type || shape.customData?.type || 'CAT6';

                      return (
                        <tr 
                          key={shape.id} 
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${linked ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedShapes.has(shape.id)}
                              onChange={() => handleShapeSelection(shape.id)}
                              disabled={linked}
                              className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {shapeName}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {location}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {type}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {shape.pageTitle || 'Page ' + (shape.pageId?.substring(0, 8) || '?')}
                          </td>
                          <td className="px-4 py-3">
                            {linked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                             bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                <CheckCircle className="w-3 h-3" />
                                Linked to {wireDrop?.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                             bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">
                                Available
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showLucidSection && droppableShapes.length === 0 && !lucidError && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No shapes found with "IS Drop = true" in the custom data.</p>
              <p className="text-sm mt-2">Make sure your Lucid shapes have the custom data field "IS Drop" set to "true".</p>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          variant="primary"
          onClick={() => navigate(`/project/${projectId}/pm-issues`)}
        >
          View Issues
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/wire-drops')}
        >
          View Wire Drops
        </Button>
      </div>
      
      {/* Add Phase Modal */}
      {showPhaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Phase</h3>
            <input
              type="text"
              placeholder="Phase name"
              value={newPhase.name}
              onChange={(e) => setNewPhase({...newPhase, name: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPhase.description}
              onChange={(e) => setNewPhase({...newPhase, description: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newPhase.color}
              onChange={(e) => setNewPhase({...newPhase, color: e.target.value})}
              className="w-full h-10 mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddPhase} variant="primary">Add</Button>
              <Button onClick={() => setShowPhaseModal(false)} variant="secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Status</h3>
            <input
              type="text"
              placeholder="Status name"
              value={newStatus.name}
              onChange={(e) => setNewStatus({...newStatus, name: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newStatus.description}
              onChange={(e) => setNewStatus({...newStatus, description: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newStatus.color}
              onChange={(e) => setNewStatus({...newStatus, color: e.target.value})}
              className="w-full h-10 mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddStatus} variant="primary">Add</Button>
              <Button onClick={() => setShowStatusModal(false)} variant="secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Phase Order Modal */}
      {showPhaseOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reorder Phases</h3>
            <div className="space-y-2">
              {phases.map((phase, index) => (
                <div 
                  key={phase.id} 
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: phase.color }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {phase.name}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handlePhaseReorder(phase.id, 'up')}
                      disabled={index === 0}
                      className={`p-1 rounded ${
                        index === 0 
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400'
                      }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePhaseReorder(phase.id, 'down')}
                      disabled={index === phases.length - 1}
                      className={`p-1 rounded ${
                        index === phases.length - 1 
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => setShowPhaseOrderModal(false)} variant="primary">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PMProjectViewEnhanced;
