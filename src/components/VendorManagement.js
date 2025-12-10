import React, { useState, useEffect } from 'react';
import { supplierService } from '../services/supplierService';
import SupplierEditModal from './procurement/SupplierEditModal';
import Button from './ui/Button';
import { Plus, Edit, Building2 } from 'lucide-react';

/**
 * VendorManagement Component
 * Displays list of vendors/suppliers with ability to add/edit
 */
const VendorManagement = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
          Vendors ({suppliers.length})
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

      {/* Vendor List */}
      {suppliers.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-900/50 rounded-lg">
          No vendors added yet. Click "Add Vendor" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suppliers.map((supplier) => (
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
