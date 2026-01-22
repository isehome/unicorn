import { supabase } from '../lib/supabase';

class CompanySettingsService {
  /**
   * Get company settings (should only be one row)
   */
  async getCompanySettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        // If no settings exist yet, return null instead of throwing
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching company settings:', error);
      throw error;
    }
  }

  /**
   * Create company settings (first time setup)
   */
  async createCompanySettings(settingsData) {
    try {
      const user = (await supabase.auth.getUser()).data.user;

      const { data, error } = await supabase
        .from('company_settings')
        .insert([{
          company_name: settingsData.company_name,
          orders_contact_name: settingsData.orders_contact_name,
          orders_contact_email: settingsData.orders_contact_email,
          orders_contact_phone: settingsData.orders_contact_phone,
          accounting_contact_name: settingsData.accounting_contact_name,
          accounting_contact_email: settingsData.accounting_contact_email,
          accounting_contact_phone: settingsData.accounting_contact_phone,
          company_logo_url: settingsData.company_logo_url,
          company_logo_sharepoint_drive_id: settingsData.company_logo_sharepoint_drive_id,
          company_logo_sharepoint_item_id: settingsData.company_logo_sharepoint_item_id,
          company_sharepoint_root_url: settingsData.company_sharepoint_root_url,
          brand_color_primary: settingsData.brand_color_primary || '#8B5CF6',
          brand_color_secondary: settingsData.brand_color_secondary || '#94AF32',
          brand_color_tertiary: settingsData.brand_color_tertiary || '#3B82F6',
          default_service_hourly_rate: settingsData.default_service_hourly_rate ?? 150,
          created_by: user?.id || null,
          updated_by: user?.id || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating company settings:', error);
      throw error;
    }
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(settingsId, settingsData) {
    try {
      const user = (await supabase.auth.getUser()).data.user;

      const { data, error } = await supabase
        .from('company_settings')
        .update({
          company_name: settingsData.company_name,
          orders_contact_name: settingsData.orders_contact_name,
          orders_contact_email: settingsData.orders_contact_email,
          orders_contact_phone: settingsData.orders_contact_phone,
          accounting_contact_name: settingsData.accounting_contact_name,
          accounting_contact_email: settingsData.accounting_contact_email,
          accounting_contact_phone: settingsData.accounting_contact_phone,
          company_logo_url: settingsData.company_logo_url,
          company_logo_sharepoint_drive_id: settingsData.company_logo_sharepoint_drive_id,
          company_logo_sharepoint_item_id: settingsData.company_logo_sharepoint_item_id,
          company_sharepoint_root_url: settingsData.company_sharepoint_root_url,
          brand_color_primary: settingsData.brand_color_primary,
          brand_color_secondary: settingsData.brand_color_secondary,
          brand_color_tertiary: settingsData.brand_color_tertiary,
          default_service_hourly_rate: settingsData.default_service_hourly_rate,
          updated_by: user?.id || null
        })
        .eq('id', settingsId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating company settings:', error);
      throw error;
    }
  }

  /**
   * Create or update company settings (upsert-like behavior)
   */
  async saveCompanySettings(settingsData) {
    try {
      const existing = await this.getCompanySettings();

      if (existing) {
        return await this.updateCompanySettings(existing.id, settingsData);
      } else {
        return await this.createCompanySettings(settingsData);
      }
    } catch (error) {
      console.error('Error saving company settings:', error);
      throw error;
    }
  }
}

export const companySettingsService = new CompanySettingsService();
