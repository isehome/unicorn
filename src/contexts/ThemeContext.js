import React, { createContext, useContext, useState, useEffect } from 'react';
import { createTheme, getUtilityClasses, getCSSVariables } from '../styles/styleSystem';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('theme-mode');
    if (saved) return saved;
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  const theme = createTheme(mode);
  const utilities = getUtilityClasses(theme);

  const toggleTheme = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    localStorage.setItem('theme-mode', newMode);
  };

  useEffect(() => {
    const cssVariables = getCSSVariables(mode);
    const styleTag = document.createElement('style');
    styleTag.innerHTML = cssVariables;
    styleTag.id = 'theme-variables';
    
    const existingTag = document.getElementById('theme-variables');
    if (existingTag) {
      existingTag.remove();
    }
    
    document.head.appendChild(styleTag);
    
    if (mode === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    
    return () => {
      const tag = document.getElementById('theme-variables');
      if (tag) tag.remove();
    };
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, utilities, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};