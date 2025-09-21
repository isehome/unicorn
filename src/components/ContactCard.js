import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Plus, X, ChevronDown, Mail, Phone, MapPin, User } from 'lucide-react';

// Contact Card Component for project assignments
const ContactCard = ({ contact, theme, onRemove, onTogglePrimary }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = theme;

  return (
    <div className={`rounded-lg ${t.surfaceHover} border ${t.border} overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-3 text-left flex items-center justify-between hover:${t.surface} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <User size={16} className={t.textSecondary} />
          <div>
            <div className={`font-medium ${t.text}`}>{contact.contact_name}</div>
            <div className={`text-xs ${t.textSecondary}`}>
              {contact.role_name}
              {contact.is_primary && <span className="ml-2 text-green-400">• Primary</span>}
            </div>
          </div>
        </div>
        <ChevronDown 
          size={16} 
          className={`${t.textSecondary} transform transition-transform ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`} 
        />
      </button>

      {isExpanded && (
        <div className={`border-t ${t.border} p-3 space-y-2`}>
          <div className="space-y-1 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className={t.textSecondary} />
                <a 
                  href={`mailto:${contact.email}`}
                  className="text-blue-400 hover:text-blue-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className={t.textSecondary} />
                <a 
                  href={`tel:${contact.phone}`}
                  className="text-blue-400 hover:text-blue-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.phone}
                </a>
              </div>
            )}
            {contact.company && (
              <div className={`text-sm ${t.textSecondary}`}>
                {contact.company}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-700">
            <button
              onClick={() => onTogglePrimary()}
              className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                contact.is_primary 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : `${t.surface} ${t.text} hover:${t.surfaceHover}`
              }`}
            >
              {contact.is_primary ? 'Primary ✓' : 'Make Primary'}
            </button>
            <button
              onClick={() => onRemove()}
              className={`py-1 px-2 rounded text-xs ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactCard;