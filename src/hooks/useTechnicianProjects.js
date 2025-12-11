import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';

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

  // Load milestone percentages for all projects - use cache → batch view → optimized per-project refresh
  useEffect(() => {
    if (!projects || projects.length === 0) {
      setMilestonePercentages({});
      return;
    }

    const projectIds = projects.map(p => p.id);

    // STEP 1: hydrate from cache (instant display)
    const cachedBatch = milestoneCacheService.getCachedBatch(projectIds);
    const cachedMap = {};
    Object.entries(cachedBatch).forEach(([projectId, cachedEntry]) => {
      if (cachedEntry?.data) {
        cachedMap[projectId] = cachedEntry.data;
      }
    });
    if (Object.keys(cachedMap).length > 0) {
      setMilestonePercentages(prev => ({ ...cachedMap, ...prev }));
    }

    let isCancelled = false;

    const loadMilestonePercentages = async () => {
      try {
        // STEP 2: fast batch read from materialized view
        const batchData = await milestoneService.getAllPercentagesBatch(projectIds);
        if (!isCancelled && batchData) {
          setMilestonePercentages(prev => ({ ...prev, ...batchData }));
          Object.entries(batchData).forEach(([projectId, data]) => {
            milestoneCacheService.setCached(projectId, data);
          });
        }
      } catch (error) {
        console.error('Failed to load milestone percentages (batch):', error);
      }

      try {
        // STEP 3: precise refresh per project using optimized calculator (matches detail pages)
        const refreshed = {};
        await Promise.all(
          projectIds.map(async (projectId) => {
            try {
              const data = await milestoneService.getAllPercentagesOptimized(projectId);
              refreshed[projectId] = data;
              milestoneCacheService.setCached(projectId, data);
            } catch (error) {
              console.warn(`[Dashboard] Precise milestone load failed for project ${projectId}:`, error);
            }
          })
        );

        if (!isCancelled && Object.keys(refreshed).length > 0) {
          setMilestonePercentages(prev => ({ ...prev, ...refreshed }));
        }
      } catch (error) {
        console.error('Failed to refresh milestone percentages:', error);
      }
    };

    loadMilestonePercentages();

    return () => {
      isCancelled = true;
    };
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

    // userProjectIds should be an array of UUIDs
    const ids = Array.isArray(userProjectIds) ? userProjectIds : [];
    if (ids.length === 0) return [];

    const idSet = new Set(ids);
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
