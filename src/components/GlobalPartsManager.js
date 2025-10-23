import React, { useState, useEffect } from 'react';
import { Search, FileText, Package, Edit2, Wrench } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import GlobalPartDocumentationEditor from './GlobalPartDocumentationEditor';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const GlobalPartsManager = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'prewire', 'trim'

  useEffect(() => {
    loadParts();
  }, []);

  useEffect(() => {
    let filtered = parts;

    // Apply phase filter
    if (filter === 'prewire') {
      filtered = filtered.filter(part => part.required_for_prewire === true);
    } else if (filter === 'trim') {
      filtered = filtered.filter(part => part.required_for_prewire !== true);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (part) =>
          part.part_number?.toLowerCase().includes(query) ||
          part.name?.toLowerCase().includes(query) ||
          part.manufacturer?.toLowerCase().includes(query) ||
          part.model?.toLowerCase().includes(query)
      );
    }

    setFilteredParts(filtered);
  }, [searchQuery, parts, filter]);

  const loadParts = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('global_parts')
        .select('*')
        .order('part_number', { ascending: true });

      if (fetchError) throw fetchError;

      setParts(data || []);
      setFilteredParts(data || []);
    } catch (err) {
      console.error('Failed to load global parts:', err);
      setError(err.message || 'Failed to load parts');
    } finally {
      setLoading(false);
    }
  };

  const handleEditDocumentation = (part) => {
    setSelectedPart(part);
    setShowEditor(true);
  };

  const handleSaveDocumentation = (updatedPart) => {
    setParts((prev) =>
      prev.map((p) => (p.id === updatedPart.id ? updatedPart : p))
    );
    setShowEditor(false);
    setSelectedPart(null);
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setSelectedPart(null);
  };

  const handleTogglePrewire = async (part, newValue) => {
    try {
      const { error } = await supabase
        .from('global_parts')
        .update({ required_for_prewire: newValue })
        .eq('id', part.id);

      if (error) throw error;

      // Update local state
      setParts(prev =>
        prev.map(p =>
          p.id === part.id ? { ...p, required_for_prewire: newValue } : p
        )
      );
    } catch (err) {
      console.error('Failed to update prewire status:', err);
      alert('Failed to update prewire status: ' + err.message);
    }
  };

  const getDocumentationStatus = (part) => {
    const hasSchematic = !!part.schematic_url;
    const hasInstall = part.install_manual_urls?.length > 0;
    const hasTechnical = part.technical_manual_urls?.length > 0;
    const count = [hasSchematic, hasInstall, hasTechnical].filter(Boolean).length;
    return { count, hasSchematic, hasInstall, hasTechnical };
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading parts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Global Parts Catalog
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage documentation for equipment parts across all projects
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by part number, name, manufacturer, or model..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
          />
        </div>

        {/* Phase Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            All Parts
          </button>
          <button
            onClick={() => setFilter('prewire')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'prewire'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Prewire Prep
          </button>
          <button
            onClick={() => setFilter('trim')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'trim'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Trim Prep
          </button>
        </div>
      </div>

      {/* Parts List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredParts.map((part) => {
          const docStatus = getDocumentationStatus(part);
          return (
            <div
              key={part.id}
              style={sectionStyles.card}
              className="flex flex-col space-y-3 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-violet-500" />
                    <h3 className="truncate font-medium text-gray-900 dark:text-white">
                      {part.name || 'Unnamed Part'}
                    </h3>
                    {part.required_for_prewire && (
                      <span className="shrink-0 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Prewire
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {part.part_number}
                  </p>
                  {part.manufacturer && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {part.manufacturer}
                      {part.model && ` • ${part.model}`}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={() => handleEditDocumentation(part)}
                >
                  Edit Docs
                </Button>
              </div>

              {/* Prewire Classification Toggle */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Required for Prewire</span>
                </div>
                <button
                  onClick={() => handleTogglePrewire(part, !part.required_for_prewire)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    part.required_for_prewire
                      ? 'bg-orange-600 dark:bg-orange-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      part.required_for_prewire ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Documentation Status */}
              <div className="flex items-center gap-3 text-xs">
                <div
                  className={`flex items-center gap-1 ${
                    docStatus.hasSchematic
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span>Schematic</span>
                </div>
                <div
                  className={`flex items-center gap-1 ${
                    docStatus.hasInstall
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400'
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span>
                    Install ({part.install_manual_urls?.length || 0})
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1 ${
                    docStatus.hasTechnical
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span>
                    Tech ({part.technical_manual_urls?.length || 0})
                  </span>
                </div>
              </div>

              {docStatus.count > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {docStatus.count} of 3 documentation types added
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredParts.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
            {searchQuery ? 'No parts found' : 'No parts in catalog'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'Parts will appear here after importing equipment from project CSVs'}
          </p>
        </div>
      )}

      {/* Documentation Editor Modal */}
      {showEditor && selectedPart && (
        <Modal isOpen={showEditor} onClose={handleCancelEdit} size="lg">
          <GlobalPartDocumentationEditor
            part={selectedPart}
            onSave={handleSaveDocumentation}
            onCancel={handleCancelEdit}
          />
        </Modal>
      )}
    </div>
  );
};

export default GlobalPartsManager;
