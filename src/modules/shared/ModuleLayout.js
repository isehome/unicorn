import React from 'react';
import { ArrowLeft } from 'lucide-react';

// Reusable layout wrapper for all modules
const ModuleLayout = ({ 
  title, 
  icon: Icon, 
  onBack, 
  children, 
  actions,
  isModal = false,
  className = ''
}) => {
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className={`bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col ${className}`}>
          <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
              )}
              <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
                {Icon && <Icon className="w-5 h-5" />}
                {title}
              </h2>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
            {Icon && <Icon className="w-5 h-5" />}
            {title}
          </h2>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
};

export default ModuleLayout;