import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import ThemeToggle from './ui/ThemeToggle';

const Navigation = ({ userRole, setUserRole }) => {
  const { mode } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

          {/* Desktop - Center Role Indicator */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Current Role:
            </span>
            <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
              {userRole === 'technician' ? 'Technician' : 'Project Manager'}
            </span>
          </div>

          {/* Desktop - Right Side */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUserRole(userRole === 'technician' ? 'pm' : 'technician')}
            >
              Switch to {userRole === 'technician' ? 'PM' : 'Technician'}
            </Button>
          </div>

          {/* Mobile - Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 py-4 space-y-4">
            {/* Role Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Current Role:
              </span>
              <span className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
                {userRole === 'technician' ? 'Technician' : 'Project Manager'}
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setUserRole(userRole === 'technician' ? 'pm' : 'technician');
                  setMobileMenuOpen(false);
                }}
                className="w-full min-h-[44px]"
              >
                Switch to {userRole === 'technician' ? 'PM' : 'Technician'}
              </Button>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Theme:
                </span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
