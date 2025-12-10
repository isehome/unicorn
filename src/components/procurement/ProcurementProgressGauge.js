import React from 'react';
import { Package } from 'lucide-react';

/**
 * Reusable component for displaying procurement progress
 * Shows parts accounted for (on hand + ordered from submitted POs) vs total required
 *
 * @param {Array} equipment - Pre-filtered equipment array (already filtered by phase)
 * @param {string} phaseName - Optional display name for the phase (e.g., "Prewire", "Trim")
 */
const ProcurementProgressGauge = ({ equipment = [], phaseName = null }) => {
  // Calculate parts procurement progress (on hand + submitted POs)
  const calculateProgress = () => {
    let totalRequired = 0;
    let accountedFor = 0;

    console.log(`[ProcurementProgressGauge${phaseName ? ` - ${phaseName}` : ''}] Calculating progress for ${equipment.length} items`);

    equipment.forEach(item => {
      const required = item.quantity_required || item.planned_quantity || 0;
      const onHand = item.quantity_on_hand || 0;
      const ordered = item.quantity_ordered || 0; // Only submitted POs

      console.log(`[ProcurementProgressGauge${phaseName ? ` - ${phaseName}` : ''}] ${item.name || item.part_number}:`,
        `required=${required}, onHand=${onHand}, ordered=${ordered}`);

      totalRequired += required;
      // Count parts we have OR have ordered (but don't double count)
      accountedFor += Math.min(required, onHand + ordered);
    });

    const result = {
      total: totalRequired,
      accountedFor: accountedFor,
      remaining: Math.max(0, totalRequired - accountedFor),
      percentage: totalRequired > 0 ? (accountedFor / totalRequired) * 100 : 0
    };

    console.log(`[ProcurementProgressGauge${phaseName ? ` - ${phaseName}` : ''}] Progress result:`, result);

    return result;
  };

  const progress = calculateProgress();

  if (progress.total === 0) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">No parts required</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-violet-50 dark:from-gray-800 dark:to-gray-800/50 border border-blue-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Parts Accounted For
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              Inventory on hand + submitted POs
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {progress.accountedFor}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            of {progress.total} parts
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {progress.remaining} parts remaining
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            {Math.round(progress.percentage)}%
          </span>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, progress.percentage)}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="bg-white/60 dark:bg-zinc-900/30 rounded-lg p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">On Hand</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            {equipment.reduce((sum, item) => {
              const onHand = item.quantity_on_hand || 0;
              const required = item.quantity_required || item.planned_quantity || 0;
              return sum + Math.min(required, onHand);
            }, 0)}
          </p>
        </div>
        <div className="bg-white/60 dark:bg-zinc-900/30 rounded-lg p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Ordered (Submitted)</p>
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {equipment.reduce((sum, item) => {
              const ordered = item.quantity_ordered || 0;
              const required = item.quantity_required || item.planned_quantity || 0;
              const onHand = item.quantity_on_hand || 0;
              // Only count ordered quantity up to what's still needed after on-hand
              return sum + Math.min(required - onHand, Math.max(0, ordered));
            }, 0)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcurementProgressGauge;
