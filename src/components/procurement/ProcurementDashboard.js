import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { supplierService } from '../../services/supplierService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';
import { SupplierEditModal } from './SupplierEditModal';
import {
  Package,
  Building2,
  ShoppingCart,
  TrendingUp,
  ChevronRight,
  Plus,
  Loader,
  X
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
  const [showView, setShowView] = useState('overview'); // 'overview', 'suppliers', 'pos'
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [projects, setProjects] = useState([]);

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
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-violet-600" />
          Procurement Overview
        </h2>
      </div>

      {/* Overview Stats Grid */}
      {showView === 'overview' && (
        <>
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
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
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border transition-colors
                        ${isDraft
                          ? 'border-orange-400 dark:border-orange-600 border-2 bg-orange-50 dark:bg-orange-900/20'
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
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(po.order_date).toLocaleDateString()}
                        </div>
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              All Suppliers ({suppliers.length})
            </h3>
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

      {/* POs View */}
      {showView === 'pos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              All Purchase Orders ({filteredPOs.length})
            </h3>

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
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border transition-colors
                      ${isDraft
                        ? 'border-orange-400 dark:border-orange-600 border-2 bg-orange-50 dark:bg-orange-900/20'
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(po.order_date).toLocaleDateString()}
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
    </div>
  );
};

export default ProcurementDashboard;
