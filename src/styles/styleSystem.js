const brandColors = {
  primary: '#8B5CF6',
  primaryHover: '#7C3AED',
  primaryLight: '#A78BFA',
  secondary: '#06B6D4',
  success: '#10B981',
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
