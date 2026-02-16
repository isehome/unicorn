/**
 * ServiceDashboard.js
 * Main dashboard for Service CRM module with integrated ticket list
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Phone,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Plus,
  ChevronRight,
  Wrench,
  Wifi,
  Tv,
  Sun,
  Settings,
  Cable,
  LayoutGrid,
  Search,
  Filter,
  X,
  ChevronDown
} from 'lucide-react';
import {
  serviceTicketService,
  serviceScheduleService,
  serviceCallLogService
} from '../../services/serviceTicketService';
import { useAppState } from '../../contexts/AppStateContext';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';
import { supabase } from '../../lib/supabase';

// Category icons mapping
const categoryIcons = {
  network: Wifi,
  av: Tv,
  shades: Sun,
  control: Settings,
  wiring: Cable,
  installation: Wrench,
  maintenance: Wrench,
  general: Wrench
};

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_parts', label: 'Waiting Parts' },
  { value: 'waiting_customer', label: 'Waiting Customer' },
  { value: 'work_complete_needs_invoice', label: 'Work Complete - Needs Invoice' },
  { value: 'problem', label: 'Problem (Escalation)' },
  { value: 'closed', label: 'Closed' }
];

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-zinc-500' }
];

// Default categories (fallback if DB not available)
const DEFAULT_CATEGORIES = [
  { value: 'network', label: 'Network' },
  { value: 'av', label: 'A/V' },
  { value: 'shades', label: 'Shades' },
  { value: 'control', label: 'Control' },
  { value: 'wiring', label: 'Wiring' },
  { value: 'installation', label: 'Installation' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'general', label: 'General' }
];

const ServiceDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { publishState, registerActions, unregisterActions, setView } = useAppState();
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [showMyTickets, setShowMyTickets] = useState(searchParams.get('my') === 'true');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [filters, setFilters] = useState({
    status: searchParams.get('status')?.split(',').filter(Boolean) || [],
    priority: searchParams.get('priority') || '',
    category: searchParams.get('category') || ''
  });

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Build query filters
      const queryFilters = {};
      if (filters.status.length > 0) {
        queryFilters.status = filters.status;
      }
      if (filters.priority) {
        queryFilters.priority = filters.priority;
      }
      if (filters.category) {
        queryFilters.category = filters.category;
      }
      if (searchQuery.trim()) {
        queryFilters.search = searchQuery.trim();
      }
      if (showMyTickets && user?.id) {
        queryFilters.assignedTo = user.id;
      }

      const [statsData, ticketsData, scheduleData, callsData] = await Promise.all([
        serviceTicketService.getStats(),
        serviceTicketService.getAll(queryFilters),
        serviceScheduleService.getByDateRange(
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        ),
        serviceCallLogService.getRecent(10)
      ]);

      setStats(statsData);
      setTickets(ticketsData.tickets);
      setTodaySchedule(scheduleData);
      setRecentCalls(callsData);
    } catch (err) {
      console.error('[ServiceDashboard] Failed to load data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [filters, searchQuery, showMyTickets, user?.id]);

  useEffect(() => {
    loadDashboardData();
    setView('service-dashboard');
  }, [loadDashboardData, setView]);

  // Load skill categories from database (only those marked as show_in_service)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('skill_categories')
          .select('name, label, color')
          .eq('is_active', true)
          .neq('show_in_service', false)
          .order('sort_order');

        if (!error && data?.length > 0) {
          setCategories(data.map(c => ({ value: c.name, label: c.label, color: c.color })));
        }
      } catch (err) {
        console.log('[ServiceDashboard] Using default categories');
      }
    };
    loadCategories();
  }, []);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status.length > 0) params.set('status', filters.status.join(','));
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.category) params.set('category', filters.category);
    if (searchQuery) params.set('search', searchQuery);
    if (showMyTickets) params.set('my', 'true');
    setSearchParams(params, { replace: true });
  }, [filters, searchQuery, showMyTickets, setSearchParams]);

  // Publish state for AI Brain
  useEffect(() => {
    publishState({
      view: 'service-dashboard',
      stats,
      ticketCount: tickets.length,
      openTickets: tickets.filter(t => !['work_complete_needs_invoice', 'closed'].includes(t.status)).length,
      todayAppointments: todaySchedule.length,
      filters,
      searchQuery
    });
  }, [stats, tickets, todaySchedule, filters, searchQuery, publishState]);

  // Register actions for AI Brain
  useEffect(() => {
    const actions = {
      create_ticket: async ({ title, description, category, priority }) => {
        navigate('/service/tickets/new', {
          state: { title, description, category, priority }
        });
        return { success: true, message: 'Opening new ticket form' };
      },
      view_ticket: async ({ ticketNumber }) => {
        const ticket = tickets.find(t =>
          t.ticket_number?.toLowerCase().includes(ticketNumber?.toLowerCase())
        );
        if (ticket) {
          navigate(`/service/tickets/${ticket.id}`);
          return { success: true };
        }
        return { success: false, error: 'Ticket not found' };
      },
      list_open_tickets: () => {
        return {
          success: true,
          tickets: tickets
            .filter(t => !['work_complete_needs_invoice', 'closed'].includes(t.status))
            .map(t => ({
              number: t.ticket_number,
              title: t.title,
              status: t.status,
              priority: t.priority
            }))
        };
      },
      list_urgent_tickets: () => {
        return {
          success: true,
          tickets: tickets
            .filter(t => t.priority === 'urgent' && !['work_complete_needs_invoice', 'closed'].includes(t.status))
            .map(t => ({
              number: t.ticket_number,
              title: t.title,
              customer: t.customer_name
            }))
        };
      },
      get_today_schedule: () => {
        return {
          success: true,
          appointments: todaySchedule.map(s => ({
            time: s.scheduled_time_start,
            customer: s.ticket?.customer_name,
            address: s.service_address,
            ticket: s.ticket?.ticket_number
          }))
        };
      },
      filter_tickets: async ({ status, priority, category }) => {
        setFilters(prev => ({
          status: status ? [status] : prev.status,
          priority: priority || prev.priority,
          category: category || prev.category
        }));
        return { success: true, message: 'Filters applied' };
      },
      clear_filters: async () => {
        setFilters({ status: [], priority: '', category: '' });
        setSearchQuery('');
        return { success: true, message: 'Filters cleared' };
      },
      search_tickets: async ({ query }) => {
        setSearchQuery(query);
        return { success: true, message: `Searching for: ${query}` };
      },
      refresh_dashboard: async () => {
        await loadDashboardData();
        return { success: true, message: 'Dashboard refreshed' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [tickets, todaySchedule, navigate, registerActions, unregisterActions, loadDashboardData]);

  // Filter helper functions
  const toggleStatus = (status) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }));
  };

  const clearFilters = () => {
    setFilters({ status: [], priority: '', category: '' });
    setSearchQuery('');
    setShowMyTickets(false);
  };

  const hasActiveFilters = filters.status.length > 0 || filters.priority || filters.category || searchQuery || showMyTickets;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const StatCard = ({ icon: Icon, label, value, subValue, color, onClick }) => (
    <button
      onClick={onClick}
      className="bg-zinc-800 rounded-lg p-4 hover:bg-zinc-700 transition-colors text-left w-full"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-sm text-zinc-400">{label}</div>
          {subValue && <div className="text-xs text-zinc-500">{subValue}</div>}
        </div>
      </div>
    </button>
  );

  const getStatusStyles = (status) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'triaged':
        return 'bg-orange-500/20 text-orange-500';
      case 'scheduled':
        return 'bg-blue-500/20 text-blue-500';
      case 'in_progress':
        return 'bg-purple-500/20 text-purple-500';
      case 'waiting_parts':
      case 'waiting_customer':
        return 'bg-amber-500/20 text-amber-500';
      case 'work_complete_needs_invoice':
        // Green = work complete, ready for billing
        return { backgroundColor: 'rgba(148, 175, 50, 0.2)', color: brandColors.success };
      case 'problem':
        return 'bg-red-500/20 text-red-500';
      case 'closed':
        return 'bg-zinc-500/20 text-zinc-400';
      default:
        return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-zinc-500';
      default:
        return 'bg-zinc-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: brandColors.success }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 px-2 sm:px-4 py-4 sm:py-6 pb-20">
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Dashboard</h1>
            <p className="text-zinc-400">Manage support tickets and service calls</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/service/weekly-planning')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors text-white"
            >
              <LayoutGrid size={18} />
              Weekly Planning
            </button>
            <button
              onClick={() => navigate('/service/tickets/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: brandColors.success, color: '#000' }}
            >
              <Plus size={18} />
              New Ticket
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={AlertTriangle}
            label="Open Tickets"
            value={stats?.openCount || 0}
            subValue={`${stats?.urgentCount || 0} urgent`}
            color="bg-yellow-500/20 text-yellow-500"
            onClick={() => setFilters(prev => ({ ...prev, status: ['open'] }))}
          />
          <StatCard
            icon={Calendar}
            label="Today's Schedule"
            value={todaySchedule.length}
            subValue="appointments"
            color="bg-blue-500/20 text-blue-500"
            onClick={() => navigate('/service/weekly-planning')}
          />
          <StatCard
            icon={Phone}
            label="Recent Calls"
            value={recentCalls.length}
            subValue="last 24 hours"
            color="bg-purple-500/20 text-purple-500"
            onClick={() => navigate('/service/calls')}
          />
          <div className="bg-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)' }}
              >
                <CheckCircle size={20} style={{ color: brandColors.success }} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {(stats?.byStatus?.work_complete_needs_invoice || 0) + (stats?.byStatus?.closed || 0)}
                </div>
                <div className="text-sm text-zinc-400">Completed This Week</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets Section - Full Width on Mobile, 2/3 on Desktop */}
          <div className="lg:col-span-2">
            {/* Search and Filters */}
            <div className="bg-zinc-800 rounded-lg p-4 mb-4">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                </div>

                {/* My Tickets Toggle */}
                <button
                  onClick={() => setShowMyTickets(!showMyTickets)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    showMyTickets
                      ? 'border-violet-500 bg-violet-500/20 text-violet-400'
                      : 'border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500'
                  }`}
                >
                  My Tickets
                </button>

                {/* Filter Toggle */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    hasActiveFilters
                      ? 'bg-zinc-700 border-zinc-500 text-white'
                      : 'border-zinc-600 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Filter size={18} />
                  Filters
                  {hasActiveFilters && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: brandColors.success }}
                    />
                  )}
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <div className="mt-4 pt-4 border-t border-zinc-700">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Status Filter */}
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Status</label>
                      <div className="flex flex-wrap gap-2">
                        {STATUSES.map(status => (
                          <button
                            key={status.value}
                            onClick={() => toggleStatus(status.value)}
                            className={`px-3 py-1 rounded-full text-xs transition-colors ${
                              filters.status.includes(status.value)
                                ? 'bg-zinc-600 text-white'
                                : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700'
                            }`}
                          >
                            {status.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority Filter */}
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Priority</label>
                      <select
                        value={filters.priority}
                        onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                      >
                        <option value="">All Priorities</option>
                        {PRIORITIES.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Category Filter */}
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Category</label>
                      <select
                        value={filters.category}
                        onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                      >
                        <option value="">All Categories</option>
                        {categories.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="mt-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
                    >
                      <X size={14} />
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tickets List */}
            <div className="bg-zinc-800 rounded-lg">
              <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
                <h2 className="font-semibold text-white">
                  {hasActiveFilters ? 'Filtered Tickets' : 'All Tickets'}
                  <span className="ml-2 text-sm font-normal text-zinc-400">
                    ({tickets.length})
                  </span>
                </h2>
              </div>
              <div className="divide-y divide-zinc-700 max-h-[500px] overflow-y-auto">
                {tickets.map(ticket => {
                  const statusStyle = getStatusStyles(ticket.status);
                  const CategoryIcon = categoryIcons[ticket.category] || Wrench;

                  return (
                    <button
                      key={ticket.id}
                      onClick={() => navigate(`/service/tickets/${ticket.id}`)}
                      className="w-full p-4 hover:bg-zinc-700/50 transition-colors text-left flex items-center gap-4"
                    >
                      {/* Priority indicator */}
                      <div className={`w-1 h-12 rounded-full ${getPriorityColor(ticket.priority)}`} />

                      {/* Category icon */}
                      <div className="p-2 bg-zinc-700 rounded-lg">
                        <CategoryIcon size={18} className="text-zinc-400" />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-zinc-500 font-mono">
                            {ticket.ticket_number}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${typeof statusStyle === 'string' ? statusStyle : ''}`}
                            style={typeof statusStyle === 'object' ? statusStyle : undefined}
                          >
                            {ticket.status?.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-zinc-500 capitalize">
                            {ticket.category}
                          </span>
                        </div>
                        <div className="text-white font-medium truncate">{ticket.title}</div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-sm text-zinc-400">
                            {ticket.customer_name || ticket.contact?.full_name || 'Unknown'}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {formatDate(ticket.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Schedule indicator */}
                      {ticket.schedules && ticket.schedules.length > 0 && (
                        <div className="hidden md:block px-3 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                          Scheduled
                        </div>
                      )}

                      <ChevronRight size={16} className="text-zinc-500" />
                    </button>
                  );
                })}
                {tickets.length === 0 && (
                  <div className="p-8 text-center text-zinc-500">
                    {hasActiveFilters
                      ? 'No tickets match your filters'
                      : 'No tickets yet. Create your first ticket to get started.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Today's Schedule - Sidebar */}
          <div className="bg-zinc-800 rounded-lg h-fit">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="font-semibold text-white">Today's Schedule</h2>
              <button
                onClick={() => navigate('/service/weekly-planning')}
                className="text-sm hover:underline"
                style={{ color: brandColors.success }}
              >
                Full Calendar
              </button>
            </div>
            <div className="divide-y divide-zinc-700">
              {todaySchedule.map(schedule => (
                <button
                  key={schedule.id}
                  onClick={() => navigate(`/service/tickets/${schedule.ticket_id}`)}
                  className="w-full p-4 hover:bg-zinc-700/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Clock size={14} />
                    {schedule.scheduled_time_start || 'TBD'}
                  </div>
                  <div className="text-white mt-1">
                    {schedule.ticket?.customer_name || 'Customer'}
                  </div>
                  <div className="text-sm text-zinc-400 truncate">
                    {schedule.service_address || schedule.ticket?.customer_address}
                  </div>
                </button>
              ))}
              {todaySchedule.length === 0 && (
                <div className="p-8 text-center text-zinc-500">
                  No appointments scheduled for today
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats by Category */}
        {stats?.byCategory && Object.keys(stats.byCategory).length > 0 && (
          <div className="mt-6 bg-zinc-800 rounded-lg p-4">
            <h2 className="font-semibold text-white mb-4">Tickets by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Show All button to clear category filter */}
              <button
                onClick={() => {
                  setFilters(prev => ({ ...prev, category: '' }));
                }}
                className={`p-3 rounded-lg transition-colors text-left flex items-center gap-3 ${
                  !filters.category
                    ? 'bg-violet-600/30 border border-violet-500/50'
                    : 'bg-zinc-700/50 hover:bg-zinc-700'
                }`}
              >
                <LayoutGrid size={18} className={!filters.category ? 'text-violet-400' : 'text-zinc-400'} />
                <div>
                  <div className="text-lg font-bold text-white">
                    {Object.values(stats.byCategory).reduce((sum, c) => sum + c, 0)}
                  </div>
                  <div className={`text-sm ${!filters.category ? 'text-violet-400' : 'text-zinc-400'}`}>Show All</div>
                </div>
              </button>
              {Object.entries(stats.byCategory).map(([category, count]) => {
                const Icon = categoryIcons[category] || Wrench;
                const isActive = filters.category === category;
                return (
                  <button
                    key={category}
                    onClick={() => setFilters(prev => ({ ...prev, category: isActive ? '' : category }))}
                    className={`p-3 rounded-lg transition-colors text-left flex items-center gap-3 ${
                      isActive
                        ? 'bg-violet-600/30 border border-violet-500/50'
                        : 'bg-zinc-700/50 hover:bg-zinc-700'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-violet-400' : 'text-zinc-400'} />
                    <div>
                      <div className="text-lg font-bold text-white">{count}</div>
                      <div className={`text-sm capitalize ${isActive ? 'text-violet-400' : 'text-zinc-400'}`}>{category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceDashboard;
