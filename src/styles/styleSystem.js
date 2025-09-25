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
    }
  `;
};