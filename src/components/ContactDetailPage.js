import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';
import { contactSecureDataService } from '../services/equipmentService';
import Button from './ui/Button';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building,
  MapPin,
  Key,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Edit2,
  Trash2,
  CheckCircle,
  Save,
  X,
  Loader,
  Shield,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

const DATA_TYPES = [
  { value: 'credentials', label: 'Credentials' },
  { value: 'network', label: 'Network' },
  { value: 'api_key', label: 'API Key' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' }
];

const ContactDetailPage = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];

  // Contact data
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Contact edit state
  const [showEditContact, setShowEditContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    department: '',
    is_internal: false,
    contact_type: 'person',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: ''
  });

  // Secure data
  const [secureData, setSecureData] = useState([]);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [copiedItem, setCopiedItem] = useState(null);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    data_type: 'other',
    username: '',
    password: '',
    url: '',
    notes: ''
  });

  // Projects this contact is associated with
  const [projects, setProjects] = useState([]);

  // Styles
  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#6B7280';

    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        color: textPrimary
      },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary }
    };
  }, [mode, sectionStyles]);

  // Load contact and related data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Load contact
      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (contactError) throw contactError;
      setContact(contactData);

      // Load secure data for this contact
      const secureDataResult = await contactSecureDataService.getForContact(contactId);
      setSecureData(secureDataResult || []);

      // Log access
      await contactSecureDataService.logAccess(contactId, user?.id, 'view_list', null, { source: 'contact_detail_page' });

      // Load projects where this contact is a stakeholder
      const { data: stakeholderAssignments, error: stakeholderError } = await supabase
        .from('project_stakeholders')
        .select(`
          id,
          stakeholder_role_id,
          project:project_id(
            id,
            name,
            phase
          ),
          role:stakeholder_role_id(
            id,
            name,
            category
          )
        `)
        .eq('contact_id', contactId);

      if (!stakeholderError && stakeholderAssignments) {
        const uniqueProjects = [];
        const seenProjectIds = new Set();

        stakeholderAssignments.forEach(assignment => {
          if (assignment.project && !seenProjectIds.has(assignment.project.id)) {
            seenProjectIds.add(assignment.project.id);
            uniqueProjects.push({
              ...assignment.project,
              role: assignment.role?.name || 'Stakeholder'
            });
          }
        });

        setProjects(uniqueProjects);
      }

    } catch (err) {
      console.error('Failed to load contact:', err);
      setError(err.message || 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [contactId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    if (!contact) return;

    const contactName = (contact.contact_type === 'company' && contact.company)
      ? contact.company
      : (contact.full_name || contact.name ||
        `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.company || 'Unknown');

    publishState({
      view: 'contact-detail',
      contact: {
        id: contact.id,
        name: contactName,
        type: contact.is_internal ? 'internal' : 'external',
        email: contact.email || null,
        phone: contact.phone || null,
        company: contact.company || null,
        role: contact.role || null
      },
      secureDataCount: secureData.length,
      relatedProjects: projects.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role
      })),
      hint: `Contact detail view for ${contactName}. ${contact.is_internal ? 'Internal' : 'External'} contact. Has ${secureData.length} secure data items and ${projects.length} related projects.`
    });
  }, [publishState, contact, secureData, projects]);

  // Contact edit handler (defined before AI actions that reference it)
  // Auto-parse full name into first/last when user tabs out of first_name field
  const handleFirstNameBlur = useCallback(() => {
    const value = contactFormData.first_name.trim();
    if (value.includes(' ') && !contactFormData.last_name) {
      const parts = value.split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      setContactFormData(prev => ({
        ...prev,
        first_name: firstName,
        last_name: lastName
      }));
    }
  }, [contactFormData.first_name, contactFormData.last_name]);

  const handleEditContact = useCallback(() => {
    if (!contact) return;
    setContactFormData({
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      role: contact.role || '',
      department: contact.department || '',
      is_internal: contact.is_internal || false,
      contact_type: contact.contact_type || 'person',
      address1: contact.address1 || '',
      address2: contact.address2 || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.zip || ''
    });
    setShowEditContact(true);
  }, [contact]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      edit_contact: async () => {
        if (!contact) {
          return { success: false, error: 'No contact loaded' };
        }
        handleEditContact();
        return { success: true, message: `Opening edit form for ${contact.full_name || contact.name}` };
      },
      call_contact: async () => {
        if (!contact?.phone) {
          return { success: false, error: 'Contact has no phone number' };
        }
        const sanitized = `${contact.phone}`.replace(/[^+\d]/g, '');
        window.location.href = `tel:${sanitized}`;
        return { success: true, message: `Calling ${contact.full_name || contact.name}` };
      },
      email_contact: async () => {
        if (!contact?.email) {
          return { success: false, error: 'Contact has no email address' };
        }
        window.location.href = `mailto:${contact.email}`;
        return { success: true, message: `Opening email to ${contact.full_name || contact.name}` };
      },
      view_projects: async () => {
        if (projects.length === 0) {
          return { success: false, error: 'Contact has no associated projects' };
        }
        return {
          success: true,
          message: `Contact is associated with ${projects.length} project(s)`,
          projects: projects.map(p => ({ id: p.id, name: p.name, role: p.role }))
        };
      },
      go_to_project: async ({ projectId }) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) {
          return { success: false, error: 'Project not found in associated projects' };
        }
        navigate(`/project/${projectId}`);
        return { success: true, message: `Navigating to project: ${project.name}` };
      },
      add_secure_data: async () => {
        handleAddNew();
        return { success: true, message: 'Opening form to add new secure data' };
      },
      go_back: async () => {
        navigate(-1);
        return { success: true, message: 'Navigating back' };
      },
      get_contact_info: async () => {
        if (!contact) {
          return { success: false, error: 'No contact loaded' };
        }
        const contactName = contact.full_name || contact.name ||
          `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        return {
          success: true,
          contact: {
            name: contactName,
            type: contact.is_internal ? 'internal' : 'external',
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            role: contact.role
          }
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, contact, projects, navigate, handleEditContact]);

  // Handlers
  const togglePasswordVisibility = async (itemId) => {
    const newState = !visiblePasswords[itemId];

    if (newState) {
      await contactSecureDataService.logAccess(
        contactId,
        user?.id,
        'view_password',
        itemId,
        { source: 'contact_detail_page' }
      );
    }

    setVisiblePasswords(prev => ({
      ...prev,
      [itemId]: newState
    }));
  };

  const copyToClipboard = async (text, itemId, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(`${itemId}-${field}`);

      await contactSecureDataService.logAccess(
        contactId,
        user?.id,
        'copy_credential',
        itemId,
        { field, source: 'contact_detail_page' }
      );

      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAddNew = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      data_type: 'other',
      username: '',
      password: '',
      url: '',
      notes: ''
    });
    setShowAddForm(true);
    setError('');
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      data_type: item.data_type || 'other',
      username: item.username || '',
      password: item.password || '',
      url: item.url || '',
      notes: item.notes || ''
    });
    setShowAddForm(true);
    setError('');
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This action cannot be undone.`)) return;

    try {
      await contactSecureDataService.delete(item.id, user?.id);
      setSecureData(prev => prev.filter(s => s.id !== item.id));
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete secure data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        name: formData.name,
        data_type: formData.data_type,
        username: formData.username,
        password: formData.password,
        url: formData.url,
        notes: formData.notes,
        created_by: user?.id
      };

      let savedItem;
      if (editingItem) {
        savedItem = await contactSecureDataService.update(editingItem.id, payload);
        setSecureData(prev => prev.map(s => s.id === editingItem.id ? savedItem : s));
      } else {
        savedItem = await contactSecureDataService.create(contactId, payload);
        setSecureData(prev => [...prev, savedItem]);
      }

      setShowAddForm(false);
      setEditingItem(null);
      setFormData({
        name: '',
        data_type: 'other',
        username: '',
        password: '',
        url: '',
        notes: ''
      });
    } catch (err) {
      console.error('Failed to save:', err);
      setError(err.message || 'Failed to save secure data');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingItem(null);
    setError('');
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    try {
      setSavingContact(true);

      // Build full_name from first_name and last_name
      const fullName = `${contactFormData.first_name || ''} ${contactFormData.last_name || ''}`.trim();

      // Consolidate address
      const addressParts = [];
      if (contactFormData.address1) addressParts.push(contactFormData.address1);
      if (contactFormData.address2) addressParts.push(contactFormData.address2);
      const cityStateZip = [];
      if (contactFormData.city) cityStateZip.push(contactFormData.city);
      if (contactFormData.state) cityStateZip.push(contactFormData.state);
      if (contactFormData.zip) cityStateZip.push(contactFormData.zip);
      if (cityStateZip.length > 0) {
        let formatted = '';
        if (contactFormData.city) formatted += contactFormData.city;
        if (contactFormData.state) formatted += (formatted ? ', ' : '') + contactFormData.state;
        if (contactFormData.zip) formatted += (formatted ? ' ' : '') + contactFormData.zip;
        addressParts.push(formatted);
      }

      // For company contacts, use company name as the display name
      const displayName = contactFormData.contact_type === 'company' && contactFormData.company
        ? contactFormData.company
        : (fullName || contactFormData.company || 'Unknown');

      const payload = {
        ...contactFormData,
        full_name: displayName,
        name: displayName,
        address: addressParts.join(', ')
      };

      const { data, error: updateError } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', contactId)
        .select()
        .single();

      if (updateError) throw updateError;

      setContact(data);
      setShowEditContact(false);
    } catch (err) {
      console.error('Failed to update contact:', err);
      alert('Failed to update contact: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!window.confirm('Are you sure you want to delete this contact? This action cannot be undone.')) return;

    try {
      setSavingContact(true);

      // Soft delete by setting is_active to false
      const { error: deleteError } = await supabase
        .from('contacts')
        .update({ is_active: false })
        .eq('id', contactId);

      if (deleteError) throw deleteError;

      // Navigate back to contacts list
      navigate('/people');
    } catch (err) {
      console.error('Failed to delete contact:', err);
      alert('Failed to delete contact: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingContact(false);
    }
  };

  // Helper to get display address
  const getDisplayAddress = (contact) => {
    if (!contact) return null;
    const parts = [];
    if (contact.address1) parts.push(contact.address1);
    if (contact.address2) parts.push(contact.address2);
    const cityStateZip = [];
    if (contact.city) cityStateZip.push(contact.city);
    if (contact.state) cityStateZip.push(contact.state);
    if (contact.zip) cityStateZip.push(contact.zip);
    if (cityStateZip.length > 0) {
      let formatted = '';
      if (contact.city) formatted += contact.city;
      if (contact.state) formatted += (formatted ? ', ' : '') + contact.state;
      if (contact.zip) formatted += (formatted ? ' ' : '') + contact.zip;
      parts.push(formatted);
    }
    return parts.length > 0 ? parts.join(', ') : contact.address || null;
  };

  const getMapUrl = (address) => {
    const encoded = encodeURIComponent(address);
    return `https://maps.apple.com/?q=${encoded}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Error state
  if (error && !contact) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-500 text-center">{error}</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const displayAddress = getDisplayAddress(contact);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: mode === 'dark' ? '#18181B' : '#F9FAFB' }}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" style={styles.textPrimary} />
          </button>
          <h1 className="text-xl font-bold" style={styles.textPrimary}>Contact Details</h1>
        </div>

        {/* Contact Info Card */}
        <div className="rounded-2xl p-6" style={styles.card}>
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: contact?.is_internal ? `${palette.accent}20` : `${palette.success}20` }}
            >
              <User className="w-8 h-8" style={{ color: contact?.is_internal ? palette.accent : palette.success }} />
            </div>
            <div className="flex-1 min-w-0">
              {/* Edit Button */}
              <div className="flex justify-end mb-2 -mt-1 -mr-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={handleEditContact}
                >
                  Edit
                </Button>
              </div>
              <h2 className="text-xl font-bold" style={styles.textPrimary}>
                {contact?.contact_type === 'company' && contact?.company
                  ? contact.company
                  : (contact?.full_name || contact?.name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || contact?.company || 'Unknown')}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {contact?.role && (
                  <span className="text-sm" style={{ color: contact?.is_internal ? palette.accent : palette.success }}>
                    {contact.role}
                  </span>
                )}
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: contact?.is_internal ? `${palette.accent}20` : `${palette.success}20`,
                    color: contact?.is_internal ? palette.accent : palette.success
                  }}
                >
                  {contact?.is_internal ? 'Internal' : 'External'}
                </span>
                {contact?.contact_type === 'company' && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-200 dark:bg-zinc-700"
                    style={styles.textSecondary}
                  >
                    Company
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {contact?.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <Mail className="w-4 h-4" />
                    {contact.email}
                  </a>
                )}
                {contact?.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <Phone className="w-4 h-4" />
                    {contact.phone}
                  </a>
                )}
                {contact?.company && (
                  <div className="flex items-center gap-2 text-sm" style={styles.textSecondary}>
                    <Building className="w-4 h-4" />
                    {contact.company}
                  </div>
                )}
                {displayAddress && (
                  <a
                    href={getMapUrl(displayAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <MapPin className="w-4 h-4" />
                    {displayAddress}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Secure Data Section */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: styles.card.borderColor }}>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold" style={styles.textPrimary}>Secure Data</h3>
              <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-200 dark:bg-zinc-700" style={styles.textSecondary}>
                {secureData.length}
              </span>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={handleAddNew}>
              Add
            </Button>
          </div>

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="p-4 border-b" style={{ borderColor: styles.card.borderColor, ...styles.mutedCard }}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium" style={styles.textPrimary}>
                    {editingItem ? 'Edit Credential' : 'Add New Credential'}
                  </h4>
                  <button type="button" onClick={handleCancelForm} className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded">
                    <X className="w-4 h-4" style={styles.textSecondary} />
                  </button>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Name (e.g., Gate Code, Sonos Account)"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={styles.input}
                  />
                  <select
                    value={formData.data_type}
                    onChange={(e) => setFormData({ ...formData, data_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={styles.input}
                  >
                    {DATA_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Username (optional)"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={styles.input}
                  />
                  <input
                    type="text"
                    placeholder="Password / Secret"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={styles.input}
                  />
                </div>

                <input
                  type="text"
                  placeholder="URL (optional)"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={styles.input}
                />

                <textarea
                  placeholder="Notes (optional)"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  style={styles.input}
                />

                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCancelForm}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" icon={saving ? Loader : Save} disabled={saving}>
                    {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Secure Data List */}
          <div className="divide-y" style={{ borderColor: styles.card.borderColor }}>
            {secureData.length === 0 ? (
              <div className="p-8 text-center" style={styles.textSecondary}>
                <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No secure data saved for this contact.</p>
                <p className="text-sm mt-1">Add gate codes, account credentials, or other sensitive info.</p>
              </div>
            ) : (
              secureData.map(item => (
                <div key={item.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Key className="w-4 h-4 text-violet-500" />
                        <span className="font-medium" style={styles.textPrimary}>{item.name}</span>
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                            color: mode === 'dark' ? '#A1A1AA' : '#6B7280'
                          }}
                        >
                          {DATA_TYPES.find(t => t.value === item.data_type)?.label || item.data_type}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm">
                        {item.username && (
                          <div className="flex items-center gap-2">
                            <span style={styles.textSecondary}>Username:</span>
                            <span style={styles.textPrimary}>{item.username}</span>
                            <button
                              onClick={() => copyToClipboard(item.username, item.id, 'username')}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                              title="Copy username"
                            >
                              {copiedItem === `${item.id}-username` ? (
                                <CheckCircle style={{ color: '#94AF32' }} />
                              ) : (
                                <Copy className="w-3.5 h-3.5" style={styles.textSecondary} />
                              )}
                            </button>
                          </div>
                        )}

                        {item.password && (
                          <div className="flex items-center gap-2">
                            <span style={styles.textSecondary}>Password:</span>
                            <span style={styles.textPrimary} className="font-mono">
                              {visiblePasswords[item.id] ? item.password : '••••••••'}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(item.id)}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                              title={visiblePasswords[item.id] ? 'Hide' : 'Show'}
                            >
                              {visiblePasswords[item.id] ? (
                                <EyeOff className="w-3.5 h-3.5" style={styles.textSecondary} />
                              ) : (
                                <Eye className="w-3.5 h-3.5" style={styles.textSecondary} />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(item.password, item.id, 'password')}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                              title="Copy password"
                            >
                              {copiedItem === `${item.id}-password` ? (
                                <CheckCircle style={{ color: '#94AF32' }} />
                              ) : (
                                <Copy className="w-3.5 h-3.5" style={styles.textSecondary} />
                              )}
                            </button>
                          </div>
                        )}

                        {item.url && (
                          <div className="flex items-center gap-2">
                            <span style={styles.textSecondary}>URL:</span>
                            <a
                              href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                            >
                              {item.url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        {item.notes && (
                          <p style={styles.textSecondary} className="mt-2 italic">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" style={styles.textSecondary} />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Projects Section */}
        {projects.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-4 border-b" style={{ borderColor: styles.card.borderColor }}>
              <h3 className="font-semibold" style={styles.textPrimary}>Associated Projects</h3>
            </div>
            <div className="divide-y" style={{ borderColor: styles.card.borderColor }}>
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="w-full p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium" style={styles.textPrimary}>{project.name}</p>
                    <p className="text-sm" style={styles.textSecondary}>{project.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.phase && (
                      <span
                        className="px-2 py-0.5 rounded text-xs"
                        style={{
                          backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                          color: mode === 'dark' ? '#A1A1AA' : '#6B7280'
                        }}
                      >
                        {project.phase}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4" style={styles.textSecondary} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Contact Modal */}
      {showEditContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold" style={styles.textPrimary}>
                Edit Contact
              </h2>
              <button
                onClick={() => setShowEditContact(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg"
              >
                <X className="w-5 h-5" style={styles.textSecondary} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* Contact Type Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-600">
                <button
                  type="button"
                  onClick={() => setContactFormData({ ...contactFormData, contact_type: 'person' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                    contactFormData.contact_type === 'person'
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Person
                </button>
                <button
                  type="button"
                  onClick={() => setContactFormData({ ...contactFormData, contact_type: 'company' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                    contactFormData.contact_type === 'company'
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  Company
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="First Name (or full name)"
                  value={contactFormData.first_name}
                  onChange={(e) => setContactFormData({ ...contactFormData, first_name: e.target.value })}
                  onBlur={handleFirstNameBlur}
                  className="px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  style={styles.input}
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={contactFormData.last_name}
                  onChange={(e) => setContactFormData({ ...contactFormData, last_name: e.target.value })}
                  className="px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  style={styles.input}
                />
              </div>

              <input
                type="email"
                placeholder="Email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                style={styles.input}
              />

              <input
                type="tel"
                placeholder="Phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                style={styles.input}
              />

              <input
                type="text"
                placeholder="Role/Title (optional)"
                value={contactFormData.role}
                onChange={(e) => setContactFormData({ ...contactFormData, role: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                style={styles.input}
              />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={contactFormData.is_internal}
                    onChange={(e) => setContactFormData({ ...contactFormData, is_internal: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm" style={styles.textSecondary}>Internal Contact</span>
                </label>
              </div>

              <input
                type="text"
                placeholder={contactFormData.contact_type === 'company' ? "Company Name (required)" : "Company (optional)"}
                value={contactFormData.company}
                onChange={(e) => setContactFormData({ ...contactFormData, company: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                style={styles.input}
              />

              {contactFormData.is_internal && (
                <input
                  type="text"
                  placeholder="Department"
                  value={contactFormData.department}
                  onChange={(e) => setContactFormData({ ...contactFormData, department: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  style={styles.input}
                />
              )}

              {/* Address Fields */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <p className="text-sm font-medium" style={styles.textSecondary}>Address</p>
                <input
                  type="text"
                  placeholder="Street Address"
                  value={contactFormData.address1}
                  onChange={(e) => setContactFormData({ ...contactFormData, address1: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  style={styles.input}
                />
                <input
                  type="text"
                  placeholder="Apt, Suite, Unit, etc. (optional)"
                  value={contactFormData.address2}
                  onChange={(e) => setContactFormData({ ...contactFormData, address2: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  style={styles.input}
                />
                <div className="grid grid-cols-6 gap-2">
                  <input
                    type="text"
                    placeholder="City"
                    value={contactFormData.city}
                    onChange={(e) => setContactFormData({ ...contactFormData, city: e.target.value })}
                    className="col-span-3 px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                    style={styles.input}
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={contactFormData.state}
                    onChange={(e) => setContactFormData({ ...contactFormData, state: e.target.value })}
                    className="col-span-1 px-2 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600 text-center"
                    style={styles.input}
                    maxLength={2}
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={contactFormData.zip}
                    onChange={(e) => setContactFormData({ ...contactFormData, zip: e.target.value })}
                    className="col-span-2 px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                    style={styles.input}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-between pt-2">
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDeleteContact}
                  icon={Trash2}
                  disabled={savingContact}
                >
                  Delete
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowEditContact(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    icon={savingContact ? Loader : Save}
                    disabled={savingContact}
                  >
                    {savingContact ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactDetailPage;
