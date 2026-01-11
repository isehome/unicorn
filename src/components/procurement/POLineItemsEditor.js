import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { projectEquipmentService } from '../../services/projectEquipmentService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import Button from '../ui/Button';
import {
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  Loader,
  AlertCircle,
  X,
  Check,
  FileSpreadsheet
} from 'lucide-react';

/**
 * POLineItemsEditor - Spreadsheet-like editor for PO line items
 *
 * Features:
 * - Inline editing of all fields (part number, name, qty, cost, etc.)
 * - Add new parts (creates project_equipment + syncs to global_parts)
 * - Delete line items
 * - Export to CSV
 * - Explicit save (no auto-save)
 */
const POLineItemsEditor = ({
  poId,
  projectId,
  items = [],
  isDraft = false,
  onItemsChange,
  onSave,
  onExportCSV
}) => {
  const { mode } = useTheme();

  // Local state for edited items
  const [editedItems, setEditedItems] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Add part modal state
  const [showAddPart, setShowAddPart] = useState(false);
  const [addPartLoading, setAddPartLoading] = useState(false);
  const [newPart, setNewPart] = useState({
    part_number: '',
    name: '',
    description: '',
    manufacturer: '',
    supplier: '',
    unit_cost: '',
    quantity: 1,
    notes: ''
  });

  // Supplier autocomplete
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);

  // Consolidate items by part number
  const consolidateItems = (rawItems) => {
    const grouped = {};

    rawItems.forEach(item => {
      const partNum = item.part_number || item.equipment?.part_number || item.project_equipment?.part_number || '';
      const key = partNum || `_no_part_${item.id}`; // Use unique key for items without part numbers

      if (!grouped[key]) {
        grouped[key] = {
          ...item,
          quantity_ordered: 0,
          line_total: 0,
          _originalItems: [], // Track all original items for this part
          _isModified: false,
          _isNew: false,
          _isDeleted: false
        };
      }

      // Accumulate quantities and totals
      grouped[key].quantity_ordered += (item.quantity_ordered || 0);
      grouped[key].line_total += (item.line_total || 0);
      grouped[key]._originalItems.push(item);

      // Use the lowest line number for display
      if (!grouped[key].line_number || item.line_number < grouped[key].line_number) {
        grouped[key].line_number = item.line_number;
      }
    });

    // Convert to array and sort by line number
    return Object.values(grouped).sort((a, b) => (a.line_number || 0) - (b.line_number || 0));
  };

  // Initialize edited items from props (with consolidation)
  useEffect(() => {
    setEditedItems(consolidateItems(items));
  }, [items]);

  // Load suppliers for autocomplete
  useEffect(() => {
    const loadSuppliers = async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, short_code')
        .order('name');
      setSuppliers(data || []);
    };
    loadSuppliers();
  }, []);

  // Handle field change
  const handleFieldChange = (itemId, field, value) => {
    if (!isDraft) return;

    setEditedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          [field]: value,
          _isModified: true
        };
      }
      return item;
    }));
    setHasChanges(true);
  };

  // Handle delete item
  const handleDeleteItem = (itemId) => {
    if (!isDraft) return;

    setEditedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, _isDeleted: true };
      }
      return item;
    }));
    setHasChanges(true);
  };

  // Handle restore deleted item
  const handleRestoreItem = (itemId) => {
    setEditedItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, _isDeleted: false };
      }
      return item;
    }));
  };

  // Calculate line total
  const calculateLineTotal = (item) => {
    const qty = parseFloat(item.quantity_ordered) || 0;
    const cost = parseFloat(item.unit_cost) || 0;
    return qty * cost;
  };

  // Calculate subtotal
  const calculateSubtotal = () => {
    return editedItems
      .filter(item => !item._isDeleted)
      .reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  // Handle save all changes
  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      setError(null);

      const allDeletes = [];
      const consolidationUpdates = []; // Items to update after consolidation

      for (const item of editedItems) {
        const originalItems = item._originalItems || [item];

        if (item._isDeleted && !item._isNew) {
          // Delete all original items for this consolidated row
          originalItems.forEach(orig => allDeletes.push(orig.id));
        } else if (item._isModified && !item._isNew) {
          // For consolidated items, we need to:
          // 1. Keep the first original item and update it with the new total qty
          // 2. Delete the rest (consolidate into one)
          if (originalItems.length > 1) {
            // Keep first, delete rest
            const [keepItem, ...deleteItems] = originalItems;
            deleteItems.forEach(orig => allDeletes.push(orig.id));

            consolidationUpdates.push({
              id: keepItem.id,
              quantity_ordered: parseFloat(item.quantity_ordered) || 0,
              unit_cost: parseFloat(item.unit_cost) || 0,
              notes: item.notes || null
            });
          } else {
            // Single item, just update normally
            consolidationUpdates.push({
              id: item.id,
              quantity_ordered: parseFloat(item.quantity_ordered) || 0,
              unit_cost: parseFloat(item.unit_cost) || 0,
              notes: item.notes || null
            });
          }
        }
      }

      // Process deletes
      if (allDeletes.length > 0) {
        const { error: deleteError } = await supabase
          .from('purchase_order_items')
          .delete()
          .in('id', allDeletes);

        if (deleteError) throw deleteError;
      }

      // Process updates
      for (const update of consolidationUpdates) {
        const lineTotal = (update.quantity_ordered || 0) * (update.unit_cost || 0);
        const { error: updateError } = await supabase
          .from('purchase_order_items')
          .update({
            quantity_ordered: update.quantity_ordered,
            unit_cost: update.unit_cost,
            line_total: lineTotal,
            notes: update.notes
          })
          .eq('id', update.id);

        if (updateError) throw updateError;
      }

      // Recalculate PO subtotal
      const newSubtotal = calculateSubtotal();
      await purchaseOrderService.updatePurchaseOrder(poId, {
        subtotal: newSubtotal
      });

      setHasChanges(false);
      if (onSave) onSave();
    } catch (err) {
      console.error('Failed to save changes:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Handle add new part
  const handleAddPart = async () => {
    if (!newPart.name.trim()) {
      setError('Part name is required');
      return;
    }

    try {
      setAddPartLoading(true);
      setError(null);

      // Create equipment using the service (handles global_parts sync and supplier matching)
      const equipment = await projectEquipmentService.addSinglePart(projectId, {
        name: newPart.name,
        part_number: newPart.part_number || null,
        description: newPart.description || null,
        manufacturer: newPart.manufacturer || null,
        supplier: newPart.supplier || null,
        unit_cost: parseFloat(newPart.unit_cost) || 0,
        quantity: 1,
        equipment_type: 'part'
      });

      // Get max line number
      const maxLineNumber = editedItems.reduce((max, item) =>
        Math.max(max, item.line_number || 0), 0);

      // Create PO line item
      const { data: newLineItem, error: lineError } = await supabase
        .from('purchase_order_items')
        .insert({
          po_id: poId,
          project_equipment_id: equipment.id,
          line_number: maxLineNumber + 1,
          quantity_ordered: parseInt(newPart.quantity) || 1,
          unit_cost: parseFloat(newPart.unit_cost) || 0,
          line_total: (parseInt(newPart.quantity) || 1) * (parseFloat(newPart.unit_cost) || 0),
          notes: newPart.notes || null
        })
        .select(`
          *,
          project_equipment:project_equipment_id (
            id,
            name,
            part_number,
            description,
            manufacturer,
            model,
            supplier,
            supplier_id
          )
        `)
        .single();

      if (lineError) throw lineError;

      // Add to edited items
      const newItem = {
        ...newLineItem,
        part_number: equipment.part_number,
        description: equipment.name,
        _isNew: true,
        _isModified: false,
        _isDeleted: false
      };

      setEditedItems(prev => [...prev, newItem]);
      setHasChanges(true);

      // Reset form and close modal
      setNewPart({
        part_number: '',
        name: '',
        description: '',
        manufacturer: '',
        supplier: '',
        unit_cost: '',
        quantity: 1,
        notes: ''
      });
      setShowAddPart(false);

    } catch (err) {
      console.error('Failed to add part:', err);
      setError(err.message || 'Failed to add part');
    } finally {
      setAddPartLoading(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const visibleItems = editedItems.filter(item => !item._isDeleted);

    const headers = ['Line #', 'Part Number', 'Description', 'Manufacturer', 'Qty', 'Unit Cost', 'Total', 'Notes'];
    const rows = visibleItems.map(item => [
      item.line_number,
      item.part_number || item.equipment?.part_number || item.project_equipment?.part_number || '',
      item.description || item.equipment?.name || item.equipment?.description || item.project_equipment?.name || '',
      item.equipment?.manufacturer || item.project_equipment?.manufacturer || '',
      item.quantity_ordered,
      (item.unit_cost || 0).toFixed(2),
      calculateLineTotal(item).toFixed(2),
      item.notes || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_LineItems_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Parse CSV string into rows
  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    // Parse header row
    const parseRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    const rows = lines.slice(1).map(line => {
      const values = parseRow(line);
      const row = {};
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });

    return { headers, rows };
  };

  // Handle file selection for import
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target?.result;
      if (typeof csvText === 'string') {
        const { headers, rows } = parseCSV(csvText);

        // Map CSV rows to preview data
        const preview = rows.map(row => {
          // Try to find matching line number or part number
          const lineNum = parseInt(row.line__ || row.line_number || row.line || '0');
          const partNum = row.part_number || row.part_num || row.part || '';
          const qty = parseFloat(row.qty || row.quantity || row.quantity_ordered || '0');
          const unitCost = parseFloat((row.unit_cost || row.cost || row.price || '0').replace(/[$,]/g, ''));
          const description = row.description || row.name || row.desc || '';
          const manufacturer = row.manufacturer || row.mfr || row.brand || '';
          const notes = row.notes || row.note || '';

          // Find existing item by line number or part number
          let existingItem = null;
          if (lineNum > 0) {
            existingItem = editedItems.find(item => item.line_number === lineNum);
          }
          if (!existingItem && partNum) {
            existingItem = editedItems.find(item => {
              const itemPartNum = item.part_number || item.equipment?.part_number || item.project_equipment?.part_number || '';
              return itemPartNum.toLowerCase() === partNum.toLowerCase();
            });
          }

          return {
            lineNumber: lineNum,
            partNumber: partNum,
            description,
            manufacturer,
            qty,
            unitCost,
            notes,
            existingItem,
            action: existingItem ? 'update' : (partNum || description ? 'add' : 'skip'),
            changes: existingItem ? {
              qtyChanged: existingItem.quantity_ordered !== qty,
              costChanged: (existingItem.unit_cost || 0) !== unitCost,
              oldQty: existingItem.quantity_ordered,
              oldCost: existingItem.unit_cost || 0
            } : null
          };
        }).filter(row => row.action !== 'skip');

        setImportPreview(preview);
      }
    };
    reader.readAsText(file);
  };

  // Apply CSV import changes
  const handleApplyImport = async () => {
    if (!importPreview || importPreview.length === 0) return;

    try {
      setImportLoading(true);
      setError(null);

      const updatedItems = [...editedItems];
      const newItems = [];

      for (const row of importPreview) {
        if (row.action === 'update' && row.existingItem) {
          // Update existing item
          const idx = updatedItems.findIndex(item => item.id === row.existingItem.id);
          if (idx !== -1) {
            updatedItems[idx] = {
              ...updatedItems[idx],
              quantity_ordered: row.qty,
              unit_cost: row.unitCost,
              notes: row.notes || updatedItems[idx].notes,
              _isModified: true
            };
          }
        } else if (row.action === 'add' && (row.partNumber || row.description)) {
          // Create new equipment and add to PO
          const equipment = await projectEquipmentService.addSinglePart(projectId, {
            name: row.description || row.partNumber,
            part_number: row.partNumber || null,
            description: row.description || null,
            manufacturer: row.manufacturer || null,
            unit_cost: row.unitCost || 0,
            quantity: 1,
            equipment_type: 'part'
          });

          // Get max line number
          const maxLineNumber = Math.max(
            ...updatedItems.map(item => item.line_number || 0),
            ...newItems.map(item => item.line_number || 0),
            0
          );

          // Create PO line item
          const { data: newLineItem, error: lineError } = await supabase
            .from('purchase_order_items')
            .insert({
              po_id: poId,
              project_equipment_id: equipment.id,
              line_number: maxLineNumber + 1,
              quantity_ordered: row.qty || 1,
              unit_cost: row.unitCost || 0,
              line_total: (row.qty || 1) * (row.unitCost || 0),
              notes: row.notes || null
            })
            .select(`
              *,
              equipment:project_equipment_id (
                id,
                name,
                part_number,
                description,
                manufacturer,
                model,
                supplier,
                supplier_id
              )
            `)
            .single();

          if (lineError) throw lineError;

          newItems.push({
            ...newLineItem,
            _isNew: true,
            _isModified: false,
            _isDeleted: false
          });
        }
      }

      setEditedItems([...updatedItems, ...newItems]);
      setHasChanges(true);
      setShowImportModal(false);
      setImportPreview(null);
      setImportFile(null);

    } catch (err) {
      console.error('Failed to apply import:', err);
      setError(err.message || 'Failed to apply import');
    } finally {
      setImportLoading(false);
    }
  };

  // Filter suppliers for autocomplete
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.short_code && s.short_code.toLowerCase().includes(supplierSearch.toLowerCase()))
  ).slice(0, 10);

  const visibleItems = editedItems.filter(item => !item._isDeleted);
  const deletedCount = editedItems.filter(item => item._isDeleted).length;

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-white">
          Line Items ({visibleItems.length})
          {deletedCount > 0 && (
            <span className="ml-2 text-sm text-red-500">({deletedCount} marked for deletion)</span>
          )}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => setShowAddPart(true)}
              >
                Add Part
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={Upload}
                onClick={() => setShowImportModal(true)}
              >
                Import CSV
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          {hasChanges && isDraft && (
            <Button
              variant="primary"
              size="sm"
              icon={saving ? Loader : Save}
              onClick={handleSaveChanges}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600 dark:text-red-400" />
          </button>
        </div>
      )}

      {/* Editable table */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 font-medium w-12">#</th>
              <th className="px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 font-medium w-32">Part Number</th>
              <th className="px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 font-medium">Description</th>
              <th className="px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 font-medium w-28">Manufacturer</th>
              <th className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 font-medium w-20">Qty</th>
              <th className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 font-medium w-24">Unit Cost</th>
              <th className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300 font-medium w-24">Total</th>
              {isDraft && (
                <th className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300 font-medium w-16">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {visibleItems.map((item) => (
              <tr
                key={item.id}
                className={`${item._isModified ? 'bg-amber-50 dark:bg-amber-900/10' : ''} ${item._isNew ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
              >
                <td className="px-3 py-2 text-zinc-900 dark:text-white">
                  {item.line_number}
                  {/* Show consolidated indicator if multiple items were merged */}
                  {item._originalItems && item._originalItems.length > 1 && (
                    <span
                      className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                      title={`Consolidated from ${item._originalItems.length} line items`}
                    >
                      {item._originalItems.length}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="text-zinc-900 dark:text-white font-mono text-xs">
                    {item.part_number || item.equipment?.part_number || item.project_equipment?.part_number || '-'}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-900 dark:text-white">
                  {item.description || item.equipment?.name || item.equipment?.description || item.project_equipment?.name || '-'}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 text-xs">
                  {item.equipment?.manufacturer || item.project_equipment?.manufacturer || '-'}
                </td>
                <td className="px-3 py-2">
                  {isDraft ? (
                    <input
                      type="number"
                      min="1"
                      value={item.quantity_ordered || ''}
                      onChange={(e) => handleFieldChange(item.id, 'quantity_ordered', e.target.value)}
                      className="w-full px-2 py-1 text-right border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                    />
                  ) : (
                    <span className="text-right block text-zinc-900 dark:text-white">{item.quantity_ordered}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isDraft ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_cost || ''}
                      onChange={(e) => handleFieldChange(item.id, 'unit_cost', e.target.value)}
                      className="w-full px-2 py-1 text-right border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
                    />
                  ) : (
                    <span className="text-right block text-zinc-900 dark:text-white">${(item.unit_cost || 0).toFixed(2)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-white">
                  ${calculateLineTotal(item).toFixed(2)}
                </td>
                {isDraft && (
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                      title="Remove from PO"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 dark:bg-zinc-800/50 border-t-2 border-zinc-300 dark:border-zinc-600">
            <tr>
              <td colSpan={isDraft ? 6 : 5} className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                Subtotal:
              </td>
              <td className="px-3 py-2 text-right font-bold text-violet-600 dark:text-violet-400">
                ${calculateSubtotal().toFixed(2)}
              </td>
              {isDraft && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Deleted items (can restore) */}
      {deletedCount > 0 && isDraft && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
            Items to be removed ({deletedCount}):
          </p>
          <div className="space-y-1">
            {editedItems.filter(item => item._isDeleted).map(item => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-red-600 dark:text-red-400">
                  {item.part_number || item.equipment?.part_number || item.project_equipment?.part_number || 'No Part #'} - {item.description || item.equipment?.name || item.project_equipment?.name}
                </span>
                <button
                  onClick={() => handleRestoreItem(item.id)}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {showAddPart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Add Part to PO</h3>
              <button
                onClick={() => setShowAddPart(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This will create a new equipment item in the project and add it to this PO.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Part Number
                  </label>
                  <input
                    type="text"
                    value={newPart.part_number}
                    onChange={(e) => setNewPart({ ...newPart, part_number: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    placeholder="e.g., ABC-123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newPart.name}
                    onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    placeholder="e.g., Network Switch"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newPart.description}
                  onChange={(e) => setNewPart({ ...newPart, description: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    value={newPart.manufacturer}
                    onChange={(e) => setNewPart({ ...newPart, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    placeholder="e.g., Cisco"
                  />
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={newPart.supplier}
                    onChange={(e) => {
                      setNewPart({ ...newPart, supplier: e.target.value });
                      setSupplierSearch(e.target.value);
                      setShowSupplierDropdown(true);
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    placeholder="e.g., Amazon"
                  />
                  {showSupplierDropdown && filteredSuppliers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredSuppliers.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setNewPart({ ...newPart, supplier: s.name });
                            setShowSupplierDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white"
                        >
                          {s.name} {s.short_code && <span className="text-zinc-500">({s.short_code})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newPart.quantity}
                    onChange={(e) => setNewPart({ ...newPart, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Unit Cost
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPart.unit_cost}
                    onChange={(e) => setNewPart({ ...newPart, unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={newPart.notes}
                  onChange={(e) => setNewPart({ ...newPart, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white resize-none"
                  placeholder="Optional notes for this line item"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowAddPart(false)}
                disabled={addPartLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={addPartLoading ? Loader : Plus}
                onClick={handleAddPart}
                disabled={addPartLoading || !newPart.name.trim()}
              >
                {addPartLoading ? 'Adding...' : 'Add to PO'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Import CSV
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview(null);
                  setImportFile(null);
                }}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {!importPreview ? (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Import a CSV file to update quantities and costs, or add new parts.
                    The CSV should have columns for Part Number, Qty, and Unit Cost.
                  </p>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600">
                    <div className="text-center">
                      <Upload className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
                      <label className="cursor-pointer">
                        <span className="text-violet-600 dark:text-violet-400 hover:underline font-medium">
                          Choose a CSV file
                        </span>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-zinc-500 mt-2">or drag and drop</p>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                    <p className="font-medium">Expected columns:</p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5">
                      <li><code className="bg-zinc-100 dark:bg-zinc-700 px-1 rounded">Line #</code> - Matches existing items by line number</li>
                      <li><code className="bg-zinc-100 dark:bg-zinc-700 px-1 rounded">Part Number</code> - Matches existing items or creates new ones</li>
                      <li><code className="bg-zinc-100 dark:bg-zinc-700 px-1 rounded">Description</code> - Used for new parts</li>
                      <li><code className="bg-zinc-100 dark:bg-zinc-700 px-1 rounded">Qty</code> - Quantity to order</li>
                      <li><code className="bg-zinc-100 dark:bg-zinc-700 px-1 rounded">Unit Cost</code> - Price per unit</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Preview: <strong>{importPreview.length}</strong> rows to process
                    </p>
                    <button
                      onClick={() => {
                        setImportPreview(null);
                        setImportFile(null);
                      }}
                      className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      Choose different file
                    </button>
                  </div>

                  {/* Preview table */}
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-zinc-700 dark:text-zinc-300 font-medium">Action</th>
                          <th className="px-2 py-1.5 text-left text-zinc-700 dark:text-zinc-300 font-medium">Part #</th>
                          <th className="px-2 py-1.5 text-left text-zinc-700 dark:text-zinc-300 font-medium">Description</th>
                          <th className="px-2 py-1.5 text-right text-zinc-700 dark:text-zinc-300 font-medium">Qty</th>
                          <th className="px-2 py-1.5 text-right text-zinc-700 dark:text-zinc-300 font-medium">Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                        {importPreview.map((row, idx) => (
                          <tr
                            key={idx}
                            className={row.action === 'add' ? 'bg-green-50 dark:bg-green-900/10' : row.changes?.qtyChanged || row.changes?.costChanged ? 'bg-amber-50 dark:bg-amber-900/10' : ''}
                          >
                            <td className="px-2 py-1.5">
                              {row.action === 'add' ? (
                                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                  <Plus className="w-3 h-3" /> New
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                  <Check className="w-3 h-3" /> Update
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-zinc-900 dark:text-white">
                              {row.partNumber || '-'}
                            </td>
                            <td className="px-2 py-1.5 text-zinc-900 dark:text-white truncate max-w-[200px]">
                              {row.description || '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-zinc-900 dark:text-white">
                              {row.qty}
                              {row.changes?.qtyChanged && (
                                <span className="ml-1 text-zinc-500 line-through">{row.changes.oldQty}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-zinc-900 dark:text-white">
                              ${row.unitCost.toFixed(2)}
                              {row.changes?.costChanged && (
                                <span className="ml-1 text-zinc-500 line-through">${row.changes.oldCost.toFixed(2)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                      <Plus className="w-3 h-3" />
                      {importPreview.filter(r => r.action === 'add').length} new parts
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Check className="w-3 h-3" />
                      {importPreview.filter(r => r.action === 'update').length} updates
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreview(null);
                  setImportFile(null);
                }}
                disabled={importLoading}
              >
                Cancel
              </Button>
              {importPreview && importPreview.length > 0 && (
                <Button
                  variant="primary"
                  icon={importLoading ? Loader : Check}
                  onClick={handleApplyImport}
                  disabled={importLoading}
                >
                  {importLoading ? 'Applying...' : 'Apply Changes'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POLineItemsEditor;
