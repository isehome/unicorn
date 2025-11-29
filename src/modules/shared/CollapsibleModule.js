import React from 'react';
import { ChevronRight } from 'lucide-react';

const CollapsibleModule = ({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
  actions,
  count,
  styles = {}
}) => {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
        style={styles.card}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {count !== undefined && count > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {count}
            </span>
          )}
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
          <ChevronRight
            className={`w-5 h-5 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          />
        </div>
      </button>
      {isOpen && (
        <div className="mt-4 rounded-2xl border p-4" style={styles.card}>
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleModule;
