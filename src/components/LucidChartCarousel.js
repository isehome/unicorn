import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader, AlertCircle, ExternalLink } from 'lucide-react';
import { fetchDocumentContents, extractDocumentIdFromUrl } from '../services/lucidApi';
import { getCachedPageImage, preloadDocumentPages } from '../services/lucidCacheService';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const LucidChartCarousel = ({ documentUrl, projectName }) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const carouselRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pages, setPages] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    if (documentUrl) {
      loadDocumentPages();
    }
  }, [documentUrl]);

  const loadDocumentPages = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const documentId = extractDocumentIdFromUrl(documentUrl);
      if (!documentId) {
        throw new Error('Invalid Lucid Chart URL');
      }

      // Fetch document data to get page information
      const docData = await fetchDocumentContents(documentId);
      
      if (docData && docData.pages) {
        const pageData = docData.pages.map((page, index) => ({
          id: page.id,
          title: page.title || `Page ${index + 1}`,
          index: index
        }));
        setPages(pageData);
        
        // Load thumbnails for each page
        loadThumbnails(documentId, pageData);
      }
    } catch (err) {
      console.error('Failed to load document pages:', err);
      setError(err.message || 'Failed to load document pages');
    } finally {
      setLoading(false);
    }
  };

  const loadThumbnails = async (documentId, pageData) => {
    try {
      console.log(`Loading thumbnails for ${pageData.length} pages using cache service...`);
      
      // Use the cache service to load all pages (with batching and caching)
      const imageUrls = await preloadDocumentPages(documentId, pageData);
      
      // Update state with all loaded images
      setThumbnails(imageUrls);
      
      // Also load individual pages if some failed during batch loading
      for (const page of pageData) {
        if (!imageUrls[page.index]) {
          try {
            const imageUrl = await getCachedPageImage(documentId, page.index, {
              title: page.title,
              id: page.id
            });
            
            if (imageUrl) {
              setThumbnails(prev => ({ ...prev, [page.index]: imageUrl }));
            }
          } catch (error) {
            console.error(`Failed to load cached image for page ${page.index}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load thumbnails:', error);
      
      // Generate placeholder for all pages if loading fails
      const placeholders = {};
      for (const page of pageData) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        
        // Draw placeholder background
        ctx.fillStyle = mode === 'dark' ? '#374151' : '#f3f4f6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        ctx.strokeStyle = mode === 'dark' ? '#4b5563' : '#d1d5db';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
        
        // Draw page icon
        ctx.fillStyle = mode === 'dark' ? '#9ca3af' : '#6b7280';
        ctx.font = '48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📄', canvas.width / 2, canvas.height / 2 - 20);
        
        // Draw page title
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = mode === 'dark' ? '#e5e7eb' : '#374151';
        ctx.fillText(page.title, canvas.width / 2, canvas.height / 2 + 40);
        
        // Draw "Loading..." text
        ctx.font = '12px sans-serif';
        ctx.fillStyle = mode === 'dark' ? '#9ca3af' : '#6b7280';
        ctx.fillText('Loading image...', canvas.width / 2, canvas.height / 2 + 60);
        
        placeholders[page.index] = canvas.toDataURL();
      }
      setThumbnails(placeholders);
    }
  };

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + pages.length) % pages.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % pages.length);
  };

  const handleDotClick = (index) => {
    setCurrentIndex(index);
  };

  // Touch/Mouse drag handlers for swipe functionality
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current.offsetLeft);
    setScrollLeft(carouselRef.current.scrollLeft);
  };

  const handleTouchStart = (e) => {
    setIsDragging(true);
    setStartX(e.touches[0].pageX - carouselRef.current.offsetLeft);
    setScrollLeft(carouselRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    carouselRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const x = e.touches[0].pageX - carouselRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    carouselRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Snap to nearest page
    const carousel = carouselRef.current;
    const scrollPosition = carousel.scrollLeft;
    const itemWidth = carousel.offsetWidth;
    const newIndex = Math.round(scrollPosition / itemWidth);
    setCurrentIndex(Math.max(0, Math.min(newIndex, pages.length - 1)));
    
    // Smooth scroll to the snapped position
    carousel.scrollTo({
      left: newIndex * itemWidth,
      behavior: 'smooth'
    });
  };

  const openInLucidChart = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  if (!documentUrl) {
    return null;
  }

  if (loading) {
    return (
      <div style={sectionStyles.card} className="p-6 mb-6">
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-violet-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading diagram pages...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={sectionStyles.card} className="p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <AlertCircle className="w-6 h-6 text-red-500 mr-2" />
          <span className="text-red-600 dark:text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return null;
  }

  return (
    <div style={sectionStyles.card} className="p-6 mb-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Wiring Diagram Overview
        </h2>
        <button
          onClick={openInLucidChart}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 
                   hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open in Lucid Chart
        </button>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        {/* Previous Button */}
        {pages.length > 1 && (
          <button
            onClick={handlePrevious}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-white dark:bg-gray-800 
                     rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        )}

        {/* Carousel Content */}
        <div
          ref={carouselRef}
          className="overflow-hidden rounded-lg cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleDragEnd}
        >
          <div 
            className="flex transition-transform duration-300 ease-in-out"
            style={{
              transform: `translateX(-${currentIndex * 100}%)`,
              touchAction: 'pan-y'
            }}
          >
            {pages.map((page, index) => (
              <div
                key={page.id}
                className="min-w-full flex flex-col items-center justify-center p-4"
              >
                {/* Thumbnail */}
                <div className="relative w-full max-w-2xl mx-auto mb-3">
                  <div className="aspect-[3/2] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden 
                                border-2 border-gray-200 dark:border-gray-700">
                    {thumbnails[index] ? (
                      <img
                        src={thumbnails[index]}
                        alt={page.title}
                        className="w-full h-full object-contain"
                        draggable="false"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <FileText className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-gray-500 dark:text-gray-400">Loading thumbnail...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Page Title */}
                <h3 className="text-center text-sm font-medium text-gray-900 dark:text-white">
                  {page.title}
                </h3>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Page {index + 1} of {pages.length}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Next Button */}
        {pages.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-white dark:bg-gray-800 
                     rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        )}
      </div>

      {/* Dots Indicator */}
      {pages.length > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {pages.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? 'w-6 bg-violet-600 dark:bg-violet-400'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
              }`}
              aria-label={`Go to page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LucidChartCarousel;
