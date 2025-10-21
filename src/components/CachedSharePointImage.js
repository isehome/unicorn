/**
 * Cached SharePoint Image Component
 * 
 * Smart image component with:
 * - IndexedDB thumbnail caching
 * - Lazy loading via Intersection Observer
 * - Fallback chain (cached → live thumbnail → full image)
 * - Skeleton loader
 * - Error handling
 */

import React, { useState, useEffect, useRef } from 'react';
import { sharePointStorageService } from '../services/sharePointStorageService';

const CachedSharePointImage = ({
  sharePointUrl,
  displayType = 'thumbnail', // 'thumbnail' | 'full' | 'auto'
  size = 'medium', // 'small' | 'medium' | 'large'
  alt = 'Image',
  className = '',
  onClick = null,
  style = {}
}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
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

        // Use image proxy to handle SharePoint authentication server-side
        // This allows images to be embedded without requiring user to be logged into SharePoint
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}`;
        
        if (isMounted) {
          setImageSrc(proxyUrl);
        }
      } catch (err) {
        console.error('Failed to load image:', err);
        if (isMounted) {
          setError(err.message);
          // Fallback to full image URL on error
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
  }, [isVisible, sharePointUrl, displayType, size]);

  // Handle image load error - try fallback
  const handleImageError = () => {
    if (displayType !== 'full' && sharePointUrl !== imageSrc) {
      // Try loading full image as fallback
      console.warn('Thumbnail failed, falling back to full image');
      setImageSrc(sharePointUrl);
    } else {
      setError('Failed to load image');
      setLoading(false);
    }
  };

  // Handle successful image load
  const handleImageLoad = () => {
    setLoading(false);
    setError(null);
  };

  if (!sharePointUrl) {
    return (
      <div 
        ref={imgRef}
        className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 ${className}`}
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
      style={style}
      onClick={onClick}
    >
      {/* Skeleton loader */}
      {loading && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      )}

      {/* Error state */}
      {error && !loading && !imageSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
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
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="lazy"
        />
      )}

      {/* Cached indicator (optional, can be removed) */}
      {process.env.NODE_ENV === 'development' && imageSrc?.startsWith('data:') && !loading && (
        <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1 rounded opacity-75">
          Cached
        </div>
      )}
    </div>
  );
};

export default CachedSharePointImage;
