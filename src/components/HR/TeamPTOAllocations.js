/**
 * TeamPTOAllocations.js
 *
 * Manager interface for setting PTO hour allocations for their direct reports.
 * Allows managers to customize the number of hours each employee can use per year,
 * overriding the company-wide defaults.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { hrService } from '../../services/hrService';
import TechnicianAvatar from '../TechnicianAvatar';
import {
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  Copy,
  Umbrella,
  HeartPulse,
  User,
  Calendar
} from 'lucide-react';

// Icon mapping for PTO types
const PTO_ICONS = {
  vacation: Umbrella,
  sick: HeartPulse,
  personal: User
};

const TeamPTOAllocations = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  // Data state
  const [teamAllocations, setTeamAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // UI state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedEmployees, setExpandedEmployees] = useState({});
  const [editedValues, setEditedValues] = useState({});

  // Load team allocations
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await hrService.getTeamPTOAllocations(user.id, selectedYear);
      setTeamAllocations(data || []);

      // Initialize edited values
      const initialEdits = {};
      data?.forEach(emp => {
        emp.allocations.forEach(alloc => {
          const key = `${emp.employee.id}-${alloc.pto_type_id}`;
          initialEdits[key] = alloc.allocated_hours;
        });
      });
      setEditedValues(initialEdits);

    } catch (err) {
      console.error('[TeamPTOAllocations] Load error:', err);
      setError('Failed to load team allocations');
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle employee expansion
  const toggleEmployee = (employeeId) => {
    setExpandedEmployees(prev => ({
      ...prev,
      [employeeId]: !prev[employeeId]
    }));
  };

  // Handle input change
  const handleHoursChange = (employeeId, ptoTypeId, value) => {
    const key = `${employeeId}-${ptoTypeId}`;
    setEditedValues(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

  // Check if value has been edited
  const isEdited = (employeeId, ptoTypeId, originalValue) => {
    const key = `${employeeId}-${ptoTypeId}`;
    return editedValues[key] !== originalValue;
  };

  // Save allocation for one employee/type
  const saveAllocation = async (employeeId, ptoTypeId) => {
    const key = `${employeeId}-${ptoTypeId}`;
    const hours = editedValues[key];

    try {
      setSaving(prev => ({ ...prev, [key]: true }));
      setError(null);

      await hrService.setPTOAllocation({
        employeeId,
        ptoTypeId,
        year: selectedYear,
        allocatedHours: hours,
        allocatedBy: user.id
      });

      setSuccess('Allocation saved');
      setTimeout(() => setSuccess(null), 2000);
      await loadData();

    } catch (err) {
      console.error('[TeamPTOAllocations] Save error:', err);
      setError('Failed to save allocation');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  // Revert to company default
  const revertToDefault = async (employeeId, ptoTypeId, allocationId) => {
    if (!allocationId) return;

    const key = `${employeeId}-${ptoTypeId}`;

    try {
      setSaving(prev => ({ ...prev, [key]: true }));
      await hrService.deletePTOAllocation(allocationId);
      setSuccess('Reverted to company default');
      setTimeout(() => setSuccess(null), 2000);
      await loadData();
    } catch (err) {
      console.error('[TeamPTOAllocations] Revert error:', err);
      setError('Failed to revert allocation');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  // Copy all allocations to next year
  const copyAllToNextYear = async () => {
    const nextYear = selectedYear + 1;

    try {
      setSaving(prev => ({ ...prev, copyAll: true }));

      for (const emp of teamAllocations) {
        const customAllocations = emp.allocations.filter(a => a.is_custom);
        for (const alloc of customAllocations) {
          await hrService.setPTOAllocation({
            employeeId: emp.employee.id,
            ptoTypeId: alloc.pto_type_id,
            year: nextYear,
            allocatedHours: alloc.allocated_hours,
            allocatedBy: user.id,
            notes: `Copied from ${selectedYear}`
          });
        }
      }

      setSuccess(`Allocations copied to ${nextYear}`);
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('[TeamPTOAllocations] Copy error:', err);
      setError('Failed to copy allocations');
    } finally {
      setSaving(prev => ({ ...prev, copyAll: false }));
    }
  };

  const formatHours = (hours) => {
    const h = parseFloat(hours) || 0;
    const days = h / 8;
    return `${h}h (${days.toFixed(1)} days)`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Clock size={20} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Team PTO Allocations</h3>
            <p className="text-xs text-zinc-500">Set hours each employee can use per year</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">Year:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
            >
              {[...Array(3)].map((_, i) => {
                const year = new Date().getFullYear() + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>

          <button
            onClick={copyAllToNextYear}
            disabled={saving.copyAll || teamAllocations.every(e => !e.allocations.some(a => a.is_custom))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving.copyAll ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            Copy to {selectedYear + 1}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(148, 175, 50, 0.3)' }}>
          <CheckCircle size={16} style={{ color: '#94AF32' }} />
          <span className="text-sm" style={{ color: '#94AF32' }}>{success}</span>
        </div>
      )}

      {/* Team List */}
      {teamAllocations.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={sectionStyles.card}>
          <Clock size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
          <p className="text-zinc-500">No direct reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teamAllocations.map(({ employee, allocations }) => {
            const isExpanded = expandedEmployees[employee.id];
            const hasCustomAllocations = allocations.some(a => a.is_custom);

            return (
              <div
                key={employee.id}
                className="rounded-xl border overflow-hidden"
                style={sectionStyles.card}
              >
                {/* Employee Header */}
                <button
                  onClick={() => toggleEmployee(employee.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <TechnicianAvatar
                      name={employee.full_name}
                      color={employee.avatar_color}
                      size="md"
                    />
                    <div className="text-left">
                      <p className="font-medium text-zinc-900 dark:text-white">
                        {employee.full_name}
                      </p>
                      <p className="text-xs text-zinc-500">{employee.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasCustomAllocations && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                        Custom
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown size={18} className="text-zinc-400" />
                    ) : (
                      <ChevronRight size={18} className="text-zinc-400" />
                    )}
                  </div>
                </button>

                {/* Allocations Grid */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                      {allocations.map(alloc => {
                        const Icon = PTO_ICONS[alloc.pto_type.name] || Calendar;
                        const key = `${employee.id}-${alloc.pto_type_id}`;
                        const isSaving = saving[key];
                        const hasChanged = isEdited(employee.id, alloc.pto_type_id, alloc.allocated_hours);

                        return (
                          <div
                            key={alloc.pto_type_id}
                            className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: `${alloc.pto_type.color}20` }}
                              >
                                <Icon size={16} style={{ color: alloc.pto_type.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                  {alloc.pto_type.label}
                                </p>
                                {alloc.is_custom && (
                                  <p className="text-xs text-violet-500">Custom allocation</p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={editedValues[key] ?? alloc.allocated_hours}
                                onChange={(e) => handleHoursChange(employee.id, alloc.pto_type_id, e.target.value)}
                                min={0}
                                step={1}
                                className="w-20 px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm"
                              />
                              <span className="text-xs text-zinc-500">hours/year</span>
                            </div>

                            <p className="text-xs text-zinc-400 mt-1">
                              = {((editedValues[key] ?? alloc.allocated_hours) / 8).toFixed(1)} days
                            </p>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 mt-2">
                              {hasChanged && (
                                <button
                                  onClick={() => saveAllocation(employee.id, alloc.pto_type_id)}
                                  disabled={isSaving}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
                                >
                                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                  Save
                                </button>
                              )}
                              {alloc.is_custom && !hasChanged && (
                                <button
                                  onClick={() => revertToDefault(employee.id, alloc.pto_type_id, alloc.allocation_id)}
                                  disabled={isSaving}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                >
                                  <RotateCcw size={12} />
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamPTOAllocations;
