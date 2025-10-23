import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Trash2,
  Link as LinkIcon,
  FileText,
  Plus,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Button from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';
import { partsService } from '../services/partsService';
import { queryKeys } from '../lib/queryClient';

const RESOURCE_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'schematic', label: 'Schematic' },
  { value: 'instruction', label: 'Instructions' },
  { value: 'datasheet', label: 'Datasheet' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'Link' },
  { value: 'other', label: 'Other' },
];

const PartDetailPage = () => {
  const { partId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();

  const [formState, setFormState] = useState(null);
  const [formError, setFormError] = useState('');

  const {
    data: part,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.part(partId),
    queryFn: () => partsService.getById(partId),
    enabled: Boolean(partId),
  });

  useEffect(() => {
    if (part) {
      setFormState({
        part_number: part.part_number || '',
        name: part.name || '',
        description: part.description || '',
        manufacturer: part.manufacturer || '',
        model: part.model || '',
        category: part.category || '',
        unit_of_measure: part.unit_of_measure || 'ea',
        quantity_on_hand: Number(part.quantity_on_hand ?? 0),
        quantity_reserved: Number(part.quantity_reserved ?? 0),
        is_wire_drop_visible: part.is_wire_drop_visible !== false,
        is_inventory_item: part.is_inventory_item !== false,
        required_for_prewire: part.required_for_prewire === true,
        attributes: part.attributes || {},
        resource_links: Array.isArray(part.resource_links) ? part.resource_links : [],
      });
    }
  }, [part]);

  const updateMutation = useMutation({
    mutationFn: (updates) => partsService.update(partId, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.part(partId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      setFormError('');
      setFormState({
        part_number: updated.part_number || '',
        name: updated.name || '',
        description: updated.description || '',
        manufacturer: updated.manufacturer || '',
        model: updated.model || '',
        category: updated.category || '',
        unit_of_measure: updated.unit_of_measure || 'ea',
        quantity_on_hand: Number(updated.quantity_on_hand ?? 0),
        quantity_reserved: Number(updated.quantity_reserved ?? 0),
        is_wire_drop_visible: updated.is_wire_drop_visible !== false,
        is_inventory_item: updated.is_inventory_item !== false,
        required_for_prewire: updated.required_for_prewire === true,
        attributes: updated.attributes || {},
        resource_links: Array.isArray(updated.resource_links) ? updated.resource_links : [],
      });
    },
    onError: (mutationError) => {
      setFormError(mutationError.message || 'Failed to update part.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => partsService.remove(partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      navigate('/parts', { replace: true });
    },
    onError: (mutationError) => {
      setFormError(mutationError.message || 'Failed to delete part.');
    },
  });

  const styles = useMemo(() => {
    const palette = theme.palette;
    return {
      label: 'text-sm font-medium text-gray-700 dark:text-gray-300',
      input:
        'mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500',
      textArea:
        'mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500',
      sectionTitle: 'text-sm font-semibold uppercase tracking-wide text-violet-500',
      card: `rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm`,
      accent: palette.accent || '#7C3AED',
      textSecondary: 'text-sm text-gray-500 dark:text-gray-400',
    };
  }, [theme]);

  const handleFieldChange = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      [field]: field.startsWith('quantity') ? Number(value) : value,
    }));
  };

  const handleResourceChange = (index, field, value) => {
    setFormState((prev) => {
      const links = [...(prev.resource_links || [])];
      links[index] = { ...links[index], [field]: value };
      return { ...prev, resource_links: links };
    });
  };

  const handleAddResource = () => {
    setFormState((prev) => ({
      ...prev,
      resource_links: [
        ...(prev.resource_links || []),
        {
          id: undefined,
          label: '',
          type: 'manual',
          url: '',
        },
      ],
    }));
  };

  const handleRemoveResource = (index) => {
    setFormState((prev) => {
      const links = [...(prev.resource_links || [])];
      links.splice(index, 1);
      return { ...prev, resource_links: links };
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formState.part_number.trim()) {
      setFormError('Part number cannot be empty.');
      return;
    }

    setFormError('');
    updateMutation.mutate(formState);
  };

  if (isLoading || !formState) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>Loading part details…</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300">
          <AlertCircle className="w-5 h-5" />
          <span>{error?.message || 'Unable to load part.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="space-y-1 mb-6">
        <p className={styles.sectionTitle}>Part Configuration</p>
        <p className={styles.textSecondary}>
          Update catalog details, inventory counts, and installation resources for technicians.
        </p>
      </div>

      {formState && (
        <div className="flex flex-wrap gap-3 mb-6">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              formState.is_wire_drop_visible
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {formState.is_wire_drop_visible ? 'Visible in wire drop selector' : 'Hidden from wire drop selector'}
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              formState.is_inventory_item
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {formState.is_inventory_item ? 'Inventory tracking enabled' : 'Inventory tracking off'}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={styles.card + ' p-6 space-y-4'}>
          <div className="grid md:grid-cols-2 gap-4">
            <label className={styles.label}>
              Part Number<span className="text-red-500 ml-1">*</span>
              <input
                type="text"
                value={formState.part_number}
                onChange={(event) => handleFieldChange('part_number', event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Name
              <input
                type="text"
                value={formState.name}
                onChange={(event) => handleFieldChange('name', event.target.value)}
                className={styles.input}
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className={styles.label}>
              Manufacturer
              <input
                type="text"
                value={formState.manufacturer}
                onChange={(event) => handleFieldChange('manufacturer', event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Model
              <input
                type="text"
                value={formState.model}
                onChange={(event) => handleFieldChange('model', event.target.value)}
                className={styles.input}
              />
            </label>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label className={styles.label}>
              Category
              <input
                type="text"
                value={formState.category}
                onChange={(event) => handleFieldChange('category', event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Unit of Measure
              <input
                type="text"
                value={formState.unit_of_measure}
                onChange={(event) => handleFieldChange('unit_of_measure', event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Quantity On Hand
              <input
                type="number"
                min="0"
                value={formState.quantity_on_hand}
                onChange={(event) => handleFieldChange('quantity_on_hand', event.target.value)}
                className={styles.input}
              />
            </label>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label className={styles.label}>
              Reserved
              <input
                type="number"
                min="0"
                value={formState.quantity_reserved}
                onChange={(event) => handleFieldChange('quantity_reserved', event.target.value)}
                className={styles.input}
              />
            </label>
            <div className="flex flex-col justify-end">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Available quantity is calculated automatically.
              </span>
            </div>
          </div>

          <label className={styles.label}>
            Description
            <textarea
              rows={4}
              value={formState.description}
              onChange={(event) => handleFieldChange('description', event.target.value)}
              className={styles.textArea}
            />
          </label>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(formState.is_wire_drop_visible)}
                onChange={(event) => handleFieldChange('is_wire_drop_visible', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span>Show in wire drop selector</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(formState.is_inventory_item)}
                onChange={(event) => handleFieldChange('is_inventory_item', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span>Track inventory for this part</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
              <input
                type="checkbox"
                checked={Boolean(formState.required_for_prewire)}
                onChange={(event) => handleFieldChange('required_for_prewire', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span>⚡ Required for prewire phase</span>
            </label>
          </div>
        </div>

        <div className={styles.card + ' p-6 space-y-4'}>
          <div className="flex items-center justify-between">
            <div>
              <p className={styles.sectionTitle}>Resource Links</p>
              <p className={styles.textSecondary}>
                Manuals, wiring diagrams, videos, or other technician references.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              onClick={handleAddResource}
            >
              Add Link
            </Button>
          </div>

          {(formState.resource_links || []).length === 0 ? (
            <div className="px-4 py-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
              No resource links added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {(formState.resource_links || []).map((link, index) => (
                <div
                  key={link.id || index}
                  className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-start p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60"
                >
                  <label className={styles.label}>
                    Label
                    <input
                      type="text"
                      value={link.label || ''}
                      onChange={(event) => handleResourceChange(index, 'label', event.target.value)}
                      className={styles.input}
                      placeholder="e.g., Install schematic"
                    />
                  </label>
                  <label className={styles.label}>
                    URL
                    <input
                      type="url"
                      value={link.url || ''}
                      onChange={(event) => handleResourceChange(index, 'url', event.target.value)}
                      className={styles.input}
                      placeholder="https://"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className={styles.label + ' flex-1'}>
                      Type
                      <select
                        value={link.type || 'link'}
                        onChange={(event) => handleResourceChange(index, 'type', event.target.value)}
                        className={styles.input}
                      >
                        {RESOURCE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleRemoveResource(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card + ' p-6 space-y-3'}>
          <p className={styles.sectionTitle}>Custom Attributes</p>
          <p className={styles.textSecondary}>
            Store arbitrary JSON metadata to enrich this part (specifications, ordering codes, etc.).
          </p>
          <textarea
            rows={6}
            value={JSON.stringify(formState.attributes || {}, null, 2)}
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value || '{}');
                setFormState((prev) => ({ ...prev, attributes: parsed }));
                setFormError('');
              } catch (jsonError) {
                setFormError('Attributes must be valid JSON.');
              }
            }}
            className={styles.textArea + ' font-mono text-xs'}
          />
        </div>

        {formError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Button
            type="button"
            variant="danger"
            icon={Trash2}
            onClick={() => {
              if (window.confirm('Delete this part from the global catalog? This action cannot be undone.')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isLoading}
          >
            Delete Part
          </Button>

          <div className="flex items-center gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/parts')}
            >
              Back to list
            </Button>
            <Button
              type="submit"
              icon={Save}
              loading={updateMutation.isLoading}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </form>

      {part?.resource_links?.length > 0 && (
        <div className="mt-8 space-y-3">
          <p className={styles.sectionTitle}>Quick Links</p>
          <div className="flex flex-wrap gap-3">
            {part.resource_links
              .filter((link) => link?.url)
              .map((link) => (
                <a
                  key={link.id || link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-violet-500 text-violet-500 hover:bg-violet-500/10 transition"
                >
                  {link.type === 'manual' ? <FileText className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                  {link.label || 'Resource'}
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PartDetailPage;
