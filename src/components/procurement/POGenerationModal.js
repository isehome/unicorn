import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { poGeneratorService } from '../../services/poGeneratorService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { projectEquipmentService } from '../../services/projectEquipmentService';
import Button from '../ui/Button';
import {
  X,
  DollarSign,
  Calendar,
  FileText,
  Loader,
  Package,
  Building2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

/**
 * PO Generation Modal
 *
 * Allows PM to review and edit PO details before creating it
 * - Auto-generates PO number
 * - Editable fields: order date, delivery date, tax, shipping, notes
 * - Calculates totals (subtotal + tax + shipping)
 * - Creates purchase_order and purchase_order_items records
 * - Marks equipment as "ordered"
 */
const POGenerationModal = ({
  isOpen,
  onClose,
  projectId,
  supplierId,
  supplierName,
  milestoneStage,
  equipmentItems = [],
  onSuccess
}) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  // Form state
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [taxAmount, setTaxAmount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  // PO number preview
  const [poNumberPreview, setPoNumberPreview] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Group equipment items by part number
  const groupEquipmentByPartNumber = () => {
    const grouped = {};

    equipmentItems.forEach(item => {
      const key = `${item.part_number || 'NO-PART'}|${item.description || ''}|${item.unit_cost || 0}`;

      if (!grouped[key]) {
        grouped[key] = {
          part_number: item.part_number,
          description: item.description || item.name,
          unit_cost: item.unit_cost || 0,
          quantity: 0,
          equipment_ids: []
        };
      }

      const qty = item.planned_quantity || item.quantity || 0;
      grouped[key].quantity += qty;
      grouped[key].equipment_ids.push(item.id);
    });

    return Object.values(grouped);
  };

  const groupedItems = groupEquipmentByPartNumber();

  // Calculate subtotal from grouped items
  const calculateSubtotal = () => {
    return groupedItems.reduce((sum, item) => {
      const qty = item.quantity || 0;
      const cost = item.unit_cost || 0;
      return sum + (qty * cost);
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const total = subtotal + parseFloat(taxAmount || 0) + parseFloat(shippingCost || 0);

  // Load PO number preview on mount
  useEffect(() => {
    if (isOpen && supplierId) {
      loadPONumberPreview();
      calculateDefaultDeliveryDate();
    }
  }, [isOpen, supplierId]);

  const loadPONumberPreview = async () => {
    try {
      const poNumber = await purchaseOrderService.generatePONumber(supplierId);
      setPoNumberPreview(poNumber);
    } catch (err) {
      console.error('Failed to generate PO number preview:', err);
      setPoNumberPreview('PO-XXXX-XXX-XXX-XXX');
    }
  };

  const calculateDefaultDeliveryDate = () => {
    // Set default delivery date to 14 days from now
    const date = new Date();
    date.setDate(date.getDate() + 14);
    setRequestedDeliveryDate(date.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!orderDate) {
      setError('Order date is required');
      return;
    }

    if (equipmentItems.length === 0) {
      setError('No equipment items selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Prepare equipment IDs
      const equipmentIds = equipmentItems.map(item => item.id);

      // Generate PO using the service
      const result = await poGeneratorService.generatePO(
        {
          projectId,
          supplierId,
          milestoneStage
        },
        equipmentIds,
        'user' // TODO: Replace with actual user identifier from auth context
      );

      // Update the PO with user-edited values
      await purchaseOrderService.updatePurchaseOrder(result.po.id, {
        order_date: orderDate,
        requested_delivery_date: requestedDeliveryDate || null,
        tax_amount: parseFloat(taxAmount || 0),
        shipping_cost: parseFloat(shippingCost || 0),
        internal_notes: internalNotes || null,
        supplier_notes: supplierNotes || null,
        total_amount: total
      });

      // Mark equipment as ordered
      await Promise.all(
        equipmentItems.map(item =>
          // Update ordered_quantity to match quantity in the PO
          projectEquipmentService.updateProcurementQuantities(item.id, {
            orderedQty: item.planned_quantity || item.quantity || 0
          })
        )
      );

      // Success callback
      if (onSuccess) {
        onSuccess(result);
      }

      // Close modal
      handleClose();
    } catch (err) {
      console.error('Failed to create PO:', err);
      setError(err.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setOrderDate(new Date().toISOString().split('T')[0]);
    setRequestedDeliveryDate('');
    setTaxAmount(0);
    setShippingCost(0);
    setInternalNotes('');
    setSupplierNotes('');
    setError(null);
    setPoNumberPreview('');

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Generate Purchase Order
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {supplierName} • {milestoneStage.replace('_', ' ')}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Body */}
          <div className="px-6 py-4 space-y-6">
            {/* PO Number Preview */}
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">PO Number</h3>
              </div>
              <p className="text-2xl font-mono font-bold text-violet-600 dark:text-violet-400">
                {poNumberPreview || 'Loading...'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Auto-generated based on supplier and year
              </p>
            </div>

            {/* Date Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Order Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Requested Delivery Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={requestedDeliveryDate}
                    onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Equipment Items Preview */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Line Items ({groupedItems.length})
                </h3>
                {equipmentItems.length !== groupedItems.length && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({equipmentItems.length} individual items grouped)
                  </span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium">Part Number</th>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300 font-medium">Description</th>
                      <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Qty</th>
                      <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Unit Cost</th>
                      <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {groupedItems.map((item, index) => {
                      const itemTotal = (item.quantity || 0) * (item.unit_cost || 0);
                      return (
                        <tr key={index}>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {item.part_number || 'N/A'}
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                            {item.description}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                            {item.quantity || 0}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                            ${(item.unit_cost || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                            ${itemTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cost Fields */}
            <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Cost Breakdown</h3>
              </div>

              {/* Subtotal (read-only) */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Subtotal (Equipment)
                </label>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  ${subtotal.toFixed(2)}
                </span>
              </div>

              {/* Tax Amount */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tax Amount
                </label>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                  />
                </div>
              </div>

              {/* Shipping Cost */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Shipping Cost
                </label>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                  />
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-300 dark:border-gray-600">
                <label className="text-base font-bold text-gray-900 dark:text-white">
                  Total Amount
                </label>
                <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                  ${total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Notes Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Internal Notes
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Notes for internal use only (not visible to supplier)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Supplier Notes
                </label>
                <textarea
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  placeholder="Special instructions or notes for the supplier"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={loading ? Loader : CheckCircle}
              disabled={loading}
            >
              {loading ? 'Creating PO...' : 'Create Purchase Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default POGenerationModal;
