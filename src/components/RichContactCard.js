import React, { useEffect, useState } from 'react';
import { ChevronDown, Mail, Phone, MapPin } from 'lucide-react';

// A richer contact card with inline edit support.
// Props:
// - contact: contact row { id, name, role, email, phone, address, company, is_internal, is_primary }
// - theme: tailwind theme tokens { surface, surfaceHover, border, text, textSecondary }
// - stakeholderRole: optional stakeholder role object to display
// - onRemove(contact): callback when Remove clicked
// - onUpdateContact(editedContact): callback when Save clicked
const RichContactCard = ({ contact, theme, stakeholderRole, onRemove, onUpdateContact }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState(contact);
  const t = theme;
  const canEdit = Boolean(onUpdateContact && (contact?.id || editedContact?.id));

  useEffect(() => {
    setEditedContact(contact);
  }, [contact]);

  const handleSave = () => {
    if (onUpdateContact) {
      onUpdateContact(editedContact);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedContact(contact);
    setIsEditing(false);
  };

  return (
    <div className={`rounded-xl ${t.surfaceHover} border ${t.border} overflow-hidden transition-all duration-200`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 text-left flex items-center justify-between hover:${t.surface} transition-colors`}
        disabled={isEditing}
      >
        <div className="flex-1">
          <div className={`${t.text} font-medium text-lg`}>{contact.name || 'Unnamed Contact'}</div>
          <div className={`text-sm ${t.textSecondary}`}>
            {stakeholderRole ? stakeholderRole.name : contact.role || 'No role specified'}
          </div>
        </div>
        {!isEditing && (
          <ChevronDown 
            size={20} 
            className={`${t.textSecondary} transform transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : 'rotate-0'
            }`} 
          />
        )}
      </button>

      {isExpanded && (
        <div className={`border-t ${t.border} p-4 space-y-4`}>
          <div className="grid gap-3">
            {/* Name */}
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded ${t.textSecondary} flex-shrink-0`}></div>
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Name</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedContact.name || ''}
                    onChange={(e) => setEditedContact({...editedContact, name: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>{contact.name || 'Not specified'}</div>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-3">
              <Mail size={16} className={t.textSecondary} />
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Email</div>
                {isEditing ? (
                  <input
                    type="email"
                    value={editedContact.email || ''}
                    onChange={(e) => setEditedContact({...editedContact, email: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>
                    {contact.email ? (
                      <a 
                        href={`mailto:${contact.email}`}
                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.email}
                      </a>
                    ) : (
                      'Not specified'
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-3">
              <Phone size={16} className={t.textSecondary} />
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Phone</div>
                {isEditing ? (
                  <input
                    type="tel"
                    value={editedContact.phone || ''}
                    onChange={(e) => setEditedContact({...editedContact, phone: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>
                    {contact.phone ? (
                      <a 
                        href={`tel:${contact.phone}`}
                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.phone}
                      </a>
                    ) : (
                      'Not specified'
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Address */}
            <div className="flex items-start gap-3">
              <MapPin size={16} className={`${t.textSecondary} mt-1`} />
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Address</div>
                {isEditing ? (
                  <textarea
                    value={editedContact.address || ''}
                    onChange={(e) => setEditedContact({...editedContact, address: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm resize-none`}
                    rows={2}
                  />
                ) : (
                  <div className={`${t.text}`}>
                    {contact.address ? (
                      <a 
                        href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.address}
                      </a>
                    ) : (
                      'Not specified'
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Company */}
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded ${t.textSecondary} flex-shrink-0`}></div>
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Company</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedContact.company || ''}
                    onChange={(e) => setEditedContact({...editedContact, company: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>{contact.company || 'Not specified'}</div>
                )}
              </div>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded ${t.textSecondary} flex-shrink-0`}></div>
              <div className="flex-1">
                <div className={`text-sm ${t.textSecondary}`}>Role</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedContact.role || ''}
                    onChange={(e) => setEditedContact({...editedContact, role: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>{contact.role || 'Not specified'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            {contact.is_internal && (
              <span className="text-xs bg-blue-600/20 text-blue-200 px-2 py-1 rounded-full">Internal</span>
            )}
            {contact.is_primary && (
              <span className="text-xs bg-green-600/20 text-green-200 px-2 py-1 rounded-full">Primary Contact</span>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-700">
            {!isEditing ? (
              <>
                <button
                  onClick={() => canEdit && setIsEditing(true)}
                  disabled={!canEdit}
                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Edit
                </button>
                <button 
                  onClick={() => onRemove && onRemove(contact)} 
                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2 px-3 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RichContactCard;
