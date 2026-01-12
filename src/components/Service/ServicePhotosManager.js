/**
 * ServicePhotosManager.js
 * Photo gallery UI for service tickets with upload capabilities
 * Supports categories: before, during, after, documentation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit2,
  Check,
  FolderOpen
} from 'lucide-react';
import { servicePhotoService, PHOTO_CATEGORIES } from '../../services/servicePhotoService';
import CachedSharePointImage from '../CachedSharePointImage';

const ServicePhotosManager = ({ ticketId, user, sharePointFolderUrl }) => {
  const [photos, setPhotos] = useState({});
  const [photoCounts, setPhotoCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('before');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [editingCaption, setEditingCaption] = useState(null);
  const [captionText, setCaptionText] = useState('');
  const fileInputRef = useRef(null);

  // Load photos function - defined before useEffect that uses it
  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [grouped, counts] = await Promise.all([
        servicePhotoService.getPhotosGroupedByCategory(ticketId),
        servicePhotoService.getPhotoCounts(ticketId)
      ]);
      setPhotos(grouped);
      setPhotoCounts(counts);
    } catch (err) {
      console.error('[ServicePhotosManager] Failed to load photos:', err);
      setError(err.message || 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  // Load photos on mount
  useEffect(() => {
    if (ticketId) {
      loadPhotos();
    }
  }, [ticketId, loadPhotos]);


  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        await servicePhotoService.uploadPhoto({
          ticketId,
          file: files[i],
          category: activeTab,
          caption: null,
          user
        });
      }
      await loadPhotos();
    } catch (err) {
      console.error('[ServicePhotosManager] Upload failed:', err);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;

    try {
      await servicePhotoService.deletePhoto(photoId, user);
      await loadPhotos();
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null);
      }
    } catch (err) {
      console.error('[ServicePhotosManager] Delete failed:', err);
      setError(err.message || 'Failed to delete photo');
    }
  };

  const handleSaveCaption = async (photoId) => {
    try {
      await servicePhotoService.updateCaption(photoId, captionText);
      await loadPhotos();
      setEditingCaption(null);
      setCaptionText('');
    } catch (err) {
      console.error('[ServicePhotosManager] Caption update failed:', err);
      setError(err.message || 'Failed to update caption');
    }
  };

  const startEditCaption = (photo) => {
    setEditingCaption(photo.id);
    setCaptionText(photo.caption || '');
  };

  const openLightbox = (photo) => {
    setSelectedPhoto(photo);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
  };

  const navigateLightbox = (direction) => {
    const currentPhotos = photos[activeTab] || [];
    const currentIndex = currentPhotos.findIndex(p => p.id === selectedPhoto?.id);
    if (currentIndex === -1) return;

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = currentPhotos.length - 1;
    if (newIndex >= currentPhotos.length) newIndex = 0;

    setSelectedPhoto(currentPhotos[newIndex]);
  };

  const categoryTabs = Object.entries(PHOTO_CATEGORIES).map(([key, { label }]) => ({
    key,
    label,
    count: photoCounts[key] || 0
  }));

  const currentPhotos = photos[activeTab] || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-zinc-400" size={24} />
        <span className="ml-2 text-zinc-400">Loading photos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* SharePoint folder link */}
      {sharePointFolderUrl && (
        <a
          href={sharePointFolderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <FolderOpen size={14} />
          Open in SharePoint
          <ExternalLink size={12} />
        </a>
      )}

      {/* Category tabs */}
      <div className="flex border-b border-zinc-700">
        {categoryTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-zinc-700 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upload area */}
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <div className="p-6 border-2 border-dashed border-zinc-600 rounded-lg flex flex-col items-center justify-center gap-2">
            <Loader2 className="animate-spin text-violet-400" size={32} />
            <span className="text-zinc-400">
              Uploading {uploadProgress?.current} of {uploadProgress?.total}...
            </span>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-6 border-2 border-dashed border-zinc-600 rounded-lg hover:border-violet-500 transition-colors flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-violet-400"
          >
            <div className="flex gap-4">
              <Camera size={28} />
              <Upload size={28} />
            </div>
            <span className="text-sm font-medium">
              Tap to capture or upload {PHOTO_CATEGORIES[activeTab]?.label.toLowerCase()} photos
            </span>
          </button>
        )}
      </div>

      {/* Photo grid */}
      {currentPhotos.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
          <p>No {PHOTO_CATEGORIES[activeTab]?.label.toLowerCase()} photos yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {currentPhotos.map(photo => (
            <div
              key={photo.id}
              className="group relative aspect-square bg-zinc-800 rounded-lg overflow-hidden"
            >
              <CachedSharePointImage
                sharePointUrl={photo.photo_url}
                sharePointDriveId={photo.sharepoint_drive_id}
                sharePointItemId={photo.sharepoint_item_id}
                size="medium"
                alt={photo.caption || `${photo.category} photo`}
                className="w-full h-full"
                onClick={() => openLightbox(photo)}
                showFullOnClick={false}
              />

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => openLightbox(photo)}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors mx-1"
                  title="View full size"
                >
                  <ExternalLink size={18} className="text-white" />
                </button>
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="p-2 bg-red-500/60 hover:bg-red-500/80 rounded-full transition-colors mx-1"
                  title="Delete"
                >
                  <Trash2 size={18} className="text-white" />
                </button>
              </div>

              {/* Caption */}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-xs text-white truncate">{photo.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>

          {/* Navigation arrows */}
          {currentPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/40 rounded-full transition-colors"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/40 rounded-full transition-colors"
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}

          {/* Full size image */}
          <div
            className="max-w-[90vw] max-h-[85vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <CachedSharePointImage
              sharePointUrl={selectedPhoto.photo_url}
              sharePointDriveId={selectedPhoto.sharepoint_drive_id}
              sharePointItemId={selectedPhoto.sharepoint_item_id}
              displayType="full"
              alt={selectedPhoto.caption || 'Photo'}
              className="max-w-full max-h-[85vh] object-contain"
              showFullOnClick={false}
            />

            {/* Photo info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1">
                  {editingCaption === selectedPhoto.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={captionText}
                        onChange={(e) => setCaptionText(e.target.value)}
                        placeholder="Add a caption..."
                        className="flex-1 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCaption(selectedPhoto.id);
                          if (e.key === 'Escape') setEditingCaption(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveCaption(selectedPhoto.id)}
                        className="p-1 text-green-400 hover:text-green-300"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => setEditingCaption(null)}
                        className="p-1 text-zinc-400 hover:text-zinc-300"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm">
                        {selectedPhoto.caption || 'No caption'}
                      </p>
                      <button
                        onClick={() => startEditCaption(selectedPhoto)}
                        className="p-1 text-zinc-400 hover:text-zinc-300"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  )}
                  <p className="text-zinc-400 text-xs mt-1">
                    {selectedPhoto.uploaded_by_name} - {new Date(selectedPhoto.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(selectedPhoto.id)}
                  className="p-2 text-red-400 hover:text-red-300 bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePhotosManager;
