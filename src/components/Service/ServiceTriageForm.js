/**
 * ServiceTriageForm.js
 * Triage section for service tickets - captures who triaged, notes, estimated hours
 */

import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Clock, Package, FileText, Loader2, CheckCircle, User } from 'lucide-react';
import { serviceTriageService, technicianService } from '../../services/serviceTicketService';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

const ServiceTriageForm = ({ ticket, onUpdate }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);

  // Form state
  const [triageData, setTriageData] = useState({
    triaged_by: ticket?.triaged_by || '',
    triaged_by_name: ticket?.triaged_by_name || '',
    triage_notes: ticket?.triage_notes || '',
    estimated_hours: ticket?.estimated_hours || '',
    parts_needed: ticket?.parts_needed || false,
    proposal_needed: ticket?.proposal_needed || false
  });

  // Load technicians for selector
  useEffect(() => {
    const loadTechnicians = async () => {
      try {
        setLoadingTechnicians(true);
        const data = await technicianService.getAll();
        setTechnicians(data);
      } catch (err) {
        console.error('[ServiceTriageForm] Failed to load technicians:', err);
      } finally {
        setLoadingTechnicians(false);
      }
    };
    loadTechnicians();
  }, []);

  // Update form when ticket changes
  useEffect(() => {
    if (ticket) {
      setTriageData({
        triaged_by: ticket.triaged_by || '',
        triaged_by_name: ticket.triaged_by_name || '',
        triage_notes: ticket.triage_notes || '',
        estimated_hours: ticket.estimated_hours || '',
        parts_needed: ticket.parts_needed || false,
        proposal_needed: ticket.proposal_needed || false
      });
    }
  }, [ticket]);

  const handleTriagedByChange = (techId) => {
    const tech = technicians.find(t => t.id === techId);
    setTriageData(prev => ({
      ...prev,
      triaged_by: techId,
      triaged_by_name: tech?.full_name || ''
    }));
  };

  const handleSave = async () => {
    if (!ticket?.id) return;

    try {
      setSaving(true);
      await serviceTriageService.saveTriage(ticket.id, {
        triaged_by: triageData.triaged_by || user?.id,
        triaged_by_name: triageData.triaged_by_name || user?.name || user?.email || 'User',
        triage_notes: triageData.triage_notes,
        estimated_hours: triageData.estimated_hours ? parseFloat(triageData.estimated_hours) : null,
        parts_needed: triageData.parts_needed,
        proposal_needed: triageData.proposal_needed
      });

      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServiceTriageForm] Failed to save triage:', err);
    } finally {
      setSaving(false);
    }
  };

  const isTriaged = Boolean(ticket?.triaged_at);

  return (
    <div className="space-y-4">
      {/* Triage Status */}
      {isTriaged && (
        <div className="flex items-center gap-2 p-3 rounded-lg border"
          style={{
            backgroundColor: 'rgba(148, 175, 50, 0.1)',
            borderColor: 'rgba(148, 175, 50, 0.3)'
          }}
        >
          <CheckCircle size={18} style={{ color: brandColors.success }} />
          <div className="flex-1">
            <span className="text-sm" style={{ color: brandColors.success }}>
              Triaged by {ticket.triaged_by_name || 'Unknown'}
            </span>
            <span className="text-xs text-zinc-400 ml-2">
              {ticket.triaged_at ? new Date(ticket.triaged_at).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      )}

      {/* Triaged By Selector */}
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-2">
          <User size={14} />
          Triaged By
        </label>
        {loadingTechnicians ? (
          <div className="flex items-center gap-2 text-zinc-400 py-2">
            <Loader2 size={14} className="animate-spin" />
            Loading team members...
          </div>
        ) : (
          <select
            value={triageData.triaged_by}
            onChange={(e) => handleTriagedByChange(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">Select team member...</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}{tech.role ? ` (${tech.role})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Estimated Hours */}
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-2">
          <Clock size={14} />
          Estimated Time to Complete (hours)
        </label>
        <input
          type="number"
          value={triageData.estimated_hours}
          onChange={(e) => setTriageData(prev => ({ ...prev, estimated_hours: e.target.value }))}
          min="0"
          step="0.5"
          placeholder="e.g., 2.5"
          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
        />
        <p className="text-xs text-zinc-500 mt-1">Enter in 0.5 hour increments (0.5, 1, 1.5, etc.)</p>
      </div>

      {/* Triage Notes */}
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-2">
          <ClipboardCheck size={14} />
          Triage Notes
        </label>
        <textarea
          value={triageData.triage_notes}
          onChange={(e) => setTriageData(prev => ({ ...prev, triage_notes: e.target.value }))}
          rows={3}
          placeholder="Describe the issue assessment, root cause, and recommended solution..."
          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
        />
      </div>

      {/* Parts Needed Toggle */}
      <div className="flex items-center gap-3 p-3 bg-zinc-700/50 rounded-lg">
        <input
          type="checkbox"
          id="partsNeeded"
          checked={triageData.parts_needed}
          onChange={(e) => setTriageData(prev => ({ ...prev, parts_needed: e.target.checked }))}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-600 focus:ring-violet-500"
        />
        <label htmlFor="partsNeeded" className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <Package size={16} />
          Parts/Equipment Required
        </label>
      </div>

      {/* Proposal Needed Toggle */}
      <div className="flex items-center gap-3 p-3 bg-zinc-700/50 rounded-lg">
        <input
          type="checkbox"
          id="proposalNeeded"
          checked={triageData.proposal_needed}
          onChange={(e) => setTriageData(prev => ({ ...prev, proposal_needed: e.target.checked }))}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-600 focus:ring-violet-500"
        />
        <label htmlFor="proposalNeeded" className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <FileText size={16} />
          Customer Proposal Needed
        </label>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: brandColors.success, color: '#000' }}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle size={16} />
              {isTriaged ? 'Update Triage' : 'Save Triage'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ServiceTriageForm;
