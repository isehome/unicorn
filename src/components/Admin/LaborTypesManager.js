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
  GripVertical,
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
      // Auto-generate name slug if creating new
      name: editingType ? prev.name : label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    }));
  };

  // Handle save
  const handleSave = async () => {
    // Validation
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

  // Styles
  const styles = {
    container: {
      padding: '20px'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px'
    },
    title: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#E5E5E5',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    headerActions: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center'
    },
    checkbox: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '13px',
      color: '#A3A3A3',
      cursor: 'pointer'
    },
    addButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      backgroundColor: '#94AF32',
      color: '#1A1A1A',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer'
    },
    error: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#EF4444'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse'
    },
    th: {
      textAlign: 'left',
      padding: '12px 16px',
      borderBottom: '1px solid #333',
      color: '#A3A3A3',
      fontSize: '12px',
      fontWeight: '600',
      textTransform: 'uppercase'
    },
    td: {
      padding: '12px 16px',
      borderBottom: '1px solid #2A2A2A',
      color: '#E5E5E5',
      fontSize: '14px'
    },
    row: {
      transition: 'background-color 0.2s'
    },
    rowInactive: {
      opacity: 0.5
    },
    labelCell: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    defaultBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      backgroundColor: 'rgba(148, 175, 50, 0.2)',
      color: '#94AF32',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '500'
    },
    rate: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      color: '#94AF32'
    },
    actions: {
      display: 'flex',
      gap: '8px'
    },
    actionButton: {
      padding: '6px',
      backgroundColor: 'transparent',
      border: '1px solid #333',
      borderRadius: '4px',
      color: '#A3A3A3',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    // Modal styles
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modal: {
      backgroundColor: '#1F1F1F',
      borderRadius: '12px',
      width: '100%',
      maxWidth: '500px',
      maxHeight: '90vh',
      overflow: 'auto'
    },
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      borderBottom: '1px solid #333'
    },
    modalTitle: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#E5E5E5'
    },
    closeButton: {
      padding: '4px',
      backgroundColor: 'transparent',
      border: 'none',
      color: '#A3A3A3',
      cursor: 'pointer'
    },
    modalBody: {
      padding: '20px'
    },
    formGroup: {
      marginBottom: '16px'
    },
    label: {
      display: 'block',
      marginBottom: '6px',
      fontSize: '13px',
      fontWeight: '500',
      color: '#A3A3A3'
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#2A2A2A',
      border: '1px solid #333',
      borderRadius: '6px',
      color: '#E5E5E5',
      fontSize: '14px'
    },
    textarea: {
      width: '100%',
      padding: '10px 12px',
      backgroundColor: '#2A2A2A',
      border: '1px solid #333',
      borderRadius: '6px',
      color: '#E5E5E5',
      fontSize: '14px',
      minHeight: '80px',
      resize: 'vertical'
    },
    checkboxGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    modalFooter: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '12px',
      padding: '16px 20px',
      borderTop: '1px solid #333'
    },
    cancelButton: {
      padding: '10px 20px',
      backgroundColor: 'transparent',
      border: '1px solid #333',
      borderRadius: '6px',
      color: '#A3A3A3',
      fontSize: '14px',
      cursor: 'pointer'
    },
    saveButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '10px 20px',
      backgroundColor: '#94AF32',
      border: 'none',
      borderRadius: '6px',
      color: '#1A1A1A',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer'
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: '#A3A3A3'
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.container, textAlign: 'center', padding: '40px' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#A3A3A3', marginTop: '12px' }}>Loading labor types...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <Wrench size={20} />
          Labor Types
        </div>
        <div style={styles.headerActions}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button style={styles.addButton} onClick={openCreateModal}>
            <Plus size={16} />
            Add Labor Type
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.error}>
          <AlertCircle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      {laborTypes.length === 0 ? (
        <div style={styles.emptyState}>
          <Wrench size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p>No labor types found</p>
          <button style={{ ...styles.addButton, marginTop: '16px' }} onClick={openCreateModal}>
            <Plus size={16} />
            Create First Labor Type
          </button>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Hourly Rate</th>
              <th style={styles.th}>QBO Item</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {laborTypes.map((laborType) => (
              <tr
                key={laborType.id}
                style={{
                  ...styles.row,
                  ...(laborType.is_active ? {} : styles.rowInactive)
                }}
              >
                <td style={styles.td}>
                  <div style={styles.labelCell}>
                    {laborType.label}
                    {laborType.is_default && (
                      <span style={styles.defaultBadge}>
                        <Star size={10} />
                        Default
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ ...styles.td, color: '#71717A', fontFamily: 'monospace' }}>
                  {laborType.name}
                </td>
                <td style={styles.td}>
                  <span style={styles.rate}>
                    <DollarSign size={14} />
                    {laborType.hourly_rate}/hr
                  </span>
                </td>
                <td style={{ ...styles.td, color: laborType.qbo_item_name ? '#E5E5E5' : '#71717A' }}>
                  {laborType.qbo_item_name || '—'}
                </td>
                <td style={styles.td}>
                  <div style={styles.actions}>
                    {laborType.is_active ? (
                      <>
                        <button
                          style={styles.actionButton}
                          onClick={() => openEditModal(laborType)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {!laborType.is_default && (
                          <button
                            style={styles.actionButton}
                            onClick={() => handleSetDefault(laborType)}
                            title="Set as default"
                          >
                            <Star size={14} />
                          </button>
                        )}
                        <button
                          style={{ ...styles.actionButton, borderColor: '#7F1D1D' }}
                          onClick={() => handleDelete(laborType)}
                          title="Deactivate"
                        >
                          <Trash2 size={14} color="#EF4444" />
                        </button>
                      </>
                    ) : (
                      <button
                        style={styles.actionButton}
                        onClick={() => handleRestore(laborType)}
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
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>
                {editingType ? 'Edit Labor Type' : 'Add Labor Type'}
              </span>
              <button style={styles.closeButton} onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Label *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g., Installation"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Name Slug *</label>
                <input
                  type="text"
                  style={{ ...styles.input, fontFamily: 'monospace' }}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., install"
                  disabled={!!editingType}
                />
                <small style={{ color: '#71717A', fontSize: '11px' }}>
                  Unique identifier (auto-generated from label)
                </small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Description</label>
                <textarea
                  style={styles.textarea}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this labor type"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hourly Rate ($) *</label>
                <input
                  type="number"
                  style={styles.input}
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  step="5"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>QuickBooks Item Name</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.qbo_item_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, qbo_item_name: e.target.value }))}
                  placeholder="e.g., Installation Labor"
                />
                <small style={{ color: '#71717A', fontSize: '11px' }}>
                  Name of the Product/Service in QuickBooks
                </small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.checkboxGroup}>
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                  />
                  <span style={{ color: '#E5E5E5', fontSize: '14px' }}>
                    Set as default labor type
                  </span>
                </label>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.cancelButton} onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
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
