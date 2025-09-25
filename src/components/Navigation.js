import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import ThemeToggle from './ui/ThemeToggle';

const Navigation = ({ userRole, setUserRole }) => {
  const { mode } = useTheme();
  
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">U</span>
            </div>
            <span className="text-xl font-semibold text-gray-900 dark:text-white">
              Unicorn
            </span>
          </div>
          
          {/* Center - Role Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Current Role:
            </span>
            <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
              {userRole === 'technician' ? 'Technician' : 'Project Manager'}
            </span>
          </div>
          
          {/* Right Side */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setUserRole(userRole === 'technician' ? 'pm' : 'technician')}
            >
              Switch to {userRole === 'technician' ? 'PM' : 'Technician'}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
