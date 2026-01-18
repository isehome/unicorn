import React, { useMemo } from 'react';
import { Zap, Plug, AlertTriangle, HelpCircle } from 'lucide-react';

/**
 * RackPowerView - Displays power consumption and outlet usage for a rack
 *
 * Shows summary cards with total watts and outlets, plus a breakdown table
 * of power usage by equipment sorted by watts descending.
 *
 * @param {Object} rack - The rack object with name and configuration
 * @param {Array} equipment - Array of equipment in rack with global_part data
 * @param {Object} powerSummary - Object with { total_watts, total_outlets, equipment_count }
 */
const RackPowerView = ({ rack, equipment = [], powerSummary }) => {
  // Sort equipment by power consumption (highest first)
  // Equipment without power data goes to the end
  const sortedEquipment = useMemo(() => {
    if (!equipment || equipment.length === 0) return [];

    return [...equipment].sort((a, b) => {
      const wattsA = a.global_part?.power_watts ?? -1;
      const wattsB = b.global_part?.power_watts ?? -1;
      return wattsB - wattsA;
    });
  }, [equipment]);

  // Calculate totals from powerSummary or fallback to calculating from equipment
  const totals = useMemo(() => {
    if (powerSummary) {
      return {
        watts: powerSummary.total_watts || 0,
        outlets: powerSummary.total_outlets || 0,
        count: powerSummary.equipment_count || 0
      };
    }

    // Fallback calculation from equipment array
    return equipment.reduce((acc, item) => {
      const watts = item.global_part?.power_watts || 0;
      const outlets = item.global_part?.power_outlets || 0;
      return {
        watts: acc.watts + watts,
        outlets: acc.outlets + outlets,
        count: acc.count + 1
      };
    }, { watts: 0, outlets: 0, count: 0 });
  }, [powerSummary, equipment]);

  // Placeholder capacities - these would come from rack settings in the future
  const capacities = {
    watts: rack?.ups_capacity_watts || null,
    outlets: rack?.pdu_outlet_count || null
  };

  // Calculate percentage for progress bars
  const getPercentage = (value, max) => {
    if (!max || max === 0) return 0;
    return Math.min(100, Math.round((value / max) * 100));
  };

  // Get percentage of total for each equipment item
  const getEquipmentPercentage = (watts) => {
    if (!watts || totals.watts === 0) return 0;
    return Math.round((watts / totals.watts) * 100);
  };

  // Render a progress bar
  const ProgressBar = ({ value, max, showWarning = false }) => {
    const percentage = max ? getPercentage(value, max) : null;
    const isWarning = percentage !== null && percentage >= 80;

    return (
      <div className="w-full">
        <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          {percentage !== null ? (
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isWarning && showWarning
                  ? 'bg-amber-500'
                  : 'bg-violet-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          ) : (
            // Indeterminate bar when no max capacity set
            <div className="h-full bg-violet-500/50 rounded-full w-1/2" />
          )}
        </div>
        <div className="flex justify-between mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{value}{max ? ` / ${max}` : ''}</span>
          {percentage !== null && (
            <span className={isWarning && showWarning ? 'text-amber-500 font-medium' : ''}>
              {percentage}%
            </span>
          )}
        </div>
      </div>
    );
  };

  // Mini bar for equipment table
  const MiniBar = ({ percentage }) => (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full"
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 w-8 text-right">
        {percentage}%
      </span>
    </div>
  );

  // Get display name for equipment
  const getEquipmentName = (item) => {
    if (item.global_part?.name) {
      return item.global_part.name;
    }
    return item.description || 'Unknown Equipment';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-700 pb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {rack?.name || 'Rack'} - Power Summary
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {totals.count} equipment {totals.count === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Power Card */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Total Power
            </span>
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            {totals.watts}W
          </div>
          <ProgressBar
            value={totals.watts}
            max={capacities.watts}
            showWarning
          />
          {!capacities.watts && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              No UPS capacity configured
            </p>
          )}
        </div>

        {/* Total Outlets Card */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Plug className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Total Outlets
            </span>
          </div>
          <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            {totals.outlets}
          </div>
          <ProgressBar
            value={totals.outlets}
            max={capacities.outlets}
            showWarning
          />
          {!capacities.outlets && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              No PDU capacity configured
            </p>
          )}
        </div>
      </div>

      {/* Equipment Breakdown */}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
        <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            Equipment Power Breakdown
          </h3>
        </div>

        {sortedEquipment.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <div className="col-span-5">Equipment</div>
              <div className="col-span-2 text-right">Watts</div>
              <div className="col-span-2 text-center">Outlets</div>
              <div className="col-span-3">% of Total</div>
            </div>

            {/* Table Rows */}
            {sortedEquipment.map((item) => {
              const watts = item.global_part?.power_watts;
              const outlets = item.global_part?.power_outlets;
              const percentage = getEquipmentPercentage(watts);
              const hasNoPowerData = watts == null && outlets == null;

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  {/* Equipment Name */}
                  <div className="col-span-5">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate block">
                      {getEquipmentName(item)}
                    </span>
                    {item.global_part?.manufacturer && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.global_part.manufacturer}
                      </span>
                    )}
                  </div>

                  {/* Watts */}
                  <div className="col-span-2 text-right">
                    {watts != null ? (
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {watts}W
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        —
                      </span>
                    )}
                  </div>

                  {/* Outlets */}
                  <div className="col-span-2 text-center">
                    {outlets != null ? (
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        {outlets}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        —
                      </span>
                    )}
                  </div>

                  {/* Percentage Bar */}
                  <div className="col-span-3">
                    {watts != null && watts > 0 ? (
                      <MiniBar percentage={percentage} />
                    ) : hasNoPowerData ? (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                        No data
                      </span>
                    ) : (
                      <MiniBar percentage={0} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
            <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No equipment in this rack</p>
          </div>
        )}
      </div>

      {/* Info Note */}
      {(!capacities.watts || !capacities.outlets) && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Power Capacity Not Configured
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Add UPS capacity and PDU outlet count in rack settings to enable capacity alerts and percentage tracking.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RackPowerView;
