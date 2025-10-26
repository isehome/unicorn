/**
 * CSV Export Service for Purchase Orders
 *
 * Exports PO data to CSV format for SharePoint storage.
 * Format matches the specification:
 * PO Number, Supplier, Order Date, Line, Part Number, Description, Qty, Unit Cost, Total, Status
 */

import { saveAs } from 'file-saver';

class CSVExportService {
  /**
   * Generate CSV content from PO data
   *
   * @param {Object} poData - Complete PO data from poGeneratorService.getPOForExport()
   * @returns {string} CSV content
   */
  generatePOCSV(poData) {
    const { po, supplier, items } = poData;

    // CSV Header
    const headers = [
      'PO Number',
      'Supplier',
      'Order Date',
      'Line',
      'Part Number',
      'Description',
      'Qty',
      'Unit Cost',
      'Total',
      'Status'
    ];

    // CSV Rows (one per line item)
    const rows = items.map(item => [
      po.po_number || '',
      supplier?.name || '',
      this.formatDate(po.order_date),
      item.line_number || '',
      item.part_number || '',
      this.escapeCsvValue(item.description || ''),
      item.quantity_ordered || 0,
      this.formatNumber(item.unit_cost || 0),
      this.formatNumber(item.line_total || 0),
      this.formatStatus(po.status)
    ]);

    // Combine header and rows
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Generate CSV with summary totals at the end
   *
   * @param {Object} poData - Complete PO data
   * @returns {string} CSV content with totals
   */
  generatePOCSVWithTotals(poData) {
    const { po } = poData;
    const baseCSV = this.generatePOCSV(poData);

    // Add blank line and totals
    const totalsLines = [
      '',
      `,,,,,,Subtotal,,${this.formatNumber(po.subtotal || 0)},`,
      po.tax_amount > 0 ? `,,,,,,Tax,,${this.formatNumber(po.tax_amount)},` : null,
      po.shipping_cost > 0 ? `,,,,,,Shipping,,${this.formatNumber(po.shipping_cost)},` : null,
      `,,,,,,TOTAL,,${this.formatNumber(po.total_amount || 0)},`
    ].filter(line => line !== null);

    return baseCSV + '\n' + totalsLines.join('\n');
  }

  /**
   * Generate CSV for multiple POs (bulk export)
   *
   * @param {Array<Object>} posData - Array of PO data objects
   * @returns {string} Combined CSV content
   */
  generateBulkPOCSV(posData) {
    if (!posData || posData.length === 0) {
      return '';
    }

    // CSV Header (same for all)
    const headers = [
      'PO Number',
      'Supplier',
      'Order Date',
      'Line',
      'Part Number',
      'Description',
      'Qty',
      'Unit Cost',
      'Total',
      'Status'
    ];

    const allRows = [];

    // Add all items from all POs
    posData.forEach(poData => {
      const { po, supplier, items } = poData;

      items.forEach(item => {
        allRows.push([
          po.po_number || '',
          supplier?.name || '',
          this.formatDate(po.order_date),
          item.line_number || '',
          item.part_number || '',
          this.escapeCsvValue(item.description || ''),
          item.quantity_ordered || 0,
          this.formatNumber(item.unit_cost || 0),
          this.formatNumber(item.line_total || 0),
          this.formatStatus(po.status)
        ]);
      });
    });

    // Combine header and rows
    const csvLines = [
      headers.join(','),
      ...allRows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Download CSV to user's computer
   *
   * @param {Object} poData - PO data
   * @param {boolean} includeTotals - Include totals at bottom
   * @param {string} filename - Optional custom filename
   */
  async downloadCSV(poData, includeTotals = false, filename = null) {
    const csvContent = includeTotals
      ? this.generatePOCSVWithTotals(poData)
      : this.generatePOCSV(poData);

    const defaultFilename = filename || `${poData.po.po_number}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, defaultFilename);
  }

  /**
   * Get CSV as Blob (for SharePoint upload)
   *
   * @param {Object} poData - PO data
   * @param {boolean} includeTotals - Include totals at bottom
   * @returns {Blob} CSV blob
   */
  async getCSVBlob(poData, includeTotals = false) {
    const csvContent = includeTotals
      ? this.generatePOCSVWithTotals(poData)
      : this.generatePOCSV(poData);

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Get CSV as string (for API uploads or processing)
   *
   * @param {Object} poData - PO data
   * @param {boolean} includeTotals - Include totals at bottom
   * @returns {string} CSV content
   */
  async getCSVString(poData, includeTotals = false) {
    return includeTotals
      ? this.generatePOCSVWithTotals(poData)
      : this.generatePOCSV(poData);
  }

  /**
   * Download bulk CSV (multiple POs)
   *
   * @param {Array<Object>} posData - Array of PO data objects
   * @param {string} filename - Filename for download
   */
  async downloadBulkCSV(posData, filename = 'purchase_orders.csv') {
    const csvContent = this.generateBulkPOCSV(posData);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, filename);
  }

  /**
   * Copy CSV to clipboard
   *
   * @param {Object} poData - PO data
   * @param {boolean} includeTotals - Include totals at bottom
   * @returns {Promise<boolean>} Success status
   */
  async copyToClipboard(poData, includeTotals = false) {
    try {
      const csvContent = includeTotals
        ? this.generatePOCSVWithTotals(poData)
        : this.generatePOCSV(poData);

      await navigator.clipboard.writeText(csvContent);
      return true;
    } catch (error) {
      console.error('Error copying CSV to clipboard:', error);
      return false;
    }
  }

  /**
   * Generate summary CSV for a project (all POs)
   *
   * @param {Array<Object>} posData - Array of PO data
   * @returns {string} Summary CSV
   */
  generateProjectSummaryCSV(posData) {
    const headers = [
      'PO Number',
      'Supplier',
      'Order Date',
      'Requested Delivery',
      'Status',
      'Items',
      'Total Amount'
    ];

    const rows = posData.map(poData => {
      const { po, supplier, items } = poData;
      return [
        po.po_number || '',
        supplier?.name || '',
        this.formatDate(po.order_date),
        this.formatDate(po.requested_delivery_date),
        this.formatStatus(po.status),
        items?.length || 0,
        this.formatNumber(po.total_amount || 0)
      ];
    });

    // Add grand total
    const grandTotal = posData.reduce((sum, poData) => sum + (poData.po.total_amount || 0), 0);
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'GRAND TOTAL',
      this.formatNumber(grandTotal)
    ]);

    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Download project summary CSV
   *
   * @param {Array<Object>} posData - Array of PO data
   * @param {string} projectName - Project name for filename
   */
  async downloadProjectSummary(posData, projectName = 'Project') {
    const csvContent = this.generateProjectSummaryCSV(posData);
    const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}_PO_Summary.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, filename);
  }

  // ===== UTILITY METHODS =====

  /**
   * Escape CSV values that contain commas, quotes, or newlines
   */
  escapeCsvValue(value) {
    if (value == null) return '';

    const strValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
      return `"${strValue.replace(/"/g, '""')}"`;
    }

    return strValue;
  }

  /**
   * Format number with 2 decimal places
   */
  formatNumber(num) {
    return Number(num || 0).toFixed(2);
  }

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      draft: 'Draft',
      submitted: 'Submitted',
      received: 'Received',
      cancelled: 'Cancelled'
    };
    return statusMap[status] || status;
  }

  /**
   * Parse CSV file (for import/validation)
   *
   * @param {File} file - CSV file
   * @returns {Promise<Array>} Parsed CSV data
   */
  async parseCSVFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n');
          const headers = lines[0].split(',').map(h => h.trim());

          const data = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
              const values = this.parseCSVLine(line);
              const row = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              return row;
            });

          resolve({ headers, data });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse a single CSV line (handles quoted values)
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }
}

// Export singleton instance
export const csvExportService = new CSVExportService();
export default csvExportService;
