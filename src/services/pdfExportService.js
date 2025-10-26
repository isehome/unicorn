/**
 * PDF Export Service for Purchase Orders
 *
 * Generates professional PDF purchase orders using jsPDF and jspdf-autotable
 * with logo placement in top-left corner as specified.
 *
 * Format: Logo (top-left) + Company info (right) → PO details → Line items table
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

class PDFExportService {
  constructor() {
    // Company information (can be moved to config later)
    this.companyInfo = {
      name: 'INTELLIGENT SYSTEMS',
      address: '123 Business Ave',
      city: 'City',
      state: 'State',
      zip: '12345',
      phone: '(555) 123-4567',
      email: 'info@intelligentsystems.com',
      website: 'www.intelligentsystems.com'
    };

    // Logo placeholder (base64 or URL - will be replaced with actual logo)
    this.logoPlaceholder = null; // Add actual logo base64 string here later

    // PDF styling
    this.colors = {
      primary: [41, 128, 185], // Blue
      secondary: [52, 73, 94], // Dark gray
      accent: [52, 152, 219], // Light blue
      text: [44, 62, 80], // Text gray
      lightGray: [236, 240, 241],
      border: [189, 195, 199]
    };
  }

  /**
   * Generate PDF for a purchase order
   *
   * @param {Object} poData - Complete PO data from poGeneratorService.getPOForExport()
   * @returns {Blob} PDF blob
   */
  generatePOPDF(poData) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // ===== HEADER SECTION =====
    // Logo placeholder (top-left)
    this.addLogoSection(doc, 20, yPos);

    // Company info (right of logo)
    this.addCompanyInfo(doc, pageWidth - 20, yPos);

    yPos = 60;

    // Title: PURCHASE ORDER
    doc.setFontSize(24);
    doc.setTextColor(...this.colors.primary);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', pageWidth / 2, yPos, { align: 'center' });

    yPos += 15;

    // ===== PO DETAILS SECTION =====
    yPos = this.addPODetails(doc, poData, yPos);

    yPos += 10;

    // ===== VENDOR AND SHIP-TO SECTION =====
    yPos = this.addVendorAndShipTo(doc, poData, yPos, pageWidth);

    yPos += 10;

    // ===== LINE ITEMS TABLE =====
    yPos = this.addLineItemsTable(doc, poData, yPos);

    // ===== TOTALS SECTION =====
    yPos = this.addTotals(doc, poData, yPos, pageWidth);

    // ===== FOOTER SECTION =====
    this.addFooter(doc, poData, pageHeight);

    return doc;
  }

  /**
   * Add logo section (top-left)
   */
  addLogoSection(doc, x, y) {
    // Logo placeholder box
    doc.setDrawColor(...this.colors.border);
    doc.setFillColor(...this.colors.lightGray);
    doc.rect(x, y, 30, 30, 'FD'); // Filled and drawn

    // Placeholder text
    doc.setFontSize(8);
    doc.setTextColor(...this.colors.text);
    doc.setFont(undefined, 'normal');
    doc.text('[LOGO]', x + 15, y + 17, { align: 'center' });

    // TODO: Replace with actual logo when provided
    // if (this.logoPlaceholder) {
    //   doc.addImage(this.logoPlaceholder, 'PNG', x, y, 30, 30);
    // }
  }

  /**
   * Add company information (right side of header)
   */
  addCompanyInfo(doc, x, y) {
    doc.setFontSize(14);
    doc.setTextColor(...this.colors.secondary);
    doc.setFont(undefined, 'bold');
    doc.text(this.companyInfo.name, x, y, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(this.companyInfo.address, x, y + 6, { align: 'right' });
    doc.text(`${this.companyInfo.city}, ${this.companyInfo.state} ${this.companyInfo.zip}`, x, y + 11, { align: 'right' });
    doc.text(this.companyInfo.phone, x, y + 16, { align: 'right' });
    doc.text(this.companyInfo.email, x, y + 21, { align: 'right' });
  }

  /**
   * Add PO details (number, dates, status)
   */
  addPODetails(doc, poData, yPos) {
    const { po } = poData;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...this.colors.accent);
    doc.text(`PO Number: ${po.po_number}`, 20, yPos);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...this.colors.text);

    yPos += 6;
    doc.text(`Order Date: ${this.formatDate(po.order_date)}`, 20, yPos);

    if (po.requested_delivery_date) {
      yPos += 5;
      doc.text(`Requested Delivery: ${this.formatDate(po.requested_delivery_date)}`, 20, yPos);
    }

    yPos += 5;
    doc.text(`Status: ${this.formatStatus(po.status)}`, 20, yPos);

    if (po.milestone_stage) {
      yPos += 5;
      doc.text(`Milestone: ${this.formatMilestone(po.milestone_stage)}`, 20, yPos);
    }

    return yPos + 5;
  }

  /**
   * Add vendor and ship-to sections (two columns)
   */
  addVendorAndShipTo(doc, poData, yPos, pageWidth) {
    const { po, supplier, project } = poData;
    const colWidth = (pageWidth - 40) / 2;

    // Vendor section (left)
    doc.setFillColor(...this.colors.lightGray);
    doc.rect(20, yPos, colWidth - 5, 35, 'F');

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...this.colors.secondary);
    doc.text('VENDOR:', 23, yPos + 6);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...this.colors.text);

    let vendorY = yPos + 12;
    doc.text(supplier?.name || 'Unknown Vendor', 23, vendorY);
    vendorY += 5;

    if (supplier?.address) {
      doc.text(supplier.address, 23, vendorY);
      vendorY += 5;
    }

    if (supplier?.city) {
      doc.text(`${supplier.city}, ${supplier.state || ''} ${supplier.zip_code || ''}`, 23, vendorY);
      vendorY += 5;
    }

    if (supplier?.phone) {
      doc.text(`Phone: ${supplier.phone}`, 23, vendorY);
    }

    // Ship-to section (right)
    const rightX = pageWidth / 2 + 5;
    doc.setFillColor(...this.colors.lightGray);
    doc.rect(rightX, yPos, colWidth - 5, 35, 'F');

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...this.colors.secondary);
    doc.text('SHIP TO:', rightX + 3, yPos + 6);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...this.colors.text);

    let shipY = yPos + 12;
    doc.text(project?.name || 'Project Site', rightX + 3, shipY);
    shipY += 5;

    if (project?.address) {
      doc.text(project.address, rightX + 3, shipY);
      shipY += 5;
    }

    if (project?.city) {
      doc.text(`${project.city}, ${project.state || ''} ${project.zip || ''}`, rightX + 3, shipY);
    }

    return yPos + 40;
  }

  /**
   * Add line items table
   */
  addLineItemsTable(doc, poData, yPos) {
    const { items } = poData;

    const tableData = items.map((item, index) => [
      item.line_number || (index + 1),
      item.part_number || 'N/A',
      item.description || '',
      item.quantity_ordered || 0,
      this.formatCurrency(item.unit_cost || 0),
      this.formatCurrency(item.line_total || 0)
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Line', 'Part Number', 'Description', 'Qty', 'Unit Cost', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: this.colors.primary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        textColor: this.colors.text
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 70 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      },
      margin: { left: 20, right: 20 }
    });

    return doc.lastAutoTable.finalY + 10;
  }

  /**
   * Add totals section (right-aligned)
   */
  addTotals(doc, poData, yPos, pageWidth) {
    const { po } = poData;
    const rightX = pageWidth - 20;
    const labelX = pageWidth - 70;

    doc.setFontSize(9);
    doc.setTextColor(...this.colors.text);

    // Subtotal
    doc.setFont(undefined, 'normal');
    doc.text('Subtotal:', labelX, yPos, { align: 'right' });
    doc.text(this.formatCurrency(po.subtotal || 0), rightX, yPos, { align: 'right' });

    yPos += 6;

    // Tax
    if (po.tax_amount && po.tax_amount > 0) {
      doc.text('Tax:', labelX, yPos, { align: 'right' });
      doc.text(this.formatCurrency(po.tax_amount), rightX, yPos, { align: 'right' });
      yPos += 6;
    }

    // Shipping
    if (po.shipping_cost && po.shipping_cost > 0) {
      doc.text('Shipping:', labelX, yPos, { align: 'right' });
      doc.text(this.formatCurrency(po.shipping_cost), rightX, yPos, { align: 'right' });
      yPos += 6;
    }

    // Total (bold line above)
    doc.setDrawColor(...this.colors.border);
    doc.line(labelX - 5, yPos - 2, rightX, yPos - 2);

    yPos += 4;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...this.colors.primary);
    doc.text('TOTAL:', labelX, yPos, { align: 'right' });
    doc.text(this.formatCurrency(po.total_amount || 0), rightX, yPos, { align: 'right' });

    return yPos + 10;
  }

  /**
   * Add footer with notes and payment terms
   */
  addFooter(doc, poData, pageHeight) {
    const { po, supplier } = poData;
    const footerY = pageHeight - 30;

    // Notes section
    if (po.notes) {
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...this.colors.secondary);
      doc.text('Notes:', 20, footerY);

      doc.setFont(undefined, 'normal');
      doc.setTextColor(...this.colors.text);
      const notesLines = doc.splitTextToSize(po.notes, 170);
      doc.text(notesLines, 20, footerY + 5);
    }

    // Payment terms
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('Payment Terms:', 20, pageHeight - 15);

    doc.setFont(undefined, 'normal');
    doc.text(supplier?.payment_terms || 'Net 30', 55, pageHeight - 15);

    // Bottom border
    doc.setDrawColor(...this.colors.border);
    doc.line(20, pageHeight - 10, doc.internal.pageSize.getWidth() - 20, pageHeight - 10);

    // Footer text
    doc.setFontSize(7);
    doc.setTextColor(...this.colors.text);
    doc.text(
      'Thank you for your business!',
      doc.internal.pageSize.getWidth() / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  /**
   * Download PDF to user's computer
   *
   * @param {Object} poData - PO data
   * @param {string} filename - Optional custom filename
   */
  async downloadPDF(poData, filename = null) {
    const doc = this.generatePOPDF(poData);
    const defaultFilename = filename || `${poData.po.po_number}.pdf`;

    doc.save(defaultFilename);
  }

  /**
   * Get PDF as Blob (for email attachments)
   *
   * @param {Object} poData - PO data
   * @returns {Blob} PDF blob
   */
  async getPDFBlob(poData) {
    const doc = this.generatePOPDF(poData);
    return doc.output('blob');
  }

  /**
   * Get PDF as base64 string (for API uploads)
   *
   * @param {Object} poData - PO data
   * @returns {string} Base64 string
   */
  async getPDFBase64(poData) {
    const doc = this.generatePOPDF(poData);
    return doc.output('dataurlstring');
  }

  /**
   * Open PDF in new browser tab
   *
   * @param {Object} poData - PO data
   */
  async openPDFInNewTab(poData) {
    const doc = this.generatePOPDF(poData);
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // ===== UTILITY METHODS =====

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatStatus(status) {
    const statusMap = {
      draft: 'Draft',
      submitted: 'Submitted',
      received: 'Received',
      cancelled: 'Cancelled'
    };
    return statusMap[status] || status;
  }

  formatMilestone(milestone) {
    return milestone.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Set company logo (base64 string)
   *
   * @param {string} logoBase64 - Base64 encoded logo image
   */
  setLogo(logoBase64) {
    this.logoPlaceholder = logoBase64;
  }

  /**
   * Update company information
   *
   * @param {Object} companyData - Company details
   */
  updateCompanyInfo(companyData) {
    this.companyInfo = { ...this.companyInfo, ...companyData };
  }
}

// Export singleton instance
export const pdfExportService = new PDFExportService();
export default pdfExportService;
