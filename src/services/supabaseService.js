import { supabase } from '../lib/supabase';

const handleError = (error, defaultMessage) => {
  console.error(defaultMessage, error);
  throw new Error(error?.message || defaultMessage);
};

const DEFAULT_INTERNAL_STAKEHOLDERS = [
  {
    key: 'orders',
    displayName: 'Orders',
    email: 'orders@isehome.com',
    roleName: 'Orders',
    department: 'Operations',
    company: 'Intelligent Systems'
  },
  {
    key: 'accounting',
    displayName: 'Accounting',
    email: 'accounting@isehome.com',
    roleName: 'Accounting',
    department: 'Finance',
    company: 'Intelligent Systems'
  }
];

const ensuredDefaultStakeholderProjects = new Set();

const normalizeEmail = (email = '') => `${email}`.trim().toLowerCase();

const ensureStakeholderRole = async (roleName, description = null) => {
  if (!supabase || !roleName) return null;

  const normalizedName = roleName.trim();

  try {
    const { data: existing } = await supabase
      .from('stakeholder_roles')
      .select('id')
      .eq('name', normalizedName)
      .maybeSingle();

    if (existing?.id) {
      return existing.id;
    }

    const { data, error } = await supabase
      .from('stakeholder_roles')
      .insert([{
        name: normalizedName,
        category: 'internal',
        description: description || `Auto-generated role for ${normalizedName}`,
        sort_order: 50
      }])
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.error('Failed to ensure stakeholder role:', error);
    return null;
  }
};

const ensureInternalContact = async (spec) => {
  if (!supabase || !spec?.email) return null;
  const email = normalizeEmail(spec.email);

  try {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (existing?.id) {
      return existing.id;
    }

    const [firstName, ...rest] = (spec.displayName || '').trim().split(' ');
    const lastName = rest.join(' ');

    const insertPayload = {
      name: spec.displayName || spec.roleName,
      full_name: spec.displayName || spec.roleName,
      first_name: firstName || spec.displayName || spec.roleName,
      last_name: lastName || '',
      email,
      company: spec.company || 'Internal',
      role: spec.roleName || spec.displayName,
      department: spec.department || null,
      is_internal: true,
      is_active: true
    };

    const { data, error } = await supabase
      .from('contacts')
      .insert([insertPayload])
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.error('Failed to ensure contact exists:', error);
    return null;
  }
};

const ensureProjectStakeholderAssignment = async (projectId, contactId, roleId) => {
  if (!supabase || !projectId || !contactId || !roleId) return;

  try {
    // Use upsert with the unified project_stakeholders table
    // Constraint: unique (project_id, contact_id, stakeholder_role_id)
    const { error } = await supabase
      .from('project_stakeholders')
      .upsert(
        [{
          project_id: projectId,
          contact_id: contactId,
          stakeholder_role_id: roleId,
          is_primary: false
        }],
        {
          onConflict: 'project_id,contact_id,stakeholder_role_id',
          ignoreDuplicates: true
        }
      );

    // Only throw error if it's not a duplicate constraint violation
    if (error && error.code !== '23505') {
      console.error('Failed to ensure project stakeholder assignment:', error);
      throw error;
    }
  } catch (error) {
    // Silently handle duplicate key errors, log others
    if (error.code !== '23505') {
      console.error('Failed to ensure project stakeholder assignment:', error);
    }
  }
};

const ensureDefaultInternalStakeholders = async (projectId) => {
  if (!projectId) {
    return;
  }

  // Use in-memory cache for performance, but don't rely on it for correctness
  if (ensuredDefaultStakeholderProjects.has(projectId)) {
    return;
  }

  try {
    // Check if default stakeholders already exist in the database
    // Using unified project_stakeholders table
    const expectedRoleNames = DEFAULT_INTERNAL_STAKEHOLDERS.map(s => s.roleName);

    const { data: existingStakeholders } = await supabase
      .from('project_stakeholders')
      .select(`
        id,
        stakeholder_role_id,
        stakeholder_roles!inner(name)
      `)
      .eq('project_id', projectId)
      .in('stakeholder_roles.name', expectedRoleNames);

    const existingRoleNames = new Set(
      (existingStakeholders || []).map(s => s.stakeholder_roles?.name).filter(Boolean)
    );

    // Only add stakeholders that don't exist yet
    let allEnsured = true;
    for (const spec of DEFAULT_INTERNAL_STAKEHOLDERS) {
      if (existingRoleNames.has(spec.roleName)) {
        continue; // Skip if already exists
      }

      const roleId = await ensureStakeholderRole(spec.roleName, `${spec.displayName} automated stakeholder`);
      const contactId = await ensureInternalContact(spec);

      if (contactId && roleId) {
        await ensureProjectStakeholderAssignment(projectId, contactId, roleId);
      } else {
        allEnsured = false;
        console.warn(`Failed to ensure stakeholder ${spec.roleName} for project ${projectId}`);
      }
    }

    // Add to cache only after successful completion
    if (allEnsured) {
      ensuredDefaultStakeholderProjects.add(projectId);
    }
  } catch (error) {
    console.error('Failed to ensure default internal stakeholders:', error);
  }
};

// ============= PROJECTS SERVICE =============
export const projectsService = {
  async getAll() {
    try {
      if (!supabase) return [];

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return [];
    }
  },

  async getById(projectId) {
    try {
      if (!supabase || !projectId) return null;

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch project:', error);
      return null;
    }
  },

  async getWithStakeholders(projectId) {
    try {
      if (!supabase) {
        return {
          id: projectId,
          name: 'Demo Project',
          stakeholders: { internal: [], external: [] }
        };
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) {
        console.error('Project fetch error:', projectError);
        return {
          id: projectId,
          name: 'Demo Project',
          stakeholders: { internal: [], external: [] }
        };
      }

      const stakeholders = await projectStakeholdersService.getForProject(projectId);

      return {
        ...project,
        stakeholders
      };
    } catch (error) {
      console.error('Failed to fetch project details:', error);
      return {
        id: projectId,
        name: 'Demo Project',
        stakeholders: { internal: [], external: [] }
      };
    }
  },

  async create(projectData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('projects')
        .insert([projectData])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to create project');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update project');
    }
  },

  async delete(id) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      console.log('Starting project deletion for ID:', id);

      // Import storage and floor plan services
      const { deleteProjectFloorPlans } = await import('./storageService');
      const { deleteCachedFloorPlans } = await import('./floorPlanProcessor');

      // Step 1: Check for purchase orders (these will block deletion)
      console.log('Checking for purchase orders...');
      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('project_id', id)
        .limit(1);

      if (poError) {
        console.error('Error checking purchase orders:', poError);
        throw poError;
      }

      if (purchaseOrders && purchaseOrders.length > 0) {
        console.warn('Project has purchase orders, blocking deletion');
        throw new Error('Cannot delete project with existing purchase orders. Please delete purchase orders first.');
      }

      // Step 2: Delete floor plan images from storage bucket
      console.log('Deleting floor plan images...');
      try {
        await deleteProjectFloorPlans(id);
        console.log('Floor plan images deleted successfully');
      } catch (storageError) {
        console.warn('Failed to delete floor plan images:', storageError);
        // Continue with deletion even if storage cleanup fails
      }

      // Step 3: Delete cached floor plan metadata
      console.log('Deleting cached floor plans...');
      try {
        await deleteCachedFloorPlans(id);
        console.log('Cached floor plans deleted successfully');
      } catch (cacheError) {
        console.warn('Failed to delete cached floor plans:', cacheError);
        // Continue with deletion even if cache cleanup fails
      }

      // Step 4: Delete the project (this triggers CASCADE delete on all related tables)
      console.log('Deleting project from database...');
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting project:', error);
        throw error;
      }

      console.log('Project deleted successfully!');
      return { success: true };
    } catch (error) {
      console.error('Delete project failed with error:', error);
      handleError(error, 'Failed to delete project');
    }
  },
};

// ============= PROJECT STAKEHOLDERS SERVICE =============
export const projectStakeholdersService = {
  async getForProject(projectId) {
    try {
      if (!supabase) {
        return { internal: [], external: [] };
      }

      await ensureDefaultInternalStakeholders(projectId);

      const { data, error } = await supabase
        .from('project_stakeholders_detailed')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        console.error('Stakeholders fetch error:', error);
        return { internal: [], external: [] };
      }

      const grouped = { internal: [], external: [] };
      (data || []).forEach(stakeholder => {
        if (stakeholder.is_internal) {
          grouped.internal.push(stakeholder);
        } else {
          grouped.external.push(stakeholder);
        }
      });

      return grouped;
    } catch (error) {
      console.error('Failed to fetch project stakeholders:', error);
      return { internal: [], external: [] };
    }
  },

  async addToProject(projectId, contactId, roleId, options = {}) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('project_stakeholders')
        .insert([{
          project_id: projectId,
          contact_id: contactId,
          stakeholder_role_id: roleId,
          is_primary: options.isPrimary || false,
          assignment_notes: options.notes || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to add stakeholder to project');
    }
  },

  async removeFromProject(assignmentId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('project_stakeholders')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to remove stakeholder from project');
    }
  },

  async updateAssignment(assignmentId, { contactId, roleId }) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const updates = {};
      if (contactId) updates.contact_id = contactId;
      if (roleId) updates.stakeholder_role_id = roleId;
      if (Object.keys(updates).length === 0) return null;

      const { data, error } = await supabase
        .from('project_stakeholders')
        .update(updates)
        .eq('id', assignmentId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update stakeholder assignment');
    }
  },

  async getInternalProjectIdsByEmail(email) {
    try {
      if (!supabase || !email) return [];

      const normalized = email.trim().toLowerCase();

      const { data, error } = await supabase
        .from('project_stakeholders_detailed')
        .select('project_id')
        .eq('is_internal', true)
        .ilike('email', normalized);

      if (error) throw error;

      const ids = Array.isArray(data) ? data.map((row) => row.project_id).filter(Boolean) : [];
      return [...new Set(ids)];
    } catch (error) {
      console.error('Failed to fetch internal stakeholder projects:', error);
      return [];
    }
  },
};

// ============= STAKEHOLDERS SERVICE (alias for compatibility) =============
export const stakeholdersService = projectStakeholdersService;

// ============= PROJECT TODOS SERVICE =============
export const projectTodosService = {
  async getForProject(projectId) {
    try {
      if (!supabase || !projectId) return [];

      let { data, error } = await supabase
        .from('project_todos')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error && /sort_order/.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('project_todos')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }));
      }

      if (error) throw error;

      return (data || []).map(todo => ({
        id: todo.id,
        projectId: todo.project_id,
        title: todo.title,
        completed: Boolean(todo.is_complete),
        createdAt: todo.created_at,
        sortOrder: typeof todo.sort_order === 'number' ? todo.sort_order : null,
        dueBy: todo.due_by || null,
        doBy: todo.do_by || null
      }));
    } catch (error) {
      console.error('Failed to fetch project todos:', error);
      return [];
    }
  },

  async create(projectId, title) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('project_todos')
        .insert([{ project_id: projectId, title }])
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        projectId: data.project_id,
        project_id: data.project_id,
        title: data.title,
        description: data.description || null,
        importance: data.importance || 'normal',
        completed: Boolean(data.is_complete),
        dueBy: data.due_by || null,
        doBy: data.do_by || null,
        sortOrder: typeof data.sort_order === 'number' ? data.sort_order : null,
        createdAt: data.created_at
      };
    } catch (error) {
      handleError(error, 'Failed to create project todo');
    }
  },

  async toggleCompletion(id, completed) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('project_todos')
        .update({ is_complete: completed })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to update project todo');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const payload = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
      if (updates.due_by !== undefined) payload.due_by = updates.due_by;
      if (updates.do_by !== undefined) payload.do_by = updates.do_by;
      if (updates.do_by_time !== undefined) payload.do_by_time = updates.do_by_time;
      if (updates.planned_hours !== undefined) payload.planned_hours = updates.planned_hours;
      if (updates.importance !== undefined) payload.importance = updates.importance;
      if (updates.is_complete !== undefined) payload.is_complete = updates.is_complete;
      if (updates.calendar_event_id !== undefined) payload.calendar_event_id = updates.calendar_event_id;
      if (Object.keys(payload).length === 0) return null;
      const { data, error } = await supabase
        .from('project_todos')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update project todo');
    }
  },

  async reorder(projectId, items) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      try {
        const { error } = await supabase.rpc('reorder_project_todos', {
          p_project_id: projectId,
          p_items: items
        });
        if (!error) return true;
      } catch (_) { }
      await Promise.all(items.map(it => supabase
        .from('project_todos')
        .update({ sort_order: it.sort_order })
        .eq('id', it.id)
      ));
      return true;
    } catch (error) {
      console.error('Failed to reorder todos:', error);
      return false;
    }
  },

  async remove(id) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('project_todos')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to delete project todo');
    }
  },

  async getAllForUser(email) {
    try {
      if (!supabase || !email) return [];

      // 1. Get all projects where user is an internal stakeholder
      const projectIds = await projectStakeholdersService.getInternalProjectIdsByEmail(email);

      if (!projectIds.length) return [];

      // 2. Fetch open todos for these projects
      const { data, error } = await supabase
        .from('project_todos')
        .select(`
          *,
          project:projects(name)
        `)
        .in('project_id', projectIds)
        .eq('is_complete', false)
        .order('do_by', { ascending: true });

      if (error) throw error;

      return (data || []).map(todo => ({
        id: todo.id,
        projectId: todo.project_id,
        projectName: todo.project?.name || 'Unknown Project',
        title: todo.title,
        completed: Boolean(todo.is_complete),
        createdAt: todo.created_at,
        dueBy: todo.due_by || null,
        doBy: todo.do_by || null,
        doByTime: todo.do_by_time || null,
        plannedHours: todo.planned_hours || null,
        importance: todo.importance || 'normal'
      }));

    } catch (error) {
      console.error('Failed to fetch user todos:', error);
      return [];
    }
  }
};

// ============= TODO STAKEHOLDERS SERVICE =============
export const todoStakeholdersService = {
  async getForTodo(todoId) {
    try {
      if (!supabase || !todoId) return [];

      const { data, error } = await supabase
        .from('todo_stakeholders')
        .select(`
          id,
          project_stakeholder_id,
          project_stakeholder:project_stakeholders(
            id,
            contact_id,
            stakeholder_role_id,
            contact:contacts(first_name, last_name, email, is_internal),
            role:stakeholder_roles(name)
          )
        `)
        .eq('todo_id', todoId);

      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id,
        projectStakeholderId: item.project_stakeholder_id,
        contactName: `${item.project_stakeholder?.contact?.first_name || ''} ${item.project_stakeholder?.contact?.last_name || ''}`.trim(),
        email: item.project_stakeholder?.contact?.email,
        roleName: item.project_stakeholder?.role?.name,
        isInternal: item.project_stakeholder?.contact?.is_internal
      }));
    } catch (error) {
      console.error('Failed to fetch todo stakeholders:', error);
      return [];
    }
  },

  async add(todoId, projectStakeholderId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('todo_stakeholders')
        .insert([{ todo_id: todoId, project_stakeholder_id: projectStakeholderId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to add stakeholder to todo');
    }
  },

  async remove(assignmentId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('todo_stakeholders')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to remove stakeholder from todo');
    }
  }
};

// ============= ISSUES SERVICE =============
export const issuesService = {
  async getAll(projectId = null) {
    try {
      if (!supabase) return [];

      let query = supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Issues fetch error:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Failed to fetch issues:', error);
      return [];
    }
  },

  async create(issueData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('issues')
        .insert([issueData])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to create issue');
    }
  }
};

// Extra issue helpers
issuesService.getById = async (id) => {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch issue:', error);
    return null;
  }
};

issuesService.update = async (id, updates) => {
  try {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('issues')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    handleError(error, 'Failed to update issue');
  }
};

// ============= ISSUE COMMENTS SERVICE =============
export const issueCommentsService = {
  async getForIssue(issueId) {
    try {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('issue_comments')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch issue comments:', error);
      return [];
    }
  },
  async add(issueId, { author_id, author_name, author_email, comment_text, is_internal = true }) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const payload = { issue_id: issueId, author_id, author_name, author_email, comment_text, is_internal };
      const { data, error } = await supabase
        .from('issue_comments')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to add comment');
    }
  }
};

// ============= ISSUE STAKEHOLDER TAGS SERVICE =============
export const issueStakeholderTagsService = {
  async getDetailed(issueId) {
    try {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('issue_stakeholder_tags_detailed')
        .select('*')
        .eq('issue_id', issueId)
        .order('tagged_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch issue stakeholder tags:', error);
      return [];
    }
  },
  async add(issueId, projectStakeholderId, tagType = 'assigned') {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('issue_stakeholder_tags')
        .insert([{ issue_id: issueId, project_stakeholder_id: projectStakeholderId, tag_type: tagType }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to tag stakeholder');
    }
  },
  async remove(tagId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase
        .from('issue_stakeholder_tags')
        .delete()
        .eq('id', tagId);
      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to remove stakeholder tag');
    }
  }
};

// ============= CONTACTS SERVICE =============
export const contactsService = {
  async getAll(filters = {}) {
    try {
      if (!supabase) return [];

      let query = supabase
        .from('contacts')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (filters.isInternal !== undefined) {
        query = query.eq('is_internal', filters.isInternal);
      }

      if (filters.search) {
        const rawTerm = filters.search.trim();
        if (rawTerm.length > 0) {
          const escaped = rawTerm.replace(/[%_]/g, '\\$&');
          const pattern = `%${escaped}%`;
          query = query.or([
            `name.ilike.${pattern}`,
            `first_name.ilike.${pattern}`,
            `last_name.ilike.${pattern}`,
            `email.ilike.${pattern}`,
            `company.ilike.${pattern}`,
            `role.ilike.${pattern}`
          ].join(','));
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      return [];
    }
  },

  async getById(id) {
    try {
      if (!supabase) return null;

      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch contact:', error);
      return null;
    }
  },

  async create(contactData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('contacts')
        .insert([contactData])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to create contact');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update contact');
    }
  },

  async delete(id) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('contacts')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to delete contact');
    }
  }
};

// ============= STAKEHOLDER ROLES SERVICE =============
export const stakeholderRolesService = {
  async getAll() {
    try {
      if (!supabase) return [];

      const { data, error } = await supabase
        .from('stakeholder_roles')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch stakeholder roles:', error);
      return [];
    }
  },

  async create(roleData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const payload = {
        name: roleData.name,
        category: roleData.category,
        description: roleData.description ?? null,
        is_active: roleData.is_active ?? true,
        sort_order: roleData.sort_order ?? 0
      };

      const { data, error } = await supabase
        .from('stakeholder_roles')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to create stakeholder role');
    }
  }
};

// ============= TIME LOGS SERVICE =============
export const timeLogsService = {
  async checkIn(projectId, userEmail, userName = null) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      // Use the Supabase function for check-in
      const { data, error } = await supabase
        .rpc('time_log_check_in', {
          p_project_id: projectId,
          p_user_email: userEmail,
          p_user_name: userName || userEmail
        });

      if (error) {
        console.error('Check-in error:', error);
        return { success: false, message: error.message || 'Failed to check in' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Failed to check in:', error);
      return { success: false, message: error.message || 'Failed to check in' };
    }
  },

  async checkOut(projectId, userEmail) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      // Use the Supabase function for check-out
      const { data, error } = await supabase
        .rpc('time_log_check_out', {
          p_project_id: projectId,
          p_user_email: userEmail
        });

      if (error) {
        console.error('Check-out error:', error);
        return { success: false, message: error.message || 'Failed to check out' };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Failed to check out:', error);
      return { success: false, message: error.message || 'Failed to check out' };
    }
  },

  async getActiveSession(projectId, userEmail) {
    try {
      if (!supabase) return null;

      // Use the Supabase function to get active session
      const { data, error } = await supabase
        .rpc('get_active_session', {
          p_project_id: projectId,
          p_user_email: userEmail
        });

      if (error) {
        console.error('Failed to get active session:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Failed to get active session:', error);
      return null;
    }
  },

  async getUserProjectTime(projectId, userEmail) {
    try {
      if (!supabase) return { total_minutes: 0, total_hours: 0, total_sessions: 0, active_session: false };

      const { data, error } = await supabase
        .rpc('get_user_project_time', {
          p_project_id: projectId,
          p_user_email: userEmail
        });

      if (error) {
        console.error('Failed to get user project time:', error);
        return { total_minutes: 0, total_hours: 0, total_sessions: 0, active_session: false };
      }

      return data && data.length > 0 ? data[0] : { total_minutes: 0, total_hours: 0, total_sessions: 0, active_session: false };
    } catch (error) {
      console.error('Failed to get user project time:', error);
      return { total_minutes: 0, total_hours: 0, total_sessions: 0, active_session: false };
    }
  },

  async getProjectTimeSummary(projectId) {
    try {
      if (!supabase) return [];

      const { data, error } = await supabase
        .rpc('get_project_time_summary', {
          p_project_id: projectId
        });

      if (error) {
        console.error('Failed to get project time summary:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get project time summary:', error);
      return [];
    }
  },

  async getWeeklyTimeSummary(userEmail = null, weeksBack = 4) {
    try {
      if (!supabase) return [];

      const { data, error } = await supabase
        .rpc('get_weekly_time_summary', {
          p_user_email: userEmail,
          p_weeks_back: weeksBack
        });

      if (error) {
        console.error('Failed to get weekly time summary:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get weekly time summary:', error);
      return [];
    }
  }
};

// ============= PROJECT PROGRESS SERVICE =============  
export const projectProgressService = {
  async getProjectProgress(projectId) {
    try {
      const baseProgress = {
        prewire: 0,
        trim: 0,
        commission: 0,
        ordered: 0,
        onsite: 0,
      };

      if (!supabase) return baseProgress;

      // Get all wire drops with their stages
      const { data: wireDrops, error } = await supabase
        .from('wire_drops')
        .select('*, wire_drop_stages(*)')
        .eq('project_id', projectId);

      if (error || !wireDrops || wireDrops.length === 0) {
        return baseProgress;
      }

      // Calculate progress for each stage
      const totalDrops = wireDrops.length;
      let prewireComplete = 0;
      let trimComplete = 0;
      let commissionComplete = 0;

      wireDrops.forEach(drop => {
        const stages = drop.wire_drop_stages || [];
        stages.forEach(stage => {
          if (stage.completed) {
            if (stage.stage_type === 'prewire') prewireComplete++;
            else if (stage.stage_type === 'trim_out') trimComplete++;
            else if (stage.stage_type === 'commission') commissionComplete++;
          }
        });
      });

      baseProgress.prewire = Math.round((prewireComplete / totalDrops) * 100);
      baseProgress.trim = Math.round((trimComplete / totalDrops) * 100);
      baseProgress.commission = Math.round((commissionComplete / totalDrops) * 100);

      const { data: equipment, error: equipmentError } = await supabase
        .from('project_equipment')
        .select('id, equipment_type, is_active, ordered_confirmed, delivered_confirmed')
        .eq('project_id', projectId);

      if (!equipmentError && Array.isArray(equipment) && equipment.length > 0) {
        const trackable = equipment.filter(
          (item) =>
            item.is_active !== false &&
            (!item.equipment_type || item.equipment_type === 'part' || item.equipment_type === 'other')
        );

        const denominator = trackable.length;

        if (denominator > 0) {
          const orderedCount = trackable.filter((item) => item.ordered_confirmed).length;
          const deliveredCount = trackable.filter((item) => item.delivered_confirmed).length;

          baseProgress.ordered = Math.round((orderedCount / denominator) * 100);
          baseProgress.delivered = Math.round((deliveredCount / denominator) * 100);
        }
      }

      return baseProgress;
    } catch (error) {
      console.error('Failed to get project progress:', error);
      return {
        prewire: 0,
        trim: 0,
        commission: 0,
        ordered: 0,
        delivered: 0,
        onsite: 0,
      };
    }
  }
};

// ============= SUBSCRIPTIONS (mock for compatibility) =============
export const subscriptions = {
  subscribeToProject: () => ({ unsubscribe: () => { } }),
  subscribeToContacts: () => ({ unsubscribe: () => { } }),
  unsubscribe: () => { }
};
