/**
 * LaborTypesManager.js
 * Admin component for managing labor types for service ticket time tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import { laborTypeService } from '../../services/laborTypeService';
import {
  Wrench,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  X,
  Save,
  AlertCircle,
  DollarSign,
  Star,
  RotateCcw
} from 'lucide-react';

const LaborTypesManager = () => {
  const [laborTypes, setLaborTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    description: '',
    hourly_rate: 150,
    qbo_item_name: '',
    is_default: false
  });

  // Load labor types
  const loadLaborTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await laborTypeService.getAllLaborTypes(showInactive);
      setLaborTypes(data);
    } catch (err) {
      console.error('[LaborTypesManager] Load error:', err);
      setError('Failed to load labor types');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    loadLaborTypes();
  }, [loadLaborTypes]);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      label: '',
      description: '',
      hourly_rate: 150,
      qbo_item_name: '',
      is_default: false
    });
  };

  // Open edit modal
  const openEditModal = (laborType) => {
    setEditingType(laborType);
    setFormData({
      name: laborType.name,
      label: laborType.label,
      description: laborType.description || '',
      hourly_rate: laborType.hourly_rate,
      qbo_item_name: laborType.qbo_item_name || '',
      is_default: laborType.is_default
    });
    setShowCreateModal(true);
  };

  // Open create modal
  const openCreateModal = () => {
    setEditingType(null);
    resetForm();
    setShowCreateModal(true);
  };

  // Auto-generate name from label
  const handleLabelChange = (label) => {
    setFormData(prev => ({
      ...prev,
      label,
      name: editingType ? prev.name : label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    }));
  };

  // Handle save
  const handleSave = async () => {
    if (!formData.label.trim()) {
      setError('Label is required');
      return;
    }
    if (!formData.name.trim()) {
      setError('Name slug is required');
      return;
    }
    if (formData.hourly_rate < 0) {
      setError('Hourly rate must be positive');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingType) {
        await laborTypeService.updateLaborType(editingType.id, formData);
      } else {
        await laborTypeService.createLaborType(formData);
      }

      setShowCreateModal(false);
      setEditingType(null);
      resetForm();
      await loadLaborTypes();
    } catch (err) {
      console.error('[LaborTypesManager] Save error:', err);
      setError(err.message || 'Failed to save labor type');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete (soft delete)
  const handleDelete = async (laborType) => {
    if (!window.confirm(`Deactivate "${laborType.label}"? It will no longer appear in dropdowns.`)) return;

    try {
      await laborTypeService.deleteLaborType(laborType.id);
      await loadLaborTypes();
    } catch (err) {
      console.error('[LaborTypesManager] Delete error:', err);
      setError('Failed to deactivate labor type');
    }
  };

  // Handle restore
  const handleRestore = async (laborType) => {
    try {
      await laborTypeService.restoreLaborType(laborType.id);
      await loadLaborTypes();
    } catch (err) {
      console.error('[LaborTypesManager] Restore error:', err);
      setError('Failed to restore labor type');
    }
  };

  // Handle set as default
  const handleSetDefault = async (laborType) => {
    try {
      await laborTypeService.setAsDefault(laborType.id);
      await loadLaborTypes();
    } catch (err) {
      console.error('[LaborTypesManager] Set default error:', err);
      setError('Failed to set default');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-zinc-400" size={24} />
        <span className="ml-3 text-zinc-400">Loading labor types...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wrench size={20} />
          Labor Types
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-700 text-[#94AF32] focus:ring-[#94AF32]"
            />
            Show inactive
          </label>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#94AF32] text-black rounded-lg font-medium hover:bg-[#a5c034] transition-colors"
          >
            <Plus size={16} />
            Add Labor Type
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      {laborTypes.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <Wrench size={32} className="mx-auto mb-3 opacity-50" />
          <p>No labor types found</p>
          <button
            onClick={openCreateModal}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#94AF32] text-black rounded-lg font-medium mx-auto hover:bg-[#a5c034] transition-colors"
          >
            <Plus size={16} />
            Create First Labor Type
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-700 overflow-hidden bg-zinc-800/50">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Label</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hourly Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">QBO Item</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {laborTypes.map((laborType) => (
                <tr
                  key={laborType.id}
                  className={`border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors ${!laborType.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white">{laborType.label}</span>
                      {laborType.is_default && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#94AF32]/20 text-[#94AF32] rounded text-xs font-medium">
                          <Star size={10} />
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 font-mono text-sm">
                    {laborType.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-[#94AF32]">
                      <DollarSign size={14} />
                      {laborType.hourly_rate}/hr
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {laborType.qbo_item_name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {laborType.is_active ? (
                        <>
                          <button
                            onClick={() => openEditModal(laborType)}
                            className="p-1.5 rounded border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          {!laborType.is_default && (
                            <button
                              onClick={() => handleSetDefault(laborType)}
                              className="p-1.5 rounded border border-zinc-600 text-zinc-400 hover:text-[#94AF32] hover:border-[#94AF32] transition-colors"
                              title="Set as default"
                            >
                              <Star size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(laborType)}
                            className="p-1.5 rounded border border-red-900/50 text-red-400 hover:text-red-300 hover:border-red-700 transition-colors"
                            title="Deactivate"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleRestore(laborType)}
                          className="p-1.5 rounded border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                          title="Restore"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-zinc-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
              <h3 className="text-lg font-semibold text-white">
                {editingType ? 'Edit Labor Type' : 'Add Labor Type'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Label *</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g., Installation"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Name Slug *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., install"
                  disabled={!!editingType}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-zinc-500 mt-1">Unique identifier (auto-generated from label)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this labor type"
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Hourly Rate ($) *</label>
                <input
                  type="number"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="5"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">QuickBooks Item Name</label>
                <input
                  type="text"
                  value={formData.qbo_item_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, qbo_item_name: e.target.value }))}
                  placeholder="e.g., Installation Labor"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <p className="text-xs text-zinc-500 mt-1">Name of the Product/Service in QuickBooks</p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                    className="rounded border-zinc-600 bg-zinc-700 text-[#94AF32] focus:ring-[#94AF32]"
                  />
                  <span className="text-white text-sm">Set as default labor type</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-700">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#94AF32] text-black rounded-lg font-medium hover:bg-[#a5c034] transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {editingType ? 'Update' : 'Create'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaborTypesManager;
