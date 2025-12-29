/**
 * ServicePartsManager.js
 * Parts management for service tickets - add parts, track status, send requests
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  Plus,
  Mail,
  FileText,
  Loader2,
  Trash2,
  Edit,
  X,
  CheckCircle,
  Search,
  Database
} from 'lucide-react';
import { servicePartsService } from '../../services/serviceTicketService';
import { partsService } from '../../services/partsService';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

const PART_STATUSES = {
  needed: { label: 'Needed', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  ordered: { label: 'Ordered', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  received: { label: 'Received', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  delivered: { label: 'Delivered', color: brandColors.success, bg: 'rgba(148, 175, 50, 0.15)' },
  installed: { label: 'Installed', color: brandColors.success, bg: 'rgba(148, 175, 50, 0.25)' },
  cancelled: { label: 'Cancelled', color: '#71717a', bg: 'rgba(113, 113, 122, 0.15)' }
};

const ServicePartsManager = ({ ticket, onUpdate }) => {
  const { user } = useAuth();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState(null);

  // Global parts search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedGlobalPart, setSelectedGlobalPart] = useState(null);
  const searchRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Form state for adding/editing parts
  const [partForm, setPartForm] = useState({
    name: '',
    part_number: '',
    manufacturer: '',
    description: '',
    quantity_needed: 1,
    unit_cost: '',
    notes: ''
  });

  // Search global parts database
  const searchGlobalParts = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      setSearchLoading(true);
      const results = await partsService.list({ search: query });
      setSearchResults(results.slice(0, 10)); // Limit to 10 results
      setShowSearchResults(true);
    } catch (err) {
      console.error('[ServicePartsManager] Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    setSelectedGlobalPart(null);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchGlobalParts(value);
    }, 300);
  }, [searchGlobalParts]);

  // Select a part from search results
  const handleSelectGlobalPart = useCallback((globalPart) => {
    setSelectedGlobalPart(globalPart);
    setSearchQuery(globalPart.name || globalPart.part_number);
    setShowSearchResults(false);

    // Auto-fill the form with global part data
    setPartForm({
      name: globalPart.name || '',
      part_number: globalPart.part_number || '',
      manufacturer: globalPart.manufacturer || '',
      description: globalPart.description || '',
      quantity_needed: 1,
      unit_cost: '', // Don't auto-fill cost - service pricing may differ
      notes: ''
    });
  }, []);

  // Click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load parts
  useEffect(() => {
    const loadParts = async () => {
      if (!ticket?.id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await servicePartsService.getPartsForTicket(ticket.id);
        setParts(data);
      } catch (err) {
        console.error('[ServicePartsManager] Failed to load parts:', err);
        // Check if it's a "table doesn't exist" error
        if (err.message?.includes('does not exist') || err.message?.includes('relation')) {
          setError('Parts system not configured. Please run the database migration.');
        } else {
          setError('Failed to load parts: ' + (err.message || 'Unknown error'));
        }
      } finally {
        setLoading(false);
      }
    };
    loadParts();
  }, [ticket?.id]);

  const resetForm = () => {
    setPartForm({
      name: '',
      part_number: '',
      manufacturer: '',
      description: '',
      quantity_needed: 1,
      unit_cost: '',
      notes: ''
    });
    setSearchQuery('');
    setSearchResults([]);
    setSelectedGlobalPart(null);
    setShowSearchResults(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setEditingPart(null);
    setShowAddPart(true);
  };

  const handleOpenEdit = (part) => {
    setPartForm({
      name: part.name || '',
      part_number: part.part_number || '',
      manufacturer: part.manufacturer || '',
      description: part.description || '',
      quantity_needed: part.quantity_needed || 1,
      unit_cost: part.unit_cost || '',
      notes: part.notes || ''
    });
    setSearchQuery(part.name || '');
    setSelectedGlobalPart(null);
    setShowSearchResults(false);
    setEditingPart(part);
    setShowAddPart(true);
  };

  const handleClose = () => {
    setShowAddPart(false);
    setEditingPart(null);
    resetForm();
  };

  const handleSavePart = async () => {
    if (!partForm.name.trim()) return;

    try {
      setSaving(true);
      setError(null);

      if (editingPart) {
        // Update existing part
        await servicePartsService.updatePart(editingPart.id, {
          name: partForm.name.trim(),
          part_number: partForm.part_number.trim() || null,
          manufacturer: partForm.manufacturer.trim() || null,
          description: partForm.description.trim() || null,
          quantity_needed: parseInt(partForm.quantity_needed) || 1,
          unit_cost: parseFloat(partForm.unit_cost) || 0,
          notes: partForm.notes.trim() || null
        });
      } else {
        // Add new part - include global_part_id if selected from global database
        await servicePartsService.addPart(ticket.id, {
          global_part_id: selectedGlobalPart?.id || null,
          name: partForm.name.trim(),
          part_number: partForm.part_number.trim() || null,
          manufacturer: partForm.manufacturer.trim() || null,
          description: partForm.description.trim() || null,
          quantity_needed: parseInt(partForm.quantity_needed) || 1,
          unit_cost: parseFloat(partForm.unit_cost) || 0,
          notes: partForm.notes.trim() || null,
          added_by: user?.id,
          added_by_name: user?.name || user?.email || 'User'
        });
      }

      // Refresh parts list
      const data = await servicePartsService.getPartsForTicket(ticket.id);
      setParts(data);
      handleClose();

      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServicePartsManager] Failed to save part:', err);
      // Check if it's a "table doesn't exist" error
      if (err.message?.includes('does not exist') || err.message?.includes('relation')) {
        setError('Parts system not configured. Please run the database migration.');
      } else {
        setError('Failed to save part: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePart = async (partId) => {
    if (!window.confirm('Are you sure you want to remove this part?')) return;

    try {
      setSaving(true);
      await servicePartsService.removePart(partId);
      setParts(prev => prev.filter(p => p.id !== partId));
    } catch (err) {
      console.error('[ServicePartsManager] Failed to delete part:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (partId, newStatus) => {
    try {
      setSaving(true);
      await servicePartsService.updatePartStatus(partId, newStatus);
      setParts(prev => prev.map(p => p.id === partId ? { ...p, status: newStatus } : p));
    } catch (err) {
      console.error('[ServicePartsManager] Failed to update part status:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendPartsRequest = async () => {
    const neededParts = parts.filter(p => p.status === 'needed');
    if (neededParts.length === 0) {
      alert('No parts with "needed" status to request.');
      return;
    }

    try {
      setSendingEmail(true);
      const response = await fetch('/api/service-parts-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber: ticket.ticket_number,
          ticketTitle: ticket.title,
          customerName: ticket.customer_name,
          customerAddress: ticket.customer_address,
          parts: neededParts.map(p => ({
            name: p.name,
            part_number: p.part_number,
            manufacturer: p.manufacturer,
            quantity_needed: p.quantity_needed,
            notes: p.notes
          })),
          notes: ticket.triage_notes,
          requestedBy: user?.name || user?.email,
          requestedByEmail: user?.email,
          urgency: ticket.priority === 'urgent' ? 'urgent' : ticket.priority === 'high' ? 'high' : 'normal'
        })
      });

      if (response.ok) {
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 3000);
      } else {
        const data = await response.json();
        console.error('[ServicePartsManager] Email failed:', data);
        alert('Failed to send parts request. Please try again.');
      }
    } catch (err) {
      console.error('[ServicePartsManager] Email error:', err);
      alert('Failed to send parts request. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  };

  const neededCount = parts.filter(p => p.status === 'needed').length;
  const totalCost = parts.reduce((sum, p) => sum + ((p.unit_cost || 0) * (p.quantity_needed || 1)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading parts...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            {parts.length} part{parts.length !== 1 ? 's' : ''}
          </span>
          {neededCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: PART_STATUSES.needed.bg, color: PART_STATUSES.needed.color }}
            >
              {neededCount} needed
            </span>
          )}
          {totalCost > 0 && (
            <span className="text-zinc-400">
              Est. ${totalCost.toFixed(2)}
            </span>
          )}
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors hover:bg-zinc-700"
          style={{ color: brandColors.success }}
        >
          <Plus size={16} />
          Add Part
        </button>
      </div>

      {/* Parts List */}
      {parts.length > 0 ? (
        <div className="space-y-2">
          {parts.map(part => (
            <div
              key={part.id}
              className="p-3 bg-zinc-700/50 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white">{part.name}</span>
                    {part.part_number && (
                      <span className="text-xs text-zinc-400 font-mono">#{part.part_number}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>Qty: {part.quantity_needed}</span>
                    {part.manufacturer && <span>{part.manufacturer}</span>}
                    {part.unit_cost > 0 && <span>${part.unit_cost.toFixed(2)} ea</span>}
                  </div>
                  {part.notes && (
                    <p className="text-xs text-zinc-500 mt-1 italic">{part.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Status dropdown */}
                  <select
                    value={part.status}
                    onChange={(e) => handleUpdateStatus(part.id, e.target.value)}
                    disabled={saving}
                    className="text-xs px-2 py-1 rounded border-0 focus:ring-1 focus:ring-zinc-500"
                    style={{
                      backgroundColor: PART_STATUSES[part.status]?.bg || PART_STATUSES.needed.bg,
                      color: PART_STATUSES[part.status]?.color || PART_STATUSES.needed.color
                    }}
                  >
                    {Object.entries(PART_STATUSES).map(([status, { label }]) => (
                      <option key={status} value={status}>{label}</option>
                    ))}
                  </select>
                  {/* Edit/Delete */}
                  <button
                    onClick={() => handleOpenEdit(part)}
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-600 rounded transition-colors"
                    title="Edit part"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => handleDeletePart(part.id)}
                    disabled={saving}
                    className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50"
                    title="Remove part"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-500">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p>No parts added yet</p>
          <button
            onClick={handleOpenAdd}
            className="text-sm mt-2 hover:underline"
            style={{ color: brandColors.success }}
          >
            Add a part
          </button>
        </div>
      )}

      {/* Action Buttons */}
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-700">
          <button
            onClick={handleSendPartsRequest}
            disabled={sendingEmail || neededCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingEmail ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending...
              </>
            ) : emailSent ? (
              <>
                <CheckCircle size={16} style={{ color: brandColors.success }} />
                Sent!
              </>
            ) : (
              <>
                <Mail size={16} />
                Email Parts Request
              </>
            )}
          </button>
          {ticket?.proposal_needed && (
            <button
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white text-sm transition-colors"
            >
              <FileText size={16} />
              Create Proposal
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Part Modal */}
      {showAddPart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">
                {editingPart ? 'Edit Part' : 'Add Part'}
              </h3>
              <button
                onClick={handleClose}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Search Global Parts - only show for new parts */}
              {!editingPart && (
                <div ref={searchRef} className="relative">
                  <label className="text-sm text-zinc-400 mb-1 block flex items-center gap-2">
                    <Database size={14} />
                    Search Parts Database
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
                      placeholder="Search by name, part number, or manufacturer..."
                      className="w-full pl-9 pr-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                      autoFocus
                    />
                    {searchLoading && (
                      <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" />
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {showSearchResults && (
                    <div className="absolute z-10 w-full mt-1 bg-zinc-700 border border-zinc-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.length > 0 ? (
                        <>
                          {searchResults.map((part) => (
                            <button
                              key={part.id}
                              onClick={() => handleSelectGlobalPart(part)}
                              className="w-full px-3 py-2 text-left hover:bg-zinc-600 transition-colors border-b border-zinc-600 last:border-0"
                            >
                              <div className="font-medium text-white text-sm">
                                {part.name || part.part_number}
                              </div>
                              <div className="text-xs text-zinc-400 flex items-center gap-2">
                                {part.part_number && <span className="font-mono">#{part.part_number}</span>}
                                {part.manufacturer && <span>{part.manufacturer}</span>}
                                {part.model && <span className="text-zinc-500">{part.model}</span>}
                              </div>
                            </button>
                          ))}
                          {/* Option to add new part */}
                          <button
                            onClick={() => {
                              setShowSearchResults(false);
                              setPartForm(prev => ({ ...prev, name: searchQuery }));
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-600 transition-colors flex items-center gap-2 text-sm"
                            style={{ color: brandColors.success }}
                          >
                            <Plus size={14} />
                            Add "{searchQuery}" as new part
                          </button>
                        </>
                      ) : searchQuery.length >= 2 && !searchLoading ? (
                        <div className="p-3">
                          <p className="text-sm text-zinc-400 mb-2">No parts found matching "{searchQuery}"</p>
                          <button
                            onClick={() => {
                              setShowSearchResults(false);
                              setPartForm(prev => ({ ...prev, name: searchQuery }));
                            }}
                            className="flex items-center gap-2 text-sm"
                            style={{ color: brandColors.success }}
                          >
                            <Plus size={14} />
                            Add as new part
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Selected Part Indicator */}
                  {selectedGlobalPart && (
                    <div className="mt-2 p-2 bg-zinc-700/50 rounded-lg flex items-center gap-2">
                      <CheckCircle size={16} style={{ color: brandColors.success }} />
                      <span className="text-sm text-zinc-300">
                        Selected: <span className="text-white font-medium">{selectedGlobalPart.name}</span>
                        {selectedGlobalPart.part_number && (
                          <span className="text-zinc-400 ml-1">#{selectedGlobalPart.part_number}</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Part Name - editable if not from global database */}
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Part Name *</label>
                <input
                  type="text"
                  value={partForm.name}
                  onChange={(e) => setPartForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Crestron MC4-R"
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Part Number</label>
                  <input
                    type="text"
                    value={partForm.part_number}
                    onChange={(e) => setPartForm(prev => ({ ...prev, part_number: e.target.value }))}
                    placeholder="e.g., 6511590"
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Manufacturer</label>
                  <input
                    type="text"
                    value={partForm.manufacturer}
                    onChange={(e) => setPartForm(prev => ({ ...prev, manufacturer: e.target.value }))}
                    placeholder="e.g., Crestron"
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Quantity</label>
                  <input
                    type="number"
                    value={partForm.quantity_needed}
                    onChange={(e) => setPartForm(prev => ({ ...prev, quantity_needed: e.target.value }))}
                    min="1"
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Unit Cost ($)</label>
                  <input
                    type="number"
                    value={partForm.unit_cost}
                    onChange={(e) => setPartForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Notes</label>
                <textarea
                  value={partForm.notes}
                  onChange={(e) => setPartForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any additional notes about this part..."
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
            </div>
            <div className="p-4 border-t border-zinc-700 flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePart}
                disabled={!partForm.name.trim() || saving}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: brandColors.success, color: '#000' }}
              >
                {saving ? 'Saving...' : (editingPart ? 'Update Part' : 'Add Part')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePartsManager;
