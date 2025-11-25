import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import DateField from '../components/ui/DateField';
import { publicPOPortalService } from '../services/publicPOPortalService';
import { enhancedStyles } from '../styles/styleSystem';
import { useTheme } from '../contexts/ThemeContext';
import { AlertTriangle, Truck, CheckCircle } from 'lucide-react';

const carriers = ['UPS', 'USPS', 'FedEx', 'DHL', 'Other'];

const PublicPurchaseOrderPortal = () => {
  const { token } = useParams();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState(null);
  const [error, setError] = useState('');
  const [formState, setFormState] = useState({
    contactName: '',
    contactEmail: '',
    carrier: carriers[0],
    trackingNumber: '',
    service: '',
    notes: ''
  });
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

  const trackingEntries = portalData?.tracking || [];
  const purchaseOrder = portalData?.purchaseOrder;
  const company = portalData?.company;

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    if (!formState.trackingNumber.trim() || !formState.contactEmail.trim()) {
      setError('Tracking number and email are required.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        contactName: formState.contactName,
        contactEmail: formState.contactEmail,
        entries: [
          {
            carrier: formState.carrier,
            trackingNumber: formState.trackingNumber,
            carrier_service: formState.service,
            notes: formState.notes
          }
        ]
      };
      const data = await publicPOPortalService.submit(token, payload);
      setPortalData(data);
      setFormState({
        contactName: formState.contactName,
        contactEmail: formState.contactEmail,
        carrier: formState.carrier,
        trackingNumber: '',
        service: '',
        notes: ''
      });
      setSuccessMessage('Tracking received. Thank you!');
      setTimeout(() => setSuccessMessage(''), 3000);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !portalData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">Unable to load PO</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {company && (
          <div className="flex items-center gap-3">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.name || 'Logo'} className="h-10 rounded" />
            ) : (
              <Truck className="w-8 h-8 text-violet-500" />
            )}
            <div>
              <p className="text-xs uppercase text-gray-500">Vendor Tracking Portal</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{company.name || 'Project'}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2 text-sm">{error}</div>
        )}

        {purchaseOrder && (
          <section className="rounded-2xl border p-4 space-y-2" style={sectionStyles.card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">Purchase Order</p>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{purchaseOrder.number}</h1>
                {purchaseOrder.project && <p className="text-sm text-gray-500">Project: {purchaseOrder.project.name}</p>}
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

        <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
          <h3 className="text-sm font-semibold">Add tracking information</h3>
          {successMessage && <div className="text-xs text-green-600">{successMessage}</div>}
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Your Name</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.contactName}
                  onChange={(e) => setFormState((prev) => ({ ...prev, contactName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Your Email</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.contactEmail}
                  onChange={(e) => setFormState((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Carrier</label>
                <select
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.carrier}
                  onChange={(e) => setFormState((prev) => ({ ...prev, carrier: e.target.value }))}
                >
                  {carriers.map((carrier) => (
                    <option key={carrier} value={carrier}>{carrier}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Tracking Number</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.trackingNumber}
                  onChange={(e) => setFormState((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Service Level (optional)</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.service}
                  onChange={(e) => setFormState((prev) => ({ ...prev, service: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="w-full">
              Submit Tracking
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Submitted tracking</h3>
            <span className="text-xs text-gray-500">{trackingEntries.length} entries</span>
          </div>
          {trackingEntries.length === 0 ? (
            <div className="text-sm text-gray-500">No tracking numbers submitted yet.</div>
          ) : (
            <div className="space-y-2">
              {trackingEntries.map((entry) => (
                <div key={entry.id} className="rounded-xl border px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold">{entry.carrier} {entry.trackingNumber}</p>
                      <p className="text-xs text-gray-500">Status: {entry.status}</p>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Added <DateField date={entry.createdAt} variant="inline" showTime={true} />
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
