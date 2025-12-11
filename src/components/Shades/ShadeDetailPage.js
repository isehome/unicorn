import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Ruler, Camera, CheckCircle, Lock, ExternalLink,
    MessageSquare, Send, Info, Loader2, Plus, ChevronDown, ChevronRight
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePhotoViewer } from '../photos/PhotoViewerProvider';
import Button from '../ui/Button';
import CachedSharePointImage from '../CachedSharePointImage';
import { projectShadeService } from '../../services/projectShadeService';
import { shadePhotoService } from '../../services/shadePhotoService';
import { supabase } from '../../lib/supabase';

// Headrail style options
const HEADRAIL_STYLES = ['Pocket', 'Fascia', 'Fascia + Top Back Cover', 'Top Back Cover'];
const MOUNT_TYPES = ['Inside', 'Outside'];

const ShadeDetailPage = () => {
    const { projectId, shadeId } = useParams();
    const navigate = useNavigate();
    const { mode } = useTheme();
    const { user } = useAuth();
    const { openPhotoViewer, closePhotoViewer, updatePhotoViewerOptions } = usePhotoViewer();

    // Loading states
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [photoLoading, setPhotoLoading] = useState(null);

    // Data
    const [shade, setShade] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [error, setError] = useState(null);

    // Headrail info modal state
    const [showHeadrailInfo, setShowHeadrailInfo] = useState(false);

    // Header field states
    const [headerMountType, setHeaderMountType] = useState('');
    const [headerHeadrailStyle, setHeaderHeadrailStyle] = useState('');

    // Shared shade-level fields
    const [orderedWidth, setOrderedWidth] = useState('');
    const [orderedHeight, setOrderedHeight] = useState('');
    const [orderedDepth, setOrderedDepth] = useState('');
    const [pocketWidth, setPocketWidth] = useState('');
    const [pocketHeight, setPocketHeight] = useState('');
    const [pocketDepth, setPocketDepth] = useState('');
    const [installationNotes, setInstallationNotes] = useState('');

    // Comments state
    const [commentsExpanded, setCommentsExpanded] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isPublicComment, setIsPublicComment] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Measurement tab state
    const [activeTab, setActiveTab] = useState('m1');

    // Measurement form - 3 widths (top, middle, bottom), 1 height, mount depth
    const [formData, setFormData] = useState({
        widthTop: '',
        widthMiddle: '',
        widthBottom: '',
        height: '',
        mountDepth: ''
    });

    // Blinding logic
    const isM1Blind = shade?.m1_complete && shade?.m1_by !== user?.id;
    const isM2Blind = shade?.m2_complete && shade?.m2_by !== user?.id;

    // Load shade data
    const loadShade = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('project_shades')
                .select(`
                    *,
                    room:project_rooms(id, name)
                `)
                .eq('id', shadeId)
                .single();

            if (fetchError) throw fetchError;
            setShade(data);

            // Initialize form fields
            setHeaderMountType(data.mount_type || '');
            setHeaderHeadrailStyle(data.headrail_style || '');
            setOrderedWidth(data.ordered_width || '');
            setOrderedHeight(data.ordered_height || '');
            setOrderedDepth(data.ordered_depth || '');
            setPocketWidth(data.pocket_width || '');
            setPocketHeight(data.pocket_height || '');
            setPocketDepth(data.pocket_depth || '');
            setInstallationNotes(data.installation_notes || '');

            // Determine default tab
            if (data.m1_complete && !data.m2_complete) {
                setActiveTab('m2');
            }

            // Initialize measurement form
            const set = data.m1_complete && !data.m2_complete ? 'm2' : 'm1';
            setFormData({
                widthTop: data?.[`${set}_measure_width_top`] || '',
                widthMiddle: data?.[`${set}_measure_width_middle`] || '',
                widthBottom: data?.[`${set}_measure_width_bottom`] || '',
                height: data?.[`${set}_height`] || data?.[`${set}_measure_height_center`] || '',
                mountDepth: data?.[`${set}_mount_depth`] || ''
            });

        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load shade:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [shadeId]);

    // Load photos (all photos for this shade, not per measurement set)
    const loadPhotos = useCallback(async () => {
        try {
            const allPhotos = await shadePhotoService.getPhotos(shadeId);
            setPhotos(allPhotos);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load photos:', err);
        }
    }, [shadeId]);

    // Load comments
    const loadComments = useCallback(async () => {
        if (!commentsExpanded) return;
        setLoadingComments(true);
        try {
            const { data, error: fetchError } = await supabase
                .from('shade_comments')
                .select('*')
                .eq('shade_id', shadeId)
                .order('created_at', { ascending: true });
            if (fetchError) throw fetchError;
            setComments(data || []);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load comments:', err);
        } finally {
            setLoadingComments(false);
        }
    }, [shadeId, commentsExpanded]);

    useEffect(() => {
        loadShade();
        loadPhotos();
    }, [loadShade, loadPhotos]);

    useEffect(() => {
        if (commentsExpanded) {
            loadComments();
        }
    }, [commentsExpanded, loadComments]);

    // Handle tab change - reload form data for new measurement set
    useEffect(() => {
        if (shade && (activeTab === 'm1' || activeTab === 'm2')) {
            setFormData({
                widthTop: shade?.[`${activeTab}_measure_width_top`] || '',
                widthMiddle: shade?.[`${activeTab}_measure_width_middle`] || '',
                widthBottom: shade?.[`${activeTab}_measure_width_bottom`] || '',
                height: shade?.[`${activeTab}_height`] || shade?.[`${activeTab}_measure_height_center`] || '',
                mountDepth: shade?.[`${activeTab}_mount_depth`] || ''
            });
        }
    }, [shade, activeTab]);

    // Debounce timer for auto-save
    const autoSaveTimerRef = useRef(null);

    // Auto-save shade-level field
    const autoSaveShadeField = useCallback(async (field, value) => {
        if (!shadeId) return;
        try {
            await supabase
                .from('project_shades')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', shadeId);
            console.log(`[ShadeDetailPage] Auto-saved ${field}`);
        } catch (err) {
            console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
        }
    }, [shadeId]);

    // Auto-save measurement field (debounced)
    const autoSaveMeasurementField = useCallback((field, value) => {
        if (!shadeId) return;

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                // Map form fields to database columns
                const fieldMapping = {
                    'widthTop': `${activeTab}_measure_width_top`,
                    'widthMiddle': `${activeTab}_measure_width_middle`,
                    'widthBottom': `${activeTab}_measure_width_bottom`,
                    'height': `${activeTab}_height`,
                    'mountDepth': `${activeTab}_mount_depth`
                };

                const dbColumn = fieldMapping[field];
                if (!dbColumn) return;

                await supabase
                    .from('project_shades')
                    .update({ [dbColumn]: value, updated_at: new Date().toISOString() })
                    .eq('id', shadeId);
                console.log(`[ShadeDetailPage] Auto-saved ${field} -> ${dbColumn}`);
            } catch (err) {
                console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
            }
        }, 500);
    }, [shadeId, activeTab]);

    const handleMeasurementChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        autoSaveMeasurementField(field, value);
    }, [autoSaveMeasurementField]);

    // Header field handlers with auto-save
    const handleHeaderMountTypeChange = (value) => {
        setHeaderMountType(value);
        autoSaveShadeField('mount_type', value);
    };

    const handleHeaderHeadrailStyleChange = (value) => {
        setHeaderHeadrailStyle(value);
        autoSaveShadeField('headrail_style', value);
    };

    // Shared field handlers with auto-save
    const handleOrderedWidthChange = (value) => { setOrderedWidth(value); autoSaveShadeField('ordered_width', value); };
    const handleOrderedHeightChange = (value) => { setOrderedHeight(value); autoSaveShadeField('ordered_height', value); };
    const handleOrderedDepthChange = (value) => { setOrderedDepth(value); autoSaveShadeField('ordered_depth', value); };
    const handlePocketWidthChange = (value) => { setPocketWidth(value); autoSaveShadeField('pocket_width', value); };
    const handlePocketHeightChange = (value) => { setPocketHeight(value); autoSaveShadeField('pocket_height', value); };
    const handlePocketDepthChange = (value) => { setPocketDepth(value); autoSaveShadeField('pocket_depth', value); };
    const handleInstallationNotesChange = (value) => { setInstallationNotes(value); autoSaveShadeField('installation_notes', value); };

    // Photo upload - photos are shared across measurement sets
    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const newPhoto = await shadePhotoService.uploadPhoto({
                shadeId,
                projectId,
                measurementSet: activeTab, // Still track which measurement set it was added from
                file,
                user: { id: user?.id, name: user?.name || user?.displayName }
            });

            setPhotos(prev => [...prev, newPhoto]);
        } catch (err) {
            console.error('[ShadeDetailPage] Upload failed:', err);
            alert('Failed to upload photo: ' + err.message);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    // Open photo in fullscreen viewer
    const openPhotoFullscreen = (photo) => {
        const payload = shadePhotoService.buildPhotoViewerPayload(photo);
        openPhotoViewer(payload, {
            canEdit: true,
            replaceMode: 'file',
            loading: photoLoading === photo.id,
            onReplace: (file) => handleReplacePhoto(photo.id, file),
            onDelete: () => handleDeletePhoto(photo.id)
        });
    };

    // Replace photo
    const handleReplacePhoto = async (photoId, file) => {
        try {
            setPhotoLoading(photoId);
            updatePhotoViewerOptions({ loading: true });

            const updatedPhoto = await shadePhotoService.replacePhoto(photoId, file, {
                id: user?.id,
                name: user?.name || user?.displayName
            });

            setPhotos(prev => prev.map(p => p.id === photoId ? updatedPhoto : p));

            const payload = shadePhotoService.buildPhotoViewerPayload(updatedPhoto);
            openPhotoViewer(payload, {
                canEdit: true,
                replaceMode: 'file',
                loading: false,
                onReplace: (newFile) => handleReplacePhoto(photoId, newFile),
                onDelete: () => handleDeletePhoto(photoId)
            });
        } catch (err) {
            console.error('[ShadeDetailPage] Replace failed:', err);
            alert('Failed to replace photo: ' + err.message);
        } finally {
            setPhotoLoading(null);
            updatePhotoViewerOptions({ loading: false });
        }
    };

    // Delete photo
    const handleDeletePhoto = async (photoId) => {
        const confirmed = window.confirm('Delete this photo?');
        if (!confirmed) return;

        try {
            setPhotoLoading(photoId);
            updatePhotoViewerOptions({ loading: true });

            await shadePhotoService.deletePhoto(photoId, { id: user?.id });
            setPhotos(prev => prev.filter(p => p.id !== photoId));
            closePhotoViewer();
        } catch (err) {
            console.error('[ShadeDetailPage] Delete failed:', err);
            alert('Failed to delete photo: ' + err.message);
        } finally {
            setPhotoLoading(null);
            updatePhotoViewerOptions({ loading: false });
        }
    };

    // Mark measurement complete
    const handleMarkComplete = async () => {
        try {
            const updates = {
                [`${activeTab}_complete`]: true,
                [`${activeTab}_date`]: new Date().toISOString(),
                [`${activeTab}_by`]: user?.id,
                updated_at: new Date().toISOString()
            };

            await supabase
                .from('project_shades')
                .update(updates)
                .eq('id', shadeId);

            await loadShade();
        } catch (err) {
            console.error('[ShadeDetailPage] Mark complete failed:', err);
            alert('Failed to mark complete: ' + err.message);
        }
    };

    // Submit comment
    const handleSubmitComment = async () => {
        if (!newComment.trim() || submittingComment) return;
        setSubmittingComment(true);
        try {
            const { data, error: insertError } = await supabase
                .from('shade_comments')
                .insert([{
                    shade_id: shadeId,
                    project_id: projectId,
                    comment_text: newComment.trim(),
                    is_internal: !isPublicComment,
                    author_id: user?.id,
                    author_name: user?.name || user?.displayName || 'Staff',
                    author_email: user?.email
                }])
                .select()
                .single();
            if (insertError) throw insertError;
            setComments(prev => [...prev, data]);
            setNewComment('');
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to add comment:', err);
            alert('Failed to add comment: ' + err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <p className="text-red-500">{error}</p>
                <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
            </div>
        );
    }

    const showBlinded = (activeTab === 'm1' && isM1Blind) || (activeTab === 'm2' && isM2Blind);

    return (
        <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
            {/* Fixed Header */}
            <div className={`sticky top-0 z-10 border-b ${mode === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(`/projects/${projectId}/shades`)}
                            className={`p-2 rounded-lg transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className={`text-lg font-semibold truncate ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                {shade?.name}
                            </h1>
                            <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                {shade?.room?.name || 'Unassigned'} • <span className="text-violet-500">{shade?.technology}</span>
                            </p>
                        </div>
                        {shade?.equipment_id && (
                            <div className={`text-xs px-2 py-1 rounded flex-shrink-0 ${mode === 'dark' ? 'bg-violet-900/30 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>
                                Linked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-8">

                {/* Section 1: Quoted Specs */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Width</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_width || '-'}"</span>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Height</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_height || '-'}"</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Fabric</span>
                            {shade?.fabric_selection ? (
                                <a
                                    href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(shade.fabric_selection)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`font-medium hover:underline flex items-center gap-1 ${mode === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}
                                >
                                    {shade.fabric_selection}
                                    <ExternalLink size={12} />
                                </a>
                            ) : (
                                <span className="text-zinc-400">Not Selected</span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Mount Type</span>
                            <select
                                value={headerMountType}
                                onChange={(e) => handleHeaderMountTypeChange(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                style={{ fontSize: '16px' }}
                            >
                                <option value="">Select...</option>
                                {MOUNT_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs text-zinc-400 uppercase tracking-wider">Headrail</span>
                                <button
                                    type="button"
                                    onClick={() => setShowHeadrailInfo(true)}
                                    className="p-0.5 rounded-full text-zinc-400 hover:text-zinc-600"
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <select
                                value={headerHeadrailStyle}
                                onChange={(e) => handleHeaderHeadrailStyleChange(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                style={{ fontSize: '16px' }}
                            >
                                <option value="">Select...</option>
                                {HEADRAIL_STYLES.map(style => (
                                    <option key={style} value={style}>{style}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section 2: Installation & Pockets */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                    <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>Installation & Pockets</h4>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                        <InputField label="Pocket W" value={pocketWidth} onChange={handlePocketWidthChange} mode={mode} />
                        <InputField label="Pocket H" value={pocketHeight} onChange={handlePocketHeightChange} mode={mode} />
                        <InputField label="Pocket D" value={pocketDepth} onChange={handlePocketDepthChange} mode={mode} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1 text-zinc-500">Installation Notes</label>
                        <textarea
                            value={installationNotes}
                            onChange={e => handleInstallationNotesChange(e.target.value)}
                            rows={2}
                            placeholder="Notes, obstructions, special instructions..."
                            className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                            style={{ fontSize: '16px' }}
                        />
                    </div>
                </div>

                {/* Section 3: Final Ordered Dimensions */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-violet-900/10 border-violet-800/30' : 'bg-violet-50 border-violet-100'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                        <Ruler size={16} /> Final Ordered Dimensions
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                        <InputField label="Width" value={orderedWidth} onChange={handleOrderedWidthChange} mode={mode} highlight />
                        <InputField label="Height" value={orderedHeight} onChange={handleOrderedHeightChange} mode={mode} highlight />
                        <InputField label="Depth" value={orderedDepth} onChange={handleOrderedDepthChange} mode={mode} highlight />
                    </div>
                </div>

                {/* Section 4: Install Photos */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                        <Camera size={16} /> Install Photos
                    </h4>
                    <div className="space-y-3">
                        {photos.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {photos.map((photo) => (
                                    <button
                                        key={photo.id}
                                        onClick={() => openPhotoFullscreen(photo)}
                                        className={`relative aspect-square rounded-lg overflow-hidden border transition-all hover:ring-2 hover:ring-violet-500 ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}
                                    >
                                        <CachedSharePointImage
                                            sharePointUrl={photo.photo_url}
                                            sharePointDriveId={photo.sharepoint_drive_id}
                                            sharePointItemId={photo.sharepoint_item_id}
                                            displayType="thumbnail"
                                            className="w-full h-full object-cover"
                                            alt={photo.file_name || 'Photo'}
                                        />
                                        {photoLoading === photo.id && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        <label className={`flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${mode === 'dark' ? 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'}`}>
                            {uploading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin text-violet-500" />
                                    <span className="text-sm text-zinc-500">Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Plus size={18} className="text-zinc-400" />
                                    <span className="text-sm text-zinc-500">Add Photo</span>
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handlePhotoUpload}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>

                {/* Section 5: Comments (Collapsible) */}
                <div className={`rounded-xl border overflow-hidden ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <button
                        onClick={() => setCommentsExpanded(!commentsExpanded)}
                        className={`w-full p-4 flex items-center justify-between transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50'}`}
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare size={16} className="text-zinc-400" />
                            <span className={`text-sm font-semibold ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                Comments
                            </span>
                            {comments.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs rounded-full bg-violet-100 text-violet-600">{comments.length}</span>
                            )}
                        </div>
                        {commentsExpanded ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                    </button>

                    {commentsExpanded && (
                        <div className={`p-4 pt-0 space-y-3 border-t ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                            {loadingComments ? (
                                <div className="py-4 text-center text-zinc-400">Loading...</div>
                            ) : comments.length === 0 ? (
                                <div className="py-4 text-center text-zinc-400 text-sm">No comments yet</div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {comments.map(comment => (
                                        <div
                                            key={comment.id}
                                            className={`p-2 rounded-lg text-sm ${comment.is_internal === false
                                                ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/30'
                                                : mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'
                                            }`}
                                        >
                                            <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                                <span>{comment.author_name}</span>
                                                <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <p className={mode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}>{comment.comment_text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add Comment */}
                            <div className="flex gap-2 pt-2">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                    style={{ fontSize: '16px' }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmitComment();
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleSubmitComment}
                                    disabled={!newComment.trim() || submittingComment}
                                    className="px-3 py-2 bg-violet-500 text-white rounded-lg disabled:opacity-50"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 6: Measurement Tabs */}
                <div className={`rounded-xl border overflow-hidden ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    {/* Tab Headers */}
                    <div className={`flex border-b ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                        <button
                            onClick={() => setActiveTab('m1')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm1'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1">
                                Measure 1
                                {shade?.m1_complete && <CheckCircle size={14} style={{ color: '#94AF32' }} />}
                                {isM1Blind && <Lock size={14} className="text-zinc-400" />}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('m2')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm2'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1">
                                Measure 2
                                {shade?.m2_complete && <CheckCircle size={14} style={{ color: '#94AF32' }} />}
                                {isM2Blind && <Lock size={14} className="text-zinc-400" />}
                            </span>
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="p-4">
                        {showBlinded ? (
                            <div className="py-8 text-center">
                                <Lock size={32} className="mx-auto text-zinc-300 mb-2" />
                                <p className="text-zinc-500 text-sm">Data masked for blind verification</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Width measurements - 3 fields */}
                                <div>
                                    <p className={`text-xs uppercase font-medium mb-2 ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                        Rough Opening Width
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <InputField
                                            label="Top"
                                            value={formData.widthTop}
                                            onChange={(v) => handleMeasurementChange('widthTop', v)}
                                            mode={mode}
                                        />
                                        <InputField
                                            label="Middle"
                                            value={formData.widthMiddle}
                                            onChange={(v) => handleMeasurementChange('widthMiddle', v)}
                                            mode={mode}
                                        />
                                        <InputField
                                            label="Bottom"
                                            value={formData.widthBottom}
                                            onChange={(v) => handleMeasurementChange('widthBottom', v)}
                                            mode={mode}
                                        />
                                    </div>
                                </div>

                                {/* Height and Mount Depth - single fields */}
                                <div className="grid grid-cols-2 gap-3">
                                    <InputField
                                        label="Height"
                                        value={formData.height}
                                        onChange={(v) => handleMeasurementChange('height', v)}
                                        mode={mode}
                                    />
                                    <InputField
                                        label="Mount Depth"
                                        value={formData.mountDepth}
                                        onChange={(v) => handleMeasurementChange('mountDepth', v)}
                                        mode={mode}
                                    />
                                </div>

                                {!shade?.[`${activeTab}_complete`] && (
                                    <button
                                        onClick={handleMarkComplete}
                                        className="w-full mt-4 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={18} />
                                        Mark {activeTab === 'm1' ? 'M1' : 'M2'} Complete
                                    </button>
                                )}

                                {shade?.[`${activeTab}_complete`] && (
                                    <div className="mt-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl text-center text-sm font-medium flex items-center justify-center gap-2">
                                        <CheckCircle size={18} />
                                        {activeTab === 'm1' ? 'M1' : 'M2'} Complete
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Headrail Style Info Modal */}
            {showHeadrailInfo && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowHeadrailInfo(false)}
                >
                    <div
                        className={`relative max-w-2xl w-full rounded-2xl shadow-xl overflow-hidden ${mode === 'dark' ? 'bg-zinc-900' : 'bg-white'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`flex items-center justify-between p-4 border-b ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                            <h3 className={`text-lg font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                Headrail Style Options
                            </h3>
                            <button
                                onClick={() => setShowHeadrailInfo(false)}
                                className={`p-2 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                            >
                                <ArrowLeft size={20} />
                            </button>
                        </div>
                        <div className="p-4 max-h-[70vh] overflow-y-auto">
                            <img
                                src="/images/headrail-styles.png"
                                alt="Headrail Style Options"
                                className="w-full h-auto max-h-[65vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Reusable input field component
const InputField = ({ label, value, onChange, mode, highlight }) => (
    <div>
        <label className="block text-xs font-medium mb-1 text-zinc-500">{label}</label>
        <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm ${highlight
                ? 'font-semibold border-violet-300 dark:border-violet-600'
                : ''
            } ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
            style={{ fontSize: '16px' }}
        />
    </div>
);

export default ShadeDetailPage;
