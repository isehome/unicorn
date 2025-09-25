import { useState, useEffect, useCallback } from 'react';
import {
  contactsService,
  projectsService,
  projectStakeholdersService,
  stakeholderRolesService,
  issuesService
} from '../services/supabaseService';

// Hook for contacts
export const useContacts = (filters = {}) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await contactsService.getAll(filters);
      setContacts(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const refresh = useCallback(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { contacts, loading, error, refresh };
};

// Hook for projects
export const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.getAll();
      setProjects(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError(err.message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error };
};

// Hook for issues
export const useIssues = (projectId = null) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);
      const data = await issuesService.getAll(projectId);
      setIssues(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      setError(err.message);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  return { issues, loading, error };
};