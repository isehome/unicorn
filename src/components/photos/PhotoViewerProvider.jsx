import React, { createContext, useCallback, useContext, useState } from 'react';
import PhotoViewerModal from './PhotoViewerModal';

const PhotoViewerContext = createContext({
  openPhotoViewer: () => {},
  closePhotoViewer: () => {},
  updatePhotoViewerOptions: () => {},
  photo: null
});

const defaultOptions = {
  canEdit: false,
  replaceMode: 'file',
  onReplace: null,
  onDelete: null,
  loading: false
};

export const PhotoViewerProvider = ({ children }) => {
  const [photo, setPhoto] = useState(null);
  const [options, setOptions] = useState(defaultOptions);

  const openPhotoViewer = useCallback((photoData, viewerOptions = {}) => {
    if (!photoData) return;
    setPhoto(photoData);
    setOptions({ ...defaultOptions, ...viewerOptions });
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhoto(null);
    setOptions(defaultOptions);
  }, []);

  const updatePhotoViewerOptions = useCallback((viewerOptions = {}) => {
    setOptions((prev) => ({ ...prev, ...viewerOptions }));
  }, []);

  const handleReplace = useCallback(
    (file) => {
      if (typeof options.onReplace === 'function') {
        options.onReplace(file);
      }
    },
    [options.onReplace]
  );

  const handleDelete = useCallback(() => {
    if (typeof options.onDelete === 'function') {
      options.onDelete();
    }
  }, [options.onDelete]);

  return (
    <PhotoViewerContext.Provider value={{ openPhotoViewer, closePhotoViewer, updatePhotoViewerOptions, photo }}>
      {children}
      <PhotoViewerModal
        isOpen={Boolean(photo)}
        photo={photo}
        onClose={closePhotoViewer}
        onReplace={options.onReplace ? handleReplace : undefined}
        onDelete={options.onDelete ? handleDelete : undefined}
        canEdit={options.canEdit}
        loading={options.loading}
        replaceMode={options.replaceMode || 'file'}
        replaceMode={options.replaceMode || 'file'}
      />
    </PhotoViewerContext.Provider>
  );
};

export const usePhotoViewer = () => useContext(PhotoViewerContext);
