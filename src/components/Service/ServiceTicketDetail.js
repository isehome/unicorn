/**
 * ServiceTicketDetail.js
 * Full ticket detail view with notes, scheduling, and status workflow
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wifi,
  Tv,
  Sun,
  Settings,
  Cable,
  Wrench,
  ExternalLink
} from 'lucide-react';
import {
  serviceTicketService,
  serviceScheduleService
} from '../../services/serviceTicketService';
import { useAppState } from '../../contexts/AppStateContext';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

// Category icons
const categoryIcons = {
  network: Wifi,
  av: Tv,
  shades: Sun,
  control: Settings,
  wiring: Cable,
  installation: Wrench,
  maintenance: Wrench,
  general: Wrench
};

const STATUS_WORKFLOW = {
  open: ['triaged', 'scheduled', 'closed'],
  triaged: ['scheduled', 'in_progress', 'closed'],
  scheduled: ['in_progress', 'waiting_customer', 'closed'],
  in_progress: ['waiting_parts', 'waiting_customer', 'resolved'],
  waiting_parts: ['in_progress', 'resolved'],
  waiting_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open']
};

const ServiceTicketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { publishState, registerActions, unregisterActions, setView } = useAppState();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showAddNote, setShowAddNote] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('note');

  // Schedule form
  const [scheduleForm, setScheduleForm] = useState({
    scheduled_date: '',
    scheduled_time_start: '',
    scheduled_time_end: '',
    technician_name: '',
    service_address: '',
    pre_visit_notes: ''
  });

  const loadTicket = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');
      const data = await serviceTicketService.getById(id);
      setTicket(data);

      // Pre-fill schedule form with ticket address
      if (data?.customer_address) {
        setScheduleForm(prev => ({
          ...prev,
          service_address: data.customer_address
        }));
      }
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to load ticket:', err);
      setError('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTicket();
    setView('service-ticket-detail');
  }, [loadTicket, setView]);

  // Publish state for AI Brain
  useEffect(() => {
    if (ticket) {
      publishState({
        view: 'service-ticket-detail',
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer_name: ticket.customer_name
        }
      });
    }
  }, [ticket, publishState]);

  // Register actions for AI Brain
  useEffect(() => {
    const actions = {
      update_status: async ({ status }) => {
        await handleStatusChange(status);
        return { success: true, message: `Status updated to ${status}` };
      },
      add_note: async ({ content, type = 'note' }) => {
        await handleAddNote(content, type);
        return { success: true, message: 'Note added' };
      },
      schedule_visit: async ({ date, time, technician, notes }) => {
        setScheduleForm({
          scheduled_date: date || '',
          scheduled_time_start: time || '',
          scheduled_time_end: '',
          technician_name: technician || '',
          service_address: ticket?.customer_address || '',
          pre_visit_notes: notes || ''
        });
        setShowSchedule(true);
        return { success: true, message: 'Schedule form opened' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [ticket, registerActions, unregisterActions]);

  const handleStatusChange = async (newStatus) => {
    if (!ticket) return;

    try {
      setSaving(true);
      await serviceTicketService.updateStatus(
        ticket.id,
        newStatus,
        user?.id,
        user?.name || user?.email || 'User'
      );
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to update status:', err);
      setError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async (content = noteContent, type = noteType) => {
    if (!ticket || !content.trim()) return;

    try {
      setSaving(true);
      await serviceTicketService.addNote(ticket.id, {
        note_type: type,
        content: content.trim(),
        author_id: user?.id,
        author_name: user?.name || user?.email || 'User'
      });
      setNoteContent('');
      setShowAddNote(false);
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to add note:', err);
      setError('Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!ticket || !scheduleForm.scheduled_date) return;

    try {
      setSaving(true);
      await serviceScheduleService.create({
        ticket_id: ticket.id,
        ...scheduleForm
      });
      setShowSchedule(false);
      setScheduleForm({
        scheduled_date: '',
        scheduled_time_start: '',
        scheduled_time_end: '',
        technician_name: '',
        service_address: ticket?.customer_address || '',
        pre_visit_notes: ''
      });
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to create schedule:', err);
      setError('Failed to schedule visit');
    } finally {
      setSaving(false);
    }
  };

  const getStatusStyles = (status) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
      case 'triaged':
        return 'bg-orange-500/20 text-orange-500 border-orange-500/50';
      case 'scheduled':
        return 'bg-blue-500/20 text-blue-500 border-blue-500/50';
      case 'in_progress':
        return 'bg-purple-500/20 text-purple-500 border-purple-500/50';
      case 'waiting_parts':
      case 'waiting_customer':
        return 'bg-amber-500/20 text-amber-500 border-amber-500/50';
      case 'resolved':
        return {
          backgroundColor: 'rgba(148, 175, 50, 0.2)',
          color: brandColors.success,
          borderColor: 'rgba(148, 175, 50, 0.5)'
        };
      case 'closed':
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/50';
      default:
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/50';
    }
  };

  const getPriorityStyles = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/20 text-red-500';
      case 'high':
        return 'bg-orange-500/20 text-orange-500';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'low':
        return 'bg-zinc-500/20 text-zinc-400';
      default:
        return 'bg-zinc-500/20 text-zinc-400';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const getNoteIcon = (noteType) => {
    switch (noteType) {
      case 'phone_call':
        return Phone;
      case 'status_change':
        return CheckCircle;
      case 'assignment':
        return User;
      case 'schedule_update':
        return Calendar;
      case 'tech_note':
        return Wrench;
      case 'resolution':
        return CheckCircle;
      default:
        return MessageSquare;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: brandColors.success }}
        />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-zinc-900 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/service/tickets')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4"
          >
            <ArrowLeft size={18} />
            Back to Tickets
          </button>
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
            {error || 'Ticket not found'}
          </div>
        </div>
      </div>
    );
  }

  const CategoryIcon = categoryIcons[ticket.category] || Wrench;
  const statusStyle = getStatusStyles(ticket.status);
  const nextStatuses = STATUS_WORKFLOW[ticket.status] || [];

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/service/tickets')}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
              <span className="font-mono">{ticket.ticket_number}</span>
              <span
                className={`px-2 py-0.5 rounded border ${typeof statusStyle === 'string' ? statusStyle : ''}`}
                style={typeof statusStyle === 'object' ? statusStyle : undefined}
              >
                {ticket.status?.replace('_', ' ')}
              </span>
              <span className={`px-2 py-0.5 rounded ${getPriorityStyles(ticket.priority)}`}>
                {ticket.priority}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white">{ticket.title}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Description</h2>
              <p className="text-zinc-300 whitespace-pre-wrap">
                {ticket.description || 'No description provided'}
              </p>
            </div>

            {/* Status Workflow */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Update Status</h2>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={saving}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm capitalize transition-colors disabled:opacity-50"
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
                {nextStatuses.length === 0 && (
                  <p className="text-zinc-500 text-sm">No status transitions available</p>
                )}
              </div>
            </div>

            {/* Schedules */}
            {ticket.schedules && ticket.schedules.length > 0 && (
              <div className="bg-zinc-800 rounded-lg p-4">
                <h2 className="font-semibold text-white mb-3">Scheduled Visits</h2>
                <div className="space-y-3">
                  {ticket.schedules.map(schedule => (
                    <div
                      key={schedule.id}
                      className="p-3 bg-zinc-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 text-white mb-1">
                        <Calendar size={16} />
                        <span>{schedule.scheduled_date}</span>
                        {schedule.scheduled_time_start && (
                          <span className="text-zinc-400">
                            at {schedule.scheduled_time_start}
                          </span>
                        )}
                      </div>
                      {schedule.technician_name && (
                        <div className="text-sm text-zinc-400">
                          Technician: {schedule.technician_name}
                        </div>
                      )}
                      {schedule.service_address && (
                        <div className="text-sm text-zinc-400 flex items-center gap-1">
                          <MapPin size={12} />
                          {schedule.service_address}
                        </div>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded mt-2 inline-block ${
                        schedule.status === 'completed'
                          ? 'bg-green-500/20 text-green-500'
                          : schedule.status === 'cancelled'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {schedule.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Timeline */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white">Activity</h2>
                <button
                  onClick={() => setShowAddNote(true)}
                  className="flex items-center gap-1 text-sm hover:underline"
                  style={{ color: brandColors.success }}
                >
                  <Plus size={14} />
                  Add Note
                </button>
              </div>

              <div className="space-y-4">
                {(ticket.notes || [])
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map(note => {
                    const NoteIcon = getNoteIcon(note.note_type);
                    return (
                      <div key={note.id} className="flex gap-3">
                        <div className="p-2 bg-zinc-700 rounded-lg h-fit">
                          <NoteIcon size={14} className="text-zinc-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                            <span>{note.author_name || 'System'}</span>
                            <span>•</span>
                            <span>{formatDateTime(note.created_at)}</span>
                            <span className="capitalize">({note.note_type?.replace('_', ' ')})</span>
                          </div>
                          <p className="text-zinc-300 text-sm">{note.content}</p>
                        </div>
                      </div>
                    );
                  })}

                {(!ticket.notes || ticket.notes.length === 0) && (
                  <p className="text-zinc-500 text-sm">No activity yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Customer</h2>
              <div className="space-y-3">
                {(ticket.customer_name || ticket.contact?.full_name) && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <User size={16} className="text-zinc-500" />
                    {ticket.customer_name || ticket.contact?.full_name}
                  </div>
                )}
                {(ticket.customer_phone || ticket.contact?.phone) && (
                  <a
                    href={`tel:${ticket.customer_phone || ticket.contact?.phone}`}
                    className="flex items-center gap-2 text-zinc-300 hover:text-white"
                  >
                    <Phone size={16} className="text-zinc-500" />
                    {ticket.customer_phone || ticket.contact?.phone}
                  </a>
                )}
                {(ticket.customer_email || ticket.contact?.email) && (
                  <a
                    href={`mailto:${ticket.customer_email || ticket.contact?.email}`}
                    className="flex items-center gap-2 text-zinc-300 hover:text-white"
                  >
                    <Mail size={16} className="text-zinc-500" />
                    {ticket.customer_email || ticket.contact?.email}
                  </a>
                )}
                {ticket.customer_address && (
                  <div className="flex items-start gap-2 text-zinc-300">
                    <MapPin size={16} className="text-zinc-500 mt-0.5" />
                    <span>{ticket.customer_address}</span>
                  </div>
                )}
              </div>

              {ticket.project && (
                <div className="mt-4 pt-4 border-t border-zinc-700">
                  <button
                    onClick={() => navigate(`/project/${ticket.project.id}`)}
                    className="flex items-center gap-2 text-sm hover:underline"
                    style={{ color: brandColors.success }}
                  >
                    <ExternalLink size={14} />
                    View Project: {ticket.project.name}
                  </button>
                </div>
              )}
            </div>

            {/* Ticket Details */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Category</span>
                  <div className="flex items-center gap-2 text-zinc-300 capitalize">
                    <CategoryIcon size={14} />
                    {ticket.category}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Source</span>
                  <span className="text-zinc-300 capitalize">
                    {ticket.source?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Created</span>
                  <span className="text-zinc-300">
                    {formatDateTime(ticket.created_at)}
                  </span>
                </div>
                {ticket.assigned_to && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Assigned To</span>
                    <span className="text-zinc-300">
                      {ticket.assigned_to}
                    </span>
                  </div>
                )}
                {ticket.resolved_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Resolved</span>
                    <span className="text-zinc-300">
                      {formatDateTime(ticket.resolved_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Actions</h2>
              <div className="space-y-2">
                <button
                  onClick={() => setShowSchedule(true)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors"
                >
                  <Calendar size={16} />
                  Schedule Visit
                </button>
                <button
                  onClick={() => setShowAddNote(true)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors"
                >
                  <MessageSquare size={16} />
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      {showAddNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-white">Add Note</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Note Type</label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                >
                  <option value="note">General Note</option>
                  <option value="tech_note">Technician Note</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="customer_update">Customer Update</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Content</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
                  placeholder="Enter note..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-zinc-700 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddNote(false);
                  setNoteContent('');
                }}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddNote()}
                disabled={!noteContent.trim() || saving}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: brandColors.success, color: '#000' }}
              >
                {saving ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-white">Schedule Service Visit</h3>
            </div>
            <form onSubmit={handleScheduleSubmit} className="p-4 space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Date *</label>
                <input
                  type="date"
                  value={scheduleForm.scheduled_date}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Start Time</label>
                  <input
                    type="time"
                    value={scheduleForm.scheduled_time_start}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_time_start: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">End Time</label>
                  <input
                    type="time"
                    value={scheduleForm.scheduled_time_end}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_time_end: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Technician</label>
                <input
                  type="text"
                  value={scheduleForm.technician_name}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, technician_name: e.target.value }))}
                  placeholder="Technician name"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Service Address</label>
                <input
                  type="text"
                  value={scheduleForm.service_address}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, service_address: e.target.value }))}
                  placeholder="Address"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
                <textarea
                  value={scheduleForm.pre_visit_notes}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, pre_visit_notes: e.target.value }))}
                  rows={2}
                  placeholder="Pre-visit notes, access instructions, etc."
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSchedule(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!scheduleForm.scheduled_date || saving}
                  className="px-4 py-2 rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: brandColors.success, color: '#000' }}
                >
                  {saving ? 'Scheduling...' : 'Schedule Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceTicketDetail;
