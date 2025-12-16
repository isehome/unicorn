import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { milestoneService } from '../services/milestoneService';
import Button from './ui/Button';
import {
  Package,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader,
  PackageCheck
} from 'lucide-react';

const PartsReceivingPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [phase, setPhase] = useState('prewire'); // 'prewire' or 'trim'
  const [editingId, setEditingId] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    loadEquipment();
  }, [projectId, phase]);

  const loadEquipment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, phase);

      // Sort: items with orders first, then by name
      const sorted = (data || []).sort((a, b) => {
        const aOrdered = (a.ordered_quantity || 0) > 0;
        const bOrdered = (b.ordered_quantity || 0) > 0;
        if (aOrdered !== bOrdered) return bOrdered ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '');
      });

      setEquipment(sorted);
    } catch (err) {
      console.error('Failed to load equipment:', err);
      setError('Failed to load equipment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReceiveAll = async () => {
    if (!window.confirm(`Mark all ${phase} items as fully received?`)) return;

    try {
      setSaving(true);
      setError(null);
      const result = await projectEquipmentService.receiveAllForPhase(projectId, phase);

      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Check and auto-complete prep milestones if all items are received
      console.log('🎯 [PartsReceiving] Calling autoCompletePrepMilestones after receiveAll');
      try {
        await milestoneService.autoCompletePrepMilestones(projectId);
      } catch (milestoneErr) {
        console.error('Failed to auto-complete prep milestones:', milestoneErr);
        // Don't throw - receiving succeeded
      }

      // Invalidate cache and reload
      milestoneCacheService.invalidate(projectId);
      await loadEquipment();
    } catch (err) {
      console.error('Failed to receive all:', err);
      setError(err.message || 'Failed to receive all items');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item, field) => {
    setEditingId(`${item.id}-${field}`);
    setTempValue(String(item[field] || 0));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTempValue('');
  };

  const handleSaveQuantity = async (item, field) => {
    const qty = parseInt(tempValue, 10);

    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid quantity (0 or greater)');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const updates = {};
      if (field === 'ordered_quantity') {
        updates.orderedQty = qty;
      } else if (field === 'received_quantity') {
        updates.receivedQty = qty;
      }

      await projectEquipmentService.updateProcurementQuantities(item.id, updates);

      // Update local state
      setEquipment(prev => prev.map(eq =>
        eq.id === item.id ? { ...eq, [field]: qty } : eq
      ));

      setEditingId(null);
      setTempValue('');

      // Check and auto-complete prep milestones if all items are received
      if (field === 'received_quantity') {
        console.log('🎯 [PartsReceiving] Calling autoCompletePrepMilestones after quantity update');
        try {
          await milestoneService.autoCompletePrepMilestones(projectId);
        } catch (milestoneErr) {
          console.error('Failed to auto-complete prep milestones:', milestoneErr);
          // Don't throw - update succeeded
        }
      }

      // Invalidate milestone cache
      milestoneCacheService.invalidate(projectId);
    } catch (err) {
      console.error('Failed to update quantity:', err);
      setError(err.message || 'Failed to update quantity');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickReceive = async (item) => {
    // Prevent receiving items that haven't been ordered
    const orderedQty = item.ordered_quantity || 0;
    if (orderedQty === 0) {
      setError('Cannot receive items that have not been ordered. Please create a PO first.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await projectEquipmentService.updateProcurementQuantities(item.id, {
        receivedQty: orderedQty
      });

      // Update local state
      setEquipment(prev => prev.map(eq =>
        eq.id === item.id
          ? { ...eq, received_quantity: orderedQty }
          : eq
      ));

      // Check and auto-complete prep milestones if all items are received
      console.log('🎯 [PartsReceiving] Calling autoCompletePrepMilestones after quick receive');
      try {
        await milestoneService.autoCompletePrepMilestones(projectId);
      } catch (milestoneErr) {
        console.error('Failed to auto-complete prep milestones:', milestoneErr);
        // Don't throw - receive succeeded
      }

      // Invalidate milestone cache
      milestoneCacheService.invalidate(projectId);
    } catch (err) {
      console.error('Failed to receive item:', err);
      setError(err.message || 'Failed to receive item');
    } finally {
      setSaving(false);
    }
  };

  const getItemStatus = (item) => {
    const planned = item.planned_quantity || 0;
    const ordered = item.ordered_quantity || 0;
    const received = item.received_quantity || 0;

    if (received >= planned && received > 0) {
      return { label: 'Fully Received', color: 'text-green-600 dark:text-green-400', icon: CheckCircle };
    }
    if (received > 0 && received < ordered) {
      return { label: 'Partial', color: 'text-yellow-600 dark:text-yellow-400', icon: AlertCircle };
    }
    if (ordered > 0 && received === 0) {
      return { label: 'Ordered', color: 'text-blue-600 dark:text-blue-400', icon: Package };
    }
    return { label: 'Not Ordered', color: 'text-gray-500 dark:text-gray-400', icon: Package };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const orderedItems = equipment.filter(eq => (eq.ordered_quantity || 0) > 0);
  const pendingItems = orderedItems.filter(eq =>
    (eq.received_quantity || 0) < (eq.ordered_quantity || 0)
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6">
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

        {/* Phase Selector */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setPhase('prewire')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                phase === 'prewire'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Prewire Items
            </button>
            <button
              onClick={() => setPhase('trim')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                phase === 'trim'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Trim Items
            </button>
          </div>
        </div>

        {/* Receive All Button */}
        {pendingItems.length > 0 && (
          <div className="mb-6">
            <Button
              variant="primary"
              icon={PackageCheck}
              onClick={handleReceiveAll}
              disabled={saving}
              className="w-full"
            >
              {saving ? 'Processing...' : `Receive All ${pendingItems.length} Pending Items`}
            </Button>
          </div>
        )}

        {/* Equipment List */}
        <div style={sectionStyles.card}>
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {phase === 'prewire' ? 'Prewire' : 'Trim'} Equipment ({equipment.length})
          </h2>

          {equipment.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">
                No {phase} equipment found for this project
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {equipment.map((item) => {
                const status = getItemStatus(item);
                const StatusIcon = status.icon;
                const isEditingOrdered = editingId === `${item.id}-ordered_quantity`;
                const isEditingReceived = editingId === `${item.id}-received_quantity`;
                const planned = item.planned_quantity || 0;
                const ordered = item.ordered_quantity || 0;
                const received = item.received_quantity || 0;
                const hasOrder = ordered > 0;
                const isFullyReceived = received >= planned && received > 0;
                const isPartial = received > 0 && received < ordered;

                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isFullyReceived
                        ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                        : isPartial
                        ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800'
                    }`}
                  >
                    {/* Item Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {item.name || 'Unnamed Item'}
                        </h3>
                        {item.part_number && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Part #: {item.part_number}
                          </p>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 ${status.color}`}>
                        <StatusIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">{status.label}</span>
                      </div>
                    </div>

                    {/* Quantities */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      {/* Planned */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Planned
                        </label>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                          {planned}
                        </div>
                      </div>

                      {/* Ordered */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Ordered
                        </label>
                        {isEditingOrdered ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value)}
                              className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveQuantity(item, 'ordered_quantity');
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <button
                              onClick={() => handleSaveQuantity(item, 'ordered_quantity')}
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                              disabled={saving}
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEdit(item, 'ordered_quantity')}
                            className="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1"
                          >
                            {ordered}
                          </div>
                        )}
                      </div>

                      {/* Received */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Received
                        </label>
                        {isEditingReceived ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value)}
                              className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveQuantity(item, 'received_quantity');
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <button
                              onClick={() => handleSaveQuantity(item, 'received_quantity')}
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                              disabled={saving}
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEdit(item, 'received_quantity')}
                            className={`text-lg font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 ${
                              isPartial ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {received}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    {hasOrder && !isFullyReceived && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleQuickReceive(item)}
                          disabled={saving}
                          className="flex-1 py-2 px-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          Receive All ({ordered})
                        </button>
                      </div>
                    )}

                    {/* Shortage Warning */}
                    {isPartial && (
                      <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          ⚠️ Shortage: {ordered - received} units still needed
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartsReceivingPage;
