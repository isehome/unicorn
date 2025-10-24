import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/Button';
import {
  ArrowLeft,
  Key,
  Shield,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  Package,
  Save,
  X,
  User,
  Lock,
  Link2,
  FileText,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { secureDataService, equipmentService } from '../services/equipmentService';
import { enhancedStyles } from '../styles/styleSystem';

const SecureDataPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const equipmentId = searchParams.get('equipment');
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  // State
  const [secureData, setSecureData] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState(equipmentId || 'all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [copiedItem, setCopiedItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    data_type: 'credentials',
    username: '',
    password: '',
    url: '',
    notes: '',
    equipment_ids: []
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Styles
  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#1F2937' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#111827' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#111827';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';
    
    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
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
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary }
    };
  }, [mode, sectionStyles]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [secureDataResult, equipmentResult] = await Promise.all([
        secureDataService.getProjectSecureData(projectId),
        equipmentService.getProjectEquipment(projectId)
      ]);
      
      setSecureData(secureDataResult || []);
      setEquipment(equipmentResult || []);
      
      // Log access to audit
      await secureDataService.logAccess(
        projectId,
        user?.id,
        'view_list',
        null,
        { source: 'secure_data_page' }
      );
    } catch (err) {
      console.error('Failed to load secure data:', err);
      setError(err.message || 'Failed to load secure data');
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Filter secure data
  const filteredSecureData = useMemo(() => {
    let filtered = [...secureData];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name?.toLowerCase().includes(query) ||
        item.username?.toLowerCase().includes(query) ||
        item.url?.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
      );
    }
    
    // Equipment filter
    if (selectedEquipment !== 'all') {
      filtered = filtered.filter(item => {
        const linkedEquipment = item.equipment_secure_links || [];
        return linkedEquipment.some(link => link.equipment_id === selectedEquipment);
      });
    }
    
    return filtered;
  }, [secureData, searchQuery, selectedEquipment]);

  // Group by equipment
  const groupedSecureData = useMemo(() => {
    const groups = {};
    
    filteredSecureData.forEach(item => {
      const linkedEquipment = item.equipment_secure_links || [];
      
      if (linkedEquipment.length === 0) {
        if (!groups['unassigned']) {
          groups['unassigned'] = {
            name: 'Unassigned Credentials',
            items: []
          };
        }
        groups['unassigned'].items.push(item);
      } else {
        linkedEquipment.forEach(link => {
          const equip = equipment.find(e => e.id === link.equipment_id);
          const groupKey = equip?.id || 'unassigned';
          const groupName = equip?.name || 'Unassigned';
          
          if (!groups[groupKey]) {
            groups[groupKey] = {
              name: groupName,
              equipment: equip,
              items: []
            };
          }
          
          if (!groups[groupKey].items.find(i => i.id === item.id)) {
            groups[groupKey].items.push(item);
          }
        });
      }
    });
    
    return groups;
  }, [filteredSecureData, equipment]);

  // Handlers
  const togglePasswordVisibility = async (itemId) => {
    const newState = !visiblePasswords[itemId];
    
    if (newState) {
      // Log password view
      await secureDataService.logAccess(
        projectId,
        user?.id,
        'view_password',
        itemId,
        { source: 'secure_data_page' }
      );
    }
    
    setVisiblePasswords(prev => ({
      ...prev,
      [itemId]: newState
    }));
  };

  const copyToClipboard = async (text, itemId, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(`${itemId}-${field}`);
      
      // Log copy action
      await secureDataService.logAccess(
        projectId,
        user?.id,
        'copy_credential',
        itemId,
        { field, source: 'secure_data_page' }
      );
      
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAddNew = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      type: 'credentials',
      username: '',
      password: '',
      url: '',
      notes: '',
      equipment_ids: []
    });
    setShowAddForm(true);
    setError('');
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    const linkedEquipmentIds = (item.equipment_secure_links || [])
      .map(link => link.equipment_id);
    
    setFormData({
      name: item.name || '',
      data_type: item.data_type || 'credentials',
      username: item.username || '',
      password: item.password || '',
      url: item.url || '',
      notes: item.notes || '',
      equipment_ids: linkedEquipmentIds
    });
    setShowAddForm(true);
    setError('');
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete credentials for ${item.name}? This action cannot be undone.`)) return;
    
    try {
      await secureDataService.deleteSecureData(item.id);
      setSecureData(prev => prev.filter(s => s.id !== item.id));
      
      // Log deletion
      await secureDataService.logAccess(
        projectId,
        user?.id,
        'delete',
        item.id,
        { name: item.name, source: 'secure_data_page' }
      );
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete secure data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      setError('Name is required');
      return;
    }
    
    if (!formData.username && !formData.password) {
      setError('At least username or password is required');
      return;
    }
    
    try {
      setSaving(true);
      setError('');
      
      const payload = {
        project_id: projectId,
        name: formData.name,
        data_type: formData.data_type,
        username: formData.username,
        password: formData.password,
        url: formData.url,
        notes: formData.notes
      };
      
      let savedItem;
      if (editingItem) {
        savedItem = await secureDataService.updateSecureData(editingItem.id, payload);
        setSecureData(prev => prev.map(s => s.id === editingItem.id ? savedItem : s));
        
        // Log update
        await secureDataService.logAccess(
          projectId,
          user?.id,
          'update',
          editingItem.id,
          { source: 'secure_data_page' }
        );
      } else {
        savedItem = await secureDataService.createSecureData(payload);
        setSecureData(prev => [...prev, savedItem]);
        
        // Log creation
        await secureDataService.logAccess(
          projectId,
          user?.id,
          'create',
          savedItem.id,
          { source: 'secure_data_page' }
        );
      }
      
      // Link to equipment
      if (formData.equipment_ids.length > 0) {
        await secureDataService.linkToEquipment(savedItem.id, formData.equipment_ids);
      }
      
      setShowAddForm(false);
      setEditingItem(null);
      await loadData(); // Reload to get updated links
    } catch (err) {
      console.error('Failed to save:', err);
      setError(err.message || 'Failed to save secure data');
    } finally {
      setSaving(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await secureDataService.getAuditLogs(projectId);
      setAuditLogs(logs || []);
      setShowAuditModal(true);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  };

  const typeColors = {
    credentials: palette.accent,
    network: palette.info,
    api_key: palette.warning,
    certificate: palette.success,
    other: palette.textSecondary
  };

  const withAlpha = (hex, alpha) => {
    if (!hex || hex[0] !== '#') return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: palette.accent }}></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} pb-20`}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b" style={{ ...styles.card, borderRadius: 0 }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/projects/${projectId}`)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2" style={styles.textPrimary}>
                  <Shield size={20} style={{ color: palette.danger }} />
                  Secure Data
                </h1>
                <p className="text-sm" style={styles.textSecondary}>
                  {secureData.length} credentials stored securely
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={loadAuditLogs}>
                View Audit Logs
              </Button>
              <Button variant="primary" icon={Plus} onClick={handleAddNew}>
                Add Credentials
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Security Warning */}
      <div className="px-4 py-3 border-b" style={{ backgroundColor: withAlpha(palette.danger, 0.1) }}>
        <div className="flex items-start gap-2">
          <AlertTriangle size={18} style={{ color: palette.danger }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: palette.danger }}>
              Sensitive Information - Handle with Care
            </p>
            <p className="text-xs mt-1" style={styles.textSecondary}>
              All access to this page is logged. Only view and copy credentials when necessary.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b" style={styles.mutedCard}>
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-3" style={styles.textSecondary} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search credentials..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
            />
          </div>

          {/* Equipment filter */}
          <div className="flex items-center gap-2">
            <Package size={16} style={styles.textSecondary} />
            <select
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
            >
              <option value="all">All Equipment</option>
              <option value="unassigned">Unassigned Only</option>
              {equipment.map(equip => (
                <option key={equip.id} value={equip.id}>{equip.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Credentials List */}
      <div className="px-4 py-4 space-y-6">
        {Object.entries(groupedSecureData).map(([key, group]) => (
          <div key={key} className="space-y-3">
            {/* Group Header */}
            {group.equipment ? (
              <div className="flex items-center gap-3 px-2">
                <Package size={16} style={styles.textSecondary} />
                <span className="font-semibold" style={styles.textPrimary}>{group.name}</span>
                {group.equipment.ip_address && (
                  <span className="text-xs font-mono" style={styles.textSecondary}>
                    {group.equipment.ip_address}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-xs" style={{
                  backgroundColor: withAlpha(palette.info, 0.15),
                  color: palette.info
                }}>
                  {group.items.length} credentials
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-2">
                <AlertCircle size={16} style={{ color: palette.warning }} />
                <span className="font-semibold" style={styles.textPrimary}>{group.name}</span>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{
                  backgroundColor: withAlpha(palette.warning, 0.15),
                  color: palette.warning
                }}>
                  {group.items.length} credentials
                </span>
              </div>
            )}

            {/* Credential Cards */}
            <div className="grid gap-3 md:grid-cols-2">
              {group.items.map(item => {
                const itemType = item.data_type || item.type || 'credentials';
                const typeColor = typeColors[itemType] || palette.textSecondary;
                const passwordVisible = visiblePasswords[item.id];
                
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border p-4 hover:shadow-lg transition-all duration-200"
                    style={styles.card}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold" style={styles.textPrimary}>{item.name}</h3>
                        <span 
                          className="text-xs px-2 py-0.5 rounded-full inline-block mt-1"
                          style={{
                            backgroundColor: withAlpha(typeColor, 0.15),
                            color: typeColor
                          }}
                        >
                          {itemType.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Edit2 size={16} style={styles.textSecondary} />
                      </button>
                    </div>

                    {/* Credentials */}
                    <div className="space-y-3">
                      {item.username && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <User size={14} style={styles.textSecondary} />
                            <span className="text-sm font-mono truncate" style={styles.textPrimary}>
                              {item.username}
                            </span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(item.username, item.id, 'username')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            {copiedItem === `${item.id}-username` ? (
                              <CheckCircle size={14} style={{ color: palette.success }} />
                            ) : (
                              <Copy size={14} style={styles.textSecondary} />
                            )}
                          </button>
                        </div>
                      )}
                      
                      {item.password && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <Lock size={14} style={styles.textSecondary} />
                            <span className="text-sm font-mono truncate" style={styles.textPrimary}>
                              {passwordVisible ? item.password : '••••••••'}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => togglePasswordVisibility(item.id)}
                              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              {passwordVisible ? (
                                <EyeOff size={14} style={styles.textSecondary} />
                              ) : (
                                <Eye size={14} style={styles.textSecondary} />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(item.password, item.id, 'password')}
                              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              {copiedItem === `${item.id}-password` ? (
                                <CheckCircle size={14} style={{ color: palette.success }} />
                              ) : (
                                <Copy size={14} style={styles.textSecondary} />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {item.url && (
                        <div className="flex items-center gap-2">
                          <Link2 size={14} style={styles.textSecondary} />
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm truncate hover:underline"
                            style={{ color: palette.info }}
                          >
                            {item.url}
                          </a>
                        </div>
                      )}
                      
                      {item.notes && (
                        <div className="pt-2 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <p className="text-xs" style={styles.textSecondary}>{item.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                      <button
                        onClick={() => handleDelete(item)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                        style={{ color: palette.danger }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredSecureData.length === 0 && (
          <div className="text-center py-12">
            <Key size={48} className="mx-auto mb-4" style={styles.textSecondary} />
            <p style={styles.textSecondary}>
              {searchQuery || selectedEquipment !== 'all' 
                ? 'No credentials match your filters' 
                : 'No secure data stored yet'}
            </p>
            {!searchQuery && selectedEquipment === 'all' && (
              <Button variant="primary" icon={Plus} className="mt-4" onClick={handleAddNew}>
                Add First Credentials
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" style={styles.card}>
            <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ ...styles.card, borderRadius: 0 }}>
              <h2 className="text-lg font-semibold" style={styles.textPrimary}>
                {editingItem ? 'Edit Credentials' : 'Add Credentials'}
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Router Admin, API Key"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Type
                  </label>
                  <select
                    value={formData.data_type}
                    onChange={(e) => setFormData({ ...formData, data_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  >
                    <option value="credentials">Password/Credentials</option>
                    <option value="network">Network Configuration</option>
                    <option value="api_key">API Key</option>
                    <option value="certificate">Certificate</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="admin, root, etc."
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Password / Secret
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password or secret"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    URL / IP Address
                  </label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://192.168.1.1/admin or 192.168.1.1"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Associated Equipment
                  </label>
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-2" style={styles.mutedCard}>
                    {equipment.map(equip => (
                      <label key={equip.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                        <input
                          type="checkbox"
                          checked={formData.equipment_ids.includes(equip.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, equipment_ids: [...formData.equipment_ids, equip.id] });
                            } else {
                              setFormData({ ...formData, equipment_ids: formData.equipment_ids.filter(id => id !== equip.id) });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm" style={styles.textPrimary}>{equip.name}</span>
                        {equip.ip_address && (
                          <span className="text-xs font-mono" style={styles.textSecondary}>
                            ({equip.ip_address})
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddForm(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={Save}
                  disabled={saving}
                  loading={saving}
                >
                  {editingItem ? 'Update' : 'Add'} Credentials
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-y-auto rounded-2xl" style={styles.card}>
            <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ ...styles.card, borderRadius: 0 }}>
              <h2 className="text-lg font-semibold" style={styles.textPrimary}>
                Audit Logs
              </h2>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <div className="space-y-2">
                {auditLogs.length === 0 ? (
                  <p className="text-center py-8" style={styles.textSecondary}>
                    No audit logs available
                  </p>
                ) : (
                  auditLogs.map(log => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border"
                      style={styles.mutedCard}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Clock size={14} style={styles.textSecondary} />
                            <span className="text-xs" style={styles.textSecondary}>
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium" style={styles.textPrimary}>
                            {log.action_type.replace('_', ' ').charAt(0).toUpperCase() + log.action_type.slice(1).replace('_', ' ')}
                          </p>
                          {log.metadata && (
                            <p className="text-xs mt-1" style={styles.textSecondary}>
                              {JSON.stringify(log.metadata)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs" style={styles.textSecondary}>
                          User ID: {log.user_id?.substring(0, 8)}...
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecureDataPage;
