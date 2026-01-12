import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useContacts } from '../hooks/useSupabase';
import Button from './ui/Button';
import { Plus, Trash2, User, Building, Loader, Search, X, ChevronRight, Camera, CreditCard } from 'lucide-react';

const PeopleManagement = () => {
  const navigate = useNavigate();
  const { theme, mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [filter, setFilter] = useState('all'); // all, internal, external

  // Business card scanner state
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanningCard, setScanningCard] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const streamRef = React.useRef(null);

  // Fetch all contacts once (no search filter sent to server)
  const contactFilters = useMemo(() => ({
    isInternal: filter === 'all' ? undefined : filter === 'internal'
  }), [filter]);

  const {
    contacts: allContacts,
    loading,
    error,
    createContact,
    updateContact,
    deleteContact
  } = useContacts(contactFilters);

  // Filter contacts client-side for instant search
  const contacts = useMemo(() => {
    if (!allContacts) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allContacts;

    return allContacts.filter(contact =>
      contact.name?.toLowerCase().includes(term) ||
      contact.first_name?.toLowerCase().includes(term) ||
      contact.last_name?.toLowerCase().includes(term) ||
      contact.email?.toLowerCase().includes(term) ||
      contact.company?.toLowerCase().includes(term) ||
      contact.role?.toLowerCase().includes(term) ||
      contact.phone?.includes(term)
    );
  }, [allContacts, searchTerm]);

  const initialFormState = {
    name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    is_internal: false,
    department: '',
    address: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: ''
  };

  const [formData, setFormData] = useState(initialFormState);

  // Helper to generate map URL (opens in user's default maps app)
  const getMapUrl = (address) => {
    const encoded = encodeURIComponent(address);
    // Use Apple Maps URL which opens in default maps app on iOS/macOS
    // On other platforms, it redirects to maps.apple.com which works in browser
    return `https://maps.apple.com/?q=${encoded}`;
  };

  // Helper to consolidate address components into single line
  const consolidateAddress = (data) => {
    const parts = [];
    if (data.address1) parts.push(data.address1);
    if (data.address2) parts.push(data.address2);

    const cityStateZip = [];
    if (data.city) cityStateZip.push(data.city);
    if (data.state) cityStateZip.push(data.state);
    if (data.zip) cityStateZip.push(data.zip);

    if (cityStateZip.length > 0) {
      // Format as "City, State Zip"
      let formatted = '';
      if (data.city) formatted += data.city;
      if (data.state) formatted += (formatted ? ', ' : '') + data.state;
      if (data.zip) formatted += (formatted ? ' ' : '') + data.zip;
      parts.push(formatted);
    }

    return parts.join(', ');
  };

  // Helper to get display address (consolidated or legacy single field)
  const getDisplayAddress = (person) => {
    // If we have address components, consolidate them
    if (person.address1 || person.city || person.state || person.zip) {
      return consolidateAddress(person);
    }
    // Fall back to legacy single address field
    return person.address || '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = { ...formData };
      // Consolidate address before saving
      payload.address = consolidateAddress(payload);

      // Build full_name from first_name and last_name (required by database)
      const fullName = `${payload.first_name || ''} ${payload.last_name || ''}`.trim();
      payload.full_name = fullName || payload.name || 'Unknown';
      // Also set name for compatibility
      payload.name = payload.name || fullName || 'Unknown';

      // Filter to only valid database columns (remove any extra fields like 'website' from business card scan)
      const validColumns = ['name', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'company', 'role',
                           'address', 'address1', 'address2', 'city', 'state', 'zip', 'notes',
                           'is_internal', 'is_active', 'department'];
      const cleanPayload = {};
      validColumns.forEach(col => {
        if (payload[col] !== undefined && payload[col] !== null) {
          cleanPayload[col] = payload[col];
        }
      });

      if (editingContact) {
        await updateContact(editingContact.id, cleanPayload);
        setEditingContact(null);
      } else {
        await createContact(cleanPayload);
      }

      setShowAddModal(false);
      setFormData(initialFormState);
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Error saving contact. Please try again.');
    }
  };

  const handleEdit = (contact) => {
    setFormData({
      ...initialFormState,
      ...contact
    });
    setEditingContact(contact);
    setShowAddModal(true);
  };

  const handleDelete = async () => {
    if (editingContact && window.confirm('Are you sure you want to delete this contact?')) {
      try {
        await deleteContact(editingContact.id);
        setShowAddModal(false);
        setEditingContact(null);
        setFormData(initialFormState);
      } catch (err) {
        console.error('Error deleting contact:', err);
      }
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingContact(null);
    setFormData(initialFormState);
  };

  // ══════════════════════════════════════════════════════════════
  // BUSINESS CARD SCANNER
  // ══════════════════════════════════════════════════════════════

  const startCamera = async () => {
    try {
      // Request landscape orientation for business cards (wider than tall)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16/9 }  // Force landscape
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleOpenScanner = () => {
    setShowScanModal(true);
    setCapturedImage(null);
    setTimeout(() => startCamera(), 100);
  };

  const handleCloseScanner = () => {
    stopCamera();
    setShowScanModal(false);
    setCapturedImage(null);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target.result);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const processBusinessCard = async () => {
    if (!capturedImage) return;

    setScanningCard(true);
    try {
      const response = await fetch('/api/ai/scan-business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage })
      });

      if (!response.ok) {
        throw new Error('Failed to process business card');
      }

      const result = await response.json();

      if (result.success && result.contact) {
        // Populate form with extracted data
        setFormData({
          ...initialFormState,
          ...result.contact,
          name: `${result.contact.first_name || ''} ${result.contact.last_name || ''}`.trim() || result.contact.name || ''
        });

        // Close scanner and open add modal
        handleCloseScanner();
        setShowAddModal(true);
      } else {
        alert('Could not extract contact information. Please try again or enter manually.');
      }
    } catch (err) {
      console.error('Error processing business card:', err);
      alert('Error processing business card. Please try again.');
    } finally {
      setScanningCard(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    const internalCount = allContacts?.filter(c => c.is_internal)?.length || 0;
    const externalCount = allContacts?.filter(c => !c.is_internal)?.length || 0;

    publishState({
      view: 'people-management',
      searchTerm: searchTerm,
      filter: filter,
      stats: {
        total: allContacts?.length || 0,
        internal: internalCount,
        external: externalCount,
        displayed: contacts?.length || 0
      },
      contacts: contacts?.slice(0, 10).map(c => ({
        id: c.id,
        name: c.name || `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        company: c.company,
        role: c.role,
        isInternal: c.is_internal
      })) || [],
      hint: 'People/contacts management page. Can search contacts, filter by type (internal/external), open contact details, create new contacts.'
    });
  }, [publishState, searchTerm, filter, allContacts, contacts]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_contacts: async ({ query }) => {
        if (typeof query === 'string') {
          setSearchTerm(query);
          return { success: true, message: `Searching contacts for: "${query}"` };
        }
        return { success: false, error: 'Please provide a search query' };
      },
      clear_search: async () => {
        setSearchTerm('');
        return { success: true, message: 'Search cleared' };
      },
      filter_by_type: async ({ type }) => {
        const validTypes = ['all', 'internal', 'external'];
        if (validTypes.includes(type)) {
          setFilter(type);
          return { success: true, message: `Filtering contacts by: ${type}` };
        }
        return { success: false, error: 'Invalid filter type. Use: all, internal, or external' };
      },
      open_contact: async ({ contactId, contactName }) => {
        const contact = contactName
          ? contacts?.find(c =>
              (c.name || `${c.first_name} ${c.last_name}`).toLowerCase().includes(contactName.toLowerCase())
            )
          : contacts?.find(c => c.id === contactId);
        if (contact) {
          navigate(`/contacts/${contact.id}`);
          return { success: true, message: `Opening contact: ${contact.name || `${contact.first_name} ${contact.last_name}`}` };
        }
        return { success: false, error: 'Contact not found' };
      },
      create_contact: async () => {
        setShowAddModal(true);
        return { success: true, message: 'Opening new contact form' };
      },
      list_contacts: async () => {
        return {
          success: true,
          contacts: contacts?.slice(0, 10).map(c => ({
            name: c.name || `${c.first_name} ${c.last_name}`.trim(),
            email: c.email,
            company: c.company,
            isInternal: c.is_internal
          })) || [],
          count: contacts?.length || 0
        };
      },
      show_internal_contacts: async () => {
        setFilter('internal');
        return { success: true, message: 'Showing internal contacts only' };
      },
      show_external_contacts: async () => {
        setFilter('external');
        return { success: true, message: 'Showing external contacts only' };
      },
      show_all_contacts: async () => {
        setFilter('all');
        return { success: true, message: 'Showing all contacts' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, contacts, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 transition-colors pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters and Search */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-zinc-800 dark:border-zinc-700"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-violet-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('internal')}
                className={`px-4 py-2 rounded-lg ${filter === 'internal' ? 'bg-violet-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                Internal
              </button>
              <button
                onClick={() => setFilter('external')}
                className={`px-4 py-2 rounded-lg ${filter === 'external' ? 'bg-violet-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                External
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={CreditCard}
              onClick={handleOpenScanner}
            >
              Scan Card
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setShowAddModal(true)}
            >
              Add Person
            </Button>
          </div>
        </div>

        {/* Contacts List */}
        <div style={sectionStyles.card}>
          <div className="space-y-3">
            {contacts.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No contacts found. Add your first contact to get started.
              </div>
            ) : (
              contacts.map((person) => {
                const displayAddress = getDisplayAddress(person);
                return (
                  <div
                    key={person.id}
                    onClick={() => navigate(`/contacts/${person.id}`)}
                    className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:shadow-md hover:border-violet-300 dark:hover:border-violet-600 transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(person);
                        }}
                        className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
                        style={{ backgroundColor: person.is_internal ? `${palette.accent}20` : `${palette.success}20` }}
                        title="Quick edit contact"
                      >
                        <User className="w-8 h-8" style={{ color: person.is_internal ? palette.accent : palette.success }} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900 dark:text-white">
                          {person.name || `${person.first_name} ${person.last_name}`}
                        </h3>
                        <p className="text-sm" style={{ color: person.is_internal ? palette.accent : palette.success }}>
                          {person.role} {person.is_internal && person.department ? `• ${person.department}` : ''}
                        </p>
                        <div className="mt-2 space-y-1">
                          {person.email && (
                            <div>
                              <a
                                href={`mailto:${person.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline text-sm text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                {person.email}
                              </a>
                            </div>
                          )}
                          {person.phone && (
                            <div>
                              <a
                                href={`tel:${person.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline text-sm text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                {person.phone}
                              </a>
                            </div>
                          )}
                          {person.company && (
                            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                              <Building className="w-3 h-3" />
                              <span>{person.company}</span>
                            </div>
                          )}
                          {displayAddress && (
                            <div>
                              <a
                                href={getMapUrl(displayAddress)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline text-sm text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                {displayAddress}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0 self-center" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="First Name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({
                    ...formData,
                    first_name: e.target.value,
                    name: `${e.target.value} ${formData.last_name}`.trim()
                  })}
                  className="px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({
                    ...formData,
                    last_name: e.target.value,
                    name: `${formData.first_name} ${e.target.value}`.trim()
                  })}
                  className="px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
              </div>

              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
              />

              <input
                type="tel"
                placeholder="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
              />

              <input
                type="text"
                placeholder="Role/Title (optional)"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
              />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_internal}
                    onChange={(e) => setFormData({ ...formData, is_internal: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Internal Contact</span>
                </label>
              </div>

              {formData.is_internal ? (
                <input
                  type="text"
                  placeholder="Department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
              )}

              {/* Full Address Fields */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Address</p>
                <input
                  type="text"
                  placeholder="Street Address"
                  value={formData.address1 || ''}
                  onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
                <input
                  type="text"
                  placeholder="Apt, Suite, Unit, etc. (optional)"
                  value={formData.address2 || ''}
                  onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                />
                <div className="grid grid-cols-6 gap-2">
                  <input
                    type="text"
                    placeholder="City"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="col-span-3 px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={formData.state || ''}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="col-span-1 px-2 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600 text-center"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={formData.zip || ''}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    className="col-span-2 px-4 py-2 border rounded-lg dark:bg-zinc-700 dark:border-zinc-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-between pt-2">
                {editingContact && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    icon={Trash2}
                  >
                    Delete
                  </Button>
                )}
                <div className={`flex gap-3 ${editingContact ? '' : 'ml-auto'}`}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    {editingContact ? 'Update' : 'Add'} Contact
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Business Card Scanner Modal */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Scan Business Card
              </h2>
              <button
                onClick={handleCloseScanner}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {!capturedImage ? (
                <>
                  {/* Camera Preview - landscape aspect ratio for business cards */}
                  <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Business card guide overlay - 3.5:2 aspect ratio */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative border-2 border-white/50 rounded-lg" style={{ width: '85%', aspectRatio: '3.5/2' }}>
                        <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-3 border-l-3 border-white rounded-tl" />
                        <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-3 border-r-3 border-white rounded-tr" />
                        <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-3 border-l-3 border-white rounded-bl" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-3 border-r-3 border-white rounded-br" />
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-500 text-center">
                    Hold phone horizontally and position the business card within the frame
                  </p>

                  <div className="flex gap-3">
                    <label className="flex-1">
                      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-100 dark:bg-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors">
                        <Camera className="w-5 h-5" />
                        <span>Upload Image</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <Button
                      variant="primary"
                      onClick={captureImage}
                      className="flex-1"
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      Capture
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Captured Image Preview */}
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <img
                      src={capturedImage}
                      alt="Captured business card"
                      className="w-full h-auto"
                    />
                    {scanningCard && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="text-center text-white">
                          <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                          <p>Processing with AI...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={retakePhoto}
                      className="flex-1"
                      disabled={scanningCard}
                    >
                      Retake
                    </Button>
                    <Button
                      variant="primary"
                      onClick={processBusinessCard}
                      className="flex-1"
                      disabled={scanningCard}
                    >
                      {scanningCard ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        'Extract Contact'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Hidden canvas for image capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleManagement;
