import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Building, ChevronDown, ChevronRight, Edit2, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const PeopleModule = ({ projectId }) => {
  const [contacts, setContacts] = useState([]);
  const [projectStakeholders, setProjectStakeholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSlots, setExpandedSlots] = useState({});
  const [editingSlot, setEditingSlot] = useState(null);
  const [addingSlot, setAddingSlot] = useState({ external: false, internal: false });
  const [newSlotName, setNewSlotName] = useState('');
  const [selectingForSlot, setSelectingForSlot] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: ''
  });

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

    if (data.city || data.state || data.zip) {
      let formatted = '';
      if (data.city) formatted += data.city;
      if (data.state) formatted += (formatted ? ', ' : '') + data.state;
      if (data.zip) formatted += (formatted ? ' ' : '') + data.zip;
      parts.push(formatted);
    }

    return parts.join(', ');
  };

  // Helper to get display address (consolidated or legacy single field)
  const getDisplayAddress = (contact) => {
    if (contact.address1 || contact.city || contact.state || contact.zip) {
      return consolidateAddress(contact);
    }
    return contact.address || '';
  };

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      // Load all contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .order('name');

      if (contactsError) {
        console.error('Error loading contacts:', contactsError);
      } else {
        setContacts(contactsData || []);
      }

      // Load project stakeholders with contact info
      const { data: stakeholdersData, error: stakeholdersError } = await supabase
        .from('project_stakeholders')
        .select(`
          *,
          contact:contacts(*)
        `)
        .eq('project_id', projectId)
        .order('created_at');

      if (stakeholdersError) {
        console.error('Error loading stakeholders:', stakeholdersError);
      } else {
        setProjectStakeholders(stakeholdersData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert([formData])
        .select()
        .single();

      if (error) throw error;
      
      setContacts([...contacts, data]);
      setFormData({ name: '', email: '', phone: '', company: '', address: '' });
      setShowAddContact(false);
      
      // If we were selecting for a slot, show the selector again with new contact
      if (selectingForSlot) {
        // The new contact will appear in the list
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  const addSlot = async (type) => {
    if (!newSlotName.trim()) return;
    
    try {
      const slotId = `${type}_${Date.now()}_${newSlotName.toLowerCase().replace(/\s+/g, '_')}`;
      
      const { error } = await supabase
        .from('project_stakeholders')
        .insert([{
          project_id: projectId,
          contact_id: null,
          slot_id: slotId,
          slot_name: newSlotName,
          slot_type: type
        }]);
        
      if (error) {
        // If slot exists without contact, just update it
        if (error.code === '23505') { // Unique violation
          alert('A slot with this role already exists');
        } else {
          throw error;
        }
      }
      
      await loadData();
      setNewSlotName('');
      setAddingSlot({ external: false, internal: false });
    } catch (error) {
      console.error('Error adding slot:', error);
    }
  };

  const assignContact = async (slotId, contactId) => {
    try {
      const { error } = await supabase
        .from('project_stakeholders')
        .update({ contact_id: contactId })
        .eq('project_id', projectId)
        .eq('slot_id', slotId);
        
      if (error) throw error;
      
      await loadData();
      setSelectingForSlot(null);
      setSearchTerm('');
    } catch (error) {
      console.error('Error assigning contact:', error);
    }
  };

  const removeContact = async (slotId) => {
    try {
      const { error } = await supabase
        .from('project_stakeholders')
        .update({ contact_id: null })
        .eq('project_id', projectId)
        .eq('slot_id', slotId);
        
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error removing contact:', error);
    }
  };

  const deleteSlot = async (slotId) => {
    if (!window.confirm('Are you sure you want to delete this slot?')) return;
    
    try {
      const { error } = await supabase
        .from('project_stakeholders')
        .delete()
        .eq('project_id', projectId)
        .eq('slot_id', slotId);
        
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error deleting slot:', error);
    }
  };

  const updateSlotName = async (slotId, newName) => {
    try {
      const { error } = await supabase
        .from('project_stakeholders')
        .update({ slot_name: newName })
        .eq('project_id', projectId)
        .eq('slot_id', slotId);
        
      if (error) throw error;
      await loadData();
      setEditingSlot(null);
    } catch (error) {
      console.error('Error updating slot:', error);
    }
  };

  const toggleSlotExpanded = (slotId) => {
    setExpandedSlots(prev => ({
      ...prev,
      [slotId]: !prev[slotId]
    }));
  };

  const filteredContacts = contacts.filter(contact => 
    contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const externalStakeholders = projectStakeholders.filter(s => s.slot_type === 'external');
  const internalStakeholders = projectStakeholders.filter(s => s.slot_type === 'internal');

  if (loading) {
    return <div className="py-4 text-center text-gray-500">Loading...</div>;
  }

  const renderStakeholderSection = (title, icon, stakeholders, type) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {!addingSlot[type] && (
          <button
            onClick={() => setAddingSlot({ ...addingSlot, [type]: true })}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Slot
          </button>
        )}
      </div>

      {addingSlot[type] && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg flex gap-2">
          <input
            type="text"
            placeholder="Enter role name (e.g., Project Manager)"
            value={newSlotName}
            onChange={(e) => setNewSlotName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSlot(type);
              }
              if (e.key === 'Escape') {
                setNewSlotName('');
                setAddingSlot({ ...addingSlot, [type]: false });
              }
            }}
            className="flex-1 px-3 py-2 border rounded text-sm"
            autoFocus
          />
          <button
            onClick={() => addSlot(type)}
            className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Add
          </button>
          <button
            onClick={() => {
              setNewSlotName('');
              setAddingSlot({ ...addingSlot, [type]: false });
            }}
            className="px-3 py-2 border rounded text-sm hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-2">
        {stakeholders.length === 0 && !addingSlot[type] ? (
          <p className="text-gray-400 text-sm py-2">No {type} stakeholders added yet</p>
        ) : (
          stakeholders.map(stakeholder => (
            <div key={stakeholder.slot_id} className="bg-gray-50 rounded-lg border">
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    {stakeholder.contact && (
                      <button
                        onClick={() => toggleSlotExpanded(stakeholder.slot_id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {expandedSlots[stakeholder.slot_id] ? 
                          <ChevronDown className="w-4 h-4" /> : 
                          <ChevronRight className="w-4 h-4" />
                        }
                      </button>
                    )}
                    
                    {editingSlot === stakeholder.slot_id ? (
                      <input
                        type="text"
                        defaultValue={stakeholder.slot_name}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSlotName(stakeholder.slot_id, e.target.value);
                          }
                          if (e.key === 'Escape') {
                            setEditingSlot(null);
                          }
                        }}
                        onBlur={(e) => updateSlotName(stakeholder.slot_id, e.target.value)}
                        className="px-2 py-1 border rounded text-sm font-medium"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-700">{stakeholder.slot_name}:</span>
                        {stakeholder.contact ? (
                          <span className="text-gray-900">{stakeholder.contact.name}</span>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingSlot(stakeholder.slot_id)}
                      className="p-1.5 hover:bg-gray-200 rounded"
                      title="Edit role name"
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    
                    {!stakeholder.contact ? (
                      <button
                        onClick={() => setSelectingForSlot(stakeholder.slot_id)}
                        className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                        title="Assign contact"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => removeContact(stakeholder.slot_id)}
                        className="p-1.5 hover:bg-orange-100 rounded text-orange-600"
                        title="Remove contact"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => deleteSlot(stakeholder.slot_id)}
                      className="p-1.5 hover:bg-red-100 rounded text-red-600"
                      title="Delete slot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedSlots[stakeholder.slot_id] && stakeholder.contact && (() => {
                  const displayAddress = getDisplayAddress(stakeholder.contact);
                  return (
                    <div className="mt-3 pt-3 border-t text-sm space-y-1">
                      {stakeholder.contact.company && (
                        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                          <Building className="w-3 h-3" />
                          {stakeholder.contact.company}
                        </div>
                      )}
                      {stakeholder.contact.email && (
                        <a
                          href={`mailto:${stakeholder.contact.email}`}
                          className="block text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          {stakeholder.contact.email}
                        </a>
                      )}
                      {stakeholder.contact.phone && (
                        <a
                          href={`tel:${stakeholder.contact.phone}`}
                          className="block text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          {stakeholder.contact.phone}
                        </a>
                      )}
                      {displayAddress && (
                        <a
                          href={getMapUrl(displayAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-violet-600 dark:text-violet-400 hover:underline truncate"
                        >
                          {displayAddress}
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* External Stakeholders */}
      {renderStakeholderSection(
        'External Stakeholders',
        <Building className="w-4 h-4" />,
        externalStakeholders,
        'external'
      )}

      {/* Internal Stakeholders */}
      {renderStakeholderSection(
        'Internal Stakeholders',
        <Users className="w-4 h-4" />,
        internalStakeholders,
        'internal'
      )}

      {/* Contact Selection Modal */}
      {selectingForSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Select Contact</h3>
              <button
                onClick={() => {
                  setSelectingForSlot(null);
                  setSearchTerm('');
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg mb-3"
              autoFocus
            />

            <button
              onClick={() => setShowAddContact(true)}
              className="w-full mb-3 px-3 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg hover:border-blue-400 hover:bg-blue-50"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Create New Contact
            </button>

            {showAddContact && (
              <form onSubmit={handleAddContact} className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
                <input
                  type="text"
                  placeholder="Name *"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="Company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="text"
                  placeholder="Address (for map directions)"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddContact(false);
                      setFormData({ name: '', email: '', phone: '', company: '', address: '' });
                    }}
                    className="flex-1 px-2 py-1 border rounded text-sm hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            
            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No contacts found. Create a new contact above.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => assignContact(selectingForSlot, contact.id)}
                      className="w-full p-3 text-left hover:bg-gray-50 rounded-lg border"
                    >
                      <div className="font-medium">{contact.name}</div>
                      {contact.company && (
                        <div className="text-sm text-gray-500">{contact.company}</div>
                      )}
                      <div className="text-sm text-gray-500">
                        {contact.email} {contact.phone && `• ${contact.phone}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleModule;