import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FileText, Link as LinkIcon, Book, Trash2, Plus, Save } from 'lucide-react';
import Button from './ui/Button';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleAddInstallManual = () => {
    if (newInstallManual.trim()) {
      setInstallManuals([...installManuals, newInstallManual.trim()]);
      setNewInstallManual('');
    }
  };

  const handleRemoveInstallManual = (index) => {
    setInstallManuals(installManuals.filter((_, i) => i !== index));
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

  const handleSave = async () => {
    if (!part?.id) {
      setError('No part ID provided');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from('global_parts')
        .update({
          schematic_url: schematicUrl.trim() || null,
          install_manual_urls: installManuals,
          technical_manual_urls: technicalManuals,
          updated_at: new Date().toISOString()
        })
        .eq('id', part.id)
        .select(`
          id,
          part_number,
          name,
          description,
          manufacturer,
          model,
          category,
          unit_of_measure,
          quantity_on_hand,
          quantity_reserved,
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire,
          schematic_url,
          install_manual_urls,
          technical_manual_urls
        `);

      if (updateError) throw updateError;

      if (onSave && data && data.length > 0) {
        onSave(data[0]);
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Schematic URL */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-violet-500" />
          Schematic / Wiring Diagram
        </label>
        <input
          type="url"
          value={schematicUrl}
          onChange={(e) => setSchematicUrl(e.target.value)}
          placeholder="https://example.com/schematic.pdf"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
        />
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
        
        {/* List of existing manuals */}
        {installManuals.length > 0 && (
          <div className="space-y-2">
            {installManuals.map((url, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              >
                <LinkIcon className="h-3 w-3 shrink-0 text-gray-400" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {url}
                </a>
                <button
                  onClick={() => handleRemoveInstallManual(index)}
                  className="shrink-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                  type="button"
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
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
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
        
        {/* List of existing manuals */}
        {technicalManuals.length > 0 && (
          <div className="space-y-2">
            {technicalManuals.map((url, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              >
                <LinkIcon className="h-3 w-3 shrink-0 text-gray-400" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {url}
                </a>
                <button
                  onClick={() => handleRemoveTechnicalManual(index)}
                  className="shrink-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                  type="button"
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
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
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
    schematic_url: PropTypes.string,
    install_manual_urls: PropTypes.arrayOf(PropTypes.string),
    technical_manual_urls: PropTypes.arrayOf(PropTypes.string)
  }).isRequired,
  onSave: PropTypes.func,
  onCancel: PropTypes.func
};

export default GlobalPartDocumentationEditor;
