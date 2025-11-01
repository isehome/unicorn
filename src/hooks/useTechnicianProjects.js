import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { milestoneService } from '../services/milestoneService';

/**
 * Custom hook for managing technician project data, including:
 * - Project filtering (my projects vs all projects)
 * - Milestone percentages loading
 * - Project owners/stakeholders loading
 *
 * This hook optimizes performance by loading all data in parallel.
 */
export const useTechnicianProjects = (projects, userProjectIds, user) => {
  const [showMyProjects, setShowMyProjects] = useState(() => {
    const saved = localStorage.getItem('dashboard_show_my_projects');
    return saved === 'true' || saved === null;
  });

  const [milestonePercentages, setMilestonePercentages] = useState({});
  const [projectOwners, setProjectOwners] = useState({});

  // Load milestone percentages for all projects - SUPER OPTIMIZED: Single batch query using materialized view
  useEffect(() => {
    const loadMilestonePercentages = async () => {
      if (!projects || projects.length === 0) return;

      try {
        // Extract all project IDs
        const projectIds = projects.map(p => p.id);

        // Fetch all milestones in ONE query using the materialized view
        const milestoneData = await milestoneService.getAllPercentagesBatch(projectIds);

        setMilestonePercentages(milestoneData);
        console.log(`[Dashboard] Loaded milestones for ${Object.keys(milestoneData).length} projects`);
      } catch (error) {
        console.error('Failed to load milestone percentages:', error);
        // Set empty object on error
        setMilestonePercentages({});
      }
    };

    loadMilestonePercentages();
  }, [projects]);

  // Load project owners (stakeholders) for all projects
  useEffect(() => {
    const loadAllProjectOwners = async () => {
      if (!projects) return;

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

  // Memoized project filtering
  const displayedProjects = useMemo(() => {
    if (!projects) return [];
    if (!showMyProjects) return projects;
    if (!userProjectIds?.length) return [];

    const idSet = new Set(userProjectIds);
    return projects.filter((project) => idSet.has(project.id));
  }, [projects, showMyProjects, userProjectIds]);

  // Toggle handler with localStorage persistence
  const handleToggleProjectView = (showMy) => {
    setShowMyProjects(showMy);
    localStorage.setItem('dashboard_show_my_projects', String(showMy));
  };

  return {
    showMyProjects,
    displayedProjects,
    milestonePercentages,
    projectOwners,
    handleToggleProjectView
  };
};
