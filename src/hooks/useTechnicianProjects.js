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

  // Load milestone percentages for all projects - OPTIMIZED: Parallel loading using Promise.all
  useEffect(() => {
    const loadMilestonePercentages = async () => {
      if (!projects) return;

      const milestoneData = {};

      // Run all project calculations in parallel
      const milestonePromises = projects.map(async (project) => {
        try {
          const percentages = await milestoneService.calculateAllPercentages(project.id);
          return {
            projectId: project.id,
            percentages
          };
        } catch (error) {
          console.error(`Failed to load milestone percentages for project ${project.id}:`, error);
          return {
            projectId: project.id,
            percentages: {
              planning_design: 0,
              prewire_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
              prewire_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
              prewire: 0,
              prewire_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
              trim_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
              trim_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
              trim: 0,
              trim_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
              commissioning: 0,
              prewire_prep: 0,
              trim_prep: 0
            }
          };
        }
      });

      // Wait for all promises to resolve
      const results = await Promise.all(milestonePromises);

      // Populate milestone data
      results.forEach(({ projectId, percentages }) => {
        milestoneData[projectId] = percentages;
      });

      setMilestonePercentages(milestoneData);
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
