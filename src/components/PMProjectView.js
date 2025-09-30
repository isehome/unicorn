import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService } from '../services/supabaseService';
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
  Camera
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

  // Load project data and time tracking info
  useEffect(() => {
    loadProjectData();
    loadTimeData();
    
    // Refresh time data every 30 seconds
    const interval = setInterval(loadTimeData, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

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
      await projectsService.update(projectId, formData);
      setProject({ ...project, ...formData });
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
              disabled={!editMode}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
            >
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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
        </div>
      </div>

      {/* Microsoft/OneDrive Links */}
      <div style={sectionStyles.card} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Document Links
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Wiring Diagram URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                name="wiring_diagram_url"
                value={formData.wiring_diagram_url}
                onChange={handleInputChange}
                disabled={!editMode}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              />
              {formData.wiring_diagram_url && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => window.open(formData.wiring_diagram_url, '_blank')}
                >
                  Open
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Portal Proposal URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                name="portal_proposal_url"
                value={formData.portal_proposal_url}
                onChange={handleInputChange}
                disabled={!editMode}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              />
              {formData.portal_proposal_url && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => window.open(formData.portal_proposal_url, '_blank')}
                >
                  Open
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Camera className="w-4 h-4 inline mr-1" />
              OneDrive Photos Folder
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                name="one_drive_photos"
                value={formData.one_drive_photos}
                onChange={handleInputChange}
                disabled={!editMode}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              />
              {formData.one_drive_photos && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => window.open(formData.one_drive_photos, '_blank')}
                >
                  Open
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FolderOpen className="w-4 h-4 inline mr-1" />
              OneDrive Files Folder
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                name="one_drive_files"
                value={formData.one_drive_files}
                onChange={handleInputChange}
                disabled={!editMode}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              />
              {formData.one_drive_files && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => window.open(formData.one_drive_files, '_blank')}
                >
                  Open
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FolderOpen className="w-4 h-4 inline mr-1" />
              OneDrive Procurement Folder
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                name="one_drive_procurement"
                value={formData.one_drive_procurement}
                onChange={handleInputChange}
                disabled={!editMode}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
              />
              {formData.one_drive_procurement && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ExternalLink}
                  onClick={() => window.open(formData.one_drive_procurement, '_blank')}
                >
                  Open
                </Button>
              )}
            </div>
          </div>
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

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          variant="secondary"
          onClick={() => navigate('/pm-dashboard')}
        >
          Back to Dashboard
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/project/${projectId}/stakeholders`)}
        >
          Manage Stakeholders
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
