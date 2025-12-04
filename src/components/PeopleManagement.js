import React, { useState, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useContacts } from '../hooks/useSupabase';
import Button from './ui/Button';
import { Plus, Trash2, User, Building, Loader, Search, X } from 'lucide-react';

const PeopleManagement = () => {
  const { theme, mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [filter, setFilter] = useState('all'); // all, internal, external

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

      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      if (editingContact) {
        await updateContact(editingContact.id, payload);
        setEditingContact(null);
      } else {
        await createContact(payload);
      }

      setShowAddModal(false);
      setFormData(initialFormState);
    } catch (err) {
      console.error('Error saving contact:', err);
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
                    className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => handleEdit(person)}
                        className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
                        style={{ backgroundColor: person.is_internal ? `${palette.accent}20` : `${palette.success}20` }}
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
                                className="inline text-sm text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                {displayAddress}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
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
    </div>
  );
};

export default PeopleManagement;
