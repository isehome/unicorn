import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { wireDropService } from '../services/wireDropService';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { 
  ArrowLeft, 
  MapPin, 
  Zap, 
  Camera, 
  Upload, 
  CheckCircle,
  Circle,
  Edit,
  Save,
  X,
  Loader,
  FileText
} from 'lucide-react';

const WireDropDetail = () => {
  const { id } = useParams();
  const { theme, mode } = useTheme();
  const navigate = useNavigate();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [wireDrop, setWireDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(null);
  const prewireFileInputRef = useRef(null);
  const installedFileInputRef = useRef(null);

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
    loadWireDrop();
  }, [id]);

  const loadWireDrop = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use wireDropService to get wire drop with stages
      const data = await wireDropService.getWireDrop(id);

      if (!data) throw new Error('Wire drop not found');

      setWireDrop(data);
      setEditForm(data || {});
    } catch (err) {
      console.error('Failed to load wire drop:', err);
      setError(err.message || 'Failed to load wire drop details');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const { error: updateError } = await supabase
        .from('wire_drops')
        .update({
          name: editForm.name,
          location: editForm.location,
          type: editForm.type,
          uid: editForm.uid,
          notes: editForm.notes
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setWireDrop(prev => ({ ...prev, ...editForm }));
      setEditing(false);
    } catch (err) {
      console.error('Failed to save wire drop:', err);
      alert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm(wireDrop || {});
    setEditing(false);
  };

  const handlePhotoUpload = async (stageType, file) => {
    if (!file) return;

    try {
      setUploadingPhoto(stageType);
      
      // Map our UI stage names to the database stage names
      // 'installed' in UI corresponds to 'trim_out' stage in the database
      const dbStageType = stageType === 'installed' ? 'trim_out' : 'prewire';
      
      // Use wireDropService to upload photo and update stage
      await wireDropService.uploadStagePhoto(id, dbStageType, file);
      
      // Reload wire drop data to get updated photo URL
      await loadWireDrop();
    } catch (error) {
      console.error(`Failed to upload ${stageType} photo:`, error);
      alert(`Failed to upload ${stageType} photo: ${error.message}`);
    } finally {
      setUploadingPhoto(null);
    }
  };

  const handleFileSelect = (stageType, event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, etc.)');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      handlePhotoUpload(stageType, file);
    }
    
    // Reset file input
    event.target.value = '';
  };

  const triggerFileSelect = (stageType) => {
    if (stageType === 'prewire') {
      prewireFileInputRef.current?.click();
    } else if (stageType === 'installed') {
      installedFileInputRef.current?.click();
    }
  };

  // Helper function to get stage data
  const getStageData = (stageType) => {
    if (!wireDrop?.wire_drop_stages) return null;
    return wireDrop.wire_drop_stages.find(s => s.stage_type === stageType);
  };
  
  const getStatusBadge = () => {
    // Get stage data for prewire and trim_out (which we display as "installed")
    const prewireStage = getStageData('prewire');
    const trimOutStage = getStageData('trim_out');
    
    const prewireComplete = prewireStage?.completed || false;
    const installedComplete = trimOutStage?.completed || false;
    
    const completedStages = [prewireComplete, installedComplete].filter(Boolean).length;
    
    if (completedStages === 2) {
      return {
        text: 'Complete',
        style: {
          backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
          color: mode === 'dark' ? '#4ADE80' : '#059669'
        }
      };
    }
    
    if (completedStages > 0) {
      return {
        text: 'In Progress',
        style: {
          backgroundColor: mode === 'dark' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.1)',
          color: mode === 'dark' ? '#FCD34D' : '#D97706'
        }
      };
    }
    
    return {
      text: 'Pending',
      style: {
        backgroundColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.2)' : 'rgba(156, 163, 175, 0.1)',
        color: mode === 'dark' ? '#9CA3AF' : '#6B7280'
      }
    };
  };

  const pageClasses = mode === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  if (error || !wireDrop) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <div className="text-center space-y-4">
          <p className="text-sm text-rose-500 dark:text-rose-300">{error || 'Wire drop not found'}</p>
          <Button onClick={() => navigate(-1)} variant="secondary" icon={ArrowLeft}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const statusBadge = getStatusBadge();
  
  // Get stage data for calculation
  const prewireStage = getStageData('prewire');
  const trimOutStage = getStageData('trim_out');
  
  const prewireComplete = prewireStage?.completed || false;
  const installedComplete = trimOutStage?.completed || false;
  const prewirePhoto = prewireStage?.photo_url;
  const installedPhoto = trimOutStage?.photo_url;
  
  let completion = 0;
  if (prewireComplete) completion += 50;
  if (installedComplete) completion += 50;

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-4 pt-2 pb-8 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            icon={ArrowLeft} 
            onClick={() => navigate(-1)}
            size="sm"
          >
            Back
          </Button>
          {!editing ? (
            <Button 
              variant="primary" 
              icon={Edit} 
              onClick={() => setEditing(true)}
              size="sm"
            >
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                icon={X} 
                onClick={handleCancel}
                size="sm"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button 
                variant="primary" 
                icon={Save} 
                onClick={handleSave}
                size="sm"
                loading={saving}
                disabled={saving}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        {/* Main Info Card */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editing ? (
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Wire drop name"
                    className="text-2xl font-bold bg-transparent border-b-2 border-violet-400 focus:outline-none w-full"
                    style={styles.textPrimary}
                  />
                ) : (
                  <h1 className="text-2xl font-bold" style={styles.textPrimary}>
                    {wireDrop.name || 'Wire Drop'}
                  </h1>
                )}
                
                {wireDrop.projects?.name && (
                  <button
                    onClick={() => navigate(`/project/${wireDrop.projects.id}`)}
                    className="text-sm text-violet-600 dark:text-violet-400 hover:underline mt-1"
                  >
                    {wireDrop.projects.name}
                  </button>
                )}
              </div>
              
              <div className="text-right space-y-2">
                <span 
                  className="inline-block px-3 py-1 text-sm font-medium rounded-full"
                  style={statusBadge.style}
                >
                  {statusBadge.text}
                </span>
                <div className="text-lg font-bold" style={styles.textPrimary}>
                  {completion}% Complete
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Location
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.location || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="Location"
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin size={16} style={styles.textSecondary} />
                      <span style={styles.textPrimary}>{wireDrop.location || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Type
                  </label>
                  {editing ? (
                    <select
                      value={editForm.type || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                    >
                      <option value="">Select type</option>
                      <option value="CAT6">CAT6</option>
                      <option value="CAT6A">CAT6A</option>
                      <option value="Fiber">Fiber</option>
                      <option value="Coax">Coax</option>
                      <option value="Speaker">Speaker Wire</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Zap size={16} style={styles.textSecondary} />
                      <span style={styles.textPrimary}>{wireDrop.type || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    UID
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.uid || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, uid: e.target.value }))}
                      placeholder="Unique identifier"
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                    />
                  ) : (
                    <span className="text-sm font-mono px-2 py-1 rounded" style={styles.mutedCard}>
                      {wireDrop.uid || 'Not assigned'}
                    </span>
                  )}
                </div>

                {(editing || wireDrop.notes) && (
                  <div>
                    <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                      Notes
                    </label>
                    {editing ? (
                      <textarea
                        value={editForm.notes || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Additional notes"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                        style={styles.input}
                      />
                    ) : (
                      <p className="text-sm" style={styles.textSecondary}>
                        {wireDrop.notes || 'No notes'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Progress Indicators */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium" style={styles.subtleText}>Installation Progress</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg" style={styles.mutedCard}>
                      <div className="flex items-center gap-3">
                        {prewireComplete ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : (
                          <Circle size={20} style={styles.textSecondary} />
                        )}
                        <span style={styles.textPrimary}>Prewire</span>
                      </div>
                      {prewirePhoto && (
                        <div className="flex items-center gap-2">
                          <Camera size={16} style={styles.textSecondary} />
                          <span className="text-xs" style={styles.textSecondary}>Photo attached</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg" style={styles.mutedCard}>
                      <div className="flex items-center gap-3">
                        {installedComplete ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : (
                          <Circle size={20} style={styles.textSecondary} />
                        )}
                        <span style={styles.textPrimary}>Installed</span>
                      </div>
                      {installedPhoto && (
                        <div className="flex items-center gap-2">
                          <Camera size={16} style={styles.textSecondary} />
                          <span className="text-xs" style={styles.textSecondary}>Photo attached</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Photo Upload Section */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Hidden file inputs */}
          <input
            ref={prewireFileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect('prewire', e)}
            className="hidden"
          />
          <input
            ref={installedFileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect('installed', e)}
            className="hidden"
          />

          {/* Prewire Photo */}
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4" style={styles.textPrimary}>Prewire Photo</h3>
              {prewirePhoto ? (
                <div className="space-y-3">
                  <img 
                    src={prewirePhoto} 
                    alt="Prewire" 
                    className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(prewirePhoto, '_blank')}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={styles.textSecondary}>
                      <CheckCircle size={16} className="text-green-500" />
                      <span>Prewire documented</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      icon={Upload} 
                      size="sm"
                      onClick={() => triggerFileSelect('prewire')}
                      disabled={uploadingPhoto === 'prewire'}
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ borderColor: styles.card.borderColor }}>
                  {uploadingPhoto === 'prewire' ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader size={32} className="animate-spin text-violet-500" />
                      <p className="text-sm" style={styles.textSecondary}>
                        Uploading photo...
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} style={styles.textSecondary} className="mx-auto mb-3" />
                      <p className="text-sm mb-3" style={styles.textSecondary}>
                        No prewire photo uploaded yet
                      </p>
                      <Button 
                        variant="secondary" 
                        icon={Camera} 
                        size="sm"
                        onClick={() => triggerFileSelect('prewire')}
                      >
                        Upload Photo
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Installed Photo */}
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4" style={styles.textPrimary}>Installed Photo</h3>
              {installedPhoto ? (
                <div className="space-y-3">
                  <img 
                    src={installedPhoto} 
                    alt="Installed" 
                    className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(installedPhoto, '_blank')}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={styles.textSecondary}>
                      <CheckCircle size={16} className="text-green-500" />
                      <span>Installation documented</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      icon={Upload} 
                      size="sm"
                      onClick={() => triggerFileSelect('installed')}
                      disabled={uploadingPhoto === 'installed'}
                    >
                      Replace
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ borderColor: styles.card.borderColor }}>
                  {uploadingPhoto === 'installed' ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader size={32} className="animate-spin text-violet-500" />
                      <p className="text-sm" style={styles.textSecondary}>
                        Uploading photo...
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} style={styles.textSecondary} className="mx-auto mb-3" />
                      <p className="text-sm mb-3" style={styles.textSecondary}>
                        No installed photo uploaded yet
                      </p>
                      <Button 
                        variant="secondary" 
                        icon={Camera} 
                        size="sm"
                        onClick={() => triggerFileSelect('installed')}
                      >
                        Upload Photo
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4" style={styles.textPrimary}>Wire Drop Notes</h3>
              <div className="border-2 border-dashed rounded-lg p-6 text-center" style={{ borderColor: styles.card.borderColor }}>
                <FileText size={32} style={styles.textSecondary} className="mx-auto mb-3" />
                <p className="text-sm mb-3" style={styles.textSecondary}>
                  {wireDrop?.notes || 'No additional notes'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireDropDetail;
