import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import ThemeToggle from './ui/ThemeToggle';

const SettingsPage = () => {
  const { mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];

  const displayName = user?.full_name || user?.name || user?.email || 'User';
  const email = user?.email || 'demo@example.com';
  const initials = useMemo(() => (displayName?.[0] || 'U').toUpperCase(), [displayName]);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
      <section className="rounded-2xl border p-4 flex items-center gap-4" style={sectionStyles.card}>
        <div className="w-12 h-12 rounded-full bg-violet-500 text-white flex items-center justify-center text-lg font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</p>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Toggle between light and dark themes.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workspace Mode</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Jump to technician or project manager views.</p>
          </div>
        </div>
        <div className="flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-slate-900/70 shadow-inner p-1">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            Technician
          </button>
          <button
            type="button"
            onClick={() => navigate('/pm-dashboard')}
            className="flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            Project Manager
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
