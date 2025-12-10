import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, contactsService, projectStakeholdersService, stakeholderRolesService } from '../services/supabaseService';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import MilestoneGaugesDisplay from './MilestoneGaugesDisplay';
import ProcurementDashboard from './procurement/ProcurementDashboard';
import {
  Plus,
  Loader,
  Search
} from 'lucide-react';

// Generate next project number in format YYYY-NNN
const generateNextProjectNumber = async () => {
  const currentYear = new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;

  // Get the highest project number for the current year
  const { data: projects, error } = await supabase
    .from('projects')
    .select('project_number')
    .like('project_number', `${yearPrefix}%`)
    .order('project_number', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching project numbers:', error);
    // Fallback to timestamp-based number
    return `${yearPrefix}${String(Date.now()).slice(-3)}`;
  }

  let nextNumber = 1;

  if (projects && projects.length > 0 && projects[0].project_number) {
    const lastNumber = projects[0].project_number;
    const match = lastNumber.match(new RegExp(`^${currentYear}-(\\d+)$`));
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  // Pad with zeros to 3 digits (e.g., 001, 012, 123)
  return `${yearPrefix}${String(nextNumber).padStart(3, '0')}`;
};

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
  const [projectOwners, setProjectOwners] = useState({});
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
  });
  const [internalContacts, setInternalContacts] = useState([]);
  const [stakeholderRoles, setStakeholderRoles] = useState([]);
  const [selectedPMId, setSelectedPMId] = useState('');
  const [selectedLeadTechId, setSelectedLeadTechId] = useState('');

  // Get query params and state
  const queryParams = new URLSearchParams(location.search);
  const initialView = queryParams.get('view');
  const returnTo = location.state?.returnTo;

  // Load projects and contacts on mount
  useEffect(() => {
    loadProjects();
    loadContacts();
    loadInternalContacts();
    loadStakeholderRoles();
  }, []);

  // Load project owners (stakeholders) for all projects
  useEffect(() => {
    const loadAllProjectOwners = async () => {
      if (projects.length === 0) return;

      try {
        const projectIds = projects.map(p => p.id);

        // Load all stakeholders for all projects in one query
        const { data: stakeholders, error } = await supabase
          .from('project_stakeholders')
          .select(`
            project_id,
            stakeholder_roles (name),
            contacts (first_name, last_name)
          `)
          .in('project_id', projectIds);

        if (error) throw error;

        // Group stakeholders by project
        const ownersByProject = {};
        projectIds.forEach(projectId => {
          const projectStakeholders = stakeholders?.filter(s => s.project_id === projectId) || [];
          const pm = projectStakeholders.find(s => s.stakeholder_roles?.name === 'Project Manager');
          // Check for both 'Lead Technician' and 'Technician' roles
          const tech = projectStakeholders.find(s =>
            s.stakeholder_roles?.name === 'Lead Technician' ||
            s.stakeholder_roles?.name === 'Technician'
          );

          ownersByProject[projectId] = {
            pm: pm?.contacts ? `${pm.contacts.first_name || ''} ${pm.contacts.last_name || ''}`.trim() : null,
            technician: tech?.contacts ? `${tech.contacts.first_name || ''} ${tech.contacts.last_name || ''}`.trim() : null
          };
        });

        setProjectOwners(ownersByProject);
      } catch (error) {
        console.error('Failed to load project owners:', error);
      }
    };

    loadAllProjectOwners();
  }, [projects]);

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
              const percentages = await milestoneService.getAllPercentagesOptimized(project.id);

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

  const loadInternalContacts = async () => {
    try {
      const data = await contactsService.getAll({ isInternal: true });
      console.log('[PMDashboard] Loaded internal contacts:', data?.length, 'contacts');
      console.log('[PMDashboard] Internal contacts roles:', data?.map(c => ({ name: c.full_name || c.name, role: c.role, dept: c.department })));
      setInternalContacts(data);
    } catch (error) {
      console.error('Failed to load internal contacts:', error);
    }
  };

  const loadStakeholderRoles = async () => {
    try {
      const data = await stakeholderRolesService.getAll();
      setStakeholderRoles(data);
    } catch (error) {
      console.error('Failed to load stakeholder roles:', error);
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

  // Sort internal contacts alphabetically by name for dropdowns
  // Show ALL internal contacts (not filtered by role) - user can pick anyone
  const sortedInternalContacts = useMemo(() => {
    return [...internalContacts].sort((a, b) => {
      const nameA = (a.full_name || a.name || '').toLowerCase();
      const nameB = (b.full_name || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [internalContacts]);

  // Get role IDs for stakeholder assignment
  const pmRoleId = useMemo(() => {
    return stakeholderRoles.find(r => r.name === 'Project Manager')?.id;
  }, [stakeholderRoles]);

  const techRoleId = useMemo(() => {
    return stakeholderRoles.find(r => r.name === 'Lead Technician')?.id ||
           stakeholderRoles.find(r => r.name === 'Technician')?.id;
  }, [stakeholderRoles]);

  const handleCreateProject = async () => {
    try {
      // Validation
      if (!newProject.name?.trim()) {
        alert('Project name is required');
        return;
      }
      if (!newProject.address?.trim() || !newProject.address.includes(',')) {
        alert('Please enter a valid address (City, State format minimum)');
        return;
      }
      if (!selectedPMId) {
        alert('Please assign a Project Manager');
        return;
      }
      if (!selectedLeadTechId) {
        alert('Please assign a Lead Technician');
        return;
      }

      // Auto-generate project number if not provided
      let projectNumber = newProject.project_number?.trim();
      if (!projectNumber) {
        projectNumber = await generateNextProjectNumber();
      }

      // Create project with client_contact_id and auto-generated project number
      const projectData = {
        ...newProject,
        project_number: projectNumber,
        client_contact_id: newProject.client_contact_id || null
      };
      const createdProject = await projectsService.create(projectData);

      // Create stakeholder assignments for PM and Lead Technician
      if (createdProject?.id) {
        try {
          if (pmRoleId) {
            await projectStakeholdersService.addToProject(createdProject.id, selectedPMId, pmRoleId, { isPrimary: true });
          }
          if (techRoleId) {
            await projectStakeholdersService.addToProject(createdProject.id, selectedLeadTechId, techRoleId, { isPrimary: true });
          }
        } catch (stakeholderError) {
          console.error('Failed to assign stakeholders:', stakeholderError);
          // Don't fail the whole operation, project is already created
        }
      }

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
      });
      setSelectedPMId('');
      setSelectedLeadTechId('');
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
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
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
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProject.address}
                    onChange={(e) => setNewProject({ ...newProject, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="123 Main St, City, State"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Must include city and state (e.g., City, State)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Project Number <span className="text-gray-400 font-normal">(auto-generated if empty)</span>
                  </label>
                  <input
                    type="text"
                    value={newProject.project_number}
                    onChange={(e) => setNewProject({ ...newProject, project_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="e.g., 2025-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Phase
                  </label>
                  <select
                    value={newProject.phase}
                    onChange={(e) => setNewProject({ ...newProject, phase: e.target.value })}
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
                    onChange={(e) => setNewProject({ ...newProject, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Project Manager <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedPMId}
                    onChange={(e) => setSelectedPMId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="">Select a Project Manager...</option>
                    {sortedInternalContacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                        {contact.full_name || contact.name || 'Unnamed'}
                        {contact.role && ` - ${contact.role}`}
                      </option>
                    ))}
                  </select>
                  {sortedInternalContacts.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      No internal contacts found. Add internal contacts first.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Lead Technician <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedLeadTechId}
                    onChange={(e) => setSelectedLeadTechId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="">Select a Lead Technician...</option>
                    {sortedInternalContacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                        {contact.full_name || contact.name || 'Unnamed'}
                        {contact.role && ` - ${contact.role}`}
                      </option>
                    ))}
                  </select>
                  {sortedInternalContacts.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      No internal contacts found. Add internal contacts first.
                    </p>
                  )}
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
                      onChange={(e) => setNewProject({ ...newProject, wiring_diagram_url: e.target.value })}
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
                      onChange={(e) => setNewProject({ ...newProject, portal_proposal_url: e.target.value })}
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
                      <MilestoneGaugesDisplay
                        milestonePercentages={milestonePercentages[project.id] || {}}
                        projectOwners={projectOwners[project.id] || { pm: null, technician: null }}
                        startCollapsed={true}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Procurement Dashboard - Shows after projects */}
        <ProcurementDashboard
          initialView={initialView}
          returnTo={returnTo}
        />
      </div>
    </div>
  );
};

export default PMDashboard;
