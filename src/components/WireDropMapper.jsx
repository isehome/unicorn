/**
 * Wire Drop Mapper Component
 * 
 * Split-view interface for mapping wire drops to Lucid shapes
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { extractShapes } from '../services/lucidApi';

export default function WireDropMapper({ projectId, documentData, onSave, onCancel }) {
  const [shapes, setShapes] = useState([]);
  const [wireDrops, setWireDrops] = useState([]);
  const [associations, setAssociations] = useState([]);
  const [selectedShape, setSelectedShape] = useState(null);
  const [selectedWireDrop, setSelectedWireDrop] = useState(null);
  const [shapeFilter, setShapeFilter] = useState('');
  const [wireDropFilter, setWireDropFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoMatchCount, setAutoMatchCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [projectId, documentData]);

  async function loadData() {
    setLoading(true);
    try {
      // Extract shapes from document data
      const extractedShapes = extractShapes(documentData);
      setShapes(extractedShapes);

      // Load wire drops for this project
      const { data: drops, error } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId)
        .order('name');

      if (error) throw error;
      setWireDrops(drops || []);

      // Load existing associations
      const existingAssociations = drops
        .filter(drop => drop.lucid_shape_id)
        .map(drop => ({
          wireDropId: drop.id,
          shapeId: drop.lucid_shape_id,
          pageId: drop.lucid_page_id
        }));
      setAssociations(existingAssociations);
    } catch (error) {
      console.error('Error loading data:', error);
      alert(`Error loading data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function autoMatchByRoomName() {
    const matches = [];
    let matchCount = 0;

    shapes.forEach(shape => {
      const shapeName = (shape.text || '').toLowerCase().trim();
      if (!shapeName) return;

      // Find wire drop with matching location/name
      const matchingDrop = wireDrops.find(drop => {
        const dropLocation = (drop.location || '').toLowerCase().trim();
        const dropName = (drop.name || '').toLowerCase().trim();
        
        // Check if already associated
        const alreadyAssociated = associations.some(a => a.wireDropId === drop.id);
        if (alreadyAssociated) return false;

        return dropLocation === shapeName || dropName === shapeName;
      });

      if (matchingDrop) {
        matches.push({
          wireDropId: matchingDrop.id,
          shapeId: shape.id,
          pageId: shape.pageId,
          shapeX: shape.boundingBox.x,
          shapeY: shape.boundingBox.y,
          shapeWidth: shape.boundingBox.w,
          shapeHeight: shape.boundingBox.h
        });
        matchCount++;
      }
    });

    setAssociations([...associations, ...matches]);
    setAutoMatchCount(matchCount);
    alert(`Auto-matched ${matchCount} wire drops to shapes`);
  }

  function handleShapeClick(shape) {
    setSelectedShape(shape);
    if (selectedWireDrop) {
      // Create association
      addAssociation(selectedWireDrop, shape);
      setSelectedWireDrop(null);
      setSelectedShape(null);
    }
  }

  function handleWireDropClick(wireDrop) {
    setSelectedWireDrop(wireDrop);
    if (selectedShape) {
      // Create association
      addAssociation(wireDrop, selectedShape);
      setSelectedWireDrop(null);
      setSelectedShape(null);
    }
  }

  function addAssociation(wireDrop, shape) {
    // Check if already associated
    const existing = associations.find(a => a.wireDropId === wireDrop.id);
    if (existing) {
      // Update existing
      setAssociations(associations.map(a =>
        a.wireDropId === wireDrop.id
          ? {
              wireDropId: wireDrop.id,
              shapeId: shape.id,
              pageId: shape.pageId,
              shapeX: shape.boundingBox.x,
              shapeY: shape.boundingBox.y,
              shapeWidth: shape.boundingBox.w,
              shapeHeight: shape.boundingBox.h
            }
          : a
      ));
    } else {
      // Add new
      setAssociations([...associations, {
        wireDropId: wireDrop.id,
        shapeId: shape.id,
        pageId: shape.pageId,
        shapeX: shape.boundingBox.x,
        shapeY: shape.boundingBox.y,
        shapeWidth: shape.boundingBox.w,
        shapeHeight: shape.boundingBox.h
      }]);
    }
  }

  function removeAssociation(wireDropId) {
    setAssociations(associations.filter(a => a.wireDropId !== wireDropId));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Save all associations to database with shape custom data
      const updates = associations.map(assoc => {
        // Find the shape to get its custom data
        const shape = shapes.find(s => s.id === assoc.shapeId);
        
        return {
          id: assoc.wireDropId,
          lucid_shape_id: assoc.shapeId,
          lucid_page_id: assoc.pageId,
          shape_x: assoc.shapeX,
          shape_y: assoc.shapeY,
          shape_width: assoc.shapeWidth,
          shape_height: assoc.shapeHeight,
          shape_data: shape?.customData || {} // Save the custom data from Lucid
        };
      });

      const { error } = await supabase
        .from('wire_drops')
        .upsert(updates);

      if (error) throw error;

      alert(`Successfully saved ${associations.length} associations with shape data`);
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving associations:', error);
      alert(`Error saving: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function getAssociatedShape(wireDropId) {
    const assoc = associations.find(a => a.wireDropId === wireDropId);
    if (!assoc) return null;
    return shapes.find(s => s.id === assoc.shapeId);
  }

  function isShapeAssociated(shapeId) {
    return associations.some(a => a.shapeId === shapeId);
  }

  const filteredShapes = shapes.filter(shape => {
    const text = (shape.text || '').toLowerCase();
    const pageTitle = (shape.pageTitle || '').toLowerCase();
    const filter = shapeFilter.toLowerCase();
    return text.includes(filter) || pageTitle.includes(filter);
  });

  const filteredWireDrops = wireDrops.filter(drop => {
    const name = (drop.name || '').toLowerCase();
    const location = (drop.location || '').toLowerCase();
    const filter = wireDropFilter.toLowerCase();
    return name.includes(filter) || location.includes(filter);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading shapes and wire drops...</div>
      </div>
    );
  }

  return (
    <div className="wire-drop-mapper bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Wire Drop to Shape Mapping</h2>
        <p className="text-gray-600">
          Click on a shape and then a wire drop to link them together. Or use auto-match to automatically match by name/location.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={autoMatchByRoomName}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={saving}
          >
            🔗 Auto-Match by Name
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-white rounded"
            style={{ backgroundColor: '#94AF32' }}
            disabled={saving || associations.length === 0}
          >
            {saving ? 'Saving...' : `💾 Save ${associations.length} Associations`}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shapes Column */}
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Lucid Shapes ({filteredShapes.length})</h3>
          <input
            type="text"
            placeholder="Filter shapes..."
            value={shapeFilter}
            onChange={(e) => setShapeFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-3"
          />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredShapes.map(shape => (
              <div
                key={shape.id}
                onClick={() => handleShapeClick(shape)}
                className={`p-3 border rounded cursor-pointer transition ${
                  selectedShape?.id === shape.id
                    ? 'bg-blue-100 border-blue-500'
                    : isShapeAssociated(shape.id)
                    ? ''
                    : 'bg-white hover:bg-zinc-50'
                }
                style={isShapeAssociated(shape.id) && selectedShape?.id !== shape.id
                  ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.4)' }
                  : {}
                }`}
              >
                <div className="font-medium">{shape.text || 'Unnamed Shape'}</div>
                <div className="text-sm text-gray-500">{shape.pageTitle}</div>
                {isShapeAssociated(shape.id) && (
                  <div className="text-xs mt-1" style={{ color: '#94AF32' }}>✓ Associated</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Wire Drops Column */}
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Wire Drops ({filteredWireDrops.length})</h3>
          <input
            type="text"
            placeholder="Filter wire drops..."
            value={wireDropFilter}
            onChange={(e) => setWireDropFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-3"
          />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredWireDrops.map(drop => {
              const associatedShape = getAssociatedShape(drop.id);
              return (
                <div
                  key={drop.id}
                  onClick={() => handleWireDropClick(drop)}
                  className={`p-3 border rounded cursor-pointer transition ${
                    selectedWireDrop?.id === drop.id
                      ? 'bg-blue-100 border-blue-500'
                      : associatedShape
                      ? ''
                      : 'bg-white hover:bg-zinc-50'
                }
                style={associatedShape && selectedWireDrop?.id !== drop.id
                  ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.4)' }
                  : {}
                  }`}
                >
                  <div className="font-medium">{drop.name}</div>
                  {drop.location && (
                    <div className="text-sm text-gray-500">{drop.location}</div>
                  )}
                  {associatedShape && (
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs" style={{ color: '#94AF32' }}>
                        ✓ Linked to: {associatedShape.text || 'Shape'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAssociation(drop.id);
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
