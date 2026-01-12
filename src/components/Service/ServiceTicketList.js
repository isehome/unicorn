/**
 * ServiceTicketList.js
 * Filterable/searchable list of service tickets
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  Plus,
  ChevronRight,
  X,
  ChevronDown,
  Wifi,
  Tv,
  Sun,
  Settings,
  Cable,
  Wrench
} from 'lucide-react';
import { serviceTicketService } from '../../services/serviceTicketService';
import { useAppState } from '../../contexts/AppStateContext';
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
  { value: 'resolved', label: 'Resolved' },
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

const ServiceTicketList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { publishState, registerActions, unregisterActions, setView } = useAppState();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  // Filters from URL params
  const [filters, setFilters] = useState({
    status: searchParams.get('status')?.split(',').filter(Boolean) || [],
    priority: searchParams.get('priority') || '',
    category: searchParams.get('category') || ''
  });

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

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

      const { tickets: data } = await serviceTicketService.getAll(queryFilters);
      setTickets(data);
    } catch (err) {
      console.error('[ServiceTicketList] Failed to load tickets:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [filters, searchQuery]);

  useEffect(() => {
    loadTickets();
    setView('service-ticket-list');
  }, [loadTickets, setView]);

  // Load skill categories from database (only those marked as show_in_service)
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('skill_categories')
          .select('name, label, color')
          .eq('is_active', true)
          .neq('show_in_service', false) // Include categories where show_in_service is true or null
          .order('sort_order');

        if (!error && data?.length > 0) {
          setCategories(data.map(c => ({ value: c.name, label: c.label, color: c.color })));
        }
      } catch (err) {
        console.log('[ServiceTicketList] Using default categories');
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
    setSearchParams(params, { replace: true });
  }, [filters, searchQuery, setSearchParams]);

  // Publish state for AI Brain
  useEffect(() => {
    publishState({
      view: 'service-ticket-list',
      ticketCount: tickets.length,
      filters,
      searchQuery
    });
  }, [tickets, filters, searchQuery, publishState]);

  // Register actions for AI Brain
  useEffect(() => {
    const actions = {
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
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions]);

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
  };

  const hasActiveFilters = filters.status.length > 0 || filters.priority || filters.category || searchQuery;

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
    const p = PRIORITIES.find(pr => pr.value === priority);
    return p?.color || 'bg-zinc-500';
  };

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

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Tickets</h1>
            <p className="text-zinc-400">
              {loading ? 'Loading...' : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`}
            </p>
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

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Tickets List */}
        <div className="bg-zinc-800 rounded-lg divide-y divide-zinc-700">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2"
                style={{ borderColor: brandColors.success }}
              />
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              {hasActiveFilters
                ? 'No tickets match your filters'
                : 'No tickets yet. Create your first ticket to get started.'}
            </div>
          ) : (
            tickets.map(ticket => {
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
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceTicketList;
