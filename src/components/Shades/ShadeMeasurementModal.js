import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Ruler, Camera, FileText, CheckCircle, Lock, ExternalLink, Mic, MicOff } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../ui/Button';
import { projectShadeService } from '../../services/projectShadeService';
import { supabase } from '../../lib/supabase';
import { useVoiceMeasurement } from '../../hooks/useVoiceMeasurement';

const ShadeMeasurementModal = ({ isOpen, onClose, shade, onSave, currentUser, availableMountTypes = [] }) => {
    const { theme, mode } = useTheme();
    const [activeTab, setActiveTab] = useState('m1'); // 'm1' or 'm2'
    const [uploading, setUploading] = useState(false);

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
        if (shade) {
            setFormData(getInitialValues(shade, activeTab));
        }
    }, [shade, activeTab]);

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

    // Voice Hook
    const {
        isActive: isVoiceActive,
        status: voiceStatus,
        transcript,
        currentStepLabel,
        startSession: startVoice,
        stopSession: stopVoice
    } = useVoiceMeasurement({
        onFieldUpdate: handleChange,
        initialContext: shade?.name
    });

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);

            // Dynamically import service (avoid circular deps if any, though likely safe here)
            const { sharePointStorageService } = await import('../../services/sharePointStorageService');

            const publicUrl = await sharePointStorageService.uploadShadePhoto(
                shade.project_id,
                shade.id,
                activeTab, // 'm1' or 'm2'
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
        // Validation: Must have at least one photo for "Rough Opening" to mark complete
        if (!formData.photos || formData.photos.length === 0) {
            alert('Please upload a photo of the rough opening to complete verification.');
            return;
        }

        // Pass 'set' (m1/m2) to parent save handler
        onSave(formData, activeTab);
    };

    if (!isOpen) return null;

    // Render logic for blinding
    const showBlinded = activeTab === 'm1' && isM1Blind;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl flex flex-col ${mode === 'dark' ? 'bg-zinc-900 border border-zinc-700' : 'bg-white'}`}>

                {/* Voice Status Banner */}
                {isVoiceActive && (
                    <div className="bg-violet-600 text-white p-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${voiceStatus === 'listening' ? 'bg-red-400 animate-pulse' : 'bg-white/50'}`} />
                            <span className="font-medium text-sm">
                                {voiceStatus === 'listening' ? 'Listening...' : voiceStatus === 'speaking' ? 'Speaking...' : 'Processing...'}
                            </span>
                            <span className="text-white/80 text-sm border-l border-white/20 pl-3">
                                {currentStepLabel ? `Asking for: ${currentStepLabel}` : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            {transcript && <span className="text-sm italic opacity-90 max-w-[200px] truncate">"{transcript}"</span>}
                            <button onClick={stopVoice} className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}

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
                            {!showBlinded && (
                                <button
                                    onClick={isVoiceActive ? stopVoice : startVoice}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isVoiceActive
                                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300'
                                        }`}
                                >
                                    {isVoiceActive ? <MicOff size={16} /> : <Mic size={16} />}
                                    {isVoiceActive ? 'Stop Voice' : 'Start Voice Mode'}
                                </button>
                            )}
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
                                        href={`https://www.lutronfabrics.com/textile-search?search_api_views_fulltext=${encodeURIComponent(shade.fabric_selection)}`}
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
                </div>

                {/* Main Content Area */}
                <div className="p-6">
                    {showBlinded ? (
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
                                            <InputGroup label="Top" value={formData.widthTop} onChange={v => handleChange('widthTop', v)} mode={mode} />
                                            <InputGroup label="Middle" value={formData.widthMiddle} onChange={v => handleChange('widthMiddle', v)} mode={mode} />
                                            <InputGroup label="Bottom" value={formData.widthBottom} onChange={v => handleChange('widthBottom', v)} mode={mode} />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className={`text-xs font-medium uppercase ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Rough Opening Height</label>
                                        <div className="space-y-2">
                                            <InputGroup label="Left" value={formData.heightLeft} onChange={v => handleChange('heightLeft', v)} mode={mode} />
                                            <InputGroup label="Center" value={formData.heightCenter} onChange={v => handleChange('heightCenter', v)} mode={mode} />
                                            <InputGroup label="Right" value={formData.heightRight} onChange={v => handleChange('heightRight', v)} mode={mode} />
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
                    {!showBlinded && (
                        <Button variant="primary" icon={Save} onClick={handleSaveClick}>
                            Save & Mark {activeTab === 'm1' ? 'M1' : 'M2'} Complete
                        </Button>
                    )}
                </div>

            </div>
        </div>
    );
};

// Helper for compact inputs
const InputGroup = ({ label, value, onChange, mode }) => (
    <div className="flex items-center justify-between gap-4">
        <span className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{label}</span>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-24 px-2 py-1.5 text-right rounded-md border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
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
