import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  Wifi,
  Eye,
  EyeOff,
  Key,
  ChevronRight,
  X,
  Check,
  AlertCircle,
  Copy,
  Server
} from 'lucide-react';
import {
  equipmentService,
  equipmentCategoriesService,
  secureDataService
} from '../services/equipmentService';

const withAlpha = (hex, alpha) => {
  if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
  const fullHex = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const EquipmentManager = ({ projectId, onClose }) => {
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  
  const [equipment, setEquipment] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [credentials, setCredentials] = useState([]);
  
  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';
    const subtleText = mode === 'dark' ? '#71717A' : '#6B7280';

    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '1rem',
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '0.75rem',
        color: textPrimary
      },
      badge: {
        backgroundColor: mode === 'dark' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(129, 140, 248, 0.18)',
        color: mode === 'dark' ? '#E0E7FF' : '#4338CA'
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      }
    };
  }, [mode]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [equipmentData, categoriesData] = await Promise.all([
        equipmentService.getForProject(projectId),
        equipmentCategoriesService.getAll()
      ]);
      setEquipment(equipmentData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load equipment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async (equipmentId) => {
    try {
      const data = await secureDataService.getForEquipment(equipmentId);
      setCredentials(data);
    } catch (error) {
      console.error('Failed to load credentials:', error);
      setCredentials([]);
    }
  };

  const filteredEquipment = useMemo(() => {
    let filtered = equipment;
    
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.uid.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        (item.location && item.location.toLowerCase().includes(query)) ||
        (item.ip_address && item.ip_address.includes(query))
      );
    }
    
    return filtered;
  }, [equipment, selectedCategory, searchQuery]);

  const handleAddEquipment = () => {
    setEditingEquipment(null);
    setShowAddModal(true);
  };

  const handleEditEquipment = (item) => {
    setEditingEquipment(item);
    setShowAddModal(true);
  };

  const handleDeleteEquipment = async (item) => {
    if (!window.confirm(`Delete ${item.name}? This will also delete all associated credentials.`)) {
      return;
    }
    
    try {
      await equipmentService.delete(item.id);
      setEquipment(prev => prev.filter(e => e.id !== item.id));
    } catch (error) {
      console.error('Failed to delete equipment:', error);
      alert('Failed to delete equipment');
    }
  };

  const handleViewCredentials = async (item) => {
    setSelectedEquipment(item);
    await loadCredentials(item.id);
    setShowCredentialsModal(true);
  };

  const handleCopyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
    alert(`${label} copied to clipboard`);
  };

  const EquipmentFormModal = ({ equipment: editItem, onClose, onSave }) => {
    const [formData, setFormData] = useState({
      uid: editItem?.uid || '',
      name: editItem?.name || '',
      category: editItem?.category || '',
      manufacturer: editItem?.manufacturer || '',
      model: editItem?.model || '',
      serial_number: editItem?.serial_number || '',
      location: editItem?.location || '',
      ip_address: editItem?.ip_address || '',
      mac_address: editItem?.mac_address || '',
      notes: editItem?.notes || '',
      status: editItem?.status || 'active'
    });
    const [saving, setSaving] = useState(false);
    const [generatingUID, setGeneratingUID] = useState(false);

    const handleGenerateUID = async () => {
      setGeneratingUID(true);
      try {
        const uid = await equipmentService.generateUID(projectId);
        setFormData(prev => ({ ...prev, uid }));
      } catch (error) {
        console.error('Failed to generate UID:', error);
      } finally {
        setGeneratingUID(false);
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (!formData.uid || !formData.name) {
        alert('Please provide both UID and Name');
        return;
      }
      
      setSaving(true);
      try {
        let result;
        if (editItem) {
          result = await equipmentService.update(editItem.id, formData);
          setEquipment(prev => prev.map(e => e.id === editItem.id ? result : e));
        } else {
          result = await equipmentService.create({
            ...formData,
            project_id: projectId
          });
          setEquipment(prev => [...prev, result]);
        }
        onClose();
      } catch (error) {
        console.error('Failed to save equipment:', error);
        alert('Failed to save equipment');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-2xl border overflow-hidden" style={styles.card}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>
              {editItem ? 'Edit Equipment' : 'Add Equipment'}
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: palette.textSecondary }}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>UID *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.uid}
                    onChange={(e) => setFormData(prev => ({ ...prev, uid: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    required
                  />
                  {!editItem && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleGenerateUID}
                      loading={generatingUID}
                    >
                      Generate
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Manufacturer</label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Model</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Serial Number</label>
                <input
                  type="text"
                  value={formData.serial_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, serial_number: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>IP Address</label>
                <input
                  type="text"
                  value={formData.ip_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, ip_address: e.target.value }))}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>MAC Address</label>
                <input
                  type="text"
                  value={formData.mac_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, mac_address: e.target.value }))}
                  placeholder="00:11:22:33:44:55"
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="removed">Removed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 rounded-xl transition-colors border"
                style={{ backgroundColor: styles.card.backgroundColor, borderColor: styles.card.borderColor, color: styles.textPrimary.color }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 px-4 rounded-xl text-white transition-colors disabled:opacity-60"
                style={{ background: palette.accent }}
              >
                {saving ? 'Saving...' : (editItem ? 'Update' : 'Add')} Equipment
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const CredentialsModal = ({ equipment, credentials, onClose }) => {
    const [showPasswords, setShowPasswords] = useState({});
    
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-3xl rounded-2xl border overflow-hidden" style={styles.card}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
            <div>
              <h2 className="text-xl font-semibold" style={styles.textPrimary}>
                Secure Data for {equipment.name}
              </h2>
              <p className="text-sm mt-1" style={styles.textSecondary}>
                UID: {equipment.uid} • IP: {equipment.ip_address || 'N/A'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: palette.textSecondary }}>
              <X size={20} />
            </button>
          </div>

          <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
            {credentials.length === 0 ? (
              <div className="text-center py-8">
                <Key size={48} className="mx-auto mb-3" style={styles.textSecondary} />
                <p style={styles.textSecondary}>No credentials stored for this equipment</p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => {/* Open add credential modal */}}
                  className="mt-4"
                >
                  Add Credentials
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {credentials.map((cred) => (
                  <div key={cred.id} className="p-4 rounded-xl border" style={styles.mutedCard}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium" style={styles.textPrimary}>{cred.name}</h4>
                        <span className="text-xs px-2 py-1 rounded-full inline-block mt-1" style={styles.badge}>
                          {cred.data_type}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowPasswords(prev => ({ ...prev, [cred.id]: !prev[cred.id] }))}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: palette.textSecondary }}
                      >
                        {showPasswords[cred.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      {cred.username && (
                        <div className="flex items-center justify-between">
                          <span style={styles.textSecondary}>Username:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono" style={styles.textPrimary}>{cred.username}</span>
                            <button
                              onClick={() => handleCopyToClipboard(cred.username, 'Username')}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {cred.password && (
                        <div className="flex items-center justify-between">
                          <span style={styles.textSecondary}>Password:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono" style={styles.textPrimary}>
                              {showPasswords[cred.id] ? cred.password : '••••••••'}
                            </span>
                            <button
                              onClick={() => handleCopyToClipboard(cred.password, 'Password')}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {cred.url && (
                        <div className="flex items-center justify-between">
                          <span style={styles.textSecondary}>URL:</span>
                          <a
                            href={cred.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {cred.url}
                          </a>
                        </div>
                      )}
                      
                      {cred.notes && (
                        <div>
                          <span style={styles.textSecondary}>Notes:</span>
                          <p className="mt-1" style={styles.textPrimary}>{cred.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-2xl border overflow-hidden" style={styles.card}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
          <div className="flex items-center gap-3">
            <Package size={24} style={{ color: palette.accent }} />
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>Equipment Management</h2>
            <span className="px-2 py-0.5 text-xs rounded-full" style={styles.badge}>
              {equipment.length} items
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: palette.textSecondary }}>
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-3" style={styles.textSecondary} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by UID, name, location, or IP..."
                className="w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              />
            </div>
            
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            
            <Button variant="primary" icon={Plus} onClick={handleAddEquipment}>
              Add Equipment
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto" />
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="text-center py-8">
              <Server size={48} className="mx-auto mb-3" style={styles.textSecondary} />
              <p style={styles.textSecondary}>
                {searchQuery || selectedCategory !== 'all' ? 'No equipment matches your filters' : 'No equipment added yet'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredEquipment.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border hover:shadow-md transition-shadow" style={styles.mutedCard}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full font-semibold" style={styles.badge}>
                          {item.uid}
                        </span>
                        {item.ip_address && (
                          <Wifi size={14} style={{ color: palette.success }} />
                        )}
                      </div>
                      <h4 className="font-semibold mt-2" style={styles.textPrimary}>{item.name}</h4>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      item.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-sm mb-3" style={styles.textSecondary}>
                    {item.category && <p>Category: {item.category}</p>}
                    {item.location && <p>Location: {item.location}</p>}
                    {item.ip_address && <p>IP: {item.ip_address}</p>}
                    {item.manufacturer && <p>{item.manufacturer} {item.model || ''}</p>}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewCredentials(item)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: withAlpha(palette.accent, 0.1), color: palette.accent }}
                    >
                      <Key size={14} className="inline mr-1" />
                      Credentials
                    </button>
                    <button
                      onClick={() => handleEditEquipment(item)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                      style={styles.textSecondary}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipment(item)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-100 dark:hover:bg-red-900"
                      style={{ color: palette.danger }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <EquipmentFormModal
          equipment={editingEquipment}
          onClose={() => {
            setShowAddModal(false);
            setEditingEquipment(null);
          }}
          onSave={loadData}
        />
      )}

      {showCredentialsModal && selectedEquipment && (
        <CredentialsModal
          equipment={selectedEquipment}
          credentials={credentials}
          onClose={() => {
            setShowCredentialsModal(false);
            setSelectedEquipment(null);
            setCredentials([]);
          }}
        />
      )}
    </div>
  );
};

export default EquipmentManager;
