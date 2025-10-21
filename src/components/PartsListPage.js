import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../contexts/ThemeContext';
import { partsService } from '../services/partsService';
import Button from './ui/Button';
import {
  Boxes,
  Plus,
  Search,
  Package,
  Layers,
  Building,
  AlertCircle,
} from 'lucide-react';
import { queryKeys } from '../lib/queryClient';

const initialFormState = {
  part_number: '',
  name: '',
  description: '',
  manufacturer: '',
  model: '',
  category: '',
  unit_of_measure: 'ea',
  quantity_on_hand: 0,
  quantity_reserved: 0,
  is_wire_drop_visible: true,
  is_inventory_item: true,
};

const PartsListPage = () => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [formError, setFormError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editedParts, setEditedParts] = useState({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();

  const {
    data: parts = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.parts,
    queryFn: () => partsService.list(),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => partsService.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      setShowForm(false);
      setFormData(initialFormState);
      if (created?.id) {
        navigate(`/parts/${created.id}`);
      }
    },
    onError: (mutationError) => {
      setFormError(mutationError.message || 'Failed to create part.');
    },
  });

  const updatePartsMutation = useMutation({
    mutationFn: async (updates) => {
      // Update all parts in parallel
      const promises = Object.entries(updates).map(([partId, changes]) =>
        partsService.update(partId, changes)
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      setEditMode(false);
      setEditedParts({});
    },
    onError: (mutationError) => {
      setFormError(mutationError.message || 'Failed to update parts.');
    },
  });

  const styles = useMemo(() => {
    const palette = theme.palette;
    const backgroundPrimary = mode === 'dark' ? '#111827' : '#FFFFFF';
    const backgroundMuted = mode === 'dark' ? '#1F2937' : '#F9FAFB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#111827';
    const textSecondary = mode === 'dark' ? '#D1D5DB' : '#4B5563';
    const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';

    return {
      card: {
        backgroundColor: backgroundPrimary,
        borderColor,
      },
      muted: {
        backgroundColor: backgroundMuted,
      },
      textPrimary,
      textSecondary,
      highlight: palette.accent || '#7C3AED',
    };
  }, [theme, mode]);

  const filteredParts = useMemo(() => {
    if (!search) return parts;
    const term = search.toLowerCase();
    return parts.filter((part) => {
      return [
        part.part_number,
        part.name,
        part.description,
        part.manufacturer,
        part.model,
        part.category,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [parts, search]);

  const handleFormChange = useCallback((key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: key.startsWith('quantity')
        ? Number(value)
        : value,
    }));
  }, []);

  const handleCreate = useCallback(
    (event) => {
      event.preventDefault();
      setFormError('');

      if (!formData.part_number.trim()) {
        setFormError('Part number is required.');
        return;
      }

      createMutation.mutate(formData);
    },
    [formData, createMutation],
  );

  const toggleEditMode = useCallback(() => {
    if (editMode) {
      // Cancel edit mode
      setEditedParts({});
      setEditMode(false);
    } else {
      // Enter edit mode
      setEditMode(true);
    }
  }, [editMode]);

  const handleWireDropVisibilityChange = useCallback((partId, currentValue) => {
    setEditedParts((prev) => ({
      ...prev,
      [partId]: {
        ...prev[partId],
        is_wire_drop_visible: !currentValue,
      },
    }));
  }, []);

  const handleSaveChanges = useCallback(() => {
    if (Object.keys(editedParts).length === 0) {
      setEditMode(false);
      return;
    }
    updatePartsMutation.mutate(editedParts);
  }, [editedParts, updatePartsMutation]);

  const renderPartCard = (part) => {
    const quantity = Number(part.quantity_available ?? part.quantity_on_hand ?? 0);
    const totalOnHand = Number(part.quantity_on_hand ?? 0);
    const reserved = Number(part.quantity_reserved ?? 0);
    
    // Determine the current visibility value (edited or original)
    const currentVisibility = editedParts[part.id]?.is_wire_drop_visible !== undefined
      ? editedParts[part.id].is_wire_drop_visible
      : part.is_wire_drop_visible !== false;

    const isModified = editedParts[part.id] !== undefined;

    if (editMode) {
      // Edit mode: show as non-clickable card with checkbox
      return (
        <div
          key={part.id}
          className={`p-4 rounded-xl border transition-all space-y-3 ${
            isModified ? 'ring-2 ring-violet-500 shadow-lg' : ''
          }`}
          style={styles.card}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"
                style={{ color: styles.highlight }}
              >
                <Boxes className="w-4 h-4" />
                {part.part_number}
              </div>
              <h3 className="text-lg font-semibold mt-1"
                style={{ color: styles.textPrimary }}
              >
                {part.name || part.model || 'Untitled Part'}
              </h3>
              {part.description && (
                <p className="text-sm mt-1" style={{ color: styles.textSecondary }}>
                  {part.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div
                className="flex flex-col items-end text-sm px-3 py-2 rounded-lg"
                style={styles.muted}
              >
                <span className="font-semibold" style={{ color: styles.textPrimary }}>
                  {quantity}
                </span>
                <span className="text-xs" style={{ color: styles.textSecondary }}>
                  Available
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={currentVisibility}
                  onChange={() => handleWireDropVisibilityChange(part.id, currentVisibility)}
                  className="h-5 w-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                  Show in<br/>Wire Drop
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {part.manufacturer && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/10 text-violet-500">
                <Building className="w-3 h-3" />
                {part.manufacturer}
              </span>
            )}
            {part.model && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">
                <Package className="w-3 h-3" />
                {part.model}
              </span>
            )}
            {part.category && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-500">
                <Layers className="w-3 h-3" />
                {part.category}
              </span>
            )}
            {isModified && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 font-semibold">
                Modified
              </span>
            )}
          </div>
        </div>
      );
    }

    // Normal mode: clickable card
    return (
      <button
        key={part.id}
        onClick={() => navigate(`/parts/${part.id}`)}
        className="w-full text-left"
      >
        <div
          className="p-4 rounded-xl border transition-shadow hover:shadow-md space-y-3"
          style={styles.card}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"
                style={{ color: styles.highlight }}
              >
                <Boxes className="w-4 h-4" />
                {part.part_number}
              </div>
              <h3 className="text-lg font-semibold mt-1"
                style={{ color: styles.textPrimary }}
              >
                {part.name || part.model || 'Untitled Part'}
              </h3>
              {part.description && (
                <p className="text-sm mt-1" style={{ color: styles.textSecondary }}>
                  {part.description}
                </p>
              )}
            </div>
            <div
              className="flex flex-col items-end text-sm px-3 py-2 rounded-lg"
              style={styles.muted}
            >
              <span className="font-semibold" style={{ color: styles.textPrimary }}>
                {quantity}
              </span>
              <span className="text-xs" style={{ color: styles.textSecondary }}>
                Available
              </span>
              {reserved > 0 && (
                <span className="text-[11px]" style={{ color: styles.textSecondary }}>
                  {`${totalOnHand} on hand • ${reserved} reserved`}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {part.manufacturer && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/10 text-violet-500">
                <Building className="w-3 h-3" />
                {part.manufacturer}
              </span>
            )}
            {part.model && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">
                <Package className="w-3 h-3" />
                {part.model}
              </span>
            )}
            {part.category && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-500">
                <Layers className="w-3 h-3" />
                {part.category}
              </span>
            )}
            {part.is_wire_drop_visible === false && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-500/10 text-gray-600 dark:text-gray-300">
                Hidden from Wire Drop
              </span>
            )}
            {part.is_inventory_item === false && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300">
                Inventory Off
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-500">
            Parts Catalog
          </p>
          <p className="text-sm" style={{ color: styles.textSecondary }}>
            {editMode
              ? 'Edit mode: Toggle "Show in Wire Drop" for multiple parts, then save.'
              : 'Master list of parts and equipment with manuals, schematics, and install guidance.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button
                variant="secondary"
                onClick={toggleEditMode}
                disabled={updatePartsMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveChanges}
                loading={updatePartsMutation.isLoading}
                disabled={Object.keys(editedParts).length === 0}
              >
                Save Changes {Object.keys(editedParts).length > 0 && `(${Object.keys(editedParts).length})`}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={toggleEditMode}
              >
                Edit Mode
              </Button>
              <Button
                icon={Plus}
                onClick={() => {
                  setFormError('');
                  setFormData(initialFormState);
                  setShowForm(true);
                }}
              >
                Add Part
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by part number, model, manufacturer, or description"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <span className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          {filteredParts.length} items
        </span>
      </div>

      {isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300">
          <AlertCircle className="w-4 h-4" />
          <span>{error?.message || 'Failed to load parts.'}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading parts catalog…</p>
          </div>
        </div>
      ) : filteredParts.length === 0 ? (
        <div
          className="border border-dashed rounded-xl p-10 text-center space-y-4"
          style={styles.card}
        >
          <Boxes className="w-10 h-10 mx-auto text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold" style={{ color: styles.textPrimary }}>
              No parts found
            </h2>
            <p className="text-sm" style={{ color: styles.textSecondary }}>
              {search
                ? 'Try adjusting your search terms or clear the filter.'
                : 'Add your first part to start building the global catalog.'}
            </p>
          </div>
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            Add Part
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredParts.map(renderPartCard)}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: styles.textPrimary }}>
                  Add Global Part
                </h2>
                <p className="text-sm mt-1" style={{ color: styles.textSecondary }}>
                  Create a new part entry that can be reused across all projects.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Close
              </Button>
            </div>

            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Part Number<span className="text-red-500 ml-1">*</span>
                  <input
                    type="text"
                    required
                    value={formData.part_number}
                    onChange={(event) => handleFormChange('part_number', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., IS-CTRL-001"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => handleFormChange('name', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Display name"
                  />
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Manufacturer
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(event) => handleFormChange('manufacturer', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(event) => handleFormChange('model', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Category
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(event) => handleFormChange('category', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Network"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Unit
                    <input
                      type="text"
                      value={formData.unit_of_measure}
                      onChange={(event) => handleFormChange('unit_of_measure', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Qty On Hand
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity_on_hand}
                      onChange={(event) => handleFormChange('quantity_on_hand', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </label>
                </div>
              </div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
                <textarea
                  value={formData.description}
                  onChange={(event) => handleFormChange('description', event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Short summary or installation notes"
                />
              </label>

              <div className="grid md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.is_wire_drop_visible}
                    onChange={(event) => handleFormChange('is_wire_drop_visible', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>Show in wire drop selector</span>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.is_inventory_item}
                    onChange={(event) => handleFormChange('is_inventory_item', event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>Track inventory for this part</span>
                </label>
              </div>

              {formError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={createMutation.isLoading}
                >
                  Save Part
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartsListPage;
