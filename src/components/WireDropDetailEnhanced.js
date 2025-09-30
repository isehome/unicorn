import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';
import wireDropService from '../services/wireDropService';
import Button from './ui/Button';
import { 
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
  Network,
  Building,
  Monitor,
  Server,
  Cable,
  Info,
  Clock,
  User,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Trash2
} from 'lucide-react';

const WireDropDetailEnhanced = () => {
  const { id } = useParams();
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [wireDrop, setWireDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  
  // Equipment states
  const [roomEndData, setRoomEndData] = useState({});
  const [headEndData, setHeadEndData] = useState({});
  const [equipmentTypes, setEquipmentTypes] = useState({ room: [], head: [] });
  const [activeTab, setActiveTab] = useState('overview');
  
  // Stage states
  const [uploadingStage, setUploadingStage] = useState(null);
  const [completingCommission, setCompletingCommission] = useState(false);
  const [commissionNotes, setCommissionNotes] = useState('');
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      },
      tabActive: {
        backgroundColor: palette.accent,
        color: '#FFFFFF'
      },
      tabInactive: {
        backgroundColor: mutedBackground,
        color: textSecondary
      },
      warningCard: {
        backgroundColor: mode === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)',
        borderColor: mode === 'dark' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius
      },
      successCard: {
        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
        borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius
      }
    };
  }, [mode, palette, sectionStyles]);

  useEffect(() => {
    loadWireDrop();
    loadEquipmentTypes();
  }, [id]);

  const loadWireDrop = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await wireDropService.getWireDrop(id);
      setWireDrop(data);
      setEditForm({
        room_name: data.room_name || '',
        drop_name: data.drop_name || '',
        location: data.location || '',
        type: data.type || '',
        lucid_shape_id: data.lucid_shape_id || '',
        schematic_reference: data.schematic_reference || '',
        notes: data.notes || ''
      });
      
      // Set equipment data
      if (data.wire_drop_room_end?.length > 0) {
        setRoomEndData(data.wire_drop_room_end[0] || {});
      }
      if (data.wire_drop_head_end?.length > 0) {
        setHeadEndData(data.wire_drop_head_end[0] || {});
      }
    } catch (err) {
      console.error('Failed to load wire drop:', err);
      setError(err.message || 'Failed to load wire drop details');
    } finally {
      setLoading(false);
    }
  };

  const loadEquipmentTypes = async () => {
    try {
      const [roomTypes, headTypes] = await Promise.all([
        wireDropService.getEquipmentTypes('room_end'),
        wireDropService.getEquipmentTypes('head_end')
      ]);
      setEquipmentTypes({ room: roomTypes, head: headTypes });
    } catch (err) {
      console.error('Failed to load equipment types:', err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await wireDropService.updateWireDrop(id, editForm);
      await loadWireDrop(); // Reload to get updated data
      setEditing(false);
    } catch (err) {
      console.error('Failed to save wire drop:', err);
      alert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm({
      room_name: wireDrop.room_name || '',
      drop_name: wireDrop.drop_name || '',
      location: wireDrop.location || '',
      type: wireDrop.type || '',
      lucid_shape_id: wireDrop.lucid_shape_id || '',
      schematic_reference: wireDrop.schematic_reference || '',
      notes: wireDrop.notes || ''
    });
    setEditing(false);
  };

  const handlePhotoUpload = async (stageType, isReUpload = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        setUploadingStage(stageType);
        await wireDropService.uploadStagePhoto(id, stageType, file);
        await loadWireDrop(); // Reload to get updated stages
        if (isReUpload) {
          alert('Photo updated successfully!');
        }
      } catch (err) {
        console.error('Error uploading photo:', err);
        alert(err.message || 'Failed to upload photo');
      } finally {
        setUploadingStage(null);
      }
    };
    
    input.click();
  };

  const handleDeleteWireDrop = async () => {
    try {
      setDeleting(true);
      await wireDropService.deleteWireDrop(id);
      alert('Wire drop deleted successfully');
      navigate(-1); // Go back to previous page
    } catch (err) {
      console.error('Error deleting wire drop:', err);
      alert(err.message || 'Failed to delete wire drop');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Check if a photo URL is a broken blob URL
  const isBrokenPhotoUrl = (url) => {
    return url && url.startsWith('blob:');
  };

  const handleCommissionComplete = async () => {
    try {
      setCompletingCommission(true);
      await wireDropService.completeCommission(id, {
        notes: commissionNotes,
        completed_by: user?.email || 'Unknown User'
      });
      await loadWireDrop(); // Reload to get updated stages
      setCommissionNotes('');
    } catch (err) {
      console.error('Error completing commission:', err);
      alert('Failed to complete commission');
    } finally {
      setCompletingCommission(false);
    }
  };

  const handleSaveRoomEnd = async () => {
    try {
      await wireDropService.updateRoomEnd(id, roomEndData);
      alert('Room end information saved');
    } catch (err) {
      console.error('Failed to save room end:', err);
      alert('Failed to save room end information');
    }
  };

  const handleSaveHeadEnd = async () => {
    try {
      await wireDropService.updateHeadEnd(id, headEndData);
      alert('Head end information saved');
    } catch (err) {
      console.error('Failed to save head end:', err);
      alert('Failed to save head end information');
    }
  };

  const getStageStatus = (stageType) => {
    if (!wireDrop?.wire_drop_stages) return null;
    return wireDrop.wire_drop_stages.find(s => s.stage_type === stageType);
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
          {/* Error state - user will use app bar back button */}
        </div>
      </div>
    );
  }

  const prewireStage = getStageStatus('prewire');
  const trimOutStage = getStageStatus('trim_out');
  const commissionStage = getStageStatus('commission');

  // Determine card style based on completion status
  const getStageCardStyle = (stage) => {
    if (stage?.completed) {
      return styles.successCard;
    }
    return styles.warningCard;
  };

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-4 pt-2 pb-8 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>{/* Spacer for layout */}</div>
          {!editing ? (
            <div className="flex gap-2">
              <Button 
                variant="danger" 
                icon={Trash2} 
                onClick={() => setShowDeleteConfirm(true)}
                size="sm"
              >
                Delete
              </Button>
              <Button 
                variant="primary" 
                icon={Edit} 
                onClick={() => setEditing(true)}
                size="sm"
              >
                Edit
              </Button>
            </div>
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
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Room Name
                        </label>
                        <input
                          type="text"
                          value={editForm.room_name || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, room_name: e.target.value }))}
                          placeholder="Room name"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Drop Name
                        </label>
                        <input
                          type="text"
                          value={editForm.drop_name || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, drop_name: e.target.value }))}
                          placeholder="Drop name"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold" style={styles.textPrimary}>
                      {wireDrop.room_name || wireDrop.name || 'Wire Drop'} {wireDrop.drop_name && `- ${wireDrop.drop_name}`}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-mono px-2 py-1 rounded" style={styles.mutedCard}>
                        {wireDrop.uid}
                      </span>
                      {wireDrop.location && (
                        <div className="flex items-center gap-1 text-sm" style={styles.textSecondary}>
                          <MapPin size={14} />
                          {wireDrop.location}
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {wireDrop.projects?.name && !editing && (
                  <button
                    onClick={() => navigate(`/project/${wireDrop.projects.id}`)}
                    className="text-sm text-violet-600 dark:text-violet-400 hover:underline mt-1"
                  >
                    {wireDrop.projects.name}
                  </button>
                )}
              </div>
              
              <div className="text-right space-y-2">
                <div className={`text-3xl font-bold ${
                  wireDrop.completion === 100 ? 'text-green-500' :
                  wireDrop.completion >= 67 ? 'text-blue-500' :
                  wireDrop.completion >= 33 ? 'text-yellow-500' :
                  'text-gray-500'
                }`}>
                  {wireDrop.completion || 0}%
                </div>
                <div className="text-xs" style={styles.subtleText}>Complete</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: styles.card.borderColor }}>
          {['overview', 'room-end', 'head-end'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-t-lg transition-colors"
              style={activeTab === tab ? styles.tabActive : styles.tabInactive}
            >
              {tab === 'overview' && 'Installation Stages'}
              {tab === 'room-end' && 'Room End'}
              {tab === 'head-end' && 'Head End'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Prewire Stage */}
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(prewireStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!prewireStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 1: Prewire
                  </h3>
                  {prewireStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {prewireStage?.photo_url ? (
                  <div className="space-y-3">
                    {isBrokenPhotoUrl(prewireStage.photo_url) ? (
                      <div className="border-2 border-dashed border-red-300 rounded-lg p-8 text-center bg-red-50 dark:bg-red-900/10">
                        <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
                        <p className="text-sm mb-3 text-red-600 dark:text-red-400">
                          Photo link is broken and needs to be re-uploaded
                        </p>
                        <Button 
                          variant="danger" 
                          icon={RefreshCw} 
                          size="sm"
                          onClick={() => handlePhotoUpload('prewire', true)}
                          loading={uploadingStage === 'prewire'}
                          disabled={uploadingStage === 'prewire'}
                        >
                          Re-upload Photo
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="relative group">
                          <img 
                            src={prewireStage.photo_url} 
                            alt="Prewire" 
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                            <Button 
                              variant="primary" 
                              icon={RefreshCw} 
                              size="sm"
                              onClick={() => handlePhotoUpload('prewire', true)}
                              loading={uploadingStage === 'prewire'}
                              disabled={uploadingStage === 'prewire'}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Replace Photo
                            </Button>
                          </div>
                        </div>
                        {prewireStage.completed_at && (
                          <div className="text-xs space-y-1" style={styles.textSecondary}>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(prewireStage.completed_at).toLocaleDateString()}
                            </div>
                            {prewireStage.completed_by && (
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {prewireStage.completed_by}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center" 
                       style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                    <Upload size={32} className="text-yellow-500 mx-auto mb-3" />
                    <p className="text-sm mb-3" style={styles.textSecondary}>
                      Upload photo to complete
                    </p>
                    <Button 
                      variant="primary" 
                      icon={Camera} 
                      size="sm"
                      onClick={() => handlePhotoUpload('prewire')}
                      loading={uploadingStage === 'prewire'}
                      disabled={uploadingStage === 'prewire'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Trim Out Stage */}
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(trimOutStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!trimOutStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 2: Trim Out
                  </h3>
                  {trimOutStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {trimOutStage?.photo_url ? (
                  <div className="space-y-3">
                    {isBrokenPhotoUrl(trimOutStage.photo_url) ? (
                      <div className="border-2 border-dashed border-red-300 rounded-lg p-8 text-center bg-red-50 dark:bg-red-900/10">
                        <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
                        <p className="text-sm mb-3 text-red-600 dark:text-red-400">
                          Photo link is broken and needs to be re-uploaded
                        </p>
                        <Button 
                          variant="danger" 
                          icon={RefreshCw} 
                          size="sm"
                          onClick={() => handlePhotoUpload('trim_out', true)}
                          loading={uploadingStage === 'trim_out'}
                          disabled={uploadingStage === 'trim_out'}
                        >
                          Re-upload Photo
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="relative group">
                          <img 
                            src={trimOutStage.photo_url} 
                            alt="Trim Out" 
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center">
                            <Button 
                              variant="primary" 
                              icon={RefreshCw} 
                              size="sm"
                              onClick={() => handlePhotoUpload('trim_out', true)}
                              loading={uploadingStage === 'trim_out'}
                              disabled={uploadingStage === 'trim_out'}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Replace Photo
                            </Button>
                          </div>
                        </div>
                        {trimOutStage.completed_at && (
                          <div className="text-xs space-y-1" style={styles.textSecondary}>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(trimOutStage.completed_at).toLocaleDateString()}
                            </div>
                            {trimOutStage.completed_by && (
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {trimOutStage.completed_by}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center" 
                       style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                    <Upload size={32} className="text-yellow-500 mx-auto mb-3" />
                    <p className="text-sm mb-3" style={styles.textSecondary}>
                      Upload photo to complete
                    </p>
                    <Button 
                      variant="primary" 
                      icon={Camera} 
                      size="sm"
                      onClick={() => handlePhotoUpload('trim_out')}
                      loading={uploadingStage === 'trim_out'}
                      disabled={uploadingStage === 'trim_out'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Commission Stage */}
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(commissionStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!commissionStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 3: Commission
                  </h3>
                  {commissionStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {commissionStage?.completed ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle size={16} className="text-green-500" />
                        <span className="font-medium text-green-700 dark:text-green-300">
                          Commissioned
                        </span>
                      </div>
                      {commissionStage.completed_at && (
                        <div className="text-xs space-y-1 text-green-600 dark:text-green-400">
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(commissionStage.completed_at).toLocaleDateString()}
                          </div>
                          {commissionStage.completed_by && (
                            <div className="flex items-center gap-1">
                              <User size={12} />
                              {commissionStage.completed_by}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {commissionStage.notes && (
                      <div className="p-2 rounded text-sm" style={styles.mutedCard}>
                        {commissionStage.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg border-2 border-dashed text-center" 
                         style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                      <AlertCircle size={24} className="text-yellow-500 mx-auto mb-2" />
                      <p className="text-sm mb-2" style={styles.textSecondary}>
                        Requires user approval
                      </p>
                    </div>
                    <textarea
                      value={commissionNotes}
                      onChange={(e) => setCommissionNotes(e.target.value)}
                      placeholder="Commission notes (optional)"
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                    />
                    <Button 
                      variant="primary" 
                      icon={CheckCircle} 
                      className="w-full"
                      onClick={handleCommissionComplete}
                      loading={completingCommission}
                      disabled={completingCommission}
                    >
                      Mark as Commissioned
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'room-end' && (
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                  <Monitor size={20} />
                  Room End Equipment
                </h3>
                <Button 
                  variant="primary" 
                  icon={Save} 
                  size="sm"
                  onClick={handleSaveRoomEnd}
                >
                  Save Room End
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Equipment Type
                  </label>
                  <select
                    value={roomEndData.equipment_type || ''}
                    onChange={(e) => setRoomEndData(prev => ({ ...prev, equipment_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  >
                    <option value="">Select equipment</option>
                    {equipmentTypes.room.map(type => (
                      <option key={type.id} value={type.equipment_type}>
                        {type.equipment_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Equipment Name
                  </label>
                  <input
                    type="text"
                    value={roomEndData.equipment_name || ''}
                    onChange={(e) => setRoomEndData(prev => ({ ...prev, equipment_name: e.target.value }))}
                    placeholder="e.g., Living Room Speaker"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Model
                  </label>
                  <input
                    type="text"
                    value={roomEndData.equipment_model || ''}
                    onChange={(e) => setRoomEndData(prev => ({ ...prev, equipment_model: e.target.value }))}
                    placeholder="Model number"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Location Details
                  </label>
                  <input
                    type="text"
                    value={roomEndData.location_details || ''}
                    onChange={(e) => setRoomEndData(prev => ({ ...prev, location_details: e.target.value }))}
                    placeholder="Specific location in room"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Notes
                  </label>
                  <textarea
                    value={roomEndData.notes || ''}
                    onChange={(e) => setRoomEndData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes about room equipment"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'head-end' && (
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                  <Server size={20} />
                  Head End Equipment
                </h3>
                <Button 
                  variant="primary" 
                  icon={Save} 
                  size="sm"
                  onClick={handleSaveHeadEnd}
                >
                  Save Head End
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Equipment Type
                  </label>
                  <select
                    value={headEndData.equipment_type || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, equipment_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  >
                    <option value="">Select equipment</option>
                    {equipmentTypes.head.map(type => (
                      <option key={type.id} value={type.equipment_type}>
                        {type.equipment_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Equipment Name
                  </label>
                  <input
                    type="text"
                    value={headEndData.equipment_name || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, equipment_name: e.target.value }))}
                    placeholder="e.g., Network Switch"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Port/Connection
                  </label>
                  <input
                    type="text"
                    value={headEndData.port_connection || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, port_connection: e.target.value }))}
                    placeholder="e.g., Port 12"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Rack Location
                  </label>
                  <input
                    type="text"
                    value={headEndData.rack_location || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, rack_location: e.target.value }))}
                    placeholder="e.g., Rack A, U12"
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Network Configuration
                  </label>
                  <textarea
                    value={headEndData.network_config || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, network_config: e.target.value }))}
                    placeholder="VLAN, IP range, or other network details"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                    Notes
                  </label>
                  <textarea
                    value={headEndData.notes || ''}
                    onChange={(e) => setHeadEndData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes about head end equipment"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                    style={styles.input}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={styles.card}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={styles.textPrimary}>
                <AlertTriangle size={20} className="text-red-500" />
                Delete Wire Drop?
              </h3>
              <p className="text-sm mb-6" style={styles.textSecondary}>
                Are you sure you want to delete this wire drop? This action cannot be undone and will remove all associated data including photos, equipment details, and stage progress.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger" 
                  icon={Trash2}
                  onClick={handleDeleteWireDrop}
                  loading={deleting}
                  disabled={deleting}
                  className="flex-1"
                >
                  Delete Wire Drop
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WireDropDetailEnhanced;
