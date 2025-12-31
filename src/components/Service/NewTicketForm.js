/**
 * NewTicketForm.js
 * Form for creating new service tickets with customer lookup
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Building,
  X,
  Check,
  Loader2
} from 'lucide-react';
import { serviceTicketService, customerLookupService } from '../../services/serviceTicketService';
import { useAppState } from '../../contexts/AppStateContext';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';
import { supabase } from '../../lib/supabase';

// Default categories (fallback if DB not available)
const DEFAULT_CATEGORIES = [
  { value: 'network', label: 'Network', description: 'WiFi, internet, UniFi issues' },
  { value: 'av', label: 'A/V', description: 'Audio/video, TV, speakers' },
  { value: 'shades', label: 'Shades', description: 'Window treatments, Lutron' },
  { value: 'control', label: 'Control', description: 'Control4, automation' },
  { value: 'wiring', label: 'Wiring', description: 'Cable, connectivity issues' },
  { value: 'installation', label: 'Installation', description: 'New installation requests' },
  { value: 'maintenance', label: 'Maintenance', description: 'Scheduled maintenance' },
  { value: 'general', label: 'General', description: 'Other issues' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low', description: 'No rush, when convenient', color: 'bg-zinc-500' },
  { value: 'medium', label: 'Medium', description: 'Normal priority', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', description: 'Needs attention soon', color: 'bg-orange-500' },
  { value: 'urgent', label: 'Urgent', description: 'Critical, immediate attention', color: 'bg-red-500' }
];

const NewTicketForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { publishState, setView } = useAppState();

  // Pre-fill from navigation state (e.g., from AI action)
  const prefill = location.state || {};

  const [form, setForm] = useState({
    title: prefill.title || '',
    description: prefill.description || '',
    category: prefill.category || 'general',
    priority: prefill.priority || 'medium',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    contact_id: null,
    project_id: null
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    setView('service-new-ticket');
    publishState({ view: 'service-new-ticket' });
  }, [setView, publishState]);

  // Load technology categories from database
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('technology_categories')
          .select('name, label, description')
          .eq('is_active', true)
          .order('sort_order');

        if (!error && data?.length > 0) {
          setCategories(data.map(c => ({
            value: c.name,
            label: c.label,
            description: c.description || ''
          })));
        }
      } catch (err) {
        console.log('[NewTicketForm] Using default categories');
      }
    };
    loadCategories();
  }, []);

  // Search for contacts
  const handleSearch = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const results = await customerLookupService.search(query);
      setSearchResults(results);
    } catch (err) {
      console.error('[NewTicketForm] Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const selectContact = (contact) => {
    setSelectedContact(contact);
    setForm(prev => ({
      ...prev,
      contact_id: contact.id,
      customer_name: contact.full_name || '',
      customer_phone: contact.phone || '',
      customer_email: contact.email || ''
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  const clearContact = () => {
    setSelectedContact(null);
    setForm(prev => ({
      ...prev,
      contact_id: null,
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_address: ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const ticketData = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim() || null,
        customer_name: form.customer_name.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_address: form.customer_address.trim() || null,
        source: 'manual',
        created_by: user?.id
      };

      const ticket = await serviceTicketService.create(ticketData);
      navigate(`/service/tickets/${ticket.id}`);
    } catch (err) {
      console.error('[NewTicketForm] Failed to create ticket:', err);
      setError(err.message || 'Failed to create ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-6 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/service/tickets')}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">New Service Ticket</h1>
            <p className="text-sm text-zinc-400">Create a new support ticket</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Section */}
          <div className="bg-zinc-800 rounded-lg p-4">
            <h2 className="font-semibold text-white mb-4">Customer</h2>

            {selectedContact ? (
              <div className="p-3 bg-zinc-700/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-white">
                      <User size={16} />
                      {selectedContact.full_name}
                    </div>
                    {selectedContact.phone && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Phone size={14} />
                        {selectedContact.phone}
                      </div>
                    )}
                    {selectedContact.email && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Mail size={14} />
                        {selectedContact.email}
                      </div>
                    )}
                    {selectedContact.company && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Building size={14} />
                        {selectedContact.company}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearContact}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Contact Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search existing contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" size={18} />
                  )}

                  {/* Search Results Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-700 border border-zinc-600 rounded-lg shadow-lg overflow-hidden z-10">
                      {searchResults.map(contact => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => selectContact(contact)}
                          className="w-full p-3 text-left hover:bg-zinc-600 transition-colors"
                        >
                          <div className="text-white">{contact.full_name}</div>
                          <div className="text-sm text-zinc-400">
                            {contact.phone && <span className="mr-3">{contact.phone}</span>}
                            {contact.email && <span>{contact.email}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-sm text-zinc-500 mb-4">Or enter customer details manually:</p>

                {/* Manual Entry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Name</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => setForm(prev => ({ ...prev, customer_name: e.target.value }))}
                      placeholder="Customer name"
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Phone</label>
                    <input
                      type="tel"
                      value={form.customer_phone}
                      onChange={(e) => setForm(prev => ({ ...prev, customer_phone: e.target.value }))}
                      placeholder="Phone number"
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Email</label>
                    <input
                      type="email"
                      value={form.customer_email}
                      onChange={(e) => setForm(prev => ({ ...prev, customer_email: e.target.value }))}
                      placeholder="Email address"
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1 block">Address</label>
                    <input
                      type="text"
                      value={form.customer_address}
                      onChange={(e) => setForm(prev => ({ ...prev, customer_address: e.target.value }))}
                      placeholder="Service address"
                      className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Ticket Details */}
          <div className="bg-zinc-800 rounded-lg p-4">
            <h2 className="font-semibold text-white mb-4">Ticket Details</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the issue"
                  required
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  placeholder="Detailed description of the problem..."
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Category</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, category: cat.value }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        form.category === cat.value
                          ? 'border-zinc-500 bg-zinc-700'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-white text-sm font-medium">{cat.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{cat.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Priority</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PRIORITIES.map(pri => (
                    <button
                      key={pri.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, priority: pri.value }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        form.priority === pri.value
                          ? 'border-zinc-500 bg-zinc-700'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${pri.color}`} />
                        <span className="text-white text-sm font-medium">{pri.label}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{pri.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate('/service/tickets')}
              className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="flex-1 px-4 py-3 rounded-lg font-medium disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
              style={{ backgroundColor: brandColors.success, color: '#000' }}
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Create Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewTicketForm;
