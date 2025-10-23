import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService, contactsService } from '../services/supabaseService';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { wireDropService } from '../services/wireDropService';
import Button from './ui/Button';
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
  Download,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calendar,
  Link,
  User,
  Upload
} from 'lucide-react';

const PMProjectView = () => {
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
  const [contacts, setContacts] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    client_contact_id: '',
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
  const [batchCreating, setBatchCreating] = useState(false);

  // Collapsible sections state - all default to collapsed (false)
  const [sectionsExpanded, setSectionsExpanded] = useState({
    basics: false,
    schedule: false,
    linkedResources: false,
    clientContact: false,
    roomMatching: false
  });

  const toggleSection = (section) => {
    setSectionsExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Load project data, contacts, and time tracking info
  useEffect(() => {
    loadProjectData();
    loadTimeData();
    loadContacts();
    
    // Refresh time data every 30 seconds
    const interval = setInterval(loadTimeData, 30000);
    return () => clearInterval(interval);
  }, [projectId]);
  
  const loadContacts = async () => {
    try {
      const data = await contactsService.getAll();
      setContacts(data);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

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
          client_contact_id: currentProject.client_contact_id || '',
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
      
      // Prepare data with proper date formatting and client_contact_id
      const updateData = {
        ...formData,
        client_contact_id: formData.client_contact_id || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null
      };
      
      await projectsService.update(projectId, updateData);
      await loadProjectData(); // Reload to get the saved data
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

    if (!window.confirm(`This will create ${droppableShapes.length} wire drops. Continue?`)) {
      return;
    }

    try {
      setBatchCreating(true);
      
      let created = 0;
      let errors = 0;

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
          
          const type = shape.customData?.['Type'] || 
                      shape.customData?.['type'] || 
                      'CAT6';

          // Create the wire drop
          await wireDropService.createWireDrop(projectId, {
            room_name: roomName,
            drop_name: dropName,
            type: type,
            lucid_shape_id: shape.id,
            location: `${roomName} - ${shape.pageTitle}`,
            notes: `Auto-created from Lucid Chart shape ${shape.id}`
          });

          created++;
        } catch (error) {
          console.error(`Failed to create wire drop for shape ${shape.id}:`, error);
          errors++;
        }
      }

      alert(`Batch creation complete!\n\nCreated: ${created}\nErrors: ${errors}`);
      
      // Navigate to wire drops list if successful
      if (created > 0) {
        navigate(`/project/${projectId}/wire-drops`);
      }
    } catch (error) {
      console.error('Batch creation failed:', error);
      alert(`Batch creation failed: ${error.message}`);
    } finally {
      setBatchCreating(false);
    }
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
                    client_contact_id: project.client_contact_id || '',
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

        {/* Collapsible Sections */}
        <div className="space-y-3">
          {/* Project Basics Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('basics')}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 
                       hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Project Basics</h3>
              </div>
              {sectionsExpanded.basics ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            {sectionsExpanded.basics && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                {!editMode ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Project Name
                      </label>
                      <p className="text-gray-900 dark:text-white">{project.name || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Project Number
                      </label>
                      <p className="text-gray-900 dark:text-white">{project.project_number || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Address
                      </label>
                      <p className="text-gray-900 dark:text-white">{project.address || '-'}</p>
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
                      <p className="text-gray-900 dark:text-white capitalize">
                        {project.status?.replace('_', ' ') || 'active'}
                      </p>
                    </div>
                  </div>
                ) : (
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
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Schedule and Notes Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('schedule')}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 
                       hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Schedule and Notes</h3>
              </div>
              {sectionsExpanded.schedule ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            {sectionsExpanded.schedule && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                {!editMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>
                    {project.description && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Description / Notes
                        </label>
                        <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{project.description}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description / Notes
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                                 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        placeholder="Add project notes, requirements, or any other relevant information..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Client Contact Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('clientContact')}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 
                       hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Client Contact</h3>
              </div>
              {sectionsExpanded.clientContact ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            {sectionsExpanded.clientContact && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                {!editMode ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Client
                    </label>
                    <p className="text-gray-900 dark:text-white">{project.client || '-'}</p>
                    {project.client_contact_id && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Contact ID: {project.client_contact_id}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Select Client Contact
                    </label>
                    <select
                      name="client_contact_id"
                      value={formData.client_contact_id}
                      onChange={(e) => {
                        const selectedContact = contacts.find(c => c.id === e.target.value);
                        setFormData(prev => ({
                          ...prev,
                          client_contact_id: e.target.value,
                          client: selectedContact ? (selectedContact.full_name || selectedContact.name || selectedContact.company || '') : ''
                        }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                               focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    >
                      <option value="">Select a client contact...</option>
                      {contacts.map(contact => (
                        <option key={contact.id} value={contact.id}>
                          {contact.full_name || contact.name || 'Unnamed'} 
                          {contact.company && ` - ${contact.company}`}
                          {contact.email && ` (${contact.email})`}
                        </option>
                      ))}
                    </select>
                    {contacts.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        No contacts available. Add contacts first to select as clients.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Linked Resources Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('linkedResources')}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 
                       hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Link className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Linked Resources</h3>
              </div>
              {sectionsExpanded.linkedResources ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            {sectionsExpanded.linkedResources && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                {!editMode ? (
                  <div className="space-y-3">
                    {project.wiring_diagram_url && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          <FileText className="w-4 h-4 inline mr-1" />
                          Wiring Diagram
                        </label>
                        <a 
                          href={project.wiring_diagram_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                          View Diagram <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {project.portal_proposal_url && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          <FileText className="w-4 h-4 inline mr-1" />
                          Portal Proposal
                        </label>
                        <a 
                          href={project.portal_proposal_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                          View Proposal <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {project.one_drive_photos && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          <Camera className="w-4 h-4 inline mr-1" />
                          OneDrive Photos
                        </label>
                        <a 
                          href={project.one_drive_photos} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                          Open Photos Folder <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {project.one_drive_files && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          <FolderOpen className="w-4 h-4 inline mr-1" />
                          OneDrive Files
                        </label>
                        <a 
                          href={project.one_drive_files} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                          Open Files Folder <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {project.one_drive_procurement && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          <FolderOpen className="w-4 h-4 inline mr-1" />
                          OneDrive Procurement
                        </label>
                        <a 
                          href={project.one_drive_procurement} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                          Open Procurement Folder <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {!project.wiring_diagram_url && !project.portal_proposal_url && 
                     !project.one_drive_photos && !project.one_drive_files && !project.one_drive_procurement && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No linked resources configured
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <FileText className="w-4 h-4 inline mr-1" />
                        Wiring Diagram URL
                      </label>
                      <input
                        type="url"
                        name="wiring_diagram_url"
                        value={formData.wiring_diagram_url}
                        onChange={handleInputChange}
                        placeholder="https://..."
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
                )}
              </div>
            )}
          </div>

          {/* Room Matching to CSV Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('roomMatching')}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 
                       hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Room Matching to CSV (Portal Upload)</h3>
              </div>
              {sectionsExpanded.roomMatching ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            {sectionsExpanded.roomMatching && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This section is part of the Portal CSV Upload feature, which allows you to match room names 
                    from Lucid Chart with room data from your Portal proposal CSV.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-2">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Feature in Development
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      The CSV upload and room matching functionality will be available here soon. This will allow 
                      you to upload your Portal proposal CSV and automatically match rooms with wire drops from 
                      your Lucid Chart.
                    </p>
                  </div>
                  {project.portal_proposal_url && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={ExternalLink}
                      onClick={() => window.open(project.portal_proposal_url, '_blank')}
                    >
                      View Portal Proposal
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
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
                Wire diagram data and batch wire drop creation
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadLucidData}
              disabled={lucidLoading}
            >
              {lucidLoading ? 'Loading...' : 'Refresh Data'}
            </Button>
          </div>

          {lucidError && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    Error loading Lucid Chart data
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    {lucidError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {lucidLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-violet-600" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading Lucid data...</span>
            </div>
          ) : lucidData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-600 dark:text-blue-400">Total Shapes</p>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                    {lucidData.pages?.reduce((sum, page) => sum + (page.shapes?.length || 0), 0) || 0}
                  </p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-600 dark:text-green-400">Droppable Shapes</p>
                  <p className="text-2xl font-bold text-green-900 dark:text-green-300">
                    {droppableShapes.length}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    (IS Drop = true)
                  </p>
                </div>

                <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                  <p className="text-sm text-violet-600 dark:text-violet-400">Pages</p>
                  <p className="text-2xl font-bold text-violet-900 dark:text-violet-300">
                    {lucidData.pages?.length || 0}
                  </p>
                </div>
              </div>

              {droppableShapes.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Batch Create Wire Drops
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Create wire drops from {droppableShapes.length} droppable shapes
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      icon={Download}
                      onClick={handleBatchCreateWireDrops}
                      disabled={batchCreating}
                    >
                      {batchCreating ? 'Creating...' : `Create ${droppableShapes.length} Wire Drops`}
                    </Button>
                  </div>

                  {/* Preview of droppable shapes */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Preview (first 5 shapes):
                    </p>
                    <div className="space-y-2">
                      {droppableShapes.slice(0, 5).map((shape, idx) => {
                        const roomName = shape.customData?.['Room'] || shape.customData?.['room'] || shape.pageTitle;
                        const dropName = shape.customData?.['Drop Name'] || shape.customData?.['drop_name'] || shape.text;
                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="font-medium">{roomName}</span>
                            <span>-</span>
                            <span>{dropName || `Drop-${shape.id.substring(0, 8)}`}</span>
                          </div>
                        );
                      })}
                      {droppableShapes.length > 5 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                          ...and {droppableShapes.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {project.wiring_diagram_url && (
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ExternalLink}
                    onClick={() => window.open(project.wiring_diagram_url, '_blank')}
                  >
                    Open in Lucid Chart
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          variant="secondary"
          onClick={() => navigate('/pm-dashboard')}
        >
          Back to Projects
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/project/${projectId}/issues`)}
        >
          View Issues
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/project/${projectId}/wire-drops`)}
        >
          View Wire Drops
        </Button>
      </div>
    </div>
  );
};

export default PMProjectView;
