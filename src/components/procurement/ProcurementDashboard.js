import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { supplierService } from '../../services/supplierService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { trackingService } from '../../services/trackingService';
import Button from '../ui/Button';
import {
  Package,
  Building2,
  ShoppingCart,
  TrendingUp,
  ChevronRight,
  Plus,
  Loader
} from 'lucide-react';

const ProcurementDashboard = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSuppliers: 0,
    activeSuppliers: 0,
    totalPOs: 0,
    pendingPOs: 0,
    activePOs: 0,
    totalValue: 0,
    shipmentsInTransit: 0,
    shipmentsDelivered: 0
  });
  const [recentPOs, setRecentPOs] = useState([]);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showView, setShowView] = useState('overview'); // 'overview', 'suppliers', 'pos'

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [suppliers, allPOs] = await Promise.all([
        supplierService.getAllSuppliers(),
        loadAllPOs()
      ]);

      // Calculate stats
      const activeSuppliers = suppliers.filter(s => s.is_active);
      const activePOs = allPOs.filter(po =>
        ['draft', 'submitted', 'confirmed', 'partially_received'].includes(po.status)
      );
      const totalValue = allPOs.reduce((sum, po) => sum + (po.total_amount || 0), 0);

      // Get recent POs (last 10)
      const recent = allPOs
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10);

      setStats({
        totalSuppliers: suppliers.length,
        activeSuppliers: activeSuppliers.length,
        totalPOs: allPOs.length,
        activePOs: activePOs.length,
        totalValue: totalValue,
        shipmentsInTransit: 0, // Will be calculated from tracking
        shipmentsDelivered: 0
      });

      setRecentPOs(recent);
    } catch (error) {
      console.error('Error loading procurement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPOs = async () => {
    // This would need to be updated to get all POs across all projects
    // For now, return empty array as we don't have a project context
    return [];
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-violet-600" />
          Procurement Overview
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant={showView === 'overview' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowView('overview')}
          >
            Overview
          </Button>
          <Button
            variant={showView === 'suppliers' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowView('suppliers')}
          >
            Suppliers
          </Button>
          <Button
            variant={showView === 'pos' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowView('pos')}
          >
            Purchase Orders
          </Button>
        </div>
      </div>

      {/* Overview Stats Grid */}
      {showView === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
            {/* Suppliers Card */}
            <div className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-800/20
                          rounded-lg p-5 sm:p-6 border border-violet-200 dark:border-violet-700">
              <div className="flex items-center justify-between mb-3">
                <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-violet-600 dark:text-violet-400" />
                <span className="text-xs sm:text-sm font-medium text-violet-600 dark:text-violet-400">SUPPLIERS</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {stats.activeSuppliers}
              </div>
              <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                {stats.totalSuppliers} total
              </div>
            </div>

            {/* Active POs Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20
                          rounded-lg p-5 sm:p-6 border border-blue-200 dark:border-blue-700">
              <div className="flex items-center justify-between mb-3">
                <ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 dark:text-blue-400" />
                <span className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">ACTIVE POs</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {stats.activePOs}
              </div>
              <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                {stats.totalPOs} total
              </div>
            </div>

            {/* Total Value Card */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20
                          rounded-lg p-5 sm:p-6 border border-green-200 dark:border-green-700">
              <div className="flex items-center justify-between mb-3">
                <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-green-600 dark:text-green-400" />
                <span className="text-xs sm:text-sm font-medium text-green-600 dark:text-green-400">TOTAL VALUE</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(stats.totalValue)}
              </div>
              <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                All purchase orders
              </div>
            </div>

            {/* Shipments Card */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20
                          rounded-lg p-5 sm:p-6 border border-amber-200 dark:border-amber-700">
              <div className="flex items-center justify-between mb-3">
                <Package className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600 dark:text-amber-400" />
                <span className="text-xs sm:text-sm font-medium text-amber-600 dark:text-amber-400">SHIPMENTS</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {stats.shipmentsInTransit}
              </div>
              <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                {stats.shipmentsDelivered} delivered
              </div>
            </div>
          </div>

          {/* Recent POs */}
          {recentPOs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recent Purchase Orders
              </h3>
              <div className="space-y-3">
                {recentPOs.map(po => (
                  <div
                    key={po.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-gray-200
                             dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
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
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setShowView('suppliers')}
              >
                Add Supplier
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowView('pos')}
              >
                View All POs
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Suppliers View */}
      {showView === 'suppliers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Supplier Management
            </h3>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowSupplierForm(true)}
            >
              Add Supplier
            </Button>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Supplier management will be available per-project. Navigate to a specific project to manage suppliers and create purchase orders.
          </p>
        </div>
      )}

      {/* POs View */}
      {showView === 'pos' && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            All Purchase Orders
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Purchase orders are managed per-project. Navigate to a specific project to view and manage its purchase orders.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProcurementDashboard;
