import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { supplierService } from '../../services/supplierService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import { SupplierEditModal } from './SupplierEditModal';
import CompanySettingsManager from './CompanySettingsManager';
import ShippingAddressManager from './ShippingAddressManager';
import SupplierManager from './SupplierManager';
import DateField from '../ui/DateField';
import {
  Package,
  Building2,
  ShoppingCart,
  TrendingUp,
  ChevronRight,
  Plus,
  Loader,
  X,
  ArrowLeft,
  ChevronDown,
  Edit3,
  Trash2,
  Settings,
  MapPin
} from 'lucide-react';

const ProcurementDashboard = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSuppliers: 0,
    activeSuppliers: 0,
    activePOs: 0,
    outstandingValue: 0
  });
  const [allPOs, setAllPOs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showView, setShowView] = useState('overview'); // 'overview', 'suppliers', 'pos', 'settings'
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [projects, setProjects] = useState([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poDetailsLoading, setPoDetailsLoading] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [suppliersData, posData, projectsData] = await Promise.all([
        supplierService.getAllSuppliers(),
        purchaseOrderService.getAllPurchaseOrders(),
        loadProjects()
      ]);

      setSuppliers(suppliersData || []);
      setAllPOs(posData || []);
      setProjects(projectsData || []);

      // Calculate stats
      const activeSuppliers = (suppliersData || []).filter(s => s.is_active);

      // Active POs = draft, submitted, confirmed, partially_received (not received or cancelled)
      const activePOs = posData.filter(po =>
        ['draft', 'submitted', 'confirmed', 'partially_received'].includes(po.status)
      );

      // Outstanding value = only active POs (not yet fully received)
      const outstandingValue = activePOs.reduce((sum, po) => sum + (po.total_amount || 0), 0);

      setStats({
        totalSuppliers: (suppliersData || []).length,
        activeSuppliers: activeSuppliers.length,
        activePOs: activePOs.length,
        outstandingValue: outstandingValue
      });
    } catch (error) {
      console.error('Error loading procurement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, project_number')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading projects:', error);
      return [];
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      partially_received: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      received: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    };
    return colors[status] || colors.draft;
  };

  // Filter POs by project
  const filteredPOs = projectFilter === 'all'
    ? allPOs
    : allPOs.filter(po => po.project_id === projectFilter);

  const handlePOClick = async (poId) => {
    try {
      setPoDetailsLoading(true);
      const poDetails = await purchaseOrderService.getPurchaseOrder(poId);
      setSelectedPO(poDetails);
    } catch (error) {
      console.error('Error loading PO details:', error);
      alert('Failed to load purchase order details');
    } finally {
      setPoDetailsLoading(false);
    }
  };

  const handleDeletePO = async (po) => {
    if (po.status !== 'draft') {
      alert('Only draft POs can be deleted');
      return;
    }

    // First warning
    if (!window.confirm(`⚠️ WARNING: Delete PO ${po.po_number}?\n\nThis will:\n- Remove all ${po.items?.length || 0} line items\n- Clear quantity tracking\n\nThis action CANNOT be undone.`)) {
      return;
    }

    // Second warning (double confirmation)
    if (!window.confirm(`🛑 FINAL CONFIRMATION\n\nAre you absolutely sure you want to delete PO ${po.po_number}?\n\nType YES in your mind and click OK to proceed.`)) {
      return;
    }

    try {
      await purchaseOrderService.deletePurchaseOrder(po.id);
      setAllPOs(prev => prev.filter(p => p.id !== po.id));
      setSelectedPO(null);
      alert('Purchase order deleted successfully');
    } catch (error) {
      console.error('Error deleting PO:', error);
      alert('Failed to delete purchase order: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={sectionStyles.card} className="mb-6">
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      </div>
    );
  }

  return (
    <div style={sectionStyles.card} className="mb-6">
      {/* Header - Collapsible */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between mb-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-3 -m-3 rounded-lg transition-colors"
      >
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-violet-600" />
          Procurement Overview
        </h2>
        <ChevronDown
          className={`w-5 h-5 text-gray-500 transition-transform ${
            isCollapsed ? '' : 'rotate-180'
          }`}
        />
      </button>

      {!isCollapsed && (
        <div>

      {/* Overview Stats Grid */}
      {showView === 'overview' && (
        <>
          <div className="grid grid-cols-4 gap-3 sm:gap-4 mb-6">
            {/* Suppliers Card - CLICKABLE */}
            <div
              onClick={() => setShowView('suppliers')}
              className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-800/20
                        rounded-lg p-4 border border-violet-200 dark:border-violet-700
                        cursor-pointer hover:shadow-lg transition-all transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-2">
                <Building2 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400">SUPPLIERS</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {stats.activeSuppliers}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {stats.totalSuppliers} total
              </div>
            </div>

            {/* Active POs Card - CLICKABLE */}
            <div
              onClick={() => setShowView('pos')}
              className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20
                        rounded-lg p-4 border border-blue-200 dark:border-blue-700
                        cursor-pointer hover:shadow-lg transition-all transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-2">
                <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">ACTIVE POs</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {stats.activePOs}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Not yet received
              </div>
            </div>

            {/* Outstanding Value Card */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20
                          rounded-lg p-4 border border-green-200 dark:border-green-700">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                <span className="text-[10px] font-medium text-green-600 dark:text-green-400">OUTSTANDING</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(stats.outstandingValue)}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Active PO value
              </div>
            </div>

            {/* Settings Card - CLICKABLE */}
            <div
              onClick={() => setShowView('settings')}
              className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50
                        rounded-lg p-4 border border-gray-200 dark:border-gray-600
                        cursor-pointer hover:shadow-lg transition-all transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-2">
                <Settings className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">SETTINGS</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                Company
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Logo & contacts
              </div>
            </div>
          </div>

          {/* Recent POs */}
          {allPOs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recent Purchase Orders
              </h3>
              <div className="space-y-3">
                {allPOs.slice(0, 10).map(po => {
                  const isDraft = po.status === 'draft';
                  return (
                    <div
                      key={po.id}
                      onClick={() => handlePOClick(po.id)}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border transition-colors cursor-pointer
                        ${isDraft
                          ? 'border-orange-400 dark:border-orange-600 border-2 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                          {isDraft && (
                            <span className="text-orange-600 dark:text-orange-400 text-sm font-bold">⚠️</span>
                          )}
                          <span className="font-medium text-gray-900 dark:text-white text-base">
                            {po.po_number}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(po.status)}`}>
                            {po.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {po.supplier_name} · {po.project_name}
                        </div>
                        {isDraft && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1">
                            Draft - Not yet submitted
                          </div>
                        )}
                      </div>
                      <div className="text-left sm:text-right flex-shrink-0">
                        <div className="font-semibold text-gray-900 dark:text-white text-lg">
                          {formatCurrency(po.total_amount)}
                        </div>
                        <DateField
                          date={po.order_date}
                          isCompleted={po.status === 'received'}
                          showIcon={false}
                          showBadge={false}
                          showDescription={false}
                          variant="inline"
                        />
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 ml-2" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Suppliers View */}
      {showView === 'suppliers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                onClick={() => setShowView('overview')}
              >
                Back
              </Button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                All Suppliers ({suppliers.length})
              </h3>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setCreatingSupplier(true)}
            >
              Add Supplier
            </Button>
          </div>

          {suppliers.length === 0 ? (
            <div style={sectionStyles.card} className="text-center py-12">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400 mb-4">No suppliers yet</p>
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setCreatingSupplier(true)}
              >
                Add Your First Supplier
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  style={sectionStyles.card}
                  className="p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {supplier.name}
                        </h4>
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                          {supplier.short_code}
                        </span>
                        {!supplier.is_active && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                            Inactive
                          </span>
                        )}
                        {supplier.is_seed_data && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                            🧪 Test Data
                          </span>
                        )}
                        {(!supplier.contact_name && !supplier.email && !supplier.phone) && !supplier.is_seed_data && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                            ⚠️ Incomplete
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                        {supplier.contact_name && (
                          <div>Contact: {supplier.contact_name}</div>
                        )}
                        {supplier.email && (
                          <div>Email: {supplier.email}</div>
                        )}
                        {supplier.phone && (
                          <div>Phone: {supplier.phone}</div>
                        )}
                        {supplier.city && supplier.state && (
                          <div>Location: {supplier.city}, {supplier.state}</div>
                        )}
                      </div>
                      {supplier.is_seed_data && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                          This is test/seed data from SQL migration. You can safely delete it or update it with real supplier info.
                        </p>
                      )}
                      {(!supplier.contact_name && !supplier.email && !supplier.phone) && !supplier.is_seed_data && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                          This supplier was auto-created from CSV import. Click Edit to add contact details.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingSupplier(supplier)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Company Settings View */}
      {showView === 'settings' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowLeft}
              onClick={() => setShowView('overview')}
            >
              Back
            </Button>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-violet-600" />
              Procurement Settings
            </h3>
          </div>

          <div className="space-y-6">
            {/* Company Information Section */}
            <div style={sectionStyles.card} className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-violet-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Company Information</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Company logo and contact information for purchase orders and external portals.
              </p>
              <CompanySettingsManager />
            </div>

            {/* Shipping Addresses Section */}
            <div style={sectionStyles.card} className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-violet-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Shipping Addresses</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Manage shipping addresses for purchase orders. These addresses are available across all projects.
              </p>
              <ShippingAddressManager embedded={true} />
            </div>

            {/* Supplier Management Section */}
            <div style={sectionStyles.card} className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-violet-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Supplier Management</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Manage suppliers for purchase orders. Add new suppliers or edit existing supplier information.
              </p>
              <SupplierManager />
            </div>
          </div>
        </div>
      )}

      {/* POs View */}
      {showView === 'pos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                onClick={() => setShowView('overview')}
              >
                Back
              </Button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                All Purchase Orders ({filteredPOs.length})
              </h3>
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-2">
              {projectFilter !== 'all' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setProjectFilter('all')}
                  icon={X}
                >
                  Clear Filter
                </Button>
              )}
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="all">All Projects</option>
                {projects.map(proj => (
                  <option key={proj.id} value={proj.id}>
                    {proj.project_number ? `${proj.project_number} - ` : ''}{proj.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredPOs.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">
                {projectFilter === 'all' ? 'No purchase orders yet' : 'No purchase orders for this project'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPOs.map(po => {
                const isDraft = po.status === 'draft';
                return (
                  <div
                    key={po.id}
                    onClick={() => handlePOClick(po.id)}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border transition-colors cursor-pointer
                      ${isDraft
                        ? 'border-orange-400 dark:border-orange-600 border-2 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        {isDraft && (
                          <span className="text-orange-600 dark:text-orange-400 text-sm font-bold">⚠️</span>
                        )}
                        <span className="font-medium text-gray-900 dark:text-white text-base">
                          {po.po_number}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(po.status)}`}>
                          {po.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {po.supplier_name} · {po.project_name}
                      </div>
                      {po.milestone_stage && (
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Milestone: {po.milestone_stage}
                        </div>
                      )}
                      {isDraft && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1">
                          Draft PO - Not yet submitted to supplier
                        </div>
                      )}
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <div className="font-semibold text-gray-900 dark:text-white text-lg">
                        {formatCurrency(po.total_amount)}
                      </div>
                      <div className="text-xs">
                        <DateField
                          date={po.order_date}
                          isCompleted={po.status === 'received'}
                          showIcon={false}
                          showBadge={false}
                          showDescription={false}
                          variant="inline"
                        />
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-2" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Supplier Edit Modal */}
      {editingSupplier && (
        <SupplierEditModal
          supplierId={editingSupplier.id}
          supplier={editingSupplier}
          onClose={() => setEditingSupplier(null)}
          onSave={(updated) => {
            // Update supplier in list
            setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
            setEditingSupplier(null);
          }}
        />
      )}

      {/* Supplier Create Modal (reuses edit modal) */}
      {creatingSupplier && (
        <SupplierEditModal
          supplierId={null}
          supplier={null}
          onClose={() => setCreatingSupplier(false)}
          onSave={(newSupplier) => {
            // Add new supplier to list
            setSuppliers(prev => [...prev, newSupplier]);
            setCreatingSupplier(false);
          }}
        />
      )}

      {/* Simple PO Details Modal */}
      {selectedPO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPO(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedPO.po_number}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(selectedPO.status)}`}>
                    {selectedPO.status.charAt(0).toUpperCase() + selectedPO.status.slice(1)}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedPO.supplier?.name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-6">
              {/* PO Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Order Date
                  </label>
                  <DateField
                    date={selectedPO.order_date}
                    isCompleted={selectedPO.status === 'received'}
                    showIcon={true}
                    showBadge={false}
                    showDescription={false}
                    variant="compact"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Requested Delivery
                  </label>
                  <DateField
                    date={selectedPO.requested_delivery_date}
                    isCompleted={selectedPO.status === 'received'}
                    showIcon={true}
                    showBadge={true}
                    showDescription={true}
                    variant="compact"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Line Items ({selectedPO.items?.length || 0})
                </h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium">#</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium">Part Number</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium">Description</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Qty</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Unit Cost</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedPO.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">{item.line_number}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {item.equipment?.part_number || 'N/A'}
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {item.equipment?.name || item.equipment?.description || 'N/A'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                            {item.quantity_ordered}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                            ${(item.unit_cost || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                            ${(item.line_total || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Subtotal</span>
                  <span className="text-gray-900 dark:text-white font-semibold">
                    ${(selectedPO.subtotal || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Tax</span>
                  <span className="text-gray-900 dark:text-white font-semibold">
                    ${(selectedPO.tax_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Shipping</span>
                  <span className="text-gray-900 dark:text-white font-semibold">
                    ${(selectedPO.shipping_cost || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                  <span className="text-base font-bold text-gray-900 dark:text-white">Total</span>
                  <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
                    ${(selectedPO.total_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {(selectedPO.internal_notes || selectedPO.supplier_notes) && (
                <div className="space-y-3">
                  {selectedPO.internal_notes && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Internal Notes
                      </label>
                      <p className="text-gray-900 dark:text-white">{selectedPO.internal_notes}</p>
                    </div>
                  )}
                  {selectedPO.supplier_notes && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Supplier Notes
                      </label>
                      <p className="text-gray-900 dark:text-white">{selectedPO.supplier_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedPO.status !== 'draft' && (
                    <span>Only draft POs can be edited or deleted</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={Edit3}
                    onClick={() => {
                      // Navigate to order equipment page for this PO's project
                      window.location.href = `/pm/order-equipment/${selectedPO.project_id}`;
                    }}
                    disabled={selectedPO.status !== 'draft'}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    icon={Trash2}
                    onClick={() => handleDeletePO(selectedPO)}
                    disabled={selectedPO.status !== 'draft'}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedPO(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default ProcurementDashboard;
