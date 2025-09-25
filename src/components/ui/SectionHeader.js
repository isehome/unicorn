import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const SectionHeader = ({ title, icon: Icon, action }) => {
  const { mode } = useTheme();
  
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500/10 to-cyan-500/10">
            <Icon className="w-5 h-5 text-violet-500" />
          </div>
        )}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {action && (
        <div>{action}</div>
      )}
    </div>
  );
};

export default SectionHeader;