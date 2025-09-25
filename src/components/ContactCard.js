import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ChevronDown, Mail, Phone, MapPin, Building, User } from 'lucide-react';
import Button from './ui/Button';

// Simplified, editable contact card used inside stakeholder slots
// When embedded=true, the header is hidden and the details are shown inline
const ContactCard = ({ contact, theme, onRemove, onUpdateContact, embedded = false }) => {
  const { theme: themeContext, mode, utilities } = useTheme();
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
    <div className={`p-4 space-y-4 ${mode === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
          {/* Email */}
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className={mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} />
            {isEditing ? (
              <input
                type="email"
                className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                value={edited.email}
                onChange={(e) => setEdited({ ...edited, email: e.target.value })}
                placeholder="Email address"
              />
            ) : (
              <a 
                href={contact.email ? `mailto:${contact.email}` : undefined}
                className={`text-violet-600 hover:text-violet-800 ${!contact.email ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {contact.email || 'No email'}
              </a>
            )}
          </div>

          {/* Phone */}
          <div className="flex items-center gap-3 text-sm">
            <Phone size={16} className={mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} />
            {isEditing ? (
              <input
                type="tel"
                className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                value={edited.phone}
                onChange={(e) => setEdited({ ...edited, phone: e.target.value })}
                placeholder="Phone number"
              />
            ) : (
              <a 
                href={contact.phone ? `tel:${contact.phone}` : undefined}
                className={`text-violet-600 hover:text-violet-800 ${!contact.phone ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {contact.phone || 'No phone'}
              </a>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-3 text-sm">
            <MapPin size={16} className={`${mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} mt-0.5`} />
            {isEditing ? (
              <textarea
                className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                rows={2}
                value={edited.address}
                onChange={(e) => setEdited({ ...edited, address: e.target.value })}
                placeholder="Address"
              />
            ) : (
              <div className={mode === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                {contact.address || 'No address'}
              </div>
            )}
          </div>

          {/* Company */}
          <div className="flex items-center gap-3 text-sm">
            <Building size={16} className={mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} />
            {isEditing ? (
              <input
                className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                placeholder="Company"
                value={edited.company}
                onChange={(e) => setEdited({ ...edited, company: e.target.value })}
              />
            ) : (
              <div className={mode === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                {contact.company || 'No company'}
              </div>
            )}
          </div>

          {/* Name and Role editing */}
          {isEditing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <input
                className={`px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                placeholder="First name"
                value={edited.first_name}
                onChange={(e) => setEdited({ ...edited, first_name: e.target.value })}
              />
              <input
                className={`px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                placeholder="Last name"
                value={edited.last_name}
                onChange={(e) => setEdited({ ...edited, last_name: e.target.value })}
              />
              <input
                className={`md:col-span-2 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
                placeholder="Role"
                value={edited.role}
                onChange={(e) => setEdited({ ...edited, role: e.target.value })}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
            {!isEditing ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  className="flex-1"
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); if (onRemove) onRemove(); }}
                  className="flex-1"
                >
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  className="flex-1"
                >
                  Save
                </Button>
              </>
            )}
          </div>
    </div>
  );

  if (embedded) {
    return (
      <div className={`rounded-lg border transition-all duration-250 ${mode === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}>
        <Details />
      </div>
    );
  }

  return (
    <div className={`rounded-lg border transition-all duration-250 ${mode === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm ${isExpanded ? 'shadow-md' : ''} overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 text-left flex items-center justify-between ${mode === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <User size={18} className={mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} />
          <div>
            <div className={`font-semibold ${mode === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{displayName}</div>
            {contact.role && (
              <div className={`text-sm ${mode === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{contact.role}</div>
            )}
          </div>
        </div>
        <ChevronDown 
          size={18} 
          className={`${mode === 'dark' ? 'text-gray-400' : 'text-gray-600'} transform transition-transform ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`} 
        />
      </button>

      {isExpanded && (
        <div className={`border-t ${mode === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <Details />
        </div>
      )}
    </div>
  );
};

export default ContactCard;