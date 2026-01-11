import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Camera, Upload, Loader2 } from 'lucide-react';
import Modal from './ui/Modal';
import { useTheme } from '../contexts/ThemeContext';
import { compressImage } from '../lib/images';
import { wireDropService } from '../services/wireDropService';

/**
 * PrewirePhotoModal - Quick photo capture modal for prewire stage completion
 * Opens camera directly for fast workflow during prewire mode
 */
const PrewirePhotoModal = ({ isOpen, onClose, wireDrop, onPhotoUploaded, currentUserName }) => {
  const { mode } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedFile || !wireDrop) return;

    try {
      setUploading(true);
      const compressedFile = await compressImage(selectedFile);

      await wireDropService.uploadStagePhoto(
        wireDrop.id,
        'prewire',
        compressedFile,
        currentUserName
      );

      // Notify parent of successful upload
      if (onPhotoUploaded) {
        onPhotoUploaded(wireDrop.id);
      }

      handleClose();
    } catch (err) {
      console.error('Error uploading prewire photo:', err);
      alert(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    // Clean up preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    onClose();
  };

  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    // Trigger file input again
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm" title="Capture Prewire Photo">
      <div className="space-y-4">
        {/* Wire drop info */}
        <div
          className="rounded-lg p-3 border"
          style={{
            backgroundColor: mode === 'dark' ? '#18181b' : '#f4f4f5',
            borderColor: mode === 'dark' ? '#27272a' : '#e4e4e7'
          }}
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {wireDrop?.drop_name || 'Wire Drop'}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {wireDrop?.room_name} • {wireDrop?.wire_type || 'N/A'}
          </p>
        </div>

        {/* Hidden file input for camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Preview or capture button */}
        {previewUrl ? (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt="Prewire preview"
                className="w-full h-auto max-h-64 object-contain bg-zinc-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRetake}
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Retake
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    Save Photo
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleCapture}
            className="w-full py-12 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:border-violet-500 dark:hover:border-violet-500 transition-colors flex flex-col items-center justify-center gap-3 text-zinc-600 dark:text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400"
          >
            <Camera size={48} />
            <span className="font-medium">Tap to capture photo</span>
          </button>
        )}

        {/* Cancel button */}
        <button
          onClick={handleClose}
          disabled={uploading}
          className="w-full px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
};

PrewirePhotoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  wireDrop: PropTypes.object,
  onPhotoUploaded: PropTypes.func,
  currentUserName: PropTypes.string
};

export default PrewirePhotoModal;
