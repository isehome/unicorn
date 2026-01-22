/**
 * BrandColorPicker.jsx
 * A simplified color picker for company brand colors
 * Used for selecting Primary, Secondary, and Tertiary brand colors
 * Similar pattern to avatar ColorPicker but optimized for brand color selection
 */

import { useState, useRef } from 'react';
import { Check, Palette } from 'lucide-react';

// Preset brand-appropriate colors - professional colors suitable for business communications
const PRESET_COLORS = [
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#0EA5E9', name: 'Sky' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#10B981', name: 'Emerald' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#94AF32', name: 'Olive' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#F59E0B', name: 'Amber' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#D946EF', name: 'Fuchsia' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#64748B', name: 'Slate' },
];

const BrandColorPicker = ({
  value,
  onChange,
  label = 'Color',
  description,
  className = ''
}) => {
  const [customColor, setCustomColor] = useState(value || '#8B5CF6');
  const colorInputRef = useRef(null);

  const selectedColor = value || '#8B5CF6';

  // Handle preset color selection
  const handlePresetClick = (hex) => {
    onChange?.(hex);
    setCustomColor(hex);
  };

  // Handle custom color change from native picker
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
      {/* Label and Preview Row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          {label && (
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Palette size={14} />
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>

        {/* Color Preview with hex */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg border-2 border-gray-200 dark:border-gray-600 shadow-sm"
            style={{ backgroundColor: selectedColor }}
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => {
              const val = e.target.value.toUpperCase();
              setCustomColor(val);
              const normalizedVal = val.startsWith('#') ? val : `#${val}`;
              if (/^#[0-9A-Fa-f]{6}$/.test(normalizedVal)) {
                onChange?.(normalizedVal);
              }
            }}
            onBlur={(e) => {
              const val = e.target.value;
              const normalizedVal = val.startsWith('#') ? val : `#${val}`;
              if (/^#[0-9A-Fa-f]{6}$/.test(normalizedVal)) {
                setCustomColor(normalizedVal);
                onChange?.(normalizedVal);
              } else {
                setCustomColor(selectedColor);
              }
            }}
            placeholder="#RRGGBB"
            maxLength={7}
            className="w-20 px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Preset Colors Grid */}
      <div className="grid grid-cols-8 gap-2 mb-3">
        {PRESET_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => handlePresetClick(color.hex)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-violet-500 ${
              selectedColor === color.hex ? 'ring-2 ring-violet-500 ring-offset-1' : ''
            }`}
            style={{ backgroundColor: color.hex }}
            title={color.name}
          >
            {selectedColor === color.hex && (
              <Check size={12} className="text-white drop-shadow-md" />
            )}
          </button>
        ))}
      </div>

      {/* Custom Color Button */}
      <button
        type="button"
        onClick={handleOpenColorPicker}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-zinc-700/50 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
      >
        <div
          className="w-4 h-4 rounded border border-gray-400 dark:border-zinc-500"
          style={{ backgroundColor: customColor }}
        />
        Choose Custom Color
      </button>

      {/* Hidden native color input */}
      <input
        ref={colorInputRef}
        type="color"
        value={/^#[0-9A-Fa-f]{6}$/.test(customColor) ? customColor : selectedColor}
        onChange={handleCustomColorChange}
        className="sr-only"
        aria-label="Choose custom color"
      />
    </div>
  );
};

export default BrandColorPicker;
export { PRESET_COLORS };
