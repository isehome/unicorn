/**
 * Cached SharePoint Image Component
 * 
 * Smart image component with:
 * - IndexedDB thumbnail caching
 * - Lazy loading via Intersection Observer
 * - Thumbnail-first loading (lightweight)
 * - Full resolution on demand
 * - Skeleton loader
 * - Error handling
 */

import React, { useState, useEffect, useRef } from 'react';
import { thumbnailCache } from '../lib/thumbnailCache';

// SharePoint thumbnail size configurations
const THUMBNAIL_SIZES = {
  small: { width: 96, height: 96 },
  medium: { width: 300, height: 300 },
  large: { width: 800, height: 800 }
};

const CachedSharePointImage = ({
  sharePointUrl,
  sharePointDriveId = null, // NEW: SharePoint drive ID for proper thumbnail generation
  sharePointItemId = null,  // NEW: SharePoint item ID for proper thumbnail generation
  displayType = 'thumbnail', // 'thumbnail' | 'full' | 'auto'
  size = 'medium', // 'small' | 'medium' | 'large'
  alt = 'Image',
  className = '',
  onClick = null,
  style = {},
  showFullOnClick = true, // Enable full resolution view on click
  objectFit = null
}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showingFull, setShowingFull] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    if (!imgRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            // Once visible, disconnect observer
            if (observerRef.current) {
              observerRef.current.disconnect();
            }
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01
      }
    );

    observerRef.current.observe(imgRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Load image when visible
  useEffect(() => {
    if (!isVisible || !sharePointUrl) return;

    let isMounted = true;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Don't load full resolution unless explicitly requested
        if (showingFull || displayType === 'full') {
          // Use proxy for full resolution (requires auth)
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}`;
          if (isMounted) {
            setImageSrc(proxyUrl);
          }
        } else {
          // First check cache for thumbnail
          const cached = await thumbnailCache.get(sharePointUrl, size);
          if (cached && isMounted) {
            // Use cached thumbnail (base64 data URL)
            setImageSrc(`data:${cached.type};base64,${cached.thumbnailData}`);
            setLoading(false);
            return;
          }

          // NEW: If we have SharePoint metadata, use the proper Graph API thumbnail endpoint
          if (sharePointDriveId && sharePointItemId) {
            const thumbnailUrl = `/api/sharepoint-thumbnail?driveId=${encodeURIComponent(sharePointDriveId)}&itemId=${encodeURIComponent(sharePointItemId)}&size=${size}`;
            console.log('Using Graph API thumbnail:', thumbnailUrl);
            if (isMounted) {
              setImageSrc(thumbnailUrl);
            }
          } else {
            // FALLBACK: Old behavior for photos uploaded before metadata was stored
            console.warn('No SharePoint metadata available, using fallback thumbnail method');
            const sizeConfig = THUMBNAIL_SIZES[size] || THUMBNAIL_SIZES.medium;
            
            // For embed URLs (format: https://tenant.sharepoint.com/:i:/g/...)
            // Try adding thumbnail parameters (may not work)
            let thumbnailUrl;
            if (sharePointUrl.includes('/:i:/') || sharePointUrl.includes('/:x:/')) {
              // This is an embed link - try direct thumbnail access
              thumbnailUrl = `${sharePointUrl}&width=${sizeConfig.width}&height=${sizeConfig.height}`;
            } else {
              // For other URLs, try the proxy with size parameters
              thumbnailUrl = `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}&width=${sizeConfig.width}&height=${sizeConfig.height}`;
            }

            if (isMounted) {
              setImageSrc(thumbnailUrl);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        if (isMounted) {
          setError(err.message);
          // Try direct URL as last resort
          setImageSrc(sharePointUrl);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
    };
  }, [isVisible, sharePointUrl, displayType, size, showingFull]);

  // Handle image load error - try fallback
  const handleImageError = async () => {
    console.warn('Image load failed, trying fallback:', imageSrc);
    
    // If thumbnail failed, try proxy
    if (!imageSrc?.includes('/api/image-proxy')) {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}`;
      setImageSrc(proxyUrl);
    } else if (sharePointUrl !== imageSrc) {
      // Last resort: try direct URL
      setImageSrc(sharePointUrl);
    } else {
      setError('Failed to load image');
      setLoading(false);
    }
  };

  // Handle successful image load
  const handleImageLoad = async () => {
    setLoading(false);
    setError(null);
    
    // Cache the thumbnail if it loaded successfully and isn't already cached
    if (!showingFull && displayType !== 'full' && imageSrc && !imageSrc.startsWith('data:')) {
      try {
        // Get the image as base64 for caching
        const img = imgRef.current?.querySelector('img');
        if (img) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          await thumbnailCache.set(sharePointUrl, base64, size, 'image/jpeg');
        }
      } catch (err) {
        // Caching failed, but image loaded - not critical
        console.warn('Failed to cache thumbnail:', err);
      }
    }
  };

  // Handle click to show full resolution
  const handleClick = (e) => {
    if (showFullOnClick && !showingFull && displayType !== 'full') {
      e.preventDefault();
      e.stopPropagation();
      setShowingFull(true);
    }
    if (onClick) {
      onClick(e);
    }
  };

  if (!sharePointUrl) {
    return (
      <div 
        ref={imgRef}
        className={`flex items-center justify-center bg-gray-100 dark:bg-zinc-800 ${className}`}
        style={style}
      >
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div 
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{ ...style, cursor: showFullOnClick && !showingFull ? 'zoom-in' : style.cursor }}
      onClick={handleClick}
    >
      {/* Skeleton loader */}
      {loading && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      )}

      {/* Error state */}
      {error && !loading && !imageSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-800">
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>Failed to load</p>
          </div>
        </div>
      )}

      {/* Actual image */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          className={`w-full h-full transition-opacity duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="lazy"
          style={{ objectFit: objectFit || (displayType === 'full' ? 'contain' : 'cover') }}
        />
      )}

      {/* Indicators */}
      {process.env.NODE_ENV === 'development' && !loading && (
        <>
          {imageSrc?.startsWith('data:') && (
            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1 rounded opacity-75">
              Cached
            </div>
          )}
          {showingFull && (
            <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-1 rounded opacity-75">
              Full
            </div>
          )}
          {!showingFull && displayType !== 'full' && (
            <div className="absolute bottom-1 right-1 bg-gray-700 text-white text-xs px-1 rounded opacity-50">
              {size}
            </div>
          )}
        </>
      )}

      {/* Click hint overlay */}
      {showFullOnClick && !showingFull && !loading && !error && displayType !== 'full' && (
        <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all pointer-events-none flex items-center justify-center">
          <div className="opacity-0 hover:opacity-100 transition-opacity">
            <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default CachedSharePointImage;
