import React, { useState, useEffect } from 'react';
import { supplierService } from '../services/supplierService';
import { useAppState } from '../contexts/AppStateContext';
import SupplierEditModal from './procurement/SupplierEditModal';
import Button from './ui/Button';
import { Plus, Edit, Building2, Search } from 'lucide-react';

/**
 * VendorManagement Component
 * Displays list of vendors/suppliers with ability to add/edit
 */
const VendorManagement = () => {
  const { publishState, registerActions, unregisterActions } = useAppState();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await supplierService.getAllSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = () => {
    setEditingSupplier(null);
    setShowModal(true);
  };

  const handleEditVendor = (supplier) => {
    setEditingSupplier(supplier);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingSupplier(null);
  };

  const handleModalSuccess = () => {
    loadSuppliers();
    handleModalClose();
  };

  // Filter suppliers based on search term and status
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = !searchTerm ||
      supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.short_code?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && supplier.is_active !== false) ||
      (statusFilter === 'inactive' && supplier.is_active === false);

    return matchesSearch && matchesStatus;
  });

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'vendor-management',
      searchTerm: searchTerm,
      statusFilter: statusFilter,
      stats: {
        total: suppliers.length,
        filtered: filteredSuppliers.length,
        active: suppliers.filter(s => s.is_active !== false).length,
        inactive: suppliers.filter(s => s.is_active === false).length
      },
      vendors: filteredSuppliers.slice(0, 10).map(s => ({
        id: s.id,
        name: s.name,
        shortCode: s.short_code,
        contactName: s.contact_name,
        email: s.email,
        isActive: s.is_active !== false
      })),
      hint: 'Vendor management page. Can search vendors, filter by status, open vendor details, or create new vendors.'
    });
  }, [publishState, suppliers, filteredSuppliers, searchTerm, statusFilter]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_vendors: async ({ query }) => {
        if (typeof query === 'string') {
          setSearchTerm(query);
          return { success: true, message: query ? `Searching for "${query}"` : 'Cleared search' };
        }
        return { success: false, error: 'Invalid search query' };
      },
      filter_by_status: async ({ status }) => {
        if (['all', 'active', 'inactive'].includes(status)) {
          setStatusFilter(status);
          return { success: true, message: `Filtering by status: ${status}` };
        }
        return { success: false, error: 'Invalid status. Use: all, active, or inactive' };
      },
      open_vendor: async ({ vendorName, vendorId }) => {
        const vendor = vendorName
          ? suppliers.find(s => s.name?.toLowerCase().includes(vendorName.toLowerCase()))
          : suppliers.find(s => s.id === vendorId);
        if (vendor) {
          setEditingSupplier(vendor);
          setShowModal(true);
          return { success: true, message: `Opening vendor: ${vendor.name}` };
        }
        return { success: false, error: 'Vendor not found' };
      },
      create_vendor: async () => {
        setEditingSupplier(null);
        setShowModal(true);
        return { success: true, message: 'Opening new vendor form' };
      },
      list_vendors: async () => {
        return {
          success: true,
          vendors: filteredSuppliers.slice(0, 10).map(s => ({
            name: s.name,
            shortCode: s.short_code,
            contactName: s.contact_name
          })),
          count: filteredSuppliers.length
        };
      },
      clear_filters: async () => {
        setSearchTerm('');
        setStatusFilter('all');
        return { success: true, message: 'Cleared all filters' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, suppliers, filteredSuppliers]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
        Loading vendors...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Vendors ({filteredSuppliers.length}{filteredSuppliers.length !== suppliers.length ? ` of ${suppliers.length}` : ''})
        </h3>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={handleAddVendor}
        >
          Add Vendor
        </Button>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search vendors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-900 dark:text-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Vendor List */}
      {filteredSuppliers.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-900/50 rounded-lg">
          {suppliers.length === 0
            ? 'No vendors added yet. Click "Add Vendor" to get started.'
            : 'No vendors match your search criteria.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {supplier.name}
                    </h4>
                    {supplier.short_code && (
                      <span className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded">
                        {supplier.short_code}
                      </span>
                    )}
                  </div>

                  {supplier.contact_name && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Contact: {supplier.contact_name}
                    </p>
                  )}

                  {supplier.email && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {supplier.email}
                    </p>
                  )}

                  {supplier.phone && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {supplier.phone}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleEditVendor(supplier)}
                  className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition-colors"
                  title="Edit Vendor"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {showModal && (
        <SupplierEditModal
          isOpen={showModal}
          onClose={handleModalClose}
          supplier={editingSupplier}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
};

export default VendorManagement;
