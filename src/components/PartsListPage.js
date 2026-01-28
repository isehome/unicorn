import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { partsService } from '../services/partsService';
import Button from './ui/Button';
import Modal from './ui/Modal';
import GlobalPartDocumentationEditor from './GlobalPartDocumentationEditor';
import GlobalPartAIReviewModal from './GlobalPartAIReviewModal';
import {
  Boxes,
  Plus,
  Search,
  AlertCircle,
  Wrench,
  ClipboardList,
  X,
  Sparkles,
  CheckCircle,
  Bot,
  FileText,
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
  const [inventoryMode, setInventoryMode] = useState(false);
  const [editedParts, setEditedParts] = useState({});
  const [editedInventory, setEditedInventory] = useState({}); // { partId: quantity }
  const [phaseFilter, setPhaseFilter] = useState('all'); // 'all', 'prewire', 'trim', 'new', 'ai_review'
  const [markingAllReviewed, setMarkingAllReviewed] = useState(false);
  // Documentation & AI Review state
  const [selectedPartForDocs, setSelectedPartForDocs] = useState(null);
  const [showDocsEditor, setShowDocsEditor] = useState(false);
  const [selectedPartForAIReview, setSelectedPartForAIReview] = useState(null);
  const [showAIReview, setShowAIReview] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();

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

  const updateInventoryMutation = useMutation({
    mutationFn: async (inventoryUpdates) => {
      // Update all inventory quantities in parallel
      const promises = Object.entries(inventoryUpdates).map(([partId, quantity]) =>
        partsService.update(partId, { quantity_on_hand: quantity })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      setInventoryMode(false);
      setEditedInventory({});
    },
    onError: (mutationError) => {
      setFormError(mutationError.message || 'Failed to update inventory.');
    },
  });

  const styles = useMemo(() => {
    const palette = theme.palette;
    const backgroundPrimary = mode === 'dark' ? '#18181B' : '#FFFFFF';
    const backgroundMuted = mode === 'dark' ? '#27272A' : '#F9FAFB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#D1D5DB' : '#4B5563';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';

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
    let filtered = parts;

    // Apply phase filter
    if (phaseFilter === 'prewire') {
      filtered = filtered.filter(part => part.required_for_prewire === true);
    } else if (phaseFilter === 'trim') {
      filtered = filtered.filter(part => part.required_for_prewire !== true);
    } else if (phaseFilter === 'new') {
      filtered = filtered.filter(part => part.needs_review === true);
    } else if (phaseFilter === 'ai_review') {
      filtered = filtered.filter(part => part.ai_enrichment_status === 'needs_review');
    }

    // Apply search filter
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter((part) => {
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
    }

    return filtered;
  }, [parts, search, phaseFilter]);

  // Get unique categories for filtering
  const categories = useMemo(() => {
    const cats = new Set(parts.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [parts]);

  // Count new parts needing review
  const newPartsCount = useMemo(() => {
    return parts.filter(p => p.needs_review === true).length;
  }, [parts]);

  // Count parts needing AI review
  const aiReviewCount = useMemo(() => {
    return parts.filter(p => p.ai_enrichment_status === 'needs_review').length;
  }, [parts]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'parts-list',
      stats: {
        total: parts.length,
        visible: filteredParts.length,
        prewireCount: parts.filter(p => p.required_for_prewire === true).length,
        trimCount: parts.filter(p => p.required_for_prewire !== true).length
      },
      filters: {
        search: search,
        phase: phaseFilter
      },
      categories: categories,
      editMode: editMode,
      inventoryMode: inventoryMode,
      visibleParts: filteredParts.slice(0, 10).map(p => ({
        id: p.id,
        partNumber: p.part_number,
        name: p.name,
        manufacturer: p.manufacturer,
        category: p.category,
        quantityAvailable: p.quantity_available ?? p.quantity_on_hand ?? 0
      })),
      hint: 'Parts catalog page. Search/filter parts by name, number, manufacturer, category. Can filter by phase (prewire/trim).'
    });
  }, [publishState, parts, filteredParts, search, phaseFilter, categories, editMode, inventoryMode]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_parts: async ({ query }) => {
        setSearch(query || '');
        return { success: true, message: query ? `Searching for: ${query}` : 'Search cleared' };
      },
      filter_by_category: async ({ category }) => {
        // Since parts don't have a dedicated category filter state, we'll use search
        if (!category || category === 'all') {
          setSearch('');
          return { success: true, message: 'Showing all parts' };
        }
        const matchedCategory = categories.find(c => c.toLowerCase().includes(category.toLowerCase()));
        if (matchedCategory) {
          setSearch(matchedCategory);
          return { success: true, message: `Filtering by category: ${matchedCategory}` };
        }
        return { success: false, error: `Category not found. Available: ${categories.join(', ')}` };
      },
      filter_by_phase: async ({ phase }) => {
        if (['all', 'prewire', 'trim'].includes(phase)) {
          setPhaseFilter(phase);
          return { success: true, message: `Filtering by phase: ${phase}` };
        }
        return { success: false, error: 'Invalid phase. Use: all, prewire, or trim' };
      },
      open_part_detail: async ({ partName, partNumber }) => {
        const part = filteredParts.find(p => {
          if (partNumber && p.part_number?.toLowerCase().includes(partNumber.toLowerCase())) return true;
          if (partName && (p.name?.toLowerCase().includes(partName.toLowerCase()) ||
                          p.model?.toLowerCase().includes(partName.toLowerCase()))) return true;
          return false;
        });
        if (part) {
          navigate(`/parts/${part.id}`);
          return { success: true, message: `Opening part: ${part.name || part.part_number}` };
        }
        return { success: false, error: 'Part not found' };
      },
      list_parts_by_manufacturer: async ({ manufacturer }) => {
        if (!manufacturer) {
          return { success: false, error: 'Please specify a manufacturer' };
        }
        const matchingParts = parts.filter(p =>
          p.manufacturer?.toLowerCase().includes(manufacturer.toLowerCase())
        );
        if (matchingParts.length > 0) {
          setSearch(manufacturer);
          return {
            success: true,
            message: `Found ${matchingParts.length} parts from ${manufacturer}`,
            parts: matchingParts.slice(0, 10).map(p => ({ name: p.name, partNumber: p.part_number }))
          };
        }
        return { success: false, error: `No parts found from manufacturer: ${manufacturer}` };
      },
      clear_filters: async () => {
        setSearch('');
        setPhaseFilter('all');
        return { success: true, message: 'All filters cleared' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, filteredParts, parts, categories, navigate]);

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
      // Enter edit mode (exit inventory mode if active)
      setInventoryMode(false);
      setEditedInventory({});
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

  const handlePrewireToggle = useCallback((partId, currentValue) => {
    setEditedParts((prev) => ({
      ...prev,
      [partId]: {
        ...prev[partId],
        required_for_prewire: !currentValue,
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

  const toggleInventoryMode = useCallback(() => {
    if (inventoryMode) {
      // Cancel inventory mode
      setEditedInventory({});
      setInventoryMode(false);
    } else {
      // Enter inventory mode (exit edit mode if active)
      setEditMode(false);
      setEditedParts({});
      setInventoryMode(true);
    }
  }, [inventoryMode]);

  const handleInventoryChange = useCallback((partId, quantity) => {
    const numQty = Math.max(0, parseInt(quantity) || 0);
    setEditedInventory((prev) => ({
      ...prev,
      [partId]: numQty,
    }));
  }, []);

  const handleSaveInventory = useCallback(() => {
    if (Object.keys(editedInventory).length === 0) {
      setInventoryMode(false);
      return;
    }
    updateInventoryMutation.mutate(editedInventory);
  }, [editedInventory, updateInventoryMutation]);

  const handleMarkPartReviewed = useCallback(async (partId) => {
    try {
      await partsService.markPartReviewed(partId);
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      // Dispatch event to update navigation badge
      window.dispatchEvent(new CustomEvent('parts-reviewed'));
    } catch (err) {
      console.error('Failed to mark part as reviewed:', err);
    }
  }, [queryClient]);

  const handleMarkAllReviewed = useCallback(async () => {
    setMarkingAllReviewed(true);
    try {
      await partsService.markAllPartsReviewed();
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
      // Dispatch event to update navigation badge
      window.dispatchEvent(new CustomEvent('parts-reviewed'));
      // Switch back to all parts view
      setPhaseFilter('all');
    } catch (err) {
      console.error('Failed to mark all parts as reviewed:', err);
    } finally {
      setMarkingAllReviewed(false);
    }
  }, [queryClient]);

  // Documentation Editor handlers
  const handleOpenDocsEditor = useCallback((part, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSelectedPartForDocs(part);
    setShowDocsEditor(true);
  }, []);

  const handleSaveDocumentation = useCallback((updatedPart) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.parts });
    setShowDocsEditor(false);
    setSelectedPartForDocs(null);
  }, [queryClient]);

  const handleCancelDocsEditor = useCallback(() => {
    setShowDocsEditor(false);
    setSelectedPartForDocs(null);
  }, []);

  // AI Review handlers
  const handleOpenAIReview = useCallback((part, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSelectedPartForAIReview(part);
    setShowAIReview(true);
  }, []);

  const handleSaveAIReview = useCallback((updatedPart) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.parts });
    setShowAIReview(false);
    setSelectedPartForAIReview(null);
  }, [queryClient]);

  const handleCancelAIReview = useCallback(() => {
    setShowAIReview(false);
    setSelectedPartForAIReview(null);
  }, []);

  // Listen for AI review completed events
  useEffect(() => {
    const handleAIReviewCompleted = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
    };
    window.addEventListener('ai-review-completed', handleAIReviewCompleted);
    return () => window.removeEventListener('ai-review-completed', handleAIReviewCompleted);
  }, [queryClient]);

  const renderPartCard = (part) => {
    const quantity = Number(part.quantity_available ?? part.quantity_on_hand ?? 0);
    const totalOnHand = Number(part.quantity_on_hand ?? 0);
    const reserved = Number(part.quantity_reserved ?? 0);
    
    // Determine the current visibility value (edited or original)
    const currentVisibility = editedParts[part.id]?.is_wire_drop_visible !== undefined
      ? editedParts[part.id].is_wire_drop_visible
      : part.is_wire_drop_visible !== false;

    const currentPrewire = editedParts[part.id]?.required_for_prewire !== undefined
      ? editedParts[part.id].required_for_prewire
      : part.required_for_prewire === true;

    const isModified = editedParts[part.id] !== undefined;

    // Get current inventory value for this part (edited or original)
    const currentInventory = editedInventory[part.id] !== undefined
      ? editedInventory[part.id]
      : totalOnHand;
    const inventoryModified = editedInventory[part.id] !== undefined;

    // INVENTORY MODE: Compact list view with editable quantity fields
    // Uses brand success color (#94AF32) instead of Tailwind green
    if (inventoryMode) {
      return (
        <div
          key={part.id}
          className={`p-3 rounded-lg border transition-all flex items-center gap-4`}
          style={{
            ...styles.card,
            ...(inventoryModified ? {
              boxShadow: '0 0 0 2px #94AF32',
              backgroundColor: 'rgba(148, 175, 50, 0.1)'
            } : {})
          }}
        >
          {/* Part Info - Compact */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B5CF6' }}>
                {part.part_number}
              </span>
              {part.required_for_prewire && (
                <span className="w-2 h-2 rounded-full bg-amber-500" title="Prewire Required" />
              )}
            </div>
            <h3 className="text-sm font-medium truncate" style={{ color: styles.textPrimary }}>
              {part.name || part.model || 'Untitled Part'}
            </h3>
          </div>

          {/* Quantity Input with +/- buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleInventoryChange(part.id, Math.max(0, currentInventory - 1))}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xl font-bold transition-colors"
              title="Decrease quantity"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              value={currentInventory}
              onChange={(e) => handleInventoryChange(part.id, e.target.value)}
              style={{
                fontSize: '16px',
                ...(inventoryModified ? {
                  borderColor: '#94AF32',
                  backgroundColor: 'rgba(148, 175, 50, 0.15)',
                  color: '#94AF32'
                } : {})
              }}
              className={`w-16 px-2 py-2 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 ${
                inventoryModified
                  ? 'font-semibold'
                  : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
              }`}
            />
            <button
              onClick={() => handleInventoryChange(part.id, currentInventory + 1)}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xl font-bold transition-colors"
              title="Increase quantity"
            >
              +
            </button>
            {inventoryModified && (
              <button
                onClick={() => {
                  setEditedInventory((prev) => {
                    const newState = { ...prev };
                    delete newState[part.id];
                    return newState;
                  });
                }}
                className="ml-1 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="Reset to original"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Original value indicator */}
          {inventoryModified && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              was: {totalOnHand}
            </span>
          )}
        </div>
      );
    }

    if (editMode) {
      // Edit mode: compact card with checkboxes for bulk editing
      return (
        <div
          key={part.id}
          className={`p-4 rounded-xl border transition-all ${
            isModified ? 'ring-2 ring-violet-500 shadow-lg' : ''
          }`}
          style={styles.card}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Left: Part identity */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B5CF6' }}>
                  {part.part_number}
                </span>
                {isModified && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-600 dark:text-violet-400 font-medium">
                    Modified
                  </span>
                )}
              </div>
              <h3 className="text-base font-medium truncate" style={{ color: styles.textPrimary }}>
                {part.name || part.model || 'Untitled Part'}
              </h3>
            </div>

            {/* Right: Edit controls */}
            <div className="flex items-center gap-4 shrink-0">
              {/* Quantity */}
              <div className="text-right">
                <span className="text-lg font-semibold" style={{ color: styles.textPrimary }}>
                  {quantity}
                </span>
                <span className="text-[10px] uppercase tracking-wide block text-zinc-500">avail</span>
              </div>

              {/* Toggle checkboxes */}
              <div className="flex gap-4 pl-4 border-l border-zinc-200 dark:border-zinc-700">
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentVisibility}
                    onChange={() => handleWireDropVisibilityChange(part.id, currentVisibility)}
                    className="h-5 w-5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Wire Drop</span>
                </label>
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentPrewire}
                    onChange={() => handlePrewireToggle(part.id, currentPrewire)}
                    className="h-5 w-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Prewire</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Normal mode: clickable card - CLEANED UP VERSION
    // Status indicators use small dots instead of text badges
    // Removed: duplicate badges, bottom metadata chips, redundant action buttons
    const hasAIDocs = part.ai_enrichment_status === 'completed';
    const needsAIReview = part.ai_enrichment_status === 'needs_review';

    return (
      <button
        key={part.id}
        onClick={() => navigate(`/parts/${part.id}`)}
        className="w-full text-left"
      >
        <div
          className="p-4 rounded-xl border transition-shadow hover:shadow-md"
          style={styles.card}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Left: Part info with status dots */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Status indicator dots - compact, no text */}
              <div className="flex flex-col gap-1 shrink-0">
                {part.required_for_prewire && (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" title="Prewire Required" />
                )}
                {part.needs_review && (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" title="New - Needs Review" />
                )}
                {hasAIDocs && (
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#8B5CF6' }} title="AI Documentation Available" />
                )}
                {needsAIReview && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" title="AI Results Need Review" />
                )}
              </div>

              {/* Part identity */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B5CF6' }}>
                    {part.part_number}
                  </span>
                  {part.manufacturer && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {part.manufacturer}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-medium truncate" style={{ color: styles.textPrimary }}>
                  {part.name || part.model || 'Untitled Part'}
                </h3>
              </div>
            </div>

            {/* Right: Actions + Quantity */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Conditional action buttons - only show when actionable */}
              {part.needs_review && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkPartReviewed(part.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 transition-colors"
                  title="Mark as reviewed"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
              )}
              {needsAIReview && (
                <button
                  onClick={(e) => handleOpenAIReview(part, e)}
                  className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                  title="Review AI enrichment"
                >
                  <Bot className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={(e) => handleOpenDocsEditor(part, e)}
                className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                title="Edit documentation"
              >
                <FileText className="h-4 w-4" />
              </button>

              {/* Quantity - compact */}
              <div className="text-right pl-2 border-l border-zinc-200 dark:border-zinc-700">
                <span className="text-lg font-semibold" style={{ color: styles.textPrimary }}>
                  {quantity}
                </span>
                <span className="text-[10px] uppercase tracking-wide block text-zinc-500 dark:text-zinc-400">
                  avail
                </span>
              </div>
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 py-4 sm:py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-500">
            Parts Catalog
          </p>
          <p className="text-sm" style={{ color: styles.textSecondary }}>
            {inventoryMode
              ? 'Inventory mode: Update stock quantities, then save all changes.'
              : editMode
                ? 'Edit mode: Toggle "Show in Wire Drop" for multiple parts, then save.'
                : 'Master list of parts and equipment with manuals, schematics, and install guidance.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inventoryMode ? (
            <>
              <Button
                variant="secondary"
                onClick={toggleInventoryMode}
                disabled={updateInventoryMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveInventory}
                loading={updateInventoryMutation.isLoading}
                disabled={Object.keys(editedInventory).length === 0}
              >
                Save Inventory {Object.keys(editedInventory).length > 0 && `(${Object.keys(editedInventory).length})`}
              </Button>
            </>
          ) : editMode ? (
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
                icon={Bot}
                onClick={() => navigate('/parts/ai-lookup')}
                className="bg-gradient-to-r from-violet-100 to-indigo-100 hover:from-violet-200 hover:to-indigo-200 dark:from-violet-900/30 dark:to-indigo-900/30 dark:hover:from-violet-900/50 dark:hover:to-indigo-900/50 text-violet-700 dark:text-violet-300"
              >
                AI Lookup
              </Button>
              <Button
                variant="secondary"
                icon={ClipboardList}
                onClick={toggleInventoryMode}
              >
                Inventory
              </Button>
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

      {/* Phase Filter Buttons */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setPhaseFilter('all')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            phaseFilter === 'all'
              ? 'bg-violet-600 text-white dark:bg-violet-500'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          All Parts
        </button>
        <button
          onClick={() => setPhaseFilter('new')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            phaseFilter === 'new'
              ? 'bg-amber-500 text-white dark:bg-amber-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Show New
            {newPartsCount > 0 && (
              <span className={`ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                phaseFilter === 'new'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-500 text-white'
              }`}>
                {newPartsCount > 99 ? '99+' : newPartsCount}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setPhaseFilter('prewire')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            phaseFilter === 'prewire'
              ? 'bg-orange-600 text-white dark:bg-orange-500'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <Wrench className="w-4 h-4 inline mr-1" />
          Prewire Prep
        </button>
        <button
          onClick={() => setPhaseFilter('trim')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            phaseFilter === 'trim'
              ? 'bg-violet-600 text-white dark:bg-violet-500'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          Trim Prep
        </button>
        <button
          onClick={() => setPhaseFilter('ai_review')}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            phaseFilter === 'ai_review'
              ? 'bg-blue-500 text-white dark:bg-blue-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            AI Review
            {aiReviewCount > 0 && (
              <span className={`ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                phaseFilter === 'ai_review'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-500 text-white'
              }`}>
                {aiReviewCount > 99 ? '99+' : aiReviewCount}
              </span>
            )}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by part number, model, manufacturer, or description"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <span className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          {filteredParts.length} items
        </span>
      </div>

      {/* Mark All Reviewed Banner - shown when viewing new parts */}
      {phaseFilter === 'new' && newPartsCount > 0 && (
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
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
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
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., IS-CTRL-001"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => handleFormChange('name', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(event) => handleFormChange('model', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Qty On Hand
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity_on_hand}
                      onChange={(event) => handleFormChange('quantity_on_hand', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
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

      {/* Documentation Editor Modal */}
      {showDocsEditor && selectedPartForDocs && (
        <Modal isOpen={showDocsEditor} onClose={handleCancelDocsEditor} size="lg">
          <GlobalPartDocumentationEditor
            part={selectedPartForDocs}
            onSave={handleSaveDocumentation}
            onCancel={handleCancelDocsEditor}
          />
        </Modal>
      )}

      {/* AI Review Modal */}
      {showAIReview && selectedPartForAIReview && (
        <Modal isOpen={showAIReview} onClose={handleCancelAIReview} size="xl">
          <GlobalPartAIReviewModal
            part={selectedPartForAIReview}
            onSave={handleSaveAIReview}
            onCancel={handleCancelAIReview}
          />
        </Modal>
      )}
    </div>
  );
};

export default PartsListPage;
