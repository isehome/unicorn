/**
 * CompanySettingsPage.js
 * Dedicated page for company-wide settings and configuration
 *
 * Consolidates:
 * - Company settings (logo, name, contacts)
 * - HR Preferences (PTO policies, holidays)
 * - Review Cycles
 * - Contacts Import
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Briefcase, Calendar, Upload, Wrench
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import CompanySettingsManager from '../components/procurement/CompanySettingsManager';
import HRPreferencesManager from '../components/Admin/HRPreferencesManager';
import ReviewCyclesManager from '../components/Admin/ReviewCyclesManager';
import ContactsImportManager from '../components/Admin/ContactsImportManager';
import LaborTypesManager from '../components/Admin/LaborTypesManager';

const CompanySettingsPage = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('company');

  const tabs = [
    { id: 'company', label: 'Company', icon: Building2, description: 'Logo, name, contacts' },
    { id: 'hr', label: 'HR & PTO', icon: Briefcase, description: 'Time off policies, holidays' },
    { id: 'labor', label: 'Labor Types', icon: Wrench, description: 'Service labor rates & types' },
    { id: 'reviews', label: 'Review Cycles', icon: Calendar, description: 'Performance review periods' },
    { id: 'import', label: 'Import Contacts', icon: Upload, description: 'CSV contact import' }
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-zinc-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className={`p-2 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Company Settings
                </h1>
                <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                  Manage company information, HR policies, and data imports
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      isActive
                        ? isDark
                          ? 'bg-violet-600/20 border border-violet-500/30'
                          : 'bg-violet-50 border border-violet-200'
                        : isDark
                          ? 'hover:bg-zinc-800 border border-transparent'
                          : 'hover:bg-gray-100 border border-transparent'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      isActive
                        ? 'bg-violet-500 text-white'
                        : isDark
                          ? 'bg-zinc-700 text-zinc-400'
                          : 'bg-gray-200 text-gray-500'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${
                        isActive
                          ? 'text-violet-600 dark:text-violet-400'
                          : isDark ? 'text-white' : 'text-gray-900'
                      }`}>
                        {tab.label}
                      </p>
                      <p className={`text-xs truncate ${
                        isDark ? 'text-zinc-500' : 'text-gray-500'
                      }`}>
                        {tab.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className={`rounded-xl border ${
              isDark ? 'border-zinc-700 bg-zinc-800' : 'border-gray-200 bg-white'
            } p-6`}>
              {activeTab === 'company' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Company Information
                      </h2>
                      <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        Manage company logo, name, and contact details
                      </p>
                    </div>
                  </div>
                  <CompanySettingsManager />
                </div>
              )}

              {activeTab === 'hr' && (
                <div className="space-y-8">
                  <HRPreferencesManager />
                </div>
              )}

              {activeTab === 'labor' && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-lime-100 dark:bg-lime-900/30 flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-lime-600 dark:text-lime-400" />
                    </div>
                    <div>
                      <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Labor Types
                      </h2>
                      <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        Manage service labor types and hourly rates
                      </p>
                    </div>
                  </div>
                  <LaborTypesManager />
                </div>
              )}

              {activeTab === 'reviews' && (
                <div>
                  <ReviewCyclesManager />
                </div>
              )}

              {activeTab === 'import' && (
                <div>
                  <ContactsImportManager />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettingsPage;
