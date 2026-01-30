/**
 * TimeOffSection.js
 *
 * Time Off / PTO management section for My HR page.
 *
 * Features:
 * - View PTO balances by type
 * - Submit time off requests
 * - View request history and status
 * - Managers: Approve/deny team requests
 * - View upcoming company holidays
 * - View team calendar (who's out when)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { hrService } from '../../services/hrService';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import TechnicianAvatar from '../TechnicianAvatar';
import {
  Calendar,
  Clock,
  Umbrella,
  HeartPulse,
  User,
  Users,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Send,
  X,
  CalendarDays,
  Scale,
  Heart,
  Settings
} from 'lucide-react';
import TeamPTOAllocations from './TeamPTOAllocations';

// Icon mapping for PTO types
const PTO_ICONS = {
  vacation: Umbrella,
  sick: HeartPulse,
  personal: User,
  bereavement: Heart,
  jury_duty: Scale
};

const TimeOffSection = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  // Data state
  const [ptoTypes, setPtoTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingTeamRequests, setPendingTeamRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [teamTimeOff, setTeamTimeOff] = useState([]);
  const [directReports, setDirectReports] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('balances'); // 'balances' | 'requests' | 'team' | 'holidays'
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isManager = directReports.length > 0;

  // Load all data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const currentYear = new Date().getFullYear();

      const [typesData, balancesData, requestsData, holidaysData, reportsData] = await Promise.all([
        hrService.getPTOTypes(),
        hrService.getPTOBalances(user.id, currentYear),
        hrService.getPTORequests(user.id, { year: currentYear }),
        hrService.getCompanyHolidays(currentYear),
        careerDevelopmentService.getMyReports(user.id)
      ]);

      setPtoTypes(typesData || []);
      setBalances(balancesData || []);
      setMyRequests(requestsData || []);
      setHolidays(holidaysData || []);
      setDirectReports(reportsData || []);

      // If manager, load pending requests and team time off
      if (reportsData?.length > 0) {
        const [pendingData, teamData] = await Promise.all([
          hrService.getPendingRequestsForManager(user.id),
          hrService.getTeamUpcomingTimeOff(user.id, 60)
        ]);
        setPendingTeamRequests(pendingData || []);
        setTeamTimeOff(teamData || []);
      }

    } catch (err) {
      console.error('[TimeOffSection] Load error:', err);
      setError('Failed to load time off data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Format hours to display
  const formatHours = (hours) => {
    if (!hours) return '0h';
    const h = parseFloat(hours);
    if (h === Math.floor(h)) return `${h}h`;
    return `${h.toFixed(1)}h`;
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
  };

  // Get icon for PTO type
  const getTypeIcon = (typeName) => {
    return PTO_ICONS[typeName] || Calendar;
  };

  // Handle approve/deny request
  const handleRequestAction = async (requestId, action, notes = '') => {
    try {
      setProcessingRequest(requestId);
      setError(null);

      if (action === 'approve') {
        await hrService.approvePTORequest(requestId, user.id, notes);
        setSuccess('Request approved');
      } else {
        await hrService.denyPTORequest(requestId, user.id, notes);
        setSuccess('Request denied');
      }

      setTimeout(() => setSuccess(null), 3000);
      await loadData();

    } catch (err) {
      console.error('[TimeOffSection] Action error:', err);
      setError('Failed to process request');
    } finally {
      setProcessingRequest(null);
    }
  };

  // Sub-tabs
  const subTabs = useMemo(() => {
    const tabs = [
      { id: 'balances', label: 'My Balances', icon: Clock },
      { id: 'requests', label: 'My Requests', icon: Calendar }
    ];

    if (isManager) {
      tabs.push({ id: 'team', label: 'Team Requests', icon: Users, badge: pendingTeamRequests.length });
      tabs.push({ id: 'allocations', label: 'Set Team Hours', icon: Settings });
    }

    tabs.push({ id: 'holidays', label: 'Holidays', icon: CalendarDays });

    return tabs;
  }, [isManager, pendingTeamRequests.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="rounded-2xl border p-4" style={sectionStyles.card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Time Off</h2>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
          >
            <Plus size={16} />
            Request Time Off
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all min-h-[40px] ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {tab.badge > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    isActive ? 'bg-white/20' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-red-500" size={20} />
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3">
          <CheckCircle className="text-emerald-500" size={20} />
          <p className="text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      {/* Tab Content */}
      {activeSubTab === 'balances' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ptoTypes.map(type => {
            const balance = balances.find(b => b.pto_type_id === type.id);
            const Icon = getTypeIcon(type.name);
            const hours = balance?.balance_hours || 0;
            const used = balance?.used_hours || 0;

            return (
              <div
                key={type.id}
                className="rounded-2xl border p-4"
                style={sectionStyles.card}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${type.color}20` }}
                  >
                    <Icon size={20} style={{ color: type.color }} />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-white">{type.label}</p>
                    <p className="text-xs text-zinc-500">{type.description}</p>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                      {formatHours(hours)}
                    </p>
                    <p className="text-xs text-zinc-500">available</p>
                  </div>
                  {used > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        {formatHours(used)}
                      </p>
                      <p className="text-xs text-zinc-500">used this year</p>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {type.max_balance_hours && (
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>Balance</span>
                      <span>{formatHours(hours)} / {formatHours(type.max_balance_hours)}</span>
                    </div>
                    <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((hours / type.max_balance_hours) * 100, 100)}%`,
                          backgroundColor: type.color
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {ptoTypes.length === 0 && (
            <div className="col-span-full text-center py-8 text-zinc-500">
              No PTO types configured. Contact your administrator.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'requests' && (
        <div className="rounded-2xl border overflow-hidden" style={sectionStyles.card}>
          {myRequests.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {myRequests.map(request => {
                const Icon = getTypeIcon(request.pto_type?.name);
                const statusColors = {
                  pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
                  approved: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
                  denied: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400' },
                  cancelled: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-500' }
                };
                const status = statusColors[request.status] || statusColors.pending;

                return (
                  <div key={request.id} className="p-4 flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${request.pto_type?.color}20` }}
                    >
                      <Icon size={20} style={{ color: request.pto_type?.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-900 dark:text-white">
                          {request.pto_type?.label}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formatDate(request.start_date)}
                        {request.start_date !== request.end_date && ` - ${formatDate(request.end_date)}`}
                        {' · '}{formatHours(request.hours_requested)}
                      </p>
                      {request.employee_notes && (
                        <p className="text-xs text-zinc-500 mt-1 truncate">{request.employee_notes}</p>
                      )}
                    </div>

                    {request.status === 'pending' && (
                      <button
                        onClick={async () => {
                          try {
                            await hrService.cancelPTORequest(request.id);
                            await loadData();
                          } catch (err) {
                            setError('Failed to cancel request');
                          }
                        }}
                        className="text-xs text-red-500 hover:text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">
              <Calendar size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
              <p>No time off requests yet</p>
              <button
                onClick={() => setShowRequestModal(true)}
                className="mt-3 text-violet-500 hover:text-violet-600 text-sm font-medium"
              >
                Request time off →
              </button>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'team' && isManager && (
        <div className="space-y-4">
          {/* Pending Approvals */}
          {pendingTeamRequests.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={sectionStyles.card}>
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                  <AlertCircle size={18} className="text-amber-500" />
                  Pending Approvals ({pendingTeamRequests.length})
                </h3>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {pendingTeamRequests.map(request => {
                  const Icon = getTypeIcon(request.pto_type?.name);
                  const isProcessing = processingRequest === request.id;

                  return (
                    <div key={request.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <TechnicianAvatar
                          name={request.employee?.full_name}
                          color={request.employee?.avatar_color}
                          size="md"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-zinc-900 dark:text-white">
                            {request.employee?.full_name}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            <Icon size={14} style={{ color: request.pto_type?.color }} />
                            <span>{request.pto_type?.label}</span>
                            <span>·</span>
                            <span>
                              {formatDate(request.start_date)}
                              {request.start_date !== request.end_date && ` - ${formatDate(request.end_date)}`}
                            </span>
                            <span>·</span>
                            <span>{formatHours(request.hours_requested)}</span>
                          </div>
                          {request.employee_notes && (
                            <p className="text-xs text-zinc-500 mt-1">{request.employee_notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRequestAction(request.id, 'deny', '')}
                            disabled={isProcessing}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                            title="Deny"
                          >
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                          </button>
                          <button
                            onClick={() => handleRequestAction(request.id, 'approve', '')}
                            disabled={isProcessing}
                            className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                            title="Approve"
                          >
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Team Time Off */}
          <div className="rounded-2xl border overflow-hidden" style={sectionStyles.card}>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="font-semibold text-zinc-900 dark:text-white">
                Upcoming Team Time Off
              </h3>
              <p className="text-xs text-zinc-500 mt-1">Next 60 days</p>
            </div>

            {teamTimeOff.length > 0 ? (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {teamTimeOff.map(request => {
                  const Icon = getTypeIcon(request.pto_type?.name);
                  return (
                    <div key={request.id} className="p-4 flex items-center gap-3">
                      <TechnicianAvatar
                        name={request.employee?.full_name}
                        color={request.employee?.avatar_color}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-white text-sm">
                          {request.employee?.full_name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatDate(request.start_date)}
                          {request.start_date !== request.end_date && ` - ${formatDate(request.end_date)}`}
                        </p>
                      </div>
                      <div
                        className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                        style={{ backgroundColor: `${request.pto_type?.color}20`, color: request.pto_type?.color }}
                      >
                        <Icon size={12} />
                        {request.pto_type?.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500">
                <Users size={32} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm">No upcoming team time off</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'allocations' && isManager && (
        <div className="rounded-2xl border p-4" style={sectionStyles.card}>
          <TeamPTOAllocations />
        </div>
      )}

      {activeSubTab === 'holidays' && (
        <div className="rounded-2xl border overflow-hidden" style={sectionStyles.card}>
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              Company Holidays {new Date().getFullYear()}
            </h3>
          </div>

          {holidays.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {holidays.map(holiday => {
                const date = new Date(holiday.date + 'T00:00:00');
                const isPast = date < new Date();
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={holiday.id}
                    className={`p-4 flex items-center gap-4 ${isPast ? 'opacity-50' : ''} ${isToday ? 'bg-violet-50 dark:bg-violet-900/20' : ''}`}
                  >
                    <div className="w-12 text-center">
                      <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {date.getDate()}
                      </p>
                      <p className="text-xs text-zinc-500 uppercase">
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>

                    <div className="flex-1">
                      <p className="font-medium text-zinc-900 dark:text-white">{holiday.name}</p>
                      <p className="text-xs text-zinc-500">
                        {date.toLocaleDateString('en-US', { weekday: 'long' })}
                        {holiday.is_paid && ' · Paid'}
                        {holiday.is_company_closed && ' · Office Closed'}
                      </p>
                    </div>

                    {isToday && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-500 text-white">
                        Today
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">
              <CalendarDays size={32} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm">No holidays configured</p>
            </div>
          )}
        </div>
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <TimeOffRequestModal
          ptoTypes={ptoTypes}
          balances={balances}
          userId={user.id}
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => {
            setShowRequestModal(false);
            loadData();
            setSuccess('Time off request submitted');
            setTimeout(() => setSuccess(null), 3000);
          }}
        />
      )}
    </div>
  );
};

/**
 * Time Off Request Modal
 */
const TimeOffRequestModal = ({ ptoTypes, balances, userId, onClose, onSuccess }) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [ptoTypeId, setPtoTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPartialDay, setIsPartialDay] = useState(false);
  const [partialHours, setPartialHours] = useState(4);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Calculate hours requested
  const calculateHours = () => {
    if (!startDate || !endDate) return 0;
    if (isPartialDay) return partialHours;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return days * 8; // Assuming 8-hour days
  };

  const hoursRequested = calculateHours();

  // Get selected type's balance
  const selectedType = ptoTypes.find(t => t.id === ptoTypeId);
  const selectedBalance = balances.find(b => b.pto_type_id === ptoTypeId);
  const availableHours = selectedBalance?.balance_hours || 0;
  const hasEnoughBalance = hoursRequested <= availableHours;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!ptoTypeId || !startDate || !endDate) {
      setError('Please fill in all required fields');
      return;
    }

    if (!hasEnoughBalance) {
      setError('Insufficient balance for this request');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await hrService.createPTORequest({
        employeeId: userId,
        ptoTypeId,
        startDate,
        endDate,
        hoursRequested,
        isPartialDay,
        partialDayHours: isPartialDay ? partialHours : null,
        employeeNotes: notes || null
      });

      onSuccess();

    } catch (err) {
      console.error('[TimeOffRequestModal] Submit error:', err);
      setError('Failed to submit request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Request Time Off</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700">
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* PTO Type Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Type of time off
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ptoTypes.map(type => {
                const Icon = PTO_ICONS[type.name] || Calendar;
                const isSelected = ptoTypeId === type.id;
                const balance = balances.find(b => b.pto_type_id === type.id);

                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setPtoTypeId(type.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${type.color}20` }}
                    >
                      <Icon size={16} style={{ color: type.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                        {type.label}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {balance?.balance_hours || 0}h available
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          {/* Partial Day Option */}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
            <input
              type="checkbox"
              checked={isPartialDay}
              onChange={(e) => setIsPartialDay(e.target.checked)}
              className="rounded border-zinc-300 text-violet-500 focus:ring-violet-500"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-zinc-900 dark:text-white">Partial day</span>
              <p className="text-xs text-zinc-500">Taking less than a full day</p>
            </div>
          </label>

          {isPartialDay && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Hours
              </label>
              <input
                type="number"
                value={partialHours}
                onChange={(e) => setPartialHours(Math.max(1, Math.min(7, parseInt(e.target.value) || 1)))}
                min={1}
                max={7}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 resize-none"
            />
          </div>

          {/* Summary */}
          {hoursRequested > 0 && selectedType && (
            <div className={`p-3 rounded-xl ${hasEnoughBalance ? 'bg-zinc-100 dark:bg-zinc-700' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Hours requested:</span>
                <span className={`font-semibold ${hasEnoughBalance ? 'text-zinc-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
                  {hoursRequested}h
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Available balance:</span>
                <span className="text-sm text-zinc-900 dark:text-white">{availableHours}h</span>
              </div>
              {!hasEnoughBalance && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  Insufficient balance for this request
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !ptoTypeId || !startDate || !endDate || !hasEnoughBalance}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send size={16} />
                Submit Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeOffSection;
