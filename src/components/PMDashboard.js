import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, contactsService } from '../services/supabaseService';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import Button from './ui/Button';
import UnifiedProgressGauge from './UnifiedProgressGauge';
import ProcurementDashboard from './procurement/ProcurementDashboard';
import {
  Plus,
  Loader,
  Search
} from 'lucide-react';

const PMDashboard = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const sectionStyles = enhancedStyles.sections[mode];
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState([]);
  const [milestonePercentages, setMilestonePercentages] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    client: '',
    client_contact_id: '',
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

  // Load projects and contacts on mount
  useEffect(() => {
    loadProjects();
    loadContacts();
  }, []);

  // Invalidate cache if coming back from a project detail page
  useEffect(() => {
    if (location.state?.refreshCache) {
      const projectId = location.state.projectId;
      if (projectId) {
        milestoneCacheService.invalidate(projectId);
      }
      // Clear the state so it doesn't trigger again
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // STEP 1: Load cached milestone data immediately (instant display)
  useEffect(() => {
    if (projects.length === 0) return;

    const projectIds = projects.map(p => p.id);
    const cachedData = milestoneCacheService.getCachedBatch(projectIds);

    // Immediately populate state with cached data
    const milestoneData = {};
    Object.entries(cachedData).forEach(([projectId, cached]) => {
      milestoneData[projectId] = cached.data;
    });

    if (Object.keys(milestoneData).length > 0) {
      setMilestonePercentages(milestoneData);
    }
  }, [projects]);

  // STEP 2: Fetch fresh data in background (parallel for all projects)
  useEffect(() => {
    const loadProgressInBackground = async () => {
      if (projects.length === 0) return;

      setIsRefreshing(true);

      try {
        // Fetch all projects in parallel using Promise.all
        const results = await Promise.all(
          projects.map(async (project) => {
            try {
              const percentages = await milestoneService.calculateAllPercentages(project.id);

              // Cache the fresh data
              milestoneCacheService.setCached(project.id, percentages);

              return {
                id: project.id,
                percentages,
                success: true
              };
            } catch (error) {
              console.error(`Failed to load progress for project ${project.id}:`, error);
              return {
                id: project.id,
                percentages: {
                  planning_design: 0,
                  prewire_prep: 0,
                  prewire: 0,
                  trim_prep: 0,
                  trim: 0,
                  commissioning: 0
                },
                success: false
              };
            }
          })
        );

        // Update state with fresh data
        const milestoneData = {};
        results.forEach(result => {
          milestoneData[result.id] = result.percentages;
        });

        setMilestonePercentages(milestoneData);
      } catch (error) {
        console.error('Error loading milestone data in background:', error);
      } finally {
        setIsRefreshing(false);
      }
    };

    loadProgressInBackground();
  }, [projects]);

  const loadContacts = async () => {
    try {
      const data = await contactsService.getAll();
      setContacts(data);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

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

      // Create project with client_contact_id
      const projectData = {
        ...newProject,
        client_contact_id: newProject.client_contact_id || null
      };
      await projectsService.create(projectData);
      setNewProject({
        name: '',
        client: '',
        client_contact_id: '',
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

  // Filter projects based on search term - must be before any conditional returns
  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    
    const search = searchTerm.toLowerCase();
    return projects.filter(project => 
      project.name?.toLowerCase().includes(search) ||
      project.client?.toLowerCase().includes(search) ||
      project.address?.toLowerCase().includes(search) ||
      project.project_number?.toLowerCase().includes(search) ||
      project.phase?.toLowerCase().includes(search)
    );
  }, [projects, searchTerm]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Procurement Dashboard - Shows before projects */}
        <ProcurementDashboard />

        {/* Create New Project Form (Collapsible) */}
        {showNewProjectForm && (
          <div style={sectionStyles.card} className="mb-6 animate-in fade-in duration-200">
            <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
              Create New Project
            </h2>
            
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <select
                    value={newProject.client_contact_id}
                    onChange={(e) => {
                      const selectedContact = contacts.find(c => c.id === e.target.value);
                      setNewProject({
                        ...newProject, 
                        client_contact_id: e.target.value,
                        client: selectedContact ? (selectedContact.full_name || selectedContact.name || selectedContact.company || '') : ''
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                All Projects ({filteredProjects.length})
              </h2>
              {isRefreshing && (
                <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                  <Loader className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">Updating...</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-60 pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white 
                           focus:ring-2 focus:ring-violet-500 focus:border-transparent
                           placeholder-gray-500 dark:placeholder-gray-400 text-sm sm:text-base"
                />
              </div>
              <Button 
                variant="primary" 
                icon={Plus}
                onClick={() => setShowNewProjectForm(!showNewProjectForm)}
                className="flex-shrink-0 text-sm sm:text-base"
              >
                <span className="hidden sm:inline">{showNewProjectForm ? 'Cancel' : 'New Project'}</span>
                <span className="sm:hidden">{showNewProjectForm ? 'Cancel' : 'New'}</span>
              </Button>
            </div>
          </div>

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
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No projects match your search.</p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProjects.map((project) => {
                return (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project.id)}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md 
                             transition-all cursor-pointer group bg-white dark:bg-gray-800"
                  >
                    {/* Simplified Layout - Project Name + Progress Only */}
                    <div className="space-y-3">
                      {/* Project Name */}
                      <h3 className="font-semibold text-base sm:text-lg text-gray-900 dark:text-white">
                        {project.name}
                      </h3>
                      
                      {/* Progress Gauges */}
                      <div className="space-y-2">
                        <UnifiedProgressGauge
                          label="Prewire Prep"
                          percentage={milestonePercentages[project.id]?.prewire_prep || 0}
                          compact={true}
                        />
                        <UnifiedProgressGauge
                          label="Prewire"
                          percentage={milestonePercentages[project.id]?.prewire || 0}
                          compact={true}
                        />
                        <UnifiedProgressGauge
                          label="Trim Prep"
                          percentage={milestonePercentages[project.id]?.trim_prep || 0}
                          compact={true}
                        />
                        <UnifiedProgressGauge
                          label="Trim"
                          percentage={milestonePercentages[project.id]?.trim || 0}
                          compact={true}
                        />
                        <UnifiedProgressGauge
                          label="Commissioning"
                          percentage={milestonePercentages[project.id]?.commissioning || 0}
                          compact={true}
                        />
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

export default PMDashboard;
