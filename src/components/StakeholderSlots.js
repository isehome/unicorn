import React, { useState } from 'react';
import { Trash2, Plus, User } from 'lucide-react';
import ContactCard from './ContactCard';

const StakeholderSlots = ({ 
  stakeholders, 
  theme: t, 
  category, // 'external' or 'internal'
  onAddPerson,
  onRemovePerson,
  onUpdateContact,
  onAddCustomSlot,
  onRemoveCustomSlot,
  customSlots = []
}) => {
  const [newSlotTitle, setNewSlotTitle] = useState('');
  const [showAddSlot, setShowAddSlot] = useState(false);

  // Create dynamic slots based on actual assigned stakeholders
  const createDynamicSlots = () => {
    const roleSlots = {};
    
    // Create slots for each role that has assigned stakeholders
    stakeholders.forEach(stakeholder => {
      const roleName = stakeholder.role?.name;
      if (roleName) {
        const slotId = `role-${roleName.toLowerCase().replace(/\s+/g, '-')}`;
        if (!roleSlots[slotId]) {
          roleSlots[slotId] = {
            id: slotId,
            title: roleName,
            roleId: stakeholder.role?.id,
            isDynamic: true
          };
        }
      }
    });
    
    return Object.values(roleSlots);
  };

  const dynamicSlots = createDynamicSlots();
  const allSlots = [...dynamicSlots, ...customSlots];

  const getPersonForSlot = (slotId) => {
    // For dynamic slots, find stakeholder by matching role
    if (slotId.startsWith('role-')) {
      const person = stakeholders.find(s => {
        const stakeholderSlotId = `role-${s.role?.name?.toLowerCase().replace(/\s+/g, '-')}`;
        return stakeholderSlotId === slotId;
      });
      
      console.log(`getPersonForSlot(${slotId}):`, { 
        person: person ? { 
          name: `${person.first_name} ${person.last_name}`.trim(), 
          slotId: slotId, 
          role: person.role?.name 
        } : null,
        availableStakeholders: stakeholders.map(s => ({ 
          slotId: `role-${s.role?.name?.toLowerCase().replace(/\s+/g, '-')}`, 
          name: `${s.first_name} ${s.last_name}`.trim(), 
          role: s.role?.name 
        }))
      });
      
      return person;
    }
    
    // For custom slots, find by slotId
    const person = stakeholders.find(s => s.slotId === slotId) || null;
    console.log(`getPersonForSlot(${slotId}):`, { 
      person: person ? { 
        name: `${person.first_name} ${person.last_name}`.trim(), 
        slotId: person.slotId, 
        role: person.role?.name 
      } : null
    });
    return person;
  };

  const handleAddCustomSlot = () => {
    if (newSlotTitle.trim()) {
      const customSlot = {
        id: `custom-${Date.now()}`,
        title: newSlotTitle.trim(),
        roleId: null,
        isCustom: true
      };
      onAddCustomSlot(customSlot);
      setNewSlotTitle('');
      setShowAddSlot(false);
    }
  };

  const StakeholderSlot = ({ slot, person }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    return (
  <div className={`ui-card ui-border p-4 mb-3 transition-all duration-300 ui-shadow ui-shadow--hover`}>
        {/* Slot Header - Always Visible */}
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={(e) => {
            // If there is no assigned person, clicking opens the picker to assign
            if (!person) {
              onAddPerson(slot);
              return;
            }
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <User className={`w-5 h-5 ui-textSecondary`} />
            <div className="min-w-0">
              <h3 className={`font-semibold ui-text leading-tight`}>{slot.title}</h3>
              <p className={`ui-textSecondary text-sm truncate`}>
                {person ? (
                  (
                    `${person.first_name || ''} ${person.last_name || ''}`.trim() ||
                    person.contact?.name ||
                    person.name ||
                    person.email ||
                    'Unnamed'
                  )
                ) : (
                  'Tap to select contact'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2"></div>
        </div>

        {/* Expanded Content - Contact Details */}
        {isExpanded && person && (
          <div className="mt-4 pt-4 ui-border-t">
            <ContactCard
              contact={{
                id: person.contact?.id || person.contactId || person.id,
                first_name: person.first_name ?? person.contact?.first_name ?? '',
                last_name: person.last_name ?? person.contact?.last_name ?? '',
                email: person.email ?? person.contact?.email ?? '',
                phone: person.phone ?? person.contact?.phone ?? '',
                address: person.address ?? person.contact?.address ?? '',
                company: person.contact?.company ?? '',
                role: slot.title,
              }}
              theme={t}
              onRemove={() => onRemovePerson(person)}
              onUpdateContact={onUpdateContact}
              embedded
            />
          </div>
        )}

        {isExpanded && !slot.isDynamic && slot.isCustom && (
          <div className="mt-4 pt-4 ui-border-t flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Remove the "${slot.title}" slot? This will also remove any assigned person.`)) {
                  onRemoveCustomSlot(slot.id);
                }
              }}
              className={`ui-btn ui-btn--danger p-2`}
            >
              <Trash2 className="w-4 h-4" />
              <span className="ml-2 text-sm">Remove Slot</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stakeholder Slots */}
      {allSlots.map(slot => (
        <StakeholderSlot 
          key={slot.id} 
          slot={slot} 
          person={getPersonForSlot(slot.id)} 
        />
      ))}

      {/* Add New Role/Person - Always show this to add new roles */}
      <div className={`ui-card ui-border p-4 ui-border-dashed`}>
        {!showAddSlot ? (
          <button
            onClick={() => setShowAddSlot(true)}
            className={`flex items-center space-x-2 w-full text-left ui-textSecondary hover:ui-text transition-colors`}
          >
            <Plus className="w-5 h-5" />
            <span>Add New Role</span>
          </button>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={newSlotTitle}
              onChange={(e) => setNewSlotTitle(e.target.value)}
              placeholder="Enter role name (e.g., Consultant, Lead Tech)"
              className={`w-full px-3 py-2 ui-input`}
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  if (newSlotTitle.trim()) {
                    // Create a new role slot and immediately open picker
                    const newRole = { id: null, name: newSlotTitle.trim(), category };
                    onAddPerson(newRole);
                    setNewSlotTitle('');
                    setShowAddSlot(false);
                  }
                }}
                className={`px-4 py-2 text-sm ui-btn ui-btn--primary`}
              >
                Add & Assign Person
              </button>
              <button
                onClick={() => {
                  setShowAddSlot(false);
                  setNewSlotTitle('');
                }}
                className={`px-4 py-2 text-sm ui-btn ui-btn--secondary`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StakeholderSlots;