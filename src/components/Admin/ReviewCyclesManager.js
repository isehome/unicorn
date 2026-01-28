/**
 * ReviewCyclesManager.js
 * Admin component for managing quarterly review cycles
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import {
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Play,
  CheckCircle,
  Clock,
  Archive,
  Loader2,
  X,
  Save,
  AlertCircle,
  Users
} from 'lucide-react';

const STATUS_OPTIONS = [
  { id: 'upcoming', label: 'Upcoming', icon: Clock, color: '#71717A' },
  { id: 'self_eval', label: 'Self-Evaluation Phase', icon: Edit2, color: '#F59E0B' },
  { id: 'manager_review', label: 'Manager Review Phase', icon: Users, color: '#3B82F6' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, color: '#94AF32' },
  { id: 'archived', label: 'Archived', icon: Archive, color: '#71717A' }
];

const getStatusInfo = (status) => {
  return STATUS_OPTIONS.find(s => s.id === status) || STATUS_OPTIONS[0];
};

const ReviewCyclesManager = () => {
  const { user } = useAuth();
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingCycle, setEditingCycle] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    year: new Date().getFullYear(),
    quarter: Math.ceil((new Date().getMonth() + 1) / 3),
    start_date: '',
    end_date: '',
    self_eval_due_date: '',
    manager_review_due_date: '',
    status: 'upcoming'
  });

  // Load cycles
  const loadCycles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await careerDevelopmentService.getAllCycles();
      setCycles(data);
    } catch (err) {
      console.error('[ReviewCyclesManager] Load error:', err);
      setError('Failed to load review cycles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  // Auto-fill dates when quarter/year changes (strictly quarterly)
  useEffect(() => {
    if (showCreateModal && !editingCycle) {
      const year = formData.year;
      const quarter = formData.quarter;

      // Calculate quarter dates
      const startMonth = (quarter - 1) * 3;
      const startDate = new Date(year, startMonth, 1);
      const endDate = new Date(year, startMonth + 3, 0); // Last day of quarter

      // Self-eval due: 2 weeks BEFORE end of quarter
      const selfEvalDue = new Date(endDate);
      selfEvalDue.setDate(selfEvalDue.getDate() - 14);

      // Manager review due: Last day of quarter (end date)
      const managerReviewDue = new Date(endDate);

      setFormData(prev => ({
        ...prev,
        name: `Q${quarter} ${year}`,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        self_eval_due_date: selfEvalDue.toISOString().split('T')[0],
        manager_review_due_date: managerReviewDue.toISOString().split('T')[0]
      }));
    }
  }, [formData.year, formData.quarter, showCreateModal, editingCycle]);

  // Handle create/update
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (editingCycle) {
        await careerDevelopmentService.updateCycle(editingCycle.id, formData);
      } else {
        await careerDevelopmentService.createCycle(formData, user.id);
      }

      setShowCreateModal(false);
      setEditingCycle(null);
      resetForm();
      await loadCycles();
    } catch (err) {
      console.error('[ReviewCyclesManager] Save error:', err);
      setError(err.message || 'Failed to save review cycle');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (cycleId) => {
    if (!window.confirm('Delete this review cycle? This cannot be undone.')) return;

    try {
      await careerDevelopmentService.deleteCycle(cycleId);
      await loadCycles();
    } catch (err) {
      console.error('[ReviewCyclesManager] Delete error:', err);
      setError('Failed to delete cycle. It may have associated evaluations.');
    }
  };

  // Handle status change
  const handleStatusChange = async (cycleId, newStatus) => {
    try {
      await careerDevelopmentService.updateCycleStatus(cycleId, newStatus);
      await loadCycles();
    } catch (err) {
      console.error('[ReviewCyclesManager] Status update error:', err);
      setError('Failed to update status');
    }
  };

  // Edit cycle
  const handleEdit = (cycle) => {
    setEditingCycle(cycle);
    setFormData({
      name: cycle.name,
      year: cycle.year,
      quarter: cycle.quarter,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      self_eval_due_date: cycle.self_eval_due_date,
      manager_review_due_date: cycle.manager_review_due_date,
      status: cycle.status
    });
    setShowCreateModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      year: new Date().getFullYear(),
      quarter: Math.ceil((new Date().getMonth() + 1) / 3),
      start_date: '',
      end_date: '',
      self_eval_due_date: '',
      manager_review_due_date: '',
      status: 'upcoming'
    });
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Calendar size={20} className="text-violet-500" />
            Review Cycles
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Manage quarterly skill review periods
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingCycle(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-medium"
        >
          <Plus size={18} />
          Create Cycle
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} className="text-red-500" />
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Cycles List */}
      <div className="space-y-3">
        {cycles.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
            <Calendar size={48} className="mx-auto mb-3 opacity-50" />
            <p>No review cycles created yet</p>
            <p className="text-sm mt-1">Create your first quarterly review cycle to get started</p>
          </div>
        ) : (
          cycles.map((cycle) => {
            const statusInfo = getStatusInfo(cycle.status);
            const StatusIcon = statusInfo.icon;
            const isActive = ['self_eval', 'manager_review'].includes(cycle.status);

            return (
              <div
                key={cycle.id}
                className={`
                  rounded-xl border p-4
                  ${isActive
                    ? 'border-violet-300 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-900/10'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-zinc-900 dark:text-white">
                        {cycle.name}
                      </h3>
                      <div
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
                      >
                        <StatusIcon size={12} />
                        {statusInfo.label}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span>
                        <strong>Period:</strong> {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                      </span>
                      <span>
                        <strong>Self-eval due:</strong> {formatDate(cycle.self_eval_due_date)}
                      </span>
                      <span>
                        <strong>Review due:</strong> {formatDate(cycle.manager_review_due_date)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status dropdown */}
                    <select
                      value={cycle.status}
                      onChange={(e) => handleStatusChange(cycle.id, e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white"
                      style={{ fontSize: '16px' }}
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleEdit(cycle)}
                      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                      title="Edit cycle"
                    >
                      <Edit2 size={18} />
                    </button>

                    <button
                      onClick={() => handleDelete(cycle.id)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                      title="Delete cycle"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {editingCycle ? 'Edit Review Cycle' : 'Create Review Cycle'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCycle(null);
                }}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <X size={20} className="text-zinc-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Year & Quarter */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Year
                  </label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  >
                    {[2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Quarter
                  </label>
                  <select
                    value={formData.quarter}
                    onChange={(e) => setFormData(prev => ({ ...prev, quarter: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  >
                    <option value={1}>Q1 (Jan-Mar)</option>
                    <option value={2}>Q2 (Apr-Jun)</option>
                    <option value={3}>Q3 (Jul-Sep)</option>
                    <option value={4}>Q4 (Oct-Dec)</option>
                  </select>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Cycle Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                  style={{ fontSize: '16px' }}
                  placeholder="e.g., Q1 2026"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>

              {/* Due Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Self-Eval Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.self_eval_due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, self_eval_due_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Manager Review Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.manager_review_due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, manager_review_due_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>

              {/* Status (only for editing) */}
              {editingCycle && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    style={{ fontSize: '16px' }}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCycle(null);
                }}
                className="px-4 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.start_date}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white font-medium disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {editingCycle ? 'Update Cycle' : 'Create Cycle'}
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

export default ReviewCyclesManager;
