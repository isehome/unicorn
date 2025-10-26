import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import {
  Package,
  CheckCircle,
  ArrowLeft,
  Loader,
  PackageCheck,
  ChevronDown,
  ChevronRight,
  Truck
} from 'lucide-react';

const PartsReceivingPageNew = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [expandedPOs, setExpandedPOs] = useState(new Set());
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('all'); // 'all', 'prewire', 'trim'

  useEffect(() => {
    if (projectId) {
      loadPurchaseOrders();
    }
  }, [projectId]);

  const loadPurchaseOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all POs for this project
      const { data: pos, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name),
          items:purchase_order_items(
            *,
            equipment:project_equipment(
              id,
              name,
              part_number,
              description,
              planned_quantity,
              ordered_quantity,
              received_quantity,
              global_part:global_part_id(required_for_prewire)
            )
          )
        `)
        .eq('project_id', projectId)
        .order('order_date', { ascending: false });

      if (poError) throw poError;

      setPurchaseOrders(pos || []);

      // Auto-expand outstanding POs
      const outstanding = (pos || []).filter(po => {
        const hasUnreceived = (po.items || []).some(item =>
          (item.quantity_received || 0) < (item.quantity_ordered || 0)
        );
        return hasUnreceived && po.status !== 'received';
      });
      setExpandedPOs(new Set(outstanding.map(po => po.id)));

    } catch (err) {
      console.error('Failed to load purchase orders:', err);
      setError('Failed to load purchase orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePO = (poId) => {
    setExpandedPOs(prev => {
      const next = new Set(prev);
      if (next.has(poId)) {
        next.delete(poId);
      } else {
        next.add(poId);
      }
      return next;
    });
  };

  const handleUpdateReceived = async (lineItemId, projectEquipmentId, newQuantity) => {
    try {
      setSaving(true);
      setError(null);

      // Update purchase_order_items.quantity_received
      const { error: updateError } = await supabase
        .from('purchase_order_items')
        .update({ quantity_received: newQuantity })
        .eq('id', lineItemId);

      if (updateError) throw updateError;

      // Recalculate total received_quantity for project_equipment
      // Sum up all quantity_received from all PO line items for this equipment
      const { data: allItems, error: sumError } = await supabase
        .from('purchase_order_items')
        .select('quantity_received')
        .eq('project_equipment_id', projectEquipmentId);

      if (sumError) throw sumError;

      const totalReceived = (allItems || []).reduce(
        (sum, item) => sum + (item.quantity_received || 0),
        0
      );

      // Update project_equipment.received_quantity
      const { error: equipError } = await supabase
        .from('project_equipment')
        .update({
          received_quantity: totalReceived,
          received_date: new Date().toISOString()
        })
        .eq('id', projectEquipmentId);

      if (equipError) throw equipError;

      // Reload data
      await loadPurchaseOrders();

      // Invalidate milestone cache to trigger recalculation
      milestoneCacheService.invalidate(projectId);

      setSuccessMessage('Received quantity updated');
      setTimeout(() => setSuccessMessage(null), 2000);

    } catch (err) {
      console.error('Failed to update received quantity:', err);
      setError(err.message || 'Failed to update quantity');
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveAllPO = async (po) => {
    if (!window.confirm(`Mark all items in PO ${po.po_number} as fully received?`)) return;

    try {
      setSaving(true);
      setError(null);

      // Update all line items in this PO
      for (const item of po.items) {
        await handleUpdateReceived(
          item.id,
          item.project_equipment_id,
          item.quantity_ordered
        );
      }

      setSuccessMessage(`PO ${po.po_number} fully received`);
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err) {
      console.error('Failed to receive all PO items:', err);
      setError(err.message || 'Failed to receive all items');
    } finally {
      setSaving(false);
    }
  };

  const filterPOs = (pos) => {
    if (phaseFilter === 'all') return pos;

    return pos.map(po => {
      const filteredItems = (po.items || []).filter(item => {
        if (phaseFilter === 'prewire') {
          return item.equipment?.global_part?.required_for_prewire === true;
        } else {
          return item.equipment?.global_part?.required_for_prewire !== true;
        }
      });

      return filteredItems.length > 0 ? { ...po, items: filteredItems } : null;
    }).filter(Boolean);
  };

  const getPOStatus = (po) => {
    const items = po.items || [];
    if (items.length === 0) return { label: 'No Items', color: 'text-gray-500', percent: 0 };

    const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
    const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);

    const percent = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

    if (percent === 100) {
      return { label: 'Fully Received', color: 'text-green-600 dark:text-green-400', percent };
    } else if (percent > 0) {
      return { label: `${percent}% Received`, color: 'text-yellow-600 dark:text-yellow-400', percent };
    } else {
      return { label: 'Not Received', color: 'text-blue-600 dark:text-blue-400', percent };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const filteredPOs = filterPOs(purchaseOrders);
  const outstandingPOs = filteredPOs.filter(po => getPOStatus(po).percent < 100);
  const completedPOs = filteredPOs.filter(po => getPOStatus(po).percent === 100);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Receive Equipment
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Track shipments and update received quantities
            </p>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Phase Filter */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setPhaseFilter('all')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'all'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setPhaseFilter('prewire')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'prewire'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Prewire Only
            </button>
            <button
              onClick={() => setPhaseFilter('trim')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'trim'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Trim Only
            </button>
          </div>
        </div>

        {/* Outstanding POs */}
        {outstandingPOs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Outstanding Purchase Orders ({outstandingPOs.length})
            </h2>

            <div className="space-y-3">
              {outstandingPOs.map((po) => {
                const status = getPOStatus(po);
                const isExpanded = expandedPOs.has(po.id);

                return (
                  <div
                    key={po.id}
                    style={sectionStyles.card}
                    className="overflow-hidden"
                  >
                    {/* PO Header */}
                    <button
                      onClick={() => togglePO(po.id)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {po.po_number}
                          </h3>
                          <span className={`text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {po.supplier?.name} • Ordered: {new Date(po.order_date).toLocaleDateString()}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {/* PO Line Items (Expanded) */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div className="space-y-3 mb-4">
                          {(po.items || []).map((item) => (
                            <LineItem
                              key={item.id}
                              item={item}
                              onUpdate={handleUpdateReceived}
                              saving={saving}
                            />
                          ))}
                        </div>

                        {/* Receive All PO Button */}
                        <Button
                          variant="primary"
                          icon={PackageCheck}
                          onClick={() => handleReceiveAllPO(po)}
                          disabled={saving || status.percent === 100}
                          className="w-full"
                        >
                          Receive All Items in PO
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed POs */}
        {completedPOs.length > 0 && (
          <div>
            <button
              onClick={() => {
                // Toggle all completed POs
                const allExpanded = completedPOs.every(po => expandedPOs.has(po.id));
                setExpandedPOs(prev => {
                  const next = new Set(prev);
                  completedPOs.forEach(po => {
                    if (allExpanded) {
                      next.delete(po.id);
                    } else {
                      next.add(po.id);
                    }
                  });
                  return next;
                });
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                ✓ Completed POs ({completedPOs.length})
              </h2>
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </button>

            <div className="space-y-3">
              {completedPOs.map((po) => {
                const isExpanded = expandedPOs.has(po.id);

                return (
                  <div
                    key={po.id}
                    style={sectionStyles.card}
                    className="overflow-hidden opacity-75"
                  >
                    <button
                      onClick={() => togglePO(po.id)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {po.po_number}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {po.supplier?.name}
                        </p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div className="space-y-2">
                          {(po.items || []).map((item) => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-gray-700 dark:text-gray-300">
                                {item.equipment?.part_number} - {item.equipment?.name}
                              </span>
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                {item.quantity_received}/{item.quantity_ordered} received
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredPOs.length === 0 && (
          <div style={sectionStyles.card} className="text-center py-12">
            <Truck className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Purchase Orders
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create a purchase order to start receiving equipment
            </p>
            <Button
              variant="primary"
              onClick={() => navigate(`/projects/${projectId}/order-equipment`)}
            >
              Go to Order Equipment
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Line Item Component
const LineItem = ({ item, onUpdate, saving }) => {
  const [quantity, setQuantity] = useState(item.quantity_received || 0);
  const [isEditing, setIsEditing] = useState(false);

  const ordered = item.quantity_ordered || 0;
  const received = item.quantity_received || 0;
  const equipment = item.equipment || {};
  const phase = equipment.global_part?.required_for_prewire ? 'Prewire' : 'Trim';

  const handleSave = async () => {
    if (quantity !== received) {
      await onUpdate(item.id, item.project_equipment_id, quantity);
    }
    setIsEditing(false);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm">
            {equipment.part_number || 'N/A'}
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {equipment.name || equipment.description || 'No description'}
          </p>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded">
          {phase}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Ordered
          </label>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {ordered}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Received
          </label>
          {isEditing ? (
            <div className="flex gap-1">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
                min="0"
                max={ordered}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-lg font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 min-h-[44px] w-full text-left"
            >
              {received}
            </button>
          )}
        </div>
      </div>

      {received < ordered && (
        <button
          onClick={() => {
            setQuantity(ordered);
            onUpdate(item.id, item.project_equipment_id, ordered);
          }}
          disabled={saving}
          className="mt-3 w-full py-2 px-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
        >
          Receive All ({ordered})
        </button>
      )}
    </div>
  );
};

export default PartsReceivingPageNew;
