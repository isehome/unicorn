import React, { useState, useEffect } from 'react';
import { X, Save, Ruler, Camera, FileText, CheckCircle, Lock, ExternalLink } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../ui/Button';
import { projectShadeService } from '../../services/projectShadeService';
import { supabase } from '../../lib/supabase';

const ShadeMeasurementModal = ({ isOpen, onClose, shade, onSave, currentUser }) => {
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

        widthTop: targetShade?.[`${set}_measure_width_top`] || '',
        widthMiddle: targetShade?.[`${set}_measure_width_middle`] || '',
        widthBottom: targetShade?.[`${set}_measure_width_bottom`] || '',
        heightLeft: targetShade?.[`${set}_measure_height_left`] || '',
        heightCenter: targetShade?.[`${set}_measure_height_center`] || '',
        heightRight: targetShade?.[`${set}_measure_height_right`] || '',

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

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

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

                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${mode === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                    <div>
                        <h2 className={`text-lg font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                            Verify Measurements
                        </h2>
                        <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            {shade?.name} • {shade?.room?.name}
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
                        <X size={20} />
                    </button>
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

                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left Col: Specs */}
                    <div className="space-y-6">
                        <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${mode === 'dark' ? 'text-zinc-400' : 'text-blue-600'}`}>
                                Lutron Quote Specs
                            </h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-zinc-400">Width</span>
                                    <span className={mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}>{shade?.quoted_width}"</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-400">Height</span>
                                    <span className={mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}>{shade?.quoted_height}"</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-400">Mount</span>
                                    <span className={mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}>{shade?.mount_type}</span>
                                </div>
                                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                    <span className="block text-zinc-400 text-xs mb-1">Fabric</span>
                                    <div className="flex items-center justify-between">
                                        <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                                            {shade?.fabric_selection || 'Not Selected'}
                                        </span>
                                        {shade?.fabric_selection && (
                                            <a
                                                href={`https://www.lutronfabrics.com/us/en/search/results?q=${shade.fabric_selection}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-violet-500 hover:text-violet-400 text-xs flex items-center gap-1"
                                            >
                                                View <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Photos Section */}
                        <div>
                            <label className={`block text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                Rough Opening Photos {activeTab === 'm1' ? '(M1)' : '(M2)'}
                            </label>

                            {showBlinded ? (
                                <div className="p-8 border border-dashed rounded-lg text-center text-zinc-500">
                                    <Lock size={24} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Photos Hidden</p>
                                </div>
                            ) : (
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
                            )}
                        </div>
                    </div>

                    {/* Right Col: Input Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {showBlinded ? (
                            <div className="h-full flex flex-col items-center justify-center p-12 text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-700">
                                <Lock size={48} className="text-zinc-300 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-500">Measurement 1 is Complete</h3>
                                <p className="text-sm text-zinc-400 mt-2">
                                    This data is masked for blind verification. Please switch to Measure 2 tab to enter your verification data.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className={`text-xs font-medium uppercase ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Width Check</label>
                                        <div className="space-y-2">
                                            <InputGroup label="Top" value={formData.widthTop} onChange={v => handleChange('widthTop', v)} mode={mode} />
                                            <InputGroup label="Middle" value={formData.widthMiddle} onChange={v => handleChange('widthMiddle', v)} mode={mode} />
                                            <InputGroup label="Bottom" value={formData.widthBottom} onChange={v => handleChange('widthBottom', v)} mode={mode} />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className={`text-xs font-medium uppercase ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Height Check</label>
                                        <div className="space-y-2">
                                            <InputGroup label="Left" value={formData.heightLeft} onChange={v => handleChange('heightLeft', v)} mode={mode} />
                                            <InputGroup label="Center" value={formData.heightCenter} onChange={v => handleChange('heightCenter', v)} mode={mode} />
                                            <InputGroup label="Right" value={formData.heightRight} onChange={v => handleChange('heightRight', v)} mode={mode} />
                                        </div>
                                    </div>
                                </div>

                                <div className={`p-4 rounded-xl border mt-4 ${mode === 'dark' ? 'bg-violet-900/10 border-violet-800/30' : 'bg-violet-50 border-violet-100'}`}>
                                    <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>Final Ordered Dimensions</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <InputFinal label="Width" value={formData.width} onChange={v => handleChange('width', v)} mode={mode} />
                                        <InputFinal label="Height" value={formData.height} onChange={v => handleChange('height', v)} mode={mode} />
                                        <InputFinal label="Depth" value={formData.mountDepth} onChange={v => handleChange('mountDepth', v)} mode={mode} />
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-sm font-medium mb-2 ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>Obstruction Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={e => handleChange('notes', e.target.value)}
                                        rows={3}
                                        className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                    />
                                </div>
                            </>
                        )}
                    </div>
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
