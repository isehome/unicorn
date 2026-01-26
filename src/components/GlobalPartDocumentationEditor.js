import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FileText, Link as LinkIcon, Book, Trash2, Plus, Save, CheckCircle, Upload, FileCheck, Sparkles, AlertCircle } from 'lucide-react';
import Button from './ui/Button';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { sharePointStorageService } from '../services/sharePointStorageService';

/**
 * Component for managing documentation links on global parts
 * Supports: schematic URL, install manual URLs (array), technical manual URLs (array)
 */
const GlobalPartDocumentationEditor = ({ part, onSave, onCancel }) => {
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  const [schematicUrl, setSchematicUrl] = useState(part?.schematic_url || '');
  const [installManuals, setInstallManuals] = useState(
    part?.install_manual_urls || []
  );
  const [technicalManuals, setTechnicalManuals] = useState(
    part?.technical_manual_urls || []
  );
  const [newInstallManual, setNewInstallManual] = useState('');
  const [newTechnicalManual, setNewTechnicalManual] = useState('');

  // Submittal document state
  const [submittalPdfUrl, setSubmittalPdfUrl] = useState(part?.submittal_pdf_url || '');
  const [submittalSharepointUrl, setSubmittalSharepointUrl] = useState(part?.submittal_sharepoint_url || '');
  const [submittalSharepointDriveId, setSubmittalSharepointDriveId] = useState(part?.submittal_sharepoint_drive_id || '');
  const [submittalSharepointItemId, setSubmittalSharepointItemId] = useState(part?.submittal_sharepoint_item_id || '');
  const [uploadingSubmittal, setUploadingSubmittal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // AI Search state
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  const handleAddInstallManual = () => {
    if (newInstallManual.trim()) {
      setInstallManuals([...installManuals, newInstallManual.trim()]);
      setNewInstallManual('');
    }
  };

  const handleRemoveInstallManual = (index) => {
    setInstallManuals(installManuals.filter((_, i) => i !== index));
  };

  const handleEditInstallManual = (index, newUrl) => {
    const updated = [...installManuals];
    updated[index] = newUrl;
    setInstallManuals(updated);
  };

  const handleAddTechnicalManual = () => {
    if (newTechnicalManual.trim()) {
      setTechnicalManuals([...technicalManuals, newTechnicalManual.trim()]);
      setNewTechnicalManual('');
    }
  };

  const handleRemoveTechnicalManual = (index) => {
    setTechnicalManuals(technicalManuals.filter((_, i) => i !== index));
  };

  const handleEditTechnicalManual = (index, newUrl) => {
    const updated = [...technicalManuals];
    updated[index] = newUrl;
    setTechnicalManuals(updated);
  };

  // Handle submittal PDF file upload to SharePoint
  const handleSubmittalFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('pdf')) {
      setError('Please upload a PDF file for submittals');
      return;
    }

    setUploadingSubmittal(true);
    setError(null);

    try {
      // Create folder name from part info
      const folderName = `submittals/${part.manufacturer || 'Unknown'}/${part.part_number || part.id}`;

      // Upload to SharePoint
      const result = await sharePointStorageService.uploadFile(file, folderName);

      if (result) {
        setSubmittalSharepointUrl(result.webUrl || result.url);
        setSubmittalSharepointDriveId(result.driveId);
        setSubmittalSharepointItemId(result.itemId);
      }
    } catch (err) {
      console.error('Failed to upload submittal:', err);
      setError('Failed to upload submittal PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingSubmittal(false);
    }
  };

  // Clear uploaded submittal
  const handleClearSubmittalUpload = () => {
    setSubmittalSharepointUrl('');
    setSubmittalSharepointDriveId('');
    setSubmittalSharepointItemId('');
  };

  // AI Search for data using Manus (Vercel Pro 5-minute timeout)
  const handleSearchForData = async () => {
    if (!part?.id) {
      setError('No part ID provided');
      return;
    }

    setSearching(true);
    setError(null);
    setSearchResult(null);

    try {
      const response = await fetch('/api/enrich-single-part-manus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partId: part.id })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Search failed');
      }

      setSearchResult(result);

      // Dispatch event to refresh parts list
      window.dispatchEvent(new CustomEvent('ai-review-completed'));

    } catch (err) {
      console.error('AI search failed:', err);
      setError(err.message || 'Failed to search for data');
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    if (!part?.id) {
      setError('No part ID provided');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Use RPC function to bypass RLS issues (same pattern as prewire toggle)
      const { data, error: updateError } = await supabase.rpc('update_global_part', {
        p_part_id: part.id,
        p_schematic_url: schematicUrl.trim() || null,
        p_install_manual_urls: installManuals.length > 0 ? installManuals : null,
        p_technical_manual_urls: technicalManuals.length > 0 ? technicalManuals : null,
        // Submittal document fields
        p_submittal_pdf_url: submittalPdfUrl.trim() || null,
        p_submittal_sharepoint_url: submittalSharepointUrl || null,
        p_submittal_sharepoint_drive_id: submittalSharepointDriveId || null,
        p_submittal_sharepoint_item_id: submittalSharepointItemId || null
      });

      if (updateError) throw updateError;

      // Show success message
      setSuccess(true);

      if (onSave && data) {
        onSave(data);
      }
    } catch (err) {
      console.error('Failed to save documentation:', err);
      setError(err.message || 'Failed to save documentation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-6 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Equipment Documentation</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage documentation links for {part?.name || 'this part'}
        </p>
        {part?.part_number && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Part #: {part.part_number}
          </p>
        )}
      </div>

      {/* AI Search for Data Section */}
      <div className={`rounded-lg border p-4 ${
        isDark ? 'border-blue-800 bg-blue-900/20' : 'border-blue-200 bg-blue-50'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                AI-Powered Data Search
              </span>
            </div>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Search manufacturer websites to find power specs, port info, manuals, and more
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={handleSearchForData}
            disabled={searching}
            className="!bg-blue-600 !text-white hover:!bg-blue-700 dark:!bg-blue-500 dark:hover:!bg-blue-600"
          >
            {searching ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Searching...
              </span>
            ) : (
              'Search for Data'
            )}
          </Button>
        </div>

        {/* Search Result */}
        {searchResult && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Data found! Confidence: {Math.round((searchResult.confidence || 0) * 100)}%
                </p>
                {searchResult.notes && (
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    {searchResult.notes}
                  </p>
                )}
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  Part is now ready for AI Review. Close this modal and click "Review AI" to see the data.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Documentation saved successfully! Links are now active.
        </div>
      )}

      {/* Schematic URL */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-violet-500" />
          Schematic / Wiring Diagram
        </label>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={schematicUrl}
            onChange={(e) => setSchematicUrl(e.target.value)}
            placeholder="https://example.com/schematic.pdf"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
          />
          {schematicUrl && (
            <a
              href={schematicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-2 text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded"
              title="Open link"
            >
              <LinkIcon className="h-4 w-4" />
            </a>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Single URL for the equipment schematic or wiring diagram
        </p>
      </div>

      {/* Install Manuals */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Book className="h-4 w-4 text-blue-500" />
          Installation Manuals
        </label>
        
        {/* List of existing manuals - Editable */}
        {installManuals.length > 0 && (
          <div className="space-y-2">
            {installManuals.map((url, index) => (
              <div
                key={index}
                className="flex items-center gap-2"
              >
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleEditInstallManual(index, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
                />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                  title="Open link"
                >
                  <LinkIcon className="h-4 w-4" />
                </a>
                <button
                  onClick={() => handleRemoveInstallManual(index)}
                  className="shrink-0 p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  type="button"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new manual */}
        <div className="flex gap-2">
          <input
            type="url"
            value={newInstallManual}
            onChange={(e) => setNewInstallManual(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddInstallManual();
              }
            }}
            placeholder="https://example.com/install-guide.pdf"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={handleAddInstallManual}
            disabled={!newInstallManual.trim()}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add multiple URLs for installation manuals and guides
        </p>
      </div>

      {/* Technical Manuals */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Book className="h-4 w-4 text-green-500" />
          Technical Manuals & Datasheets
        </label>
        
        {/* List of existing manuals - Editable */}
        {technicalManuals.length > 0 && (
          <div className="space-y-2">
            {technicalManuals.map((url, index) => (
              <div
                key={index}
                className="flex items-center gap-2"
              >
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleEditTechnicalManual(index, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
                />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                  title="Open link"
                >
                  <LinkIcon className="h-4 w-4" />
                </a>
                <button
                  onClick={() => handleRemoveTechnicalManual(index)}
                  className="shrink-0 p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  type="button"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new manual */}
        <div className="flex gap-2">
          <input
            type="url"
            value={newTechnicalManual}
            onChange={(e) => setNewTechnicalManual(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTechnicalManual();
              }
            }}
            placeholder="https://example.com/technical-specs.pdf"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={handleAddTechnicalManual}
            disabled={!newTechnicalManual.trim()}
          >
            Add
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add multiple URLs for technical manuals, datasheets, and specifications
        </p>
      </div>

      {/* Submittal Document Section */}
      <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <label className="flex items-center gap-2 text-sm font-medium">
          <FileCheck className="h-4 w-4 text-amber-500" />
          Submittal Document
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            (for end-of-project documentation)
          </span>
        </label>

        {/* External URL Option */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            External URL (manufacturer website)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={submittalPdfUrl}
              onChange={(e) => setSubmittalPdfUrl(e.target.value)}
              placeholder="https://manufacturer.com/product-submittal.pdf"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
            />
            {submittalPdfUrl && (
              <a
                href={submittalPdfUrl}
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
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <span className="text-xs text-gray-400">OR</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>

        {/* Upload Option */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Upload to SharePoint
          </label>

          {submittalSharepointUrl ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
              <FileCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="flex-1 text-sm text-amber-700 dark:text-amber-300 truncate">
                Submittal PDF uploaded
              </span>
              <a
                href={submittalSharepointUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                title="View file"
              >
                <LinkIcon className="h-4 w-4" />
              </a>
              <button
                onClick={handleClearSubmittalUpload}
                className="p-1 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                type="button"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="flex-1">
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

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Submittal documents are product spec sheets included in end-of-project documentation packages
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={Save}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Documentation'}
        </Button>
      </div>
    </div>
  );
};

GlobalPartDocumentationEditor.propTypes = {
  part: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    part_number: PropTypes.string,
    manufacturer: PropTypes.string,
    schematic_url: PropTypes.string,
    install_manual_urls: PropTypes.arrayOf(PropTypes.string),
    technical_manual_urls: PropTypes.arrayOf(PropTypes.string),
    submittal_pdf_url: PropTypes.string,
    submittal_sharepoint_url: PropTypes.string,
    submittal_sharepoint_drive_id: PropTypes.string,
    submittal_sharepoint_item_id: PropTypes.string
  }).isRequired,
  onSave: PropTypes.func,
  onCancel: PropTypes.func
};

export default GlobalPartDocumentationEditor;
