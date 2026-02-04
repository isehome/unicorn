import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Zap,
  RotateCcw,
  Filter,
  Eye,
  EyeOff,
  FileText,
  ChevronRight,
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

// Filter options
const FILTER_OPTIONS = {
  ALL: 'all',
  NOT_SUBMITTED: 'not_submitted',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
};

const PartsAILookupPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedParts, setSelectedParts] = useState(new Set());
  const [localProcessingParts, setLocalProcessingParts] = useState(new Set());
  const [errorParts, setErrorParts] = useState(new Map()); // partId -> error message
  const [usedCredits, setUsedCredits] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState(null);
  const [activeFilter, setActiveFilter] = useState(FILTER_OPTIONS.ALL);
  const [hideCompleted, setHideCompleted] = useState(false);
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

  // Helper to check if a part is a prewire item (should be skipped)
  const isPrewireItem = useCallback((part) => {
    if (part.required_for_prewire === true) return true;
    const name = (part.name || '').toLowerCase();
    const category = (part.category || '').toLowerCase();
    for (const pattern of SKIP_PATTERNS) {
      if (pattern.test(name) || pattern.test(category)) {
        return true;
      }
    }
    return false;
  }, []);

  // Helper to determine part status
  const getPartStatus = useCallback((part) => {
    const status = part.ai_enrichment_status;

    // Check for actual documentation URLs (not just status or ai_enrichment_data which may only contain notes)
    // This matches the logic in PartsListPage.js and GlobalPartsManager.js
    const hasActualDocs = status === 'completed' && (
      part.install_manual_urls?.length > 0 ||
      part.technical_manual_urls?.length > 0 ||
      part.user_guide_urls?.length > 0
    );

    if (hasActualDocs) return 'completed';
    if (localProcessingParts.has(part.id) || status === 'processing') return 'processing';
    if (status === 'error' || errorParts.has(part.id)) return 'error';

    // Not submitted yet (null, undefined, pending, or completed-but-no-docs)
    return 'not_submitted';
  }, [localProcessingParts, errorParts]);

  // Filter all parts (excluding prewire items)
  const eligibleParts = useMemo(() => {
    return allParts.filter(part => !isPrewireItem(part));
  }, [allParts, isPrewireItem]);

  // Categorize parts by status
  const partsByStatus = useMemo(() => {
    const result = {
      not_submitted: [],
      processing: [],
      completed: [],
      error: [],
    };

    eligibleParts.forEach(part => {
      const status = getPartStatus(part);
      result[status].push(part);
    });

    return result;
  }, [eligibleParts, getPartStatus]);

  // Apply filters
  const filteredParts = useMemo(() => {
    let parts = eligibleParts;

    // Apply status filter
    if (activeFilter !== FILTER_OPTIONS.ALL) {
      parts = partsByStatus[activeFilter] || [];
    } else if (hideCompleted) {
      parts = parts.filter(p => getPartStatus(p) !== 'completed');
    }

    // Apply search
    if (search) {
      const term = search.toLowerCase();
      parts = parts.filter(part => {
        return [
          part.part_number,
          part.name,
          part.manufacturer,
          part.category,
        ]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(term));
      });
    }

    return parts;
  }, [eligibleParts, activeFilter, hideCompleted, search, partsByStatus, getPartStatus]);

  // Count parts currently processing
  const processingCount = useMemo(() => {
    return partsByStatus.processing.length;
  }, [partsByStatus]);

  // Enable/disable polling based on processing count
  useEffect(() => {
    setIsPolling(processingCount > 0 || localProcessingParts.size > 0);
  }, [processingCount, localProcessingParts.size]);

  // Calculate stats
  const stats = useMemo(() => {
    const selected = selectedParts.size;
    const estimatedCredits = selected * CREDITS_PER_PART;
    const remainingBudget = MONTHLY_BUDGET - usedCredits;
    const wouldExceedBudget = estimatedCredits > remainingBudget;

    return {
      total: eligibleParts.length,
      notSubmitted: partsByStatus.not_submitted.length,
      processing: partsByStatus.processing.length,
      completed: partsByStatus.completed.length,
      errors: partsByStatus.error.length,
      selected,
      estimatedCredits,
      remainingBudget,
      wouldExceedBudget,
    };
  }, [eligibleParts, partsByStatus, selectedParts, usedCredits]);

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

  // Select/deselect all visible parts that aren't currently processing
  const handleSelectAll = useCallback(() => {
    const selectableParts = filteredParts.filter(p => {
      const status = getPartStatus(p);
      // Allow all except currently processing parts
      return status !== 'processing';
    });
    setSelectedParts(new Set(selectableParts.map(p => p.id)));
  }, [filteredParts, getPartStatus]);

  const handleDeselectAll = useCallback(() => {
    setSelectedParts(new Set());
  }, []);

  // Get API base URL for localhost development
  const getApiBase = () => {
    return window.location.hostname === 'localhost'
      ? 'https://unicorn-one.vercel.app'
      : '';
  };

  // Resync pending Manus tasks (recover missed webhook results)
  const handleResyncTasks = useCallback(async () => {
    setIsResyncing(true);
    setResyncResult(null);
    try {
      const response = await fetch(`${getApiBase()}/api/manus-resync-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Check all pending/running/processing tasks
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setResyncResult(result);
      console.log('[Resync] Result:', result);

      // Refresh parts list to show updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });
    } catch (err) {
      console.error('[Resync] Error:', err);
      setResyncResult({ error: err.message });
    } finally {
      setIsResyncing(false);
    }
  }, [queryClient]);

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
            setLocalProcessingParts(prev => new Set([...prev, partId]));

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
              setLocalProcessingParts(prev => {
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

      // Refetch parts list
      queryClient.invalidateQueries({ queryKey: queryKeys.parts });

      console.log(`AI Lookup: Started ${succeeded} tasks, ${failed} failed`);
    },
    onError: (err) => {
      console.error('Batch AI lookup failed:', err);
    },
  });

  // Render AI status icon for a part
  // Uses dots to match PartsListPage.js for consistency
  // Brand colors: success=#94AF32, violet=#8B5CF6
  const renderAIStatusIcon = (part) => {
    const status = getPartStatus(part);

    if (status === 'completed') {
      return (
        <div className="flex items-center justify-center" title="AI enriched with documents">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8B5CF6' }} />
        </div>
      );
    }

    if (status === 'processing') {
      return (
        <div className="flex items-center justify-center" title="Processing - awaiting Manus results">
          <span className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: '#8B5CF6' }} />
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="flex items-center justify-center" title={errorParts.get(part.id) || 'Error during enrichment'}>
          <span className="w-3 h-3 rounded-full bg-red-500" />
        </div>
      );
    }

    // Not submitted
    return (
      <div className="flex items-center justify-center" title="Not submitted for AI lookup">
        <span className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-600" />
      </div>
    );
  };

  // Render status badge text
  // Brand colors: success=#94AF32, violet=#8B5CF6
  const renderStatusBadge = (part) => {
    const status = getPartStatus(part);

    if (status === 'completed') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
        >
          <CheckCircle className="h-3 w-3" />
          Enriched
        </span>
      );
    }

    if (status === 'processing') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
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

    // Not submitted
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        <Bot className="h-3 w-3" />
        Not Submitted
      </span>
    );
  };

  // Filter tab button component
  // Brand colors: success=#94AF32, violet=#8B5CF6
  const FilterTab = ({ filter, label, count, color }) => {
    const isActive = activeFilter === filter;

    // Use brand colors for processing (violet) and enriched (green)
    const getActiveStyles = () => {
      if (color === 'violet') {
        return { borderColor: '#8B5CF6', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' };
      }
      if (color === 'green') {
        return { borderColor: '#94AF32', backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' };
      }
      return {}; // Use Tailwind classes for others
    };

    const colorClasses = {
      zinc: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
      red: 'border-red-300 bg-red-100 text-red-700 dark:border-red-600 dark:bg-red-900/50 dark:text-red-300',
    };

    const activeStyles = isActive ? getActiveStyles() : {};

    return (
      <button
        onClick={() => setActiveFilter(filter)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
          isActive && (color === 'zinc' || color === 'red')
            ? colorClasses[color]
            : !isActive
              ? 'border-transparent bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              : ''
        }`}
        style={isActive && (color === 'violet' || color === 'green') ? activeStyles : undefined}
      >
        {label} <span className="ml-1 opacity-70">({count})</span>
      </button>
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
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={RotateCcw}
            onClick={handleResyncTasks}
            disabled={isResyncing}
            title="Pull results from Manus for processing parts"
          >
            {isResyncing ? 'Pulling...' : 'Pull Manus Results'}
          </Button>
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Resync Result Banner */}
      {resyncResult && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
          resyncResult.error
            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            : ''
        }`}
        style={!resyncResult.error ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.3)' } : {}}
        >
          {resyncResult.error ? (
            <>
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Pull failed</p>
                <p className="text-sm text-red-600 dark:text-red-400">{resyncResult.error}</p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5" style={{ color: '#94AF32' }} />
              <div>
                <p className="font-medium" style={{ color: '#94AF32' }}>
                  Pull complete: {resyncResult.tasks_completed || 0} tasks processed
                </p>
                <p className="text-sm" style={{ color: '#94AF32' }}>
                  Checked: {resyncResult.tasks_checked || 0} |
                  Still running: {resyncResult.tasks_still_running || 0} |
                  Failed: {resyncResult.tasks_failed || 0}
                </p>
              </div>
            </>
          )}
          <button
            onClick={() => setResyncResult(null)}
            className="ml-auto text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards - Clickable to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveFilter(FILTER_OPTIONS.ALL)}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            activeFilter === FILTER_OPTIONS.ALL ? 'ring-2 ring-violet-500' : ''
          }`}
          style={styles.card}
        >
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Package className="h-4 w-4" />
            Total Parts
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: styles.textPrimary }}>
            {stats.total}
          </p>
        </button>

        <button
          onClick={() => setActiveFilter(FILTER_OPTIONS.NOT_SUBMITTED)}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 ${
            activeFilter === FILTER_OPTIONS.NOT_SUBMITTED ? 'ring-2 ring-zinc-500' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Bot className="h-4 w-4" />
            Not Submitted
          </div>
          <p className="text-2xl font-bold mt-1 text-zinc-600 dark:text-zinc-300">
            {stats.notSubmitted}
          </p>
        </button>

        <button
          onClick={() => setActiveFilter(FILTER_OPTIONS.PROCESSING)}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            activeFilter === FILTER_OPTIONS.PROCESSING ? 'ring-2' : ''
          }`}
          style={{
            borderColor: 'rgba(139, 92, 246, 0.3)',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            ...(activeFilter === FILTER_OPTIONS.PROCESSING ? { '--tw-ring-color': '#8B5CF6' } : {})
          }}
        >
          <div className="flex items-center gap-2 text-sm" style={{ color: '#8B5CF6' }}>
            <Loader2 className={`h-4 w-4 ${stats.processing > 0 ? 'animate-spin' : ''}`} />
            Processing
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: '#8B5CF6' }}>
            {stats.processing}
          </p>
        </button>

        <button
          onClick={() => setActiveFilter(FILTER_OPTIONS.COMPLETED)}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            activeFilter === FILTER_OPTIONS.COMPLETED ? 'ring-2' : ''
          }`}
          style={{
            borderColor: 'rgba(148, 175, 50, 0.3)',
            backgroundColor: 'rgba(148, 175, 50, 0.05)',
            ...(activeFilter === FILTER_OPTIONS.COMPLETED ? { '--tw-ring-color': '#94AF32' } : {})
          }}
        >
          <div className="flex items-center gap-2 text-sm" style={{ color: '#94AF32' }}>
            <CheckCircle className="h-4 w-4" />
            Enriched
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: '#94AF32' }}>
            {stats.completed}
          </p>
        </button>

        <div className="rounded-xl border p-4" style={styles.card}>
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <CheckSquare className="h-4 w-4" />
            Selected
          </div>
          <p className="text-2xl font-bold mt-1" style={{ color: '#8B5CF6' }}>
            {stats.selected}
          </p>
        </div>
      </div>

      {/* Processing Alert - Show when parts are processing */}
      {stats.processing > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border px-4 py-3"
          style={{ borderColor: 'rgba(139, 92, 246, 0.3)', backgroundColor: 'rgba(139, 92, 246, 0.08)' }}
        >
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#8B5CF6' }} />
          <div className="flex-1">
            <p className="font-medium" style={{ color: '#7C3AED' }}>
              {stats.processing} part{stats.processing !== 1 ? 's' : ''} awaiting Manus results
            </p>
            <p className="text-sm" style={{ color: '#8B5CF6' }}>
              Use "Pull Manus Results" button above to check if they're complete.
            </p>
          </div>
        </div>
      )}

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

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={styles.card}>
        <Filter className="h-4 w-4 text-zinc-400 mr-1" />
        <FilterTab filter={FILTER_OPTIONS.ALL} label="All" count={stats.total} color="zinc" />
        <FilterTab filter={FILTER_OPTIONS.NOT_SUBMITTED} label="Not Submitted" count={stats.notSubmitted} color="zinc" />
        <FilterTab filter={FILTER_OPTIONS.PROCESSING} label="Processing" count={stats.processing} color="violet" />
        <FilterTab filter={FILTER_OPTIONS.COMPLETED} label="Enriched" count={stats.completed} color="green" />
        {stats.errors > 0 && (
          <FilterTab filter={FILTER_OPTIONS.ERROR} label="Errors" count={stats.errors} color="red" />
        )}

        <div className="flex-1" />

        {/* Hide Completed Toggle */}
        {activeFilter === FILTER_OPTIONS.ALL && (
          <button
            onClick={() => setHideCompleted(!hideCompleted)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={hideCompleted
              ? { backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }
              : {}
            }
          >
            {hideCompleted ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {hideCompleted ? 'Show Completed' : 'Hide Completed'}
          </button>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={styles.card}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSelectAll}
          disabled={filteredParts.filter(p => getPartStatus(p) !== 'processing').length === 0}
        >
          Select All Eligible
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
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          <Zap className="h-4 w-4 inline mr-1" />
          Est: {stats.estimatedCredits} credits
        </span>
        <Button
          icon={Play}
          onClick={() => runSelectedMutation.mutate()}
          disabled={selectedParts.size === 0 || runSelectedMutation.isPending}
          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
        >
          {runSelectedMutation.isPending ? (
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
              {search ? 'No matching parts' : 'No parts in this category'}
            </h2>
            <p className="text-sm" style={{ color: styles.textSecondary }}>
              {search ? 'Try adjusting your search terms.' : 'Try a different filter.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={styles.card}>
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-[40px_50px_1fr_1fr_140px_40px] gap-4 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            <div></div>
            <div>AI</div>
            <div>Part Number / Name</div>
            <div>Manufacturer / Category</div>
            <div>Status</div>
            <div></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredParts.map((part) => {
              const isSelected = selectedParts.has(part.id);
              const status = getPartStatus(part);
              // Allow selecting completed parts for re-enrichment - only block parts currently processing
              const canSelect = status !== 'processing';

              return (
                <div
                  key={part.id}
                  className={`grid sm:grid-cols-[40px_50px_1fr_1fr_140px_40px] gap-2 sm:gap-4 p-4 items-center transition-colors cursor-pointer ${
                    isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  } ${status === 'processing' ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                  onClick={() => navigate(`/parts/${part.id}`)}
                >
                  {/* Checkbox */}
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => canSelect && togglePartSelection(part.id)}
                      disabled={!canSelect}
                      className={`p-1 rounded transition-colors ${
                        !canSelect
                          ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                          : isSelected
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

                  {/* AI Status Icon */}
                  <div className="flex items-center justify-center">
                    {renderAIStatusIcon(part)}
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

                  {/* Status Badge */}
                  <div>
                    {renderStatusBadge(part)}
                  </div>

                  {/* View Detail Arrow */}
                  <div className="flex items-center justify-center">
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <p>
          <strong>AI Status:</strong>{' '}
          <span style={{ color: '#8B5CF6' }}>●</span> Enriched (has actual docs){' '}
          <span style={{ color: '#8B5CF6' }}>◐</span> Processing (awaiting results){' '}
          <span className="text-zinc-400">●</span> Not submitted{' '}
          <span className="text-red-500">●</span> Error
        </p>
        <p>
          Prewire items (wires, cables, brackets, etc.) are automatically excluded.
        </p>
        <p>
          Budget: ~{CREDITS_PER_PART} credits per part | {MONTHLY_BUDGET} credits/month
        </p>
      </div>
    </div>
  );
};

export default PartsAILookupPage;
