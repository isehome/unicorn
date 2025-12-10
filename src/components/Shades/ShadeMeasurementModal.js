import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, Ruler, Camera, CheckCircle, Lock, ExternalLink, MessageSquare, Send, Info } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../ui/Button';
import { projectShadeService } from '../../services/projectShadeService';
import { supabase } from '../../lib/supabase';
import { useShadeTools } from '../../hooks/useShadeTools';

// Headrail style options
const HEADRAIL_STYLES = ['Pocket', 'Fascia', 'Fascia + Top Back Cover', 'Top Back Cover'];
const MOUNT_TYPES = ['Inside', 'Outside'];

const ShadeMeasurementModal = ({ isOpen, onClose, shade, onSave, currentUser, availableMountTypes = [], isPMView = false }) => {
    const { mode } = useTheme();
    const [uploading, setUploading] = useState(false);

    // Voice AI active field highlighting
    const [activeField, setActiveField] = useState(null);

    // Headrail info modal state
    const [showHeadrailInfo, setShowHeadrailInfo] = useState(false);

    // Header field states (quoted specs that can be edited)
    const [headerMountType, setHeaderMountType] = useState(shade?.mount_type || '');
    const [headerHeadrailStyle, setHeaderHeadrailStyle] = useState(shade?.headrail_style || '');

    // Comments state
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isPublicComment, setIsPublicComment] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Blinding logic:
    // - PM view: Never blind (can see all data)
    // - Technician view: Blind M1 if completed by someone else, Blind M2 if completed by someone else
    // - Users can always see/edit their own data
    const isM1Blind = !isPMView && shade?.m1_complete && shade?.m1_by !== currentUser?.id;
    const isM2Blind = !isPMView && shade?.m2_complete && shade?.m2_by !== currentUser?.id;

    // Determine default tab based on blinding and completion status
    // If M1 is complete by someone else, default to M2 tab
    const getDefaultTab = () => {
        if (isM1Blind && !isM2Blind) return 'm2';
        if (isM2Blind && !isM1Blind) return 'm1';
        // If M1 is complete and user can edit M2, default to M2
        if (shade?.m1_complete && !shade?.m2_complete) return 'm2';
        return 'm1';
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab);

    // Helper to get initial values based on tab
    const getInitialValues = (targetShade, set) => ({
        width: targetShade?.[`${set}_width`] || '',
        height: targetShade?.[`${set}_height`] || '',
        mountDepth: targetShade?.[`${set}_mount_depth`] || '',
        mountType: targetShade?.[`${set}_mount_type`] || targetShade?.mount_type || '', // Fallback to quoted mount type logic if M1/M2 are empty, but typically start empty? No, better start with quote. Or maybe empty. Plan didn't specify. Let's pre-fill with quote if empty.

        widthTop: targetShade?.[`${set}_measure_width_top`] || '',
        widthMiddle: targetShade?.[`${set}_measure_width_middle`] || '',
        widthBottom: targetShade?.[`${set}_measure_width_bottom`] || '',
        heightLeft: targetShade?.[`${set}_measure_height_left`] || '',
        heightCenter: targetShade?.[`${set}_measure_height_center`] || '',
        heightRight: targetShade?.[`${set}_measure_height_right`] || '',

        pocketWidth: targetShade?.[`${set}_pocket_width`] || '',
        pocketHeight: targetShade?.[`${set}_pocket_height`] || '',
        pocketDepth: targetShade?.[`${set}_pocket_depth`] || '',

        notes: targetShade?.[`${set}_obstruction_notes`] || '',
        photos: targetShade?.[`${set}_photos`] || []
    });

    const [formData, setFormData] = useState(getInitialValues(shade, 'm1'));

    // Reset when shade or tab changes
    useEffect(() => {
        if (shade && (activeTab === 'm1' || activeTab === 'm2')) {
            setFormData(getInitialValues(shade, activeTab));
        }
    }, [shade, activeTab]);

    // Sync header fields when shade changes
    useEffect(() => {
        if (shade) {
            setHeaderMountType(shade.mount_type || '');
            setHeaderHeadrailStyle(shade.headrail_style || '');
        }
    }, [shade]);

    // Auto-save header field (mount_type or headrail_style on the shade record itself)
    const autoSaveHeaderField = useCallback(async (field, value) => {
        if (!shade?.id) return;
        try {
            await supabase
                .from('project_shades')
                .update({ [field]: value })
                .eq('id', shade.id);
            console.log(`[ShadeMeasurementModal] Auto-saved header ${field} = ${value}`);
        } catch (err) {
            console.error(`[ShadeMeasurementModal] Auto-save header failed for ${field}:`, err);
        }
    }, [shade?.id]);

    const handleHeaderMountTypeChange = (value) => {
        setHeaderMountType(value);
        autoSaveHeaderField('mount_type', value);
    };

    const handleHeaderHeadrailStyleChange = (value) => {
        setHeaderHeadrailStyle(value);
        autoSaveHeaderField('headrail_style', value);
    };

    // Load comments when comments tab is selected
    useEffect(() => {
        const loadComments = async () => {
            if (activeTab !== 'comments' || !shade?.id) return;
            setLoadingComments(true);
            try {
                const { data, error } = await supabase
                    .from('shade_comments')
                    .select('*')
                    .eq('shade_id', shade.id)
                    .order('created_at', { ascending: true });
                if (error) throw error;
                setComments(data || []);
            } catch (err) {
                console.error('[ShadeMeasurementModal] Failed to load comments:', err);
            } finally {
                setLoadingComments(false);
            }
        };
        loadComments();
    }, [activeTab, shade?.id]);

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !shade?.id || submittingComment) return;
        setSubmittingComment(true);
        try {
            const { data, error } = await supabase
                .from('shade_comments')
                .insert([{
                    shade_id: shade.id,
                    project_id: shade.project_id,
                    comment_text: newComment.trim(),
                    is_internal: !isPublicComment,
                    author_id: currentUser?.id,
                    author_name: currentUser?.name || currentUser?.displayName || 'Staff',
                    author_email: currentUser?.email
                }])
                .select()
                .single();
            if (error) throw error;
            setComments(prev => [...prev, data]);
            setNewComment('');
        } catch (err) {
            console.error('[ShadeMeasurementModal] Failed to add comment:', err);
            alert('Failed to add comment: ' + err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Debounce timer for auto-save
    const autoSaveTimerRef = useRef(null);

    // Auto-save a field to the database (debounced)
    const autoSaveField = useCallback((field, value) => {
        if (!shade?.id) return;

        // Clear any pending save for this field
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Debounce: wait 500ms after last change before saving
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                await projectShadeService.autoSaveMeasurementField(
                    shade.id,
                    field,
                    value,
                    activeTab === 'm2' ? 'm2' : 'm1'
                );
                console.log(`[ShadeMeasurementModal] Auto-saved ${field} = ${value}`);
            } catch (err) {
                console.error(`[ShadeMeasurementModal] Auto-save failed for ${field}:`, err);
                // Don't show alert - silent fail for auto-save
            }
        }, 500);
    }, [shade?.id, activeTab]);

    const handleChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Auto-save to database
        autoSaveField(field, value);
    }, [autoSaveField]);

    // NEW: Global Copilot Tools
    useShadeTools({
        formData,
        setFormData,
        activeTab,
        shade,
        onClose,
        onSave: () => handleSaveClick(), // Use the wrapper to include validation if needed? Or just direct onSave(formData, activeTab)
        setActiveField  // Pass for visual highlighting when AI sets a field
    });
    // Fix: We need to pass the real save logic or specific wrapper. 
    // The existing handleSaveClick relies on state 'formData' which is available.
    // So passing handleSaveClick is correct because it wraps parameters.

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            // Dynamically import service
            const { sharePointStorageService } = await import('../../services/sharePointStorageService');

            const publicUrl = await sharePointStorageService.uploadShadePhoto(
                shade.project_id,
                shade.id,
                activeTab,
                file
            );

            setFormData(prev => ({
                ...prev,
                photos: [...(prev.photos || []), publicUrl]
            }));
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload photo: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSaveClick = () => {
        // Photo requirement temporarily disabled for voice workflow flexibility
        // Users can save progress and come back to add photos later
        onSave(formData, activeTab);
    };

    if (!isOpen) return null;

    // Render logic for blinding - check current tab against blinding state
    const showBlinded = (activeTab === 'm1' && isM1Blind) || (activeTab === 'm2' && isM2Blind);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl flex flex-col ${mode === 'dark' ? 'bg-zinc-900 border border-zinc-700' : 'bg-white'}`}>

                {/* Header Section with Specs */}
                <div className={`p-4 border-b space-y-4 ${mode === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className={`text-lg font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                Verify Measurements
                            </h2>
                            <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                {shade?.name} • {shade?.room?.name} • <span className="font-medium text-violet-500">{shade?.technology}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className={`p-2 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Master Info Header */}
                    <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                        {/* Row 1: Quoted dimensions and Fabric */}
                        <div className="grid grid-cols-4 gap-4 mb-4">
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
                                <div className="flex items-center gap-2">
                                    {shade?.fabric_selection ? (
                                        <a
                                            href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(shade.fabric_selection)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`font-medium truncate hover:underline flex items-center gap-1 ${mode === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}
                                        >
                                            {shade.fabric_selection}
                                            <ExternalLink size={12} />
                                        </a>
                                    ) : (
                                        <span className={`font-medium truncate ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                                            Not Selected
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Row 2: Mount Type and Headrail Style dropdowns */}
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
                                        className={`p-0.5 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200' : 'hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600'}`}
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
                </div>

                {/* Tabs */}
                <div className={`flex border-b ${mode === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                    <button
                        onClick={() => setActiveTab('m1')}
                        className={`flex-1 p-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm1'
                            ? 'border-violet-500 text-violet-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-1">
                            Measure 1
                            {shade?.m1_complete && <CheckCircle size={14} className="inline" style={{ color: '#94AF32' }} />}
                            {isM1Blind && <Lock size={14} className="inline text-zinc-400" />}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('m2')}
                        className={`flex-1 p-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm2'
                            ? 'border-violet-500 text-violet-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-1">
                            Measure 2
                            {shade?.m2_complete && <CheckCircle size={14} className="inline" style={{ color: '#94AF32' }} />}
                            {isM2Blind && <Lock size={14} className="inline text-zinc-400" />}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('comments')}
                        className={`flex-1 p-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${activeTab === 'comments'
                            ? 'border-violet-500 text-violet-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                    >
                        <MessageSquare size={14} />
                        Comments {comments.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-violet-100 text-violet-600">{comments.length}</span>}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="p-6">
                    {activeTab === 'comments' ? (
                        /* Comments Tab Content */
                        <div className="space-y-4">
                            {/* Comments List */}
                            <div className={`rounded-xl border p-4 min-h-[300px] max-h-[400px] overflow-y-auto ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
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

                            {/* Add Comment Form */}
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
                                            ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-500/50 focus:ring-amber-500 focus:border-amber-500'
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
                        <div className="h-64 flex flex-col items-center justify-center text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-700">
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
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Left Column: Validation & Photos */}
                            <div className="space-y-6">
                                {/* Width/Height Validations */}
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
                                    <label className={`block text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                        Verification Photos {activeTab === 'm1' ? '(M1)' : '(M2)'}
                                    </label>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            {formData.photos?.map((url, i) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block relative aspect-video bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                                                    <img src={url} alt="Rough opening" className="w-full h-full object-cover" />
                                                </a>
                                            ))}
                                        </div>
                                        <label className={`flex items-center justify-center gap-2 w-full p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${mode === 'dark' ? 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
                                            }`}>
                                            <Camera size={18} className="text-zinc-400" />
                                            <span className="text-sm text-zinc-500">{uploading ? 'Uploading...' : 'Add Photo'}</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Final Specs & Install */}
                            <div className="space-y-6">
                                {/* Final Dimensions (The "Order" Specs) */}
                                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-violet-900/10 border-violet-800/30' : 'bg-violet-50 border-violet-100'}`}>
                                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                                        <Ruler size={16} /> Final Ordered Dimensions
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <InputFinal label="Width" value={formData.width} onChange={v => handleChange('width', v)} mode={mode} />
                                        <InputFinal label="Height" value={formData.height} onChange={v => handleChange('height', v)} mode={mode} />
                                        <InputFinal label="Depth" value={formData.mountDepth} onChange={v => handleChange('mountDepth', v)} mode={mode} />
                                    </div>
                                </div>

                                {/* Installation / Pockets */}
                                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                                    <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>Installation & Pockets</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5 text-zinc-500">Verified Mount Type</label>
                                            <select
                                                value={formData.mountType || ''}
                                                onChange={e => handleChange('mountType', e.target.value)}
                                                className={`w-full px-3 py-2 rounded-lg border font-semibold ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white focus:border-violet-500' : 'bg-white border-zinc-300 text-black focus:border-violet-500'}`}
                                            >
                                                <option value="">Select...</option>
                                                {availableMountTypes.map(type => (
                                                    <option key={type} value={type}>{type} Mount</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <InputFinal label="Pocket Width" value={formData.pocketWidth} onChange={v => handleChange('pocketWidth', v)} mode={mode} />
                                            <InputFinal label="Pocket Height" value={formData.pocketHeight} onChange={v => handleChange('pocketHeight', v)} mode={mode} />
                                            <InputFinal label="Pocket Depth" value={formData.pocketDepth} onChange={v => handleChange('pocketDepth', v)} mode={mode} />
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className={`block text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>Obstruction Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={e => handleChange('notes', e.target.value)}
                                        rows={3}
                                        placeholder="Enter any validation notes..."
                                        className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`p-4 border-t flex justify-end gap-3 ${mode === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    {!showBlinded && activeTab !== 'comments' && (
                        <Button variant="primary" icon={Save} onClick={handleSaveClick}>
                            Save & Mark {activeTab === 'm1' ? 'M1' : 'M2'} Complete
                        </Button>
                    )}
                </div>

            </div>

            {/* Headrail Style Info Modal */}
            {showHeadrailInfo && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 max-h-[70vh] overflow-y-auto">
                            <img
                                src="/images/headrail-styles.png"
                                alt="Headrail Style Options - Pocket, Fascia, Fascia + Top Back Cover, Top Back Cover"
                                className="w-full h-auto max-h-[65vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper for compact inputs with optional voice AI highlighting
const InputGroup = ({ label, value, onChange, mode, highlighted }) => (
    <div className={`flex items-center justify-between gap-4 p-1 rounded-lg transition-all duration-300 ${
        highlighted ? 'bg-violet-500/20 ring-2 ring-violet-500 ring-offset-1' : ''
    }`}>
        <span className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</span>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-24 px-2 py-1.5 text-right rounded-md border text-sm transition-all duration-300 ${
                highlighted
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-1 ring-violet-500'
                    : mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
            }`}
        />
    </div>
);

const InputFinal = ({ label, value, onChange, mode }) => (
    <div>
        <label className="block text-xs font-medium mb-1.5 text-zinc-500">{label}</label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border font-semibold ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white focus:border-violet-500' : 'bg-white border-zinc-300 text-black focus:border-violet-500'}`}
        />
    </div>
);



export default ShadeMeasurementModal;
