import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Ruler, Camera, CheckCircle, Lock, ExternalLink,
    MessageSquare, Send, Info, Loader2, Trash2, Plus
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePhotoViewer } from '../photos/PhotoViewerProvider';
import Button from '../ui/Button';
import CachedSharePointImage from '../CachedSharePointImage';
import { projectShadeService } from '../../services/projectShadeService';
import { shadePhotoService } from '../../services/shadePhotoService';
import { supabase } from '../../lib/supabase';
import { useShadeTools } from '../../hooks/useShadeTools';

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
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [photoLoading, setPhotoLoading] = useState(null); // Track which photo is loading

    // Data
    const [shade, setShade] = useState(null);
    const [photos, setPhotos] = useState({ m1: [], m2: [] });
    const [error, setError] = useState(null);

    // Voice AI active field highlighting
    const [activeField, setActiveField] = useState(null);

    // Headrail info modal state
    const [showHeadrailInfo, setShowHeadrailInfo] = useState(false);

    // Header field states (quoted specs that can be edited)
    const [headerMountType, setHeaderMountType] = useState('');
    const [headerHeadrailStyle, setHeaderHeadrailStyle] = useState('');

    // Shared shade-level fields (not per-measurement)
    const [orderedWidth, setOrderedWidth] = useState('');
    const [orderedHeight, setOrderedHeight] = useState('');
    const [orderedDepth, setOrderedDepth] = useState('');
    const [pocketWidth, setPocketWidth] = useState('');
    const [pocketHeight, setPocketHeight] = useState('');
    const [pocketDepth, setPocketDepth] = useState('');
    const [installationNotes, setInstallationNotes] = useState('');

    // Comments state
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isPublicComment, setIsPublicComment] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Tab state
    const [activeTab, setActiveTab] = useState('m1');

    // Measurement form data
    const [formData, setFormData] = useState({
        widthTop: '',
        widthMiddle: '',
        widthBottom: '',
        heightLeft: '',
        heightCenter: '',
        heightRight: '',
        mountDepth: '',
        mountType: ''
    });

    // Blinding logic (for blind verification workflow)
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
                    room:project_rooms(id, name),
                    equipment:project_equipment(id, name, equipment_type)
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

            // Initialize form data for current tab
            initializeFormData(data, data.m1_complete && !data.m2_complete ? 'm2' : 'm1');

        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load shade:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [shadeId]);

    // Load photos
    const loadPhotos = useCallback(async () => {
        try {
            const allPhotos = await shadePhotoService.getPhotos(shadeId);
            const grouped = { m1: [], m2: [] };
            allPhotos.forEach(photo => {
                if (photo.measurement_set === 'm1') {
                    grouped.m1.push(photo);
                } else if (photo.measurement_set === 'm2') {
                    grouped.m2.push(photo);
                }
            });
            setPhotos(grouped);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load photos:', err);
        }
    }, [shadeId]);

    // Load comments
    const loadComments = useCallback(async () => {
        if (activeTab !== 'comments') return;
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
    }, [shadeId, activeTab]);

    useEffect(() => {
        loadShade();
        loadPhotos();
    }, [loadShade, loadPhotos]);

    useEffect(() => {
        if (activeTab === 'comments') {
            loadComments();
        }
    }, [activeTab, loadComments]);

    // Initialize form data for a measurement set
    const initializeFormData = (shadeData, set) => {
        setFormData({
            widthTop: shadeData?.[`${set}_measure_width_top`] || '',
            widthMiddle: shadeData?.[`${set}_measure_width_middle`] || '',
            widthBottom: shadeData?.[`${set}_measure_width_bottom`] || '',
            heightLeft: shadeData?.[`${set}_measure_height_left`] || '',
            heightCenter: shadeData?.[`${set}_measure_height_center`] || '',
            heightRight: shadeData?.[`${set}_measure_height_right`] || '',
            mountDepth: shadeData?.[`${set}_mount_depth`] || '',
            mountType: shadeData?.[`${set}_mount_type`] || shadeData?.mount_type || ''
        });
    };

    // Handle tab change
    useEffect(() => {
        if (shade && (activeTab === 'm1' || activeTab === 'm2')) {
            initializeFormData(shade, activeTab);
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
                .update({ [field]: value })
                .eq('id', shadeId);
            console.log(`[ShadeDetailPage] Auto-saved ${field}`);
        } catch (err) {
            console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
        }
    }, [shadeId]);

    // Auto-save measurement field (debounced)
    const autoSaveField = useCallback((field, value) => {
        if (!shadeId) return;

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                await projectShadeService.autoSaveMeasurementField(
                    shadeId,
                    field,
                    value,
                    activeTab
                );
                console.log(`[ShadeDetailPage] Auto-saved ${field}`);
            } catch (err) {
                console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
            }
        }, 500);
    }, [shadeId, activeTab]);

    const handleChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        autoSaveField(field, value);
    }, [autoSaveField]);

    // Header field handlers
    const handleHeaderMountTypeChange = (value) => {
        setHeaderMountType(value);
        autoSaveShadeField('mount_type', value);
    };

    const handleHeaderHeadrailStyleChange = (value) => {
        setHeaderHeadrailStyle(value);
        autoSaveShadeField('headrail_style', value);
    };

    // Shared shade-level field handlers
    const handleOrderedWidthChange = (value) => { setOrderedWidth(value); autoSaveShadeField('ordered_width', value); };
    const handleOrderedHeightChange = (value) => { setOrderedHeight(value); autoSaveShadeField('ordered_height', value); };
    const handleOrderedDepthChange = (value) => { setOrderedDepth(value); autoSaveShadeField('ordered_depth', value); };
    const handlePocketWidthChange = (value) => { setPocketWidth(value); autoSaveShadeField('pocket_width', value); };
    const handlePocketHeightChange = (value) => { setPocketHeight(value); autoSaveShadeField('pocket_height', value); };
    const handlePocketDepthChange = (value) => { setPocketDepth(value); autoSaveShadeField('pocket_depth', value); };
    const handleInstallationNotesChange = (value) => { setInstallationNotes(value); autoSaveShadeField('installation_notes', value); };

    // Photo upload
    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const newPhoto = await shadePhotoService.uploadPhoto({
                shadeId,
                projectId,
                measurementSet: activeTab,
                file,
                user: { id: user?.id, name: user?.name || user?.displayName }
            });

            // Add to local state
            setPhotos(prev => ({
                ...prev,
                [activeTab]: [...prev[activeTab], newPhoto]
            }));
        } catch (err) {
            console.error('[ShadeDetailPage] Upload failed:', err);
            alert('Failed to upload photo: ' + err.message);
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
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

            // Update local state
            setPhotos(prev => ({
                ...prev,
                [activeTab]: prev[activeTab].map(p => p.id === photoId ? updatedPhoto : p)
            }));

            // Reopen viewer with updated photo
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

            // Update local state
            setPhotos(prev => ({
                ...prev,
                [activeTab]: prev[activeTab].filter(p => p.id !== photoId)
            }));

            closePhotoViewer();
        } catch (err) {
            console.error('[ShadeDetailPage] Delete failed:', err);
            alert('Failed to delete photo: ' + err.message);
        } finally {
            setPhotoLoading(null);
            updatePhotoViewerOptions({ loading: false });
        }
    };

    // Save and mark complete
    const handleSaveComplete = async () => {
        try {
            setSaving(true);
            await projectShadeService.updateMeasurements(shadeId, formData, user?.id, activeTab);
            await loadShade(); // Refresh to get updated completion status
            // Navigate back or stay on page
        } catch (err) {
            console.error('[ShadeDetailPage] Save failed:', err);
            alert('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
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

    // Voice AI tools integration
    useShadeTools({
        formData,
        setFormData,
        activeTab,
        shade,
        onClose: () => navigate(`/projects/${projectId}/shades`),
        onSave: handleSaveComplete,
        setActiveField
    });

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
    const currentPhotos = photos[activeTab] || [];

    return (
        <div className={`min-h-screen pb-24 ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
            {/* Header */}
            <div className={`sticky top-0 z-10 border-b ${mode === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate(`/projects/${projectId}/shades`)}
                                className={`p-2 rounded-lg transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div>
                                <h1 className={`text-lg font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                    {shade?.name}
                                </h1>
                                <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                    {shade?.room?.name || 'Unassigned'} • <span className="text-violet-500">{shade?.technology}</span>
                                </p>
                            </div>
                        </div>
                        {shade?.equipment && (
                            <div className={`text-xs px-2 py-1 rounded ${mode === 'dark' ? 'bg-violet-900/30 text-violet-300' : 'bg-violet-100 text-violet-700'}`}>
                                Linked to Equipment
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-4xl mx-auto px-4">
                    <div className="flex border-b border-transparent">
                        <button
                            onClick={() => setActiveTab('m1')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm1'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500 hover:text-zinc-700'
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
                                : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1">
                                Measure 2
                                {shade?.m2_complete && <CheckCircle size={14} style={{ color: '#94AF32' }} />}
                                {isM2Blind && <Lock size={14} className="text-zinc-400" />}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('comments')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${activeTab === 'comments'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                        >
                            <MessageSquare size={14} />
                            Comments {comments.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-violet-100 text-violet-600">{comments.length}</span>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-6">
                {activeTab === 'comments' ? (
                    /* Comments Tab */
                    <div className="space-y-4">
                        <div className={`rounded-xl border p-4 min-h-[200px] max-h-[400px] overflow-y-auto ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                            {loadingComments ? (
                                <div className="flex items-center justify-center h-32 text-zinc-400">Loading comments...</div>
                            ) : comments.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-32 text-zinc-400">
                                    <MessageSquare size={32} className="mb-2 opacity-50" />
                                    <p>No comments yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {comments.map(comment => (
                                        <div
                                            key={comment.id}
                                            className={`p-3 rounded-xl border ${comment.is_internal === false
                                                ? 'border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-900/10'
                                                : mode === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <span className={`text-sm font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                                    {comment.author_name || 'Unknown'}
                                                </span>
                                                <span className="text-xs text-zinc-400">
                                                    {new Date(comment.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className={`text-sm ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                {comment.comment_text}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add Comment */}
                        <div className={`rounded-xl border p-4 ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none mb-3">
                                <input
                                    type="checkbox"
                                    checked={isPublicComment}
                                    onChange={(e) => setIsPublicComment(e.target.checked)}
                                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className={isPublicComment ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-zinc-500 dark:text-zinc-400'}>
                                    Visible to External Stakeholders
                                </span>
                            </label>
                            <div className="flex gap-2">
                                <textarea
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder={isPublicComment ? "Write a public comment..." : "Write an internal comment..."}
                                    rows={2}
                                    className={`flex-1 px-3 py-2 rounded-xl border resize-none ${isPublicComment
                                        ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/50'
                                        : mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
                                    }`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmitComment();
                                        }
                                    }}
                                />
                                <Button
                                    variant="primary"
                                    icon={Send}
                                    onClick={handleSubmitComment}
                                    disabled={!newComment.trim() || submittingComment}
                                >
                                    {submittingComment ? 'Sending...' : 'Send'}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : showBlinded ? (
                    /* Blinded View */
                    <div className="h-48 flex flex-col items-center justify-center text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-700">
                        <Lock size={48} className="text-zinc-300 mb-4" />
                        <h3 className="text-lg font-medium text-zinc-500">
                            {activeTab === 'm1' ? 'Measure 1' : 'Measure 2'} is Complete
                        </h3>
                        <p className="text-sm text-zinc-400 mt-2">
                            Data masked for blind verification.
                            {activeTab === 'm1' && !isM2Blind && ' Switch to Measure 2.'}
                            {activeTab === 'm2' && !isM1Blind && ' Switch to Measure 1.'}
                        </p>
                    </div>
                ) : (
                    /* Measurement Form */
                    <div className="space-y-6">
                        {/* Quoted Specs */}
                        <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Width</span>
                                    <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_width}"</span>
                                </div>
                                <div>
                                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Height</span>
                                    <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_height}"</span>
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
                                        <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>Not Selected</span>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Mount Type</span>
                                    <select
                                        value={headerMountType}
                                        onChange={(e) => handleHeaderMountTypeChange(e.target.value)}
                                        className={`w-full px-3 py-1.5 rounded-lg border text-sm font-medium ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
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
                                        <span className="text-xs text-zinc-400 uppercase tracking-wider">Headrail Style</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowHeadrailInfo(true)}
                                            className={`p-0.5 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-400'}`}
                                            title="View headrail style options"
                                        >
                                            <Info size={14} />
                                        </button>
                                    </div>
                                    <select
                                        value={headerHeadrailStyle}
                                        onChange={(e) => handleHeaderHeadrailStyleChange(e.target.value)}
                                        className={`w-full px-3 py-1.5 rounded-lg border text-sm font-medium ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
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

                        {/* Final Ordered Dimensions */}
                        <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-violet-900/10 border-violet-800/30' : 'bg-violet-50 border-violet-100'}`}>
                            <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                                <Ruler size={16} /> Final Ordered Dimensions
                            </h4>
                            <div className="grid grid-cols-3 gap-4">
                                <InputFinal label="Width" value={orderedWidth} onChange={handleOrderedWidthChange} mode={mode} />
                                <InputFinal label="Height" value={orderedHeight} onChange={handleOrderedHeightChange} mode={mode} />
                                <InputFinal label="Depth" value={orderedDepth} onChange={handleOrderedDepthChange} mode={mode} />
                            </div>
                        </div>

                        {/* Installation & Pockets */}
                        <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                            <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>Installation & Pockets</h4>
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <InputFinal label="Pocket Width" value={pocketWidth} onChange={handlePocketWidthChange} mode={mode} />
                                    <InputFinal label="Pocket Height" value={pocketHeight} onChange={handlePocketHeightChange} mode={mode} />
                                    <InputFinal label="Pocket Depth" value={pocketDepth} onChange={handlePocketDepthChange} mode={mode} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1.5 text-zinc-500">Installation Notes</label>
                                    <textarea
                                        value={installationNotes}
                                        onChange={e => handleInstallationNotesChange(e.target.value)}
                                        rows={2}
                                        placeholder="Enter any installation notes, obstructions, or special instructions..."
                                        className={`w-full px-3 py-2 rounded-lg border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Rough Opening Measurements */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className={`text-xs font-medium uppercase ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Rough Opening Width</label>
                                    <div className="space-y-2">
                                        <InputGroup label="Top" value={formData.widthTop} onChange={v => handleChange('widthTop', v)} mode={mode} highlighted={activeField === 'widthTop'} />
                                        <InputGroup label="Middle" value={formData.widthMiddle} onChange={v => handleChange('widthMiddle', v)} mode={mode} highlighted={activeField === 'widthMiddle'} />
                                        <InputGroup label="Bottom" value={formData.widthBottom} onChange={v => handleChange('widthBottom', v)} mode={mode} highlighted={activeField === 'widthBottom'} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className={`text-xs font-medium uppercase ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Rough Opening Height</label>
                                    <div className="space-y-2">
                                        <InputGroup label="Left" value={formData.heightLeft} onChange={v => handleChange('heightLeft', v)} mode={mode} highlighted={activeField === 'heightLeft'} />
                                        <InputGroup label="Center" value={formData.heightCenter} onChange={v => handleChange('heightCenter', v)} mode={mode} highlighted={activeField === 'heightCenter'} />
                                        <InputGroup label="Right" value={formData.heightRight} onChange={v => handleChange('heightRight', v)} mode={mode} highlighted={activeField === 'heightRight'} />
                                    </div>
                                </div>
                            </div>

                            {/* Photos */}
                            <div>
                                <label className={`block text-sm font-medium mb-3 ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                    Verification Photos ({activeTab === 'm1' ? 'M1' : 'M2'})
                                </label>
                                <div className="space-y-3">
                                    {/* Photo Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {currentPhotos.map((photo) => (
                                            <button
                                                key={photo.id}
                                                onClick={() => openPhotoFullscreen(photo)}
                                                className={`relative aspect-video rounded-lg overflow-hidden border transition-all hover:ring-2 hover:ring-violet-500 ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}
                                            >
                                                <CachedSharePointImage
                                                    sharePointUrl={photo.photo_url}
                                                    sharePointDriveId={photo.sharepoint_drive_id}
                                                    sharePointItemId={photo.sharepoint_item_id}
                                                    displayType="thumbnail"
                                                    className="w-full h-full object-cover"
                                                    alt={photo.file_name || 'Verification photo'}
                                                />
                                                {photoLoading === photo.id && (
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Add Photo Button */}
                                    <label className={`flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${mode === 'dark' ? 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'}`}>
                                        {uploading ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin text-violet-500" />
                                                <span className="text-sm text-zinc-500">Uploading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Plus size={20} className="text-zinc-400" />
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
                        </div>
                    </div>
                )}
            </div>

            {/* Fixed Footer */}
            {activeTab !== 'comments' && !showBlinded && (
                <div className={`fixed bottom-0 left-0 right-0 p-4 border-t ${mode === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                    <div className="max-w-4xl mx-auto flex justify-between gap-4">
                        <Button variant="secondary" onClick={() => navigate(`/projects/${projectId}/shades`)}>
                            Cancel
                        </Button>
                        <Button variant="primary" icon={Save} onClick={handleSaveComplete} disabled={saving}>
                            {saving ? 'Saving...' : `Save & Mark ${activeTab === 'm1' ? 'M1' : 'M2'} Complete`}
                        </Button>
                    </div>
                </div>
            )}

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

// Helper components
const InputGroup = ({ label, value, onChange, mode, highlighted }) => (
    <div className={`flex items-center justify-between gap-4 p-2 rounded-lg transition-all duration-300 ${highlighted ? 'bg-violet-500/20 ring-2 ring-violet-500' : ''}`}>
        <span className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</span>
        <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-28 px-3 py-2 text-right rounded-lg border text-sm transition-all duration-300 ${highlighted
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30'
                : mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
            }`}
            style={{ fontSize: '16px' }}
        />
    </div>
);

const InputFinal = ({ label, value, onChange, mode }) => (
    <div>
        <label className="block text-xs font-medium mb-1.5 text-zinc-500">{label}</label>
        <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border font-semibold ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-black'}`}
            style={{ fontSize: '16px' }}
        />
    </div>
);

export default ShadeDetailPage;
