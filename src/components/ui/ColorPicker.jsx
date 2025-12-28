/**
 * ColorPicker.jsx
 * A color picker component with preset swatches and optional custom color input
 * Used for avatar color selection in user settings
 */

import React, { useState, useRef, useEffect } from 'react';
import { Check, Palette } from 'lucide-react';

// Preset avatar colors - vibrant, distinguishable colors
const PRESET_COLORS = [
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#0EA5E9', name: 'Sky' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#10B981', name: 'Emerald' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#D946EF', name: 'Fuchsia' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#78716C', name: 'Stone' },
  { hex: '#71717A', name: 'Zinc' },
];

/**
 * Get initials from a name
 */
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const ColorPicker = ({
  value,
  onChange,
  userName = 'User',
  showPreview = true,
  label = 'Avatar Color',
  className = ''
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customColor, setCustomColor] = useState(value || '#8B5CF6');
  const colorInputRef = useRef(null);

  const selectedColor = value || '#8B5CF6';
  const initials = getInitials(userName);

  // Handle preset color selection
  const handlePresetClick = (hex) => {
    onChange?.(hex);
    setShowCustomInput(false);
  };

  // Handle custom color change
  const handleCustomColorChange = (e) => {
    const hex = e.target.value;
    setCustomColor(hex);
    onChange?.(hex);
  };

  // Open native color picker
  const handleOpenColorPicker = () => {
    if (colorInputRef.current) {
      colorInputRef.current.click();
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
          <Palette size={14} />
          {label}
        </label>
      )}

      {/* Preview */}
      {showPreview && (
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
            style={{ backgroundColor: selectedColor }}
          >
            {initials}
          </div>
          <div className="text-sm">
            <div className="text-zinc-300 font-medium">{userName}</div>
            <div className="text-zinc-500 font-mono text-xs">{selectedColor}</div>
          </div>
        </div>
      )}

      {/* Preset Colors Grid */}
      <div className="grid grid-cols-8 gap-2 mb-3">
        {PRESET_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => handlePresetClick(color.hex)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 ${
              selectedColor === color.hex ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-800' : ''
            }`}
            style={{ backgroundColor: color.hex }}
            title={color.name}
          >
            {selectedColor === color.hex && (
              <Check size={14} className="text-white drop-shadow-md" />
            )}
          </button>
        ))}
      </div>

      {/* Custom Color Section */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenColorPicker}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-white bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <div
            className="w-4 h-4 rounded border border-zinc-500"
            style={{ backgroundColor: customColor }}
          />
          Custom Color
        </button>

        {/* Hidden native color input */}
        <input
          ref={colorInputRef}
          type="color"
          value={customColor}
          onChange={handleCustomColorChange}
          className="sr-only"
          aria-label="Choose custom color"
        />

        {/* Manual hex input */}
        <input
          type="text"
          value={selectedColor}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
              setCustomColor(val);
              if (val.length === 7) {
                onChange?.(val);
              }
            }
          }}
          placeholder="#RRGGBB"
          className="w-24 px-2 py-1 text-xs font-mono bg-zinc-700 border border-zinc-600 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>
    </div>
  );
};

export default ColorPicker;
export { PRESET_COLORS, getInitials };
