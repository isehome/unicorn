import React, { useState, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useContacts } from '../hooks/useSupabase';
import Button from './ui/Button';
import { Plus, Edit, Trash2, User, Mail, Phone, Building, Loader, Search, X } from 'lucide-react';

const PeopleManagement = () => {
  const { theme, mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [filter, setFilter] = useState('all'); // all, internal, external
  
  const contactFilters = useMemo(() => ({
    search: searchTerm.trim() || '',
    isInternal: filter === 'all' ? undefined : filter === 'internal'
  }), [searchTerm, filter]);

  const { 
    contacts, 
    loading, 
    error, 
    createContact, 
    updateContact, 
    deleteContact 
  } = useContacts(contactFilters);

  const [formData, setFormData] = useState({
    name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    is_internal: false,
    department: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = { ...formData };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      if (editingContact) {
        await updateContact(editingContact.id, payload);
        setEditingContact(null);
      } else {
        await createContact(payload);
        setShowAddModal(false);
      }
      
      // Reset form
      setFormData({
        name: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        company: '',
        role: '',
        is_internal: false,
        department: ''
      });
    } catch (err) {
      console.error('Error saving contact:', err);
    }
  };

  const handleEdit = (contact) => {
    setFormData(contact);
    setEditingContact(contact);
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      try {
        await deleteContact(id);
      } catch (err) {
        console.error('Error deleting contact:', err);
      }
    }
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters and Search */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('internal')}
                className={`px-4 py-2 rounded-lg ${filter === 'internal' ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                Internal
              </button>
              <button
                onClick={() => setFilter('external')}
                className={`px-4 py-2 rounded-lg ${filter === 'external' ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
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
              <div className="text-center py-8 text-gray-500">
                No contacts found. Add your first contact to get started.
              </div>
            ) : (
              contacts.map((person) => (
                <div
                  key={person.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: person.is_internal ? `${palette.accent}20` : `${palette.success}20` }}
                      >
                        <User className="w-6 h-6" style={{ color: person.is_internal ? palette.accent : palette.success }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {person.name || `${person.first_name} ${person.last_name}`}
                        </h3>
                        <p className="text-sm" style={{ color: person.is_internal ? palette.accent : palette.success }}>
                          {person.role} {person.is_internal && person.department ? `• ${person.department}` : ''}
                        </p>
                        <div className="mt-2 space-y-1">
                          {person.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="w-3 h-3" />
                              <span>{person.email}</span>
                            </div>
                          )}
                          {person.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Phone className="w-3 h-3" />
                              <span>{person.phone}</span>
                            </div>
                          )}
                          {person.company && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Building className="w-3 h-3" />
                              <span>{person.company}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEdit(person)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button 
                        onClick={() => handleDelete(person.id)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
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
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingContact(null);
                  setFormData({
                    name: '',
                    first_name: '',
                    last_name: '',
                    email: '',
                    phone: '',
                    company: '',
                    role: '',
                    is_internal: false,
                    department: ''
                  });
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
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
                  className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
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
                  className="px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />

              <input
                type="tel"
                placeholder="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />

              <input
                type="text"
                placeholder="Role/Title"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_internal}
                    onChange={(e) => setFormData({ ...formData, is_internal: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Internal Contact</span>
                </label>
              </div>

              {formData.is_internal ? (
                <input
                  type="text"
                  placeholder="Department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingContact(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  {editingContact ? 'Update' : 'Add'} Contact
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleManagement;
