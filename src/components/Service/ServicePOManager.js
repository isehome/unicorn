/**
 * ServicePOManager.js
 * Purchase order management for service tickets
 */

import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Clock,
  Truck,
  X,
  Send,
  Package,
  AlertCircle
} from 'lucide-react';
import {
  servicePOService,
  servicePartsService,
  suppliersService
} from '../../services/serviceTicketService';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

const PO_STATUSES = {
  draft: { label: 'Draft', color: '#71717a', bg: 'rgba(113, 113, 122, 0.15)', icon: Clock },
  submitted: { label: 'Submitted', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: Send },
  confirmed: { label: 'Confirmed', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: CheckCircle },
  partially_received: { label: 'Partial', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Package },
  received: { label: 'Received', color: brandColors.success, bg: 'rgba(148, 175, 50, 0.15)', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: X }
};

const ServicePOManager = ({ ticket, onUpdate }) => {
  const { user } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [expandedPO, setExpandedPO] = useState(null);
  const [showReceiving, setShowReceiving] = useState(null);

  // Create PO form state
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    requested_delivery_date: '',
    ship_to_address: ticket?.customer_address || '',
    ship_to_contact: ticket?.customer_name || '',
    ship_to_phone: ticket?.customer_phone || '',
    internal_notes: '',
    supplier_notes: '',
    selectedParts: []
  });

  // Receiving form state
  const [receivingItems, setReceivingItems] = useState([]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (!ticket?.id) return;
      try {
        setLoading(true);
        const [posData, partsData, suppliersData] = await Promise.all([
          servicePOService.getPOsForTicket(ticket.id),
          servicePartsService.getPartsForTicket(ticket.id),
          suppliersService.getAll()
        ]);
        setPurchaseOrders(posData);
        setParts(partsData);
        setSuppliers(suppliersData);
      } catch (err) {
        console.error('[ServicePOManager] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [ticket?.id]);

  const handleOpenCreatePO = () => {
    // Get parts that haven't been ordered yet (status = 'needed')
    const unorderedParts = parts.filter(p => p.status === 'needed');
    setPoForm({
      supplier_id: '',
      requested_delivery_date: '',
      ship_to_address: ticket?.customer_address || '',
      ship_to_contact: ticket?.customer_name || '',
      ship_to_phone: ticket?.customer_phone || '',
      internal_notes: '',
      supplier_notes: '',
      selectedParts: unorderedParts.map(p => ({
        part_id: p.id,
        name: p.name,
        part_number: p.part_number,
        quantity_ordered: p.quantity_needed,
        unit_cost: p.unit_cost || 0,
        selected: true
      }))
    });
    setShowCreatePO(true);
  };

  const handleTogglePartSelection = (partId) => {
    setPoForm(prev => ({
      ...prev,
      selectedParts: prev.selectedParts.map(p =>
        p.part_id === partId ? { ...p, selected: !p.selected } : p
      )
    }));
  };

  const handleUpdatePartQuantity = (partId, quantity) => {
    setPoForm(prev => ({
      ...prev,
      selectedParts: prev.selectedParts.map(p =>
        p.part_id === partId ? { ...p, quantity_ordered: parseInt(quantity) || 1 } : p
      )
    }));
  };

  const handleCreatePO = async () => {
    if (!poForm.supplier_id) {
      alert('Please select a supplier');
      return;
    }

    const selectedItems = poForm.selectedParts.filter(p => p.selected);
    if (selectedItems.length === 0) {
      alert('Please select at least one part');
      return;
    }

    try {
      setSaving(true);

      const poData = {
        supplier_id: poForm.supplier_id,
        requested_delivery_date: poForm.requested_delivery_date || null,
        ship_to_address: poForm.ship_to_address || null,
        ship_to_contact: poForm.ship_to_contact || null,
        ship_to_phone: poForm.ship_to_phone || null,
        internal_notes: poForm.internal_notes || null,
        supplier_notes: poForm.supplier_notes || null,
        created_by: user?.id,
        created_by_name: user?.name || user?.email || 'User'
      };

      const lineItems = selectedItems.map(p => ({
        part_id: p.part_id,
        name: p.name,
        part_number: p.part_number,
        quantity_ordered: p.quantity_ordered,
        unit_cost: p.unit_cost
      }));

      await servicePOService.createPO(ticket.id, poData, lineItems);

      // Refresh data
      const [posData, partsData] = await Promise.all([
        servicePOService.getPOsForTicket(ticket.id),
        servicePartsService.getPartsForTicket(ticket.id)
      ]);
      setPurchaseOrders(posData);
      setParts(partsData);
      setShowCreatePO(false);

      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServicePOManager] Failed to create PO:', err);
      alert('Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitPO = async (poId) => {
    if (!window.confirm('Submit this PO to the supplier?')) return;

    try {
      setSaving(true);
      await servicePOService.submitPO(poId, user?.id, user?.name || user?.email || 'User');

      // Refresh POs
      const posData = await servicePOService.getPOsForTicket(ticket.id);
      setPurchaseOrders(posData);
    } catch (err) {
      console.error('[ServicePOManager] Failed to submit PO:', err);
      alert('Failed to submit purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPO = async (poId) => {
    if (!window.confirm('Are you sure you want to cancel this PO?')) return;

    try {
      setSaving(true);
      await servicePOService.cancelPO(poId);

      // Refresh data
      const [posData, partsData] = await Promise.all([
        servicePOService.getPOsForTicket(ticket.id),
        servicePartsService.getPartsForTicket(ticket.id)
      ]);
      setPurchaseOrders(posData);
      setParts(partsData);
    } catch (err) {
      console.error('[ServicePOManager] Failed to cancel PO:', err);
      alert('Failed to cancel purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReceiving = async (poId) => {
    try {
      const po = await servicePOService.getPO(poId);
      if (po && po.items) {
        setReceivingItems(po.items.map(item => ({
          ...item,
          quantity_receiving: Math.max(0, item.quantity_ordered - item.quantity_received)
        })));
        setShowReceiving(po);
      }
    } catch (err) {
      console.error('[ServicePOManager] Failed to load PO for receiving:', err);
    }
  };

  const handleReceiveItems = async () => {
    if (!showReceiving) return;

    try {
      setSaving(true);

      const itemsToReceive = receivingItems
        .filter(item => item.quantity_receiving > 0)
        .map(item => ({
          id: item.id,
          part_id: item.part_id,
          quantity_received: item.quantity_received + item.quantity_receiving
        }));

      if (itemsToReceive.length === 0) {
        alert('No items to receive');
        return;
      }

      await servicePOService.receiveItems(
        showReceiving.id,
        itemsToReceive,
        user?.id,
        user?.name || user?.email || 'User'
      );

      // Refresh data
      const [posData, partsData] = await Promise.all([
        servicePOService.getPOsForTicket(ticket.id),
        servicePartsService.getPartsForTicket(ticket.id)
      ]);
      setPurchaseOrders(posData);
      setParts(partsData);
      setShowReceiving(null);

      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServicePOManager] Failed to receive items:', err);
      alert('Failed to receive items');
    } finally {
      setSaving(false);
    }
  };

  const getOrderablePartsCount = () => {
    return parts.filter(p => p.status === 'needed').length;
  };

  const getTotalOnOrder = () => {
    return purchaseOrders
      .filter(po => ['submitted', 'confirmed', 'partially_received'].includes(po.status))
      .reduce((sum, po) => sum + parseFloat(po.total_amount || 0), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading purchase orders...
      </div>
    );
  }

  const orderableParts = getOrderablePartsCount();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            {purchaseOrders.length} PO{purchaseOrders.length !== 1 ? 's' : ''}
          </span>
          {getTotalOnOrder() > 0 && (
            <span className="text-zinc-400">
              ${getTotalOnOrder().toFixed(2)} on order
            </span>
          )}
        </div>
        {orderableParts > 0 && (
          <button
            onClick={handleOpenCreatePO}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors hover:bg-zinc-700"
            style={{ color: brandColors.success }}
          >
            <Plus size={16} />
            Create PO ({orderableParts} part{orderableParts !== 1 ? 's' : ''})
          </button>
        )}
      </div>

      {/* PO List */}
      {purchaseOrders.length > 0 ? (
        <div className="space-y-2">
          {purchaseOrders.map(po => {
            const StatusIcon = PO_STATUSES[po.status]?.icon || Clock;
            const isExpanded = expandedPO === po.id;

            return (
              <div key={po.id} className="bg-zinc-700/50 rounded-lg overflow-hidden">
                {/* PO Header */}
                <button
                  onClick={() => setExpandedPO(isExpanded ? null : po.id)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-zinc-700/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-white">{po.po_number}</span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: PO_STATUSES[po.status]?.bg,
                        color: PO_STATUSES[po.status]?.color
                      }}
                    >
                      <StatusIcon size={12} />
                      {PO_STATUSES[po.status]?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400">
                      {po.supplier?.name || 'Unknown Supplier'}
                    </span>
                    <span className="text-sm text-white">
                      ${parseFloat(po.total_amount || 0).toFixed(2)}
                    </span>
                    {isExpanded ? (
                      <ChevronDown size={18} className="text-zinc-400" />
                    ) : (
                      <ChevronRight size={18} className="text-zinc-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-3 pt-0 border-t border-zinc-600">
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-zinc-500">Order Date:</span>
                        <span className="text-zinc-300 ml-2">{po.order_date || '-'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Expected:</span>
                        <span className="text-zinc-300 ml-2">{po.expected_delivery_date || '-'}</span>
                      </div>
                    </div>

                    {/* Items summary */}
                    {po.items && po.items.length > 0 && (
                      <div className="text-xs text-zinc-400 mb-3">
                        {po.items.length} item{po.items.length !== 1 ? 's' : ''} •{' '}
                        {po.items.reduce((sum, i) => sum + (i.quantity_received || 0), 0)} / {' '}
                        {po.items.reduce((sum, i) => sum + (i.quantity_ordered || 0), 0)} received
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {po.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleSubmitPO(po.id)}
                            disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Send size={12} />
                            Submit PO
                          </button>
                          <button
                            onClick={() => handleCancelPO(po.id)}
                            disabled={saving}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X size={12} />
                            Cancel
                          </button>
                        </>
                      )}
                      {['submitted', 'confirmed', 'partially_received'].includes(po.status) && (
                        <button
                          onClick={() => handleOpenReceiving(po.id)}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Truck size={12} />
                          Receive Items
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-500">
          <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
          <p>No purchase orders yet</p>
          {orderableParts > 0 && (
            <button
              onClick={handleOpenCreatePO}
              className="text-sm mt-2 hover:underline"
              style={{ color: brandColors.success }}
            >
              Create a PO for {orderableParts} part{orderableParts !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Create PO Modal */}
      {showCreatePO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">Create Purchase Order</h3>
              <button
                onClick={() => setShowCreatePO(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Supplier Selection */}
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Supplier *</label>
                <select
                  value={poForm.supplier_id}
                  onChange={(e) => setPoForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.is_preferred ? ' (Preferred)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parts Selection */}
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Parts to Order</label>
                {poForm.selectedParts.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {poForm.selectedParts.map(part => (
                      <div
                        key={part.part_id}
                        className={`p-2 rounded-lg border ${
                          part.selected ? 'border-violet-500/50 bg-violet-500/10' : 'border-zinc-600 bg-zinc-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={part.selected}
                            onChange={() => handleTogglePartSelection(part.part_id)}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-600 focus:ring-violet-500"
                          />
                          <div className="flex-1">
                            <span className="text-sm text-white">{part.name}</span>
                            {part.part_number && (
                              <span className="text-xs text-zinc-400 ml-2">#{part.part_number}</span>
                            )}
                          </div>
                          <input
                            type="number"
                            value={part.quantity_ordered}
                            onChange={(e) => handleUpdatePartQuantity(part.part_id, e.target.value)}
                            min="1"
                            disabled={!part.selected}
                            className="w-16 px-2 py-1 bg-zinc-600 border border-zinc-500 rounded text-white text-sm text-center disabled:opacity-50"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-zinc-500 bg-zinc-700/50 rounded-lg">
                    <AlertCircle size={20} className="mx-auto mb-1" />
                    No parts available to order
                  </div>
                )}
              </div>

              {/* Delivery Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Requested Delivery</label>
                  <input
                    type="date"
                    value={poForm.requested_delivery_date}
                    onChange={(e) => setPoForm(prev => ({ ...prev, requested_delivery_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Ship To Phone</label>
                  <input
                    type="tel"
                    value={poForm.ship_to_phone}
                    onChange={(e) => setPoForm(prev => ({ ...prev, ship_to_phone: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Ship To Address</label>
                <input
                  type="text"
                  value={poForm.ship_to_address}
                  onChange={(e) => setPoForm(prev => ({ ...prev, ship_to_address: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Internal Notes</label>
                <textarea
                  value={poForm.internal_notes}
                  onChange={(e) => setPoForm(prev => ({ ...prev, internal_notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
            </div>
            <div className="p-4 border-t border-zinc-700 flex gap-2 justify-end">
              <button
                onClick={() => setShowCreatePO(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePO}
                disabled={!poForm.supplier_id || poForm.selectedParts.filter(p => p.selected).length === 0 || saving}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: brandColors.success, color: '#000' }}
              >
                {saving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receiving Modal */}
      {showReceiving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Receive Items</h3>
                <p className="text-sm text-zinc-400">{showReceiving.po_number}</p>
              </div>
              <button
                onClick={() => setShowReceiving(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {receivingItems.map((item, index) => {
                const remaining = item.quantity_ordered - item.quantity_received;
                return (
                  <div key={item.id} className="p-3 bg-zinc-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm text-white">{item.name}</span>
                        {item.part_number && (
                          <span className="text-xs text-zinc-400 ml-2">#{item.part_number}</span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400">
                        {item.quantity_received} / {item.quantity_ordered} received
                      </span>
                    </div>
                    {remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Receiving:</label>
                        <input
                          type="number"
                          value={item.quantity_receiving}
                          onChange={(e) => {
                            const val = Math.min(parseInt(e.target.value) || 0, remaining);
                            setReceivingItems(prev => prev.map((it, i) =>
                              i === index ? { ...it, quantity_receiving: val } : it
                            ));
                          }}
                          min="0"
                          max={remaining}
                          className="w-20 px-2 py-1 bg-zinc-600 border border-zinc-500 rounded text-white text-sm text-center"
                        />
                        <span className="text-xs text-zinc-400">of {remaining} remaining</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs" style={{ color: brandColors.success }}>
                        <CheckCircle size={12} />
                        Fully received
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-zinc-700 flex gap-2 justify-end">
              <button
                onClick={() => setShowReceiving(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReceiveItems}
                disabled={receivingItems.every(i => i.quantity_receiving === 0) || saving}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: brandColors.success, color: '#000' }}
              >
                {saving ? 'Receiving...' : 'Receive Items'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePOManager;
