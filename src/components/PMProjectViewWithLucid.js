import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService } from '../services/supabaseService';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { wireDropService } from '../services/wireDropService';
import Button from './ui/Button';
import { 
  Save, 
  ExternalLink, 
  Clock, 
  CheckCircle, 
  XCircle,
  Edit,
  Loader,
  FolderOpen,
  FileText,
  Camera,
  Download,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

const PMProjectViewWithLucid = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const { user } = useAuth();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [project, setProject] = useState(null);
  const [timeData, setTimeData] = useState({
    summary: [],
    activeUsers: [],
    totalHours: 0
  });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const [lucidShapes, setLucidShapes] = useState([]);
  const [droppableShapes, setDroppableShapes] = useState([]);
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  // Load project data and time tracking info
  useEffect(() => {
    loadProjectData();
    loadTimeData();
    
    // Refresh time data every 30 seconds
    const interval = setInterval(loadTimeData, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Load Lucid data when wiring diagram URL changes
  useEffect(() => {
    if (project?.wiring_diagram_url) {
      loadLucidData();
    }
  }, [project?.wiring_diagram_url]);

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
      }
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLucidData = async () => {
    if (!project?.wiring_diagram_url) {
      setLucidError('No wiring diagram URL configured');
      return;
    }

    const documentId = extractDocumentIdFromUrl(project.wiring_diagram_url);
    if (!documentId) {
      setLucidError('Invalid Lucid Chart URL');
      return;
    }

    try {
      setLucidLoading(true);
      setLucidError(null);
      
      const data = await fetchDocumentContents(documentId);
      setLucidData(data);
      
      const shapes = extractShapes(data);
      setLucidShapes(shapes);
      
      // Filter shapes where IS Drop = true
      const droppable = shapes.filter(shape => {
        const isDrop = shape.customData?.['IS Drop'] || 
                      shape.customData?.['Is Drop'] || 
                      shape.customData?.['is_drop'];
        return isDrop === true || isDrop === 'true' || isDrop === 'TRUE';
      });
      setDroppableShapes(droppable);
      
      console.log('Lucid data loaded:', {
        totalShapes: shapes.length,
        droppableShapes: droppable.length
      });
    } catch (error) {
      console.error('Failed to load Lucid data:', error);
      setLucidError(error.message || 'Failed to load Lucid Chart data');
    } finally {
      setLucidLoading(false);
    }
  };

  const handleBatchCreateWireDrops = async () => {
    if (droppableShapes.length === 0) {
      alert('No droppable shapes found in the Lucid Chart');
      return;
    }

    if (!confirm(`This will create ${droppableShapes.length} wire drops. Continue?`)) {
      return;
    }

    try {
      setBatchCreating(true);
      setBatchResult(null);
      
      const results = {
        created: [],
        skipped: [],
        errors: []
      };

      for (const shape of droppableShapes) {
        try {
          // Extract room name and drop name from shape data
          const roomName = shape.customData?.['Room'] || 
                          shape.customData?.['room'] || 
                          shape.pageTitle || 
                          'Unknown Room';
          
          const dropName = shape.customData?.['Drop Name'] || 
                          shape.customData?.['drop_name'] || 
                          shape.text || 
                          `Drop-${shape.id.substring(0, 8)}`;
          
          // Get other relevant data
          const type = shape.customData?.['Type'] || 
                      shape.customData?.['type'] || 
                      'CAT6';
          
          const roomEndEquipment = shape.customData?.['Room End Equipment'] || 
                                  shape.customData?.['room_end_equipment'];
          
          const headEndEquipment = shape.customData?.['Head End Equipment'] || 
                                  shape.customData?.['head_end_equipment'];
          
          const schematicReference = shape.customData?.['Schematic Reference'] || 
                                    shape.customData?.['schematic_reference'];

          // Create the wire drop
          const wireDrop = await wireDropService.createWireDrop(projectId, {
            room_name: roomName,
            drop_name: dropName,
            type: type,
            lucid_shape_id: shape.id,
            schematic_reference: schematicReference,
            room_end_equipment: roomEndEquipment,
            head_end_equipment: headEndEquipment,
            location: `${roomName} - ${shape.pageTitle}`,
            notes: `Auto-created from Lucid Chart shape ${shape.id}`
          });

          results.created.push({
            wireDrop,
            shape
          });
        } catch (error) {
          console.error(`Failed to create wire drop for shape ${shape.id}:`, error);
          results.errors.push({
            shape,
            error: error.message
          });
        }
      }

      setBatchResult(results);
      
      // Show summary
      alert(`Batch creation complete!\n\nCreated: ${results.created.length}\nErrors: ${results.errors.length}`);
      
      // Navigate to wire drops list if successful
      if (results.created.length > 0) {
        setTimeout(() => {
          navigate(`/project/${projectId}/wire-drops`);
        }, 2000);
      }
    } catch (error) {
      console.error('Batch creation failed:', error);
      alert(`Batch creation failed: ${error.message}`);
    } finally {
      setBatchCreating(false);
    }
  };

  const loadTimeData = async () => {
    try {
      const summary = await timeLogsService.getProjectTimeSummary(projectId);
      const totalHours = summary.reduce((sum, user) => sum + (user.total_hours || 0), 0);
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
      
      const updateData = {
        ...formData,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null
      };
      
      await projectsService.update(projectId, updateData);
      await loadProjectData();
      setEditMode(false);
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project changes');
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
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {project.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {project.project_number && `Project #${project.project_number} • `}
              {project.client && `Client: ${project.client}`}
            </p>
          </div>
          <div className="flex gap-2">
            {editMode && (
              <Button
                onClick={() => {
                  setEditMode(false);
                  setFormData({
                    name: project.name || '',
                    client: project.client || '',
                    address: project.address || '',
                    phase: project.phase || '',
                    status: project.status || 'active',
                    project_number: project.project_number || '',
                    description: project.description || '',
                    start_date: project.start_date || '',
                    end_date: project.end_date || '',
                    wiring_diagram_url: project.wiring_diagram_url || '',
                    portal_proposal_url: project.portal_proposal_url || '',
                    one_drive_photos: project.one_drive_photos || '',
                    one_drive_files: project.one_drive_files || '',
                    one_drive_procurement: project.one_drive_procurement || ''
                  });
                }}
                variant="secondary"
                disabled={saving}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={() => editMode ? handleSave() : setEditMode(true)}
              variant={editMode ? 'primary' : 'secondary'}
              icon={editMode ? Save : Edit}
              disabled={saving}
            >
              {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Edit Project'}
            </Button>
          </div>
        </div>

        {/* View Mode */}
        {!editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Project Name
                </label>
                <p className="text-gray-900 dark:text-white">{project.name || '-'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Client
                </label>
                <p className="text-gray-900 dark:text-white">{project.client || '-'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Address
                </label>
                <p className="text-gray-900 dark:text-white">{project.address || '-'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Project Number
                </label>
                <p className="text-gray-900 dark:text-white">{project.project_number || '-'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Phase
                </label>
                <p className="text-gray-900 dark:text-white">{project.phase || '-'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Status
                </label>
                <p className="text-gray-900 dark:text-white capitalize">{project.status?.replace('_', ' ') || 'active'}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Start Date
                </label>
                <p className="text-gray-900 dark:text-white">
                  {project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  End Date
                </label>
                <p className="text-gray-900 dark:text-white">
                  {project.end_date ? new Date(project.end_date).toLocaleDateString() : '-'}
                </p>
              </div>

              {project.description && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Description
                  </label>
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{project.description}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Edit Mode */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phase
                </label>
                <select
                  name="phase"
                  value={formData.phase}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                >
                  <option value="">Select Phase</option>
                  <option value="Planning">Planning</option>
                  <option value="Pre-Wire">Pre-Wire</option>
                  <option value="Trim">Trim</option>
                  <option value="Final">Final</option>
                  <option value="Complete">Complete</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Setup Information Section - NOW ALWAYS VISIBLE IN EDIT MODE */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Setup Information
              </h3>

              <div className="space-y-4">
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
                    placeholder="https://lucid.app/lucidchart/..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Used for Lucid Chart integration and batch wire drop creation
                  </p>
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
                    OneDrive Photos Folder
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
                    OneDrive Files Folder
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
                    OneDrive Procurement Folder
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
          </div>
        )}
      </div>

      {/* Lucid Chart Integration Section */}
      {project.wiring_diagram_url && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Lucid Chart Integration
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Wire diagram data and batch creation
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadLucidData}
              disabled={lucidLoading}
            >
              {lucidLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {lucidError && (
            <div
