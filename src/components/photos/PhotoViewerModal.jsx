import React, { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, RefreshCcw } from 'lucide-react';
import CachedSharePointImage from '../CachedSharePointImage';
import Button from '../ui/Button';

const formatTimestamp = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const PhotoViewerModal = ({
  isOpen,
  photo,
  onClose,
  onReplace,
  onDelete,
  canEdit = true,
  loading = false,
  replaceMode = 'file' // 'file' | 'action'
}) => {
  const fileInputRef = useRef(null);

  const metadata = useMemo(() => {
    if (!photo) return null;
    return {
      uploadedLabel: photo.uploaded_by
        ? `${photo.uploaded_by}${photo.created_at ? ` • ${formatTimestamp(photo.created_at)}` : ''}`
        : (photo.created_at ? formatTimestamp(photo.created_at) : 'Uploaded photo'),
      updatedLabel: photo.updated_by
        ? `${photo.updated_by}${photo.updated_at ? ` • ${formatTimestamp(photo.updated_at)}` : ''}`
        : null
    };
  }, [photo]);

  if (!isOpen || !photo) return null;

  const handleChooseFile = () => {
    if (!canEdit || loading || !onReplace) return;
    if (replaceMode === 'file') {
      fileInputRef.current?.click();
      return;
    }
    onReplace();
  };

  const handleFileChange = (event) => {
    if (replaceMode !== 'file') return;
    const file = event.target.files?.[0];
    if (file && onReplace) {
      onReplace(file);
    }
    event.target.value = '';
  };

  const handleDelete = () => {
    if (!canEdit || loading || !onDelete) return;
    onDelete();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center px-4 py-8">
      <div className="relative w-full max-w-5xl h-[85vh] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Close photo viewer"
        >
          <X size={18} />
        </button>

        <div className="w-full h-full bg-black">
          <CachedSharePointImage
            sharePointUrl={photo.url}
            sharePointDriveId={photo.sharepoint_drive_id}
            sharePointItemId={photo.sharepoint_item_id}
            displayType="full"
            showFullOnClick={false}
            className="w-full h-full"
            style={{ height: '100%', objectFit: 'contain' }}
            alt={photo.file_name || 'Project photo'}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              {photo.file_name || 'Project photo'}
            </div>
            {metadata?.uploadedLabel && (
              <div className="text-xs text-gray-200">
                Uploaded by {metadata.uploadedLabel}
              </div>
            )}
            {metadata?.updatedLabel && (
              <div className="text-xs text-gray-300">
                Last updated by {metadata.updatedLabel}
              </div>
            )}
            {photo.isPending && (
              <div className="text-xs text-amber-300">
                Pending upload – editing disabled while offline.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCcw}
              onClick={handleChooseFile}
              disabled={!canEdit || loading}
            >
              Retake / Replace
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              onClick={handleDelete}
              disabled={!canEdit || loading}
            >
              Delete
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>,
    document.body
  );
};

export default PhotoViewerModal;
