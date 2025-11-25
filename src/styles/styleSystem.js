/**
 * IMPORTANT NAVIGATION & UI CONVENTION:
 * 
 * Page titles should ONLY be displayed in the AppHeader component (app bar), 
 * NOT within the page content itself. This ensures consistency across the app.
 * 
 * The AppHeader component:
 * - Displays the current page title under "Intelligent Systems" 
 * - Provides a universal back button for all pages except root pages (/, /pm-dashboard, /login)
 * 
 * Component guidelines:
 * - DO NOT render page titles (h1/h2) in page bodies
 * - DO NOT implement custom back buttons - use the app bar's back button
 * - Use the AppHeader's page title display instead of duplicating titles
 * 
 * This ensures a clean, consistent navigation experience throughout the application.
 */

const brandColors = {
  primary: '#8B5CF6',
  primaryHover: '#7C3AED',
  primaryLight: '#A78BFA',
  secondary: '#ACB3D1', // RGB(172, 179, 209)
  success: '#94AF32', // RGB(148, 175, 50)
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6'
};

const paletteByMode = {
  light: {
    page: '#F4F4F5',
    textPrimary: '#18181B',
    textSecondary: '#52525B',
    subtleText: '#71717A',
    headerGradient: 'linear-gradient(135deg, #FFFFFF 0%, #EEF2FF 50%, #E0E7FF 100%)',
    headerBorder: '#E4E4E7',
    headerShadow: '0 12px 32px rgba(79, 70, 229, 0.18)',
    card: '#FFFFFF',
    cardMuted: '#F3F4F6',
    cardShadow: '0 14px 30px rgba(15, 23, 42, 0.08)',
    border: '#E4E4E7',
    badgeBg: '#EDE9FE',
    badgeText: '#5B21B6',
    chipActiveBg: '#DCFCE7',
    chipActiveText: '#047857',
    chipIdleBg: '#E5E7EB',
    chipIdleText: '#52525B',
    accent: brandColors.primary,
    accentContrast: '#FAFAFA',
    accentGradient: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 40%, #06B6D4 100%)',
    success: brandColors.success,
    warning: brandColors.warning,
    danger: brandColors.danger,
    info: brandColors.info,
    bottomBarShadow: '0 -20px 40px rgba(15, 23, 42, 0.12)'
  },
  dark: {
    page: '#09090B',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    subtleText: '#71717A',
    headerGradient: 'linear-gradient(135deg, #111827 0%, #1E1B4B 50%, #0F172A 100%)',
    headerBorder: '#27272A',
    headerShadow: '0 20px 48px rgba(2, 6, 23, 0.55)',
    card: '#18181B',
    cardMuted: '#111827',
    cardShadow: '0 20px 40px rgba(2, 6, 23, 0.65)',
    border: '#27272A',
    badgeBg: '#8B5CF6',
    badgeText: '#EDE9FE',
    chipActiveBg: 'rgba(16, 185, 129, 0.18)',
    chipActiveText: '#34D399',
    chipIdleBg: 'rgba(39, 39, 42, 0.75)',
    chipIdleText: '#A1A1AA',
    accent: brandColors.primary,
    accentContrast: '#1C1C1E',
    accentGradient: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 45%, #38BDF8 100%)',
    success: brandColors.success,
    warning: brandColors.warning,
    danger: brandColors.danger,
    info: brandColors.info,
    bottomBarShadow: '0 -24px 60px rgba(2, 6, 23, 0.75)'
  }
};

export const enhancedStyles = {
  progressColors: {
    low: '#EF4444',
    medium: '#F59E0B',
    good: '#3B82F6',
    high: '#10B981',
    complete: '#8B5CF6',
  },

  /**
   * Date Display Standards
   *
   * DISPLAY MODE (Read-Only):
   * Use DateField component from /src/components/ui/DateField.js
   * - Automatic color coding based on date proximity
   * - Shows "—" dash for unset dates
   * - Greys out completed section dates
   *
   * EDIT MODE (Input Fields):
   * Use DateInput component from /src/components/ui/DateInput.js
   * - Empty fields: Orange background + "—" dash overlay
   * - Filled fields: White/normal background with date value
   * - NO gray backgrounds (too close to white, causes confusion)
   *
   * Visual Hierarchy (Display Mode):
   * - Past Due (Red): Bold, highly visible - dates that have passed
   * - Urgent (Orange): Bold, visible - dates within 3 days
   * - Upcoming (Yellow): Medium weight - dates within 7 days
   * - Future (Blue): Normal weight - dates more than 7 days away
   * - Not Set (Gray): Faded, shows "—" dash - no date entered
   * - Completed (Gray): Greyed out, faded - section is complete
   *
   * Usage Examples:
   *
   * // Display mode (read-only)
   * <DateField date="2025-11-30" label="Target Date" />
   * <DateField date={null} label="Not Set" /> // Shows "—"
   *
   * // Edit mode (input fields)
   * <DateInput value={date} onChange={handleChange} />
   *
   * See /src/utils/dateUtils.js for date formatting utilities
   * See DATE_FIELD_USAGE.md for complete documentation
   */
  dateDisplay: {
    // Display mode colors (auto-applied by DateField component)
    pastDue: {
      light: '#DC2626', // red-600
      dark: '#F87171'   // red-400
    },
    urgent: {
      light: '#EA580C', // orange-600
      dark: '#FB923C'   // orange-400
    },
    upcoming: {
      light: '#CA8A04', // yellow-600
      dark: '#FACC15'   // yellow-400
    },
    future: {
      light: '#2563EB', // blue-600
      dark: '#60A5FA'   // blue-400
    },
    notSet: {
      light: '#9CA3AF', // gray-400
      dark: '#6B7280'   // gray-500
    },
    completed: {
      light: '#6B7280', // gray-500 (faded)
      dark: '#9CA3AF'   // gray-400 (faded)
    }
  },

  /**
   * Date Input Standards (Edit Mode)
   *
   * ALL empty date inputs must show:
   * - Orange background (light: #FFF7ED, dark: rgba(194, 65, 12, 0.2))
   * - Orange border (light: #FDBA74, dark: #C2410C)
   * - "—" dash overlay in gray text
   *
   * Filled date inputs show:
   * - Normal white background (light: #FFFFFF, dark: #374151)
   * - Normal gray border (light: #D1D5DB, dark: #4B5563)
   * - Date value in normal text color
   */
  dateInput: {
    empty: {
      light: {
        bg: '#FFF7ED',        // orange-50
        border: '#FDBA74',    // orange-300
        text: '#9CA3AF',      // gray-400 (for dash)
      },
      dark: {
        bg: 'rgba(194, 65, 12, 0.2)', // orange-900/20
        border: '#C2410C',    // orange-700
        text: '#6B7280',      // gray-500 (for dash)
      }
    },
    filled: {
      light: {
        bg: '#FFFFFF',        // white
        border: '#D1D5DB',    // gray-300
        text: '#111827',      // gray-900
      },
      dark: {
        bg: '#374151',        // gray-700
        border: '#4B5563',    // gray-600
        text: '#F9FAFB',      // gray-50
      }
    },
    focus: {
      light: {
        border: '#8B5CF6',    // violet-500
        ring: 'rgba(139, 92, 246, 0.1)',
      },
      dark: {
        border: '#8B5CF6',    // violet-500
        ring: 'rgba(139, 92, 246, 0.1)',
      }
    }
  },

  /**
   * Collapsible Section Standards
   *
   * CONSISTENT PATTERN FOR ALL COLLAPSIBLE SECTIONS:
   * - Chevron ALWAYS on the LEFT (first element)
   * - Uses ChevronRight when collapsed, ChevronDown when expanded
   * - Layout: flex items-center gap-2 (NOT justify-between)
   *
   * Standard Pattern:
   * <button className="flex items-center gap-2 [other-styles]">
   *   {collapsed ? (
   *     <ChevronRight className="w-5 h-5" />
   *   ) : (
   *     <ChevronDown className="w-5 h-5" />
   *   )}
   *   <Icon className="w-5 h-5" />
   *   <span>Section Title</span>
   * </button>
   *
   * DO NOT USE:
   * - justify-between (chevron should NOT be on the right)
   * - ChevronDown/ChevronUp pattern (use ChevronRight/ChevronDown instead)
   *
   * Examples:
   * - Phase Milestones (PMProjectViewEnhanced.js:3187-3201)
   * - Building Permits (PMProjectViewEnhanced.js:3326-3339)
   * - Time Tracking (PMProjectViewEnhanced.js:3361-3374)
   * - Project Info (PMProjectViewEnhanced.js:2551-2570)
   *
   * This ensures a consistent, predictable UI across the application.
   */
  collapsibleSections: {
    chevronPosition: 'left',  // ALWAYS left, NEVER right
    collapsedIcon: 'ChevronRight',
    expandedIcon: 'ChevronDown',
    layout: 'flex items-center gap-2',  // NOT justify-between
  },

  sections: {
    light: {
      header: {
        background: 'linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)',
        borderBottom: '1px solid #E5E7EB',
        padding: '1.5rem',
      },
      card: {
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        hover: {
          boxShadow: '0 4px 6px rgba(139, 92, 246, 0.1)',
          transform: 'translateY(-2px)',
        }
      },
      sectionDivider: {
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #E5E7EB, transparent)',
        margin: '2rem 0',
      },
      projectCard: {
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderLeft: '4px solid #8B5CF6',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
        transition: 'all 0.2s ease',
      }
    },
    dark: {
      header: {
        background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
        borderBottom: '1px solid #374151',
        padding: '1.5rem',
      },
      card: {
        background: '#1F2937',
        border: '1px solid #374151',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        hover: {
          boxShadow: '0 4px 6px rgba(139, 92, 246, 0.2)',
          transform: 'translateY(-2px)',
        }
      },
      sectionDivider: {
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #374151, transparent)',
        margin: '2rem 0',
      },
      projectCard: {
        background: '#1F2937',
        border: '1px solid #374151',
        borderLeft: '4px solid #8B5CF6',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
        transition: 'all 0.2s ease',
      }
    }
  }
};

// Create theme function for ThemeContext
export const createTheme = (mode) => {
  return {
    mode,
    colors: enhancedStyles.progressColors,
    sections: enhancedStyles.sections[mode],
    palette: paletteByMode[mode],
  };
};

// Get utility classes for ThemeContext
export const getUtilityClasses = (theme) => {
  return {
    card: 'card-hover',
    gradientText: 'gradient-text',
    sectionSeparator: 'section-separator',
    progressBarAnimated: 'progress-bar-animated',
    statusDot: 'status-dot',
    projectCard: 'project-card',
  };
};

// Get CSS variables for ThemeContext
export const getCSSVariables = (mode) => {
  const styles = enhancedStyles.sections[mode];
  const palette = paletteByMode[mode];
  
  return `
    :root {
      --theme-mode: ${mode};
      --header-bg: ${styles.header.background};
      --header-border: ${styles.header.borderBottom};
      --card-bg: ${styles.card.background};
      --card-border: ${styles.card.border};
      --card-border-radius: ${styles.card.borderRadius};
      --card-shadow: ${styles.card.boxShadow};
      --card-hover-shadow: ${styles.card.hover.boxShadow};
      --section-divider-bg: ${styles.sectionDivider.background};
      --project-card-bg: ${styles.projectCard.background};
      --project-card-border: ${styles.projectCard.border};
      --progress-low: ${enhancedStyles.progressColors.low};
      --progress-medium: ${enhancedStyles.progressColors.medium};
      --progress-good: ${enhancedStyles.progressColors.good};
      --progress-high: ${enhancedStyles.progressColors.high};
      --progress-complete: ${enhancedStyles.progressColors.complete};
      --color-page-bg: ${palette.page};
      --color-text-primary: ${palette.textPrimary};
      --color-text-secondary: ${palette.textSecondary};
      --color-text-subtle: ${palette.subtleText};
      --color-card-bg: ${palette.card};
      --color-card-muted: ${palette.cardMuted};
      --color-card-shadow: ${palette.cardShadow};
      --color-border-default: ${palette.border};
      --color-badge-bg: ${palette.badgeBg};
      --color-badge-text: ${palette.badgeText};
      --color-chip-active-bg: ${palette.chipActiveBg};
      --color-chip-active-text: ${palette.chipActiveText};
      --color-chip-idle-bg: ${palette.chipIdleBg};
      --color-chip-idle-text: ${palette.chipIdleText};
      --color-accent: ${palette.accent};
      --color-success: ${palette.success};
      --color-warning: ${palette.warning};
      --color-danger: ${palette.danger};
      --color-info: ${palette.info};
      --color-header-shadow: ${palette.headerShadow};
      --color-header-border: ${palette.headerBorder};
      --color-header-gradient: ${palette.headerGradient};
      --color-bottom-bar-shadow: ${palette.bottomBarShadow};
    }
  `;
};

export { paletteByMode, brandColors };
