import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { supabase } from '../../lib/supabase';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { pdfExportService } from '../../services/pdfExportService';
import { csvExportService } from '../../services/csvExportService';
import { sharePointStorageService } from '../../services/sharePointStorageService';
import { trackingService } from '../../services/trackingService';
import { milestoneCacheService } from '../../services/milestoneCacheService';
import { milestoneService } from '../../services/milestoneService';
import { poPublicAccessService } from '../../services/poPublicAccessService';
import { sendNotificationEmail, SYSTEM_EMAIL, WHITELIST_NOTICE_HTML, WHITELIST_NOTICE_TEXT, generateVendorEmailFooter, wrapEmailHtml } from '../../services/issueNotificationService';
import { companySettingsService } from '../../services/companySettingsService';
import Button from '../ui/Button';
import ShippingAddressManager from './ShippingAddressManager';
import POLineItemsEditor from './POLineItemsEditor';
import DateField from '../ui/DateField';
import DateInput from '../ui/DateInput';
import {
  X,
  Trash2,
  Download,
  FileText,
  Edit3,
  Save,
  Loader,
  AlertCircle,
  CheckCircle,
  Upload,
  Truck,
  MapPin
} from 'lucide-react';

/**
 * PO Details Modal
 *
 * View, edit, delete, and export purchase orders
 * - View PO with full line item breakdown
 * - Edit draft POs (dates, amounts, notes)
 * - Delete draft POs only
 * - Download PDF/CSV
 * - Auto-upload to SharePoint under Procurement/{Vendor}/
 * - Add tracking numbers manually
 */
const PODetailsModal = ({ isOpen, onClose, poId, onUpdate, onDelete }) => {
  const { mode } = useTheme();
  const { user, acquireToken } = useAuth();
  const sectionStyles = enhancedStyles.sections[mode];

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [po, setPO] = useState(null);
  const [shippingAddress, setShippingAddress] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tracking, setTracking] = useState([]);
  const [trackingData, setTrackingData] = useState({
    tracking_number: '',
    carrier: 'UPS',
    carrier_service: '',
    notes: ''
  });
  const [editingTrackingId, setEditingTrackingId] = useState(null);
  const [editingTrackingData, setEditingTrackingData] = useState(null);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [vendorRequestLoading, setVendorRequestLoading] = useState(false);

  // Edit state
  const [editData, setEditData] = useState({});

  useEffect(() => {
    if (isOpen && poId) {
      loadPODetails();
    }
  }, [isOpen, poId]);

  const loadPODetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await purchaseOrderService.getPurchaseOrder(poId);
      setPO(data);
      setEditData({
        order_date: data.order_date,
        requested_delivery_date: data.requested_delivery_date,
        tax_amount: data.tax_amount || 0,
        shipping_cost: data.shipping_cost || 0,
        internal_notes: data.internal_notes || '',
        supplier_notes: data.supplier_notes || '',
        shipping_address_id: data.shipping_address_id || null
      });

      // Load shipping address if exists
      if (data.shipping_address_id) {
        const { data: addressData, error: addressError } = await supabase
          .from('shipping_addresses')
          .select('*')
          .eq('id', data.shipping_address_id)
          .single();

        if (!addressError && addressData) {
          setShippingAddress(addressData);
        } else {
          console.warn('Failed to load shipping address:', addressError);
          setShippingAddress(null);
        }
      } else {
        setShippingAddress(null);
      }

      // Load tracking data
      const trackingData = await trackingService.getPOTracking(poId);
      setTracking(trackingData);
    } catch (err) {
      console.error('Failed to load PO:', err);
      setError('Failed to load purchase order details');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!po) {
      setError('Purchase order not loaded');
      return;
    }

    if (po.status !== 'draft') {
      setError('Only draft POs can be edited');
      return;
    }

    if (!editData.shipping_address_id) {
      setError('Shipping address is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const total =
        (po.subtotal || 0) +
        parseFloat(editData.tax_amount || 0) +
        parseFloat(editData.shipping_cost || 0);

      await purchaseOrderService.updatePurchaseOrder(poId, {
        ...editData,
        tax_amount: parseFloat(editData.tax_amount || 0),
        shipping_cost: parseFloat(editData.shipping_cost || 0),
        total_amount: total
      });

      setSuccess('Purchase order updated successfully');
      setTimeout(() => setSuccess(null), 3000);
      setIsEditing(false);
      await loadPODetails();

      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to update PO:', err);
      setError('Failed to update purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleUndoSubmit = async () => {
    if (po.status === 'draft') {
      setError('PO is already in draft status');
      return;
    }

    if (!window.confirm(
      `⚠️ EMERGENCY UNDO ⚠️\n\n` +
      `This will revert PO ${po.po_number} back to DRAFT status and:\n` +
      `• Reverse ordered quantities on equipment\n` +
      `• Restore allocated inventory\n` +
      `• Clear submission tracking\n\n` +
      `This should only be used in emergencies. Are you sure?`
    )) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      console.log('[PODetailsModal] Starting undo submit for PO:', poId);
      await purchaseOrderService.undoSubmitPurchaseOrder(poId);
      console.log('[PODetailsModal] Undo submit completed successfully');

      // Invalidate milestone cache so main gauges refresh
      if (po.project_id) {
        milestoneCacheService.invalidate(po.project_id);
        console.log('[PODetailsModal] Invalidated milestone cache after undo submit');

        // Re-check milestone completion status - may need to auto-uncomplete prep milestones
        console.log('[PODetailsModal] Re-checking milestone completion status...');
        await milestoneService.autoCompletePrepMilestones(po.project_id);
        console.log('[PODetailsModal] Milestone completion status updated');
      }

      setSuccess('PO submission has been undone. The PO is now back in draft status.');
      setTimeout(() => setSuccess(null), 3000);

      // Reload PO details
      console.log('[PODetailsModal] Reloading PO details...');
      await loadPODetails();
      console.log('[PODetailsModal] PO details reloaded');

      // Notify parent to refresh
      if (onUpdate) {
        console.log('[PODetailsModal] Calling onUpdate to refresh parent component');
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to undo PO submission:', err);
      setError('Failed to undo PO submission: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendVendorRequest = async () => {
    if (!po?.supplier?.email) {
      setError('Supplier email is required to send a tracking request.');
      return;
    }
    if (!window.confirm(`Send a tracking link to ${po.supplier.name || 'the vendor'}?`)) {
      return;
    }
    try {
      setVendorRequestLoading(true);

      // Get auth token for sending email (same pattern as IssueDetail)
      const graphToken = await acquireToken();

      // Fetch company settings for footer branding
      let companySettings = null;
      try {
        companySettings = await companySettingsService.getCompanySettings();
      } catch (err) {
        console.warn('Could not fetch company settings for email:', err);
      }

      const portalLink = await poPublicAccessService.ensureLink({
        poId,
        projectId: po.project_id,
        supplierId: po.supplier_id,
        supplier: { name: po.supplier.name, email: po.supplier.email }
      });
      const shareUrl = `${window.location.origin}/public/po/${portalLink.token}`;
      const supplierName = po.supplier.name || 'there';
      const emailFooter = generateVendorEmailFooter(companySettings);

      // Send from user's email with system email CC'd, include whitelist notice and company logo footer
      const htmlContent = `
        <p>Hi ${supplierName},</p>
        <p>You have been added to Unicorn, our project management system.</p>
        <p>Please add shipment tracking information for PO <strong>${po.po_number}</strong>.</p>
        <p><a href="${shareUrl}" style="color:#2563eb;text-decoration:none;">Open the vendor tracking portal</a> to submit tracking numbers for this order.</p>
        ${WHITELIST_NOTICE_HTML}
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);
      const text = `Hi ${supplierName},\n\nYou have been added to Unicorn, our project management system.\n\nPlease add shipment tracking information for PO ${po.po_number}.\n\n${shareUrl}${WHITELIST_NOTICE_TEXT}`;

      // Parse comma-separated emails into array
      const toEmails = po.supplier.email
        .split(',')
        .map(e => e.trim())
        .filter(e => e);

      await sendNotificationEmail(
        {
          to: toEmails,
          cc: [SYSTEM_EMAIL],
          subject: `Tracking request for PO ${po.po_number}`,
          html,
          text,
          sendAsUser: true
        },
        { authToken: graphToken }
      );
      setSuccess('Tracking request sent to vendor');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to send vendor tracking request:', err);
      setError(err.message || 'Failed to send tracking request');
    } finally {
      setVendorRequestLoading(false);
    }
  };

  const handleSubmitPO = async () => {
    if (po.status !== 'draft') {
      setError('Only draft POs can be submitted');
      return;
    }

    if (!window.confirm(`Submit PO ${po.po_number}? This will mark equipment as ordered and cannot be undone.`)) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Update PO status to 'submitted' and capture who submitted it
      await purchaseOrderService.submitPurchaseOrder(poId, user?.id);

      // Note: submitPurchaseOrder handles:
      // 1. Status update to 'submitted'
      // 2. Submission tracking (submitted_by, submitted_at)
      // 3. Inventory allocation
      // 4. Materialized view auto-refreshes via database triggers

      // Invalidate milestone cache so main gauges refresh
      if (po.project_id) {
        milestoneCacheService.invalidate(po.project_id);
        console.log('[PODetailsModal] Invalidated milestone cache after submit');
      }

      // Auto-generate inventory PO if items available from warehouse
      try {
        console.log('[PODetailsModal] Checking for inventory items to create PO...');
        const inventoryPO = await purchaseOrderService.generateInventoryPO(po.project_id, user?.id);
        if (inventoryPO) {
          console.log('[PODetailsModal] ✅ Auto-generated inventory PO:', inventoryPO.po_number);
        } else {
          console.log('[PODetailsModal] No inventory items available');
        }
      } catch (invErr) {
        console.error('[PODetailsModal] Failed to generate inventory PO:', invErr);
        // Don't fail the submission if inventory PO generation fails
      }

      // Auto-upload SUBMITTED CSV to SharePoint
      try {
        console.log('[PODetailsModal] Starting auto-upload of SUBMITTED CSV...');
        const exportData = await purchaseOrderService.exportPOData(poId);
        console.log('[PODetailsModal] Export data retrieved');

        const projectUrl = await sharePointStorageService.getProjectProcurementUrl(po.project_id);
        console.log('[PODetailsModal] Project URL:', projectUrl);

        if (!projectUrl) {
          console.warn('[PODetailsModal] No SharePoint URL configured for this project - skipping auto-upload');
        } else {
          const csv = csvExportService.generatePOCSV(exportData);
          const csvBlob = new Blob([csv], { type: 'text/csv' });
          const vendorFolder = sharePointStorageService.sanitizeForFileName(po.supplier?.name || 'Unknown_Vendor');
          const fileName = `${po.po_number}_SUBMITTED.csv`;

          console.log('[PODetailsModal] Uploading CSV:', {
            folder: vendorFolder,
            fileName: fileName,
            size: csvBlob.size
          });

          // Upload with _SUBMITTED suffix
          await sharePointStorageService.uploadToSharePoint(
            projectUrl,
            vendorFolder,
            fileName,
            csvBlob
          );
          console.log('[PODetailsModal] ✅ SUBMITTED CSV uploaded to SharePoint successfully');
        }
      } catch (uploadErr) {
        console.error('[PODetailsModal] ❌ Failed to upload SUBMITTED CSV to SharePoint:', uploadErr);
        // Don't fail the submission if SharePoint upload fails
        // Show a warning to the user but don't block the submission
        setError(`PO submitted successfully, but failed to auto-upload CSV to SharePoint: ${uploadErr.message}`);
      }

      setSuccess('Purchase order submitted successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload PO details
      await loadPODetails();

      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to submit PO:', err);
      setError('Failed to submit purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (po.status !== 'draft') {
      setError('Only draft POs can be deleted');
      return;
    }

    // First warning
    if (!window.confirm(`⚠️ WARNING: Delete PO ${po.po_number}?\n\nThis will:\n- Remove all ${po.items?.length || 0} line items\n- Clear quantity tracking\n\nThis action CANNOT be undone.`)) {
      return;
    }

    // Second warning (double confirmation)
    if (!window.confirm(`🛑 FINAL CONFIRMATION\n\nAre you absolutely sure you want to delete PO ${po.po_number}?\n\nType YES in your mind and click OK to proceed.`)) {
      return;
    }

    try {
      setLoading(true);
      const projectId = po.project_id;
      await purchaseOrderService.deletePurchaseOrder(poId);

      // Re-check milestone completion status after PO deletion
      if (projectId) {
        milestoneCacheService.invalidate(projectId);
        console.log('[PODetailsModal] Re-checking milestone completion after PO delete...');
        await milestoneService.autoCompletePrepMilestones(projectId);
      }

      if (onDelete) {
        onDelete(poId);
      }

      handleClose();
    } catch (err) {
      console.error('Failed to delete PO:', err);
      setError('Failed to delete purchase order');
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setExporting(true);
      setError(null);

      const exportData = await purchaseOrderService.exportPOData(poId);
      const pdfDoc = pdfExportService.generatePOPDF(exportData);

      // Download locally
      pdfDoc.save(`${po.po_number}.pdf`);

      setSuccess('PDF downloaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      setExporting(true);
      setError(null);

      const exportData = await purchaseOrderService.exportPOData(poId);
      const csv = csvExportService.generatePOCSV(exportData);

      // Download locally
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po.po_number}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      setSuccess('CSV downloaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to generate CSV:', err);
      setError('Failed to generate CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleUploadToSharePoint = async () => {
    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      console.log('[SharePoint Upload] Starting upload for PO:', po.po_number);

      // Export PO data
      const exportData = await purchaseOrderService.exportPOData(poId);
      console.log('[SharePoint Upload] PO data exported');

      // Get project procurement SharePoint URL
      const projectUrl = await sharePointStorageService.getProjectProcurementUrl(po.project_id);
      console.log('[SharePoint Upload] Project URL:', projectUrl);

      if (!projectUrl) {
        throw new Error('No SharePoint URL configured for this project. Please add a SharePoint root folder URL in project settings.');
      }

      // Generate PDF and CSV
      console.log('[SharePoint Upload] Generating PDF and CSV...');
      const pdfDoc = pdfExportService.generatePOPDF(exportData);
      const pdfBlob = pdfDoc.output('blob');
      const csv = csvExportService.generatePOCSV(exportData);
      const csvBlob = new Blob([csv], { type: 'text/csv' });
      console.log('[SharePoint Upload] Files generated:', {
        pdfSize: pdfBlob.size,
        csvSize: csvBlob.size
      });

      const vendorName = po.supplier?.name || 'Unknown Vendor';
      const vendorFolder = sharePointStorageService.sanitizeForFileName(vendorName);
      console.log('[SharePoint Upload] Vendor folder:', vendorFolder);

      // Upload PDF to SharePoint
      console.log('[SharePoint Upload] Uploading PDF...');
      await sharePointStorageService.uploadToSharePoint(
        projectUrl,
        vendorFolder,
        `${po.po_number}.pdf`,
        pdfBlob
      );
      console.log('[SharePoint Upload] PDF uploaded successfully');

      // Upload CSV to SharePoint
      console.log('[SharePoint Upload] Uploading CSV...');
      await sharePointStorageService.uploadToSharePoint(
        projectUrl,
        vendorFolder,
        `${po.po_number}.csv`,
        csvBlob
      );
      console.log('[SharePoint Upload] CSV uploaded successfully');

      setSuccess(`Files uploaded to SharePoint: Procurement/${vendorFolder}/${po.po_number}.pdf & .csv`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('[SharePoint Upload] Failed:', err);
      const errorMessage = err.message || 'Unknown error occurred';
      setError(`SharePoint upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAddTracking = async () => {
    if (!trackingData.tracking_number.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await trackingService.addTracking(poId, trackingData);

      setSuccess('Tracking number added successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload tracking data
      const updatedTracking = await trackingService.getPOTracking(poId);
      setTracking(updatedTracking);

      // Reset form and hide it
      setTrackingData({
        tracking_number: '',
        carrier: 'UPS',
        carrier_service: '',
        notes: ''
      });
      setShowTrackingForm(false);

      // Notify parent to refresh PO list
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to add tracking:', err);
      setError('Failed to add tracking number');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTracking = (trackingItem) => {
    setEditingTrackingId(trackingItem.id);
    setEditingTrackingData({
      tracking_number: trackingItem.tracking_number,
      carrier: trackingItem.carrier,
      carrier_service: trackingItem.carrier_service || '',
      notes: trackingItem.notes || ''
    });
  };

  const handleSaveTracking = async () => {
    if (!editingTrackingData.tracking_number.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await trackingService.updateTracking(editingTrackingId, editingTrackingData);

      setSuccess('Tracking updated successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload tracking data
      const updatedTracking = await trackingService.getPOTracking(poId);
      setTracking(updatedTracking);

      // Exit edit mode
      setEditingTrackingId(null);
      setEditingTrackingData(null);

      // Notify parent to refresh PO list
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to update tracking:', err);
      setError('Failed to update tracking');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTracking = async (trackingId) => {
    if (!window.confirm('Delete this tracking number?')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await trackingService.deleteTracking(trackingId);

      setSuccess('Tracking deleted successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Reload tracking data
      const updatedTracking = await trackingService.getPOTracking(poId);
      setTracking(updatedTracking);

      // Notify parent to refresh PO list
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to delete tracking:', err);
      setError('Failed to delete tracking');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setPO(null);
    setShippingAddress(null);
    setEditData({});
    setIsEditing(false);
    setError(null);
    setSuccess(null);
    setTracking([]);
    setTrackingData({
      tracking_number: '',
      carrier: 'UPS',
      carrier_service: '',
      notes: ''
    });
    setEditingTrackingId(null);
    setEditingTrackingData(null);
    setShowTrackingForm(false);
    onClose();
  };

  if (!isOpen) return null;

  const calculateTotal = () => {
    return (
      (po?.subtotal || 0) +
      parseFloat(editData.tax_amount || 0) +
      parseFloat(editData.shipping_cost || 0)
    );
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {po ? po.po_number : 'Loading...'}
            </h2>
            {po && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 text-xs font-medium rounded ${po.status === 'draft' ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' :
                  po.status === 'submitted' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                    po.status === 'received' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}>
                  {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {po.supplier?.name}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Truck}
              onClick={handleSendVendorRequest}
              loading={vendorRequestLoading}
              disabled={!po?.supplier?.email || vendorRequestLoading}
            >
              Request Tracking
            </Button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : po ? (
          <div className="px-6 py-4 space-y-6">
            {/* PO Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Order Date
                </label>
                {isEditing ? (
                  <DateInput
                    value={editData.order_date || ''}
                    onChange={(e) => setEditData({ ...editData, order_date: e.target.value })}
                  />
                ) : (
                  <DateField
                    date={po.order_date}
                    isCompleted={po.status === 'received'}
                    showIcon={true}
                    showBadge={false}
                    showDescription={false}
                    variant="compact"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Requested Delivery Date
                </label>
                {isEditing ? (
                  <DateInput
                    value={editData.requested_delivery_date || ''}
                    onChange={(e) => setEditData({ ...editData, requested_delivery_date: e.target.value })}
                  />
                ) : (
                  <DateField
                    date={po.requested_delivery_date}
                    isCompleted={po.status === 'received'}
                    showIcon={true}
                    showBadge={true}
                    showDescription={true}
                    variant="compact"
                  />
                )}
              </div>
            </div>

            {/* Submission Tracking - Display only, never editable */}
            {po.submitted_at && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Submitted By
                  </label>
                  <p className="text-gray-900 dark:text-white">
                    {po.submitter?.full_name || po.submitter?.email || 'Unknown User'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Submitted At
                  </label>
                  <p className="text-gray-900 dark:text-white">
                    {new Date(po.submitted_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* Shipping Address */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ship To Address {isEditing && <span className="text-red-500">*</span>}
                </label>
                {isEditing && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAddressSelector(!showAddressSelector)}
                  >
                    {showAddressSelector ? 'Hide Addresses' : editData.shipping_address_id ? 'Change Address' : 'Select Address'}
                  </Button>
                )}
              </div>

              {isEditing ? (
                <>
                  {showAddressSelector ? (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                      <ShippingAddressManager
                        embedded={true}
                        onSelect={(address) => {
                          setEditData({ ...editData, shipping_address_id: address.id });
                          setShowAddressSelector(false);
                        }}
                        selectedAddressId={editData.shipping_address_id}
                      />
                    </div>
                  ) : editData.shipping_address_id ? (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                        <MapPin className="w-4 h-4" />
                        <span className="font-medium">Shipping address selected</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">
                          Please select a shipping address
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {shippingAddress ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5" />
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {shippingAddress.name}
                          </p>
                          {shippingAddress.attention_to && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Attn: {shippingAddress.attention_to}
                            </p>
                          )}
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {shippingAddress.address_line1}
                          </p>
                          {shippingAddress.address_line2 && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {shippingAddress.address_line2}
                            </p>
                          )}
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}
                          </p>
                          {shippingAddress.country && shippingAddress.country !== 'USA' && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {shippingAddress.country}
                            </p>
                          )}
                          {shippingAddress.phone && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Phone: {shippingAddress.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : po?.shipping_address_id ? (
                    <p className="text-gray-600 dark:text-gray-400 italic">
                      Loading address...
                    </p>
                  ) : (
                    <p className="text-gray-600 dark:text-gray-400 italic">
                      No shipping address
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Line Items - Use POLineItemsEditor for draft POs */}
            <div>
              <POLineItemsEditor
                poId={poId}
                projectId={po.project_id}
                items={po.items || []}
                isDraft={po.status === 'draft'}
                onSave={async () => {
                  await loadPODetails();
                  if (onUpdate) onUpdate();
                }}
              />
            </div>

            {/* Costs */}
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Subtotal
                </label>
                <span className="text-gray-900 dark:text-white font-semibold">
                  ${(po.subtotal || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tax Amount
                </label>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData.tax_amount || 0}
                    onChange={(e) => setEditData({ ...editData, tax_amount: e.target.value })}
                    className="w-32 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                  />
                ) : (
                  <span className="text-gray-900 dark:text-white font-semibold">
                    ${(po.tax_amount || 0).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Shipping Cost
                </label>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData.shipping_cost || 0}
                    onChange={(e) => setEditData({ ...editData, shipping_cost: e.target.value })}
                    className="w-32 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                  />
                ) : (
                  <span className="text-gray-900 dark:text-white font-semibold">
                    ${(po.shipping_cost || 0).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-300 dark:border-gray-600">
                <label className="text-base font-bold text-gray-900 dark:text-white">
                  Total Amount
                </label>
                <span className="text-xl font-bold text-violet-600 dark:text-violet-400">
                  ${isEditing ? calculateTotal().toFixed(2) : (po.total_amount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Internal Notes
                </label>
                {isEditing ? (
                  <textarea
                    value={editData.internal_notes || ''}
                    onChange={(e) => setEditData({ ...editData, internal_notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                ) : (
                  <p className="text-gray-900 dark:text-white">
                    {po.internal_notes || 'None'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Supplier Notes
                </label>
                {isEditing ? (
                  <textarea
                    value={editData.supplier_notes || ''}
                    onChange={(e) => setEditData({ ...editData, supplier_notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                ) : (
                  <p className="text-gray-900 dark:text-white">
                    {po.supplier_notes || 'None'}
                  </p>
                )}
              </div>
            </div>

            {/* Tracking Information */}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Tracking Information
              </h3>

              {/* Existing Tracking */}
              {tracking.length > 0 && (
                <div className="mb-4 space-y-3">
                  {tracking.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      {editingTrackingId === t.id ? (
                        /* Edit Mode */
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Tracking Number *
                              </label>
                              <input
                                type="text"
                                value={editingTrackingData.tracking_number}
                                onChange={(e) => setEditingTrackingData({ ...editingTrackingData, tracking_number: e.target.value })}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Carrier *
                              </label>
                              <select
                                value={editingTrackingData.carrier}
                                onChange={(e) => setEditingTrackingData({ ...editingTrackingData, carrier: e.target.value })}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                <option value="UPS">UPS</option>
                                <option value="FedEx">FedEx</option>
                                <option value="USPS">USPS</option>
                                <option value="DHL">DHL</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Service Type
                            </label>
                            <input
                              type="text"
                              value={editingTrackingData.carrier_service}
                              onChange={(e) => setEditingTrackingData({ ...editingTrackingData, carrier_service: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Notes
                            </label>
                            <textarea
                              value={editingTrackingData.notes}
                              onChange={(e) => setEditingTrackingData({ ...editingTrackingData, notes: e.target.value })}
                              rows={2}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              icon={Save}
                              onClick={handleSaveTracking}
                              disabled={saving}
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingTrackingId(null);
                                setEditingTrackingData(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <button
                                  onClick={() => {
                                    // Copy to clipboard
                                    navigator.clipboard.writeText(t.tracking_number);
                                    // Open Google search in new tab
                                    window.open(`https://www.google.com/search?q=${encodeURIComponent(t.tracking_number)}`, '_blank');
                                  }}
                                  className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer min-h-[44px] flex items-center"
                                  title="Click to copy and search tracking number"
                                >
                                  {t.tracking_number}
                                </button>
                                <span className="px-3 py-1.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
                                  {t.carrier}
                                </span>
                                {t.carrier_service && (
                                  <span className="text-xs text-gray-600 dark:text-gray-400 px-2 py-1">
                                    {t.carrier_service}
                                  </span>
                                )}
                              </div>
                              {t.notes && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                  {t.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 sm:ml-3 flex-shrink-0">
                              <button
                                onClick={() => handleEditTracking(t)}
                                className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                title="Edit tracking"
                              >
                                <Edit3 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTracking(t.id)}
                                className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                title="Delete tracking"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Tracking Button / Form */}
              {!showTrackingForm ? (
                <Button
                  variant="secondary"
                  icon={Truck}
                  onClick={() => setShowTrackingForm(true)}
                  className="w-full sm:w-auto"
                >
                  Add Tracking Number
                </Button>
              ) : (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tracking Number *
                      </label>
                      <input
                        type="text"
                        value={trackingData.tracking_number}
                        onChange={(e) => setTrackingData({ ...trackingData, tracking_number: e.target.value })}
                        placeholder="Enter tracking number"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Carrier *
                      </label>
                      <select
                        value={trackingData.carrier}
                        onChange={(e) => setTrackingData({ ...trackingData, carrier: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="UPS">UPS</option>
                        <option value="FedEx">FedEx</option>
                        <option value="USPS">USPS</option>
                        <option value="DHL">DHL</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Service Type (Optional)
                    </label>
                    <input
                      type="text"
                      value={trackingData.carrier_service}
                      onChange={(e) => setTrackingData({ ...trackingData, carrier_service: e.target.value })}
                      placeholder="e.g., Ground, Express, 2-Day"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={trackingData.notes}
                      onChange={(e) => setTrackingData({ ...trackingData, notes: e.target.value })}
                      rows={2}
                      placeholder="Additional notes about this shipment"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      icon={Truck}
                      onClick={handleAddTracking}
                      disabled={saving || !trackingData.tracking_number.trim()}
                    >
                      {saving ? 'Adding...' : 'Add Tracking'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowTrackingForm(false);
                        setTrackingData({
                          tracking_number: '',
                          carrier: 'UPS',
                          carrier_service: '',
                          notes: ''
                        });
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Failed to load PO details</p>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
          {/* Mobile: Stack vertically, Desktop: Two columns */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            {/* Left side: Edit/Delete buttons (drafts) or Undo Submit (submitted) */}
            <div className="flex flex-wrap gap-2">
              {po && po.status === 'draft' && (
                <>
                  {!isEditing ? (
                    <Button
                      variant="secondary"
                      icon={Edit3}
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        icon={Save}
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIsEditing(false);
                          setEditData({
                            order_date: po.order_date,
                            requested_delivery_date: po.requested_delivery_date,
                            tax_amount: po.tax_amount || 0,
                            shipping_cost: po.shipping_cost || 0,
                            internal_notes: po.internal_notes || '',
                            supplier_notes: po.supplier_notes || ''
                          });
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                  <Button
                    variant="danger"
                    icon={Trash2}
                    onClick={handleDelete}
                    disabled={loading}
                  >
                    Delete
                  </Button>
                </>
              )}

              {/* Undo Submit button - only show for submitted/confirmed/received POs */}
              {po && po.status !== 'draft' && po.status !== 'cancelled' && (
                <Button
                  variant="destructive"
                  icon={AlertCircle}
                  onClick={handleUndoSubmit}
                  disabled={saving}
                  className="font-semibold"
                >
                  {saving ? 'Undoing...' : 'Undo Submit'}
                </Button>
              )}
            </div>

            {/* Right side: Submit/Download/Upload buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Submit PO button - only show for draft POs */}
              {po && po.status === 'draft' && !isEditing && (
                <Button
                  variant="primary"
                  icon={CheckCircle}
                  onClick={handleSubmitPO}
                  disabled={saving}
                  className="font-semibold"
                >
                  {saving ? 'Submitting...' : 'Submit PO'}
                </Button>
              )}
              <Button
                variant="secondary"
                icon={Download}
                onClick={handleDownloadPDF}
                disabled={exporting}
              >
                {exporting ? 'Generating...' : 'PDF'}
              </Button>
              <Button
                variant="secondary"
                icon={FileText}
                onClick={handleDownloadCSV}
                disabled={exporting}
              >
                CSV
              </Button>
              <Button
                variant="primary"
                icon={Upload}
                onClick={handleUploadToSharePoint}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'SharePoint'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PODetailsModal;
