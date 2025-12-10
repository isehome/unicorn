import React, { useState, useEffect } from 'react';
import { Loader, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { exportDocumentPage, fetchDocumentContents } from '../services/lucidApi';

/**
 * LucidImageDisplay - Displays Lucid Charts as PNG images
 * 
 * This component fetches and displays Lucid chart pages as PNG images
 * using the working export API. No public sharing required!
 */
const LucidImageDisplay = ({ 
  documentId, 
  title = 'Lucid Chart', 
  height = '600px',
  dpi = 72 // Lower DPI for faster loading, smaller files
}) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [imageUrl, setImageUrl] = useState(null);
  
  // Extract document ID from URL if needed
  const extractDocId = (input) => {
    if (!input) return null;
    if (!input.includes('/')) return input;
    const match = input.match(/lucidchart\/([a-zA-Z0-9-_]+)\//);
    return match ? match[1] : input;
  };
  
  const docId = extractDocId(documentId);
  
  // Load document pages
  useEffect(() => {
    if (!docId) return;
    
    const loadPages = async () => {
      try {
        setLoading(true);
        setError(null);
        const contents = await fetchDocumentContents(docId);
        if (contents.pages && contents.pages.length > 0) {
          setPages(contents.pages);
        } else {
          setError('No pages found in document');
        }
      } catch (err) {
        console.error('Failed to load document contents:', err);
        setError(`Failed to load document: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadPages();
  }, [docId]);
  
  // Load current page image
  useEffect(() => {
    if (!docId || !pages[currentPage]) return;
    
    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const page = pages[currentPage];
        const imageDataUrl = await exportDocumentPage(
          docId, 
          currentPage, 
          page.id,
          {
            format: 'png',
            dpi: dpi,
            forceProxy: true
          }
        );
        
        if (imageDataUrl) {
          setImageUrl(imageDataUrl);
        } else {
          setError('Failed to load image');
        }
      } catch (err) {
        console.error('Failed to export page:', err);
        setError(`Failed to load image: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadImage();
  }, [docId, currentPage, pages, dpi]);
  
  const handleRefresh = () => {
    if (pages[currentPage]) {
      setImageUrl(null);
      // Trigger reload
      setCurrentPage(current => current);
    }
  };
  
  const handleDownload = () => {
    if (imageUrl) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${title}-page-${currentPage + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  
  if (!docId) {
    return (
      <div style={sectionStyles.card} className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">No document ID provided</p>
      </div>
    );
  }
  
  return (
    <div style={sectionStyles.card} className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading || !imageUrl}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleDownload}
            disabled={loading || !imageUrl}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Page Navigation (if multiple pages) */}
      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0 || loading}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage + 1} of {pages.length}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(pages.length - 1, prev + 1))}
            disabled={currentPage === pages.length - 1 || loading}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
      
      {/* Image Display */}
      <div 
        className="relative w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800"
        style={{ height }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading Lucid chart...</p>
            </div>
          </div>
        )}
        
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        )}
        
        {imageUrl && !loading && (
          <img
            src={imageUrl}
            alt={`${title} - Page ${currentPage + 1}`}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      
      {/* Footer Info */}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Document ID: {docId}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          DPI: {dpi} (adjust for quality/size)
        </p>
      </div>
    </div>
  );
};

export default LucidImageDisplay;

/**
 * Usage Example:
 * 
 * import LucidImageDisplay from './components/LucidImageDisplay';
 * 
 * // Display Lucid chart as PNG (no public sharing required!)
 * <LucidImageDisplay 
 *   documentId="f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1"
 *   title="Floor Plan"
 *   height="800px"
 *   dpi={96}  // Higher DPI for better quality
 * />
 */
