import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronRight,
  CalendarDays,
  Plus,
  Trash2,
  Loader2
} from 'lucide-react';
import BrandColorPicker from '../ui/BrandColorPicker';

// Standard US holidays for quick-add
const STANDARD_HOLIDAYS = [
  { name: "New Year's Day", getDate: (year) => `${year}-01-01` },
  { name: "Martin Luther King Jr. Day", getDate: (year) => getNthWeekday(year, 1, 1, 3) }, // 3rd Monday of January
  { name: "Presidents' Day", getDate: (year) => getNthWeekday(year, 2, 1, 3) }, // 3rd Monday of February
  { name: "Memorial Day", getDate: (year) => getLastWeekday(year, 5, 1) }, // Last Monday of May
  { name: "Juneteenth", getDate: (year) => `${year}-06-19` },
  { name: "Independence Day", getDate: (year) => `${year}-07-04` },
  { name: "Labor Day", getDate: (year) => getNthWeekday(year, 9, 1, 1) }, // 1st Monday of September
  { name: "Columbus Day", getDate: (year) => getNthWeekday(year, 10, 1, 2) }, // 2nd Monday of October
  { name: "Veterans Day", getDate: (year) => `${year}-11-11` },
  { name: "Thanksgiving", getDate: (year) => getNthWeekday(year, 11, 4, 4) }, // 4th Thursday of November
  { name: "Day After Thanksgiving", getDate: (year) => {
    const thanksgiving = getNthWeekday(year, 11, 4, 4);
    const date = new Date(thanksgiving);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }},
  { name: "Christmas Eve", getDate: (year) => `${year}-12-24` },
  { name: "Christmas Day", getDate: (year) => `${year}-12-25` },
  { name: "New Year's Eve", getDate: (year) => `${year}-12-31` }
];

// Helper to get nth weekday of a month
function getNthWeekday(year, month, dayOfWeek, n) {
  const firstDay = new Date(year, month - 1, 1);
  const firstOccurrence = 1 + (dayOfWeek - firstDay.getDay() + 7) % 7;
  const nthOccurrence = firstOccurrence + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(nthOccurrence).padStart(2, '0')}`;
}

// Helper to get last weekday of a month
function getLastWeekday(year, month, dayOfWeek) {
  const lastDay = new Date(year, month, 0); // Last day of month
  const diff = (lastDay.getDay() - dayOfWeek + 7) % 7;
  lastDay.setDate(lastDay.getDate() - diff);
  return lastDay.toISOString().split('T')[0];
}

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
  const [showHolidays, setShowHolidays] = useState(false);

  // Holidays state
  const [holidays, setHolidays] = useState([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [holidaysSaving, setHolidaysSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '', is_paid: true, is_company_closed: true });

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

  // Load holidays for selected year
  const loadHolidays = useCallback(async () => {
    try {
      setHolidaysLoading(true);
      const { data, error: fetchError } = await supabase
        .from('company_holidays')
        .select('*')
        .eq('year', selectedYear)
        .order('date', { ascending: true });

      if (fetchError) throw fetchError;
      setHolidays(data || []);
    } catch (err) {
      console.error('Failed to load holidays:', err);
    } finally {
      setHolidaysLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    if (showHolidays) {
      loadHolidays();
    }
  }, [showHolidays, loadHolidays]);

  // Add a single holiday
  const addHoliday = async () => {
    if (!newHoliday.name.trim() || !newHoliday.date) return;

    try {
      setHolidaysSaving(true);
      const holidayDate = new Date(newHoliday.date);

      const { error: insertError } = await supabase
        .from('company_holidays')
        .insert({
          name: newHoliday.name.trim(),
          date: newHoliday.date,
          year: holidayDate.getFullYear(),
          is_paid: newHoliday.is_paid,
          is_company_closed: newHoliday.is_company_closed
        });

      if (insertError) throw insertError;

      setNewHoliday({ name: '', date: '', is_paid: true, is_company_closed: true });
      await loadHolidays();
      setSuccess('Holiday added');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error('Failed to add holiday:', err);
      setError('Failed to add holiday');
    } finally {
      setHolidaysSaving(false);
    }
  };

  // Delete a holiday
  const deleteHoliday = async (holidayId) => {
    try {
      const { error: deleteError } = await supabase
        .from('company_holidays')
        .delete()
        .eq('id', holidayId);

      if (deleteError) throw deleteError;
      await loadHolidays();
    } catch (err) {
      console.error('Failed to delete holiday:', err);
      setError('Failed to delete holiday');
    }
  };

  // Add standard holidays for a year
  const addStandardHolidays = async () => {
    try {
      setHolidaysSaving(true);

      const holidaysToAdd = STANDARD_HOLIDAYS.map(h => ({
        name: h.name,
        date: h.getDate(selectedYear),
        year: selectedYear,
        is_paid: true,
        is_company_closed: true
      }));

      // Use upsert to avoid duplicates
      const { error: insertError } = await supabase
        .from('company_holidays')
        .upsert(holidaysToAdd, { onConflict: 'date,name', ignoreDuplicates: true });

      if (insertError) throw insertError;

      await loadHolidays();
      setSuccess(`Standard holidays added for ${selectedYear}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to add standard holidays:', err);
      setError('Failed to add standard holidays');
    } finally {
      setHolidaysSaving(false);
    }
  };

  // Copy holidays to next year
  const copyHolidaysToNextYear = async () => {
    try {
      setHolidaysSaving(true);
      const nextYear = selectedYear + 1;

      // Get current year holidays that are standard
      const holidaysToAdd = holidays.map(h => {
        // Try to find a standard holiday match to get the correct date
        const standardMatch = STANDARD_HOLIDAYS.find(sh => sh.name === h.name);
        let newDate;

        if (standardMatch) {
          newDate = standardMatch.getDate(nextYear);
        } else {
          // For custom holidays, just bump the year
          const date = new Date(h.date);
          date.setFullYear(nextYear);
          newDate = date.toISOString().split('T')[0];
        }

        return {
          name: h.name,
          date: newDate,
          year: nextYear,
          is_paid: h.is_paid,
          is_company_closed: h.is_company_closed
        };
      });

      const { error: insertError } = await supabase
        .from('company_holidays')
        .upsert(holidaysToAdd, { onConflict: 'date,name', ignoreDuplicates: true });

      if (insertError) throw insertError;

      setSuccess(`Holidays copied to ${nextYear}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to copy holidays:', err);
      setError('Failed to copy holidays to next year');
    } finally {
      setHolidaysSaving(false);
    }
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

        {/* Company Holidays Section - Collapsible */}
        <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHolidays(!showHolidays)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Company Holidays</h4>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (Observed days off)
              </span>
            </div>
            {showHolidays ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showHolidays && (
            <div className="p-4 pt-0 border-t border-gray-200 dark:border-zinc-700 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Define company-observed holidays. These dates will appear in the Time Off section and are used for PTO calculations.
              </p>

              {/* Year Selector and Actions */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white text-sm"
                  >
                    {[...Array(5)].map((_, i) => {
                      const year = new Date().getFullYear() + i;
                      return <option key={year} value={year}>{year}</option>;
                    })}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addStandardHolidays}
                    disabled={holidaysSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add US Holidays
                  </button>
                  <button
                    type="button"
                    onClick={copyHolidaysToNextYear}
                    disabled={holidaysSaving || holidays.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Copy to {selectedYear + 1}
                  </button>
                </div>
              </div>

              {/* Holidays List */}
              <div className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
                {holidaysLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : holidays.length > 0 ? (
                  <div className="divide-y divide-gray-200 dark:divide-zinc-700 max-h-64 overflow-y-auto">
                    {holidays.map(holiday => {
                      const date = new Date(holiday.date + 'T00:00:00');
                      return (
                        <div key={holiday.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                          <div className="w-12 text-center flex-shrink-0">
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{date.getDate()}</p>
                            <p className="text-xs text-gray-500 uppercase">{date.toLocaleDateString('en-US', { month: 'short' })}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{holiday.name}</p>
                            <p className="text-xs text-gray-500">
                              {date.toLocaleDateString('en-US', { weekday: 'long' })}
                              {holiday.is_paid && ' · Paid'}
                              {holiday.is_company_closed && ' · Office Closed'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteHoliday(holiday.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No holidays configured for {selectedYear}. Click "Add US Holidays" to add standard holidays.
                  </div>
                )}
              </div>

              {/* Add Custom Holiday */}
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Add Custom Holiday</p>
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      value={newHoliday.name}
                      onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Holiday name"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={newHoliday.date}
                      onChange={(e) => setNewHoliday(prev => ({ ...prev, date: e.target.value }))}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newHoliday.is_paid}
                        onChange={(e) => setNewHoliday(prev => ({ ...prev, is_paid: e.target.checked }))}
                        className="rounded border-gray-300 text-violet-500"
                      />
                      Paid
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newHoliday.is_company_closed}
                        onChange={(e) => setNewHoliday(prev => ({ ...prev, is_company_closed: e.target.checked }))}
                        className="rounded border-gray-300 text-violet-500"
                      />
                      Closed
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={addHoliday}
                    disabled={holidaysSaving || !newHoliday.name.trim() || !newHoliday.date}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {holidaysSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
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
