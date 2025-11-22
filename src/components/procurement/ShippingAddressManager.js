import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import Button from '../ui/Button';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Star,
  X,
  Save,
  AlertCircle
} from 'lucide-react';

/**
 * ShippingAddressManager
 *
 * Manages shipping addresses for purchase orders
 * - View all addresses
 * - Add new addresses
 * - Edit existing addresses
 * - Delete addresses
 * - Set default address
 */
const ShippingAddressManager = ({
  embedded = false,
  onSelect = null,
  selectedAddressId = null
}) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    attention_to: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA',
    phone: '',
    is_default: false
  });

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('shipping_addresses')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (fetchError) {
        // Check if table doesn't exist (migration not run)
        if (fetchError.message?.includes('relation') || fetchError.code === '42P01') {
          setError('Shipping addresses table not found. Please run database migrations first.');
          setAddresses([]);
          setLoading(false);
          return;
        }
        throw fetchError;
      }

      setAddresses(data || []);
    } catch (err) {
      console.error('Failed to load shipping addresses:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError(null);

      if (editingAddress) {
        // Update existing address
        const { error: updateError } = await supabase
          .from('shipping_addresses')
          .update(formData)
          .eq('id', editingAddress.id);

        if (updateError) throw updateError;
      } else {
        // Create new address
        const { error: insertError } = await supabase
          .from('shipping_addresses')
          .insert([formData]);

        if (insertError) throw insertError;
      }

      // Reload addresses
      await loadAddresses();

      // Reset form
      handleCancel();
    } catch (err) {
      console.error('Failed to save address:', err);
      setError(err.message);
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    setFormData({
      name: address.name,
      attention_to: address.attention_to || '',
      address_line1: address.address_line1,
      address_line2: address.address_line2 || '',
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country || 'USA',
      phone: address.phone || '',
      is_default: address.is_default
    });
    setShowForm(true);
  };

  const handleDelete = async (addressId) => {
    if (!window.confirm('Are you sure you want to delete this shipping address?')) {
      return;
    }

    try {
      setError(null);

      const { error: deleteError } = await supabase
        .from('shipping_addresses')
        .delete()
        .eq('id', addressId);

      if (deleteError) throw deleteError;

      await loadAddresses();
    } catch (err) {
      console.error('Failed to delete address:', err);
      setError(err.message);
    }
  };

  const handleSetDefault = async (addressId) => {
    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('shipping_addresses')
        .update({ is_default: true })
        .eq('id', addressId);

      if (updateError) throw updateError;

      await loadAddresses();
    } catch (err) {
      console.error('Failed to set default address:', err);
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setEditingAddress(null);
    setShowForm(false);
    setFormData({
      name: '',
      attention_to: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'USA',
      phone: '',
      is_default: false
    });
  };

  const handleAddNew = () => {
    setEditingAddress(null);
    setShowForm(true);
  };

  const formatAddress = (address) => {
    const parts = [
      address.address_line1,
      address.address_line2,
      `${address.city}, ${address.state} ${address.postal_code}`,
      address.country !== 'USA' ? address.country : null
    ].filter(Boolean);

    return parts.join('\n');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading addresses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Shipping Addresses
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage delivery addresses for purchase orders
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleAddNew}
          >
            Add Address
          </Button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div style={sectionStyles.card} className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {editingAddress ? 'Edit Address' : 'New Address'}
            </h3>
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Office, Warehouse, Job Site"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Attention To
              </label>
              <input
                type="text"
                value={formData.attention_to}
                onChange={(e) => setFormData({ ...formData, attention_to: e.target.value })}
                placeholder="Person or department name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address Line 1 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address_line1}
                onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                placeholder="Street address"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Address Line 2
              </label>
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                placeholder="Suite, unit, building, floor, etc."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="e.g., TX"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Postal Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="is_default" className="text-sm text-gray-700 dark:text-gray-300">
                Set as default address
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={Save}
              >
                {editingAddress ? 'Update Address' : 'Add Address'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Address List */}
      {addresses.length === 0 ? (
        <div style={sectionStyles.card} className="p-8 text-center">
          <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            No shipping addresses yet. {embedded ? 'Add one below.' : 'Click "Add Address" to get started.'}
          </p>
          {embedded && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={handleAddNew}
              className="mt-4"
            >
              Add Address
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div
              key={address.id}
              style={sectionStyles.card}
              className={`p-4 cursor-pointer transition-colors ${
                onSelect && selectedAddressId === address.id
                  ? 'border-2 border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
              onClick={() => onSelect && onSelect(address)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {address.name}
                    </h3>
                    {address.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 text-xs">
                        <Star className="w-3 h-3 fill-current" />
                        Default
                      </span>
                    )}
                  </div>
                  {address.attention_to && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Attn: {address.attention_to}
                    </p>
                  )}
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {formatAddress(address)}
                  </p>
                  {address.phone && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Phone: {address.phone}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  {!address.is_default && !onSelect && (
                    <button
                      onClick={() => handleSetDefault(address.id)}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Set as default"
                    >
                      <Star className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Don't trigger address selection
                      handleEdit(address);
                    }}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Edit address"
                  >
                    <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Don't trigger address selection
                      handleDelete(address.id);
                    }}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Delete address"
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {embedded && addresses.length > 0 && !showForm && (
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={handleAddNew}
        >
          Add New Address
        </Button>
      )}
    </div>
  );
};

export default ShippingAddressManager;
