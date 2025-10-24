import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Key,
  Link,
  X,
  Copy,
  Globe,
  Server,
  AlertCircle,
  Clock
} from 'lucide-react';
import {
  secureDataService,
  equipmentService
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

const SecureDataManager = ({ projectId, onClose }) => {
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  
  const [secureData, setSecureData] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  
  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#1F2937' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#111827' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#111827';
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
      dangerBadge: {
        backgroundColor: withAlpha(palette.danger, 0.18),
        color: palette.danger
      },
      warningBadge: {
        backgroundColor: withAlpha(palette.warning, 0.18),
        color: palette.warning
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
  }, [mode, palette]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [secureDataList, equipmentList] = await Promise.all([
        secureDataService.getForProject(projectId),
        equipmentService.getForProject(projectId)
      ]);
      setSecureData(secureDataList);
      setEquipment(equipmentList);
    } catch (error) {
      console.error('Failed to load secure data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    let filtered = secureData;
    
    if (selectedType && selectedType !== 'all') {
      filtered = filtered.filter(item => item.data_type === selectedType);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        (item.username && item.username.toLowerCase().includes(query)) ||
        (item.equipment?.name && item.equipment.name.toLowerCase().includes(query)) ||
        (item.notes && item.notes.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [secureData, selectedType, searchQuery]);

  const handleAddSecureData = () => {
    setEditingData(null);
    setShowAddModal(true);
  };

  const handleEditSecureData = (item) => {
    setEditingData(item);
    setShowAddModal(true);
  };

  const handleDeleteSecureData = async (item) => {
    if (!window.confirm(`Delete ${item.name}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await secureDataService.delete(item.id);
      setSecureData(prev => prev.filter(d => d.id !== item.id));
    } catch (error) {
      console.error('Failed to delete secure data:', error);
      alert('Failed to delete secure data');
    }
  };

  const handleCopyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard`);
  };

  const togglePasswordVisibility = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'credentials': return <Key size={16} />;
      case 'network': return <Server size={16} />;
      case 'api_key': return <Globe size={16} />;
      case 'certificate': return <Shield size={16} />;
      default: return <Shield size={16} />;
    }
  };

  const SecureDataFormModal = ({ data: editItem, equipment, onClose, onSave }) => {
    const [formData, setFormData] = useState({
      name: editItem?.name || '',
      data_type: editItem?.data_type || 'credentials',
      username: editItem?.username || '',
      password: editItem?.password || '',
      url: editItem?.url || '',
      ip_address: editItem?.ip_address || '',
      port: editItem?.port || '',
      equipment_id: editItem?.equipment_id || '',
      notes: editItem?.notes || ''
    });
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [equipmentSearch, setEquipmentSearch] = useState('');
    const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
    
    // Filter equipment based on search
    const filteredEquipment = useMemo(() => {
      if (!equipmentSearch) return equipment;
      const query = equipmentSearch.toLowerCase();
      return equipment.filter(eq =>
        eq.uid.toLowerCase().includes(query) ||
        eq.name.toLowerCase().includes(query) ||
        (eq.model && eq.model.toLowerCase().includes(query))
      );
    }, [equipmentSearch]);
    
    // Get selected equipment display text
    const selectedEquipment = useMemo(() => {
      if (!formData.equipment_id) return null;
      return equipment.find(eq => eq.id === formData.equipment_id);
    }, [formData.equipment_id]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (!formData.name) {
        alert('Please provide a name');
        return;
      }
      
      setSaving(true);
      try {
        let result;
        const dataToSave = {
          ...formData,
          project_id: projectId,
          equipment_id: formData.equipment_id || null,
          port: formData.port ? parseInt(formData.port) : null
        };
        
        if (editItem) {
          result = await secureDataService.update(editItem.id, dataToSave);
          setSecureData(prev => prev.map(d => d.id === editItem.id ? result : d));
        } else {
          result = await secureDataService.create(dataToSave);
          setSecureData(prev => [...prev, result]);
        }
        onClose();
      } catch (error) {
        console.error('Failed to save secure data:', error);
        alert('Failed to save secure data');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-2xl border overflow-hidden" style={styles.card}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
            <div className="flex items-center gap-2">
              <Shield size={20} style={{ color: palette.danger }} />
              <h2 className="text-xl font-semibold" style={styles.textPrimary}>
                {editItem ? 'Edit Secure Data' : 'Add Secure Data'}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={{ color: palette.textSecondary }}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 dark:text-red-400 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  This data is sensitive. Ensure you're on a secure connection and only share credentials with authorized personnel.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Admin Panel Login, SSH Access"
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Type</label>
                <select
                  value={formData.data_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, data_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="credentials">Credentials</option>
                  <option value="network">Network</option>
                  <option value="api_key">API Key</option>
                  <option value="certificate">Certificate</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Link to Equipment</label>
                <div className="relative">
                  <div
                    className="w-full px-3 py-2 rounded-xl border focus-within:ring-2 focus-within:ring-violet-400 cursor-pointer flex items-center justify-between"
                    style={styles.input}
                    onClick={() => setShowEquipmentDropdown(!showEquipmentDropdown)}
                  >
                    <span>
                      {selectedEquipment ? `${selectedEquipment.uid} - ${selectedEquipment.name}` : 'Not linked'}
                    </span>
                    <Search size={16} style={styles.textSecondary} />
                  </div>
                  
                  {showEquipmentDropdown && (
                    <div 
                      className="absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-lg z-10 max-h-64 overflow-hidden"
                      style={styles.card}
                    >
                      <div className="p-2 border-b" style={{ borderColor: styles.card.borderColor }}>
                        <input
                          type="text"
                          value={equipmentSearch}
                          onChange={(e) => setEquipmentSearch(e.target.value)}
                          placeholder="Search equipment..."
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        <div
                          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, equipment_id: '' }));
                            setShowEquipmentDropdown(false);
                            setEquipmentSearch('');
                          }}
                        >
                          <span style={styles.textSecondary}>Not linked</span>
                        </div>
                        {filteredEquipment.length === 0 ? (
                          <div className="px-3 py-2" style={styles.textSecondary}>
                            No equipment found
                          </div>
                        ) : (
                          filteredEquipment.map(eq => (
                            <div
                              key={eq.id}
                              className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, equipment_id: eq.id }));
                                setShowEquipmentDropdown(false);
                                setEquipmentSearch('');
                              }}
                            >
                              <div style={styles.textPrimary}>{eq.uid} - {eq.name}</div>
                              {eq.model && (
                                <div className="text-xs" style={styles.textSecondary}>
                                  {eq.model}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full pr-10 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-2 p-1 rounded-lg transition-colors"
                    style={{ color: palette.textSecondary }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>URL / Web Interface</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com/admin"
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
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Port</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="22, 3389, etc."
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="Additional information, special instructions, etc."
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
                {saving ? 'Saving...' : (editItem ? 'Update' : 'Add')} Secure Data
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-2xl border overflow-hidden" style={styles.card}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
          <div className="flex items-center gap-3">
            <Shield size={24} style={{ color: palette.danger }} />
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>Secure Data Management</h2>
            <span className="px-2 py-0.5 text-xs rounded-full" style={styles.dangerBadge}>
              {secureData.length} entries
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
                placeholder="Search credentials, equipment, notes..."
                className="w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              />
            </div>
            
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
            >
              <option value="all">All Types</option>
              <option value="credentials">Credentials</option>
              <option value="network">Network</option>
              <option value="api_key">API Keys</option>
              <option value="certificate">Certificates</option>
              <option value="other">Other</option>
            </select>
            
            <Button variant="primary" icon={Plus} onClick={handleAddSecureData}>
              Add Secure Data
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8">
              <Shield size={48} className="mx-auto mb-3" style={styles.textSecondary} />
              <p style={styles.textSecondary}>
                {searchQuery || selectedType !== 'all' ? 'No data matches your filters' : 'No secure data stored yet'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
              {filteredData.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border hover:shadow-md transition-shadow" style={styles.mutedCard}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: withAlpha(palette.danger, 0.1) }}>
                        {getTypeIcon(item.data_type)}
                      </div>
                      <div>
                        <h4 className="font-semibold" style={styles.textPrimary}>{item.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={styles.badge}>
                            {item.data_type}
                          </span>
                          {item.equipment && (
                            <span className="text-xs flex items-center gap-1" style={styles.textSecondary}>
                              <Link size={12} />
                              {item.equipment.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePasswordVisibility(item.id)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: palette.textSecondary }}
                    >
                      {showPasswords[item.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  
                  <div className="space-y-2 text-sm mb-3">
                    {item.username && (
                      <div className="flex items-center justify-between">
                        <span style={styles.textSecondary}>Username:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={styles.textPrimary}>{item.username}</span>
                          <button
                            onClick={() => handleCopyToClipboard(item.username, 'Username')}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {item.password && (
                      <div className="flex items-center justify-between">
                        <span style={styles.textSecondary}>Password:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono" style={styles.textPrimary}>
                            {showPasswords[item.id] ? item.password : '••••••••'}
                          </span>
                          <button
                            onClick={() => handleCopyToClipboard(item.password, 'Password')}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {item.url && (
                      <div className="flex items-center justify-between">
                        <span style={styles.textSecondary}>URL:</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline text-xs"
                        >
                          {item.url.length > 30 ? item.url.substring(0, 30) + '...' : item.url}
                        </a>
                      </div>
                    )}
                    
                    {item.ip_address && (
                      <div className="flex items-center justify-between">
                        <span style={styles.textSecondary}>IP:</span>
                        <span className="font-mono" style={styles.textPrimary}>
                          {item.ip_address}{item.port ? `:${item.port}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {item.notes && (
                    <div className="pt-2 mb-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                      <p className="text-xs" style={styles.textSecondary}>{item.notes}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSecureData(item)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: withAlpha(palette.accent, 0.1), color: palette.accent }}
                    >
                      <Edit2 size={14} className="inline mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSecureData(item)}
                      className="px-3 py-1.5 rounded-lg transition-colors text-xs font-medium"
                      style={{ backgroundColor: withAlpha(palette.danger, 0.1), color: palette.danger }}
                    >
                      <Trash2 size={14} className="inline mr-1" />
                      Delete
                    </button>
                  </div>
                  
                  {item.last_accessed && (
                    <div className="flex items-center gap-1 mt-2 text-xs" style={styles.subtleText}>
                      <Clock size={12} />
                      Last accessed: {new Date(item.last_accessed).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <SecureDataFormModal
          data={editingData}
          equipment={equipment}
          onClose={() => {
            setShowAddModal(false);
            setEditingData(null);
          }}
          onSave={loadData}
        />
      )}
    </div>
  );
};

export default SecureDataManager;
