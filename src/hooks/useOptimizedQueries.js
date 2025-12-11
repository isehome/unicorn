import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateRelatedQueries } from '../lib/queryClient';
import {
  contactsService,
  projectsService,
  projectStakeholdersService,
  issuesService,
  projectTodosService,
  todoStakeholdersService,
  stakeholderRolesService
} from '../services/supabaseService';
import { fetchTodayEvents } from '../services/microsoftCalendarService';
import { supabase } from '../lib/supabase';

// Optimized Projects Hook
export const useProjectsOptimized = () => {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projectsService.getAll(),
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
};

// Optimized Project Details Hook
export const useProjectDetailsOptimized = (projectId) => {
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => projectsService.getWithStakeholders(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
};

// Optimized Issues Hook
export const useIssuesOptimized = (projectId = null) => {
  return useQuery({
    queryKey: projectId ? queryKeys.projectIssues(projectId) : queryKeys.issues,
    queryFn: () => issuesService.getAll(projectId),
    staleTime: 3 * 60 * 1000, // Issues are more dynamic, shorter stale time
  });
};

// Optimized Contacts Hook
export const useContactsOptimized = (filters = {}) => {
  return useQuery({
    queryKey: queryKeys.contactsFiltered(filters),
    queryFn: () => contactsService.getAll(filters),
    staleTime: 10 * 60 * 1000, // Contacts don't change often
  });
};

// Optimized User Projects Hook
export const useUserProjectsOptimized = (userEmail) => {
  return useQuery({
    queryKey: queryKeys.userProjects(userEmail),
    queryFn: () => projectStakeholdersService.getInternalProjectIdsByEmail(userEmail),
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
  });
};

// Optimized Calendar Events Hook - Now with auth context support and lazy loading
export const useCalendarEventsOptimized = (authContext, options = {}) => {
  return useQuery({
    queryKey: queryKeys.calendarEvents,
    queryFn: async () => {
      // Use the new MSAL-based method with auth context
      if (authContext && authContext.accessToken !== undefined) {
        return fetchTodayEvents(authContext);
      }
      // Return empty result if not authenticated
      console.warn('Calendar: No authentication context available');
      return {
        connected: false,
        events: [],
        error: 'Calendar not connected. Please sign in.',
      };
    },
    staleTime: 15 * 60 * 1000, // Calendar events cached for 15 minutes
    refetchInterval: 30 * 60 * 1000, // Auto-refresh every 30 minutes
    retry: 1, // Reduce retries to avoid multiple auth redirects
    enabled: options.enabled !== false, // Allow lazy loading
  });
};

// Optimized Project Todos Hook
export const useProjectTodosOptimized = (projectId) => {
  return useQuery({
    queryKey: queryKeys.projectTodos(projectId),
    queryFn: () => projectTodosService.getForProject(projectId),
    enabled: !!projectId,
    staleTime: 3 * 60 * 1000,
  });
};

// Optimized Stakeholder Roles Hook
export const useStakeholderRolesOptimized = () => {
  return useQuery({
    queryKey: queryKeys.stakeholderRoles,
    queryFn: () => stakeholderRolesService.getAll(),
    staleTime: 30 * 60 * 1000, // Roles rarely change
  });
};

// Optimized Wire Drops Hook
export const useWireDropsOptimized = (projectId) => {
  return useQuery({
    queryKey: queryKeys.wireDrops(projectId),
    queryFn: async () => {
      if (!supabase || !projectId) return [];
      const { data, error } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId)
        .order('uid');
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId && !!supabase,
    staleTime: 5 * 60 * 1000,
  });
};

// Mutation for updating todos with cache invalidation
export const useTodoMutation = () => {
  const queryClient = useQueryClient();

  return {
    create: useMutation({
      mutationFn: ({ projectId, title }) => projectTodosService.create(projectId, title),
      onSuccess: (data, { projectId }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTodos(projectId) });
      },
    }),

    toggle: useMutation({
      mutationFn: ({ id, completed }) => projectTodosService.toggleCompletion(id, completed),
      onMutate: async ({ id, completed, projectId }) => {
        // Optimistic update
        await queryClient.cancelQueries({ queryKey: queryKeys.projectTodos(projectId) });
        const previousTodos = queryClient.getQueryData(queryKeys.projectTodos(projectId));

        queryClient.setQueryData(queryKeys.projectTodos(projectId), (old = []) =>
          old.map(todo => todo.id === id ? { ...todo, completed } : todo)
        );

        return { previousTodos };
      },
      onError: (err, { projectId }, context) => {
        // Rollback on error
        queryClient.setQueryData(queryKeys.projectTodos(projectId), context.previousTodos);
      },
      onSettled: (data, error, { projectId }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTodos(projectId) });
      },
    }),

    delete: useMutation({
      mutationFn: ({ id }) => projectTodosService.remove(id),
      onSuccess: (data, { projectId }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTodos(projectId) });
      },
    }),
  };
};

// Batch query prefetching for route transitions
export const prefetchProjectData = async (queryClient, projectId) => {
  const promises = [
    queryClient.prefetchQuery({
      queryKey: queryKeys.project(projectId),
      queryFn: () => projectsService.getWithStakeholders(projectId),
      staleTime: 5 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.projectTodos(projectId),
      queryFn: () => projectTodosService.getForProject(projectId),
      staleTime: 3 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.projectIssues(projectId),
      queryFn: () => issuesService.getAll(projectId),
      staleTime: 3 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.wireDrops(projectId),
      queryFn: async () => {
        if (!supabase) return [];
        const { data, error } = await supabase
          .from('wire_drops')
          .select('*')
          .eq('project_id', projectId)
          .order('uid');
        if (error) throw error;
        return data || [];
      },
      staleTime: 5 * 60 * 1000,
    }),
  ];

  await Promise.all(promises);
};

export const useUserTodosOptimized = (userEmail) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-todos', userEmail],
    queryFn: () => projectTodosService.getAllForUser(userEmail),
    enabled: !!userEmail,
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
};

export const useTodoStakeholders = (todoId) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['todo-stakeholders', todoId],
    queryFn: () => todoStakeholdersService.getForTodo(todoId),
    enabled: !!todoId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
};

// Combined dashboard data hook for reduced requests
export const useDashboardData = (userEmail, authContext) => {
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects-list'],
    queryFn: projectsService.getAll,
    staleTime: 1000 * 60 * 5
  });

  const { data: userProjectIds = [] } = useQuery({
    queryKey: ['user-project-ids', userEmail],
    queryFn: () => projectStakeholdersService.getInternalProjectIdsByEmail(userEmail),
    enabled: !!userEmail,
    staleTime: 1000 * 60 * 15
  });

  const calendar = useCalendarEventsOptimized(authContext);

  // Use the new hook for user todos
  const userTodos = useUserTodosOptimized(userEmail);

  const counts = useQuery({
    queryKey: ['dashboard-counts', userEmail],
    queryFn: async () => {
      if (!userEmail) return { todos: { open: 0, total: 0 }, issues: { open: 0, blocked: 0 } };

      const projectIds = await projectStakeholdersService.getInternalProjectIdsByEmail(userEmail);

      if (!projectIds.length) return { todos: { open: 0, total: 0 }, issues: { open: 0, blocked: 0 } };

      const [openTodos, totalTodos, openIssues, blockedIssues] = await Promise.all([
        supabase
          .from('project_todos')
          .select('id', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .eq('is_complete', false)
          .then(res => res.count || 0),
        supabase
          .from('project_todos')
          .select('id', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .then(res => res.count || 0),
        supabase
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .neq('status', 'resolved')
          .then(res => res.count || 0),
        supabase
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .in('project_id', projectIds)
          .eq('status', 'blocked')
          .then(res => res.count || 0)
      ]);
      return {
        todos: { open: openTodos, total: totalTodos },
        issues: { open: openIssues, blocked: blockedIssues }
      };
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
  });

  return {
    projects: { data: projects, isLoading: projectsLoading },
    userProjectIds: { data: userProjectIds },
    calendar,
    userTodos,
    counts: {
      data: counts.data,
      isLoading: counts.isLoading
    }
  };
};
