import React, { memo } from 'react';
import { ListTodo, AlertTriangle } from 'lucide-react';

/**
 * DashboardStats - Displays todo and issue statistics cards
 *
 * Features:
 * - Shows open todos count
 * - Shows blocked issues count with color coding
 * - Clickable cards that navigate to respective pages
 */
const DashboardStats = ({ sectionStyles, counts, onNavigateToTodos, onNavigateToIssues }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        onClick={onNavigateToTodos}
        style={sectionStyles.card}
        className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
      >
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">To-do Items</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {counts?.todos?.open ?? 0}
            <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">open</span>
            <span className="text-sm font-medium ml-2 text-gray-600 dark:text-gray-400">
              / {counts?.todos?.total ?? 0} total
            </span>
          </div>
        </div>
        <ListTodo className="w-8 h-8" style={{ color: '#ACB3D1' }} />
      </button>

      <button
        type="button"
        onClick={onNavigateToIssues}
        style={sectionStyles.card}
        className="flex items-center justify-between p-4 rounded-2xl border text-left transition-transform hover:scale-[1.02]"
      >
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Issues</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {counts?.issues?.blocked ?? 0}
            <span
              className="text-sm font-medium ml-2"
              style={{
                color: (counts?.issues?.blocked ?? 0) > 0 ? '#EF4444' : '#F59E0B'
              }}
            >
              blocked
            </span>
            <span className="text-sm font-medium ml-3 text-gray-600 dark:text-gray-400">
              • {counts?.issues?.open ?? 0} open
            </span>
          </div>
        </div>
        <AlertTriangle className="w-8 h-8 text-amber-500" />
      </button>
    </div>
  );
};

export default memo(DashboardStats);
