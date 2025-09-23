import React, { useState } from 'react';
import { ChevronDown, Mail, Phone, User, Edit2, Trash2 } from 'lucide-react';

// Simplified, editable contact card used inside stakeholder slots
// When embedded=true, the header is hidden and the details are shown inline
const ContactCard = ({ contact, theme, onRemove, onUpdateContact, embedded = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState({
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    address: contact.address || '',
    company: contact.company || '',
    role: contact.role || ''
  });

  const displayName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Contact';

  const handleSave = () => {
    if (!onUpdateContact) { setIsEditing(false); return; }
    onUpdateContact({ id: contact.id, ...edited });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEdited({
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      company: contact.company || '',
      role: contact.role || ''
    });
    setIsEditing(false);
  };

  const Details = () => (
    <div className={`p-3 space-y-3`}>
          {/* Email */}
          <div className="flex items-center gap-2 text-sm">
            <Mail size={14} className="ui-textSecondary" />
            {isEditing ? (
              <input
                type="email"
                className={`flex-1 ui-input`}
                value={edited.email}
                onChange={(e) => setEdited({ ...edited, email: e.target.value })}
              />
            ) : (
              <a 
                href={contact.email ? `mailto:${contact.email}` : undefined}
                className={`ui-textLink ${!contact.email ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {contact.email || 'No email'}
              </a>
            )}
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 text-sm">
            <Phone size={14} className="ui-textSecondary" />
            {isEditing ? (
              <input
                type="tel"
                className={`flex-1 ui-input`}
                value={edited.phone}
                onChange={(e) => setEdited({ ...edited, phone: e.target.value })}
              />
            ) : (
              <a 
                href={contact.phone ? `tel:${contact.phone}` : undefined}
                className={`ui-textLink ${!contact.phone ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {contact.phone || 'No phone'}
              </a>
            )}
          </div>

          {/* Address */}
          <div className="text-sm">
            {isEditing ? (
              <textarea
                className={`w-full ui-input`}
                rows={2}
                value={edited.address}
                onChange={(e) => setEdited({ ...edited, address: e.target.value })}
              />
            ) : (
              <div className="ui-textSecondary">{contact.address || 'No address'}</div>
            )}
          </div>

          {/* Name and Role editing */}
          {isEditing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className={`ui-input`}
                placeholder="First name"
                value={edited.first_name}
                onChange={(e) => setEdited({ ...edited, first_name: e.target.value })}
              />
              <input
                className={`ui-input`}
                placeholder="Last name"
                value={edited.last_name}
                onChange={(e) => setEdited({ ...edited, last_name: e.target.value })}
              />
              <input
                className={`ui-input md:col-span-2`}
                placeholder="Role"
                value={edited.role}
                onChange={(e) => setEdited({ ...edited, role: e.target.value })}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 ui-border-t">
            {!isEditing ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  className={`flex-1 ui-btn ui-btn--secondary text-xs flex items-center justify-center gap-1`}
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (onRemove) onRemove(); }}
                  className={`flex-1 ui-btn ui-btn--danger text-xs flex items-center justify-center gap-1`}
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                  className={`flex-1 ui-btn ui-btn--secondary text-xs`}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  className={`flex-1 ui-btn ui-btn--primary text-xs`}
                >
                  Save
                </button>
              </>
            )}
          </div>
    </div>
  );

  if (embedded) {
    return (
      <div className={`rounded-xl ui-surface ui-border`}>
        <Details />
      </div>
    );
  }

  return (
    <div className={`rounded-xl ui-surface ui-border overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-3 text-left flex items-center justify-between ui-surface transition-colors`}
      >
        <div className="flex items-center gap-3">
          <User size={16} className="ui-textSecondary" />
          <div>
            <div className={`font-medium ui-text`}>{displayName}</div>
          </div>
        </div>
        <ChevronDown 
          size={16} 
          className={`ui-textSecondary transform transition-transform ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`} 
        />
      </button>

      {isExpanded && (
        <div className={`ui-border-t`}>
          <Details />
        </div>
      )}
    </div>
  );
};

export default ContactCard;