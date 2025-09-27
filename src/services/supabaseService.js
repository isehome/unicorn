import { supabase } from '../lib/supabase';

const handleError = (error, defaultMessage) => {
  console.error(defaultMessage, error);
  throw new Error(error?.message || defaultMessage);
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
};

// ============= PROJECT STAKEHOLDERS SERVICE =============
export const projectStakeholdersService = {
  async getForProject(projectId) {
    try {
      if (!supabase) {
        return { internal: [], external: [] };
      }

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
        title: data.title,
        completed: Boolean(data.is_complete),
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
      if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
      if (updates.due_by !== undefined) payload.due_by = updates.due_by;
      if (updates.do_by !== undefined) payload.do_by = updates.do_by;
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
      } catch (_) {}
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

// ============= SUBSCRIPTIONS (mock for compatibility) =============
export const subscriptions = {
  subscribeToProject: () => ({ unsubscribe: () => {} }),
  subscribeToContacts: () => ({ unsubscribe: () => {} }),
  unsubscribe: () => {}
};
