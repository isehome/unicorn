import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';

const AppHeader = () => {
  const { mode } = useTheme();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname.startsWith('/pm-dashboard')) {
      localStorage.setItem('workspace-mode', 'pm');
    } else if (location.pathname === '/') {
      localStorage.setItem('workspace-mode', 'technician');
    }
  }, [location.pathname]);

  const sectionStyles = enhancedStyles.sections[mode];
  const headerStyle = useMemo(() => ({
    background: sectionStyles.header.background,
    borderBottom: sectionStyles.header.borderBottom,
    boxShadow: mode === 'dark'
      ? '0 16px 32px rgba(0, 0, 0, 0.45)'
      : '0 16px 28px rgba(0, 0, 0, 0.08)'
  }), [sectionStyles, mode]);

  const showBackButton = !['/', '/pm-dashboard', '/login'].includes(location.pathname);

  const pageTitle = useMemo(() => {
    const p = location.pathname;
    if (p === '/') return 'Technician Dashboard';
    if (p.startsWith('/pm-dashboard')) return 'Project Manager Dashboard';
    if (p.startsWith('/pm-project/') && p.includes('/issues')) return 'Project Issues';
    if (p.startsWith('/pm/project/') || p.startsWith('/pm-project/')) return 'PM Project Detail';
    if (p.startsWith('/project/') && p.includes('/issues/')) return 'Issue Details';
    if (p.startsWith('/project/')) return 'Technician Project Detail';
    if (p.startsWith('/issues')) return 'Issues';
    if (p.startsWith('/todos')) return 'To-dos';
    if (p.startsWith('/people')) return 'People';
    if (p.startsWith('/parts/')) return 'Part Details';
    if (p === '/parts') return 'Parts Catalog';
    if (p === '/lucid-test') return 'Lucid API Diagnostic';
    if (p === '/scan-tag') return 'Scan Wire Drop';
    if (p === '/wire-drops-list') return 'Wire Drops List';
    if (p.startsWith('/wire-drops')) return 'Wire Drops';
    if (p.startsWith('/prewire-mode')) return 'Prewire Mode';
    if (p.includes('/equipment')) return 'Equipment List';
    if (p.includes('/procurement')) return 'Procurement';
    if (p.includes('/receiving')) return 'Parts Receiving';
    if (p.includes('/reports')) return 'Project Reports';
    if (p.includes('/secure-data')) return 'Secure Data';
    if (p.includes('/shades')) return 'Window Treatments';
    if (p.startsWith('/unifi-test')) return 'UniFi API Test';
    if (p.startsWith('/settings')) return 'Settings';
    if (p.startsWith('/login')) return 'Sign In';
    return 'Field Operations';
  }, [location.pathname]);

  const displayName = user?.full_name || user?.name || user?.email || 'User';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'U';

  return (
    <header style={headerStyle} className="sticky top-0 z-50 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {showBackButton && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-zinc-800/70 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:shadow-md transition"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          )}
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-[9px] uppercase tracking-[0.3em] text-violet-600 dark:text-violet-300">Intelligent Systems</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[220px]">
              {pageTitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col text-right leading-tight min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Logged in</span>
            {user?.email && (
              <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[140px] sm:max-w-[240px]">
                {user.email}
              </span>
            )}
            {displayName !== user?.email && (
              <span className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 truncate max-w-[140px] sm:max-w-[240px]">
                {displayName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
            title="Open Settings"
          >
            {initials}
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
