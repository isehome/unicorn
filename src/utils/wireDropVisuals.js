// Utility helpers for computing wire drop badge visuals (letter + colors)

const DEFAULT_BADGE_COLOR = '#6B7280'; // Tailwind gray-600
const DEFAULT_BADGE_LETTER = '?';

/**
 * Determine the best letter/initials to display for a wire drop badge.
 * Prefers Lucid shape text, then short drop names, finally drop type initial.
 */
export function getWireDropBadgeLetter(drop) {
  if (!drop) return DEFAULT_BADGE_LETTER;

  const shapeData = drop.shape_data || drop.shapeData;

  // Prefer Lucid shape text when it is short (1-2 characters)
  if (shapeData) {
    const textCandidates = [
      shapeData.text,
      shapeData.Text,
      shapeData['Shape Name'],
      shapeData['shape_name'],
      shapeData['shapeName']
    ].filter(Boolean);

    for (const candidate of textCandidates) {
      if (typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 2) {
        return candidate.toUpperCase();
      }
    }
  }

  // Use drop_name when it is already a short identifier (e.g., A, K, L2)
  if (typeof drop.drop_name === 'string' && drop.drop_name.length <= 2 && /^[A-Z0-9]{1,2}$/i.test(drop.drop_name)) {
    return drop.drop_name.toUpperCase();
  }

  // Fallback to shape name field if it exists
  if (typeof drop.shape_name === 'string' && drop.shape_name.length > 0) {
    return drop.shape_name.charAt(0).toUpperCase();
  }

  // Fallback to drop type initial
  if (typeof drop.drop_type === 'string' && drop.drop_type.length > 0) {
    return drop.drop_type.charAt(0).toUpperCase();
  }

  return DEFAULT_BADGE_LETTER;
}

/**
 * Extract a usable hex color for the badge background.
 * Checks shape metadata first, then dedicated columns.
 */
export function getWireDropBadgeColor(drop) {
  if (!drop) return DEFAULT_BADGE_COLOR;

  const shapeData = drop.shape_data || drop.shapeData;

  // Lucid metadata often stores "Color" and variants – scan for usable hex colors
  if (shapeData && typeof shapeData === 'object') {
    const candidateList = [
      shapeData['Shape Color'],
      shapeData?.customData?.['Shape Color'],
      shapeData?.customData?.['shape color'],
      shapeData.Color || shapeData.color
    ].filter(Boolean);

    for (const value of candidateList) {
      if (isHexColor(value)) return normalizeHex(value);
      if (isRgbaColor(value)) return normalizeHex(rgbaToHex(value));
    }

    const colorFields = ['fillColor', 'fill_color', 'fillcolor', 'shapeColor', 'shape_color', 'strokeColor', 'stroke_color'];
    for (const field of colorFields) {
      const value = shapeData[field];
      if (isHexColor(value)) return normalizeHex(value);
      if (isRgbaColor(value)) return normalizeHex(rgbaToHex(value));
    }

    if (shapeData.customData && typeof shapeData.customData === 'object') {
      for (const field of colorFields) {
        const customValue = shapeData.customData[field];
        if (isHexColor(customValue)) return normalizeHex(customValue);
        if (isRgbaColor(customValue)) return normalizeHex(rgbaToHex(customValue));
      }
    }
  }

  // Fallback to columns stored directly on the wire drop
  const columnCandidates = [
    drop.shape_color,
    drop.shape_fill_color,
    drop.fill_color,
    drop.color
  ];

  for (const value of columnCandidates) {
    if (isHexColor(value)) return normalizeHex(value);
  }

  return DEFAULT_BADGE_COLOR;
}

/**
 * Choose black/white text for readability on the badge background.
 */
export function getWireDropBadgeTextColor(hexColor) {
  const color = isHexColor(hexColor) ? normalizeHex(hexColor) : DEFAULT_BADGE_COLOR;

  const { r, g, b } = hexToRgb(color);

  // Standard luminance formula with sRGB gamma correction
  const luminance = 0.2126 * linearize(r / 255) + 0.7152 * linearize(g / 255) + 0.0722 * linearize(b / 255);

  // Threshold chosen so bright colors get dark text and dark colors get white text
  return luminance > 0.6 ? '#18181B' : '#FFFFFF';
}

function isHexColor(value) {
  return typeof value === 'string' && /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(value.trim());
}

function isRgbaColor(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // matches #RRGGBBFF or #RRGGBBAA style strings returned by Lucid
  if (/^#([A-Fa-f0-9]{8})$/.test(trimmed)) return true;
  if (/^rgba?\(/i.test(trimmed)) return true;
  return false;
}

function normalizeHex(value) {
  return value.trim().toUpperCase();
}

function rgbaToHex(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();

  // Handle Lucid-style #RRGGBBAA
  const eightHex = /^#([A-Fa-f0-9]{8})$/;
  const match = trimmed.match(eightHex);
  if (match) {
    const hex = match[1].slice(0, 6);
    return `#${hex}`;
  }

  // Handle rgba(r,g,b,a)
  const rgbaMatch = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgbaMatch) {
    const r = Math.min(255, parseInt(rgbaMatch[1], 10));
    const g = Math.min(255, parseInt(rgbaMatch[2], 10));
    const b = Math.min(255, parseInt(rgbaMatch[3], 10));
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  return value;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  const raw = normalized.slice(1);

  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16)
    };
  }

  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

function linearize(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export const wireDropBadgeDefaults = {
  color: DEFAULT_BADGE_COLOR,
  letter: DEFAULT_BADGE_LETTER,
  textColor: '#FFFFFF'
};
