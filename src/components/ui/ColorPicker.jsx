/**
 * ColorPicker.jsx
 * A color picker component with preset swatches and optional custom color input
 * Used for avatar color selection in user settings
 */

import { useState, useRef } from 'react';
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
  const [customColor, setCustomColor] = useState(value || '#8B5CF6');
  const colorInputRef = useRef(null);

  const selectedColor = value || '#8B5CF6';
  const initials = getInitials(userName);

  // Handle preset color selection
  const handlePresetClick = (hex) => {
    onChange?.(hex);
    setCustomColor(hex);
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
            <div className="text-zinc-300 dark:text-zinc-300 text-gray-700 font-medium">{userName}</div>
            <input
              type="text"
              value={selectedColor}
              onChange={(e) => {
                const val = e.target.value;
                // Allow typing partial hex codes
                if (/^#?[0-9A-Fa-f]{0,6}$/.test(val)) {
                  // Ensure it starts with #
                  const normalizedVal = val.startsWith('#') ? val : `#${val}`;
                  setCustomColor(normalizedVal);
                  // Only trigger onChange when it's a complete valid hex
                  if (/^#[0-9A-Fa-f]{6}$/.test(normalizedVal)) {
                    onChange?.(normalizedVal);
                  }
                }
              }}
              onBlur={(e) => {
                // On blur, if it's not a valid complete hex, reset to current selected
                const val = e.target.value;
                if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
                  setCustomColor(selectedColor);
                }
              }}
              placeholder="#RRGGBB"
              className="w-20 px-1 py-0.5 text-xs font-mono bg-transparent border border-transparent hover:border-zinc-500 dark:hover:border-zinc-500 hover:border-gray-300 focus:border-violet-500 dark:focus:border-violet-500 focus:bg-zinc-700 dark:focus:bg-zinc-700 focus:bg-gray-100 rounded text-zinc-500 dark:text-zinc-500 text-gray-500 focus:text-white dark:focus:text-white focus:text-gray-900 placeholder-zinc-500 focus:outline-none transition-all cursor-text"
              title="Click to edit hex color"
            />
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
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 dark:text-zinc-400 text-gray-600 hover:text-white dark:hover:text-white hover:text-gray-900 bg-zinc-700/50 dark:bg-zinc-700/50 bg-gray-200 hover:bg-zinc-700 dark:hover:bg-zinc-700 hover:bg-gray-300 rounded-lg transition-colors"
        >
          <div
            className="w-4 h-4 rounded border border-zinc-500 dark:border-zinc-500 border-gray-400"
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

        {/* Manual hex input - labeled for clarity */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500 text-gray-500">or enter hex:</span>
          <input
            type="text"
            value={selectedColor}
            onChange={(e) => {
              const val = e.target.value;
              // Allow typing with or without # prefix
              if (/^#?[0-9A-Fa-f]{0,6}$/.test(val)) {
                const normalizedVal = val.startsWith('#') ? val : `#${val}`;
                setCustomColor(normalizedVal);
                if (/^#[0-9A-Fa-f]{6}$/.test(normalizedVal)) {
                  onChange?.(normalizedVal);
                }
              }
            }}
            onBlur={(e) => {
              const val = e.target.value;
              if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
                setCustomColor(selectedColor);
              }
            }}
            placeholder="#RRGGBB"
            className="w-24 px-2 py-1 text-xs font-mono bg-zinc-700 dark:bg-zinc-700 bg-gray-100 border border-zinc-600 dark:border-zinc-600 border-gray-300 rounded text-white dark:text-white text-gray-900 placeholder-zinc-500 dark:placeholder-zinc-500 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
export { PRESET_COLORS, getInitials };
