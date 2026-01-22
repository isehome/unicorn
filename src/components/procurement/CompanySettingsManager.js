import React, { useState, useEffect } from 'react';
import { companySettingsService } from '../../services/companySettingsService';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import {
  Mail,
  User,
  Save,
  Upload,
  X,
  AlertCircle,
  CheckCircle,
  FolderOpen,
  HelpCircle,
  Palette,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import BrandColorPicker from '../ui/BrandColorPicker';

/**
 * CompanySettingsManager Component
 * Manages company-wide settings including:
 * - Company name
 * - Orders contact information
 * - Accounting contact information
 * - Company logo (for use in PO generation)
 */
const CompanySettingsManager = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showBrandColors, setShowBrandColors] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    orders_contact_name: '',
    orders_contact_email: '',
    orders_contact_phone: '',
    accounting_contact_name: '',
    accounting_contact_email: '',
    accounting_contact_phone: '',
    company_logo_url: null,
    company_logo_sharepoint_drive_id: null,
    company_logo_sharepoint_item_id: null,
    company_sharepoint_root_url: '',
    brand_color_primary: '#8B5CF6',
    brand_color_secondary: '#94AF32',
    brand_color_tertiary: '#3B82F6',
    default_service_hourly_rate: 150
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await companySettingsService.getCompanySettings();

      if (data) {
        setFormData({
          company_name: data.company_name || '',
          orders_contact_name: data.orders_contact_name || '',
          orders_contact_email: data.orders_contact_email || '',
          orders_contact_phone: data.orders_contact_phone || '',
          accounting_contact_name: data.accounting_contact_name || '',
          accounting_contact_email: data.accounting_contact_email || '',
          accounting_contact_phone: data.accounting_contact_phone || '',
          company_logo_url: data.company_logo_url || null,
          company_logo_sharepoint_drive_id: data.company_logo_sharepoint_drive_id || null,
          company_logo_sharepoint_item_id: data.company_logo_sharepoint_item_id || null,
          company_sharepoint_root_url: data.company_sharepoint_root_url || '',
          brand_color_primary: data.brand_color_primary || '#8B5CF6',
          brand_color_secondary: data.brand_color_secondary || '#94AF32',
          brand_color_tertiary: data.brand_color_tertiary || '#3B82F6',
          default_service_hourly_rate: data.default_service_hourly_rate ?? 150
        });
      }
    } catch (err) {
      console.error('Failed to load company settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    try {
      setUploadingLogo(true);
      setError(null);

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `company-logo-${Date.now()}.${fileExt}`;
      const filePath = `company/${fileName}`;

      // Upload to Supabase storage bucket (using 'photos' bucket which has working policies)
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      // Update form data with Supabase URL
      setFormData(prev => ({
        ...prev,
        company_logo_url: urlData.publicUrl,
        company_logo_sharepoint_drive_id: null,
        company_logo_sharepoint_item_id: null
      }));

      setSuccess('Logo uploaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to upload logo:', err);
      setError(`Failed to upload logo: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({
      ...prev,
      company_logo_url: null,
      company_logo_sharepoint_drive_id: null,
      company_logo_sharepoint_item_id: null
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.company_name.trim()) {
      setError('Company name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await companySettingsService.saveCompanySettings(formData);

      setSuccess('Company settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload settings
      await loadSettings();
    } catch (err) {
      console.error('Failed to save company settings:', err);
      setError(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
        Loading company settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Information */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Company Name *
          </label>
          <input
            type="text"
            value={formData.company_name}
            onChange={(e) => handleInputChange('company_name', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
            placeholder="Your Company LLC"
            required
          />
        </div>

        {/* Company Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Company Logo
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Upload your company logo to include on purchase orders
          </p>

          {formData.company_logo_url ? (
            <div className="flex items-start gap-4">
              <div className="w-32 h-32 rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-zinc-800 flex items-center justify-center p-2">
                <img
                  src={formData.company_logo_url}
                  alt="Company Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={X}
                onClick={handleRemoveLogo}
              >
                Remove Logo
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-violet-500 dark:hover:border-violet-500 cursor-pointer transition"
                style={{ opacity: uploadingLogo ? 0.5 : 1 }}
              >
                <Upload className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Brand Colors Section - Collapsible */}
        <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBrandColors(!showBrandColors)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-600" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Brand Colors</h4>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (Customer-facing portals & emails)
              </span>
            </div>
            {showBrandColors ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showBrandColors && (
            <div className="p-4 pt-0 border-t border-gray-200 dark:border-zinc-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Choose colors for external-facing communications like customer emails and portals.
              </p>

              <div className="space-y-6 p-4 rounded-lg bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700">
                <BrandColorPicker
                  value={formData.brand_color_primary}
                  onChange={(color) => handleInputChange('brand_color_primary', color)}
                  label="Primary Color"
                  description="Used for headers, accent borders, and links"
                />

                <BrandColorPicker
                  value={formData.brand_color_secondary}
                  onChange={(color) => handleInputChange('brand_color_secondary', color)}
                  label="Secondary Color"
                  description="Used for action buttons and important banners"
                />

                <BrandColorPicker
                  value={formData.brand_color_tertiary}
                  onChange={(color) => handleInputChange('brand_color_tertiary', color)}
                  label="Tertiary Color"
                  description="Used for subtle accents and informational elements"
                />

                {/* Color Preview */}
                <div className="pt-4 border-t border-gray-200 dark:border-zinc-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Preview</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 rounded-lg" style={{ backgroundColor: formData.brand_color_primary }}>
                      <span className="text-white text-xs font-medium">Primary</span>
                    </div>
                    <div className="flex-1 p-3 rounded-lg" style={{ backgroundColor: formData.brand_color_secondary }}>
                      <span className="text-white text-xs font-medium">Secondary</span>
                    </div>
                    <div className="flex-1 p-3 rounded-lg" style={{ backgroundColor: formData.brand_color_tertiary }}>
                      <span className="text-white text-xs font-medium">Tertiary</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Orders Contact Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-violet-600" />
            Orders Contact
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.orders_contact_name}
                onChange={(e) => handleInputChange('orders_contact_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={formData.orders_contact_email}
                onChange={(e) => handleInputChange('orders_contact_email', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="orders@company.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.orders_contact_phone}
                onChange={(e) => handleInputChange('orders_contact_phone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        {/* Accounting Contact Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-violet-600" />
            Accounting Contact
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.accounting_contact_name}
                onChange={(e) => handleInputChange('accounting_contact_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={formData.accounting_contact_email}
                onChange={(e) => handleInputChange('accounting_contact_email', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="accounting@company.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.accounting_contact_phone}
                onChange={(e) => handleInputChange('accounting_contact_phone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        {/* SharePoint Document Storage Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-violet-600" />
            SharePoint Document Storage
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Configure a root SharePoint folder for storing global parts documentation (submittals, manuals, schematics).
            Documents will be organized by manufacturer and part number.
          </p>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
              SharePoint Root URL
              <span className="relative group">
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  Example: https://isehome.sharepoint.com/sites/Unicorn/Knowledge
                </span>
              </span>
            </label>
            <input
              type="url"
              value={formData.company_sharepoint_root_url}
              onChange={(e) => handleInputChange('company_sharepoint_root_url', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
              placeholder="https://isehome.sharepoint.com/sites/Unicorn/Knowledge"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Folder structure will be: [Root]/[Manufacturer]/[PartNumber]/submittals/, schematics/, manuals/
            </p>
          </div>
        </div>

        {/* Service Settings Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-600" />
            Service Settings
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Configure default settings for service tickets and time tracking.
          </p>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
              Default Hourly Rate
              <span className="relative group">
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  Default labor rate for service tickets. Can be overridden per ticket.
                </span>
              </span>
            </label>
            <div className="relative w-48">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.default_service_hourly_rate}
                onChange={(e) => handleInputChange('default_service_hourly_rate', parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-12 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                placeholder="150"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">/hr</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              This rate will be used when calculating labor costs on service tickets unless a different rate is set on the individual ticket.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="submit"
            variant="primary"
            icon={Save}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Company Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CompanySettingsManager;
