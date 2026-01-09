import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { Activity, FileText, ArrowRight } from 'lucide-react';

const WireDropsHub = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const hubItems = [
    {
      title: 'Wire Drops List',
      description: 'View and manage all wire drops across your projects',
      icon: Activity,
      path: '/wire-drops-list',
      color: 'violet'
    },
    {
      title: 'Lucid Chart Integration',
      description: 'Connect wire maps from Lucid Chart and sync shape IDs',
      icon: FileText,
      path: '/lucid-test',
      color: 'blue'
    }
  ];

  const getColorClasses = (color) => {
    const colors = {
      violet: {
        iconBg: 'bg-violet-100 dark:bg-violet-900/20',
        iconText: 'text-violet-600 dark:text-violet-400',
        border: 'border-violet-200 dark:border-violet-800',
        hover: 'hover:border-violet-300 dark:hover:border-violet-700'
      },
      blue: {
        iconBg: 'bg-blue-100 dark:bg-blue-900/20',
        iconText: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
        hover: 'hover:border-blue-300 dark:hover:border-blue-700'
      }
    };
    return colors[color] || colors.violet;
  };

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'wire-drops-hub',
      availableOptions: hubItems.map(item => ({
        title: item.title,
        description: item.description,
        path: item.path
      })),
      optionCount: hubItems.length,
      hint: 'Wire drops navigation hub. Can open wire drops list or Lucid Chart integration.'
    });
  }, [publishState]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      open_wire_drops_list: async () => {
        navigate('/wire-drops-list');
        return { success: true, message: 'Opening wire drops list' };
      },
      open_lucid_chart: async () => {
        navigate('/lucid-test');
        return { success: true, message: 'Opening Lucid Chart integration' };
      },
      navigate_to: async ({ destination }) => {
        const dest = destination?.toLowerCase();
        if (dest?.includes('list') || dest?.includes('wire drop')) {
          navigate('/wire-drops-list');
          return { success: true, message: 'Opening wire drops list' };
        }
        if (dest?.includes('lucid') || dest?.includes('chart')) {
          navigate('/lucid-test');
          return { success: true, message: 'Opening Lucid Chart integration' };
        }
        return { success: false, error: 'Unknown destination. Available: wire drops list, lucid chart' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 transition-colors pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div style={sectionStyles.card} className="mb-6">
          <div className="text-center mb-8">
            <Activity className="w-12 h-12 text-violet-500 dark:text-violet-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Wire Drops Management
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Access your wire drops list or integrate with Lucid Chart wire maps
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {hubItems.map((item) => {
              const Icon = item.icon;
              const colors = getColorClasses(item.color);
              
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`
                    flex items-start gap-4 p-6 rounded-lg border-2 
                    ${colors.border} ${colors.hover}
                    bg-white dark:bg-zinc-800 
                    transition-all hover:shadow-lg
                    text-left group
                  `}
                >
                  <div className={`p-3 rounded-lg ${colors.iconBg} flex-shrink-0`}>
                    <Icon className={`w-6 h-6 ${colors.iconText}`} />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                      Open
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireDropsHub;
