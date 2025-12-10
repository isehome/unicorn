import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import DateField from '../components/ui/DateField';
import { publicPOPortalService } from '../services/publicPOPortalService';
import { enhancedStyles } from '../styles/styleSystem';
import { useTheme } from '../contexts/ThemeContext';
import { AlertTriangle, Truck, CheckCircle, Plus, Trash2 } from 'lucide-react';

const carriers = ['UPS', 'USPS', 'FedEx', 'DHL', 'Other'];

const emptyTrackingEntry = () => ({
  id: Date.now() + Math.random(),
  carrier: carriers[0],
  trackingNumber: '',
  service: '',
  notes: ''
});

const PublicPurchaseOrderPortal = () => {
  const { token } = useParams();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState(null);
  const [error, setError] = useState('');
  const [formEntries, setFormEntries] = useState([emptyTrackingEntry()]);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const loadPortal = async () => {
      if (!token) return;
      try {
        setLoading(true);
        const data = await publicPOPortalService.exchange(token);
        setPortalData(data);
        setError('');
      } catch (err) {
        console.error('[PublicPOPortal] Failed to load:', err);
        setError(err.message || 'Unable to load purchase order');
      } finally {
        setLoading(false);
      }
    };
    loadPortal();
  }, [token]);

  const submittedTracking = portalData?.tracking || [];
  const purchaseOrder = portalData?.purchaseOrder;
  const company = portalData?.company;

  const updateEntry = (id, field, value) => {
    setFormEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const addEntry = () => {
    setFormEntries((prev) => [...prev, emptyTrackingEntry()]);
  };

  const removeEntry = (id) => {
    setFormEntries((prev) => {
      if (prev.length === 1) return prev; // Keep at least one entry
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();

    // Validate that at least one tracking number is filled
    const validEntries = formEntries.filter((e) => e.trackingNumber.trim());
    if (validEntries.length === 0) {
      setError('Please enter at least one tracking number.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        entries: validEntries.map((entry) => ({
          carrier: entry.carrier,
          trackingNumber: entry.trackingNumber.trim(),
          carrier_service: entry.service,
          notes: entry.notes
        }))
      };
      const data = await publicPOPortalService.submit(token, payload);
      setPortalData(data);
      // Reset form to single empty entry
      setFormEntries([emptyTrackingEntry()]);
      setSuccessMessage(`${validEntries.length} tracking number${validEntries.length > 1 ? 's' : ''} received. Thank you!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setError('');
    } catch (err) {
      console.error('Failed to submit tracking:', err);
      setError(err.message || 'Failed to submit tracking info');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (!purchaseOrder?.status) return { label: 'Open', className: 'bg-blue-100 text-blue-700' };
    const normalized = purchaseOrder.status.toLowerCase();
    if (normalized === 'received') return { label: 'Received', className: 'bg-green-100 text-green-700' };
    if (normalized === 'partially_received') return { label: 'Partially Received', className: 'bg-amber-100 text-amber-700' };
    return { label: purchaseOrder.status, className: 'bg-blue-100 text-blue-700' };
  }, [purchaseOrder?.status]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !portalData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">Unable to load PO</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header with company branding and project name */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
          <div className="flex items-center gap-4">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt={company?.name || 'Logo'} className="h-24 max-w-[200px] object-contain rounded" />
            ) : (
              <Truck className="w-16 h-16 text-violet-500" />
            )}
            <div>
              <p className="text-sm uppercase text-gray-500 tracking-wide">Vendor Tracking Portal</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{company?.name || 'Tracking Portal'}</p>
            </div>
          </div>
          {purchaseOrder?.project?.name && (
            <div className="text-right">
              <p className="text-sm uppercase text-gray-500 tracking-wide">Project</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{purchaseOrder.project.name}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2 text-sm">{error}</div>
        )}

        {purchaseOrder && (
          <section className="rounded-2xl border p-4 space-y-2" style={sectionStyles.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">Purchase Order</p>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{purchaseOrder.number}</h1>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mt-3">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="font-medium text-gray-900 dark:text-white">{purchaseOrder.status}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ordered</p>
                <DateField date={purchaseOrder.orderDate} variant="inline" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Requested Delivery</p>
                <DateField date={purchaseOrder.expectedDeliveryDate} variant="inline" />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
          <h3 className="text-sm font-semibold">Add Tracking Information</h3>
          {successMessage && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              {successMessage}
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {formEntries.map((entry, index) => (
              <div key={entry.id} className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Shipment {index + 1}
                  </span>
                  {formEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Remove this tracking entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Carrier</label>
                    <select
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                      value={entry.carrier}
                      onChange={(e) => updateEntry(entry.id, 'carrier', e.target.value)}
                    >
                      {carriers.map((carrier) => (
                        <option key={carrier} value={carrier}>{carrier}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Tracking Number *</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                      value={entry.trackingNumber}
                      onChange={(e) => updateEntry(entry.id, 'trackingNumber', e.target.value)}
                      placeholder="Enter tracking number"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={entry.notes}
                    onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
                    placeholder="e.g., partial shipment, backorder items, etc."
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addEntry}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Another Tracking Number
            </button>

            <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="w-full">
              Submit {formEntries.filter(e => e.trackingNumber.trim()).length > 1 ? `${formEntries.filter(e => e.trackingNumber.trim()).length} Tracking Numbers` : 'Tracking'}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Submitted Tracking</h3>
            <span className="text-xs text-gray-500">{submittedTracking.length} entries</span>
          </div>
          {submittedTracking.length === 0 ? (
            <div className="text-sm text-gray-500">No tracking numbers submitted yet.</div>
          ) : (
            <div className="space-y-2">
              {submittedTracking.map((entry) => (
                <div key={entry.id} className="rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(entry.trackingNumber);
                          window.open(`https://www.google.com/search?q=${encodeURIComponent(entry.trackingNumber)}`, '_blank');
                        }}
                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        title="Click to track shipment"
                      >
                        {entry.carrier} {entry.trackingNumber}
                      </button>
                      <p className="text-xs text-gray-500">Status: {entry.status}</p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Added <DateField date={entry.createdAt} variant="inline" colorMode="timestamp" showTime={true} />
                  </div>
                  {entry.notes && <div className="text-xs text-gray-600 mt-1">Notes: {entry.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default PublicPurchaseOrderPortal;
