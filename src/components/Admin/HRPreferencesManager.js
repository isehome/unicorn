/**
 * HRPreferencesManager.js
 *
 * Admin component for managing company-wide HR preferences including:
 * - PTO policy settings (unified vs separate buckets)
 * - Annual allowances
 * - Holiday observances
 * - Carryover limits
 * - Tenure-based increases
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Loader2,
  Save,
  CheckCircle,
  AlertCircle,
  Calendar,
  Clock,
  Umbrella,
  HeartPulse,
  User,
  Settings,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Gift,
  TrendingUp
} from 'lucide-react';

// Standard US holidays
const STANDARD_HOLIDAYS = [
  { name: "New Year's Day", defaultObserved: true },
  { name: "Martin Luther King Jr. Day", defaultObserved: false },
  { name: "Presidents' Day", defaultObserved: false },
  { name: "Memorial Day", defaultObserved: true },
  { name: "Juneteenth", defaultObserved: false },
  { name: "Independence Day", defaultObserved: true },
  { name: "Labor Day", defaultObserved: true },
  { name: "Columbus Day", defaultObserved: false },
  { name: "Veterans Day", defaultObserved: false },
  { name: "Thanksgiving", defaultObserved: true },
  { name: "Day After Thanksgiving", defaultObserved: true },
  { name: "Christmas Eve", defaultObserved: true },
  { name: "Christmas Day", defaultObserved: true },
  { name: "New Year's Eve", defaultObserved: false }
];

const HRPreferencesManager = () => {
  const { user } = useAuth();

  // Data state
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // UI state
  const [expandedSections, setExpandedSections] = useState({
    ptoPolicy: true,
    allowances: true,
    holidays: true,
    rules: false,
    tenure: false
  });

  // Custom holiday form
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');

  // Default preferences (used when table doesn't exist or no data)
  const getDefaultPreferences = () => ({
    use_unified_pto: false,
    use_hybrid_pto: false, // NEW: Vacation separate + Sick/Personal combined
    unified_pto_name: 'Personal Time Off',
    unified_pto_annual_hours: 120,
    vacation_annual_hours: 80,
    sick_annual_hours: 40,
    personal_annual_hours: 24,
    sick_personal_annual_hours: 40, // NEW: Combined sick/personal bucket
    sick_personal_name: 'Sick/Personal', // NEW: Name for combined bucket
    vacation_max_carryover_hours: 40,
    sick_max_carryover_hours: 40,
    personal_max_carryover_hours: 0,
    unified_max_carryover_hours: 40,
    sick_personal_max_carryover_hours: 40, // NEW: Carryover for combined bucket
    pto_accrual_method: 'annual',
    fiscal_year_start_month: 1,
    observed_holidays: STANDARD_HOLIDAYS.filter(h => h.defaultObserved).map(h => h.name),
    custom_holidays: [],
    min_notice_days: 2,
    allow_negative_balance: false,
    max_negative_hours: 0,
    require_approval: true,
    blackout_dates: [],
    hours_per_day: 8,
    enable_tenure_increases: false,
    tenure_tiers: [
      { years: 1, additional_vacation_hours: 0 },
      { years: 3, additional_vacation_hours: 8 },
      { years: 5, additional_vacation_hours: 16 },
      { years: 10, additional_vacation_hours: 24 }
    ]
  });

  // Check if table exists
  const [tableExists, setTableExists] = useState(true);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('company_hr_preferences')
        .select('*')
        .limit(1)
        .single();

      // Check if table doesn't exist (error code 42P01 = relation does not exist)
      if (fetchError) {
        if (fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
          setTableExists(false);
          setPreferences(getDefaultPreferences());
          return;
        }
        // PGRST116 = no rows returned, which is okay
        if (fetchError.code !== 'PGRST116') {
          throw fetchError;
        }
      }

      // If no preferences exist, use defaults
      if (!data) {
        setPreferences(getDefaultPreferences());
      } else {
        setPreferences(data);
      }

    } catch (err) {
      console.error('[HRPreferencesManager] Load error:', err);
      // If it's a table-not-found error, show helpful message
      if (err.code === '42P01' || err.message?.includes('does not exist')) {
        setTableExists(false);
        setPreferences(getDefaultPreferences());
      } else {
        setError('Failed to load HR preferences. Please check the console for details.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Save preferences
  const handleSave = async () => {
    // Show error if table doesn't exist
    if (!tableExists) {
      setError('Cannot save: Please run the database migration first (see warning above)');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updateData = {
        ...preferences,
        updated_at: new Date().toISOString(),
        updated_by: user?.id
      };

      // Check if record exists
      const { data: existing, error: checkError } = await supabase
        .from('company_hr_preferences')
        .select('id')
        .limit(1)
        .single();

      // Handle table not existing
      if (checkError && (checkError.code === '42P01' || checkError.message?.includes('does not exist'))) {
        setTableExists(false);
        setError('Cannot save: Please run the database migration first');
        return;
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('company_hr_preferences')
          .update(updateData)
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('company_hr_preferences')
          .insert(updateData);

        if (insertError) throw insertError;
      }

      setSuccess('HR preferences saved successfully');
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('[HRPreferencesManager] Save error:', err);
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  // Update preference value
  const updatePref = (key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  // Toggle section
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle holiday observation
  const toggleHoliday = (holidayName) => {
    const current = preferences.observed_holidays || [];
    if (current.includes(holidayName)) {
      updatePref('observed_holidays', current.filter(h => h !== holidayName));
    } else {
      updatePref('observed_holidays', [...current, holidayName]);
    }
  };

  // Add custom holiday
  const addCustomHoliday = () => {
    if (!newHolidayName.trim() || !newHolidayDate) return;

    const current = preferences.custom_holidays || [];
    updatePref('custom_holidays', [...current, { name: newHolidayName.trim(), date: newHolidayDate }]);
    setNewHolidayName('');
    setNewHolidayDate('');
  };

  // Remove custom holiday
  const removeCustomHoliday = (index) => {
    const current = preferences.custom_holidays || [];
    updatePref('custom_holidays', current.filter((_, i) => i !== index));
  };

  // Format hours as days
  const hoursToDays = (hours) => {
    const days = hours / (preferences?.hours_per_day || 8);
    return days === Math.floor(days) ? days : days.toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
        <p className="text-red-700 dark:text-red-400">Failed to load preferences</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Settings size={20} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">HR Preferences</h3>
            <p className="text-sm text-zinc-500">Configure company-wide time off policies and holidays</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Database Setup Warning */}
      {!tableExists && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">Database Migration Required</p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                The HR preferences table hasn't been created yet. To enable this feature, run the following migration in your Supabase SQL editor:
              </p>
              <code className="block mt-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-xs font-mono text-amber-800 dark:text-amber-200 overflow-x-auto">
                database/migrations/2026-01-29_hr_company_preferences.sql
              </code>
              <p className="text-xs text-amber-500 mt-2">
                You can still view and configure settings below, but changes won't be saved until the migration is run.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', border: '1px solid rgba(148, 175, 50, 0.3)' }}>
          <CheckCircle size={16} style={{ color: '#94AF32' }} />
          <span className="text-sm" style={{ color: '#94AF32' }}>{success}</span>
        </div>
      )}

      {/* PTO Policy Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button
          onClick={() => toggleSection('ptoPolicy')}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-violet-500" />
            <span className="font-medium text-zinc-900 dark:text-white">PTO Policy Type</span>
          </div>
          {expandedSections.ptoPolicy ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {expandedSections.ptoPolicy && (
          <div className="p-4 space-y-4 border-t border-zinc-200 dark:border-zinc-700">
            {/* PTO Policy Type Selection - 2 Options */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Choose your PTO structure:
              </p>

              {/* Option 1: Separate (Vacation, Sick, Personal) */}
              <button
                onClick={() => {
                  updatePref('use_hybrid_pto', false);
                }}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                  !preferences.use_hybrid_pto
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                  !preferences.use_hybrid_pto
                    ? 'border-violet-500 bg-violet-500'
                    : 'border-zinc-300 dark:border-zinc-600'
                }`}>
                  {!preferences.use_hybrid_pto && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-zinc-900 dark:text-white">3 Separate Buckets</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Vacation, Sick Leave, and Personal days tracked separately
                  </p>
                </div>
              </button>

              {/* Option 2: Hybrid (Vacation separate, Sick/Personal combined) */}
              <button
                onClick={() => {
                  updatePref('use_hybrid_pto', true);
                }}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                  preferences.use_hybrid_pto
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                  preferences.use_hybrid_pto
                    ? 'border-violet-500 bg-violet-500'
                    : 'border-zinc-300 dark:border-zinc-600'
                }`}>
                  {preferences.use_hybrid_pto && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-zinc-900 dark:text-white">2 Buckets (Vacation + Sick/Personal)</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    Vacation tracked separately, Sick &amp; Personal combined into one bucket
                  </p>
                </div>
              </button>
            </div>

            {/* Sick/Personal Bucket Name (if hybrid mode) */}
            {preferences.use_hybrid_pto && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  What do you call the combined Sick/Personal bucket?
                </label>
                <input
                  type="text"
                  value={preferences.sick_personal_name || 'Sick/Personal'}
                  onChange={(e) => updatePref('sick_personal_name', e.target.value)}
                  placeholder="e.g., Sick/Personal, Health & Personal, Flexible Leave"
                  className="w-full max-w-md px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                />
              </div>
            )}

            {/* Accrual Method */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                How is PTO earned?
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'annual', label: 'All at once (start of year)' },
                  { value: 'monthly', label: 'Monthly accrual' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => updatePref('pto_accrual_method', option.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      preferences.pto_accrual_method === option.value
                        ? 'bg-violet-500 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Allowances Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button
          onClick={() => toggleSection('allowances')}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <div className="flex items-center gap-3">
            <Clock size={18} style={{ color: '#94AF32' }} />
            <span className="font-medium text-zinc-900 dark:text-white">Annual Allowances</span>
          </div>
          {expandedSections.allowances ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {expandedSections.allowances && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-700">
            {preferences.use_hybrid_pto ? (
              /* Hybrid PTO Settings: Vacation + Sick/Personal Combined */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vacation */}
                <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', border: '1px solid rgba(148, 175, 50, 0.3)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Umbrella size={18} style={{ color: '#94AF32' }} />
                    <span className="font-medium" style={{ color: '#94AF32' }}>Vacation</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Annual Hours</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={preferences.vacation_annual_hours || 0}
                          onChange={(e) => updatePref('vacation_annual_hours', parseFloat(e.target.value) || 0)}
                          className="w-24 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                        />
                        <span className="text-sm text-zinc-500">= {hoursToDays(preferences.vacation_annual_hours || 0)} days</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max Carryover Hours</label>
                      <input
                        type="number"
                        value={preferences.vacation_max_carryover_hours || 0}
                        onChange={(e) => updatePref('vacation_max_carryover_hours', parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Sick/Personal Combined */}
                <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <div className="flex items-center gap-2 mb-3">
                    <HeartPulse size={18} className="text-violet-500" />
                    <span className="font-medium text-violet-700 dark:text-violet-300">{preferences.sick_personal_name || 'Sick/Personal'}</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Annual Hours</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={preferences.sick_personal_annual_hours || 0}
                          onChange={(e) => updatePref('sick_personal_annual_hours', parseFloat(e.target.value) || 0)}
                          className="w-24 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                        />
                        <span className="text-sm text-zinc-500">= {hoursToDays(preferences.sick_personal_annual_hours || 0)} days</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max Carryover Hours</label>
                      <input
                        type="number"
                        value={preferences.sick_personal_max_carryover_hours || 0}
                        onChange={(e) => updatePref('sick_personal_max_carryover_hours', parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Separate PTO Settings: Vacation, Sick, Personal */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Vacation */}
                <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', border: '1px solid rgba(148, 175, 50, 0.3)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Umbrella size={18} style={{ color: '#94AF32' }} />
                    <span className="font-medium" style={{ color: '#94AF32' }}>Vacation</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Annual Hours</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={preferences.vacation_annual_hours || 0}
                          onChange={(e) => updatePref('vacation_annual_hours', parseFloat(e.target.value) || 0)}
                          className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                        />
                        <span className="text-xs text-zinc-500">= {hoursToDays(preferences.vacation_annual_hours || 0)}d</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max Carryover</label>
                      <input
                        type="number"
                        value={preferences.vacation_max_carryover_hours || 0}
                        onChange={(e) => updatePref('vacation_max_carryover_hours', parseFloat(e.target.value) || 0)}
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Sick */}
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-3">
                    <HeartPulse size={18} className="text-red-500" />
                    <span className="font-medium text-red-700 dark:text-red-300">Sick Leave</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Annual Hours</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={preferences.sick_annual_hours || 0}
                          onChange={(e) => updatePref('sick_annual_hours', parseFloat(e.target.value) || 0)}
                          className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                        />
                        <span className="text-xs text-zinc-500">= {hoursToDays(preferences.sick_annual_hours || 0)}d</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max Carryover</label>
                      <input
                        type="number"
                        value={preferences.sick_max_carryover_hours || 0}
                        onChange={(e) => updatePref('sick_max_carryover_hours', parseFloat(e.target.value) || 0)}
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Personal */}
                <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <div className="flex items-center gap-2 mb-3">
                    <User size={18} className="text-violet-500" />
                    <span className="font-medium text-violet-700 dark:text-violet-300">Personal</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Annual Hours</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={preferences.personal_annual_hours || 0}
                          onChange={(e) => updatePref('personal_annual_hours', parseFloat(e.target.value) || 0)}
                          className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                        />
                        <span className="text-xs text-zinc-500">= {hoursToDays(preferences.personal_annual_hours || 0)}d</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max Carryover</label>
                      <input
                        type="number"
                        value={preferences.personal_max_carryover_hours || 0}
                        onChange={(e) => updatePref('personal_max_carryover_hours', parseFloat(e.target.value) || 0)}
                        className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Hours per day setting */}
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Working hours per day
              </label>
              <input
                type="number"
                value={preferences.hours_per_day || 8}
                onChange={(e) => updatePref('hours_per_day', parseFloat(e.target.value) || 8)}
                min={4}
                max={12}
                step={0.5}
                className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
              />
              <p className="text-xs text-zinc-500 mt-1">Used to convert hours to days for display</p>
            </div>
          </div>
        )}
      </div>

      {/* Holidays Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button
          onClick={() => toggleSection('holidays')}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <div className="flex items-center gap-3">
            <Gift size={18} className="text-amber-500" />
            <span className="font-medium text-zinc-900 dark:text-white">Observed Holidays</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              {(preferences.observed_holidays || []).length} selected
            </span>
          </div>
          {expandedSections.holidays ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {expandedSections.holidays && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            {/* Standard Holidays */}
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Standard Holidays (click to toggle)
              </p>
              <div className="flex flex-wrap gap-2">
                {STANDARD_HOLIDAYS.map(holiday => {
                  const isObserved = (preferences.observed_holidays || []).includes(holiday.name);
                  return (
                    <button
                      key={holiday.name}
                      onClick={() => toggleHoliday(holiday.name)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        isObserved
                          ? 'bg-amber-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {holiday.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Holidays */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Custom Company Holidays
              </p>

              {/* Existing custom holidays */}
              {(preferences.custom_holidays || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {(preferences.custom_holidays || []).map((holiday, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm"
                    >
                      <span>{holiday.name}</span>
                      <span className="text-violet-400">({holiday.date})</span>
                      <button
                        onClick={() => removeCustomHoliday(index)}
                        className="p-0.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-800"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom holiday form */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="Holiday name"
                  className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                />
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                />
                <button
                  onClick={addCustomHoliday}
                  disabled={!newHolidayName.trim() || !newHolidayDate}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Policy Rules Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button
          onClick={() => toggleSection('rules')}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <div className="flex items-center gap-3">
            <Settings size={18} className="text-blue-500" />
            <span className="font-medium text-zinc-900 dark:text-white">Policy Rules</span>
          </div>
          {expandedSections.rules ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {expandedSections.rules && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            {/* Min notice days */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Minimum advance notice (days)
              </label>
              <input
                type="number"
                value={preferences.min_notice_days || 2}
                onChange={(e) => updatePref('min_notice_days', parseInt(e.target.value) || 0)}
                min={0}
                max={30}
                className="w-20 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
              />
            </div>

            {/* Require approval */}
            <div className="flex items-center gap-3">
              <button onClick={() => updatePref('require_approval', !preferences.require_approval)}>
                {preferences.require_approval ? (
                  <ToggleRight size={24} className="text-violet-500" />
                ) : (
                  <ToggleLeft size={24} className="text-zinc-400" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Require manager approval</p>
                <p className="text-xs text-zinc-500">All time off requests must be approved by manager</p>
              </div>
            </div>

            {/* Negative balance */}
            <div className="flex items-center gap-3">
              <button onClick={() => updatePref('allow_negative_balance', !preferences.allow_negative_balance)}>
                {preferences.allow_negative_balance ? (
                  <ToggleRight size={24} className="text-violet-500" />
                ) : (
                  <ToggleLeft size={24} className="text-zinc-400" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Allow negative balance</p>
                <p className="text-xs text-zinc-500">Employees can borrow against future accrued time</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tenure Increases Section */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <button
          onClick={() => toggleSection('tenure')}
          className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <div className="flex items-center gap-3">
            <TrendingUp size={18} style={{ color: '#94AF32' }} />
            <span className="font-medium text-zinc-900 dark:text-white">Tenure-Based Increases</span>
          </div>
          {expandedSections.tenure ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {expandedSections.tenure && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => updatePref('enable_tenure_increases', !preferences.enable_tenure_increases)}>
                {preferences.enable_tenure_increases ? (
                  <ToggleRight size={24} className="text-violet-500" />
                ) : (
                  <ToggleLeft size={24} className="text-zinc-400" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Enable tenure-based PTO increases</p>
                <p className="text-xs text-zinc-500">Employees earn additional vacation based on years of service</p>
              </div>
            </div>

            {preferences.enable_tenure_increases && (
              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Additional vacation hours by tenure:
                </p>
                <div className="space-y-2">
                  {(preferences.tenure_tiers || []).map((tier, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm">
                      <span className="text-zinc-500 w-24">After {tier.years} year{tier.years !== 1 ? 's' : ''}:</span>
                      <span className="font-medium text-zinc-900 dark:text-white">
                        +{tier.additional_vacation_hours}h ({hoursToDays(tier.additional_vacation_hours)} days)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HRPreferencesManager;
