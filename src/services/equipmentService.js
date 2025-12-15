import { supabase } from '../lib/supabase';

const handleError = (error, defaultMessage) => {
  console.error(defaultMessage, error);
  throw new Error(error?.message || defaultMessage);
};

// ============= EQUIPMENT SERVICE =============
export const equipmentService = {
  async getProjectEquipment(projectId) {
    try {
      if (!supabase || !projectId) return [];
      
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('project_id', projectId)
        .order('rack', { ascending: true })
        .order('rack_position', { ascending: true });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
      return [];
    }
  },

  async getForProject(projectId) {
    try {
      if (!supabase || !projectId) return [];
      
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          *,
          equipment_credentials(
            secure_data_id,
            is_primary
          )
        `)
        .eq('project_id', projectId)
        .order('uid', { ascending: true });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
      return [];
    }
  },

  async getById(id) {
    try {
      if (!supabase) return null;
      
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          *,
          equipment_credentials(
            secure_data_id,
            is_primary
          )
        `)
        .eq('id', id)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
      return null;
    }
  },

  async create(equipmentData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { data, error } = await supabase
        .from('equipment')
        .insert([equipmentData])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to create equipment');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { data, error } = await supabase
        .from('equipment')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update equipment');
    }
  },

  async delete(id) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to delete equipment');
    }
  },

  async generateUID(projectId) {
    try {
      if (!supabase) return `EQ-${Date.now()}`;
      
      // Get existing equipment count for this project
      const { count, error } = await supabase
        .from('equipment')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);
        
      if (error) throw error;
      
      // Generate UID like EQ-001, EQ-002, etc.
      const number = (count || 0) + 1;
      return `EQ-${String(number).padStart(3, '0')}`;
    } catch (error) {
      console.error('Failed to generate UID:', error);
      return `EQ-${Date.now()}`;
    }
  },
};

// ============= EQUIPMENT CATEGORIES SERVICE =============
export const equipmentCategoriesService = {
  async getAll() {
    try {
      if (!supabase) return [];
      
      const { data, error } = await supabase
        .from('equipment_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch equipment categories:', error);
      return [];
    }
  },
};

// ============= SECURE DATA SERVICE =============
export const secureDataService = {
  async getProjectSecureData(projectId) {
    try {
      if (!supabase || !projectId) return [];
      
      const { data, error } = await supabase
        .from('project_secure_data')
        .select(`
          *,
          equipment_credentials(
            equipment_id,
            is_primary
          )
        `)
        .eq('project_id', projectId)
        .order('name', { ascending: true });
        
      if (error) throw error;
      
      // Transform the data to match expected structure
      const transformedData = (data || []).map(item => ({
        ...item,
        equipment_secure_links: item.equipment_credentials || []
      }));
      
      return transformedData;
    } catch (error) {
      console.error('Failed to fetch secure data:', error);
      return [];
    }
  },

  async getForProject(projectId) {
    // Alias for getProjectSecureData for backward compatibility
    return this.getProjectSecureData(projectId);
  },

  async getForEquipment(equipmentId) {
    try {
      if (!supabase || !equipmentId) return [];
      
      const { data, error } = await supabase
        .from('project_secure_data')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('name', { ascending: true });
        
      if (error) throw error;
      
      // Log access for audit
      if (data && data.length > 0) {
        await Promise.all(data.map(item => 
          this.logAccess(item.id, 'view')
        ));
      }
      
      return data || [];
    } catch (error) {
      console.error('Failed to fetch secure data for equipment:', error);
      return [];
    }
  },

  async getById(id) {
    try {
      if (!supabase) return null;
      
      const { data, error } = await supabase
        .from('project_secure_data')
        .select(`
          *,
          equipment:equipment_id(
            id,
            uid,
            name
          )
        `)
        .eq('id', id)
        .single();
        
      if (error) throw error;
      
      // Log access for audit
      if (data) {
        await this.logAccess(data.id, 'view');
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch secure data item:', error);
      return null;
    }
  },

  async create(secureData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      // Ensure data_type is ALWAYS present
      const dataToInsert = {
        ...secureData,
        data_type: secureData.data_type || 'credentials'
      };
      
      console.log('secureDataService.create - data to insert:', dataToInsert);
      
      // Validate required fields
      if (!dataToInsert.project_id) {
        throw new Error('project_id is required');
      }
      if (!dataToInsert.name) {
        throw new Error('name is required');
      }
      if (!dataToInsert.data_type) {
        throw new Error('data_type is required');
      }
      
      const { data, error } = await supabase
        .from('project_secure_data')
        .insert([dataToInsert])
        .select(`
          *,
          equipment:equipment_id(
            id,
            uid,
            name,
            model
          )
        `)
        .single();
        
      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      handleError(error, 'Failed to create secure data');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { data, error } = await supabase
        .from('project_secure_data')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          equipment:equipment_id(
            id,
            uid,
            name,
            model
          )
        `)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update secure data');
    }
  },

  async delete(id) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { error } = await supabase
        .from('project_secure_data')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to delete secure data');
    }
  },

  // Legacy method names for backward compatibility
  async createSecureData(secureData) {
    return this.create(secureData);
  },

  async updateSecureData(id, updates) {
    return this.update(id, updates);
  },

  async deleteSecureData(id) {
    return this.delete(id);
  },

  async linkToEquipment(secureDataId, equipmentIds) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      // First remove existing links
      await supabase
        .from('equipment_credentials')
        .delete()
        .eq('secure_data_id', secureDataId);
      
      // Then add new links
      if (equipmentIds && equipmentIds.length > 0) {
        const links = equipmentIds.map((equipmentId, index) => ({
          equipment_id: equipmentId,
          secure_data_id: secureDataId,
          is_primary: index === 0 // First one is primary
        }));
        
        const { error } = await supabase
          .from('equipment_credentials')
          .insert(links);
          
        if (error) throw error;
      }
      
      return true;
    } catch (error) {
      handleError(error, 'Failed to link secure data to equipment');
    }
  },

  async unlinkFromEquipment(secureDataId, equipmentId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { error } = await supabase
        .from('equipment_credentials')
        .delete()
        .eq('secure_data_id', secureDataId)
        .eq('equipment_id', equipmentId);
        
      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to unlink secure data from equipment');
    }
  },

  async logAccess(projectId, userId, actionType, secureDataId, metadata = {}) {
    try {
      if (!supabase) return;
      
      // Map action_type to match database check constraint
      const action = actionType === 'view_password' ? 'view' : 
                     actionType === 'view_list' ? 'view' :
                     actionType === 'copy_credential' ? 'view' :
                     actionType;
      
      const { error } = await supabase
        .from('secure_data_audit_log')
        .insert([{
          secure_data_id: secureDataId,
          action: action,
          performed_by: userId,
          performed_at: new Date().toISOString(),
          details: metadata
        }]);
        
      if (error) {
        console.error('Failed to log access:', error);
      }
    } catch (error) {
      console.error('Failed to log access:', error);
    }
  },

  async getAuditLogs(projectId) {
    try {
      if (!supabase || !projectId) return [];

      // Get all secure_data_ids for this project first
      const { data: secureDataItems, error: secureDataError } = await supabase
        .from('project_secure_data')
        .select('id')
        .eq('project_id', projectId);

      if (secureDataError) throw secureDataError;

      if (!secureDataItems || secureDataItems.length === 0) return [];

      const secureDataIds = secureDataItems.map(item => item.id);

      // Now get audit logs for these secure data items
      const { data, error } = await supabase
        .from('secure_data_audit_log')
        .select('*')
        .in('secure_data_id', secureDataIds)
        .order('performed_at', { descending: true })
        .limit(100);

      if (error) throw error;

      // Transform to match expected structure
      return (data || []).map(log => ({
        ...log,
        action_type: log.action,
        user_id: log.performed_by,
        created_at: log.performed_at,
        metadata: log.details
      }));
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  },

  // Get credentials linked to a specific project equipment item via equipment_credentials junction table
  async getForProjectEquipment(projectEquipmentId) {
    try {
      if (!supabase || !projectEquipmentId) return [];

      // Get secure data linked via equipment_credentials junction table
      const { data: links, error: linksError } = await supabase
        .from('equipment_credentials')
        .select(`
          secure_data_id,
          is_primary,
          secure_data:secure_data_id(*)
        `)
        .eq('equipment_id', projectEquipmentId);

      if (linksError) throw linksError;

      // Flatten and return the secure data with is_primary flag
      return (links || [])
        .filter(link => link.secure_data)
        .map(link => ({
          ...link.secure_data,
          is_primary: link.is_primary
        }));
    } catch (error) {
      console.error('Failed to fetch secure data for project equipment:', error);
      return [];
    }
  },

  // Link a secure data entry to project equipment
  async linkToProjectEquipment(secureDataId, projectEquipmentId, isPrimary = false) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('equipment_credentials')
        .insert([{
          secure_data_id: secureDataId,
          equipment_id: projectEquipmentId,
          is_primary: isPrimary
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to link secure data to project equipment');
    }
  },

  // Unlink secure data from project equipment
  async unlinkFromProjectEquipment(secureDataId, projectEquipmentId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { error } = await supabase
        .from('equipment_credentials')
        .delete()
        .eq('secure_data_id', secureDataId)
        .eq('equipment_id', projectEquipmentId);

      if (error) throw error;
    } catch (error) {
      handleError(error, 'Failed to unlink secure data from project equipment');
    }
  },

  // Create new secure data and link it to project equipment
  async createForProjectEquipment(projectId, projectEquipmentId, secureData, userId = null) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      // First create the secure data entry
      const dataToInsert = {
        project_id: projectId,
        data_type: secureData.data_type || 'credentials',
        name: secureData.name,
        username: secureData.username || null,
        password: secureData.password || null,
        url: secureData.url || null,
        notes: secureData.notes || null,
        additional_info: secureData.additional_info || null,
        created_by: userId
      };

      const { data: newSecureData, error: createError } = await supabase
        .from('project_secure_data')
        .insert([dataToInsert])
        .select()
        .single();

      if (createError) throw createError;

      // Then link it to the equipment
      const { error: linkError } = await supabase
        .from('equipment_credentials')
        .insert([{
          secure_data_id: newSecureData.id,
          equipment_id: projectEquipmentId,
          is_primary: true
        }]);

      if (linkError) throw linkError;

      return newSecureData;
    } catch (error) {
      handleError(error, 'Failed to create secure data for project equipment');
    }
  },
};

// ============= CONTACT SECURE DATA SERVICE =============
// For storing credentials/sensitive data linked to contacts GLOBALLY (not project-scoped)
export const contactSecureDataService = {
  async getForContact(contactId) {
    try {
      if (!supabase || !contactId) return [];

      const { data, error } = await supabase
        .from('contact_secure_data')
        .select('*')
        .eq('contact_id', contactId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch secure data for contact:', error);
      return [];
    }
  },

  async getById(id) {
    try {
      if (!supabase) return null;

      const { data, error } = await supabase
        .from('contact_secure_data')
        .select(`
          *,
          contact:contact_id(
            id,
            name,
            full_name,
            email,
            company
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch contact secure data item:', error);
      return null;
    }
  },

  async create(contactId, secureData) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      if (!contactId) {
        throw new Error('contact_id is required');
      }
      if (!secureData.name) {
        throw new Error('name is required');
      }

      const dataToInsert = {
        contact_id: contactId,
        data_type: secureData.data_type || 'other',
        name: secureData.name,
        username: secureData.username || null,
        password: secureData.password || null,
        url: secureData.url || null,
        ip_address: secureData.ip_address || null,
        port: secureData.port || null,
        notes: secureData.notes || null,
        additional_info: secureData.additional_info || null,
        created_by: secureData.created_by || null
      };

      const { data, error } = await supabase
        .from('contact_secure_data')
        .insert([dataToInsert])
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      // Log the create action
      await this.logAccess(contactId, secureData.created_by, 'create', data.id);

      return data;
    } catch (error) {
      handleError(error, 'Failed to create contact secure data');
    }
  },

  async update(id, updates) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('contact_secure_data')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log the update action
      if (data) {
        await this.logAccess(data.contact_id, updates.updated_by, 'update', id);
      }

      return data;
    } catch (error) {
      handleError(error, 'Failed to update contact secure data');
    }
  },

  async delete(id, userId = null) {
    try {
      if (!supabase) throw new Error('Supabase not configured');

      // Get the contact_id before deleting for audit log
      const { data: existing } = await supabase
        .from('contact_secure_data')
        .select('contact_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('contact_secure_data')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Log the delete action
      if (existing?.contact_id) {
        await this.logAccess(existing.contact_id, userId, 'delete', id);
      }
    } catch (error) {
      handleError(error, 'Failed to delete contact secure data');
    }
  },

  async logAccess(contactId, userId, actionType, secureDataId, metadata = {}) {
    try {
      if (!supabase) return;

      // Map action types to match database check constraint
      const action = actionType === 'view_password' ? 'view' :
                     actionType === 'view_list' ? 'view' :
                     actionType === 'copy_credential' ? 'view' :
                     actionType;

      const { error } = await supabase
        .from('contact_secure_data_audit_log')
        .insert([{
          secure_data_id: secureDataId,
          contact_id: contactId,
          action: action,
          performed_by: userId,
          performed_at: new Date().toISOString(),
          details: metadata
        }]);

      if (error) {
        console.error('Failed to log contact secure data access:', error);
      }
    } catch (error) {
      console.error('Failed to log contact secure data access:', error);
    }
  },

  async getAuditLogs(contactId) {
    try {
      if (!supabase || !contactId) return [];

      const { data, error } = await supabase
        .from('contact_secure_data_audit_log')
        .select('*')
        .eq('contact_id', contactId)
        .order('performed_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map(log => ({
        ...log,
        action_type: log.action,
        user_id: log.performed_by,
        created_at: log.performed_at
      }));
    } catch (error) {
      console.error('Failed to fetch contact secure data audit logs:', error);
      return [];
    }
  }
};

// ============= PROJECT CLIENT SERVICE =============
export const projectClientService = {
  async updateClientContact(projectId, contactId) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      
      const { data, error } = await supabase
        .from('projects')
        .update({ client_contact_id: contactId })
        .eq('id', projectId)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, 'Failed to update project client');
    }
  },

  async getProjectWithClient(projectId) {
    try {
      if (!supabase) return null;
      
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          client_contact:client_contact_id(
            id,
            name,
            full_name,
            email,
            phone,
            company,
            address
          )
        `)
        .eq('id', projectId)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch project with client:', error);
      return null;
    }
  },
};
