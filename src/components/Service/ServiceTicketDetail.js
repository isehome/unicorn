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
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wifi,
  Tv,
  Sun,
  Settings,
  Cable,
  Wrench,
  ExternalLink,
  ClipboardCheck,
  Package,
  ShoppingCart,
  Camera,
  DollarSign,
  Loader2
} from 'lucide-react';
import {
  serviceTicketService,
  serviceScheduleService,
  technicianService,
  servicePartsService,
  servicePOService
} from '../../services/serviceTicketService';
import { quickbooksService } from '../../services/quickbooksService';
import ServiceTriageForm from './ServiceTriageForm';
import ServicePartsManager from './ServicePartsManager';
import ServicePOManager from './ServicePOManager';
import ServiceTimeTracker from './ServiceTimeTracker';
import ServicePhotosManager from './ServicePhotosManager';
import TechnicianAvatar from '../TechnicianAvatar';
import { useAppState } from '../../contexts/AppStateContext';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';
import { createCalendarEvent, checkUserAvailability } from '../../services/microsoftCalendarService';
import { supabase } from '../../lib/supabase';

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
    technician_id: '',
    technician_name: '',
    technician_email: '',
    service_address: '',
    pre_visit_notes: '',
    addToCalendar: true
  });

  // Technicians list
  const [technicians, setTechnicians] = useState([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);

  // Assignment state
  const [showAssign, setShowAssign] = useState(false);

  // Edit schedule state
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Availability check state
  const [availabilityStatus, setAvailabilityStatus] = useState(null); // { checking, available, conflicts, error }

  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState({
    customer: true,
    callRecording: false,
    actions: true,
    triage: true,
    parts: false,
    timeTracking: false,
    photos: false,
    purchaseOrders: false
  });

  // Parts and PO counts for badges
  const [partsCount, setPartsCount] = useState(0);
  const [partsNeededCount, setPartsNeededCount] = useState(0);
  const [posCount, setPosCount] = useState(0);

  // QuickBooks export state
  const [exportingToQBO, setExportingToQBO] = useState(false);
  const [qboError, setQboError] = useState(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});

  // Technology categories from database
  const [categories, setCategories] = useState([
    { value: 'network', label: 'Network' },
    { value: 'av', label: 'AV' },
    { value: 'shades', label: 'Shades' },
    { value: 'control', label: 'Control' },
    { value: 'wiring', label: 'Wiring' },
    { value: 'installation', label: 'Installation' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'general', label: 'General' }
  ]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Load technology categories from database
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('technology_categories')
          .select('name, label')
          .eq('is_active', true)
          .order('sort_order');

        if (!error && data?.length > 0) {
          setCategories(data.map(c => ({ value: c.name, label: c.label })));
        }
      } catch (err) {
        console.log('[ServiceTicketDetail] Using default categories');
      }
    };
    loadCategories();
  }, []);

  // Initialize edit data when entering edit mode
  const handleStartEdit = () => {
    setEditData({
      title: ticket?.title || '',
      description: ticket?.description || '',
      priority: ticket?.priority || 'normal',
      category: ticket?.category || 'general',
      customer_name: ticket?.customer_name || '',
      customer_phone: ticket?.customer_phone || '',
      customer_email: ticket?.customer_email || '',
      customer_address: ticket?.customer_address || '',
      service_address: ticket?.service_address || ''
    });
    setIsEditing(true);
  };

  // Save ticket edits
  const handleSaveEdit = async () => {
    if (!ticket?.id) return;

    try {
      setSaving(true);
      await serviceTicketService.update(ticket.id, editData);

      // Add note about the edit
      await serviceTicketService.addNote(ticket.id, {
        note_type: 'note',
        content: 'Ticket details updated',
        author_name: user?.name || user?.email || 'User'
      });

      setIsEditing(false);
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to save edits:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData({});
  };

  // Delete ticket permanently
  const handleDeleteTicket = async () => {
    if (!ticket) return;

    const ticketNumber = ticket.ticket_number || ticket.id;
    const customerName = ticket.customer_name || 'Unknown Customer';

    // First confirmation
    if (!window.confirm(
      `Are you sure you want to DELETE ticket #${ticketNumber} for "${customerName}"?\n\n` +
      `This action cannot be undone.`
    )) {
      return;
    }

    // Second confirmation for safety
    if (!window.confirm(
      `FINAL WARNING: You are about to permanently delete ticket #${ticketNumber}.\n\n` +
      `All associated schedules, notes, and history will be lost.\n\n` +
      `Type "DELETE" in the next prompt to confirm.`
    )) {
      return;
    }

    const confirmText = window.prompt('Type DELETE to confirm permanent deletion:');
    if (confirmText !== 'DELETE') {
      setError('Deletion cancelled - confirmation text did not match');
      return;
    }

    try {
      setSaving(true);

      // If there are schedules, delete them first
      if (ticket.schedules && ticket.schedules.length > 0) {
        for (const schedule of ticket.schedules) {
          await serviceScheduleService.remove(schedule.id);
        }
      }

      // Delete the ticket
      await serviceTicketService.remove(ticket.id);
      console.log('[ServiceTicketDetail] Ticket deleted:', ticket.id);

      // Navigate back to tickets list
      navigate('/service/tickets');
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to delete ticket:', err);
      setError('Failed to delete ticket: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

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

  // Load technicians when schedule modal opens - with skill matching
  const loadTechnicians = useCallback(async () => {
    try {
      setLoadingTechnicians(true);
      // Load technicians with skills for the ticket's category
      const category = ticket?.category || 'general';
      const data = await technicianService.getAllWithSkills(category);
      setTechnicians(data);
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to load technicians:', err);
      // Fallback to basic list
      try {
        const fallbackData = await technicianService.getAll();
        setTechnicians(fallbackData);
      } catch (fallbackErr) {
        console.error('[ServiceTicketDetail] Fallback failed:', fallbackErr);
      }
    } finally {
      setLoadingTechnicians(false);
    }
  }, [ticket?.category]);

  useEffect(() => {
    loadTicket();
    setView('service-ticket-detail');
  }, [loadTicket, setView]);

  // Load technicians when schedule or assign modal opens, or when ticket loads
  useEffect(() => {
    if (showSchedule || showAssign || ticket) {
      loadTechnicians();
    }
  }, [showSchedule, showAssign, ticket, loadTechnicians]);

  // Pre-fill schedule form with assigned technician when opening schedule modal
  useEffect(() => {
    if (showSchedule && ticket && !editingSchedule) {
      // Find the assigned technician in the technicians list
      const assignedTech = technicians.find(t => t.id === ticket.assigned_to);
      if (assignedTech) {
        setScheduleForm(prev => ({
          ...prev,
          technician_id: assignedTech.id,
          technician_name: assignedTech.full_name,
          technician_email: assignedTech.email || ''
        }));
      }
    }
  }, [showSchedule, ticket, technicians, editingSchedule]);

  // Load parts and PO counts for badges
  useEffect(() => {
    const loadCounts = async () => {
      if (!ticket?.id) return;
      try {
        const [parts, pos] = await Promise.all([
          servicePartsService.getPartsForTicket(ticket.id),
          servicePOService.getPOsForTicket(ticket.id)
        ]);
        setPartsCount(parts?.length || 0);
        // Count only parts with status 'needed' for the badge
        setPartsNeededCount(parts?.filter(p => p.status === 'needed').length || 0);
        setPosCount(pos?.length || 0);
      } catch (err) {
        console.error('[ServiceTicketDetail] Failed to load counts:', err);
      }
    };
    loadCounts();
  }, [ticket?.id]);

  // Auto-expand parts section when parts_needed is checked
  useEffect(() => {
    if (ticket?.parts_needed) {
      setExpandedSections(prev => ({ ...prev, parts: true }));
    }
  }, [ticket?.parts_needed]);

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

      const scheduleData = {
        scheduled_date: scheduleForm.scheduled_date,
        scheduled_time_start: scheduleForm.scheduled_time_start || null,
        scheduled_time_end: scheduleForm.scheduled_time_end || null,
        technician_id: scheduleForm.technician_id || null,
        technician_name: scheduleForm.technician_name || null,
        service_address: scheduleForm.service_address || null,
        pre_visit_notes: scheduleForm.pre_visit_notes || null
      };

      if (editingSchedule) {
        // Update existing schedule
        await serviceScheduleService.update(editingSchedule.id, scheduleData);

        // Add note about update
        await serviceTicketService.addNote(ticket.id, {
          note_type: 'schedule_update',
          content: `Service visit rescheduled to ${scheduleForm.scheduled_date} at ${scheduleForm.scheduled_time_start || 'TBD'} with ${scheduleForm.technician_name || 'TBD'}`,
          author_name: user?.name || user?.email || 'User'
        });
      } else {
        // Create new schedule
        scheduleData.ticket_id = ticket.id;
        await serviceScheduleService.create(scheduleData);
      }

      // Create calendar event if requested and technician has email
      if (scheduleForm.addToCalendar && scheduleForm.technician_email) {
        try {
          const calendarEvent = {
            title: `Service: ${ticket.title}`,
            doBy: scheduleForm.scheduled_date,
            doByTime: scheduleForm.scheduled_time_start || '09:00',
            plannedHours: calculateDuration(),
            description: buildCalendarDescription()
          };

          const attendees = [{
            email: scheduleForm.technician_email,
            name: scheduleForm.technician_name
          }];

          const result = await createCalendarEvent(user, calendarEvent, attendees);
          if (result.success) {
            console.log('[ServiceTicketDetail] Calendar event created:', result.eventId);
          } else {
            console.warn('[ServiceTicketDetail] Calendar event failed:', result.error);
          }
        } catch (calErr) {
          console.error('[ServiceTicketDetail] Calendar error:', calErr);
          // Don't fail the whole operation if calendar fails
        }
      }

      setShowSchedule(false);
      setEditingSchedule(null);
      setAvailabilityStatus(null);
      setScheduleForm({
        scheduled_date: '',
        scheduled_time_start: '',
        scheduled_time_end: '',
        technician_id: '',
        technician_name: '',
        technician_email: '',
        service_address: ticket?.customer_address || '',
        pre_visit_notes: '',
        addToCalendar: true
      });
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to save schedule:', err);
      setError(editingSchedule ? 'Failed to update schedule' : 'Failed to schedule visit');
    } finally {
      setSaving(false);
    }
  };

  // Helper to calculate duration from start/end times
  const calculateDuration = () => {
    if (!scheduleForm.scheduled_time_start || !scheduleForm.scheduled_time_end) {
      return 2; // Default 2 hours
    }
    const [startH, startM] = scheduleForm.scheduled_time_start.split(':').map(Number);
    const [endH, endM] = scheduleForm.scheduled_time_end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    return Math.max(1, (endMins - startMins) / 60);
  };

  // Build description for calendar event
  const buildCalendarDescription = () => {
    const parts = [
      `Ticket: ${ticket.ticket_number}`,
      `Issue: ${ticket.title}`,
      ticket.description ? `Description: ${ticket.description}` : null,
      ticket.customer_name ? `Customer: ${ticket.customer_name}` : null,
      ticket.customer_phone ? `Phone: ${ticket.customer_phone}` : null,
      scheduleForm.service_address ? `Address: ${scheduleForm.service_address}` : null,
      scheduleForm.pre_visit_notes ? `Notes: ${scheduleForm.pre_visit_notes}` : null
    ].filter(Boolean);
    return parts.join('\n');
  };

  // Handle technician selection
  const handleTechnicianChange = (techId) => {
    const tech = technicians.find(t => t.id === techId);
    setScheduleForm(prev => ({
      ...prev,
      technician_id: techId,
      technician_name: tech?.full_name || '',
      technician_email: tech?.email || ''
    }));
    // Clear availability status when technician changes
    setAvailabilityStatus(null);
  };

  // Check technician availability
  const checkAvailability = async () => {
    const { scheduled_date, scheduled_time_start, scheduled_time_end, technician_email } = scheduleForm;

    if (!scheduled_date || !scheduled_time_start || !technician_email) {
      setAvailabilityStatus(null);
      return;
    }

    setAvailabilityStatus({ checking: true });

    try {
      const result = await checkUserAvailability(
        user,
        technician_email,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end || null,
        30 // 30-minute buffer
      );

      setAvailabilityStatus({
        checking: false,
        available: result.available,
        conflicts: result.conflicts || [],
        error: result.error
      });
    } catch (err) {
      console.error('[ServiceTicketDetail] Availability check failed:', err);
      setAvailabilityStatus({
        checking: false,
        available: true, // Don't block on error
        conflicts: [],
        error: 'Could not check availability'
      });
    }
  };

  // Auto-check availability when date/time/technician changes
  useEffect(() => {
    if (showSchedule && scheduleForm.scheduled_date && scheduleForm.scheduled_time_start && scheduleForm.technician_email) {
      // Debounce the check
      const timer = setTimeout(() => {
        checkAvailability();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setAvailabilityStatus(null);
    }
  }, [showSchedule, scheduleForm.scheduled_date, scheduleForm.scheduled_time_start, scheduleForm.scheduled_time_end, scheduleForm.technician_email]);

  // Handle ticket assignment
  const handleAssign = async (techId) => {
    const tech = technicians.find(t => t.id === techId);
    if (!tech || !ticket) return;

    try {
      setSaving(true);
      await serviceTicketService.assign(
        ticket.id,
        techId,
        tech.full_name,
        user?.name || user?.email || 'User'
      );
      setShowAssign(false);
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to assign ticket:', err);
      setError('Failed to assign ticket');
    } finally {
      setSaving(false);
    }
  };

  // Open schedule modal for editing
  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      scheduled_date: schedule.scheduled_date || '',
      scheduled_time_start: schedule.scheduled_time_start || '',
      scheduled_time_end: schedule.scheduled_time_end || '',
      technician_id: schedule.technician_id || '',
      technician_name: schedule.technician_name || '',
      technician_email: '', // Will be populated from technicians list
      service_address: schedule.service_address || ticket?.customer_address || '',
      pre_visit_notes: schedule.pre_visit_notes || '',
      addToCalendar: false // Don't create new calendar event for edits by default
    });
    // Find technician email if we have technician_id
    if (schedule.technician_id && technicians.length > 0) {
      const tech = technicians.find(t => t.id === schedule.technician_id);
      if (tech?.email) {
        setScheduleForm(prev => ({ ...prev, technician_email: tech.email }));
      }
    }
    setShowSchedule(true);
  };

  // Delete a schedule
  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this scheduled visit?')) return;

    try {
      setSaving(true);
      await serviceScheduleService.remove(scheduleId);

      // Add note about deletion
      await serviceTicketService.addNote(ticket.id, {
        note_type: 'schedule_update',
        content: 'Scheduled visit was cancelled/deleted',
        author_name: user?.name || user?.email || 'User'
      });

      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] Failed to delete schedule:', err);
      setError('Failed to delete schedule');
    } finally {
      setSaving(false);
    }
  };

  // Export ticket to QuickBooks
  const handleExportToQuickBooks = async () => {
    if (!ticket?.id) return;

    // Confirm export
    if (!window.confirm(
      `Export ticket #${ticket.ticket_number} to QuickBooks?\n\n` +
      `This will create an invoice with:\n` +
      `- Labor hours logged\n` +
      `- Parts added to the ticket\n\n` +
      `Continue?`
    )) {
      return;
    }

    try {
      setExportingToQBO(true);
      setQboError(null);

      const result = await quickbooksService.createInvoiceFromTicket(ticket.id);

      // Show success and offer to view invoice
      if (result.invoiceUrl) {
        const viewNow = window.confirm(
          `Invoice #${result.invoiceNumber} created successfully!\n\n` +
          `Click OK to view in QuickBooks, or Cancel to stay here.`
        );
        if (viewNow) {
          window.open(result.invoiceUrl, '_blank');
        }
      }

      // Reload ticket to get updated QBO status
      await loadTicket();
    } catch (err) {
      console.error('[ServiceTicketDetail] QBO export failed:', err);
      setQboError(err.message || 'Failed to export to QuickBooks');
    } finally {
      setExportingToQBO(false);
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
              {isEditing ? (
                <>
                  <select
                    value={editData.priority}
                    onChange={(e) => setEditData(prev => ({ ...prev, priority: e.target.value }))}
                    className="px-2 py-0.5 bg-zinc-700 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-zinc-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </>
              ) : (
                <>
                  <span
                    className={`px-2 py-0.5 rounded border ${typeof statusStyle === 'string' ? statusStyle : ''}`}
                    style={typeof statusStyle === 'object' ? statusStyle : undefined}
                  >
                    {ticket.status?.replace('_', ' ')}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${getPriorityStyles(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </>
              )}
            </div>
            {isEditing ? (
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
                className="text-xl font-bold text-white bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1 w-full focus:outline-none focus:border-zinc-500"
              />
            ) : (
              <h1 className="text-xl font-bold text-white">{ticket.title}</h1>
            )}
            {/* Assigned Technician - inline in header */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-zinc-500">Assigned:</span>
              <select
                value={ticket.assigned_to || ''}
                onChange={async (e) => {
                  const techId = e.target.value;
                  if (!techId) return;
                  const tech = technicians.find(t => t.id === techId);
                  if (tech) {
                    try {
                      await serviceTicketService.assign(
                        ticket.id,
                        techId,
                        tech.full_name || tech.name || tech.email,
                        user?.name || user?.email || 'User'
                      );
                      await loadTicket();
                    } catch (err) {
                      console.error('[ServiceTicketDetail] Failed to assign:', err);
                    }
                  }
                }}
                className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="">-- Unassigned --</option>
                {/* Qualified technicians first (with skills matching ticket category) */}
                {technicians.filter(t => t.qualified).length > 0 && (
                  <optgroup label={`✓ Qualified for ${ticket.category || 'this category'}`}>
                    {technicians.filter(t => t.qualified).map(tech => (
                      <option key={tech.id} value={tech.id}>
                        {tech.highestProficiency === 'expert' ? '★ ' : tech.highestProficiency === 'proficient' ? '● ' : '○ '}
                        {tech.full_name || tech.name || tech.email}
                        {tech.skillCount > 0 ? ` (${tech.skillCount} skill${tech.skillCount > 1 ? 's' : ''})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* Other technicians */}
                {technicians.filter(t => !t.qualified).length > 0 && (
                  <optgroup label="Other Technicians">
                    {technicians.filter(t => !t.qualified).map(tech => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name || tech.name || tech.email}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* Fallback if no grouping info */}
                {!technicians.some(t => t.hasOwnProperty('qualified')) && technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name || tech.name || tech.email}
                  </option>
                ))}
              </select>
              {ticket.assigned_to_name && (() => {
                const assignedTechnician = technicians.find(t => t.id === ticket.assigned_to);
                return (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-700/50 rounded-lg">
                    <TechnicianAvatar
                      name={ticket.assigned_to_name}
                      color={assignedTechnician?.avatar_color}
                      size="sm"
                    />
                    <span className="text-sm text-zinc-300">{ticket.assigned_to_name}</span>
                  </div>
                );
              })()}
            </div>
          </div>
          {/* Edit/Save/Cancel buttons */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: brandColors.success, color: '#000' }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors"
              >
                <Edit size={14} />
                Edit Ticket
              </button>
            )}
          </div>
        </div>

        {/* Delete Ticket - only visible in edit mode */}
        {isEditing && (
          <div className="max-w-4xl mx-auto mb-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h3 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                <Trash2 size={16} />
                Danger Zone
              </h3>
              <p className="text-sm text-zinc-400 mb-3">
                Permanently delete this ticket and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={handleDeleteTicket}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/50 text-red-400 hover:bg-red-600/30 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                Delete Ticket Permanently
              </button>
            </div>
          </div>
        )}

        {/* Mobile-first: Customer & Actions at top */}
        <div className="lg:hidden space-y-4 mb-6">
          {/* Customer Info - Mobile Collapsible */}
          <div className="bg-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('customer')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User size={18} className="text-blue-400" />
                <h2 className="font-semibold text-white">Customer</h2>
                <span className="text-sm text-zinc-400 truncate max-w-[150px]">
                  {ticket.customer_name || ticket.contact?.full_name || 'Unknown'}
                </span>
              </div>
              {expandedSections.customer ? (
                <ChevronDown size={18} className="text-zinc-400" />
              ) : (
                <ChevronRight size={18} className="text-zinc-400" />
              )}
            </button>
            {expandedSections.customer && (
              <div className="p-4 pt-0 border-t border-zinc-700">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Name</label>
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-zinc-500" />
                        <input
                          type="text"
                          value={editData.customer_name}
                          onChange={(e) => setEditData(prev => ({ ...prev, customer_name: e.target.value }))}
                          placeholder="Customer name"
                          className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Phone</label>
                      <div className="flex items-center gap-2">
                        <Phone size={16} className="text-zinc-500" />
                        <input
                          type="tel"
                          value={editData.customer_phone}
                          onChange={(e) => setEditData(prev => ({ ...prev, customer_phone: e.target.value }))}
                          placeholder="Phone number"
                          className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Email</label>
                      <div className="flex items-center gap-2">
                        <Mail size={16} className="text-zinc-500" />
                        <input
                          type="email"
                          value={editData.customer_email}
                          onChange={(e) => setEditData(prev => ({ ...prev, customer_email: e.target.value }))}
                          placeholder="Email address"
                          className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Address</label>
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-zinc-500 mt-1" />
                        <textarea
                          value={editData.customer_address}
                          onChange={(e) => setEditData(prev => ({ ...prev, customer_address: e.target.value }))}
                          placeholder="Customer address"
                          rows={2}
                          className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(ticket.customer_name || ticket.contact?.full_name) && (
                      <div className="flex items-center gap-2 text-zinc-300 text-sm">
                        <User size={14} className="text-zinc-500" />
                        {ticket.customer_name || ticket.contact?.full_name}
                      </div>
                    )}
                    {(ticket.customer_phone || ticket.contact?.phone) && (
                      <a
                        href={`tel:${ticket.customer_phone || ticket.contact?.phone}`}
                        className="flex items-center gap-2 text-zinc-300 hover:text-white text-sm"
                      >
                        <Phone size={14} className="text-zinc-500" />
                        {ticket.customer_phone || ticket.contact?.phone}
                      </a>
                    )}
                    {(ticket.customer_email || ticket.contact?.email) && (
                      <a
                        href={`mailto:${ticket.customer_email || ticket.contact?.email}`}
                        className="flex items-center gap-2 text-zinc-300 hover:text-white text-sm"
                      >
                        <Mail size={14} className="text-zinc-500" />
                        {ticket.customer_email || ticket.contact?.email}
                      </a>
                    )}
                    {ticket.customer_address && (
                      <div className="flex items-start gap-2 text-zinc-300 text-sm">
                        <MapPin size={14} className="text-zinc-500 mt-0.5" />
                        <span>{ticket.customer_address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions - Mobile Collapsible */}
          <div className="bg-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('actions')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-violet-400" />
                <h2 className="font-semibold text-white">Quick Actions</h2>
              </div>
              {expandedSections.actions ? (
                <ChevronDown size={18} className="text-zinc-400" />
              ) : (
                <ChevronRight size={18} className="text-zinc-400" />
              )}
            </button>
            {expandedSections.actions && (
              <div className="p-4 pt-0 border-t border-zinc-700">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowSchedule(true)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors"
                  >
                    <Calendar size={14} />
                    Schedule Visit
                  </button>
                  {(ticket.status === 'resolved' || ticket.status === 'closed') && !ticket.qbo_invoice_id && (
                    <button
                      onClick={handleExportToQuickBooks}
                      disabled={exportingToQBO}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                    >
                      {exportingToQBO ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <DollarSign size={14} />
                      )}
                      Export to QuickBooks
                    </button>
                  )}
                </div>
                {ticket.qbo_invoice_id && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-green-400 text-xs">
                      <CheckCircle size={12} />
                      <span>Invoice #{ticket.qbo_invoice_number || ticket.qbo_invoice_id}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-white">Description</h2>
                {isEditing && (
                  <select
                    value={editData.category}
                    onChange={(e) => setEditData(prev => ({ ...prev, category: e.target.value }))}
                    className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-zinc-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  placeholder="Describe the issue..."
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
                />
              ) : (
                <p className="text-zinc-300 whitespace-pre-wrap">
                  {ticket.description || 'No description provided'}
                </p>
              )}
            </div>

            {/* Triage Section - Collapsible */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('triage')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={18} className="text-violet-400" />
                  <h2 className="font-semibold text-white">Triage</h2>
                  {ticket.triaged_at && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)', color: brandColors.success }}
                    >
                      Completed
                    </span>
                  )}
                  {ticket.estimated_hours && (
                    <span className="text-xs text-zinc-400">
                      Est. {ticket.estimated_hours}h
                    </span>
                  )}
                </div>
                {expandedSections.triage ? (
                  <ChevronDown size={18} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
              {expandedSections.triage && (
                <div className="p-4 pt-0 border-t border-zinc-700">
                  <ServiceTriageForm ticket={ticket} onUpdate={loadTicket} />
                </div>
              )}
            </div>

            {/* Parts Section - Collapsible (right after Triage) */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('parts')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-amber-400" />
                  <h2 className="font-semibold text-white">Parts & Equipment</h2>
                  {partsNeededCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                      {partsNeededCount} needed
                    </span>
                  )}
                  {partsCount > 0 && partsNeededCount === 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-600 text-zinc-300">
                      {partsCount} total
                    </span>
                  )}
                </div>
                {expandedSections.parts ? (
                  <ChevronDown size={18} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
              {expandedSections.parts && (
                <div className="p-4 pt-0 border-t border-zinc-700">
                  <ServicePartsManager
                    ticket={ticket}
                    onUpdate={async () => {
                      await loadTicket();
                      // Refresh parts counts
                      const parts = await servicePartsService.getPartsForTicket(ticket.id);
                      setPartsCount(parts?.length || 0);
                      setPartsNeededCount(parts?.filter(p => p.status === 'needed').length || 0);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Time Tracking Section - Collapsible */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('timeTracking')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-cyan-400" />
                  <h2 className="font-semibold text-white">Time Tracking</h2>
                  {ticket.hourly_rate && (
                    <span className="text-xs text-zinc-400">
                      ${ticket.hourly_rate}/hr
                    </span>
                  )}
                </div>
                {expandedSections.timeTracking ? (
                  <ChevronDown size={18} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
              {expandedSections.timeTracking && (
                <div className="p-4 pt-0 border-t border-zinc-700">
                  <ServiceTimeTracker
                    ticket={ticket}
                    technicians={technicians}
                    onUpdate={loadTicket}
                  />
                </div>
              )}
            </div>

            {/* Photos Section - Collapsible */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('photos')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-green-400" />
                  <h2 className="font-semibold text-white">Photos</h2>
                </div>
                {expandedSections.photos ? (
                  <ChevronDown size={18} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
              {expandedSections.photos && (
                <div className="p-4 pt-0 border-t border-zinc-700">
                  <ServicePhotosManager
                    ticketId={ticket.id}
                    user={user}
                    sharePointFolderUrl={ticket.sharepoint_folder_url}
                  />
                </div>
              )}
            </div>

            
            {/* Call Recording Section - Only show for phone_ai tickets */}
            {ticket.source === 'phone_ai' && (ticket.call_transcript || ticket.call_summary) && (
              <div className="bg-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('callRecording')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Phone size={18} className="text-purple-400" />
                    <h2 className="font-semibold text-white">Call Recording</h2>
                    {ticket.call_duration_seconds && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                        {Math.floor(ticket.call_duration_seconds / 60)}:{(ticket.call_duration_seconds % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  {expandedSections.callRecording ? (
                    <ChevronDown size={18} className="text-zinc-400" />
                  ) : (
                    <ChevronRight size={18} className="text-zinc-400" />
                  )}
                </button>
                {expandedSections.callRecording && (
                  <div className="p-4 pt-0 border-t border-zinc-700 space-y-4">
                    {/* AI Summary */}
                    {ticket.call_summary && (
                      <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-2">AI Summary</h3>
                        <p className="text-sm text-zinc-300 bg-zinc-700/50 rounded-lg p-3">
                          {ticket.call_summary}
                        </p>
                      </div>
                    )}
                    {/* Full Transcript */}
                    {ticket.call_transcript && (
                      <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-2">Full Transcript</h3>
                        <div className="text-sm text-zinc-300 bg-zinc-700/50 rounded-lg p-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono">
                          {ticket.call_transcript}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Purchase Orders Section - Collapsible */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('purchaseOrders')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart size={18} className="text-blue-400" />
                  <h2 className="font-semibold text-white">Purchase Orders</h2>
                  {posCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      {posCount}
                    </span>
                  )}
                </div>
                {expandedSections.purchaseOrders ? (
                  <ChevronDown size={18} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
              {expandedSections.purchaseOrders && (
                <div className="p-4 pt-0 border-t border-zinc-700">
                  <ServicePOManager
                    ticket={ticket}
                    onUpdate={async () => {
                      await loadTicket();
                      // Refresh PO count
                      const pos = await servicePOService.getPOsForTicket(ticket.id);
                      setPosCount(pos?.length || 0);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Status Workflow */}
            <div className="bg-zinc-800 rounded-lg p-4">
              <h2 className="font-semibold text-white mb-3">Update Status</h2>
              {nextStatuses.length > 0 ? (
                <div className="flex items-center gap-3">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleStatusChange(e.target.value);
                        e.target.value = ''; // Reset after selection
                      }
                    }}
                    disabled={saving}
                    className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                  >
                    <option value="">Select new status...</option>
                    {nextStatuses.map(status => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                  {saving && (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: brandColors.success }} />
                  )}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">No status transitions available</p>
              )}
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
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-white mb-1">
                            <Calendar size={16} />
                            <span>{schedule.scheduled_date}</span>
                            {schedule.scheduled_time_start && (
                              <span className="text-zinc-400">
                                at {schedule.scheduled_time_start}
                                {schedule.scheduled_time_end && ` - ${schedule.scheduled_time_end}`}
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
                          {schedule.pre_visit_notes && (
                            <div className="text-sm text-zinc-500 mt-1 italic">
                              {schedule.pre_visit_notes}
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
                        {/* Edit/Delete buttons - only show for non-completed/cancelled */}
                        {schedule.status !== 'completed' && schedule.status !== 'cancelled' && (
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => handleEditSchedule(schedule)}
                              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-600 rounded transition-colors"
                              title="Edit schedule"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(schedule.id)}
                              disabled={saving}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
                              title="Delete schedule"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
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
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Name</label>
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-zinc-500" />
                      <input
                        type="text"
                        value={editData.customer_name}
                        onChange={(e) => setEditData(prev => ({ ...prev, customer_name: e.target.value }))}
                        placeholder="Customer name"
                        className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Phone</label>
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-zinc-500" />
                      <input
                        type="tel"
                        value={editData.customer_phone}
                        onChange={(e) => setEditData(prev => ({ ...prev, customer_phone: e.target.value }))}
                        placeholder="Phone number"
                        className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Email</label>
                    <div className="flex items-center gap-2">
                      <Mail size={16} className="text-zinc-500" />
                      <input
                        type="email"
                        value={editData.customer_email}
                        onChange={(e) => setEditData(prev => ({ ...prev, customer_email: e.target.value }))}
                        placeholder="Email address"
                        className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Address</label>
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="text-zinc-500 mt-1" />
                      <textarea
                        value={editData.customer_address}
                        onChange={(e) => setEditData(prev => ({ ...prev, customer_address: e.target.value }))}
                        placeholder="Customer address"
                        rows={2}
                        className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500 resize-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Service Address (if different)</label>
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="text-zinc-500 mt-1" />
                      <textarea
                        value={editData.service_address}
                        onChange={(e) => setEditData(prev => ({ ...prev, service_address: e.target.value }))}
                        placeholder="Service address (if different from above)"
                        rows={2}
                        className="flex-1 px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-500 resize-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
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
                  {ticket.service_address && ticket.service_address !== ticket.customer_address && (
                    <div className="flex items-start gap-2 text-zinc-300">
                      <MapPin size={16} className="text-amber-500 mt-0.5" />
                      <div>
                        <span className="text-xs text-zinc-500 block">Service Address:</span>
                        <span>{ticket.service_address}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

                {/* QuickBooks Export - only for resolved/closed tickets */}
                {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                  <>
                    {ticket.qbo_invoice_id ? (
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
                          <CheckCircle size={14} />
                          <span className="font-medium">Exported to QuickBooks</span>
                        </div>
                        <div className="text-xs text-zinc-400">
                          Invoice #{ticket.qbo_invoice_number || ticket.qbo_invoice_id}
                          {ticket.qbo_synced_at && (
                            <span className="ml-2">
                              • {new Date(ticket.qbo_synced_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleExportToQuickBooks}
                        disabled={exportingToQBO}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm transition-colors disabled:opacity-50"
                      >
                        {exportingToQBO ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Creating Invoice...
                          </>
                        ) : (
                          <>
                            <DollarSign size={16} />
                            Export to QuickBooks
                          </>
                        )}
                      </button>
                    )}
                    {qboError && (
                      <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                        {qboError}
                      </div>
                    )}
                  </>
                )}
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
          <div className="bg-zinc-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-white">
                {editingSchedule ? 'Edit Scheduled Visit' : 'Schedule Service Visit'}
              </h3>
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
                {loadingTechnicians ? (
                  <div className="flex items-center gap-2 text-zinc-400 py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                    Loading technicians...
                  </div>
                ) : technicians.length > 0 ? (
                  <select
                    value={scheduleForm.technician_id}
                    onChange={(e) => handleTechnicianChange(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">Select technician...</option>
                    {/* Qualified technicians first */}
                    {technicians.filter(t => t.qualified).length > 0 && (
                      <optgroup label={`✓ Qualified for ${ticket?.category || 'this category'}`}>
                        {technicians.filter(t => t.qualified).map(tech => (
                          <option key={tech.id} value={tech.id}>
                            {tech.highestProficiency === 'expert' ? '★ ' : tech.highestProficiency === 'proficient' ? '● ' : '○ '}
                            {tech.full_name}{tech.role ? ` (${tech.role})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Other technicians */}
                    {technicians.filter(t => !t.qualified).length > 0 && (
                      <optgroup label="Other Technicians">
                        {technicians.filter(t => !t.qualified).map(tech => (
                          <option key={tech.id} value={tech.id}>
                            {tech.full_name}{tech.role ? ` (${tech.role})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* Fallback if no grouping info */}
                    {!technicians.some(t => t.hasOwnProperty('qualified')) && technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}{tech.role ? ` (${tech.role})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={scheduleForm.technician_name}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, technician_name: e.target.value }))}
                    placeholder="Technician name"
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                )}
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
              {/* Availability Check Status */}
              {availabilityStatus && (
                <div className={`p-3 rounded-lg border ${
                  availabilityStatus.checking
                    ? 'bg-zinc-700/50 border-zinc-600'
                    : availabilityStatus.available
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  {availabilityStatus.checking ? (
                    <div className="flex items-center gap-2 text-zinc-300 text-sm">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400" />
                      Checking technician availability...
                    </div>
                  ) : availabilityStatus.available ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle size={16} />
                      Technician is available (including 30-min buffer)
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                        <AlertTriangle size={16} />
                        Schedule conflict detected!
                      </div>
                      {availabilityStatus.conflicts.length > 0 && (
                        <div className="text-xs text-zinc-400 space-y-1">
                          {availabilityStatus.conflicts.slice(0, 3).map((conflict, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Clock size={12} />
                              <span>{conflict.subject}</span>
                              {conflict.start && (
                                <span className="text-zinc-500">
                                  ({new Date(conflict.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-amber-400">
                        You can still schedule, but there may be a conflict.
                      </p>
                    </div>
                  )}
                  {availabilityStatus.error && (
                    <p className="text-xs text-zinc-500 mt-1">{availabilityStatus.error}</p>
                  )}
                </div>
              )}
              {/* Calendar Integration */}
              <div className="flex items-center gap-3 p-3 bg-zinc-700/50 rounded-lg">
                <input
                  type="checkbox"
                  id="addToCalendar"
                  checked={scheduleForm.addToCalendar}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, addToCalendar: e.target.checked }))}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-[#94AF32] focus:ring-[#94AF32]"
                />
                <label htmlFor="addToCalendar" className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <Calendar size={16} />
                  Add to technician's calendar
                </label>
              </div>
              {scheduleForm.addToCalendar && !scheduleForm.technician_email && scheduleForm.technician_id && (
                <p className="text-xs text-amber-400">
                  Note: Selected technician has no email - calendar invite won't be sent.
                </p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSchedule(false);
                    setEditingSchedule(null);
                    setAvailabilityStatus(null);
                    setScheduleForm({
                      scheduled_date: '',
                      scheduled_time_start: '',
                      scheduled_time_end: '',
                      technician_id: '',
                      technician_name: '',
                      technician_email: '',
                      service_address: ticket?.customer_address || '',
                      pre_visit_notes: '',
                      addToCalendar: true
                    });
                  }}
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
                  {saving ? (editingSchedule ? 'Saving...' : 'Scheduling...') : (editingSchedule ? 'Save Changes' : 'Schedule Visit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Ticket Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-zinc-700">
              <h3 className="font-semibold text-white">Assign Ticket</h3>
            </div>
            <div className="p-4">
              {loadingTechnicians ? (
                <div className="flex items-center justify-center gap-2 text-zinc-400 py-8">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400" />
                  Loading team members...
                </div>
              ) : technicians.length > 0 ? (
                <div className="space-y-2">
                  {/* Qualified technicians section */}
                  {technicians.filter(t => t.qualified).length > 0 && (
                    <>
                      <div className="text-xs text-zinc-500 font-medium px-1 py-1 border-b border-zinc-700">
                        ✓ Qualified for {ticket?.category || 'this category'}
                      </div>
                      {technicians.filter(t => t.qualified).map(tech => (
                        <button
                          key={tech.id}
                          onClick={() => handleAssign(tech.id)}
                          disabled={saving}
                          className="w-full flex items-center gap-3 p-3 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors text-left disabled:opacity-50 border-l-2"
                          style={{ borderLeftColor: tech.highestProficiency === 'expert' ? '#10B981' : tech.highestProficiency === 'proficient' ? '#3B82F6' : '#F59E0B' }}
                        >
                          <TechnicianAvatar name={tech.full_name} color={tech.avatar_color} size="md" />
                          <div className="flex-1">
                            <div className="text-white flex items-center gap-2">
                              {tech.full_name}
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                backgroundColor: tech.highestProficiency === 'expert' ? '#10B98120' : tech.highestProficiency === 'proficient' ? '#3B82F620' : '#F59E0B20',
                                color: tech.highestProficiency === 'expert' ? '#10B981' : tech.highestProficiency === 'proficient' ? '#3B82F6' : '#F59E0B'
                              }}>
                                {tech.highestProficiency === 'expert' ? '★ Expert' : tech.highestProficiency === 'proficient' ? '● Proficient' : '○ Training'}
                              </span>
                            </div>
                            {tech.role && (
                              <div className="text-xs text-zinc-400">{tech.role} • {tech.skillCount} skill{tech.skillCount !== 1 ? 's' : ''}</div>
                            )}
                          </div>
                          {ticket?.assigned_to === tech.id && (
                            <CheckCircle size={16} style={{ color: brandColors.success }} />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {/* Other technicians section */}
                  {technicians.filter(t => !t.qualified).length > 0 && (
                    <>
                      <div className="text-xs text-zinc-500 font-medium px-1 py-1 border-b border-zinc-700 mt-3">
                        Other Technicians
                      </div>
                      {technicians.filter(t => !t.qualified).map(tech => (
                        <button
                          key={tech.id}
                          onClick={() => handleAssign(tech.id)}
                          disabled={saving}
                          className="w-full flex items-center gap-3 p-3 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors text-left disabled:opacity-50"
                        >
                          <TechnicianAvatar name={tech.full_name} color={tech.avatar_color} size="md" />
                          <div className="flex-1">
                            <div className="text-white">{tech.full_name}</div>
                            {tech.role && (
                              <div className="text-xs text-zinc-400">{tech.role}</div>
                            )}
                          </div>
                          {ticket?.assigned_to === tech.id && (
                            <CheckCircle size={16} style={{ color: brandColors.success }} />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {/* Fallback for when no qualification data */}
                  {!technicians.some(t => t.hasOwnProperty('qualified')) && technicians.map(tech => (
                    <button
                      key={tech.id}
                      onClick={() => handleAssign(tech.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors text-left disabled:opacity-50"
                    >
                      <TechnicianAvatar name={tech.full_name} color={tech.avatar_color} size="md" />
                      <div className="flex-1">
                        <div className="text-white">{tech.full_name}</div>
                        {tech.role && (
                          <div className="text-xs text-zinc-400">{tech.role}</div>
                        )}
                      </div>
                      {ticket?.assigned_to === tech.id && (
                        <CheckCircle size={16} style={{ color: brandColors.success }} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-400 text-center py-8">
                  No team members found. Add internal contacts to assign tickets.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-zinc-700 flex justify-end">
              <button
                onClick={() => setShowAssign(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceTicketDetail;
