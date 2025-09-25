import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const CollapsibleModule = ({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
  actions,
  count
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
          {Icon && <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          {count !== undefined && (
            <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm">
              {count}
            </span>
          )}
        </div>
        {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
      </div>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleModule;