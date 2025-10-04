/**
 * Pre-load Floor Plans Hook
 * 
 * Pre-loads floor plan images when viewing a project to improve performance
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function usePreloadFloorPlans(projectId) {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!projectId) {
      setLoaded(true);
      return;
    }
    
    preloadImages();
  }, [projectId]);
  
  async function preloadImages() {
    try {
      setError(null);
      setProgress(0);
      
      // Fetch all floor plan pages for this project
      const { data: pages, error: fetchError } = await supabase
        .from('lucid_pages')
        .select('image_url')
        .eq('project_id', projectId);
      
      if (fetchError) throw fetchError;
      
      if (!pages || pages.length === 0) {
        setLoaded(true);
        setProgress(100);
        return;
      }
      
      // Preload each image
      const totalPages = pages.length;
      let loadedCount = 0;
      
      const promises = pages.map(page => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            loadedCount++;
            setProgress(Math.round((loadedCount / totalPages) * 100));
            resolve();
          };
          img.onerror = () => {
            // Continue even if one fails
            loadedCount++;
            setProgress(Math.round((loadedCount / totalPages) * 100));
            resolve();
          };
          img.src = page.image_url;
        });
      });
      
      await Promise.all(promises);
      setLoaded(true);
    } catch (err) {
      console.error('Error preloading floor plans:', err);
      setError(err.message);
      setLoaded(true); // Still mark as "loaded" to avoid blocking UI
    }
  }
  
  return { loaded, progress, error };
}
