/**
 * ServiceReports.js
 * Service reporting page with date range filtering and analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Users,
  FileText,
  Download,
  Loader2,
  BarChart2,
  TrendingUp,
  ChevronDown,
  X
} from 'lucide-react';
import { serviceReportService } from '../services/serviceReportService';
import { technicianService } from '../services/serviceTicketService';
import { useAppState } from '../contexts/AppStateContext';
import { brandColors } from '../styles/styleSystem';

const ServiceReports = () => {
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();

  // Date range state
  const [datePreset, setDatePreset] = useState('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const presets = serviceReportService.getDatePresets();

  // Filter state
  const [customerId, setCustomerId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [technicianHours, setTechnicianHours] = useState([]);
  const [customerHours, setCustomerHours] = useState([]);

  // Active tab
  const [activeTab, setActiveTab] = useState('overview');

  // Initialize dates from preset
  useEffect(() => {
    const preset = presets.find(p => p.value === datePreset);
    if (preset && preset.startDate && preset.endDate) {
      setStartDate(preset.startDate);
      setEndDate(preset.endDate);
    }
  }, [datePreset, presets]);

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [customerData, techData] = await Promise.all([
          serviceReportService.getCustomerSummary(),
          technicianService.getAll()
        ]);
        setCustomers(customerData);
        setTechnicians(techData);
      } catch (err) {
        console.error('[ServiceReports] Failed to load filter options:', err);
      }
    };
    loadFilterOptions();
  }, []);

  // Load report data
  const loadReportData = useCallback(async () => {
    if (!startDate || !endDate) return;

    try {
      setLoading(true);
      setError(null);

      const [summaryData, tickets, techHours, custHours] = await Promise.all([
        serviceReportService.getServiceSummary({
          startDate,
          endDate,
          customerId: customerId || null,
          technicianId: technicianId || null
        }),
        serviceReportService.getServiceReport({
          startDate,
          endDate,
          customerId: customerId || null,
          technicianId: technicianId || null
        }),
        serviceReportService.getTechnicianHoursReport(startDate, endDate),
        serviceReportService.getCustomerHoursReport(startDate, endDate)
      ]);

      setSummary(summaryData);
      setReportData(tickets);
      setTechnicianHours(techHours);
      setCustomerHours(custHours);
    } catch (err) {
      console.error('[ServiceReports] Load error:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, customerId, technicianId]);

  // Load data when filters change
  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Export handlers (defined before actions useEffect so they can be referenced)
  const handleExportTickets = useCallback(() => {
    if (reportData.length === 0) return;
    const filename = `service_tickets_${startDate}_to_${endDate}.csv`;
    serviceReportService.exportToCSV(reportData, filename);
  }, [reportData, startDate, endDate]);

  const handleExportTechnicians = useCallback(() => {
    if (technicianHours.length === 0) return;
    const filename = `technician_hours_${startDate}_to_${endDate}.csv`;
    serviceReportService.exportToCSV(technicianHours, filename);
  }, [technicianHours, startDate, endDate]);

  const handleExportCustomers = useCallback(() => {
    if (customerHours.length === 0) return;
    const filename = `customer_summary_${startDate}_to_${endDate}.csv`;
    serviceReportService.exportToCSV(customerHours, filename);
  }, [customerHours, startDate, endDate]);

  // Clear filters
  const clearFilters = () => {
    setCustomerId('');
    setTechnicianId('');
  };

  // Publish state for AI Brain
  useEffect(() => {
    const reportTypes = ['overview', 'tickets', 'technicians', 'customers'];
    publishState({
      view: 'service-reports',
      reportTypes,
      activeTab,
      filters: {
        datePreset,
        startDate,
        endDate,
        customerId: customerId || null,
        technicianId: technicianId || null
      },
      summary: summary ? {
        totalTickets: summary.total_tickets,
        openTickets: summary.open_tickets,
        closedTickets: summary.closed_tickets,
        totalHours: summary.total_hours,
        totalRevenue: summary.total_revenue
      } : null,
      ticketCount: reportData.length,
      technicianCount: technicianHours.length,
      customerCount: customerHours.length,
      hint: 'User is viewing service reports. Can generate reports, change date ranges, filter by customer/technician, switch report tabs, or export data.'
    });
  }, [activeTab, datePreset, startDate, endDate, customerId, technicianId, summary, reportData.length, technicianHours.length, customerHours.length, publishState]);

  // Register actions for AI Brain
  useEffect(() => {
    const actions = {
      generate_report: async () => {
        await loadReportData();
        return { success: true, message: 'Report data refreshed' };
      },
      select_date_range: async ({ preset, start, end }) => {
        if (preset) {
          const validPreset = presets.find(p => p.value === preset);
          if (!validPreset) {
            return { success: false, error: `Invalid preset. Available: ${presets.map(p => p.value).join(', ')}` };
          }
          setDatePreset(preset);
          return { success: true, message: `Date range set to ${validPreset.label}` };
        } else if (start && end) {
          setDatePreset('custom');
          setStartDate(start);
          setEndDate(end);
          return { success: true, message: `Custom date range set: ${start} to ${end}` };
        }
        return { success: false, error: 'Please provide either a preset or start/end dates' };
      },
      export_report: async ({ type }) => {
        const exportType = type || activeTab;
        switch (exportType) {
          case 'tickets':
            if (reportData.length === 0) {
              return { success: false, error: 'No ticket data to export' };
            }
            handleExportTickets();
            return { success: true, message: `Exported ${reportData.length} tickets to CSV` };
          case 'technicians':
            if (technicianHours.length === 0) {
              return { success: false, error: 'No technician data to export' };
            }
            handleExportTechnicians();
            return { success: true, message: `Exported ${technicianHours.length} technician records to CSV` };
          case 'customers':
            if (customerHours.length === 0) {
              return { success: false, error: 'No customer data to export' };
            }
            handleExportCustomers();
            return { success: true, message: `Exported ${customerHours.length} customer records to CSV` };
          default:
            return { success: false, error: `Invalid export type. Use: tickets, technicians, or customers` };
        }
      },
      select_report_type: async ({ type }) => {
        const validTypes = ['overview', 'tickets', 'technicians', 'customers'];
        if (!validTypes.includes(type)) {
          return { success: false, error: `Invalid report type. Available: ${validTypes.join(', ')}` };
        }
        setActiveTab(type);
        return { success: true, message: `Switched to ${type} report` };
      },
      filter_by_customer: async ({ customerId: custId }) => {
        if (custId) {
          const customer = customers.find(c => c.customer_id === custId);
          setCustomerId(custId);
          return { success: true, message: `Filtered by customer: ${customer?.customer_name || custId}` };
        } else {
          setCustomerId('');
          return { success: true, message: 'Customer filter cleared' };
        }
      },
      filter_by_technician: async ({ technicianId: techId }) => {
        if (techId) {
          const tech = technicians.find(t => t.id === techId);
          setTechnicianId(techId);
          return { success: true, message: `Filtered by technician: ${tech?.full_name || techId}` };
        } else {
          setTechnicianId('');
          return { success: true, message: 'Technician filter cleared' };
        }
      },
      clear_filters: async () => {
        clearFilters();
        return { success: true, message: 'All filters cleared' };
      },
      get_summary: () => {
        if (!summary) {
          return { success: false, error: 'Summary data not loaded yet' };
        }
        return {
          success: true,
          summary: {
            totalTickets: summary.total_tickets,
            openTickets: summary.open_tickets,
            closedTickets: summary.closed_tickets,
            totalHours: serviceReportService.formatHours(summary.total_hours),
            laborCost: serviceReportService.formatCurrency(summary.total_labor_cost),
            partsCost: serviceReportService.formatCurrency(summary.total_parts_cost),
            totalRevenue: serviceReportService.formatCurrency(summary.total_revenue)
          },
          dateRange: { startDate, endDate }
        };
      },
      list_available_presets: () => {
        return {
          success: true,
          presets: presets.map(p => ({ value: p.value, label: p.label })),
          currentPreset: datePreset
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [
    activeTab, datePreset, startDate, endDate, customerId, technicianId,
    summary, reportData, technicianHours, customerHours, customers, technicians,
    presets, loadReportData, registerActions, unregisterActions,
    handleExportTickets, handleExportTechnicians, handleExportCustomers
  ]);

  const hasFilters = customerId || technicianId;

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/service/tickets')}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Service Reports</h1>
            <p className="text-sm text-zinc-400">Analyze service ticket data and performance</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-zinc-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Preset */}
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm text-zinc-400 mb-1 block">Date Range</label>
              <div className="relative">
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500 appearance-none pr-8"
                >
                  {presets.map(preset => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Custom date inputs */}
            {datePreset === 'custom' && (
              <>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </>
            )}

            {/* Customer Filter */}
            <div className="min-w-[180px]">
              <label className="text-sm text-zinc-400 mb-1 block">Customer</label>
              <div className="relative">
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500 appearance-none pr-8"
                >
                  <option value="">All Customers</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.customer_name} ({c.total_tickets})
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Technician Filter */}
            <div className="min-w-[180px]">
              <label className="text-sm text-zinc-400 mb-1 block">Technician</label>
              <div className="relative">
                <select
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500 appearance-none pr-8"
                >
                  <option value="">All Technicians</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Clear Filters */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={16} />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-zinc-400" size={32} />
            <span className="ml-3 text-zinc-400">Loading report data...</span>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <FileText size={16} />
                  Total Tickets
                </div>
                <div className="text-2xl font-bold text-white">
                  {summary?.total_tickets || 0}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {summary?.closed_tickets || 0} closed / {summary?.open_tickets || 0} open
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <Clock size={16} />
                  Total Hours
                </div>
                <div className="text-2xl font-bold text-white">
                  {serviceReportService.formatHours(summary?.total_hours)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Logged time
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                  <DollarSign size={16} />
                  Labor Cost
                </div>
                <div className="text-2xl font-bold text-white">
                  {serviceReportService.formatCurrency(summary?.total_labor_cost)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  + {serviceReportService.formatCurrency(summary?.total_parts_cost)} parts
                </div>
              </div>

              <div className="bg-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm mb-1" style={{ color: brandColors.success }}>
                  <TrendingUp size={16} />
                  Total Revenue
                </div>
                <div className="text-2xl font-bold" style={{ color: brandColors.success }}>
                  {serviceReportService.formatCurrency(summary?.total_revenue)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Labor + Parts
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-700 mb-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <BarChart2 size={16} className="inline-block mr-2" />
                Overview
              </button>
              <button
                onClick={() => setActiveTab('tickets')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tickets'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText size={16} className="inline-block mr-2" />
                Tickets ({reportData.length})
              </button>
              <button
                onClick={() => setActiveTab('technicians')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'technicians'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Users size={16} className="inline-block mr-2" />
                Technicians ({technicianHours.length})
              </button>
              <button
                onClick={() => setActiveTab('customers')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'customers'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Users size={16} className="inline-block mr-2" />
                Customers ({customerHours.length})
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Technician Hours Chart */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-4">Hours by Technician</h3>
                  {technicianHours.length === 0 ? (
                    <p className="text-zinc-500 text-center py-8">No time data for this period</p>
                  ) : (
                    <div className="space-y-3">
                      {technicianHours.map((tech, idx) => {
                        const maxHours = Math.max(...technicianHours.map(t => t.total_hours));
                        const percent = (tech.total_hours / maxHours) * 100;
                        return (
                          <div key={idx}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-white">{tech.technician_name || 'Unknown'}</span>
                              <span className="text-zinc-400">
                                {serviceReportService.formatHours(tech.total_hours)} ({tech.tickets_worked} tickets)
                              </span>
                            </div>
                            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${percent}%`,
                                  backgroundColor: brandColors.success
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Customer Revenue Chart */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-4">Revenue by Customer</h3>
                  {customerHours.length === 0 ? (
                    <p className="text-zinc-500 text-center py-8">No revenue data for this period</p>
                  ) : (
                    <div className="space-y-3">
                      {customerHours.slice(0, 10).map((cust, idx) => {
                        const maxRevenue = Math.max(...customerHours.map(c => c.total_cost));
                        const percent = maxRevenue > 0 ? (cust.total_cost / maxRevenue) * 100 : 0;
                        return (
                          <div key={idx}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-white">{cust.customer_name || 'Unknown'}</span>
                              <span className="text-zinc-400">
                                {serviceReportService.formatCurrency(cust.total_cost)} ({cust.total_tickets} tickets)
                              </span>
                            </div>
                            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tickets' && (
              <div className="bg-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Ticket Details</h3>
                  <button
                    onClick={handleExportTickets}
                    disabled={reportData.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>
                {reportData.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    No tickets found for this period
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-700/50">
                        <tr>
                          <th className="text-left p-3 text-zinc-400 font-medium">Ticket</th>
                          <th className="text-left p-3 text-zinc-400 font-medium">Customer</th>
                          <th className="text-left p-3 text-zinc-400 font-medium">Status</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Hours</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Labor</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Parts</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-700">
                        {reportData.map((ticket, idx) => (
                          <tr
                            key={idx}
                            onClick={() => navigate(`/service/tickets/${ticket.ticket_id}`)}
                            className="hover:bg-zinc-700/30 cursor-pointer"
                          >
                            <td className="p-3">
                              <div className="text-white font-mono text-xs">{ticket.ticket_number}</div>
                              <div className="text-zinc-400 truncate max-w-[200px]">{ticket.title}</div>
                            </td>
                            <td className="p-3 text-zinc-300">{ticket.customer_name || '--'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                ticket.status === 'closed' ? 'bg-zinc-500/20 text-zinc-400' :
                                ticket.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatHours(ticket.total_hours)}
                            </td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatCurrency(ticket.labor_cost)}
                            </td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatCurrency(ticket.parts_cost)}
                            </td>
                            <td className="p-3 text-right font-medium" style={{ color: brandColors.success }}>
                              {serviceReportService.formatCurrency(ticket.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'technicians' && (
              <div className="bg-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Technician Hours</h3>
                  <button
                    onClick={handleExportTechnicians}
                    disabled={technicianHours.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>
                {technicianHours.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    No technician hours for this period
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-700/50">
                        <tr>
                          <th className="text-left p-3 text-zinc-400 font-medium">Technician</th>
                          <th className="text-left p-3 text-zinc-400 font-medium">Email</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Tickets</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Entries</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Total Hours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-700">
                        {technicianHours.map((tech, idx) => (
                          <tr key={idx} className="hover:bg-zinc-700/30">
                            <td className="p-3 text-white">{tech.technician_name || 'Unknown'}</td>
                            <td className="p-3 text-zinc-400">{tech.technician_email || '--'}</td>
                            <td className="p-3 text-right text-zinc-300">{tech.tickets_worked}</td>
                            <td className="p-3 text-right text-zinc-300">{tech.total_entries}</td>
                            <td className="p-3 text-right font-medium" style={{ color: brandColors.success }}>
                              {serviceReportService.formatHours(tech.total_hours)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'customers' && (
              <div className="bg-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Customer Summary</h3>
                  <button
                    onClick={handleExportCustomers}
                    disabled={customerHours.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>
                {customerHours.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    No customer data for this period
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-700/50">
                        <tr>
                          <th className="text-left p-3 text-zinc-400 font-medium">Customer</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Tickets</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Hours</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Labor</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Parts</th>
                          <th className="text-right p-3 text-zinc-400 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-700">
                        {customerHours.map((cust, idx) => (
                          <tr key={idx} className="hover:bg-zinc-700/30">
                            <td className="p-3 text-white">{cust.customer_name || 'Unknown'}</td>
                            <td className="p-3 text-right text-zinc-300">{cust.total_tickets}</td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatHours(cust.total_hours)}
                            </td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatCurrency(cust.total_labor_cost)}
                            </td>
                            <td className="p-3 text-right text-zinc-300">
                              {serviceReportService.formatCurrency(cust.total_parts_cost)}
                            </td>
                            <td className="p-3 text-right font-medium" style={{ color: brandColors.success }}>
                              {serviceReportService.formatCurrency(cust.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ServiceReports;
