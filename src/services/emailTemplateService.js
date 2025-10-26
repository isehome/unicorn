/**
 * Email Template Service for Purchase Orders
 *
 * Generates professional email templates for PO communication.
 * Supports copy-to-clipboard for immediate use in email clients.
 * Architecture ready for future direct email API integration.
 */

class EmailTemplateService {
  constructor() {
    // Company information (can be moved to config later)
    this.companyInfo = {
      name: 'Intelligent Systems',
      phone: '(555) 123-4567',
      email: 'procurement@intelligentsystems.com',
      website: 'www.intelligentsystems.com'
    };

    // PM contact info (will be dynamically set)
    this.defaultSender = {
      name: 'Project Manager',
      email: 'pm@intelligentsystems.com',
      phone: '(555) 123-4567'
    };
  }

  /**
   * Generate email content for sending PO to vendor
   *
   * @param {Object} poData - Complete PO data
   * @param {Object} senderInfo - PM contact information
   * @returns {Object} Email template data
   */
  generatePOEmail(poData, senderInfo = null) {
    const { po, supplier, project, items } = poData;
    const sender = senderInfo || this.defaultSender;

    const subject = `Purchase Order ${po.po_number} - ${project?.name || 'Project'}`;

    const body = `Dear ${supplier?.name || 'Vendor'} Team,

Please find attached Purchase Order ${po.po_number} for the ${project?.name || 'project'}.

ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PO Number: ${po.po_number}
Order Date: ${this.formatDate(po.order_date)}
Requested Delivery: ${this.formatDate(po.requested_delivery_date)}
Project: ${project?.name || 'N/A'}
Milestone: ${this.formatMilestone(po.milestone_stage)}

Items: ${items?.length || 0} line items
Total Amount: ${this.formatCurrency(po.total_amount)}

${po.requested_delivery_date ? `IMPORTANT: Please confirm you can meet the requested delivery date of ${this.formatDate(po.requested_delivery_date)}.` : ''}

SHIPPING ADDRESS:
${project?.name || ''}
${project?.address || ''}
${project?.city ? `${project.city}, ${project.state || ''} ${project.zip || ''}` : ''}

Please confirm receipt of this purchase order and provide:
1. Order confirmation number
2. Estimated delivery date
3. Tracking information when shipped

${supplier?.payment_terms ? `Payment Terms: ${supplier.payment_terms}` : 'Payment Terms: Net 30'}

If you have any questions regarding this order, please contact me directly.

Thank you for your prompt attention to this order.

Best regards,
${sender.name}
${this.companyInfo.name}
${sender.email}
${sender.phone}

---
This is an automated message. Please do not reply to this email address.
For questions, contact ${sender.email}
`;

    return {
      to: supplier?.email || '',
      subject,
      body,
      attachments: [
        {
          filename: `${po.po_number}.pdf`,
          description: 'Purchase Order PDF'
        }
      ]
    };
  }

  /**
   * Generate email for PO follow-up (reminder)
   *
   * @param {Object} poData - Complete PO data
   * @param {Object} senderInfo - PM contact information
   * @returns {Object} Email template data
   */
  generateFollowUpEmail(poData, senderInfo = null) {
    const { po, supplier, project } = poData;
    const sender = senderInfo || this.defaultSender;

    const subject = `Follow-up: Purchase Order ${po.po_number}`;

    const body = `Dear ${supplier?.name || 'Vendor'} Team,

I wanted to follow up on Purchase Order ${po.po_number} that was sent on ${this.formatDate(po.order_date)}.

Could you please provide an update on:
1. Order confirmation status
2. Estimated ship date
3. Tracking information (if already shipped)

This order is for our ${project?.name || 'project'} and the requested delivery date is ${this.formatDate(po.requested_delivery_date)}.

Please let me know if there are any issues or delays we should be aware of.

Thank you for your assistance.

Best regards,
${sender.name}
${this.companyInfo.name}
${sender.email}
${sender.phone}
`;

    return {
      to: supplier?.email || '',
      subject,
      body,
      attachments: []
    };
  }

  /**
   * Generate email for tracking information request
   *
   * @param {Object} poData - Complete PO data
   * @param {Object} senderInfo - PM contact information
   * @returns {Object} Email template data
   */
  generateTrackingRequestEmail(poData, senderInfo = null) {
    const { po, supplier } = poData;
    const sender = senderInfo || this.defaultSender;

    const subject = `Tracking Information Needed - PO ${po.po_number}`;

    const body = `Dear ${supplier?.name || 'Vendor'} Team,

We need tracking information for Purchase Order ${po.po_number}.

Please provide:
- Carrier name (UPS, FedEx, USPS, etc.)
- Tracking number(s)
- Expected delivery date

This will help us prepare for receiving the shipment.

Thank you for your prompt response.

Best regards,
${sender.name}
${this.companyInfo.name}
${sender.email}
${sender.phone}
`;

    return {
      to: supplier?.email || '',
      subject,
      body,
      attachments: []
    };
  }

  /**
   * Generate email for order cancellation
   *
   * @param {Object} poData - Complete PO data
   * @param {string} reason - Cancellation reason
   * @param {Object} senderInfo - PM contact information
   * @returns {Object} Email template data
   */
  generateCancellationEmail(poData, reason, senderInfo = null) {
    const { po, supplier } = poData;
    const sender = senderInfo || this.defaultSender;

    const subject = `CANCELLATION - Purchase Order ${po.po_number}`;

    const body = `Dear ${supplier?.name || 'Vendor'} Team,

We need to CANCEL Purchase Order ${po.po_number} dated ${this.formatDate(po.order_date)}.

Reason: ${reason || 'Project requirements changed'}

If this order has already been shipped, please contact us immediately at ${sender.phone}.

If it has not shipped, please confirm cancellation and provide a cancellation reference number.

We apologize for any inconvenience this may cause.

Best regards,
${sender.name}
${this.companyInfo.name}
${sender.email}
${sender.phone}
`;

    return {
      to: supplier?.email || '',
      subject,
      body,
      attachments: []
    };
  }

  /**
   * Copy email content to clipboard
   *
   * @param {Object} emailData - Email template data
   * @returns {Promise<boolean>} Success status
   */
  async copyToClipboard(emailData) {
    try {
      const fullEmail = `To: ${emailData.to}
Subject: ${emailData.subject}

${emailData.body}

${emailData.attachments.length > 0 ? `\nAttachments:\n${emailData.attachments.map(a => `- ${a.filename}`).join('\n')}` : ''}`;

      await navigator.clipboard.writeText(fullEmail);
      return true;
    } catch (error) {
      console.error('Error copying email to clipboard:', error);
      return false;
    }
  }

  /**
   * Copy just the email body to clipboard
   *
   * @param {Object} emailData - Email template data
   * @returns {Promise<boolean>} Success status
   */
  async copyBodyToClipboard(emailData) {
    try {
      await navigator.clipboard.writeText(emailData.body);
      return true;
    } catch (error) {
      console.error('Error copying email body to clipboard:', error);
      return false;
    }
  }

  /**
   * Generate mailto: link for opening in email client
   *
   * @param {Object} emailData - Email template data
   * @returns {string} mailto: URL
   */
  generateMailtoLink(emailData) {
    const subject = encodeURIComponent(emailData.subject);
    const body = encodeURIComponent(emailData.body);
    const to = encodeURIComponent(emailData.to);

    return `mailto:${to}?subject=${subject}&body=${body}`;
  }

  /**
   * Open email in default email client
   *
   * @param {Object} emailData - Email template data
   */
  openInEmailClient(emailData) {
    const mailtoLink = this.generateMailtoLink(emailData);

    // Check if mailto link would be too long (some email clients have limits)
    if (mailtoLink.length > 2000) {
      console.warn('Email content too long for mailto link. Consider copying to clipboard instead.');
      return false;
    }

    window.location.href = mailtoLink;
    return true;
  }

  /**
   * FUTURE: Send email via API
   * This is a placeholder for future email API integration
   *
   * @param {Object} emailData - Email template data
   * @param {Blob} pdfBlob - PDF attachment
   * @returns {Promise<Object>} Send result
   */
  async sendViaAPI(emailData, pdfBlob = null) {
    // TODO: Integrate with email API (Resend, SendGrid, Microsoft Graph, etc.)
    console.warn('Email API integration not yet implemented');

    // Example implementation structure:
    /*
    const formData = new FormData();
    formData.append('to', emailData.to);
    formData.append('subject', emailData.subject);
    formData.append('body', emailData.body);

    if (pdfBlob) {
      formData.append('attachment', pdfBlob, emailData.attachments[0].filename);
    }

    const response = await fetch('/api/send-email', {
      method: 'POST',
      body: formData
    });

    return await response.json();
    */

    return {
      success: false,
      message: 'Email API not configured'
    };
  }

  /**
   * Generate bulk email for multiple POs
   *
   * @param {Array<Object>} posData - Array of PO data
   * @param {Object} senderInfo - PM contact information
   * @returns {Array<Object>} Array of email templates
   */
  generateBulkEmails(posData, senderInfo = null) {
    return posData.map(poData => this.generatePOEmail(poData, senderInfo));
  }

  /**
   * Generate email summary for internal use
   *
   * @param {Array<Object>} posData - Array of PO data
   * @returns {string} Summary text
   */
  generateInternalSummary(posData) {
    const totalAmount = posData.reduce((sum, poData) => sum + (poData.po.total_amount || 0), 0);
    const totalItems = posData.reduce((sum, poData) => sum + (poData.items?.length || 0), 0);

    const summary = `Purchase Orders Generated - Summary

Generated ${posData.length} purchase order${posData.length !== 1 ? 's' : ''}
Total Items: ${totalItems}
Total Amount: ${this.formatCurrency(totalAmount)}

PURCHASE ORDERS:
${posData.map(poData => {
  const { po, supplier, items } = poData;
  return `
• ${po.po_number}
  Supplier: ${supplier?.name || 'Unknown'}
  Items: ${items?.length || 0}
  Amount: ${this.formatCurrency(po.total_amount)}
  Delivery: ${this.formatDate(po.requested_delivery_date)}`;
}).join('\n')}

Next Steps:
1. Review all POs for accuracy
2. Send to vendors via email
3. Upload CSVs to SharePoint
4. Track confirmations and delivery dates

Generated: ${new Date().toLocaleString()}
`;

    return summary;
  }

  // ===== UTILITY METHODS =====

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }

  formatDate(dateString) {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatMilestone(milestone) {
    if (!milestone) return 'N/A';
    return milestone.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Update default company information
   *
   * @param {Object} companyData - Company details
   */
  updateCompanyInfo(companyData) {
    this.companyInfo = { ...this.companyInfo, ...companyData };
  }

  /**
   * Update default sender information
   *
   * @param {Object} senderData - Sender details
   */
  updateDefaultSender(senderData) {
    this.defaultSender = { ...this.defaultSender, ...senderData };
  }
}

// Export singleton instance
export const emailTemplateService = new EmailTemplateService();
export default emailTemplateService;
