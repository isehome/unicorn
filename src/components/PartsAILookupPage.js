import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../contexts/ThemeContext';
import { partsService } from '../services/partsService';
import Button from './ui/Button';
import {
  Bot,
  Search,
  Package,
  Building,
  AlertCircle,
  CheckCircle,
  Loader2,
  Play,
  Square,
  CheckSquare,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Clock,
  Zap,
} from 'lucide-react';
import { queryKeys } from '../lib/queryClient';

// Skip patterns for prewire items (matches batch-enrich-parts.js)
const SKIP_PATTERNS = [
  /wire/i, /cable/i, /bracket/i, /tool/i, /mount/i, /screw/i,
  /connector/i, /adapter/i, /plug/i, /jack/i, /plate/i,
  /accessory/i, /accessories/i, /strap/i, /tie/i, /velcro/i,
  /tape/i, /label/i, /marker/i, /sleeve/i, /grommet/i
];

// Credits per part and monthly budget
const CREDITS_PER_PART = 100;
const MONTHLY_BUDGET = 4000;

const PartsAILookupPage = () => {
  const [search, setSearch] = useState('');
  const [selectedParts, setSelectedParts] = useState(new Set());
  const [processingParts, setProcessingParts] = useState(new Set());
  const [completedParts, setCompletedParts] = useState(new Set());
  const [errorParts, setErrorParts] = useState(new Map()); // partId -> error message
  const [usedCredits, setUsedCredits] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const queryClient = useQueryClient();
  const { theme, mode } = useTheme();

  const {
    data: allParts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.parts,
    queryFn: () => partsService.list(),
    refetchInterval: isPolling ? 10000 : false, // Poll every 10s when processing
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

  // Filter parts that need AI lookup and aren't prewire items
  const partsNeedingLookup = useMemo(() => {
    return allParts.filter(part => {
      // Check if needs AI lookup (null, pending, or error status)
      const needsLookup = !part.ai_enrichment_status ||
        part.ai_enrichment_status === 'pending' ||
        part.ai_enrichment_status === 'error';

      if (!needsLookup) return false;

      // Skip prewire items
      if (part.required_for_prewire === true) return false;

      // Skip items matching skip patterns
      const name = (part.name || '').toLowerCase();
      const category = (part.category || '').toLowerCase();
      for (const pattern of SKIP_PATTERNS) {
        if (pattern.test(name) || pattern.test(category)) {
          return false;
        }
      }

      return true;
    });
  }, [allParts]);

  // Filter by search
  const filteredParts = useMemo(() => {
    if (!search) return partsNeedingLookup;

    const term = search.toLowerCase();
    return partsNeedingLookup.filter(part => {
      return [
        part.part_number,
        part.name,
        part.manufacturer,
        part.category,
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(term));
    });
  }, [partsNeedingLookup, search]);

  // Count parts currently processing
  const processingCount = useMemo(() => {
    return allParts.filter(p => p.ai_enrichment_status === 'processing').length;
  }, [allParts]);

  // Enable/disable polling based on processing count
  useEffect(() => {
    setIsPolling(processingCount > 0 || processingParts.size > 0);
  }, [processingCount, processingParts.size]);

  // Calculate stats
  const stats = useMemo(() => {
    const selected = selectedParts.size;
    const estimatedCredits = selected * CREDITS_PER_PART;
    const remainingBudget = MONTHLY_BUDGET - usedCredits;
    const wouldExceedBudget = estimatedCredits > remainingBudget;

    return {
      totalNeedingLookup: partsNeedingLookup.length,
      selected,
      estimatedCredits,
      remainingBudget,
      wouldExceedBudget,
      processing: processingCount + processingParts.size,
      completed: completedParts.size,
      errors: errorParts.size,
    };
  }, [partsNeedingLookup, selectedParts, usedCredits, processingCount, processingParts, completedParts, errorParts]);

  // Toggle part selection
  const togglePartSelection = useCallback((partId) => {
    setSelectedParts(prev => {
      const next = new Set(prev);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      return next;
    });
  }, []);

  // Select/deselect all
  const handleSelectAll = useCallback(() => {
    setSelectedParts(new Set(filteredParts.map(p => p.id)));
  }, [filteredParts]);

  const handleDeselectAll = useCallback(() => {
    setSelectedParts(new Set());
  }, []);

  // Get API base URL for localhost development
  const getApiBase = () => {
    return window.location.hostname === 'localhost'
      ? 'https://unicorn-one.vercel.app'
      : '';
  };

  // Run AI lookup for selected parts
  const runSelectedMutation = useMutation({
    mutationFn: async () => {
      const partIds = Array.from(selectedParts);
      const results = [];

      // Process parts in parallel (max 10 at a time to avoid rate limits)
      const batchSize = 10;
      for (let i = 0; i < partIds.length; i += batchSize) {
        const batch = partIds.slice(i, i + batchSize);

        const batchResults = await Promise.allSettled(
          batch.map(async (partId) => {
            setProcessingParts(prev => new Set([...prev, partId]));

            try {
              const response = await fetch(`${getApiBase()}/api/enrich-single-part-manus`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partId }),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
              }

              const data = await response.json();
              return { partId, success: true, data };
            } catch (err) {
              setErrorParts(prev => new Map(prev).set(partId, err.message));
              throw err;
            } finally {
              setProcessingParts(prev => {
                const next = new Set(prev);
                next.delete(partId);
                return next;
              });
            }
          })
        );

        results.push(...batchResults);
      }

      return results;
    },
    onSuccess: (results) => {
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Update used credits
      setUsedCredits(prev => prev + (succeeded * CREDITS_PER_PART));

      // Clear selection
      setSelectedParts(new Set());

      // Track completed
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          setCompletedParts(prev => new Set([...prev, r.value.partId]));
        }
      });

      // Refetch parts list
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });

      console.log(`AI Lookup: Started ${succeeded} tasks, ${failed} failed`);
    },
    onError: (err) => {
      console.error('Batch AI lookup failed:', err);
    },
  });

  // Render status badge for a part
  const renderStatusBadge = (part) => {
    const status = part.ai_enrichment_status;

    if (processingParts.has(part.id) || status === 'processing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    }

    if (completedParts.has(part.id)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
          <CheckCircle className="h-3 w-3" />
          Started
        </span>
      );
    }

    if (errorParts.has(part.id)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title={errorParts.get(part.id)}>
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      );
    }

    if (status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          Error
        </span>
      );
    }

    if (status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    }

    // null or undefined status
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        <Bot className="h-3 w-3" />
        Not Run
      </span>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 py-4 sm:py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-violet-500" />
            <h1 className="text-xl font-bold" style={{ color: styles.textPrimary }}>
              AI Parts Lookup Manager
            </h1>
          </div>
          <p className="text-sm" style={{ color: styles.textSecondary }}>
            Select parts to run Manus AI research for documentation and specifications.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4" style={styles.card}>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Package className="h-4 w-4" />
            Need Lookup
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: styles.textPrimary }}>
            {stats.totalNeedingLookup}
          </p>
        </div>

        <div className="rounded-xl border p-4" style={styles.card}>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <CheckSquare className="h-4 w-4" />
            Selected
          </div>
          <p className="text-2xl font-bold mt-1 text-violet-600 dark:text-violet-400">
            {stats.selected}
          </p>
        </div>

        <div className="rounded-xl border p-4" style={styles.card}>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Zap className="h-4 w-4" />
            Est. Credits
          </div>
          <p className={`text-2xl font-bold mt-1 ${stats.wouldExceedBudget ? 'text-red-600 dark:text-red-400' : ''}`} style={!stats.wouldExceedBudget ? { color: styles.textPrimary } : undefined}>
            {stats.estimatedCredits}
          </p>
        </div>

        <div className="rounded-xl border p-4" style={styles.card}>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className={`h-4 w-4 ${stats.processing > 0 ? 'animate-spin' : ''}`} />
            Processing
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
            {stats.processing}
          </p>
        </div>
      </div>

      {/* Budget Warning */}
      {stats.wouldExceedBudget && stats.selected > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">
              Selection exceeds monthly budget
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">
              Selected: {stats.estimatedCredits} credits | Remaining budget: {stats.remainingBudget} credits
            </p>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={styles.card}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSelectAll}
          disabled={filteredParts.length === 0}
        >
          Select All ({filteredParts.length})
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDeselectAll}
          disabled={selectedParts.size === 0}
        >
          Deselect All
        </Button>
        <div className="flex-1" />
        <Button
          icon={Play}
          onClick={() => runSelectedMutation.mutate()}
          disabled={selectedParts.size === 0 || runSelectedMutation.isLoading}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
        >
          {runSelectedMutation.isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Starting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Run Selected ({selectedParts.size})
            </>
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by part number, name, manufacturer..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Error Display */}
      {isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300">
          <AlertCircle className="w-4 h-4" />
          <span>{error?.message || 'Failed to load parts.'}</span>
        </div>
      )}

      {/* Parts Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading parts...</p>
          </div>
        </div>
      ) : filteredParts.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center space-y-4" style={styles.card}>
          <Bot className="w-10 h-10 mx-auto text-zinc-400" />
          <div>
            <h2 className="text-lg font-semibold" style={{ color: styles.textPrimary }}>
              {partsNeedingLookup.length === 0 ? 'All parts have been processed!' : 'No matching parts'}
            </h2>
            <p className="text-sm" style={{ color: styles.textSecondary }}>
              {partsNeedingLookup.length === 0
                ? 'All eligible parts have AI enrichment data.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={styles.card}>
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-[40px_1fr_1fr_150px_120px_100px] gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            <div></div>
            <div>Part Number / Name</div>
            <div>Manufacturer / Category</div>
            <div>Status</div>
            <div></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredParts.map((part) => {
              const isSelected = selectedParts.has(part.id);
              const isProcessing = processingParts.has(part.id) || part.ai_enrichment_status === 'processing';

              return (
                <div
                  key={part.id}
                  className={`grid sm:grid-cols-[40px_1fr_1fr_150px_120px_100px] gap-2 sm:gap-4 p-4 items-center transition-colors ${
                    isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  } ${isProcessing ? 'opacity-70' : ''}`}
                >
                  {/* Checkbox */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => togglePartSelection(part.id)}
                      disabled={isProcessing}
                      className={`p-1 rounded transition-colors ${
                        isSelected
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {/* Part Number / Name */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-violet-600 dark:text-violet-400 truncate">
                      {part.part_number}
                    </p>
                    <p className="text-sm truncate" style={{ color: styles.textPrimary }}>
                      {part.name || 'Untitled Part'}
                    </p>
                  </div>

                  {/* Manufacturer / Category */}
                  <div className="min-w-0">
                    {part.manufacturer && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: styles.textSecondary }}>
                        <Building className="h-3 w-3 shrink-0" />
                        <span className="truncate">{part.manufacturer}</span>
                      </div>
                    )}
                    {part.category && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate">
                        {part.category}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    {renderStatusBadge(part)}
                  </div>

                  {/* Spacer for alignment */}
                  <div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <p>
          <strong>Note:</strong> AI lookup uses Manus to research product documentation. Results typically complete in 5-10 minutes.
        </p>
        <p>
          Prewire items (wires, cables, brackets, tools, connectors, etc.) are automatically excluded.
        </p>
        <p>
          Budget: ~{CREDITS_PER_PART} credits per part | {MONTHLY_BUDGET} credits/month
        </p>
      </div>
    </div>
  );
};

export default PartsAILookupPage;
