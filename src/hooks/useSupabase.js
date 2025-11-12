import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  contactsService,
  projectsService,
  issuesService
} from '../services/supabaseService';

// Request deduplication cache
const requestCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

// Helper to create cache key
const getCacheKey = (type, filters = {}) => {
  return `${type}:${JSON.stringify(filters)}`;
};

// Helper to deduplicate requests
const deduplicateRequest = async (cacheKey, fetcher) => {
  // Check if we have an ongoing request for this key
  const cached = requestCache.get(cacheKey);
  
  if (cached) {
    // If the request is still pending, return the promise
    if (cached.promise) {
      return cached.promise;
    }
    
    // If we have cached data and it's not expired, return it
    if (cached.data && Date.now() - cached.timestamp < CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
  }
  
  // Create new request
  const promise = fetcher().then(
    (data) => {
      // Cache successful result
      requestCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        promise: null
      });
      return data;
    },
    (error) => {
      // Remove from cache on error
      requestCache.delete(cacheKey);
      throw error;
    }
  );
  
  // Store the promise in cache
  requestCache.set(cacheKey, { promise });
  
  return promise;
};

// Hook for contacts with deduplication
export const useContacts = (filters = {}) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const serializedFilters = useMemo(() => JSON.stringify(filters || {}), [filters]);
  const stableFilters = useMemo(() => {
    if (!filters || typeof filters !== 'object') return {};
    // Create a shallow clone to ensure consistent reference for downstream logic
    return { ...filters };
  }, [serializedFilters]);

  const fetchContacts = useCallback(async (forceRefresh = false) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const cacheKey = getCacheKey('contacts', stableFilters);
    
    // Clear cache if force refresh
    if (forceRefresh) {
      requestCache.delete(cacheKey);
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await deduplicateRequest(cacheKey, () => 
        contactsService.getAll(stableFilters)
      );
      
      if (mountedRef.current) {
        setContacts(data);
        setError(null);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && mountedRef.current) {
        setError(err.message);
        setContacts([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [stableFilters]);

  useEffect(() => {
    mountedRef.current = true;
    fetchContacts();
    
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchContacts]);

  const refresh = useCallback(() => {
    fetchContacts(true);
  }, [fetchContacts]);

  const createContact = useCallback(async (payload) => {
    const created = await contactsService.create(payload);
    await fetchContacts(true);
    return created;
  }, [fetchContacts]);

  const updateContact = useCallback(async (id, updates) => {
    const updated = await contactsService.update(id, updates);
    await fetchContacts(true);
    return updated;
  }, [fetchContacts]);

  const deleteContact = useCallback(async (id) => {
    await contactsService.delete(id);
    await fetchContacts(true);
  }, [fetchContacts]);

  return { contacts, loading, error, refresh, createContact, updateContact, deleteContact };
};

// Hook for projects with deduplication
export const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchProjects = useCallback(async (forceRefresh = false) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const cacheKey = getCacheKey('projects');
    
    // Clear cache if force refresh
    if (forceRefresh) {
      requestCache.delete(cacheKey);
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await deduplicateRequest(cacheKey, () => 
        projectsService.getAll()
      );
      
      if (mountedRef.current) {
        setProjects(data);
        setError(null);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && mountedRef.current) {
        console.error('Failed to fetch projects:', err);
        setError(err.message);
        setProjects([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchProjects();
    
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProjects]);

  const refresh = useCallback(() => {
    fetchProjects(true);
  }, [fetchProjects]);

  return { projects, loading, error, refresh };
};

// Hook for issues with deduplication
export const useIssues = (projectId = null) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchIssues = useCallback(async (forceRefresh = false) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const cacheKey = getCacheKey('issues', { projectId });
    
    // Clear cache if force refresh
    if (forceRefresh) {
      requestCache.delete(cacheKey);
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await deduplicateRequest(cacheKey, () => 
        issuesService.getAll(projectId)
      );
      
      if (mountedRef.current) {
        setIssues(data);
        setError(null);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && mountedRef.current) {
        console.error('Failed to fetch issues:', err);
        setError(err.message);
        setIssues([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchIssues();
    
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchIssues]);

  const refresh = useCallback(() => {
    fetchIssues(true);
  }, [fetchIssues]);

  return { issues, loading, error, refresh };
};

// Clear all cached data
export const clearSupabaseCache = () => {
  requestCache.clear();
};

// Clear specific cache entries
export const clearCacheForType = (type) => {
  const keysToDelete = [];
  requestCache.forEach((_, key) => {
    if (key.startsWith(`${type}:`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => requestCache.delete(key));
};
