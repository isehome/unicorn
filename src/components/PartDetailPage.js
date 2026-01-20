import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Trash2,
  Plus,
  AlertCircle,
  Loader2,
  FileCheck,
  Link as LinkIcon,
  Upload,
  Server,
  Layers,
  Zap,
  Plug,
} from 'lucide-react';
import Button from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';
import { partsService } from '../services/partsService';
import { queryKeys } from '../lib/queryClient';
import { sharePointStorageService } from '../services/sharePointStorageService';

const PartDetailPage = () => {
  const { partId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const [formState, setFormState] = useState(null);
  const [formError, setFormError] = useState('');
  const [uploadingSubmittal, setUploadingSubmittal] = useState(false);

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
        schematic_url: part.schematic_url || '',
        install_manual_urls: Array.isArray(part.install_manual_urls) ? part.install_manual_urls : [],
        technical_manual_urls: Array.isArray(part.technical_manual_urls) ? part.technical_manual_urls : [],
        // Submittal document fields
        submittal_pdf_url: part.submittal_pdf_url || '',
        submittal_sharepoint_url: part.submittal_sharepoint_url || '',
        submittal_sharepoint_drive_id: part.submittal_sharepoint_drive_id || '',
        submittal_sharepoint_item_id: part.submittal_sharepoint_item_id || '',
        // Rack layout fields
        u_height: part.u_height || null,
        is_rack_mountable: part.is_rack_mountable === true,
        needs_shelf: part.needs_shelf === true,
        shelf_u_height: part.shelf_u_height || null,
        max_items_per_shelf: part.max_items_per_shelf || 1,
        exclude_from_rack: part.exclude_from_rack === true,
        // Power fields
        power_watts: part.power_watts || null,
        power_outlets: part.power_outlets || 1,
        is_power_device: part.is_power_device === true,
        power_outlets_provided: part.power_outlets_provided || null,
        ups_outlets_provided: part.ups_outlets_provided || null,
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
        schematic_url: updated.schematic_url || '',
        install_manual_urls: Array.isArray(updated.install_manual_urls) ? updated.install_manual_urls : [],
        technical_manual_urls: Array.isArray(updated.technical_manual_urls) ? updated.technical_manual_urls : [],
        // Submittal document fields
        submittal_pdf_url: updated.submittal_pdf_url || '',
        submittal_sharepoint_url: updated.submittal_sharepoint_url || '',
        submittal_sharepoint_drive_id: updated.submittal_sharepoint_drive_id || '',
        submittal_sharepoint_item_id: updated.submittal_sharepoint_item_id || '',
        // Rack layout fields
        u_height: updated.u_height || null,
        is_rack_mountable: updated.is_rack_mountable === true,
        needs_shelf: updated.needs_shelf === true,
        shelf_u_height: updated.shelf_u_height || null,
        max_items_per_shelf: updated.max_items_per_shelf || 1,
        exclude_from_rack: updated.exclude_from_rack === true,
        // Power fields
        power_watts: updated.power_watts || null,
        power_outlets: updated.power_outlets || 1,
        is_power_device: updated.is_power_device === true,
        power_outlets_provided: updated.power_outlets_provided || null,
        ups_outlets_provided: updated.ups_outlets_provided || null,
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
        'mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500',
      textArea:
        'mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500',
      sectionTitle: 'text-sm font-semibold uppercase tracking-wide text-violet-500',
      card: `rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 shadow-sm`,
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

  const handleUrlArrayChange = (field, index, value) => {
    setFormState((prev) => {
      const urls = [...(prev[field] || [])];
      urls[index] = value;
      return { ...prev, [field]: urls };
    });
  };

  const handleAddUrl = (field) => {
    setFormState((prev) => ({
      ...prev,
      [field]: [...(prev[field] || []), ''],
    }));
  };

  const handleRemoveUrl = (field, index) => {
    setFormState((prev) => {
      const urls = [...(prev[field] || [])];
      urls.splice(index, 1);
      return { ...prev, [field]: urls };
    });
  };

  // Handle submittal PDF file upload to SharePoint
  const handleSubmittalFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('pdf')) {
      setFormError('Please upload a PDF file for submittals');
      return;
    }

    setUploadingSubmittal(true);
    setFormError('');

    try {
      // Upload to SharePoint using the new global part document method
      // This uses the company SharePoint URL from Admin → Company Settings
      const result = await sharePointStorageService.uploadGlobalPartDocument(
        file,
        formState.manufacturer || 'Unknown',
        formState.part_number || partId,
        'submittals'
      );

      if (result) {
        setFormState((prev) => ({
          ...prev,
          submittal_sharepoint_url: result.webUrl || result.url,
          submittal_sharepoint_drive_id: result.driveId,
          submittal_sharepoint_item_id: result.itemId,
        }));
      }
    } catch (err) {
      console.error('Failed to upload submittal:', err);
      setFormError('Failed to upload submittal PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingSubmittal(false);
    }
  };

  // Clear uploaded submittal
  const handleClearSubmittalUpload = () => {
    setFormState((prev) => ({
      ...prev,
      submittal_sharepoint_url: '',
      submittal_sharepoint_drive_id: '',
      submittal_sharepoint_item_id: '',
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formState.part_number.trim()) {
      setFormError('Part number cannot be empty.');
      return;
    }

    setFormError('');
    
    // Create a copy of the form state and remove the obsolete JSON fields
    const { attributes, resource_links, ...updates } = formState;
    
    updateMutation.mutate(updates);
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
                : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300'
            }`}
          >
            {formState.is_wire_drop_visible ? 'Visible in wire drop selector' : 'Hidden from wire drop selector'}
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              formState.is_inventory_item
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300'
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
          <p className={styles.sectionTitle}>Documentation</p>
          <p className={styles.textSecondary}>
            Links to schematic, installation, and technical manuals.
          </p>

          <label className={styles.label}>
            Schematic URL
            <input
              type="url"
              value={formState.schematic_url || ''}
              onChange={(event) => handleFieldChange('schematic_url', event.target.value)}
              className={styles.input}
              placeholder="https://"
            />
          </label>

          <div>
            <label className={styles.label}>Installation Manual URLs</label>
            <div className="space-y-2 mt-1">
              {(formState.install_manual_urls || []).map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(event) => handleUrlArrayChange('install_manual_urls', index, event.target.value)}
                    className={styles.input}
                    placeholder="https://"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveUrl('install_manual_urls', index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              onClick={() => handleAddUrl('install_manual_urls')}
              className="mt-2"
            >
              Add Install Manual
            </Button>
          </div>

          <div>
            <label className={styles.label}>Technical Manual URLs</label>
            <div className="space-y-2 mt-1">
              {(formState.technical_manual_urls || []).map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(event) => handleUrlArrayChange('technical_manual_urls', index, event.target.value)}
                    className={styles.input}
                    placeholder="https://"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveUrl('technical_manual_urls', index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              onClick={() => handleAddUrl('technical_manual_urls')}
              className="mt-2"
            >
              Add Technical Manual
            </Button>
          </div>

          {/* Submittal Document Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className={styles.label + ' flex items-center gap-2'}>
              <FileCheck className="h-4 w-4 text-amber-500" />
              Submittal Document
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                (for end-of-project documentation)
              </span>
            </label>

            {/* External URL Option */}
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                External URL (manufacturer website)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="url"
                  value={formState.submittal_pdf_url || ''}
                  onChange={(event) => handleFieldChange('submittal_pdf_url', event.target.value)}
                  className={styles.input}
                  placeholder="https://manufacturer.com/product-submittal.pdf"
                />
                {formState.submittal_pdf_url && (
                  <a
                    href={formState.submittal_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-2 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                    title="Open link"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
              <span className="text-xs text-gray-400">OR</span>
              <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
            </div>

            {/* Upload Option */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Upload to SharePoint
              </label>

              {formState.submittal_sharepoint_url ? (
                <div className="flex items-center gap-2 mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                  <FileCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="flex-1 text-sm text-amber-700 dark:text-amber-300 truncate">
                    Submittal PDF uploaded
                  </span>
                  <a
                    href={formState.submittal_sharepoint_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                    title="View file"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={handleClearSubmittalUpload}
                    className="p-1 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <label className="block">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleSubmittalFileUpload}
                      disabled={uploadingSubmittal}
                      className="hidden"
                    />
                    <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-colors dark:border-gray-600 dark:bg-zinc-800/50 dark:hover:border-amber-500 dark:hover:bg-amber-900/20">
                      {uploadingSubmittal ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Click to upload submittal PDF
                          </span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Submittal documents are product spec sheets included in end-of-project documentation packages
            </p>
          </div>
        </div>

        {/* Rack Layout Section */}
        <div className={styles.card + ' p-6 space-y-4'}>
          <p className={styles.sectionTitle}>Rack Layout</p>
          <p className={styles.textSecondary}>
            Configure how this part appears in the head-end rack layout view.
          </p>

          <div className="space-y-4">
            {/* Rack Mountable Option */}
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={Boolean(formState.is_rack_mountable)}
                    onChange={(event) => {
                      handleFieldChange('is_rack_mountable', event.target.checked);
                      if (event.target.checked) {
                        handleFieldChange('needs_shelf', false);
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <Server className="h-4 w-4 text-zinc-500" />
                  <span>Rack-mountable equipment</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Equipment that mounts directly in a standard 19" rack
                </p>
              </div>
              {formState.is_rack_mountable && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Height:</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => handleFieldChange('u_height', u)}
                        className={`w-9 h-9 rounded text-sm font-medium transition-colors ${
                          formState.u_height === u
                            ? 'bg-violet-600 text-white'
                            : 'bg-zinc-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                        }`}
                      >
                        {u}U
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Needs Shelf Option */}
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={Boolean(formState.needs_shelf)}
                    onChange={(event) => {
                      handleFieldChange('needs_shelf', event.target.checked);
                      if (event.target.checked) {
                        handleFieldChange('is_rack_mountable', false);
                        if (!formState.shelf_u_height) {
                          handleFieldChange('shelf_u_height', 2);
                        }
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span>Needs shelf space</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Equipment that sits on a shelf inside the rack (not rack-mountable)
                </p>
              </div>
            </div>

            {/* Shelf Settings (shown when needs_shelf is true) */}
            {formState.needs_shelf && (
              <div className="ml-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm text-blue-700 dark:text-blue-300 w-32">Shelf height:</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => handleFieldChange('shelf_u_height', u)}
                        className={`w-9 h-9 rounded text-sm font-medium transition-colors ${
                          formState.shelf_u_height === u
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-zinc-600 border border-blue-200 dark:border-blue-700'
                        }`}
                      >
                        {u}U
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm text-blue-700 dark:text-blue-300 w-32">Items per shelf:</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleFieldChange('max_items_per_shelf', n)}
                        className={`w-9 h-9 rounded text-sm font-medium transition-colors ${
                          formState.max_items_per_shelf === n
                            ? 'bg-violet-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-zinc-600 border border-blue-200 dark:border-blue-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {formState.max_items_per_shelf > 1
                    ? `Up to ${formState.max_items_per_shelf} of these can fit side-by-side on a ${formState.shelf_u_height}U shelf`
                    : 'One item per shelf'}
                </p>
              </div>
            )}

            {/* Exclude from Rack Option */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(formState.exclude_from_rack)}
                  onChange={(event) => handleFieldChange('exclude_from_rack', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-red-600 dark:text-red-400">Exclude from rack layout</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                Hide this part type from the rack layout view entirely (e.g., cables, accessories)
              </p>
            </div>
          </div>
        </div>

        {/* Power Section */}
        <div className={styles.card + ' p-6 space-y-4'}>
          <p className={styles.sectionTitle}>Power Requirements</p>
          <p className={styles.textSecondary}>
            Configure power consumption and outlet requirements for this equipment.
          </p>

          <div className="space-y-4">
            {/* Power Consumption */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={styles.label + ' flex items-center gap-2'}>
                  <Zap className="h-4 w-4 text-amber-500" />
                  Power Consumption (Watts)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formState.power_watts || ''}
                  onChange={(event) => handleFieldChange('power_watts', event.target.value ? Number(event.target.value) : null)}
                  className={styles.input}
                  placeholder="e.g., 150"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Typical power draw in watts
                </p>
              </div>
              <div>
                <label className={styles.label + ' flex items-center gap-2'}>
                  <Plug className="h-4 w-4 text-zinc-500" />
                  Power Outlets Required
                </label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleFieldChange('power_outlets', n)}
                      className={`w-10 h-10 rounded text-sm font-medium transition-colors ${
                        formState.power_outlets === n
                          ? 'bg-zinc-600 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Number of power outlets this device needs
                </p>
              </div>
            </div>

            {/* Power Device Option */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(formState.is_power_device)}
                  onChange={(event) => {
                    handleFieldChange('is_power_device', event.target.checked);
                    if (!event.target.checked) {
                      handleFieldChange('power_outlets_provided', null);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <Zap className="h-4 w-4 text-amber-500" />
                <span>This is a power distribution device</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                Check this for UPS units, power conditioners, PDUs, or other devices that provide power outlets
              </p>
            </div>

            {/* Power Outlets Provided (shown when is_power_device is true) */}
            {formState.is_power_device && (
              <div className="ml-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Standard/Surge Protected Outlets */}
                  <div>
                    <label className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <Plug className="h-4 w-4" />
                      Surge Protected Outlets
                    </label>
                    <select
                      value={formState.power_outlets_provided || ''}
                      onChange={(event) => handleFieldChange('power_outlets_provided', event.target.value ? Number(event.target.value) : null)}
                      className="mt-2 w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">None</option>
                      {Array.from({ length: 42 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'outlet' : 'outlets'}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Power conditioning / surge protection only
                    </p>
                  </div>

                  {/* UPS Battery Backup Outlets */}
                  <div>
                    <label className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Battery Backup Outlets
                    </label>
                    <select
                      value={formState.ups_outlets_provided || ''}
                      onChange={(event) => handleFieldChange('ups_outlets_provided', event.target.value ? Number(event.target.value) : null)}
                      className="mt-2 w-full rounded-lg border border-green-300 dark:border-green-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">None</option>
                      {Array.from({ length: 42 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'outlet' : 'outlets'}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      UPS battery backup + surge protection
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-amber-200 dark:border-amber-700 pt-3">
                  {(formState.power_outlets_provided || 0) + (formState.ups_outlets_provided || 0) > 0
                    ? `Total: ${(formState.power_outlets_provided || 0) + (formState.ups_outlets_provided || 0)} outlets (${formState.ups_outlets_provided || 0} with battery backup)`
                    : 'Configure the number of outlets this device provides'}
                </p>
              </div>
            )}
          </div>
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
    </div>
  );
};

export default PartDetailPage;
