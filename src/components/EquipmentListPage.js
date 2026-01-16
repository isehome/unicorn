import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import DateField from './ui/DateField';
import { Search, Building, Layers, Package, Cable, CheckCircle2, ChevronDown, ChevronRight, FileText, BookOpen, Wifi, ExternalLink, X, User, Clock, ArrowRightLeft, AlertTriangle, Key, Eye, EyeOff, Copy, Plus, Trash2, Edit2 } from 'lucide-react';
import CachedSharePointImage from './CachedSharePointImage';
import { usePhotoViewer } from './photos/PhotoViewerProvider';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { secureDataService } from '../services/equipmentService';
import { enhancedStyles } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Date Detail Modal Component - supports fallback lookups from related records
const DateDetailModal = ({ isOpen, onClose, title, date, userId, equipmentId, mode, currentUser }) => {
  const [userName, setUserName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookupSource, setLookupSource] = useState(null); // Track where we found the user

  useEffect(() => {
    const lookupUser = async () => {
      setLoading(true);
      setLookupSource(null);

      // Helper to fetch user name - first check if it's the current user, then try profiles table
      // Returns { name, found } to indicate if lookup was successful
      const fetchUserName = async (uid) => {
        if (!uid) return { name: null, found: false };

        // If this is the current logged-in user, use their display name directly
        // This avoids needing to look up profiles table (which may not have synced yet)
        if (currentUser?.id === uid && currentUser?.displayName) {
          console.log('[DateDetailModal] Using current user display name:', currentUser.displayName);
          return { name: currentUser.displayName, found: true };
        }

        // Try to look up from profiles table
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', uid)
          .single();
        if (!error && data) {
          const resolvedName = data.full_name || data.email;
          if (resolvedName) {
            return { name: resolvedName, found: true };
          }
        }

        // Profile lookup failed - if it's the current user, still use their name
        if (currentUser?.id === uid) {
          return { name: currentUser.displayName || currentUser.email || 'Current User', found: true };
        }

        // Last resort - user not found in profiles
        console.warn('[DateDetailModal] Could not resolve user name for ID:', uid);
        return { name: null, found: false };
      };

      // 1. Direct lookup - use passed userId if available
      if (userId) {
        const result = await fetchUserName(userId);
        if (result.found && result.name) {
          setUserName(result.name);
          setLookupSource('direct');
          setLoading(false);
          return;
        }
        // userId was passed but couldn't be resolved - continue to fallback lookups
        console.log('[DateDetailModal] Direct userId lookup failed, trying fallback for:', title);
      }

      // 2. Fallback lookups based on action type (title)
      if (equipmentId) {
        try {
          // ORDERED: Look up submitted_by from purchase_orders via purchase_order_items
          if (title === 'Ordered') {
            const { data: poItems } = await supabase
              .from('purchase_order_items')
              .select(`
                po_id,
                purchase_order:po_id (
                  submitted_by
                )
              `)
              .eq('project_equipment_id', equipmentId)
              .not('purchase_order.submitted_by', 'is', null)
              .limit(1);

            const submittedBy = poItems?.[0]?.purchase_order?.submitted_by;
            if (submittedBy) {
              const result = await fetchUserName(submittedBy);
              if (result.found && result.name) {
                setUserName(result.name);
                setLookupSource('purchase_order');
                setLoading(false);
                return;
              }
            }
          }

          // RECEIVED: Look up received_by from purchase_order_items
          if (title === 'Received') {
            const { data: poItems } = await supabase
              .from('purchase_order_items')
              .select('received_by')
              .eq('project_equipment_id', equipmentId)
              .not('received_by', 'is', null)
              .limit(1);

            const receivedBy = poItems?.[0]?.received_by;
            if (receivedBy) {
              const result = await fetchUserName(receivedBy);
              if (result.found && result.name) {
                setUserName(result.name);
                setLookupSource('purchase_order_item');
                setLoading(false);
                return;
              }
            }
          }

          // INSTALLED: Look up completed_by from wire_drop_stages (trim_out) via wire_drop_equipment_links
          // NOTE: wire_drop_stages.completed_by stores the display NAME directly (not a UUID)
          if (title === 'Installed') {
            // First get linked wire drops for this equipment
            const { data: links } = await supabase
              .from('wire_drop_equipment_links')
              .select('wire_drop_id')
              .eq('project_equipment_id', equipmentId);

            if (links?.length > 0) {
              const wireDropIds = links.map(l => l.wire_drop_id);
              // Find completed trim_out stages
              const { data: stages } = await supabase
                .from('wire_drop_stages')
                .select('completed_by, completed_at')
                .eq('stage_type', 'trim_out')
                .eq('completed', true)
                .in('wire_drop_id', wireDropIds)
                .order('completed_at', { ascending: false })
                .limit(1);

              const completedBy = stages?.[0]?.completed_by;
              if (completedBy) {
                // completed_by in wire_drop_stages is already the display name (not a UUID)
                // Check if it looks like a UUID (36 chars with dashes) or a display name
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(completedBy);

                if (isUUID) {
                  // It's a UUID - try to resolve via profiles
                  const result = await fetchUserName(completedBy);
                  if (result.found && result.name) {
                    setUserName(result.name);
                    setLookupSource('wire_drop_trim');
                    setLoading(false);
                    return;
                  }
                } else {
                  // It's already a display name - use it directly
                  setUserName(completedBy);
                  setLookupSource('wire_drop_trim');
                  setLoading(false);
                  return;
                }
              }
            }
          }

          // DELIVERED: Look up delivered_confirmed_by directly from project_equipment
          if (title === 'Delivered') {
            const { data: equipment } = await supabase
              .from('project_equipment')
              .select('delivered_confirmed_by')
              .eq('id', equipmentId)
              .single();

            const deliveredBy = equipment?.delivered_confirmed_by;
            if (deliveredBy) {
              const result = await fetchUserName(deliveredBy);
              if (result.found && result.name) {
                setUserName(result.name);
                setLookupSource('equipment_record');
                setLoading(false);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('[DateDetailModal] Fallback lookup error:', err);
        }
      }

      // No user found through any lookup method
      setUserName('Tracking unavailable (legacy data)');
      setLoading(false);
    };

    if (isOpen) {
      lookupUser();
    }
  }, [isOpen, userId, equipmentId, title, currentUser]);

  if (!isOpen) return null;

  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'N/A';

  const formattedTime = date ? new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl shadow-xl max-w-sm w-full p-5"
        style={{ backgroundColor: mode === 'dark' ? '#27272A' : '#FFFFFF' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <X size={18} className="text-gray-500" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Clock size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Date & Time</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{formattedDate}</p>
              {formattedTime && (
                <p className="text-sm text-gray-600 dark:text-gray-300">{formattedTime}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <User size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completed By</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {loading ? 'Loading...' : userName}
              </p>
              {lookupSource && lookupSource !== 'direct' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {lookupSource === 'purchase_order' && '(from purchase order)'}
                  {lookupSource === 'purchase_order_item' && '(from receiving record)'}
                  {lookupSource === 'wire_drop_trim' && '(from wire drop trim)'}
                  {lookupSource === 'equipment_record' && '(from equipment record)'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Room Reassignment Modal Component
const RoomReassignModal = ({ isOpen, onClose, equipment, rooms, currentRoomId, onConfirm, mode }) => {
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedRoomId('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !equipment) return null;

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const availableRooms = rooms.filter(r => r.id !== currentRoomId);
  const hasWireDrops = equipment.wireDrops?.length > 0;

  const handleConfirm = async () => {
    if (!selectedRoomId) return;
    setIsSubmitting(true);
    try {
      await onConfirm(equipment.id, selectedRoomId);
      onClose();
    } catch (error) {
      console.error('Failed to reassign room:', error);
      alert(error.message || 'Failed to reassign room');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl shadow-xl max-w-md w-full p-5"
        style={{ backgroundColor: mode === 'dark' ? '#27272A' : '#FFFFFF' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <X size={18} className="text-gray-500" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Reassign Room
        </h3>

        <div className="space-y-4">
          {/* Equipment Info */}
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
            <p className="font-medium text-gray-900 dark:text-gray-100">{equipment.name}</p>
            {equipment.partNumber && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{equipment.partNumber}</p>
            )}
          </div>

          {/* Current Room */}
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Current Room</label>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {currentRoom?.name || 'Unassigned'}
              {currentRoom?.is_headend && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  Head-End
                </span>
              )}
            </p>
          </div>

          {/* Warning if has wire drops */}
          {hasWireDrops && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  This equipment is linked to {equipment.wireDrops.length} wire drop{equipment.wireDrops.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Reassigning will unlink the equipment from all wire drops and reset its installed status.
                </p>
              </div>
            </div>
          )}

          {/* New Room Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Room
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            >
              <option value="">Select a room...</option>
              {availableRooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name}
                  {room.is_headend ? ' (Head-End)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              disabled={!selectedRoomId || isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? 'Reassigning...' : 'Reassign'}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Equipment Credentials Section - Inline expandable credentials for equipment
const EquipmentCredentialsSection = ({ equipmentId, projectId, mode, user }) => {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [copiedField, setCopiedField] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    data_type: 'credentials',
    username: '',
    password: '',
    url: '',
    notes: ''
  });

  const loadCredentials = useCallback(async () => {
    if (!equipmentId) return;
    setLoading(true);
    try {
      const data = await secureDataService.getForProjectEquipment(equipmentId);
      setCredentials(data || []);
    } catch (error) {
      console.error('Failed to load equipment credentials:', error);
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleCopy = async (text, fieldId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      if (editingId) {
        await secureDataService.update(editingId, formData);
      } else {
        await secureDataService.createForProjectEquipment(projectId, equipmentId, formData, user?.id);
      }
      await loadCredentials();
      setShowAddForm(false);
      setEditingId(null);
      setFormData({ name: '', data_type: 'credentials', username: '', password: '', url: '', notes: '' });
    } catch (error) {
      console.error('Failed to save credential:', error);
      alert(error.message || 'Failed to save credential');
    }
  };

  const handleEdit = (cred) => {
    setFormData({
      name: cred.name || '',
      data_type: cred.data_type || 'credentials',
      username: cred.username || '',
      password: cred.password || '',
      url: cred.url || '',
      notes: cred.notes || ''
    });
    setEditingId(cred.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this credential?')) return;
    try {
      await secureDataService.delete(id);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to delete credential:', error);
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormData({ name: '', data_type: 'credentials', username: '', password: '', url: '', notes: '' });
  };

  if (loading) {
    return (
      <div className="pt-3 border-t" style={{ borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB' }}>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Key size={14} className="animate-pulse" />
          <span>Loading credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t" style={{ borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Credentials ({credentials.length})
          </span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400"
          >
            <Plus size={14} />
            Add
          </button>
        )}
      </div>

      {/* Credentials List */}
      {credentials.length > 0 && !showAddForm && (
        <div className="space-y-2">
          {credentials.map(cred => (
            <div
              key={cred.id}
              className="p-3 rounded-lg text-xs"
              style={{ backgroundColor: mode === 'dark' ? '#27272A' : '#F9FAFB' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{cred.name}</p>
                  <p className="text-gray-500 dark:text-gray-400 capitalize">{cred.data_type}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(cred)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                    title="Edit"
                  >
                    <Edit2 size={12} className="text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    title="Delete"
                  >
                    <Trash2 size={12} className="text-red-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {cred.username && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Username:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-gray-900 dark:text-gray-100">{cred.username}</span>
                      <button
                        onClick={() => handleCopy(cred.username, `user-${cred.id}`)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                      >
                        {copiedField === `user-${cred.id}` ? (
                          <CheckCircle2 size={12} style={{ color: '#94AF32' }} />
                        ) : (
                          <Copy size={12} className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {cred.password && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Password:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-gray-900 dark:text-gray-100">
                        {visiblePasswords[cred.id] ? cred.password : '••••••••'}
                      </span>
                      <button
                        onClick={() => togglePasswordVisibility(cred.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                      >
                        {visiblePasswords[cred.id] ? (
                          <EyeOff size={12} className="text-gray-400" />
                        ) : (
                          <Eye size={12} className="text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCopy(cred.password, `pass-${cred.id}`)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                      >
                        {copiedField === `pass-${cred.id}` ? (
                          <CheckCircle2 size={12} style={{ color: '#94AF32' }} />
                        ) : (
                          <Copy size={12} className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {cred.url && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400">URL:</span>
                    <a
                      href={cred.url.startsWith('http') ? cred.url : `https://${cred.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 dark:text-violet-400 hover:underline truncate max-w-[200px]"
                    >
                      {cred.url}
                    </a>
                  </div>
                )}
                {cred.notes && (
                  <p className="text-gray-500 dark:text-gray-400 italic mt-1">{cred.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {credentials.length === 0 && !showAddForm && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          No credentials linked to this equipment
        </p>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-3 rounded-lg" style={{ backgroundColor: mode === 'dark' ? '#27272A' : '#F9FAFB' }}>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Name *"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700"
              required
            />
            <select
              value={formData.data_type}
              onChange={(e) => setFormData(prev => ({ ...prev, data_type: e.target.value }))}
              className="px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700"
            >
              <option value="credentials">Credentials</option>
              <option value="network">Network</option>
              <option value="api_key">API Key</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              className="px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700"
            />
            <input
              type="text"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700"
            />
          </div>
          <input
            type="text"
            placeholder="URL (optional)"
            value={formData.url}
            onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
            className="w-full px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700"
          />
          <textarea
            placeholder="Notes (optional)"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            className="w-full px-2 py-1.5 text-xs rounded border dark:bg-zinc-800 dark:border-zinc-700 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1 text-xs rounded bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-700"
            >
              {editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const mapEquipmentRecord = (item) => {
  const name = item.name || item.global_part?.name || 'Unnamed Equipment';
  const partNumber = item.part_number || item.global_part?.part_number || null;
  const manufacturer = item.manufacturer || item.global_part?.manufacturer || null;
  const model = item.model || item.global_part?.model || null;
  const roomName = item.project_rooms?.name || 'Unassigned';
  const installSide = item.install_side || (item.project_rooms?.is_headend ? 'head_end' : 'room_end');
  const homekitQRUrl = item.homekit_qr_url || null;

  // Calculate "ordered" status from procurement system (auto-synced with PO submissions)
  // quantity_ordered is automatically calculated from submitted POs
  const quantityOrdered = item.quantity_ordered || 0;
  const isOrdered = quantityOrdered > 0;

  // Calculate "received" status from Parts Receiving system (auto-synced)
  // received_quantity is updated when technicians receive items (POs or inventory)
  const quantityReceived = item.received_quantity || 0;
  const quantityPlanned = item.planned_quantity || 0;
  const isReceived = quantityReceived > 0;
  const isFullyReceived = quantityPlanned > 0 && quantityReceived >= quantityPlanned;

  // Check if equipment should show in wire drop selector (filter for technician view)
  const isWireDropVisible = item.global_part?.is_wire_drop_visible !== false;

  return {
    id: item.id,
    name,
    partNumber,
    manufacturer,
    model,
    room: roomName,
    roomId: item.room_id || item.project_rooms?.id || null, // For reassignment
    isHeadend: installSide === 'head_end' || Boolean(item.project_rooms?.is_headend),
    installSide,
    plannedQuantity: quantityPlanned,
    ordered: isOrdered, // AUTO-SYNCED: True when item has been ordered via PO submission
    orderedAt: isOrdered ? (item.ordered_confirmed_at || null) : null,
    quantityOrdered, // Track actual quantity ordered
    received: isReceived, // AUTO-SYNCED: True when items received via Parts Receiving
    receivedAt: item.received_date || null,
    quantityReceived, // Track actual quantity received
    fullyReceived: isFullyReceived,
    // "Delivered" - manual checkbox for technician to confirm item is at job site
    delivered: Boolean(item.delivered_confirmed),
    deliveredAt: item.delivered_confirmed_at || null,
    deliveredBy: item.delivered_confirmed_by || null,
    installed: Boolean(item.installed), // INSTALLED: Auto-set when linked to wire drop, or manual for wireless items
    installedAt: item.installed_at || null,
    installedBy: item.installed_by || null,
    receivedBy: item.received_by || null,
    orderedBy: item.ordered_confirmed_by || null,
    isWireDropVisible, // Used for filtering - only show equipment marked for wire drop selector
    notes: item.notes || '',
    homekitQRUrl,
    homekitQRDriveId: item.homekit_qr_sharepoint_drive_id || null,
    homekitQRItemId: item.homekit_qr_sharepoint_item_id || null,
    // Additional fields for expanded view
    description: item.description || item.global_part?.description || null,
    // Documentation links from global_part
    schematicUrl: item.global_part?.schematic_url || null,
    installManualUrls: item.global_part?.install_manual_urls || [],
    technicalManualUrls: item.global_part?.technical_manual_urls || [],
    // Network information (UniFi)
    unifiMac: item.unifi_client_mac || null,
    unifiIp: item.unifi_last_ip || null,
    unifiLastSeen: item.unifi_last_seen || null,
    unifiData: item.unifi_data || null,
    searchIndex: [
      name,
      partNumber,
      manufacturer,
      model,
      roomName,
      homekitQRUrl ? 'homekit qr' : null,
      installSide === 'head_end' ? 'head-end' : 'room-end'
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  };
};

const EquipmentListPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, mode } = useTheme();
  const { openPhotoViewer } = usePhotoViewer();
  const { user } = useAuth();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];

  // Get highlight parameter from URL (for navigating from wire drop detail)
  const highlightId = searchParams.get('highlight');
  const highlightedItemRef = useRef(null);

  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [installFilter, setInstallFilter] = useState('all');
  const [installedFilter, setInstalledFilter] = useState('all'); // 'all', 'installed', 'not_installed'
  const [expandedItems, setExpandedItems] = useState({}); // Track expanded equipment cards
  const [dateModal, setDateModal] = useState({ isOpen: false, title: '', date: null, userId: null, equipmentId: null }); // Date detail modal state
  const [projectRooms, setProjectRooms] = useState([]); // All rooms for this project
  const [reassignModal, setReassignModal] = useState({ isOpen: false, equipment: null }); // Room reassignment modal state

  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const cardStyles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F3F4F6';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';

    return {
      header: {
        borderColor,
        backgroundColor: cardBackground,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        color: textPrimary
      },
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      textPrimary,
      textSecondary
    };
  }, [mode, sectionStyles]);

  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await projectEquipmentService.fetchProjectEquipment(projectId);

      // Load project rooms for reassignment modal
      const rooms = await projectEquipmentService.fetchRooms(projectId);
      setProjectRooms(rooms);

      // Load ALL purchase orders to calculate quantity_ordered (submitted POs only)
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          status,
          items:purchase_order_items(
            project_equipment_id,
            quantity_ordered
          )
        `)
        .eq('project_id', projectId);

      // Create map of submitted PO quantities (exclude drafts)
      const submittedPOMap = new Map();
      (pos || []).forEach(po => {
        if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
          (po.items || []).forEach(item => {
            const existing = submittedPOMap.get(item.project_equipment_id) || 0;
            submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
          });
        }
      });

      // Enrich equipment data with calculated quantity_ordered
      const enrichedData = (data || []).map(item => ({
        ...item,
        quantity_ordered: submittedPOMap.get(item.id) || 0
      }));

      // Fetch wire drop links for all equipment
      const equipmentIds = data.map(eq => eq.id);
      const { data: wireDropLinks, error: linksError } = await supabase
        .from('wire_drop_equipment_links')
        .select(`
          project_equipment_id,
          link_side,
          wire_drop:wire_drop_id (
            id,
            drop_name,
            drop_type,
            room_name
          )
        `)
        .in('project_equipment_id', equipmentIds);

      if (linksError) {
        console.warn('Failed to load wire drop links:', linksError);
      }

      // Get all wire drop IDs that are linked to equipment
      const linkedWireDropIds = [...new Set(
        wireDropLinks?.filter(l => l.wire_drop?.id).map(l => l.wire_drop.id) || []
      )];

      // Fetch trim_out stage completion status and timestamps for linked wire drops
      let wireDropTrimOutStatus = {};
      if (linkedWireDropIds.length > 0) {
        const { data: trimStages } = await supabase
          .from('wire_drop_stages')
          .select('wire_drop_id, completed, completed_at, completed_by')
          .eq('stage_type', 'trim_out')
          .in('wire_drop_id', linkedWireDropIds);

        (trimStages || []).forEach(stage => {
          wireDropTrimOutStatus[stage.wire_drop_id] = {
            completed: stage.completed,
            completedAt: stage.completed_at,
            completedBy: stage.completed_by
          };
        });
      }

      // Map wire drop links to equipment
      const wireDropsByEquipment = {};
      wireDropLinks?.forEach(link => {
        if (!link.wire_drop) return;
        if (!wireDropsByEquipment[link.project_equipment_id]) {
          wireDropsByEquipment[link.project_equipment_id] = [];
        }
        const trimStatus = wireDropTrimOutStatus[link.wire_drop.id] || {};
        wireDropsByEquipment[link.project_equipment_id].push({
          wireDropId: link.wire_drop.id,
          wireDropName: link.wire_drop.drop_name,
          wireDropType: link.wire_drop.drop_type,
          wireDropRoom: link.wire_drop.room_name,
          linkSide: link.link_side,
          trimOutCompleted: trimStatus.completed || false,
          trimOutCompletedAt: trimStatus.completedAt || null,
          trimOutCompletedBy: trimStatus.completedBy || null
        });
      });

      // Add wire drops to mapped equipment and derive installed status from wire drop trim_out
      const mapped = enrichedData.map(item => {
        const wireDrops = wireDropsByEquipment[item.id] || [];
        const mappedItem = mapEquipmentRecord(item);

        // If equipment is linked to ANY wire drop with trim_out completed, it's installed
        // This takes precedence over the stored installed field for equipment with wire drops
        const completedWireDrop = wireDrops.find(wd => wd.trimOutCompleted);
        const hasCompletedTrimOut = !!completedWireDrop;
        const installedFromWireDrop = wireDrops.length > 0 && hasCompletedTrimOut;

        // Derive installedAt and installedBy from wire drop if installed via wire drop
        let installedAt = mappedItem.installedAt;
        let installedBy = mappedItem.installedBy;

        if (installedFromWireDrop && completedWireDrop) {
          // Use the timestamp and user from the wire drop trim_out stage
          installedAt = completedWireDrop.trimOutCompletedAt || installedAt;
          installedBy = completedWireDrop.trimOutCompletedBy || installedBy;
        }

        return {
          ...mappedItem,
          wireDrops,
          // Installed status: derived from wire drop OR manual field for items without wire drops
          installed: installedFromWireDrop || (wireDrops.length === 0 && mappedItem.installed),
          installedAt,
          installedBy,
          // Track whether this is auto-derived or manual
          installedViaWireDrop: installedFromWireDrop
        };
      });

      setEquipment(mapped);
    } catch (err) {
      console.error('Failed to load project equipment:', err);
      setError(err.message || 'Failed to load project equipment');
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  // Handle highlight parameter - scroll to and expand the highlighted item
  useEffect(() => {
    if (highlightId && equipment.length > 0 && !loading) {
      // Expand the highlighted item
      setExpandedItems(prev => ({ ...prev, [highlightId]: true }));

      // Scroll to the item after a short delay to allow rendering
      setTimeout(() => {
        if (highlightedItemRef.current) {
          highlightedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      // Clear the highlight param after scrolling
      setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 2000);
    }
  }, [highlightId, equipment, loading, setSearchParams]);

  useEffect(() => {
    if (!highlightId) {
      window.scrollTo(0, 0);
    }
  }, [highlightId]);

  const rooms = useMemo(() => {
    const uniqueRooms = new Set();
    equipment.forEach((item) => {
      if (item.room) uniqueRooms.add(item.room);
    });
    return Array.from(uniqueRooms).sort((a, b) => a.localeCompare(b));
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return equipment.filter((item) => {
      // Only show equipment marked for wire drop selector
      if (!item.isWireDropVisible) return false;
      if (selectedRoom !== 'all' && item.room !== selectedRoom) return false;
      if (installFilter !== 'all' && item.installSide !== installFilter) return false;
      if (installedFilter === 'installed' && !item.installed) return false;
      if (installedFilter === 'not_installed' && item.installed) return false;
      if (query && !item.searchIndex.includes(query)) return false;
      return true;
    });
  }, [equipment, searchQuery, selectedRoom, installFilter, installedFilter]);

  const groupedEquipment = useMemo(() => {
    const groups = new Map();

    filteredEquipment.forEach((item) => {
      const roomKey = item.room || 'Unassigned';
      if (!groups.has(roomKey)) {
        groups.set(roomKey, {
          room: roomKey,
          headEnd: [],
          roomEnd: []
        });
      }
      const group = groups.get(roomKey);
      if (item.isHeadend) {
        group.headEnd.push(item);
      } else {
        group.roomEnd.push(item);
      }
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      headEnd: group.headEnd.sort((a, b) => a.name.localeCompare(b.name)),
      roomEnd: group.roomEnd.sort((a, b) => a.name.localeCompare(b.name)),
      total: group.headEnd.length + group.roomEnd.length
    }));
  }, [filteredEquipment]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    const installedCount = equipment.filter(e => e.installed).length;
    const orderedCount = equipment.filter(e => e.ordered).length;
    const receivedCount = equipment.filter(e => e.received).length;
    const deliveredCount = equipment.filter(e => e.delivered).length;
    const headEndTotal = equipment.filter(e => e.isHeadend).length;
    const roomEndTotal = equipment.length - headEndTotal;

    publishState({
      view: 'equipment-list',
      projectId: projectId,
      stats: {
        total: equipment.length,
        installed: installedCount,
        ordered: orderedCount,
        received: receivedCount,
        delivered: deliveredCount,
        headEnd: headEndTotal,
        roomEnd: roomEndTotal
      },
      filters: {
        searchQuery: searchQuery,
        selectedRoom: selectedRoom,
        installFilter: installFilter,
        installedFilter: installedFilter
      },
      rooms: rooms,
      filteredCount: filteredEquipment.length,
      visibleEquipment: filteredEquipment.slice(0, 10).map(e => ({
        id: e.id,
        name: e.name,
        partNumber: e.partNumber,
        room: e.room,
        installed: e.installed,
        ordered: e.ordered,
        received: e.received,
        delivered: e.delivered
      })),
      hint: 'Equipment list page for a project. Shows all equipment items grouped by room. Can search, filter by room, filter by head-end/room-end, and filter by installed status.'
    });
  }, [publishState, projectId, equipment, searchQuery, selectedRoom, installFilter, installedFilter, rooms, filteredEquipment]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_equipment: async ({ query }) => {
        if (typeof query === 'string') {
          setSearchQuery(query);
          return { success: true, message: `Searching for "${query}"` };
        }
        return { success: false, error: 'Invalid search query' };
      },
      clear_search: async () => {
        setSearchQuery('');
        return { success: true, message: 'Search cleared' };
      },
      filter_by_room: async ({ roomName }) => {
        if (roomName === 'all' || !roomName) {
          setSelectedRoom('all');
          return { success: true, message: 'Showing all rooms' };
        }
        const matchingRoom = rooms.find(r => r.toLowerCase().includes(roomName.toLowerCase()));
        if (matchingRoom) {
          setSelectedRoom(matchingRoom);
          return { success: true, message: `Filtering by room: ${matchingRoom}` };
        }
        return { success: false, error: `Room "${roomName}" not found. Available rooms: ${rooms.join(', ')}` };
      },
      filter_by_status: async ({ status }) => {
        const validStatuses = ['all', 'installed', 'not_installed'];
        if (validStatuses.includes(status)) {
          setInstalledFilter(status);
          return { success: true, message: `Filtering by status: ${status === 'all' ? 'all statuses' : status}` };
        }
        return { success: false, error: `Invalid status. Use: ${validStatuses.join(', ')}` };
      },
      filter_by_install_side: async ({ side }) => {
        const validSides = ['all', 'head_end', 'room_end'];
        if (validSides.includes(side)) {
          setInstallFilter(side);
          return { success: true, message: `Filtering by: ${side === 'all' ? 'all equipment' : side === 'head_end' ? 'head-end equipment' : 'room-end equipment'}` };
        }
        return { success: false, error: `Invalid side. Use: ${validSides.join(', ')}` };
      },
      import_csv: async () => {
        // This action would typically open an import dialog or navigate to import page
        return { success: false, error: 'CSV import is not available from this view. Please use the project management interface.' };
      },
      generate_po: async () => {
        // Navigate to PO generation
        navigate(`/projects/${projectId}/purchase-orders`);
        return { success: true, message: 'Navigating to purchase orders page' };
      },
      open_equipment_detail: async ({ equipmentName, equipmentId }) => {
        let item = null;
        if (equipmentId) {
          item = equipment.find(e => e.id === equipmentId);
        } else if (equipmentName) {
          item = equipment.find(e =>
            e.name.toLowerCase().includes(equipmentName.toLowerCase()) ||
            (e.partNumber && e.partNumber.toLowerCase().includes(equipmentName.toLowerCase()))
          );
        }
        if (item) {
          setExpandedItems(prev => ({ ...prev, [item.id]: true }));
          // Scroll to the item
          setSearchParams({ highlight: item.id });
          return { success: true, message: `Expanded details for "${item.name}"` };
        }
        return { success: false, error: 'Equipment not found' };
      },
      collapse_all: async () => {
        setExpandedItems({});
        return { success: true, message: 'Collapsed all equipment details' };
      },
      refresh_equipment: async () => {
        await loadEquipment();
        return { success: true, message: 'Equipment list refreshed' };
      },
      list_equipment_summary: async () => {
        const installedCount = equipment.filter(e => e.installed).length;
        const notInstalledCount = equipment.length - installedCount;
        return {
          success: true,
          summary: {
            total: equipment.length,
            installed: installedCount,
            notInstalled: notInstalledCount,
            rooms: rooms.length
          },
          message: `${equipment.length} total items: ${installedCount} installed, ${notInstalledCount} not installed across ${rooms.length} rooms`
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, equipment, rooms, projectId, navigate, loadEquipment, setSearchParams]);

  const toggleStatus = async (equipmentId, field, value) => {
    try {
      // "Ordered" status is read-only and auto-synced with PO system
      if (field === 'ordered') {
        alert('The "Ordered" status is automatically updated when purchase orders are submitted. Use the Order Equipment section to create and submit POs.');
        return;
      }

      // "Received" status is read-only and auto-synced with Parts Receiving system
      if (field === 'received') {
        alert('The "Received" status is automatically updated from the Parts Receiving page. Go to Parts Receiving to mark items as received.');
        return;
      }

      setStatusUpdating(equipmentId);

      if (field === 'delivered') {
        // Pass userId from MSAL auth context for user tracking
        // The user object comes from Microsoft Graph via useAuth() hook
        const validUserId = user?.id && typeof user.id === 'string' && user.id.trim() ? user.id.trim() : null;

        if (!validUserId && value) {
          console.warn('[EquipmentListPage] WARNING: No valid user ID found for delivered tracking!', {
            userExists: !!user,
            userId: user?.id,
            userIdType: typeof user?.id
          });
        }

        const payload = { delivered: value, userId: validUserId };
        const updated = await projectEquipmentService.updateProcurementStatus(equipmentId, payload);

        // Verify the response contains the user tracking fields
        console.log('[EquipmentListPage] Update response:', {
          deliveredConfirmed: updated?.delivered_confirmed,
          deliveredConfirmedBy: updated?.delivered_confirmed_by,
          deliveredConfirmedAt: updated?.delivered_confirmed_at
        });

        setEquipment((prev) =>
          prev.map((item) => (item.id === equipmentId ? { ...mapEquipmentRecord(updated), wireDrops: item.wireDrops } : item))
        );
      } else if (field === 'installed') {
        // Manual installed toggle (for items without wires like lights, battery devices)
        // Ensure user.id is a valid value or null, never empty string
        const validUserId = user?.id && typeof user.id === 'string' && user.id.trim() ? user.id.trim() : null;
        const updates = {
          installed: value,
          installed_at: value ? new Date().toISOString() : null,
          installed_by: value ? validUserId : null
        };

        const { data: updated, error } = await supabase
          .from('project_equipment')
          .update(updates)
          .eq('id', equipmentId)
          .select()
          .single();

        if (error) throw error;

        setEquipment((prev) =>
          prev.map((item) => (item.id === equipmentId ? { ...mapEquipmentRecord(updated), wireDrops: item.wireDrops } : item))
        );
      }
    } catch (err) {
      console.error('Failed to update equipment status:', err);
      alert(err.message || 'Failed to update equipment status');
    } finally {
      setStatusUpdating(null);
    }
  };

  const openHomeKitViewer = useCallback((item) => {
    if (!item.homekitQRUrl) return;
    openPhotoViewer({
      id: item.id,
      url: item.homekitQRUrl,
      sharepoint_drive_id: item.homekitQRDriveId,
      sharepoint_item_id: item.homekitQRItemId,
      file_name: `${item.name} HomeKit QR`
    }, { canEdit: false });
  }, [openPhotoViewer]);

  const openReassignModal = useCallback((item) => {
    setReassignModal({ isOpen: true, equipment: item });
  }, []);

  const closeReassignModal = useCallback(() => {
    setReassignModal({ isOpen: false, equipment: null });
  }, []);

  const handleReassignRoom = useCallback(async (equipmentId, newRoomId) => {
    try {
      const result = await projectEquipmentService.reassignEquipmentRoom(equipmentId, newRoomId, user?.id);
      const newRoomName = result.project_rooms?.name || 'new room';

      // Reload equipment to get fresh data
      await loadEquipment();

      // Show success message
      const message = result.wireDropsUnlinked > 0
        ? `Equipment moved to ${newRoomName}. ${result.wireDropsUnlinked} wire drop link(s) removed.`
        : `Equipment moved to ${newRoomName}`;
      alert(message);
    } catch (error) {
      console.error('Failed to reassign room:', error);
      throw error;
    }
  }, [user?.id, loadEquipment]);

  const renderEquipmentRow = (item) => {
    const isExpanded = expandedItems[item.id];
    const isHighlighted = highlightId === item.id;

    return (
      <div
        key={item.id}
        ref={isHighlighted ? highlightedItemRef : null}
        className={`rounded-xl border text-sm transition ${isHighlighted ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-gray-900' : ''}`}
        style={{
          borderColor: isExpanded || isHighlighted
            ? (mode === 'dark' ? '#7C3AED' : '#A78BFA')
            : (mode === 'dark' ? '#3F3F46' : '#E5E7EB'),
          backgroundColor: isHighlighted
            ? (mode === 'dark' ? '#27272A' : '#F5F3FF')
            : (mode === 'dark' ? '#18181B' : '#F9FAFB')
        }}
      >
        {/* Collapsed Header - Always Visible */}
        <div
          className="px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-xl transition"
          onClick={() => toggleExpanded(item.id)}
        >
          {/* Two-row layout: Name on top, badges below */}
          <div className="flex flex-col gap-2">
            {/* Row 1: Chevron + Full Name */}
            <div className="flex items-start gap-3">
              <button className="flex-shrink-0 text-gray-400 mt-0.5">
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">{item.name}</p>
                {item.partNumber && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.partNumber}</p>
                )}
              </div>
            </div>
            {/* Row 2: Status badges - wrap on small screens */}
            <div className="flex items-center gap-1.5 flex-wrap ml-7">
              {/* Wire drop badge - always visible, greyed when 0 */}
              <span
                className="px-2 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1"
                style={item.wireDrops?.length > 0
                  ? { backgroundColor: mode === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)', color: mode === 'dark' ? '#A78BFA' : '#7C3AED' }
                  : { backgroundColor: mode === 'dark' ? '#27272A' : '#F3F4F6', color: mode === 'dark' ? '#4B5563' : '#9CA3AF' }
                }
              >
                <Cable size={10} />
                {item.wireDrops?.length || 0}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                item.ordered
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-600'
              }`}>
                Ordered
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={item.received
                  ? { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }
                  : { backgroundColor: mode === 'dark' ? '#27272A' : '#F3F4F6', color: mode === 'dark' ? '#4B5563' : '#9CA3AF' }
                }
              >
                Received
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                item.delivered
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-600'
              }`}>
                Delivered
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={item.installed
                  ? { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }
                  : { backgroundColor: mode === 'dark' ? '#27272A' : '#F3F4F6', color: mode === 'dark' ? '#4B5563' : '#9CA3AF' }
                }
              >
                Installed
              </span>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB' }}>
            {/* Equipment Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
              {item.manufacturer && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Manufacturer</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.manufacturer}</p>
                </div>
              )}
              {item.model && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Model</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.model}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500 dark:text-gray-400">Planned Qty</span>
                <p className="font-medium text-gray-900 dark:text-gray-100">{item.plannedQuantity || 1}</p>
              </div>
              {item.quantityOrdered > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Qty Ordered</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.quantityOrdered}</p>
                </div>
              )}
              {item.quantityReceived > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Qty Received</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {item.fullyReceived ? '✓ ' : ''}{item.quantityReceived}/{item.plannedQuantity}
                  </p>
                </div>
              )}
            </div>

            {/* Status Checkboxes with Clickable Dates */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4 p-3 rounded-lg" style={{ backgroundColor: mode === 'dark' ? '#27272A' : '#F3F4F6' }}>
              {/* Ordered - Read-only (auto-synced with PO system) */}
              <div className="flex flex-col gap-1">
                <label className="inline-flex items-center gap-2 cursor-not-allowed" title="Auto-synced with Purchase Orders">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 opacity-75 cursor-not-allowed"
                    checked={item.ordered}
                    readOnly
                    disabled
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-300">Ordered</span>
                </label>
                {item.ordered && item.orderedAt && (
                  <button
                    onClick={() => setDateModal({ isOpen: true, title: 'Ordered', date: item.orderedAt, userId: item.orderedBy, equipmentId: item.id })}
                    className="ml-6 text-left text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <DateField date={item.orderedAt} variant="inline" />
                  </button>
                )}
              </div>

              {/* Received - Read-only (auto-synced with Parts Receiving) */}
              <div className="flex flex-col gap-1">
                <label className="inline-flex items-center gap-2 cursor-not-allowed" title="Auto-synced with Parts Receiving">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 opacity-75 cursor-not-allowed"
                    style={{ accentColor: '#94AF32' }}
                    checked={item.received}
                    readOnly
                    disabled
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-300">Received</span>
                </label>
                {item.received && item.receivedAt && (
                  <button
                    onClick={() => setDateModal({ isOpen: true, title: 'Received', date: item.receivedAt, userId: item.receivedBy, equipmentId: item.id })}
                    className="ml-6 text-left hover:underline"
                    style={{ color: '#94AF32' }}
                  >
                    <DateField date={item.receivedAt} variant="inline" />
                  </button>
                )}
              </div>

              {/* Delivered - Manual toggle for technician to confirm item is at job site */}
              <div className="flex flex-col gap-1">
                <label className="inline-flex items-center gap-2 cursor-pointer" title="Mark as delivered to job site">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                    checked={item.delivered}
                    onChange={(e) => toggleStatus(item.id, 'delivered', e.target.checked)}
                    disabled={statusUpdating === item.id}
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-300">Delivered</span>
                </label>
                {item.delivered && item.deliveredAt && (
                  <button
                    onClick={() => setDateModal({ isOpen: true, title: 'Delivered', date: item.deliveredAt, userId: item.deliveredBy, equipmentId: item.id })}
                    className="ml-6 text-left text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <DateField date={item.deliveredAt} variant="inline" />
                  </button>
                )}
              </div>

              {/* Installed - Auto from wire drop OR manual toggle for items without wire drops */}
              <div className="flex flex-col gap-1">
                <label
                  className={`inline-flex items-center gap-2 ${item.installedViaWireDrop ? 'cursor-default' : 'cursor-pointer'}`}
                  title={item.installedViaWireDrop
                    ? 'Status synced from linked wire drop'
                    : item.wireDrops?.length > 0
                      ? 'Will be marked installed when linked wire drop trim is complete'
                      : 'Mark as installed'}
                >
                  <input
                    type="checkbox"
                    className={`h-4 w-4 rounded border-gray-300 ${item.installedViaWireDrop ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    style={{ accentColor: '#94AF32' }}
                    checked={item.installed}
                    onChange={(e) => toggleStatus(item.id, 'installed', e.target.checked)}
                    disabled={statusUpdating === item.id || item.installedViaWireDrop}
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-300">Installed</span>
                  {item.installedViaWireDrop && (
                    <span className="text-xs" style={{ color: '#94AF32' }}>(via wire drop)</span>
                  )}
                </label>
                {item.installed && item.installedAt && (
                  <button
                    onClick={() => setDateModal({ isOpen: true, title: 'Installed', date: item.installedAt, userId: item.installedBy, equipmentId: item.id })}
                    className="ml-6 text-left hover:underline"
                    style={{ color: '#94AF32' }}
                  >
                    <DateField date={item.installedAt} variant="inline" />
                  </button>
                )}
              </div>
            </div>

            {/* Documentation Links */}
            <div className="flex flex-wrap gap-3 mb-4">
              {/* Schematic Link */}
              {item.schematicUrl ? (
                <a
                  href={item.schematicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
                >
                  <FileText size={14} />
                  <span>Schematic</span>
                  <ExternalLink size={12} />
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-500">
                  <FileText size={14} />
                  <span>No Schematic</span>
                </span>
              )}

              {/* Install Manuals */}
              {item.installManualUrls && item.installManualUrls.length > 0 ? (
                item.installManualUrls.map((url, idx) => (
                  <a
                    key={`install-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  >
                    <BookOpen size={14} />
                    <span>Install Manual{item.installManualUrls.length > 1 ? ` #${idx + 1}` : ''}</span>
                    <ExternalLink size={12} />
                  </a>
                ))
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-gray-500">
                  <BookOpen size={14} />
                  <span>No Install Manual</span>
                </span>
              )}

              {/* Technical Manuals - using brand olive green (#94AF32) */}
              {item.technicalManualUrls && item.technicalManualUrls.length > 0 && (
                item.technicalManualUrls.map((url, idx) => (
                  <a
                    key={`tech-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: mode === 'dark' ? 'rgba(148, 175, 50, 0.2)' : 'rgba(148, 175, 50, 0.15)',
                      color: '#94AF32'
                    }}
                  >
                    <FileText size={14} />
                    <span>Tech Manual{item.technicalManualUrls.length > 1 ? ` #${idx + 1}` : ''}</span>
                    <ExternalLink size={12} />
                  </a>
                ))
              )}

              {/* HomeKit QR */}
              {item.homekitQRUrl && (
                <button
                  onClick={() => openHomeKitViewer(item)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
                >
                  <div className="w-5 h-5 rounded overflow-hidden">
                    <CachedSharePointImage
                      sharePointUrl={item.homekitQRUrl}
                      sharePointDriveId={item.homekitQRDriveId}
                      sharePointItemId={item.homekitQRItemId}
                      displayType="thumbnail"
                      size="small"
                      className="w-full h-full"
                      showFullOnClick={false}
                      objectFit="contain"
                    />
                  </div>
                  <span>HomeKit QR</span>
                </button>
              )}

              {/* Reassign Room Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openReassignModal(item);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <ArrowRightLeft size={14} />
                <span>Reassign Room</span>
              </button>
            </div>

            {/* Notes */}
            {item.notes && (
              <div className="mb-4">
                <span className="text-xs text-gray-500 dark:text-gray-400">Notes</span>
                <p className="text-xs italic text-gray-600 dark:text-gray-300 mt-1">{item.notes}</p>
              </div>
            )}

            {/* Wire Drop Links */}
            {/* Network Information */}
            {(item.unifiMac || item.unifiIp) && (
              <div className="pt-3 border-t" style={{ borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Wifi size={14} className="text-blue-500" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Network Information
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  {item.unifiMac && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">MAC Address</span>
                      <p className="font-mono font-medium text-gray-900 dark:text-gray-100">{item.unifiMac}</p>
                    </div>
                  )}
                  {item.unifiIp && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">IP Address</span>
                      <p className="font-mono font-medium text-gray-900 dark:text-gray-100">{item.unifiIp}</p>
                    </div>
                  )}
                  {item.unifiLastSeen && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Last Seen</span>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        <DateField date={item.unifiLastSeen} variant="inline" />
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Wire Drop Links */}
            {item.wireDrops && item.wireDrops.length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Cable size={14} className="text-violet-500" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Linked Wire Drops
                  </span>
                </div>
                <div className="space-y-1.5">
                  {item.wireDrops.map(wd => (
                    <button
                      key={wd.wireDropId}
                      onClick={() => navigate(`/wire-drops/${wd.wireDropId}`)}
                      className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 hover:underline"
                    >
                      <Cable size={14} />
                      <span className="font-medium">{wd.wireDropName}</span>
                      {wd.wireDropRoom && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">in {wd.wireDropRoom}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {wd.linkSide === 'head_end' ? 'Head End' : 'Room End'}
                      </span>
                      {wd.trimOutCompleted && (
                        <CheckCircle2 size={12} style={{ color: '#94AF32' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Equipment Credentials */}
            <EquipmentCredentialsSection
              equipmentId={item.id}
              projectId={projectId}
              mode={mode}
              user={user}
            />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2"
          style={{ borderColor: palette.accent }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'} pb-20`}>
      <section className="px-4 py-4 space-y-4">
        <div className="rounded-2xl border p-4 shadow-sm" style={cardStyles.mutedCard}>
          <div className="space-y-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, part number, manufacturer, or model"
                className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  backgroundColor: mode === 'dark' ? '#18181B' : '#FFFFFF',
                  borderColor: mode === 'dark' ? '#27272A' : '#E5E7EB',
                  color: cardStyles.textPrimary
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Building size={16} className="text-gray-400" />
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    backgroundColor: mode === 'dark' ? '#18181B' : '#FFFFFF',
                    borderColor: mode === 'dark' ? '#27272A' : '#D1D5DB'
                  }}
                >
                  <option value="all">All Rooms</option>
                  {rooms.map((room) => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Layers size={16} className="text-gray-400" />
                <select
                  value={installFilter}
                  onChange={(e) => setInstallFilter(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    backgroundColor: mode === 'dark' ? '#18181B' : '#FFFFFF',
                    borderColor: mode === 'dark' ? '#27272A' : '#D1D5DB'
                  }}
                >
                  <option value="all">Head &amp; Room Equipment</option>
                  <option value="head_end">Head-End Only</option>
                  <option value="room_end">Room-End Only</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-gray-400" />
                <select
                  value={installedFilter}
                  onChange={(e) => setInstalledFilter(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    backgroundColor: mode === 'dark' ? '#18181B' : '#FFFFFF',
                    borderColor: mode === 'dark' ? '#27272A' : '#D1D5DB'
                  }}
                >
                  <option value="all">All Installation Status</option>
                  <option value="installed">Installed Only</option>
                  <option value="not_installed">Not Installed</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {groupedEquipment.length === 0 ? (
          <div
            className="rounded-2xl border px-6 py-12 text-center text-sm"
            style={cardStyles.card}
          >
            <Package className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">
              No equipment matches your filters.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Try clearing your search or check the Project Manager view to confirm the import.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedEquipment.map((group) => (
              <div key={group.room} className="rounded-2xl border p-4 shadow-sm" style={cardStyles.card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {group.room}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {group.total} item{group.total === 1 ? '' : 's'} •{' '}
                      {group.headEnd.length} head-end / {group.roomEnd.length} room-end
                    </p>
                  </div>
                </div>

                {group.headEnd.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                      Head-End Equipment
                    </p>
                    <div className="space-y-3">
                      {group.headEnd.map((item) => renderEquipmentRow(item))}
                    </div>
                  </div>
                )}

                {group.roomEnd.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                      Room Equipment
                    </p>
                    <div className="space-y-3">
                      {group.roomEnd.map((item) => renderEquipmentRow(item))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Date Detail Modal */}
      <DateDetailModal
        isOpen={dateModal.isOpen}
        onClose={() => setDateModal({ isOpen: false, title: '', date: null, userId: null, equipmentId: null })}
        title={dateModal.title}
        date={dateModal.date}
        userId={dateModal.userId}
        equipmentId={dateModal.equipmentId}
        mode={mode}
        currentUser={user}
      />

      {/* Room Reassignment Modal */}
      <RoomReassignModal
        isOpen={reassignModal.isOpen}
        onClose={closeReassignModal}
        equipment={reassignModal.equipment}
        rooms={projectRooms}
        currentRoomId={reassignModal.equipment?.roomId}
        onConfirm={handleReassignRoom}
        mode={mode}
      />
    </div>
  );
};

export default EquipmentListPage;
