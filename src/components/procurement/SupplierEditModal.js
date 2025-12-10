import React, { useState, useEffect, useCallback } from 'react';
import { supplierService } from '../../services/supplierService';
import { useAuth } from '../../contexts/AuthContext';
import { sendNotificationEmail, SYSTEM_EMAIL, WHITELIST_NOTICE_HTML, WHITELIST_NOTICE_TEXT, generateVendorEmailFooter, wrapEmailHtml } from '../../services/issueNotificationService';
import { companySettingsService } from '../../services/companySettingsService';

// Generate base short code from vendor name (without uniqueness suffix)
const generateBaseShortCode = (name) => {
  if (!name) return '';
  // Remove common suffixes and clean the name
  const cleaned = name
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|enterprises?|industries?|international|intl)\b\.?/gi, '')
    .trim();

  // Split into words
  const words = cleaned.split(/[\s\-_&]+/).filter(w => w.length > 0);

  if (words.length === 0) return '';

  if (words.length === 1) {
    // Single word - take first 4 characters
    return words[0].substring(0, 4).toUpperCase();
  }

  if (words.length === 2) {
    // Two words - take first 2 chars of each
    return (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
  }

  // 3+ words - take first char of first 4 words
  return words.slice(0, 4).map(w => w[0]).join('').toUpperCase();
};

// Generate unique short code by adding numeric suffix if needed
const generateUniqueShortCode = (name, existingCodes, currentSupplierId = null) => {
  const baseCode = generateBaseShortCode(name);
  if (!baseCode) return '';

  // Filter out current supplier's code when editing
  const otherCodes = new Set(
    existingCodes
      .filter(s => s.id !== currentSupplierId)
      .map(s => (s.short_code || '').toUpperCase())
  );

  // If base code is unique, use it
  if (!otherCodes.has(baseCode)) {
    return baseCode;
  }

  // Otherwise, append incrementing number until unique
  let suffix = 2;
  while (otherCodes.has(`${baseCode}${suffix}`)) {
    suffix++;
  }
  return `${baseCode}${suffix}`;
};

export const SupplierEditModal = ({ supplierId, supplier: initialSupplier, onClose, onSave }) => {
  const { acquireToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const isCreateMode = !supplierId; // No ID = creating new supplier
  const originalEmail = initialSupplier?.email || ''; // Track original email to detect changes

  const [formData, setFormData] = useState({
    name: '',
    short_code: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'USA',
    website: '',
    account_number: '',
    payment_terms: 'Net 30',
    shipping_account: '',
    notes: '',
    is_active: true,
    is_preferred: false,
    is_internal_inventory: false
  });

  // Load all suppliers on mount for uniqueness check
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const suppliers = await supplierService.getAllSuppliers();
        setAllSuppliers(suppliers);
      } catch (err) {
        console.error('Failed to load suppliers for validation:', err);
      }
    };
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (initialSupplier && !isCreateMode) {
      // Edit mode - populate from existing supplier
      setFormData({
        name: initialSupplier.name || '',
        short_code: initialSupplier.short_code || '',
        contact_name: initialSupplier.contact_name || '',
        email: initialSupplier.email || '',
        phone: initialSupplier.phone || '',
        address: initialSupplier.address || '',
        city: initialSupplier.city || '',
        state: initialSupplier.state || '',
        zip: initialSupplier.zip || '',
        country: initialSupplier.country || 'USA',
        website: initialSupplier.website || '',
        account_number: initialSupplier.account_number || '',
        payment_terms: initialSupplier.payment_terms || 'Net 30',
        shipping_account: initialSupplier.shipping_account || '',
        notes: initialSupplier.notes || '',
        is_active: initialSupplier.is_active !== false,
        is_preferred: initialSupplier.is_preferred || false,
        is_internal_inventory: initialSupplier.is_internal_inventory || false
      });
    }
  }, [initialSupplier, isCreateMode]);

  // Check if vendor name is unique
  const checkNameUnique = useCallback((name) => {
    if (!name.trim()) {
      setNameError(null);
      return true;
    }
    const normalizedName = name.trim().toLowerCase();
    const isDuplicate = allSuppliers.some(s => {
      // Skip self in edit mode
      if (!isCreateMode && s.id === supplierId) return false;
      return s.name.toLowerCase() === normalizedName;
    });
    if (isDuplicate) {
      setNameError('A supplier with this name already exists');
      return false;
    }
    setNameError(null);
    return true;
  }, [allSuppliers, isCreateMode, supplierId]);

  // Check if short code is unique (excluding current supplier in edit mode)
  const checkShortCodeUnique = useCallback((code) => {
    if (!code.trim()) return true;
    const normalizedCode = code.trim().toUpperCase();
    return !allSuppliers.some(s => {
      if (!isCreateMode && s.id === supplierId) return false;
      return (s.short_code || '').toUpperCase() === normalizedCode;
    });
  }, [allSuppliers, isCreateMode, supplierId]);

  // Find the current internal inventory supplier (if any, excluding self)
  const getCurrentInternalInventorySupplier = useCallback(() => {
    return allSuppliers.find(s => {
      if (!isCreateMode && s.id === supplierId) return false;
      return s.is_internal_inventory === true;
    });
  }, [allSuppliers, isCreateMode, supplierId]);

  const handleChange = (field, value) => {
    // Special handling for is_internal_inventory toggle
    if (field === 'is_internal_inventory' && value === true) {
      const existingInternalSupplier = getCurrentInternalInventorySupplier();
      if (existingInternalSupplier) {
        const confirmed = window.confirm(
          `"${existingInternalSupplier.name}" is currently marked as the internal inventory supplier.\n\nDo you want to switch it to this supplier instead?`
        );
        if (!confirmed) {
          return; // Don't change the toggle
        }
        // User confirmed - we'll unset the flag on the other supplier when saving
      }
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // When name changes, auto-generate short_code and contact_name
      if (field === 'name') {
        // Check uniqueness
        checkNameUnique(value);

        // Auto-generate unique short code if it's empty or was auto-generated before
        const currentShortCode = prev.short_code;
        const prevBaseCode = generateBaseShortCode(prev.name);
        // Check if current code matches the base pattern (with or without suffix)
        const wasAutoGenerated = !currentShortCode ||
          currentShortCode === prevBaseCode ||
          currentShortCode.match(new RegExp(`^${prevBaseCode}\\d*$`, 'i'));
        if (wasAutoGenerated) {
          updated.short_code = generateUniqueShortCode(value, allSuppliers, supplierId);
        }

        // Auto-populate contact name from vendor name if contact_name is empty
        if (!prev.contact_name) {
          updated.contact_name = value;
        }
      }

      return updated;
    });
  };

  // Send welcome email to new vendor
  const sendVendorWelcomeEmail = async (supplierName, supplierEmail) => {
    if (!supplierEmail) return;

    try {
      const graphToken = await acquireToken();
      const contactName = formData.contact_name || supplierName || 'there';

      // Fetch company settings for footer branding
      let companySettings = null;
      try {
        companySettings = await companySettingsService.getCompanySettings();
      } catch (err) {
        console.warn('Could not fetch company settings for email:', err);
      }

      const emailFooter = generateVendorEmailFooter(companySettings);

      const htmlContent = `
        <p>Hi ${contactName},</p>
        <p>You have been added to <strong>Unicorn</strong>, our project management system.</p>
        <p>You may receive tracking requests and order updates from this system. When you receive a tracking request, simply click the link to submit your tracking information.</p>
        ${WHITELIST_NOTICE_HTML}
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);
      const text = `Hi ${contactName},\n\nYou have been added to Unicorn, our project management system.\n\nYou may receive tracking requests and order updates from this system. When you receive a tracking request, simply click the link to submit your tracking information.${WHITELIST_NOTICE_TEXT}`;

      // Parse comma-separated emails into array
      const toEmails = supplierEmail
        .split(',')
        .map(e => e.trim())
        .filter(e => e);

      await sendNotificationEmail(
        {
          to: toEmails,
          cc: [SYSTEM_EMAIL],
          subject: `Welcome to Unicorn - ${supplierName}`,
          html,
          text,
          sendAsUser: true
        },
        { authToken: graphToken }
      );
      console.log('[SupplierEditModal] Welcome email sent to vendor:', toEmails.join(', '));
    } catch (err) {
      // Don't fail the supplier save if email fails
      console.warn('[SupplierEditModal] Failed to send welcome email:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        throw new Error('Supplier name is required');
      }
      if (!formData.short_code.trim()) {
        throw new Error('Short code is required');
      }

      // Check name uniqueness
      if (!checkNameUnique(formData.name)) {
        throw new Error('A supplier with this name already exists');
      }

      // Check short code uniqueness
      if (!checkShortCodeUnique(formData.short_code)) {
        throw new Error('A supplier with this short code already exists');
      }

      // Validate email format(s) if provided
      if (formData.email?.trim()) {
        const emails = formData.email.split(',').map(e => e.trim()).filter(e => e);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emails.filter(e => !emailRegex.test(e));
        if (invalidEmails.length > 0) {
          throw new Error(`Invalid email format: ${invalidEmails.join(', ')}`);
        }
      }

      // Check if email is new or changed
      const newEmail = formData.email?.trim() || '';
      const emailIsNew = isCreateMode && newEmail;
      const emailChanged = !isCreateMode && newEmail && newEmail.toLowerCase() !== originalEmail.toLowerCase();
      const shouldSendWelcomeEmail = emailIsNew || emailChanged;

      // If marking as internal inventory, unset flag on any existing internal inventory supplier
      if (formData.is_internal_inventory) {
        const existingInternalSupplier = getCurrentInternalInventorySupplier();
        if (existingInternalSupplier) {
          await supplierService.updateSupplier(existingInternalSupplier.id, {
            is_internal_inventory: false
          });
          console.log(`[SupplierEditModal] Removed internal inventory flag from "${existingInternalSupplier.name}"`);
        }
      }

      let result;
      if (isCreateMode) {
        // Create new supplier
        result = await supplierService.createSupplier(formData);
      } else {
        // Update existing supplier
        result = await supplierService.updateSupplier(supplierId, formData);
      }

      // Send welcome email if email is new or changed
      if (shouldSendWelcomeEmail) {
        await sendVendorWelcomeEmail(formData.name, newEmail);
      }

      if (onSave) onSave(result);
      onClose();
    } catch (err) {
      console.error(`Failed to ${isCreateMode ? 'create' : 'update'} supplier:`, err);
      setError(err.message || `Failed to ${isCreateMode ? 'create' : 'update'} supplier`);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isCreateMode ? 'Add New Supplier' : 'Edit Supplier'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white ${
                    nameError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  required
                />
                {nameError && (
                  <p className="text-xs text-red-500 mt-1">{nameError}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Short Code * <span className="text-xs font-normal text-gray-500">(auto-generated)</span>
                </label>
                <input
                  type="text"
                  value={formData.short_code}
                  onChange={(e) => handleChange('short_code', e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white uppercase"
                  maxLength={10}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used in PO numbers - you can edit if needed
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Payment Terms
                </label>
                <select
                  value={formData.payment_terms}
                  onChange={(e) => handleChange('payment_terms', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                >
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="COD">COD</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => handleChange('contact_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email(s)
                </label>
                <input
                  type="text"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  placeholder="orders@supplier.com, accounting@supplier.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter multiple emails separated by commas. All recipients will receive PO emails.
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => handleChange('zip', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Additional Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => handleChange('account_number', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Shipping Account
                </label>
                <input
                  type="text"
                  value={formData.shipping_account}
                  onChange={(e) => handleChange('shipping_account', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  placeholder="FedEx, UPS, etc. account number"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Status Toggles */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Status</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Active Supplier</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_preferred}
                  onChange={(e) => handleChange('is_preferred', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Preferred Supplier</span>
              </label>
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_internal_inventory}
                    onChange={(e) => handleChange('is_internal_inventory', e.target.checked)}
                    className="rounded mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Internal Inventory Supplier</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Mark this supplier as your internal warehouse/inventory source. POs to this supplier will decrement your global parts inventory when submitted.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || nameError}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (isCreateMode ? 'Creating...' : 'Saving...') : (isCreateMode ? 'Create Supplier' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierEditModal;
