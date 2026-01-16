import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, Package, Edit2, Wrench, ExternalLink, Sparkles, CheckCircle } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import GlobalPartDocumentationEditor from './GlobalPartDocumentationEditor';
import { supabase } from '../lib/supabase';
import { partsService } from '../services/partsService';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';

const GlobalPartsManager = () => {
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'prewire', 'trim', 'new'
  const [editingInventory, setEditingInventory] = useState(null); // { partId, quantity }
  const [savingInventory, setSavingInventory] = useState(null); // partId being saved
  const [newPartsCount, setNewPartsCount] = useState(0);
  const [markingAllReviewed, setMarkingAllReviewed] = useState(false);

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
    } else if (filter === 'new') {
      filtered = filtered.filter(part => part.needs_review === true);
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

    // Update new parts count
    const newCount = parts.filter(p => p.needs_review === true).length;
    setNewPartsCount(newCount);
  }, [searchQuery, parts, filter]);

  const loadParts = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('global_parts')
        .select(`
          id,
          part_number,
          name,
          manufacturer,
          model,
          category,
          unit_of_measure,
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire,
          schematic_url,
          install_manual_urls,
          technical_manual_urls,
          submittal_pdf_url,
          submittal_sharepoint_url,
          submittal_sharepoint_drive_id,
          submittal_sharepoint_item_id,
          quantity_on_hand,
          reorder_point,
          warehouse_location,
          needs_review
        `)
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
      prev.map((p) => 
        p.id === updatedPart.id 
          ? { ...p, ...updatedPart } // Merge instead of replace to preserve any recent changes
          : p
      )
    );
    setShowEditor(false);
    setSelectedPart(null);
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setSelectedPart(null);
  };

  const handleTogglePrewire = useCallback(async (part, newValue) => {
    try {
      // Use RPC function to bypass RLS issues
      const { data, error } = await supabase.rpc('update_part_prewire_status', {
        p_part_id: part.id,
        p_required_for_prewire: newValue
      });

      if (error) {
        console.error('Failed to update prewire status:', error);
        throw error;
      }

      // Update local state with the value from RPC
      const updatedValue = data?.required_for_prewire ?? newValue;

      setParts(prev =>
        prev.map(p =>
          p.id === part.id ? { ...p, required_for_prewire: updatedValue } : p
        )
      );

      // Update selected part if it's currently open in editor
      setSelectedPart(prev => {
        if (prev && prev.id === part.id) {
          return { ...prev, required_for_prewire: updatedValue };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to update prewire status:', err);
      alert('Failed to update prewire status: ' + err.message);
    }
  }, []);

  const handleUpdateInventory = useCallback(async (partId, newQuantity) => {
    try {
      setSavingInventory(partId);

      const qty = Math.max(0, parseInt(newQuantity) || 0);

      const { error } = await supabase
        .from('global_parts')
        .update({
          quantity_on_hand: qty,
          last_inventory_check: new Date().toISOString()
        })
        .eq('id', partId);

      if (error) throw error;

      // Update local state
      setParts(prev =>
        prev.map(p =>
          p.id === partId ? { ...p, quantity_on_hand: qty } : p
        )
      );

      setEditingInventory(null);
    } catch (err) {
      console.error('Failed to update inventory:', err);
      alert('Failed to update inventory: ' + err.message);
    } finally {
      setSavingInventory(null);
    }
  }, []);

  const getDocumentationStatus = (part) => {
    const hasSchematic = !!part.schematic_url;
    const hasInstall = part.install_manual_urls?.length > 0;
    const hasTechnical = part.technical_manual_urls?.length > 0;
    const count = [hasSchematic, hasInstall, hasTechnical].filter(Boolean).length;
    return { count, hasSchematic, hasInstall, hasTechnical };
  };

  const handleMarkPartReviewed = useCallback(async (partId) => {
    try {
      await partsService.markPartReviewed(partId);

      // Update local state
      setParts(prev =>
        prev.map(p =>
          p.id === partId ? { ...p, needs_review: false } : p
        )
      );

      // Dispatch event to update navigation badge
      window.dispatchEvent(new CustomEvent('parts-reviewed'));
    } catch (err) {
      console.error('Failed to mark part as reviewed:', err);
      alert('Failed to mark part as reviewed: ' + err.message);
    }
  }, []);

  const handleMarkAllReviewed = useCallback(async () => {
    try {
      setMarkingAllReviewed(true);
      await partsService.markAllPartsReviewed();

      // Update local state
      setParts(prev =>
        prev.map(p => ({ ...p, needs_review: false }))
      );

      // If we're on the "new" filter, switch to "all" since there won't be any new parts
      if (filter === 'new') {
        setFilter('all');
      }

      // Dispatch event to update navigation badge
      window.dispatchEvent(new CustomEvent('parts-reviewed'));
    } catch (err) {
      console.error('Failed to mark all parts as reviewed:', err);
      alert('Failed to mark all parts as reviewed: ' + err.message);
    } finally {
      setMarkingAllReviewed(false);
    }
  }, [filter]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    const prewireCount = parts.filter(p => p.required_for_prewire === true).length;
    const trimCount = parts.filter(p => p.required_for_prewire !== true).length;

    publishState({
      view: 'global-parts-manager',
      searchQuery: searchQuery,
      filter: filter,
      stats: {
        total: parts.length,
        filtered: filteredParts.length,
        prewire: prewireCount,
        trim: trimCount
      },
      parts: filteredParts.slice(0, 10).map(p => ({
        id: p.id,
        partNumber: p.part_number,
        name: p.name,
        manufacturer: p.manufacturer,
        model: p.model,
        category: p.category,
        requiredForPrewire: p.required_for_prewire,
        quantityOnHand: p.quantity_on_hand || 0
      })),
      hint: 'Global parts catalog page. Can search parts, filter by prewire/trim phase, edit part documentation, update inventory, or toggle prewire status.'
    });
  }, [publishState, parts, filteredParts, searchQuery, filter]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_parts: async ({ query }) => {
        if (typeof query === 'string') {
          setSearchQuery(query);
          return { success: true, message: query ? `Searching for "${query}"` : 'Cleared search' };
        }
        return { success: false, error: 'Invalid search query' };
      },
      filter_by_category: async ({ category }) => {
        if (['all', 'prewire', 'trim'].includes(category)) {
          setFilter(category);
          return { success: true, message: `Filtering by category: ${category}` };
        }
        return { success: false, error: 'Invalid category. Use: all, prewire, or trim' };
      },
      add_part: async () => {
        // Note: GlobalPartsManager doesn't have a built-in add part modal
        // Parts are typically added via CSV import from projects
        return { success: false, error: 'Parts are added via CSV import from projects. Navigate to a project and import equipment.' };
      },
      edit_part: async ({ partName, partId, partNumber }) => {
        const part = partName
          ? parts.find(p => p.name?.toLowerCase().includes(partName.toLowerCase()))
          : partNumber
          ? parts.find(p => p.part_number?.toLowerCase().includes(partNumber.toLowerCase()))
          : parts.find(p => p.id === partId);
        if (part) {
          setSelectedPart(part);
          setShowEditor(true);
          return { success: true, message: `Opening documentation editor for: ${part.name || part.part_number}` };
        }
        return { success: false, error: 'Part not found' };
      },
      delete_part: async () => {
        // Note: GlobalPartsManager doesn't support deleting parts directly
        return { success: false, error: 'Part deletion is not supported from this view. Parts are managed through project equipment.' };
      },
      toggle_prewire: async ({ partName, partId, partNumber, value }) => {
        const part = partName
          ? parts.find(p => p.name?.toLowerCase().includes(partName.toLowerCase()))
          : partNumber
          ? parts.find(p => p.part_number?.toLowerCase().includes(partNumber.toLowerCase()))
          : parts.find(p => p.id === partId);
        if (part) {
          const newValue = typeof value === 'boolean' ? value : !part.required_for_prewire;
          await handleTogglePrewire(part, newValue);
          return { success: true, message: `${newValue ? 'Marked' : 'Unmarked'} "${part.name || part.part_number}" as prewire part` };
        }
        return { success: false, error: 'Part not found' };
      },
      update_inventory: async ({ partName, partId, partNumber, quantity }) => {
        const part = partName
          ? parts.find(p => p.name?.toLowerCase().includes(partName.toLowerCase()))
          : partNumber
          ? parts.find(p => p.part_number?.toLowerCase().includes(partNumber.toLowerCase()))
          : parts.find(p => p.id === partId);
        if (part) {
          if (typeof quantity !== 'number' || quantity < 0) {
            return { success: false, error: 'Invalid quantity. Provide a non-negative number.' };
          }
          await handleUpdateInventory(part.id, quantity);
          return { success: true, message: `Updated inventory for "${part.name || part.part_number}" to ${quantity}` };
        }
        return { success: false, error: 'Part not found' };
      },
      list_parts: async () => {
        return {
          success: true,
          parts: filteredParts.slice(0, 10).map(p => ({
            name: p.name,
            partNumber: p.part_number,
            manufacturer: p.manufacturer,
            requiredForPrewire: p.required_for_prewire,
            quantityOnHand: p.quantity_on_hand || 0
          })),
          count: filteredParts.length
        };
      },
      clear_filters: async () => {
        setSearchQuery('');
        setFilter('all');
        return { success: true, message: 'Cleared all filters' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, parts, filteredParts, handleTogglePrewire, handleUpdateInventory]);

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
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-gray-600 dark:bg-zinc-800 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
          />
        </div>

        {/* Phase Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            All Parts
          </button>
          <button
            onClick={() => setFilter('new')}
            className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'new'
                ? 'bg-amber-500 text-white dark:bg-amber-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Show New
              {newPartsCount > 0 && (
                <span className={`ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  filter === 'new'
                    ? 'bg-white/20 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {newPartsCount > 99 ? '99+' : newPartsCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setFilter('prewire')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'prewire'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Prewire Prep
          </button>
          <button
            onClick={() => setFilter('trim')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'trim'
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Trim Prep
          </button>
        </div>
      </div>

      {/* Mark All Reviewed Button - shown when there are new parts */}
      {newPartsCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-800 dark:text-amber-200">
              {newPartsCount} new {newPartsCount === 1 ? 'part needs' : 'parts need'} review
            </span>
          </div>
          <button
            onClick={handleMarkAllReviewed}
            disabled={markingAllReviewed}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {markingAllReviewed ? 'Marking...' : 'Mark All Reviewed'}
          </button>
        </div>
      )}

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
                    {part.needs_review && (
                      <span className="shrink-0 flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Sparkles className="h-3 w-3" />
                        New
                      </span>
                    )}
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
                <div className="flex items-center gap-2">
                  {part.needs_review && (
                    <button
                      onClick={() => handleMarkPartReviewed(part.id)}
                      className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                      title="Mark as reviewed"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit2}
                    onClick={() => handleEditDocumentation(part)}
                  >
                    Edit Docs
                  </Button>
                </div>
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

              {/* Inventory Information - Editable */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Package className="h-3.5 w-3.5" />
                  <span>Stock on Hand:</span>
                </div>
                {editingInventory?.partId === part.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={editingInventory.quantity}
                      onChange={(e) => setEditingInventory({ partId: part.id, quantity: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUpdateInventory(part.id, editingInventory.quantity);
                        } else if (e.key === 'Escape') {
                          setEditingInventory(null);
                        }
                      }}
                      disabled={savingInventory === part.id}
                      className="w-20 px-2 py-1 text-sm border border-violet-300 dark:border-violet-600 rounded bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateInventory(part.id, editingInventory.quantity)}
                      disabled={savingInventory === part.id}
                      className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {savingInventory === part.id ? '...' : '✓'}
                    </button>
                    <button
                      onClick={() => setEditingInventory(null)}
                      disabled={savingInventory === part.id}
                      className="px-2 py-1 text-xs font-medium rounded bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingInventory({ partId: part.id, quantity: part.quantity_on_hand || 0 })}
                    className="group flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                  >
                    <span className={`text-sm font-semibold ${
                      (part.quantity_on_hand || 0) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {part.quantity_on_hand || 0}
                    </span>
                    <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>

              {/* Documentation Links - Clickable */}
              {docStatus.count > 0 ? (
                <div className="space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Documentation:</p>

                  {/* Schematic Link */}
                  {part.schematic_url && (
                    <a
                      href={part.schematic_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Schematic</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {/* Install Manuals */}
                  {part.install_manual_urls?.map((url, idx) => (
                    <a
                      key={`install-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Install Manual {part.install_manual_urls.length > 1 ? `#${idx + 1}` : ''}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}

                  {/* Technical Manuals */}
                  {part.technical_manual_urls?.map((url, idx) => (
                    <a
                      key={`tech-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Technical Manual {part.technical_manual_urls.length > 1 ? `#${idx + 1}` : ''}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No documentation added
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredParts.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-zinc-800">
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
