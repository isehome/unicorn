/**
 * Floor Plan Viewer Page
 * 
 * Mobile-optimized dedicated page with pan/zoom and pulsing highlight
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { supabase } from '../lib/supabase';
import { useAppState } from '../contexts/AppStateContext';
import '../styles/FloorPlanViewer.css';

export default function FloorPlanViewer() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const wireDropId = searchParams.get('wireDropId');
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();

  const [floorPlan, setFloorPlan] = useState(null);
  const [wireDrop, setWireDrop] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Ref to access transform controls from outside the render prop
  const transformRef = useRef(null);
  
  useEffect(() => {
    loadFloorPlanData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wireDropId, projectId]);
  
  async function loadFloorPlanData() {
    if (!wireDropId || !projectId) {
      setError('Missing wire drop ID or project ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Load wire drop with shape data
      const { data: drop, error: dropError } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('id', wireDropId)
        .single();

      if (dropError) throw dropError;

      if (!drop.lucid_page_id || !drop.lucid_shape_id) {
        throw new Error('This wire drop is not linked to a floor plan location');
      }

      setWireDrop(drop);

      // 2. Load the corresponding floor plan page
      const { data: page, error: pageError } = await supabase
        .from('lucid_pages')
        .select('*')
        .eq('project_id', projectId)
        .eq('page_id', drop.lucid_page_id)
        .single();

      if (pageError) throw pageError;

      if (!page) {
        throw new Error('Floor plan page not found');
      }

      setFloorPlan(page);

      // 3. Load project context
      const { data: proj, error: projError } = await supabase
        .from('projects')
        .select('id, name, address, status')
        .eq('id', projectId)
        .single();

      if (!projError && proj) {
        setProject(proj);
      }
    } catch (err) {
      console.error('Error loading floor plan:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  // Calculate shape position as percentage of image
  const getShapePosition = () => {
    if (!wireDrop || !floorPlan || !floorPlan.bounding_box) return null;
    
    const boundingBox = floorPlan.bounding_box;
    
    // Convert Lucid coordinates to image percentages
    const x = ((wireDrop.shape_x - boundingBox.x) / boundingBox.width) * 100;
    const y = ((wireDrop.shape_y - boundingBox.y) / boundingBox.height) * 100;
    const width = (wireDrop.shape_width / boundingBox.width) * 100;
    const height = (wireDrop.shape_height / boundingBox.height) * 100;
    
    return { x, y, width, height };
  };
  
  const shapePos = getShapePosition();

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    if (!floorPlan) return;

    publishState({
      view: 'floor-plan-viewer',
      project: project ? {
        id: project.id,
        name: project.name,
        address: project.address,
        status: project.status
      } : { id: projectId },
      floorPlan: {
        pageId: floorPlan.page_id,
        pageTitle: floorPlan.page_title,
        floor: floorPlan.floor_number || floorPlan.page_title
      },
      wireDrop: wireDrop ? {
        id: wireDrop.id,
        name: wireDrop.drop_name,
        location: wireDrop.location,
        roomName: wireDrop.room_name
      } : null,
      imageLoaded,
      hint: 'Floor plan viewer showing wire drop location. Can zoom in/out, reset view, or navigate to wire drop details.'
    });
  }, [publishState, floorPlan, wireDrop, project, projectId, imageLoaded]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      zoom_in: async () => {
        if (transformRef.current) {
          transformRef.current.zoomIn();
          return { success: true, message: 'Zoomed in on floor plan' };
        }
        return { success: false, error: 'Transform controls not available' };
      },
      zoom_out: async () => {
        if (transformRef.current) {
          transformRef.current.zoomOut();
          return { success: true, message: 'Zoomed out on floor plan' };
        }
        return { success: false, error: 'Transform controls not available' };
      },
      reset_view: async () => {
        if (transformRef.current) {
          transformRef.current.resetTransform();
          return { success: true, message: 'Reset floor plan view to default' };
        }
        return { success: false, error: 'Transform controls not available' };
      },
      center_on_wire_drop: async () => {
        if (transformRef.current && shapePos) {
          transformRef.current.resetTransform();
          setTimeout(() => {
            transformRef.current.centerView(1.5, 300);
          }, 100);
          return { success: true, message: 'Centered view on wire drop location' };
        }
        return { success: false, error: 'Cannot center - wire drop position not available' };
      },
      select_wire_drop: async () => {
        if (wireDrop?.id) {
          navigate(`/wire-drops/${wireDrop.id}`);
          return { success: true, message: `Navigating to wire drop: ${wireDrop.drop_name}` };
        }
        return { success: false, error: 'No wire drop selected' };
      },
      go_back: async () => {
        navigate(-1);
        return { success: true, message: 'Going back to previous page' };
      },
      get_floor_plan_info: async () => {
        if (!floorPlan) return { success: false, error: 'Floor plan not loaded' };
        return {
          success: true,
          info: {
            pageTitle: floorPlan.page_title,
            floor: floorPlan.floor_number || floorPlan.page_title,
            wireDrop: wireDrop ? {
              name: wireDrop.drop_name,
              location: wireDrop.location,
              room: wireDrop.room_name
            } : null,
            projectName: project?.name || 'Unknown'
          }
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, navigate, floorPlan, wireDrop, project, shapePos]);

  if (loading) {
    return (
      <div className="floor-plan-viewer">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading floor plan...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="floor-plan-viewer">
        <div className="error-container">
          <h2>Error Loading Floor Plan</h2>
          <p>{error}</p>
          <button onClick={() => navigate(-1)} className="back-button">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }
  
  if (!floorPlan || !wireDrop) {
    return (
      <div className="floor-plan-viewer">
        <div className="error-container">
          <h2>Floor Plan Not Found</h2>
          <p>Unable to load floor plan data</p>
          <button onClick={() => navigate(-1)} className="back-button">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="floor-plan-viewer">
      <header className="viewer-header">
        <button onClick={() => navigate(-1)} className="back-button">
          ← Back
        </button>
        <div className="header-info">
          <h2>{wireDrop.name}</h2>
          {wireDrop.location && <span className="location">{wireDrop.location}</span>}
        </div>
        <span className="page-title">{floorPlan.page_title}</span>
      </header>
      
      <TransformWrapper
        ref={transformRef}
        initialScale={1.5}
        initialPositionX={0}
        initialPositionY={0}
        minScale={0.5}
        maxScale={5}
        centerOnInit={false}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: false, step: 0.7 }}
        panning={{ disabled: false }}
      >
        {({ zoomIn, zoomOut, resetTransform, centerView }) => (
          <>
            {/* Zoom Controls */}
            <div className="zoom-controls">
              <button onClick={() => zoomIn()} title="Zoom In">+</button>
              <button onClick={() => zoomOut()} title="Zoom Out">−</button>
              <button onClick={() => resetTransform()} title="Reset View">⟲</button>
              {shapePos && (
                <button
                  onClick={() => {
                    resetTransform();
                    // Center on shape after a brief delay
                    setTimeout(() => {
                      centerView(1.5, 300);
                    }, 100);
                  }}
                  title="Center on Wire Drop"
                >
                  🎯
                </button>
              )}
            </div>
            
            {/* Scrollable/Pannable Image */}
            <TransformComponent>
              <div className="floor-plan-container">
                <img 
                  src={floorPlan.image_url} 
                  alt={floorPlan.page_title}
                  className="floor-plan-image"
                  onLoad={() => setImageLoaded(true)}
                  draggable={false}
                />
                
                {/* Pulsing Highlight Overlay */}
                {shapePos && imageLoaded && (
                  <div 
                    className="shape-highlight pulse"
                    style={{
                      position: 'absolute',
                      left: `${shapePos.x}%`,
                      top: `${shapePos.y}%`,
                      width: `${shapePos.width}%`,
                      height: `${shapePos.height}%`,
                      pointerEvents: 'none'
                    }}
                  >
                    <div className="shape-label">
                      {wireDrop.name}
                    </div>
                  </div>
                )}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
