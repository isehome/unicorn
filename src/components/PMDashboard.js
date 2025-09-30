import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService } from '../services/supabaseService';
import Button from './ui/Button';
import { 
  Plus, 
  FileText, 
  Image, 
  Package, 
  ExternalLink, 
  Edit, 
  Clock,
  Folder,
  ChevronRight,
  Loader
} from 'lucide-react';

const PMDashboard = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    client: '',
    address: '',
    project_number: '',
    phase: '',
    status: 'active',
    wiring_diagram_url: '',
    portal_proposal_url: '',
    one_drive_photos: '',
    one_drive_files: '',
    one_drive_procurement: '',
  });

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await projectsService.getAll();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    try {
      if (!newProject.name || !newProject.address) {
        alert('Please fill in required fields');
        return;
      }

      await projectsService.create(newProject);
      setNewProject({
        name: '',
        client: '',
        address: '',
        project_number: '',
        phase: '',
        status: 'active',
        wiring_diagram_url: '',
        portal_proposal_url: '',
        one_drive_photos: '',
        one_drive_files: '',
        one_drive_procurement: '',
      });
      setShowNewProjectForm(false);
      loadProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }
  };

  const handleProjectClick = (projectId) => {
    navigate(`/pm/project/${projectId}`);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'completed':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
      case 'cancelled':
        return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getPhaseColor = (phase) => {
    switch (phase?.toLowerCase()) {
      case 'planning':
        return 'text-violet-600 dark:text-violet-400';
      case 'pre-wire':
      case 'prewire':
        return 'text-orange-600 dark:text-orange-400';
      case 'trim':
        return 'text-blue-600 dark:text-blue-400';
      case 'final':
      case 'complete':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div style={sectionStyles.header} className="shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text text-transparent">
              Project Manager Dashboard
            </h1>
            <Button 
              variant="primary" 
              icon={Plus}
              onClick={() => setShowNewProjectForm(!showNewProjectForm)}
            >
              {showNewProjectForm ? 'Cancel' : 'New Project'}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Create New Project Form (Collapsible) */}
        {showNewProjectForm && (
          <div style={sectionStyles.card} className="mb-6 animate-in fade-in duration-200">
            <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
              Create New Project
            </h2>
            
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="Enter project name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Client
                  </label>
                  <input
                    type="text"
                    value={newProject.client}
                    onChange={(e) => setNewProject({...newProject, client: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Address *
                  </label>
                  <input
                    type="text"
                    value={newProject.address}
                    onChange={(e) => setNewProject({...newProject, address: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="Enter project address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Project Number
                  </label>
                  <input
                    type="text"
                    value={newProject.project_number}
                    onChange={(e) => setNewProject({...newProject, project_number: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="Enter project number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Phase
                  </label>
                  <select
                    value={newProject.phase}
                    onChange={(e) => setNewProject({...newProject, phase: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* URLs Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                  Documentation Links (Optional)
                </h3>
                
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Wiring Diagram URL
                    </label>
                    <input
                      type="url"
                      value={newProject.wiring_diagram_url}
                      onChange={(e) => setNewProject({...newProject, wiring_diagram_url: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Portal Proposal URL
                    </label>
                    <input
                      type="url"
                      value={newProject.portal_proposal_url}
                      onChange={(e) => setNewProject({...newProject, portal_proposal_url: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <Button variant="primary" size="md" icon={Plus} onClick={handleCreateProject}>
                  Create Project
                </Button>
                <Button variant="secondary" size="md" onClick={() => setShowNewProjectForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Existing Projects List */}
        <div style={sectionStyles.card}>
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
            All Projects ({projects.length})
          </h2>

          {projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 mb-4">No projects found</p>
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setShowNewProjectForm(true)}
              >
                Create Your First Project
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project.id)}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md 
                           transition-all cursor-pointer group bg-white dark:bg-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                          {project.name}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(project.status)}`}>
                          {project.status || 'active'}
                        </span>
                        {project.phase && (
                          <span className={`text-xs font-medium ${getPhaseColor(project.phase)}`}>
                            {project.phase}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        {project.project_number && (
                          <span>#{project.project_number}</span>
                        )}
                        {project.client && (
                          <span>Client: {project.client}</span>
                        )}
                        {project.address && (
                          <span>{project.address}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2">
                        {project.wiring_diagram_url && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <FileText className="w-3 h-3" />
                            Wiring Diagram
                          </span>
                        )}
                        {project.one_drive_photos && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Image className="w-3 h-3" />
                            Photos
                          </span>
                        )}
                        {project.one_drive_files && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Folder className="w-3 h-3" />
                            Files
                          </span>
                        )}
                        {project.one_drive_procurement && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Package className="w-3 h-3" />
                            Procurement
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Edit}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProjectClick(project.id);
                        }}
                      >
                        Edit
                      </Button>
                      <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PMDashboard;
