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
  }
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
  }
};

// ============= STAKEHOLDERS SERVICE (alias for compatibility) =============
export const stakeholdersService = projectStakeholdersService;

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
  }
};

// ============= SUBSCRIPTIONS (mock for compatibility) =============
export const subscriptions = {
  subscribeToProject: () => ({ unsubscribe: () => {} }),
  subscribeToContacts: () => ({ unsubscribe: () => {} }),
  unsubscribe: () => {}
};