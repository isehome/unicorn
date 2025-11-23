import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { supplierService } from '../../services/supplierService';
import SupplierEditModal from './SupplierEditModal';
import Button from '../ui/Button';
import {
  Plus,
  Edit,
  Building2,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

/**
 * SupplierManager Component
 * Displays list of suppliers with expandable details and ability to add/edit
 * Styled to match the supplier cards in Prewire/Trim tabs
 */
const SupplierManager = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = useState({});

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

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setShowModal(true);
  };

  const handleEditSupplier = (supplier) => {
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

  const toggleExpansion = (supplierId) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [supplierId]: !prev[supplierId]
    }));
  };

  // Determine supplier status based on completeness
  const getSupplierStatus = (supplier) => {
    // Must have email to be considered complete/ready
    if (supplier.email) {
      return 'complete';
    }
    return 'needs_setup';
  };

  const getStatusBadge = (supplier) => {
    const status = getSupplierStatus(supplier);

    if (status === 'complete') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
          <CheckCircle className="w-3 h-3" />
          Ready
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium rounded">
        <AlertCircle className="w-3 h-3" />
        Needs Setup
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
        Loading suppliers...
      </div>
    );
  }

  // Calculate stats
  const completeSuppliers = suppliers.filter(s => s.email);
  const incompleteSuppliers = suppliers.filter(s => !s.email);

  return (
    <div className="space-y-4">
      {/* Stats Section */}
      <div style={sectionStyles.card} className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Total Suppliers</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {suppliers.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Ready (Complete)</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            {completeSuppliers.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Needs Setup</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {incompleteSuppliers.length}
          </p>
        </div>
      </div>

      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Manage Suppliers
        </h3>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={handleAddSupplier}
        >
          Add Supplier
        </Button>
      </div>

      {/* Supplier Cards */}
      {suppliers.length === 0 ? (
        <div style={sectionStyles.card} className="text-center py-12">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No suppliers added yet. Click "Add Supplier" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((supplier) => {
            const isExpanded = expandedSuppliers[supplier.id];
            const status = getSupplierStatus(supplier);
            const needsSetup = status === 'needs_setup';

            return (
              <div
                key={supplier.id}
                style={sectionStyles.card}
                className={`border-l-4 ${
                  needsSetup
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-green-500'
                }`}
              >
                {/* Supplier Header */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => toggleExpansion(supplier.id)}
                  >
                    <div className={`p-2 rounded-lg ${
                      needsSetup
                        ? 'bg-orange-100 dark:bg-orange-900/30'
                        : 'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      <Building2 className={`w-5 h-5 ${
                        needsSetup
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-green-600 dark:text-green-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {supplier.name}
                        </h3>
                        {supplier.short_code && (
                          <span className="px-2 py-1 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                            {supplier.short_code}
                          </span>
                        )}
                        {getStatusBadge(supplier)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {supplier.contact_name && (
                          <span>{supplier.contact_name}</span>
                        )}
                        {supplier.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {supplier.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Edit}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditSupplier(supplier);
                      }}
                    >
                      Edit
                    </Button>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-4 text-sm">
                    {/* Contact Info */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">Contact Information</h4>
                      {supplier.contact_name && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Contact:</span>
                          <span>{supplier.contact_name}</span>
                        </div>
                      )}
                      {supplier.email && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Mail className="w-4 h-4" />
                          <span>{supplier.email}</span>
                        </div>
                      )}
                      {supplier.phone && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="w-4 h-4" />
                          <span>{supplier.phone}</span>
                        </div>
                      )}
                      {!supplier.contact_name && !supplier.email && !supplier.phone && (
                        <p className="text-gray-500 dark:text-gray-500 italic">No contact info</p>
                      )}
                    </div>

                    {/* Address Info */}
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">Address</h4>
                      {supplier.address ? (
                        <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                          <MapPin className="w-4 h-4 mt-0.5" />
                          <div>
                            <p>{supplier.address}</p>
                            {(supplier.city || supplier.state || supplier.zip) && (
                              <p>
                                {[supplier.city, supplier.state, supplier.zip].filter(Boolean).join(', ')}
                              </p>
                            )}
                            {supplier.country && supplier.country !== 'USA' && (
                              <p>{supplier.country}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-500 italic">No address</p>
                      )}
                    </div>

                    {/* Payment Terms */}
                    {supplier.payment_terms && (
                      <div className="col-span-2 space-y-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">Payment Terms</h4>
                        <p className="text-gray-600 dark:text-gray-400">{supplier.payment_terms}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

export default SupplierManager;
