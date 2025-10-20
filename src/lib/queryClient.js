import { QueryClient } from '@tanstack/react-query';

// Create a query client with optimized settings for performance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 30 seconds
      staleTime: 30000,
      // Keep cache for 5 minutes
      cacheTime: 300000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect unless stale
      refetchOnReconnect: 'always',
      // Enable background refetch
      refetchInterval: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

// Query keys for consistent caching
export const queryKeys = {
  projects: ['projects'],
  project: (id) => ['project', id],
  projectStakeholders: (id) => ['project', id, 'stakeholders'],
  projectTodos: (id) => ['project', id, 'todos'],
  projectIssues: (id) => ['project', id, 'issues'],
  issues: ['issues'],
  issue: (id) => ['issue', id],
  contacts: ['contacts'],
  contactsFiltered: (filters) => ['contacts', filters],
  stakeholderRoles: ['stakeholder-roles'],
  wireDrops: (projectId) => ['wire-drops', projectId],
  userProjects: (email) => ['user-projects', email],
  calendarEvents: ['calendar-events'],
  parts: ['global-parts'],
  part: (id) => ['global-part', id],
};

// Helper to invalidate related queries
export const invalidateRelatedQueries = async (queryClient, entity, id) => {
  const invalidations = [];
  
  switch (entity) {
    case 'project':
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
        queryClient.invalidateQueries({ queryKey: queryKeys.project(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectStakeholders(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTodos(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectIssues(id) })
      );
      break;
    case 'issue':
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.issues }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) })
      );
      break;
    case 'contact':
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.contactsFiltered })
      );
      break;
    default:
      break;
  }
  
  return Promise.all(invalidations);
};
