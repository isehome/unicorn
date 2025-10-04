import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import {
  ArrowLeft,
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  MapPin,
  Server,
  Wifi,
  Hash,
  Building,
  Tag,
  MoreVertical,
  Save,
  X
} from 'lucide-react';
import { equipmentService } from '../services/equipmentService';
import { enhancedStyles } from '../styles/styleSystem';

const EquipmentListPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  // State
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedRack, setSelectedRack] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'network',
    manufacturer: '',
    model: '',
    serial_number: '',
    location: '',
    room: '',
    rack: '',
    rack_position: '',
    ip_address: '',
    mac_address: '',
    notes: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Load equipment
  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true);
      const data = await equipmentService.getProjectEquipment(projectId);
      setEquipment(data || []);
    } catch (err) {
      console.error('Failed to load equipment:', err);
      setError(err.message || 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Get unique rooms and racks for filters
  const rooms = useMemo(() => {
    const uniqueRooms = new Set();
    equipment.forEach(item => {
      if (item.room) uniqueRooms.add(item.room);
      if (item.location) uniqueRooms.add(item.location);
    });
    return Array.from(uniqueRooms).sort();
  }, [equipment]);

  const racks = useMemo(() => {
    const uniqueRacks = new Set();
    equipment.forEach(item => {
      if (item.rack) uniqueRacks.add(item.rack);
    });
    return Array.from(uniqueRacks).sort();
  }, [equipment]);

  // Filter equipment
  const filteredEquipment = useMemo(() => {
    let filtered = [...equipment];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name?.toLowerCase().includes(query) ||
        item.uid?.toLowerCase().includes(query) ||
        item.manufacturer?.toLowerCase().includes(query) ||
        item.model?.toLowerCase().includes(query) ||
        item.serial_number?.toLowerCase().includes(query) ||
        item.ip_address?.toLowerCase().includes(query) ||
        item.mac_address?.toLowerCase().includes(query)
      );
    }
    
    // Room filter
    if (selectedRoom !== 'all') {
      filtered = filtered.filter(item => 
        item.room === selectedRoom || item.location === selectedRoom
      );
    }
    
    // Rack filter
    if (selectedRack !== 'all') {
      filtered = filtered.filter(item => item.rack === selectedRack);
    }
    
    return filtered;
  }, [equipment, searchQuery, selectedRoom, selectedRack]);

  // Group equipment by room/rack
  const groupedEquipment = useMemo(() => {
    const groups = {};
    
    filteredEquipment.forEach(item => {
      const room = item.room || item.location || 'Unassigned';
      const rack = item.rack || 'No Rack';
      const groupKey = `${room}::${rack}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          room,
          rack,
          items: []
        };
      }
      
      groups[groupKey].items.push(item);
    });
    
    // Sort by rack position within each group
    Object.values(groups).forEach(group => {
      group.items.sort((a, b) => {
        const posA = parseInt(a.rack_position) || 999;
        const posB = parseInt(b.rack_position) || 999;
        return posA - posB;
      });
    });
    
    return groups;
  }, [filteredEquipment]);

  // Form handlers
  const handleAddNew = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: 'network',
      manufacturer: '',
      model: '',
      serial_number: '',
      location: '',
      room: '',
      rack: '',
      rack_position: '',
      ip_address: '',
      mac_address: '',
      notes: ''
    });
    setShowAddForm(true);
    setError('');
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      category: item.category || 'network',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      serial_number: item.serial_number || '',
      location: item.location || '',
      room: item.room || '',
      rack: item.rack || '',
      rack_position: item.rack_position || '',
      ip_address: item.ip_address || '',
      mac_address: item.mac_address || '',
      notes: item.notes || ''
    });
    setShowAddForm(true);
    setError('');
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    
    try {
      await equipmentService.deleteEquipment(item.id);
      setEquipment(prev => prev.filter(e => e.id !== item.id));
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete equipment');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      setError('Equipment name is required');
      return;
    }
    
    try {
      setSaving(true);
      setError('');
      
      const payload = {
        ...formData,
        project_id: projectId
      };
      
      if (editingItem) {
        const updated = await equipmentService.updateEquipment(editingItem.id, payload);
        setEquipment(prev => prev.map(e => e.id === editingItem.id ? updated : e));
      } else {
        const created = await equipmentService.createEquipment(payload);
        setEquipment(prev => [...prev, created]);
      }
      
      setShowAddForm(false);
      setEditingItem(null);
      setFormData({
        name: '',
        category: 'network',
        manufacturer: '',
        model: '',
        serial_number: '',
        location: '',
        room: '',
        rack: '',
        rack_position: '',
        ip_address: '',
        mac_address: '',
        notes: ''
      });
    } catch (err) {
      console.error('Failed to save:', err);
      setError(err.message || 'Failed to save equipment');
    } finally {
      setSaving(false);
    }
  };

  const categoryColors = {
    network: palette.info,
    server: palette.accent,
    storage: palette.success,
    security: palette.danger,
    audio: palette.warning,
    video: palette.warning,
    other: palette.textSecondary
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'network': return Wifi;
      case 'server': return Server;
      case 'storage': return Package;
      default: return Package;
    }
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
                <h1 className="text-xl font-semibold" style={styles.textPrimary}>Equipment List</h1>
                <p className="text-sm" style={styles.textSecondary}>
                  {equipment.length} items • {rooms.length} rooms • {racks.length} racks
                </p>
              </div>
            </div>
            <Button variant="primary" icon={Plus} onClick={handleAddNew}>
              Add Equipment
            </Button>
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
              placeholder="Search equipment..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
            />
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Building size={16} style={styles.textSecondary} />
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              >
                <option value="all">All Rooms</option>
                {rooms.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Server size={16} style={styles.textSecondary} />
              <select
                value={selectedRack}
                onChange={(e) => setSelectedRack(e.target.value)}
                className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={styles.input}
              >
                <option value="all">All Racks</option>
                {racks.map(rack => (
                  <option key={rack} value={rack}>{rack}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment List Grouped by Room/Rack */}
      <div className="px-4 py-4 space-y-6">
        {Object.entries(groupedEquipment).map(([key, group]) => (
          <div key={key} className="space-y-3">
            {/* Group Header */}
            <div className="flex items-center gap-3 px-2">
              <MapPin size={16} style={styles.textSecondary} />
              <span className="font-semibold" style={styles.textPrimary}>{group.room}</span>
              {group.rack !== 'No Rack' && (
                <>
                  <span style={styles.textSecondary}>•</span>
                  <Server size={16} style={styles.textSecondary} />
                  <span style={styles.textSecondary}>{group.rack}</span>
                </>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs" style={{
                backgroundColor: withAlpha(palette.info, 0.15),
                color: palette.info
              }}>
                {group.items.length} items
              </span>
            </div>

            {/* Equipment Cards */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map(item => {
                const CategoryIcon = getCategoryIcon(item.category);
                const categoryColor = categoryColors[item.category] || palette.textSecondary;
                
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border p-4 hover:shadow-lg transition-all duration-200"
                    style={styles.card}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: withAlpha(categoryColor, 0.15) }}
                        >
                          <CategoryIcon size={18} style={{ color: categoryColor }} />
                        </div>
                        <div>
                          <h3 className="font-semibold" style={styles.textPrimary}>{item.name}</h3>
                          <p className="text-xs" style={styles.textSecondary}>{item.uid}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Edit2 size={16} style={styles.textSecondary} />
                      </button>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm">
                      {item.manufacturer && (
                        <div className="flex items-center gap-2">
                          <span style={styles.textSecondary}>Mfr:</span>
                          <span style={styles.textPrimary}>{item.manufacturer}</span>
                        </div>
                      )}
                      {item.model && (
                        <div className="flex items-center gap-2">
                          <span style={styles.textSecondary}>Model:</span>
                          <span style={styles.textPrimary}>{item.model}</span>
                        </div>
                      )}
                      {item.serial_number && (
                        <div className="flex items-center gap-2">
                          <Hash size={14} style={styles.textSecondary} />
                          <span className="font-mono text-xs" style={styles.textPrimary}>
                            {item.serial_number}
                          </span>
                        </div>
                      )}
                      {item.ip_address && (
                        <div className="flex items-center gap-2">
                          <Wifi size={14} style={styles.textSecondary} />
                          <span className="font-mono text-xs" style={styles.textPrimary}>
                            {item.ip_address}
                          </span>
                        </div>
                      )}
                      {item.rack_position && (
                        <div className="flex items-center gap-2">
                          <span style={styles.textSecondary}>Position:</span>
                          <span className="font-mono" style={styles.textPrimary}>U{item.rack_position}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                      <button
                        onClick={() => navigate(`/projects/${projectId}/secure-data?equipment=${item.id}`)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
                        style={{
                          backgroundColor: withAlpha(palette.accent, 0.1),
                          color: palette.accent
                        }}
                      >
                        View Credentials
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                        style={{ color: palette.danger }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredEquipment.length === 0 && (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto mb-4" style={styles.textSecondary} />
            <p style={styles.textSecondary}>
              {searchQuery || selectedRoom !== 'all' || selectedRack !== 'all' 
                ? 'No equipment matches your filters' 
                : 'No equipment added yet'}
            </p>
            {!searchQuery && selectedRoom === 'all' && selectedRack === 'all' && (
              <Button variant="primary" icon={Plus} className="mt-4" onClick={handleAddNew}>
                Add First Equipment
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
                {editingItem ? 'Edit Equipment' : 'Add Equipment'}
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

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Equipment Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  >
                    <option value="network">Network</option>
                    <option value="server">Server</option>
                    <option value="storage">Storage</option>
                    <option value="security">Security</option>
                    <option value="audio">Audio</option>
                    <option value="video">Video</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Model
                  </label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Serial Number
                  </label>
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Room/Location
                  </label>
                  <input
                    type="text"
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value, location: e.target.value })}
                    placeholder="e.g., Server Room, Office 101"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Rack
                  </label>
                  <input
                    type="text"
                    value={formData.rack}
                    onChange={(e) => setFormData({ ...formData, rack: e.target.value })}
                    placeholder="e.g., Rack A, Network Rack"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    Rack Position (U)
                  </label>
                  <input
                    type="text"
                    value={formData.rack_position}
                    onChange={(e) => setFormData({ ...formData, rack_position: e.target.value })}
                    placeholder="e.g., 1, 10-12"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.textPrimary}>
                    MAC Address
                  </label>
                  <input
                    type="text"
                    value={formData.mac_address}
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                    placeholder="00:00:00:00:00:00"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div className="md:col-span-2">
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
                  {editingItem ? 'Update' : 'Add'} Equipment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentListPage;
