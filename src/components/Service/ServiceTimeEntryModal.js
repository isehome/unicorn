/**
 * ServiceTimeEntryModal.js
 * Modal for adding/editing manual time entries on service tickets
 */

import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, User, FileText, Loader2, Trash2 } from 'lucide-react';
import { serviceTimeService } from '../../services/serviceTimeService';
import { brandColors } from '../../styles/styleSystem';

/**
 * Format date for datetime-local input
 */
const formatDateTimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Calculate duration between two dates in hours and minutes
 */
const calculateDuration = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return null;
  const diff = new Date(checkOut) - new Date(checkIn);
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
};

const ServiceTimeEntryModal = ({
  isOpen,
  onClose,
  ticketId,
  entry = null, // If provided, we're editing
  technicians = [],
  currentUser,
  onSaved
}) => {
  const [formData, setFormData] = useState({
    technician_email: '',
    technician_name: '',
    check_in: '',
    check_out: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(null);

  const isEditing = !!entry;

  // Initialize form with entry data or defaults
  useEffect(() => {
    if (entry) {
      setFormData({
        technician_email: entry.technician_email || '',
        technician_name: entry.technician_name || '',
        check_in: formatDateTimeLocal(entry.check_in),
        check_out: formatDateTimeLocal(entry.check_out),
        notes: entry.notes || ''
      });
    } else {
      // Default to current user and now
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      setFormData({
        technician_email: currentUser?.email || '',
        technician_name: currentUser?.name || currentUser?.full_name || '',
        check_in: formatDateTimeLocal(oneHourAgo),
        check_out: formatDateTimeLocal(now),
        notes: ''
      });
    }
  }, [entry, currentUser]);

  // Calculate duration when times change
  useEffect(() => {
    const dur = calculateDuration(formData.check_in, formData.check_out);
    setDuration(dur);
  }, [formData.check_in, formData.check_out]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleTechnicianChange = (e) => {
    const email = e.target.value;
    const tech = technicians.find(t => t.email === email);
    setFormData(prev => ({
      ...prev,
      technician_email: email,
      technician_name: tech?.full_name || tech?.name || email
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!formData.technician_email) {
      setError('Please select a technician');
      return;
    }
    if (!formData.check_in || !formData.check_out) {
      setError('Please enter both check-in and check-out times');
      return;
    }

    const checkInDate = new Date(formData.check_in);
    const checkOutDate = new Date(formData.check_out);

    if (checkOutDate <= checkInDate) {
      setError('Check-out time must be after check-in time');
      return;
    }

    try {
      setSaving(true);

      if (isEditing) {
        await serviceTimeService.updateTimeEntry(entry.id, {
          check_in: checkInDate.toISOString(),
          check_out: checkOutDate.toISOString(),
          notes: formData.notes || null
        });
      } else {
        await serviceTimeService.createManualEntry(ticketId, {
          technician_email: formData.technician_email,
          technician_name: formData.technician_name,
          check_in: checkInDate.toISOString(),
          check_out: checkOutDate.toISOString(),
          notes: formData.notes || null,
          created_by_id: currentUser?.id,
          created_by_name: currentUser?.name || currentUser?.full_name
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[ServiceTimeEntryModal] Save failed:', err);
      setError(err.message || 'Failed to save time entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry?.id) return;
    if (!window.confirm('Are you sure you want to delete this time entry?')) return;

    try {
      setDeleting(true);
      await serviceTimeService.deleteTimeEntry(entry.id);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[ServiceTimeEntryModal] Delete failed:', err);
      setError(err.message || 'Failed to delete time entry');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Clock size={18} />
            {isEditing ? 'Edit Time Entry' : 'Add Manual Time Entry'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Technician */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block flex items-center gap-2">
              <User size={14} />
              Technician
            </label>
            {isEditing ? (
              <input
                type="text"
                value={formData.technician_name || formData.technician_email}
                disabled
                className="w-full px-3 py-2 bg-zinc-700/50 border border-zinc-600 rounded-lg text-zinc-400 cursor-not-allowed"
              />
            ) : (
              <select
                value={formData.technician_email}
                onChange={handleTechnicianChange}
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="">-- Select Technician --</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.email}>
                    {tech.full_name || tech.name || tech.email}
                  </option>
                ))}
                {/* Include current user if not in list */}
                {currentUser?.email && !technicians.find(t => t.email === currentUser.email) && (
                  <option value={currentUser.email}>
                    {currentUser.name || currentUser.full_name || currentUser.email} (You)
                  </option>
                )}
              </select>
            )}
          </div>

          {/* Check-in Time */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block flex items-center gap-2">
              <Calendar size={14} />
              Check-in Time
            </label>
            <input
              type="datetime-local"
              value={formData.check_in}
              onChange={(e) => handleChange('check_in', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Check-out Time */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block flex items-center gap-2">
              <Calendar size={14} />
              Check-out Time
            </label>
            <input
              type="datetime-local"
              value={formData.check_out}
              onChange={(e) => handleChange('check_out', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Duration Display */}
          {duration && (
            <div className="p-3 bg-zinc-700/50 rounded-lg">
              <div className="text-sm text-zinc-400 mb-1">Duration</div>
              <div className="text-lg font-medium text-white">
                {duration.hours > 0 && `${duration.hours}h `}
                {duration.minutes}m
                <span className="text-sm text-zinc-400 ml-2">
                  ({duration.totalMinutes} minutes)
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block flex items-center gap-2">
              <FileText size={14} />
              Notes (optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              placeholder="Work performed, reason for manual entry..."
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-700">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete
              </button>
            )}
            <div className={`flex gap-2 ${!isEditing ? 'ml-auto' : ''}`}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting || !duration}
                className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                style={{ backgroundColor: brandColors.success, color: '#000' }}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  isEditing ? 'Update Entry' : 'Add Entry'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServiceTimeEntryModal;
