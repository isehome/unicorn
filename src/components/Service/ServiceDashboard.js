/**
 * ServiceDashboard.js
 * Main dashboard for Service CRM module
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Cable
} from 'lucide-react';
import {
  serviceTicketService,
  serviceScheduleService,
  serviceCallLogService
} from '../../services/serviceTicketService';
import { useAppState } from '../../contexts/AppStateContext';
import { brandColors } from '../../styles/styleSystem';

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

const ServiceDashboard = () => {
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions, setView } = useAppState();

  const [stats, setStats] = useState(null);
  const [recentTickets, setRecentTickets] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [statsData, ticketsData, scheduleData, callsData] = await Promise.all([
        serviceTicketService.getStats(),
        serviceTicketService.getAll({ limit: 10 }),
        serviceScheduleService.getByDateRange(
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0]
        ),
        serviceCallLogService.getRecent(10)
      ]);

      setStats(statsData);
      setRecentTickets(ticketsData.tickets);
      setTodaySchedule(scheduleData);
      setRecentCalls(callsData);
    } catch (err) {
      console.error('[ServiceDashboard] Failed to load data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    setView('service-dashboard');
  }, [loadDashboardData, setView]);

  // Publish state for AI Brain
  useEffect(() => {
    publishState({
      view: 'service-dashboard',
      stats,
      openTickets: recentTickets.filter(t => !['resolved', 'closed'].includes(t.status)).length,
      todayAppointments: todaySchedule.length
    });
  }, [stats, recentTickets, todaySchedule, publishState]);

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
        const ticket = recentTickets.find(t =>
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
          tickets: recentTickets
            .filter(t => !['resolved', 'closed'].includes(t.status))
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
          tickets: recentTickets
            .filter(t => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status))
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
      refresh_dashboard: async () => {
        await loadDashboardData();
        return { success: true, message: 'Dashboard refreshed' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [recentTickets, todaySchedule, navigate, registerActions, unregisterActions, loadDashboardData]);

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
      case 'resolved':
        return { backgroundColor: 'rgba(148, 175, 50, 0.2)', color: brandColors.success };
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
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Dashboard</h1>
            <p className="text-zinc-400">Manage support tickets and service calls</p>
          </div>
          <button
            onClick={() => navigate('/service/tickets/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: brandColors.success, color: '#000' }}
          >
            <Plus size={18} />
            New Ticket
          </button>
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
            onClick={() => navigate('/service/tickets?status=open')}
          />
          <StatCard
            icon={Calendar}
            label="Today's Schedule"
            value={todaySchedule.length}
            subValue="appointments"
            color="bg-blue-500/20 text-blue-500"
            onClick={() => navigate('/service/schedule')}
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
                  {stats?.byStatus?.resolved || 0}
                </div>
                <div className="text-sm text-zinc-400">Resolved This Week</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Tickets */}
          <div className="lg:col-span-2 bg-zinc-800 rounded-lg">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="font-semibold text-white">Recent Tickets</h2>
              <button
                onClick={() => navigate('/service/tickets')}
                className="text-sm hover:underline"
                style={{ color: brandColors.success }}
              >
                View All
              </button>
            </div>
            <div className="divide-y divide-zinc-700">
              {recentTickets.slice(0, 5).map(ticket => {
                const statusStyle = getStatusStyles(ticket.status);
                return (
                  <button
                    key={ticket.id}
                    onClick={() => navigate(`/service/tickets/${ticket.id}`)}
                    className="w-full p-4 hover:bg-zinc-700/50 transition-colors text-left flex items-center gap-4"
                  >
                    <div className={`w-2 h-2 rounded-full ${getPriorityColor(ticket.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">{ticket.ticket_number}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${typeof statusStyle === 'string' ? statusStyle : ''}`}
                          style={typeof statusStyle === 'object' ? statusStyle : undefined}
                        >
                          {ticket.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-white truncate">{ticket.title}</div>
                      <div className="text-sm text-zinc-400">
                        {ticket.customer_name || ticket.contact?.full_name || 'Unknown Customer'}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-500" />
                  </button>
                );
              })}
              {recentTickets.length === 0 && (
                <div className="p-8 text-center text-zinc-500">
                  No tickets yet. Create your first ticket to get started.
                </div>
              )}
            </div>
          </div>

          {/* Today's Schedule */}
          <div className="bg-zinc-800 rounded-lg">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="font-semibold text-white">Today's Schedule</h2>
              <button
                onClick={() => navigate('/service/schedule')}
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
              {Object.entries(stats.byCategory).map(([category, count]) => {
                const Icon = categoryIcons[category] || Wrench;
                return (
                  <button
                    key={category}
                    onClick={() => navigate(`/service/tickets?category=${category}`)}
                    className="p-3 bg-zinc-700/50 rounded-lg hover:bg-zinc-700 transition-colors text-left flex items-center gap-3"
                  >
                    <Icon size={18} className="text-zinc-400" />
                    <div>
                      <div className="text-lg font-bold text-white">{count}</div>
                      <div className="text-sm text-zinc-400 capitalize">{category}</div>
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
