/**
 * serviceReportService.js
 * Service for generating service reports and analytics
 */

import { supabase } from '../lib/supabase';

export const serviceReportService = {
  /**
   * Get detailed service report by date range with optional filters
   */
  async getServiceReport({
    startDate,
    endDate,
    customerId = null,
    technicianId = null,
    category = null,
    status = null
  }) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.rpc('get_service_report', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_customer_id: customerId,
        p_technician_id: technicianId,
        p_category: category,
        p_status: status
      });

      if (error) {
        console.error('[serviceReportService] Get report failed:', error);
        throw new Error(error.message || 'Failed to get service report');
      }

      return data || [];
    } catch (error) {
      console.error('[serviceReportService] Get report error:', error);
      throw error;
    }
  },

  /**
   * Get summary totals for a date range
   */
  async getServiceSummary({
    startDate,
    endDate,
    customerId = null,
    technicianId = null
  }) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.rpc('get_service_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_customer_id: customerId,
        p_technician_id: technicianId
      });

      if (error) {
        console.error('[serviceReportService] Get summary failed:', error);
        throw new Error(error.message || 'Failed to get service summary');
      }

      return data?.[0] || {
        total_tickets: 0,
        closed_tickets: 0,
        open_tickets: 0,
        total_hours: 0,
        total_labor_cost: 0,
        total_parts_cost: 0,
        total_revenue: 0
      };
    } catch (error) {
      console.error('[serviceReportService] Get summary error:', error);
      throw error;
    }
  },

  /**
   * Get monthly overview data for charts
   */
  async getMonthlyOverview(year, month) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.rpc('get_service_monthly_overview', {
        p_year: year,
        p_month: month
      });

      if (error) {
        console.error('[serviceReportService] Get monthly overview failed:', error);
        throw new Error(error.message || 'Failed to get monthly overview');
      }

      return data || [];
    } catch (error) {
      console.error('[serviceReportService] Get monthly overview error:', error);
      throw error;
    }
  },

  /**
   * Get technician hours report
   */
  async getTechnicianHoursReport(startDate, endDate) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.rpc('get_technician_hours_report', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('[serviceReportService] Get technician hours failed:', error);
        throw new Error(error.message || 'Failed to get technician hours');
      }

      return data || [];
    } catch (error) {
      console.error('[serviceReportService] Get technician hours error:', error);
      throw error;
    }
  },

  /**
   * Get customer hours report
   */
  async getCustomerHoursReport(startDate, endDate) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.rpc('get_customer_hours_report', {
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('[serviceReportService] Get customer hours failed:', error);
        throw new Error(error.message || 'Failed to get customer hours');
      }

      return data || [];
    } catch (error) {
      console.error('[serviceReportService] Get customer hours error:', error);
      throw error;
    }
  },

  /**
   * Get customer summary (for dropdown)
   */
  async getCustomerSummary() {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('service_customer_summary')
        .select('*')
        .gt('total_tickets', 0)
        .order('total_tickets', { ascending: false });

      if (error) {
        console.error('[serviceReportService] Get customer summary failed:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[serviceReportService] Get customer summary error:', error);
      return [];
    }
  },

  /**
   * Export report data to CSV
   */
  exportToCSV(data, filename = 'service_report.csv') {
    if (!data || data.length === 0) {
      throw new Error('No data to export');
    }

    // Get headers from first row
    const headers = Object.keys(data[0]);

    // Build CSV content
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(row =>
        headers.map(header => {
          let cell = row[header];
          // Handle null/undefined
          if (cell === null || cell === undefined) {
            cell = '';
          }
          // Convert to string
          cell = String(cell);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            cell = `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Get date presets for quick filtering
   */
  getDatePresets() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // This month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // This quarter
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const thisQuarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const thisQuarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0);

    // This year
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const thisYearEnd = new Date(now.getFullYear(), 11, 31);

    // Last 30 days
    const last30DaysStart = new Date(today);
    last30DaysStart.setDate(last30DaysStart.getDate() - 30);

    // Last 90 days
    const last90DaysStart = new Date(today);
    last90DaysStart.setDate(last90DaysStart.getDate() - 90);

    return [
      {
        label: 'This Month',
        value: 'this_month',
        startDate: this.formatDate(thisMonthStart),
        endDate: this.formatDate(thisMonthEnd)
      },
      {
        label: 'Last Month',
        value: 'last_month',
        startDate: this.formatDate(lastMonthStart),
        endDate: this.formatDate(lastMonthEnd)
      },
      {
        label: 'Last 30 Days',
        value: 'last_30_days',
        startDate: this.formatDate(last30DaysStart),
        endDate: this.formatDate(today)
      },
      {
        label: 'Last 90 Days',
        value: 'last_90_days',
        startDate: this.formatDate(last90DaysStart),
        endDate: this.formatDate(today)
      },
      {
        label: 'This Quarter',
        value: 'this_quarter',
        startDate: this.formatDate(thisQuarterStart),
        endDate: this.formatDate(thisQuarterEnd)
      },
      {
        label: 'This Year',
        value: 'this_year',
        startDate: this.formatDate(thisYearStart),
        endDate: this.formatDate(thisYearEnd)
      },
      {
        label: 'Custom',
        value: 'custom',
        startDate: null,
        endDate: null
      }
    ];
  },

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  },

  /**
   * Format hours
   */
  formatHours(hours) {
    if (!hours && hours !== 0) return '--';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
};

export default serviceReportService;
