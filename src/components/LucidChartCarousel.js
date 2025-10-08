import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Loader,
  AlertCircle,
  ExternalLink,
  Maximize2,
  X
} from 'lucide-react';
import {
  fetchDocumentMetadata,
  fetchDocumentContents,
  extractDocumentIdFromUrl
} from '../services/lucidApi';
import { preloadDocumentPages, getCachedPageImage } from '../services/lucidCacheService';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const THUMB_SCALE = 0.45;

const EmbedModal = ({ isOpen, onClose, documentId, page }) => {
  const { mode } = useTheme();

  // Use cookie-based embed (no token required, works if user is signed into Lucid)
  const embedUrl = useMemo(() => {
    if (!documentId) return null;
    // Cookie-based embed URL
    const baseUrl = `https://lucid.app/documents/embeddedchart/${documentId}`;
    if (page?.id) {
      return `${baseUrl}?pageId=${page.id}`;
    }
    return baseUrl;
  }, [documentId, page]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8 bg-black/60 backdrop-blur-sm">
      <div className={`relative w-full max-w-5xl overflow-hidden rounded-2xl shadow-2xl ${mode === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          aria-label="Close Lucid diagram"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={`border-b px-6 py-4 ${mode === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <h3 className={`text-lg font-semibold ${mode === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {page?.title || 'Lucid Diagram'}
          </h3>
          {page && (
            <p className={`mt-1 text-xs ${mode === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Page {page.index + 1}
            </p>
          )}
        </div>

        <div className={`flex h-[70vh] items-center justify-center ${mode === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
          {embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                title={page?.title || 'Lucid Diagram'}
                className="h-full w-full border-0"
                allow="fullscreen"
                referrerPolicy="no-referrer"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
              {/* Info banner for cookie-based embed */}
              <div className="absolute bottom-4 left-4 right-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> You must be signed into Lucid to view this diagram. 
                  If you don't see the content, <a href="https://lucid.app" target="_blank" rel="noopener noreferrer" className="underline">sign in to Lucid</a> first.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="max-w-sm text-sm text-red-500">Unable to load diagram</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LucidChartCarousel = ({ documentUrl, projectName }) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [pages, setPages] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [documentId, setDocumentId] = useState(null);
  const [documentVersion, setDocumentVersion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [embedState, setEmbedState] = useState({
    open: false,
    page: null
  });

  useEffect(() => {
    if (!documentUrl) {
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      setThumbnails({});

      try {
        const docId = extractDocumentIdFromUrl(documentUrl);
        if (!docId) {
          throw new Error('Invalid Lucid Chart URL');
        }

        setDocumentId(docId);

        let metadata = null;
        try {
          metadata = await fetchDocumentMetadata(docId);
        } catch (metaError) {
          console.warn('Failed to fetch Lucid metadata, falling back to contents:', metaError);
        }

        let pageData = [];
        if (metadata?.pages?.length) {
          pageData = metadata.pages.map((page, index) => ({
            id: page.id,
            title: page.title || `Page ${index + 1}`,
            index
          }));
        }

        if (pageData.length === 0) {
          const contents = await fetchDocumentContents(docId);
          if (!contents?.pages?.length) {
            throw new Error('This Lucid document does not have any pages.');
          }

          pageData = contents.pages.map((page, index) => ({
            id: page.id,
            title: page.title || `Page ${index + 1}`,
            index
          }));
        }

        const docVersion = metadata?.version || metadata?.documentVersion || metadata?.revision || null;

        setPages(pageData);
        setDocumentVersion(docVersion);

        await loadThumbnails(docId, pageData, docVersion);
      } catch (err) {
        console.error('Failed to load Lucid pages:', err);
        setError(err.message || 'Failed to load Lucid document');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [documentUrl]);

  const loadThumbnails = async (docId, pageData, version) => {
    if (!pageData.length) {
      return;
    }

    setThumbnailsLoading(true);

    try {
      const imageMap = await preloadDocumentPages(docId, pageData, {
        documentVersion: version,
        scale: THUMB_SCALE,
        format: 'png'
      });

      setThumbnails(imageMap);

      // Backfill any pages that failed to preload
      for (const page of pageData) {
        if (!imageMap[page.index]) {
          try {
            const url = await getCachedPageImage(docId, page.index, {
              title: page.title,
              id: page.id
            }, {
              documentVersion: version,
              scale: THUMB_SCALE,
              format: 'png'
            });

            if (url) {
              setThumbnails((prev) => ({ ...prev, [page.index]: url }));
            }
          } catch (singleError) {
            console.warn(`Thumbnail fallback failed for page ${page.index}:`, singleError);
          }
        }
      }
    } catch (thumbError) {
      console.error('Failed to load Lucid thumbnails:', thumbError);
      const placeholders = {};
      if (typeof document !== 'undefined') {
        for (const page of pageData) {
          const canvas = document.createElement('canvas');
          canvas.width = 280;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');

          ctx.fillStyle = mode === 'dark' ? '#1f2937' : '#f3f4f6';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.strokeStyle = mode === 'dark' ? '#4b5563' : '#d1d5db';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

          ctx.fillStyle = mode === 'dark' ? '#a1a1aa' : '#6b7280';
          ctx.font = '48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📄', canvas.width / 2, canvas.height / 2 - 20);

          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = mode === 'dark' ? '#e5e7eb' : '#374151';
          ctx.fillText(page.title, canvas.width / 2, canvas.height / 2 + 36);

          ctx.font = '12px sans-serif';
          ctx.fillStyle = mode === 'dark' ? '#9ca3af' : '#6b7280';
          ctx.fillText('Thumbnail unavailable', canvas.width / 2, canvas.height / 2 + 60);

          placeholders[page.index] = canvas.toDataURL();
        }
      }

      setThumbnails(placeholders);
    } finally {
      setThumbnailsLoading(false);
    }
  };

  const handleOpenPage = (page) => {
    if (!documentId) {
      return;
    }

    setSelectedIndex(page.index);
    // Open modal with cookie-based embed (no token needed)
    setEmbedState({ open: true, page });
  };

  const closeEmbed = () => {
    setEmbedState({ open: false, page: null });
  };

  const openInLucidChart = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!documentUrl) {
    return null;
  }

  if (loading) {
    return (
      <div style={sectionStyles.card} className="p-6 mb-6">
        <div className="flex items-center justify-center py-12">
          <Loader className="h-7 w-7 animate-spin text-violet-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading Lucid pages…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={sectionStyles.card} className="p-6 mb-6">
        <div className="flex items-center justify-center gap-2 py-8">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  if (!pages.length) {
    return null;
  }

  return (
    <>
      <div style={sectionStyles.card} className="p-6 mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileText className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Wiring Diagram Overview</p>
              {projectName && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{projectName}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {documentVersion && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                v{documentVersion}
              </span>
            )}
            <button
              onClick={openInLucidChart}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-violet-600 transition hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Lucid
            </button>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4">
            {pages.map((page) => {
              const thumbnail = thumbnails[page.index];
              const isSelected = selectedIndex === page.index && embedState.open;

              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => handleOpenPage(page)}
                  className={`group relative w-48 shrink-0 rounded-xl border p-2 text-left transition ${
                    isSelected
                      ? 'border-violet-500 shadow-lg shadow-violet-500/10'
                      : mode === 'dark'
                        ? 'border-gray-800 bg-gray-900 hover:border-violet-500'
                        : 'border-gray-200 bg-white hover:border-violet-500'
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={page.title}
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
                        <FileText className="h-8 w-8" />
                        <span className="text-xs">Loading…</span>
                      </div>
                    )}

                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                      <Maximize2 className="h-3 w-3" />
                      View
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {page.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Page {page.index + 1}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {thumbnailsLoading && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-300">
            <Loader className="h-3 w-3 animate-spin" />
            Updating thumbnails…
          </div>
        )}
      </div>

      <EmbedModal
        isOpen={embedState.open}
        onClose={closeEmbed}
        documentId={documentId}
        page={embedState.page}
      />
    </>
  );
};

export default LucidChartCarousel;
