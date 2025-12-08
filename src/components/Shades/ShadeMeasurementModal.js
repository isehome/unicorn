import { useState, useEffect, useCallback } from 'react';
import { X, Save, Ruler, Camera, FileText, CheckCircle, Lock, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../ui/Button';
import { projectShadeService } from '../../services/projectShadeService';
import { supabase } from '../../lib/supabase';
import { useShadeTools } from '../../hooks/useShadeTools';

const ShadeMeasurementModal = ({ isOpen, onClose, shade, onSave, currentUser, availableMountTypes = [] }) => {
    const { theme, mode } = useTheme();
    const [activeTab, setActiveTab] = useState('m1'); // 'm1', 'm2', or 'comments'
    const [uploading, setUploading] = useState(false);

    // Voice AI active field highlighting
    const [activeField, setActiveField] = useState(null);

    // Comments state
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isPublicComment, setIsPublicComment] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Derived state for blinding
    // If M1 is complete AND current user is NOT the one who did M1 -> Blind M1
    const isM1Blind = shade?.m1_complete && shade?.m1_by !== currentUser?.id;

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

    const handleChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

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
        // Validation for M1 completion (Rough Opening photo required)
        if (!formData.photos || formData.photos.length === 0) {
            alert('Please upload a photo of the rough opening to complete verification.');
            return;
        }
        onSave(formData, activeTab);
    };

    if (!isOpen) return null;

    // Render logic for blinding
    const showBlinded = activeTab === 'm1' && isM1Blind;

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
                    <div className={`grid grid-cols-4 gap-4 p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Width</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_width}"</span>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Height</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_height}"</span>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Mount Type</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.mount_type}</span>
                        </div>
                        <div>
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
                        Measure 1 {shade?.m1_complete && <CheckCircle size={14} className="inline ml-1 text-green-500" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('m2')}
                        className={`flex-1 p-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm2'
                            ? 'border-violet-500 text-violet-500'
                            : 'border-transparent text-zinc-500 hover:text-zinc-700'
                            }`}
                    >
                        Measure 2 {shade?.m2_complete && <CheckCircle size={14} className="inline ml-1 text-green-500" />}
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
                            <h3 className="text-lg font-medium text-zinc-500">Measurement 1 is Complete</h3>
                            <p className="text-sm text-zinc-400 mt-2">
                                Data masked for blind verification. Switch to Measure 2.
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
