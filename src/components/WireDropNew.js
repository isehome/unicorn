import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { wireDropService } from '../services/wireDropService';
import Button from './ui/Button';
import {
  Save,
  X,
  Zap,
  Loader,
  Home,
  Wifi,
  AlertCircle
} from 'lucide-react';

const WireDropNew = () => {
  const { theme, mode } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [projectRooms, setProjectRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [generatedName, setGeneratedName] = useState('');
  const [namePreview, setNamePreview] = useState('');
  const [form, setForm] = useState({
    project_id: projectId || '',
    room_name: '',
    drop_type: '',
    drop_name: '', // Will be auto-generated
    wire_type: '',
    notes: ''
  });

  // Common drop types for quick selection
  const dropTypes = [
    'Speaker',
    'Display',
    'Access Point',
    'Camera',
    'Keypad',
    'Sensor',
    'Network',
    'Power',
    'Control',
    'Other'
  ];

  // Common wire types
  const wireTypes = [
    'CAT6',
    'CAT6A',
    'Fiber',
    'Coax',
    '14/2 Speaker',
    '16/2 Speaker',
    '16/4 Speaker',
    'Control',
    'Other'
  ];

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
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      typeButton: {
        backgroundColor: 'transparent',
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '0.75rem',
        padding: '0.75rem',
        color: textSecondary,
        cursor: 'pointer',
        transition: 'all 0.2s'
      },
      typeButtonActive: {
        backgroundColor: palette.accent,
        borderColor: palette.accent,
        color: '#FFFFFF',
        transform: 'scale(1.02)'
      }
    };
  }, [mode, palette, sectionStyles]);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  useEffect(() => {
    // Update name preview when room or type changes
    if (form.room_name && form.drop_type) {
      generateNamePreview();
    } else {
      setNamePreview('');
    }
  }, [form.room_name, form.drop_type]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      
      // Load project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Load project rooms
      const { data: roomsData, error: roomsError } = await supabase
        .from('project_rooms')
        .select('id, name, is_headend')
        .eq('project_id', projectId)
        .order('name');

      if (roomsError) throw roomsError;
      setProjectRooms(roomsData || []);
    } catch (err) {
      console.error('Failed to load project data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateNamePreview = async () => {
    if (!form.room_name || !form.drop_type) {
      setNamePreview('');
      return;
    }
    
    try {
      const preview = await wireDropService.generateDropName(
        projectId,
        form.room_name,
        form.drop_type
      );
      setNamePreview(preview);
    } catch (err) {
      console.error('Failed to generate name preview:', err);
      setNamePreview(`${form.room_name} ${form.drop_type}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.project_id) {
      alert('Please select a project');
      return;
    }

    if (!form.room_name) {
      alert('Please select a room');
      return;
    }

    if (!form.drop_type) {
      alert('Please select a drop type');
      return;
    }

    try {
      setSaving(true);
      
      // Use the wireDropService to create the wire drop
      // The service will auto-generate the name based on room and type
      const wireDrop = await wireDropService.createWireDrop(projectId, {
        room_name: form.room_name,
        drop_type: form.drop_type,
        drop_name: form.drop_name || null, // Will be auto-generated if null
        wire_type: form.wire_type || null,
        notes: form.notes || null
      });

      // Navigate to the new wire drop detail page
      navigate(`/wire-drops/${wireDrop.id}`);
    } catch (err) {
      console.error('Failed to create wire drop:', err);
      alert(err.message || 'Failed to create wire drop');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (projectId) {
      navigate(`/project/${projectId}`);
    } else {
      navigate(-1);
    }
  };

  const pageClasses = mode === 'dark' ? 'bg-zinc-900 text-gray-100' : 'bg-gray-50 text-gray-900';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-3 sm:px-4 pt-2 pb-8 space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={handleCancel}
            size="sm"
          >
            Cancel
          </Button>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-2" style={styles.textPrimary}>
              Create New Wire Drop
            </h1>
            <p className="text-sm mb-6" style={styles.textSecondary}>
              Select a room and drop type to automatically generate the wire drop name
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project (if preselected) */}
              {project && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={styles.subtleText}>
                    Project
                  </label>
                  <div className="px-3 py-2 rounded-lg" style={styles.mutedCard}>
                    {project.name}
                  </div>
                </div>
              )}

              {/* Room Selection */}
              <div>
                <label htmlFor="room" className="flex items-center text-sm font-medium mb-2" style={styles.subtleText}>
                  <Home size={16} className="mr-2" />
                  Select Room *
                </label>
                {projectRooms.length > 0 ? (
                  <select
                    id="room"
                    value={form.room_name}
                    onChange={(e) => setForm(prev => ({ ...prev, room_name: e.target.value }))}
                    className="w-full px-3 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    required
                  >
                    <option value="">Choose a room...</option>
                    {projectRooms.map(room => (
                      <option key={room.id} value={room.name}>
                        {room.name}
                        {room.is_headend && ' (Head End)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="room"
                    type="text"
                    value={form.room_name}
                    onChange={(e) => setForm(prev => ({ ...prev, room_name: e.target.value }))}
                    placeholder="Enter room name"
                    className="w-full px-3 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    required
                  />
                )}
              </div>

              {/* Drop Type Selection */}
              <div>
                <label className="flex items-center text-sm font-medium mb-2" style={styles.subtleText}>
                  <Wifi size={16} className="mr-2" />
                  Select Drop Type *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {dropTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, drop_type: type }))}
                      className="transition-all"
                      style={{
                        ...styles.typeButton,
                        ...(form.drop_type === type ? styles.typeButtonActive : {})
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                {form.drop_type === 'Other' && (
                  <input
                    type="text"
                    placeholder="Enter custom drop type"
                    className="w-full mt-2 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                    onChange={(e) => setForm(prev => ({ ...prev, drop_type: e.target.value }))}
                  />
                )}
              </div>

              {/* Auto-generated Name Preview */}
              {namePreview && (
                <div className="p-4 rounded-lg border-2 border-violet-400/30" style={{ backgroundColor: palette.accent + '10' }}>
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} style={{ color: palette.accent }} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium" style={styles.textPrimary}>
                        Auto-generated Name:
                      </p>
                      <p className="text-lg font-semibold mt-1" style={{ color: palette.accent }}>
                        {namePreview}
                      </p>
                      <p className="text-xs mt-2" style={styles.subtleText}>
                        This name will be automatically assigned when you create the wire drop
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Cable Type */}
              <div>
                <label htmlFor="wire_type" className="flex items-center text-sm font-medium mb-2" style={styles.subtleText}>
                  <Zap size={16} className="mr-2" />
                  Cable Type (Optional)
                </label>
                <select
                  id="wire_type"
                  value={form.wire_type}
                  onChange={(e) => setForm(prev => ({ ...prev, wire_type: e.target.value }))}
                  className="w-full px-3 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="">Select cable type (optional)</option>
                  {wireTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  Installation Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any special instructions or notes for installation"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  icon={X}
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon={Save}
                  loading={saving}
                  disabled={saving || !form.room_name || !form.drop_type}
                  className="flex-1"
                >
                  Create Wire Drop
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center text-xs" style={styles.subtleText}>
          Wire drops will be automatically numbered if multiple drops of the same type exist in the same room
        </div>
      </div>
    </div>
  );
};

export default WireDropNew;
