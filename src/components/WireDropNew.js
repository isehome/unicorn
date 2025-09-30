import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { 
  ArrowLeft, 
  Save,
  X,
  MapPin,
  Zap,
  FileText,
  Hash,
  Loader
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_id: projectId || '',
    name: '',
    location: '',
    type: '',
    uid: '',
    notes: ''
  });

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
      }
    };
  }, [mode, palette, sectionStyles]);

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      setProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateUID = () => {
    // Generate a simple UID if not provided
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `WD-${timestamp}-${random}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.project_id) {
      alert('Please select a project');
      return;
    }

    if (!form.name && !form.location) {
      alert('Please provide at least a name or location');
      return;
    }

    try {
      setSaving(true);
      
      // Generate UID if not provided
      const uid = form.uid.trim() || generateUID();
      
      const { data, error } = await supabase
        .from('wire_drops')
        .insert([{
          project_id: form.project_id,
          name: form.name || null,
          location: form.location || null,
          type: form.type || null,
          uid: uid,
          notes: form.notes || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Navigate to the new wire drop detail page
      navigate(`/wire-drops/${data.id}`);
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

  const pageClasses = mode === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-4 pt-2 pb-8 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            icon={ArrowLeft} 
            onClick={handleCancel}
            size="sm"
          >
            Cancel
          </Button>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-6" style={styles.textPrimary}>
              Create New Wire Drop
            </h1>

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

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  <FileText size={16} className="inline mr-2" />
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Living Room Speaker"
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              {/* Location */}
              <div>
                <label htmlFor="location" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  <MapPin size={16} className="inline mr-2" />
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g., Living Room - West Wall"
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
              </div>

              {/* Type */}
              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  <Zap size={16} className="inline mr-2" />
                  Cable Type
                </label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                >
                  <option value="">Select type (optional)</option>
                  <option value="CAT6">CAT6</option>
                  <option value="CAT6A">CAT6A</option>
                  <option value="Fiber">Fiber</option>
                  <option value="Coax">Coax</option>
                  <option value="Speaker">Speaker Wire</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* UID */}
              <div>
                <label htmlFor="uid" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  <Hash size={16} className="inline mr-2" />
                  Unique Identifier (UID)
                </label>
                <input
                  id="uid"
                  type="text"
                  value={form.uid}
                  onChange={(e) => setForm(prev => ({ ...prev, uid: e.target.value }))}
                  placeholder="e.g., WD-001 (auto-generated if empty)"
                  className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                  style={styles.input}
                />
                <p className="text-xs mt-1" style={styles.subtleText}>
                  Leave empty to auto-generate
                </p>
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium mb-2" style={styles.subtleText}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes or specifications"
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
                  disabled={saving}
                  className="flex-1"
                >
                  Create Wire Drop
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireDropNew;
