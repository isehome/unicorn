/**
 * MyHRPage.js
 *
 * Unified HR portal for employees. Contains:
 * - My Career Development (self-evaluation)
 * - My Team's Development (for managers - card grid of direct reports)
 * - Time Off (PTO balances, requests, team calendar)
 *
 * Replaces "My Skills" section in Settings with a full-featured HR hub.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { careerDevelopmentService } from '../services/careerDevelopmentService';
import { hrService } from '../services/hrService';
import SkillReviewPanel from '../components/CareerDevelopment/SkillReviewPanel';
import TechnicianAvatar from '../components/TechnicianAvatar';
import QuickNoteButton from '../components/HR/QuickNoteButton';
import TimeOffSection from '../components/HR/TimeOffSection';
import EmployeeNotesList from '../components/HR/EmployeeNotesList';
import {
  Briefcase,
  GraduationCap,
  Users,
  Calendar,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Target,
  MessageSquare
} from 'lucide-react';

const MyHRPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  // Tab state
  const [activeTab, setActiveTab] = useState('my-development');

  // Career development state
  const [allCycles, setAllCycles] = useState([]);
  const [currentCycleIndex, setCurrentCycleIndex] = useState(0);
  const [cycle, setCycle] = useState(null);
  const [manager, setManager] = useState(null);
  const [directReports, setDirectReports] = useState([]);
  const [reportReviewStatus, setReportReviewStatus] = useState({});

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is a manager
  const isManager = directReports.length > 0;

  // Load data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const [cyclesData, managerData, reportsData] = await Promise.all([
        careerDevelopmentService.getAllCycles(),
        careerDevelopmentService.getMyManager(user.id),
        careerDevelopmentService.getMyReports(user.id)
      ]);

      // Filter to relevant cycles
      const relevantCycles = (cyclesData || []).filter(c =>
        ['self_eval', 'manager_review', 'completed'].includes(c.status)
      );

      setAllCycles(relevantCycles);
      setManager(managerData);
      setDirectReports(reportsData || []);

      if (relevantCycles.length > 0) {
        setCycle(relevantCycles[0]);
        setCurrentCycleIndex(0);

        // Load review status for each direct report
        if (reportsData?.length > 0) {
          const statusMap = {};
          for (const report of reportsData) {
            try {
              const status = await careerDevelopmentService.getTeamReviewStatus(user.id, relevantCycles[0].id);
              const reportStatus = status?.find(s => s.employee_id === report.id);
              statusMap[report.id] = reportStatus || { self_submitted: false, manager_submitted: false };
            } catch (err) {
              statusMap[report.id] = { self_submitted: false, manager_submitted: false };
            }
          }
          setReportReviewStatus(statusMap);
        }
      }

    } catch (err) {
      console.error('[MyHRPage] Load error:', err);
      setError('Failed to load HR data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigate between quarters
  const navigateCycle = useCallback((direction) => {
    const newIndex = currentCycleIndex + direction;
    if (newIndex < 0 || newIndex >= allCycles.length) return;
    setCurrentCycleIndex(newIndex);
    setCycle(allCycles[newIndex]);
  }, [currentCycleIndex, allCycles]);

  // AI Voice Copilot integration
  useEffect(() => {
    publishState({
      view: 'my-hr',
      activeTab,
      cycle: cycle ? { name: cycle.name, status: cycle.status } : null,
      manager: manager?.full_name,
      isManager,
      directReportsCount: directReports.length,
      hint: 'My HR page - career development, team reviews, and time off'
    });
  }, [publishState, activeTab, cycle, manager, isManager, directReports.length]);

  useEffect(() => {
    const actions = {
      switch_tab: async ({ tab }) => {
        const validTabs = ['my-development', 'team-development', 'time-off'];
        if (validTabs.includes(tab)) {
          setActiveTab(tab);
          return { success: true, message: `Switched to ${tab} tab` };
        }
        return { success: false, error: 'Invalid tab. Use: my-development, team-development, or time-off' };
      },
      navigate_quarter: async ({ direction }) => {
        navigateCycle(direction === 'previous' ? 1 : -1);
        return { success: true };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true };
      }
    };
    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, navigateCycle, loadData]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const isViewingPastCycle = currentCycleIndex > 0;

  // Tab definitions
  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'my-development', label: 'My Career Development', icon: GraduationCap },
      { id: 'time-off', label: 'Time Off', icon: Calendar }
    ];

    // Insert team tab if user is a manager
    if (isManager) {
      baseTabs.splice(1, 0, { id: 'team-development', label: "My Team's Development", icon: Users });
    }

    return baseTabs;
  }, [isManager]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Briefcase size={24} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  My HR
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Career development, team management, and time off
                </p>
              </div>
            </div>

            {manager && (
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                <TechnicianAvatar name={manager.full_name} color={manager.avatar_color} size="sm" />
                <div className="text-right">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Your Manager</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{manager.full_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all min-h-[44px] ${
                    isActive
                      ? 'bg-violet-500 text-white shadow-md'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                  {tab.id === 'team-development' && directReports.length > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-white/20' : 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
                    }`}>
                      {directReports.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
            <AlertCircle className="text-red-500" size={20} />
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'my-development' && (
          <div className="space-y-6">
            {/* Quarter Navigation */}
            {cycle ? (
              <div className="rounded-2xl border p-4" style={sectionStyles.card}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => navigateCycle(1)}
                    disabled={currentCycleIndex >= allCycles.length - 1}
                    className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                      ${currentCycleIndex >= allCycles.length - 1
                        ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                        : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                      }`}
                    title="Previous quarter"
                  >
                    <ChevronLeft size={24} />
                  </button>

                  <div className="flex items-center gap-3 flex-1 justify-center">
                    <Calendar className="text-violet-600 dark:text-violet-400" size={20} />
                    <div className="text-center">
                      <p className="font-semibold text-zinc-900 dark:text-white">{cycle.name}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigateCycle(-1)}
                    disabled={currentCycleIndex <= 0}
                    className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                      ${currentCycleIndex <= 0
                        ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                        : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                      }`}
                    title="Next quarter"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                {/* Due dates */}
                {!isViewingPastCycle && cycle.status !== 'completed' && (
                  <div className="flex flex-wrap justify-center gap-4 text-sm pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-amber-500" />
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Self-eval due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.self_eval_due_date)}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target size={14} className="text-blue-500" />
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Review due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.manager_review_due_date)}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {isViewingPastCycle && (
                  <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-700">
                    Viewing past review (read-only)
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border p-6" style={sectionStyles.card}>
                <div className="flex items-center gap-3 text-zinc-500">
                  <AlertCircle size={20} />
                  <p>No active review cycle. Your manager will create one when it's time for quarterly reviews.</p>
                </div>
              </div>
            )}

            {/* Skill Review Panel */}
            {cycle && (
              <div className="rounded-2xl border p-6" style={sectionStyles.card}>
                <SkillReviewPanel
                  cycle={cycle}
                  mode="self"
                  onSubmitComplete={loadData}
                  readOnly={cycle.status === 'completed' || isViewingPastCycle}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'team-development' && isManager && (
          <TeamDevelopmentSection
            cycle={cycle}
            allCycles={allCycles}
            currentCycleIndex={currentCycleIndex}
            navigateCycle={navigateCycle}
            directReports={directReports}
            reportReviewStatus={reportReviewStatus}
            sectionStyles={sectionStyles}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'time-off' && (
          <TimeOffSection />
        )}
      </div>

      {/* Floating Quick Note Button */}
      <QuickNoteButton
        currentUserId={user?.id}
        directReports={directReports}
        manager={manager}
      />
    </div>
  );
};

/**
 * Team Development Section Component
 * Full-page layout with dropdown employee selector for better review experience
 */
const TeamDevelopmentSection = ({
  cycle,
  allCycles,
  currentCycleIndex,
  navigateCycle,
  directReports,
  reportReviewStatus,
  sectionStyles,
  onRefresh
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(directReports[0]?.id || null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [employeeNotes, setEmployeeNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const selectedEmployee = directReports.find(r => r.id === selectedEmployeeId);
  const status = reportReviewStatus[selectedEmployeeId] || {};
  const selfSubmitted = status.self_submitted;
  const managerSubmitted = status.manager_submitted;

  // Load notes when employee changes
  useEffect(() => {
    const loadNotes = async () => {
      if (!selectedEmployeeId) return;
      setNotesLoading(true);
      try {
        const notes = await hrService.getNotesAboutEmployee(selectedEmployeeId);
        setEmployeeNotes(notes || []);
      } catch (err) {
        console.error('[TeamDevelopment] Failed to load notes:', err);
        setEmployeeNotes([]);
      } finally {
        setNotesLoading(false);
      }
    };
    loadNotes();
  }, [selectedEmployeeId]);

  // Status helper
  const getStatusInfo = (empId) => {
    const empStatus = reportReviewStatus[empId] || {};
    if (empStatus.manager_submitted) {
      return { color: '#10B981', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'Complete', icon: CheckCircle };
    }
    if (empStatus.self_submitted) {
      return { color: '#F59E0B', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'Ready', icon: Clock };
    }
    return { color: '#64748B', bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'Pending', icon: Clock };
  };

  const selectedStatus = getStatusInfo(selectedEmployeeId);
  const SelectedStatusIcon = selectedStatus.icon;

  if (directReports.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={sectionStyles.card}>
        <Users size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
        <p className="text-zinc-500 dark:text-zinc-400">No direct reports assigned</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar: Quarter Navigation + Employee Selector */}
      <div className="rounded-2xl border p-4" style={sectionStyles.card}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Quarter Navigation */}
          {cycle && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateCycle(1)}
                disabled={currentCycleIndex >= allCycles.length - 1}
                className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                  ${currentCycleIndex >= allCycles.length - 1
                    ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                    : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                  }`}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center min-w-[140px]">
                <p className="font-semibold text-zinc-900 dark:text-white text-sm">{cycle.name}</p>
              </div>
              <button
                onClick={() => navigateCycle(-1)}
                disabled={currentCycleIndex <= 0}
                className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                  ${currentCycleIndex <= 0
                    ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                    : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                  }`}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Employee Dropdown Selector */}
          <div className="relative flex-1 max-w-md">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800
                         rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[56px]"
            >
              {selectedEmployee && (
                <div className="flex items-center gap-3">
                  <TechnicianAvatar
                    name={selectedEmployee.full_name}
                    color={selectedEmployee.avatar_color}
                    size="sm"
                  />
                  <div className="text-left">
                    <p className="font-medium text-zinc-900 dark:text-white text-sm">
                      {selectedEmployee.full_name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {selectedEmployee.email}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${selectedStatus.bg}`}
                  style={{ color: selectedStatus.color }}>
                  <SelectedStatusIcon size={12} />
                  {selectedStatus.text}
                </span>
                <ChevronDown
                  size={18}
                  className={`text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-800 rounded-xl
                              shadow-lg border border-zinc-200 dark:border-zinc-700 z-20 max-h-80 overflow-y-auto">
                {directReports.map(report => {
                  const reportStatusInfo = getStatusInfo(report.id);
                  const ReportStatusIcon = reportStatusInfo.icon;
                  const isSelected = report.id === selectedEmployeeId;

                  return (
                    <button
                      key={report.id}
                      onClick={() => {
                        setSelectedEmployeeId(report.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50
                                  dark:hover:bg-zinc-700/50 transition-colors first:rounded-t-xl last:rounded-b-xl
                                  ${isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <TechnicianAvatar
                          name={report.full_name}
                          color={report.avatar_color}
                          size="sm"
                        />
                        <div className="text-left">
                          <p className="font-medium text-zinc-900 dark:text-white text-sm">
                            {report.full_name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {report.email}
                          </p>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${reportStatusInfo.bg}`}
                        style={{ color: reportStatusInfo.color }}>
                        <ReportStatusIcon size={12} />
                        {reportStatusInfo.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full Page Review Layout */}
      {selectedEmployee && cycle && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Review Panel - Takes 2/3 of space on large screens */}
          <div className="lg:col-span-2 rounded-2xl border" style={sectionStyles.card}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TechnicianAvatar
                    name={selectedEmployee.full_name}
                    color={selectedEmployee.avatar_color}
                    size="lg"
                  />
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {selectedEmployee.full_name}
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {selfSubmitted ? 'Self-evaluation submitted' : 'Self-evaluation pending'}
                    </p>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${selectedStatus.bg}`}
                  style={{ color: selectedStatus.color }}>
                  <SelectedStatusIcon size={14} />
                  {managerSubmitted ? 'Review Complete' : selfSubmitted ? 'Awaiting Your Review' : 'Self-Eval Pending'}
                </span>
              </div>
            </div>

            <div className="p-4">
              <SkillReviewPanel
                cycle={cycle}
                employeeId={selectedEmployee.id}
                mode="manager"
                readOnly={managerSubmitted || cycle.status === 'completed'}
                onSubmitComplete={onRefresh}
              />
            </div>
          </div>

          {/* Notes Sidebar - Takes 1/3 of space on large screens */}
          <div className="rounded-2xl border" style={sectionStyles.card}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-zinc-900 dark:text-white">Captured Notes</h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Quick notes captured about {selectedEmployee.full_name.split(' ')[0]}
              </p>
            </div>

            <div className="p-4 max-h-[600px] overflow-y-auto">
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-violet-500" size={24} />
                </div>
              ) : (
                <EmployeeNotesList
                  notes={employeeNotes}
                  employeeName={selectedEmployee.full_name}
                  showAddToReview={!managerSubmitted && cycle.status !== 'completed'}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
};

export default MyHRPage;
