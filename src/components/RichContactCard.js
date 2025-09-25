import React, { useState } from 'react';import React, { useState } from 'react';import React, { useState } from 'react';

import { Edit2, Trash2, ChevronDown, Phone, Mail, MapPin } from 'lucide-react';

import { Edit2, Trash2, ChevronDown, Phone, Mail, MapPin } from 'lucide-react';import { ChevronDown, Mail, Phone, MapPin } from 'lucide-react';

const RichContactCard = ({ contact, theme: t, onRemove, onUpdateContact }) => {

  const [isExpanded, setIsExpanded] = useState(false);

  const [isEditing, setIsEditing] = useState(false);

  const [editedContact, setEditedContact] = useState({const RichContactCard = ({ contact, theme: t, onRemove, onUpdateContact }) => {const RichContactCard = ({ contact, theme, stakeholderRole, onRemove, onUpdateContact }) => {

    first_name: contact.first_name || '',

    last_name: contact.last_name || '',  const [isExpanded, setIsExpanded] = useState(false);  const [isExpanded, setIsExpanded] = useState(false);

    role: contact.role || '',

    email: contact.email || '',  const [isEditing, setIsEditing] = useState(false);  const [isEditing, setIsEditing] = useState(false);

    phone: contact.phone || '',

    address: contact.address || '',  const [editedContact, setEditedContact] = useState({  const [editedContact, setEditedContact] = useState(contact);

    status: contact.status || ''

  });    first_name: contact.first_name || '',



  const handleSave = () => {    last_name: contact.last_name || '',  const t = theme;

    onUpdateContact(contact.id, editedContact);

    setIsEditing(false);    role: contact.role || '',

  };

    email: contact.email || '',  const handleSave = () => {

  const handleCancel = () => {

    setEditedContact({    phone: contact.phone || '',    if (onUpdateContact) {

      first_name: contact.first_name || '',

      last_name: contact.last_name || '',    address: contact.address || '',      onUpdateContact(editedContact);

      role: contact.role || '',

      email: contact.email || '',    status: contact.status || ''    }

      phone: contact.phone || '',

      address: contact.address || '',  });    setIsEditing(false);

      status: contact.status || ''

    });  };

    setIsEditing(false);

  };  const handleSave = () => {



  const getStatusBadge = (status) => {    onUpdateContact(contact.id, editedContact);  const handleCancel = () => {

    if (status === 'Internal') {

      return (    setIsEditing(false);    setEditedContact(contact);

        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.bgPrimary} ${t.textOnPrimary}`}>

          Internal  };    setIsEditing(false);

        </span>

      );  };

    } else if (status === 'Primary') {

      return (  const handleCancel = () => {

        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.bgSecondary} ${t.textOnSecondary}`}>

          Primary    setEditedContact({  return (

        </span>

      );      first_name: contact.first_name || '',    <div className={`rounded-lg ${t.surface} border ${t.border} overflow-hidden`}>

    }

    return null;      last_name: contact.last_name || '',      <button

  };

      role: contact.role || '',        onClick={() => setIsExpanded(!isExpanded)}

  return (

    <div className={`${t.cardBg} ${t.border} rounded-lg border p-4 mb-3 transition-all duration-200 hover:shadow-md`}>      email: contact.email || '',        className={`w-full p-4 text-left flex items-center justify-between hover:${t.surface} transition-colors`}

      {/* Header */}

      <div       phone: contact.phone || '',        disabled={isEditing}

        className="flex items-center justify-between cursor-pointer"

        onClick={() => setIsExpanded(!isExpanded)}      address: contact.address || '',      >

      >

        <div className="flex items-center space-x-3">      status: contact.status || ''        <div>

          <div className="flex-grow">

            <h3 className={`font-semibold ${t.textPrimary}`}>    });          <div className={`font-medium ${t.text}`}>

              {isEditing ? (

                <div className="flex space-x-2">    setIsEditing(false);            {contact.name || 'Unnamed Contact'}

                  <input

                    type="text"  };          </div>

                    value={editedContact.first_name}

                    onChange={(e) => setEditedContact({ ...editedContact, first_name: e.target.value })}          <div className={`text-sm ${t.textSecondary}`}>

                    className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}

                    placeholder="First Name"  const getStatusBadge = (status) => {            {stakeholderRole ? stakeholderRole.name : contact.role || 'No role specified'}

                    onClick={(e) => e.stopPropagation()}

                  />    if (status === 'Internal') {          </div>

                  <input

                    type="text"      return (        </div>

                    value={editedContact.last_name}

                    onChange={(e) => setEditedContact({ ...editedContact, last_name: e.target.value })}        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.bgPrimary} ${t.textOnPrimary}`}>        {!isEditing && (

                    className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}

                    placeholder="Last Name"          Internal          <ChevronDown 

                    onClick={(e) => e.stopPropagation()}

                  />        </span>            size={20} 

                </div>

              ) : (      );            className={`${t.textSecondary} transition-transform ${isExpanded ? 'rotate-180' : ''}`} 

                `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed Contact'

              )}    } else if (status === 'Primary') {          />

            </h3>

            <p className={`${t.textSecondary} text-sm`}>      return (        )}

              {isEditing ? (

                <input        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.bgSecondary} ${t.textOnSecondary}`}>      </button>

                  type="text"

                  value={editedContact.role}          Primary

                  onChange={(e) => setEditedContact({ ...editedContact, role: e.target.value })}

                  className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textSecondary}`}        </span>      {isExpanded && (

                  placeholder="Role"

                  onClick={(e) => e.stopPropagation()}      );        <div className="px-4 pb-4 space-y-4 border-t border-gray-700">

                />

              ) : (    }          <div className="space-y-3">

                contact.role || 'No role assigned'

              )}    return null;            <div className="flex items-center gap-3">

            </p>

          </div>  };              <Mail size={16} className={`${t.textSecondary} flex-shrink-0`} />

          <div className="flex items-center space-x-2">

            {getStatusBadge(contact.status)}              <div className="flex-1">

            <ChevronDown

              className={`${t.textSecondary} transform transition-transform duration-200 ${  return (                <div className={`text-sm ${t.textSecondary}`}>Email</div>

                isExpanded ? 'rotate-180' : 'rotate-0'

              }`}    <div className={`${t.cardBg} ${t.border} rounded-lg border p-4 mb-3 transition-all duration-200 hover:shadow-md`}>                {isEditing ? (

            />

          </div>      {/* Header */}                  <input

        </div>

      </div>      <div                     type="email"



      {/* Expanded Content */}        className="flex items-center justify-between cursor-pointer"                    value={editedContact.email || ''}

      {isExpanded && (

        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">        onClick={() => setIsExpanded(!isExpanded)}                    onChange={(e) => setEditedContact({...editedContact, email: e.target.value})}

          {/* Contact Information */}

          <div className="space-y-2">      >                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}

            {/* Email */}

            <div className="flex items-center space-x-2">        <div className="flex items-center space-x-3">                  />

              <Mail className={`w-4 h-4 ${t.textSecondary}`} />

              {isEditing ? (          <div className="flex-grow">                ) : (

                <input

                  type="email"            <h3 className={`font-semibold ${t.textPrimary}`}>                  <div className={`${t.text}`}>

                  value={editedContact.email}

                  onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}              {isEditing ? (                    {contact.email ? (

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}

                  placeholder="email@example.com"                <div className="flex space-x-2">                      <a 

                />

              ) : (                  <input                        href={`mailto:${contact.email}`}

                <a 

                  href={`mailto:${contact.email}`}                     type="text"                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"

                  className={`${t.textBlue} hover:underline`}

                >                    value={editedContact.first_name}                        onClick={(e) => e.stopPropagation()}

                  {contact.email || 'No email'}

                </a>                    onChange={(e) => setEditedContact({ ...editedContact, first_name: e.target.value })}                      >

              )}

            </div>                    className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}                        {contact.email}



            {/* Phone */}                    placeholder="First Name"                      </a>

            <div className="flex items-center space-x-2">

              <Phone className={`w-4 h-4 ${t.textSecondary}`} />                    onClick={(e) => e.stopPropagation()}                    ) : (

              {isEditing ? (

                <input                  />                      'Not specified'

                  type="tel"

                  value={editedContact.phone}                  <input                    )}

                  onChange={(e) => setEditedContact({ ...editedContact, phone: e.target.value })}

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}                    type="text"                  </div>

                  placeholder="(555) 123-4567"

                />                    value={editedContact.last_name}                )}

              ) : (

                <a                     onChange={(e) => setEditedContact({ ...editedContact, last_name: e.target.value })}              </div>

                  href={`tel:${contact.phone}`} 

                  className={`${t.textBlue} hover:underline`}                    className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}            </div>

                >

                  {contact.phone || 'No phone'}                    placeholder="Last Name"

                </a>

              )}                    onClick={(e) => e.stopPropagation()}            <div className="flex items-center gap-3">

            </div>

                  />              <Phone size={16} className={`${t.textSecondary} flex-shrink-0`} />

            {/* Address */}

            <div className="flex items-center space-x-2">                </div>              <div className="flex-1">

              <MapPin className={`w-4 h-4 ${t.textSecondary}`} />

              {isEditing ? (              ) : (                <div className={`text-sm ${t.textSecondary}`}>Phone</div>

                <input

                  type="text"                `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unnamed Contact'                {isEditing ? (

                  value={editedContact.address}

                  onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}              )}                  <input

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}

                  placeholder="123 Main St, City, State"            </h3>                    type="tel"

                />

              ) : (            <p className={`${t.textSecondary} text-sm`}>                    value={editedContact.phone || ''}

                <a 

                  href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}              {isEditing ? (                    onChange={(e) => setEditedContact({...editedContact, phone: e.target.value})}

                  target="_blank"

                  rel="noopener noreferrer"                <input                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}

                  className={`${t.textBlue} hover:underline`}

                >                  type="text"                  />

                  {contact.address || 'No address'}

                </a>                  value={editedContact.role}                ) : (

              )}

            </div>                  onChange={(e) => setEditedContact({ ...editedContact, role: e.target.value })}                  <div className={`${t.text}`}>



            {/* Status */}                  className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textSecondary}`}                    {contact.phone ? (

            {isEditing && (

              <div className="flex items-center space-x-2">                  placeholder="Role"                      <a 

                <span className={`${t.textSecondary} text-sm`}>Status:</span>

                <select                  onClick={(e) => e.stopPropagation()}                        href={`tel:${contact.phone}`}

                  value={editedContact.status}

                  onChange={(e) => setEditedContact({ ...editedContact, status: e.target.value })}                />                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"

                  className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}

                >              ) : (                        onClick={(e) => e.stopPropagation()}

                  <option value="">No status</option>

                  <option value="Internal">Internal</option>                contact.role || 'No role assigned'                      >

                  <option value="Primary">Primary</option>

                </select>              )}                        {contact.phone}

              </div>

            )}            </p>                      </a>

          </div>

          </div>                    ) : (

          {/* Action Buttons */}

          <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">          <div className="flex items-center space-x-2">                      'Not specified'

            {isEditing ? (

              <>            {getStatusBadge(contact.status)}                    )}

                <button

                  onClick={handleCancel}            <ChevronDown                  </div>

                  className={`px-3 py-1 text-sm rounded border ${t.border} ${t.textSecondary} hover:bg-gray-50 transition-colors`}

                >              className={`${t.textSecondary} transform transition-transform duration-200 ${                )}

                  Cancel

                </button>                isExpanded ? 'rotate-180' : 'rotate-0'              </div>

                <button

                  onClick={handleSave}              }`}            </div>

                  className={`px-3 py-1 text-sm rounded ${t.bgPrimary} ${t.textOnPrimary} hover:opacity-90 transition-opacity`}

                >            />

                  Save

                </button>          </div>            <div className="flex items-center gap-3">

              </>

            ) : (        </div>              <MapPin size={16} className={`${t.textSecondary} flex-shrink-0`} />

              <>

                <button      </div>              <div className="flex-1">

                  onClick={(e) => {

                    e.stopPropagation();                <div className={`text-sm ${t.textSecondary}`}>Address</div>

                    setIsEditing(true);

                  }}      {/* Expanded Content */}                {isEditing ? (

                  className={`flex items-center space-x-1 px-3 py-1 text-sm rounded border ${t.border} ${t.textSecondary} hover:bg-gray-50 transition-colors`}

                >      {isExpanded && (                  <textarea

                  <Edit2 className="w-3 h-3" />

                  <span>Edit</span>        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">                    value={editedContact.address || ''}

                </button>

                <button          {/* Contact Information */}                    onChange={(e) => setEditedContact({...editedContact, address: e.target.value})}

                  onClick={(e) => {

                    e.stopPropagation();          <div className="space-y-2">                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm resize-none`}

                    if (window.confirm('Are you sure you want to remove this contact?')) {

                      onRemove(contact.id);            {/* Email */}                    rows={2}

                    }

                  }}            <div className="flex items-center space-x-2">                  />

                  className={`flex items-center space-x-1 px-3 py-1 text-sm rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors`}

                >              <Mail className={`w-4 h-4 ${t.textSecondary}`} />                ) : (

                  <Trash2 className="w-3 h-3" />

                  <span>Remove</span>              {isEditing ? (                  <div className={`${t.text}`}>

                </button>

              </>                <input                    {contact.address ? (

            )}

          </div>                  type="email"                      <a 

        </div>

      )}                  value={editedContact.email}                        href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}

    </div>

  );                  onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}                        target="_blank"

};

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}                        rel="noopener noreferrer"

export default RichContactCard;
                  placeholder="email@example.com"                        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"

                />                        onClick={(e) => e.stopPropagation()}

              ) : (                      >

                <a                         {contact.address}

                  href={`mailto:${contact.email}`}                       </a>

                  className={`${t.textBlue} hover:underline`}                    ) : (

                >                      'Not specified'

                  {contact.email || 'No email'}                    )}

                </a>                  </div>

              )}                )}

            </div>              </div>

            </div>

            {/* Phone */}

            <div className="flex items-center space-x-2">            <div className="flex items-center gap-3">

              <Phone className={`w-4 h-4 ${t.textSecondary}`} />              <div className={`w-4 h-4 rounded ${t.textSecondary} flex-shrink-0`}></div>

              {isEditing ? (              <div className="flex-1">

                <input                <div className={`text-sm ${t.textSecondary}`}>Company</div>

                  type="tel"                {isEditing ? (

                  value={editedContact.phone}                  <input

                  onChange={(e) => setEditedContact({ ...editedContact, phone: e.target.value })}                    type="text"

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}                    value={editedContact.company || ''}

                  placeholder="(555) 123-4567"                    onChange={(e) => setEditedContact({...editedContact, company: e.target.value})}

                />                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}

              ) : (                  />

                <a                 ) : (

                  href={`tel:${contact.phone}`}                   <div className={`${t.text}`}>{contact.company || 'Not specified'}</div>

                  className={`${t.textBlue} hover:underline`}                )}

                >              </div>

                  {contact.phone || 'No phone'}            </div>

                </a>          </div>

              )}

            </div>          <div className="flex flex-wrap gap-2">

            {contact.is_internal && (

            {/* Address */}              <span className="text-xs bg-blue-600/20 text-blue-200 px-2 py-1 rounded-full">

            <div className="flex items-center space-x-2">                Internal

              <MapPin className={`w-4 h-4 ${t.textSecondary}`} />              </span>

              {isEditing ? (            )}

                <input            {contact.is_primary && (

                  type="text"              <span className="text-xs bg-green-600/20 text-green-200 px-2 py-1 rounded-full">

                  value={editedContact.address}                Primary Contact

                  onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}              </span>

                  className={`flex-1 px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}            )}

                  placeholder="123 Main St, City, State"          </div>

                />

              ) : (          <div className="flex gap-2 pt-2 border-t border-gray-700">

                <a             {!isEditing ? (

                  href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}              <>

                  target="_blank"                <button

                  rel="noopener noreferrer"                  onClick={() => setIsEditing(true)}

                  className={`${t.textBlue} hover:underline`}                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}

                >                >

                  {contact.address || 'No address'}                  Edit

                </a>                </button>

              )}                <button 

            </div>                  onClick={() => onRemove && onRemove(contact)} 

                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}

            {/* Status */}                >

            {isEditing && (                  Remove

              <div className="flex items-center space-x-2">                </button>

                <span className={`${t.textSecondary} text-sm`}>Status:</span>              </>

                <select            ) : (

                  value={editedContact.status}              <>

                  onChange={(e) => setEditedContact({ ...editedContact, status: e.target.value })}                <button

                  className={`px-2 py-1 border rounded ${t.inputBg} ${t.inputBorder} ${t.textPrimary}`}                  onClick={handleCancel}

                >                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}

                  <option value="">No status</option>                >

                  <option value="Internal">Internal</option>                  Cancel

                  <option value="Primary">Primary</option>                </button>

                </select>                <button

              </div>                  onClick={handleSave}

            )}                  className="flex-1 py-2 px-3 rounded text-sm bg-violet-500 text-white hover:bg-violet-600 transition-colors"

          </div>                >

                  Save

          {/* Action Buttons */}                </button>

          <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">              </>

            {isEditing ? (            )}

              <>          </div>

                <button        </div>

                  onClick={handleCancel}      )}

                  className={`px-3 py-1 text-sm rounded border ${t.border} ${t.textSecondary} hover:bg-gray-50 transition-colors`}    </div>

                >  );

                  Cancel};

                </button>

                <buttonexport default RichContactCard; 

                  onClick={handleSave}            className={`${t.textSecondary} transform transition-transform duration-200 ${

                  className={`px-3 py-1 text-sm rounded ${t.bgPrimary} ${t.textOnPrimary} hover:opacity-90 transition-opacity`}              isExpanded ? 'rotate-180' : 'rotate-0'

                >            }`} 

                  Save          />

                </button>        )}

              </>      </button>

            ) : (

              <>      {/* Expanded Content - NO EDIT BUTTONS HERE */}

                <button      {isExpanded && (

                  onClick={(e) => {        <div className={`border-t ${t.border} p-4 space-y-4`}>

                    e.stopPropagation();          

                    setIsEditing(true);          {/* Contact Information */}

                  }}          <div className="grid gap-3">

                  className={`flex items-center space-x-1 px-3 py-1 text-sm rounded border ${t.border} ${t.textSecondary} hover:bg-gray-50 transition-colors`}            {/* Name */}

                >            <div className="flex items-center gap-3">

                  <Edit2 className="w-3 h-3" />              <div className={`w-4 h-4 rounded ${t.textSecondary} flex-shrink-0`}></div>

                  <span>Edit</span>              <div className="flex-1">

                </button>                <div className={`text-sm ${t.textSecondary}`}>Name</div>

                <button                {isEditing ? (

                  onClick={(e) => {                  <input

                    e.stopPropagation();                    type="text"

                    if (window.confirm('Are you sure you want to remove this contact?')) {                    value={editedContact.name || editedContact.fullName || ''}

                      onRemove(contact.id);                    onChange={(e) => setEditedContact({...editedContact, name: e.target.value, fullName: e.target.value})}

                    }                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}

                  }}                  />

                  className={`flex items-center space-x-1 px-3 py-1 text-sm rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors`}                ) : (

                >                  <div className={`${t.text}`}>{contactName}</div>

                  <Trash2 className="w-3 h-3" />                )}

                  <span>Remove</span>              </div>

                </button>            </div>

              </>

            )}            {/* Email */}

          </div>            <div className="flex items-center gap-3">

        </div>              <Mail size={16} className={t.textSecondary} />

      )}              <div className="flex-1">

    </div>                <div className={`text-sm ${t.textSecondary}`}>Email</div>

  );                {isEditing ? (

};                  <input

                    type="email"

export default RichContactCard;                    value={editedContact.email || ''}
                    onChange={(e) => setEditedContact({...editedContact, email: e.target.value})}
                    className={`w-full px-2 py-1 rounded ${t.surface} ${t.text} border ${t.border} text-sm`}
                  />
                ) : (
                  <div className={`${t.text}`}>
                    {contact?.email ? (
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
                    {contact?.phone ? (
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
                    {contact?.address ? (
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
                  <div className={`${t.text}`}>{contact?.company || 'Not specified'}</div>
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
                  <div className={`${t.text}`}>{contact?.role || 'Not specified'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            {contact?.is_internal && (
              <span className="text-xs bg-violet-500/20 text-violet-200 px-2 py-1 rounded-full">
                Internal
              </span>
            )}
            {contact?.is_primary && (
              <span className="text-xs bg-green-600/20 text-green-200 px-2 py-1 rounded-full">
                Primary Contact
              </span>
            )}
          </div>

          {/* ONLY BUTTONS AT BOTTOM - NO REPORT BUTTON */}
          <div className="flex gap-2 pt-2 border-t border-gray-700">
            {!isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className={`flex-1 py-2 px-3 rounded text-sm ${t.surface} ${t.text} hover:${t.surfaceHover} transition-colors`}
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
                  className="flex-1 py-2 px-3 rounded text-sm bg-violet-500 text-white hover:bg-violet-600 transition-colors"
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