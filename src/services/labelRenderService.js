import QRCode from 'qrcode';

// --- TEMPORARY CALIBRATION LOGIC START ---
/**
 * Generate Calibration Label with Ruler
 * Replaces standard label generation for margin testing
 */
export const generateCalibrationLabelBitmap = async () => {
  // Brady M211 printer resolution: 203 DPI
  const DPI = 203;

  // Dimensions
  const LABEL_WIDTH_INCHES = 2.25;
  const LABEL_HEIGHT_INCHES = 0.75;

  // Convert to pixels
  const WIDTH = Math.floor(LABEL_WIDTH_INCHES * DPI);
  const HEIGHT = Math.floor(LABEL_HEIGHT_INCHES * DPI);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // 1. Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Settings for Ruler
  const CENTER_X = WIDTH / 2;
  const CENTER_Y = HEIGHT / 2;

  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Draw Horizontal Line (X-Axis) across the middle
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CENTER_Y);
  ctx.lineTo(WIDTH, CENTER_Y);
  ctx.stroke();

  // Draw Top/Bottom border lines to clearly see vertical cutoff
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WIDTH, 0); // Top edge
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  ctx.lineTo(WIDTH, HEIGHT); // Bottom edge
  ctx.stroke();

  // Draw Vertical Center Line
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, 0);
  ctx.lineTo(CENTER_X, HEIGHT);
  ctx.stroke();

  // --- DRAW TICKS ---
  const STEP_INCHES = 0.05;
  const STEP_PX = STEP_INCHES * DPI;

  // Function to draw tick
  const drawTick = (x, labelValue, isMajor) => {
    const tickHeight = isMajor ? (HEIGHT * 0.6) : (HEIGHT * 0.3); // Major ticks are taller
    const topY = (HEIGHT - tickHeight) / 2;
    const bottomY = topY + tickHeight;

    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.stroke();

    // Draw Label for Major Ticks (every 0.1")
    if (isMajor) {
      ctx.font = 'bold 16px Arial';
      // Label above the line
      ctx.fillText(labelValue.toFixed(1), x, topY - 18);
      // Label below the line
      ctx.fillText(labelValue.toFixed(1), x, bottomY + 4);
    }
  };

  // 1. Go Right from Center
  let dist = 0;
  for (let x = CENTER_X; x <= WIDTH; x += STEP_PX) {
    const isMajor = Math.abs(dist % 0.1) < 0.001 || Math.abs(dist % 0.1) > 0.099;
    drawTick(x, dist, isMajor);
    dist += 0.05;
  }

  // 2. Go Left from Center
  dist = 0;
  for (let x = CENTER_X; x >= 0; x -= STEP_PX) {
    if (x !== CENTER_X) {
      const isMajor = Math.abs(dist % 0.1) < 0.001 || Math.abs(dist % 0.1) > 0.099;
      drawTick(x, dist, isMajor);
    }
    dist += 0.05;
  }

  // --- DRAW "SAFE ZONE" MARKERS (Visual Reference Only) ---
  const LIMIT_PX = 0.75 * DPI;
  const leftSafe = CENTER_X - LIMIT_PX;
  const rightSafe = CENTER_X + LIMIT_PX;

  ctx.strokeStyle = 'red';
  ctx.lineWidth = 1;

  ctx.beginPath(); ctx.moveTo(leftSafe, 0); ctx.lineTo(leftSafe, HEIGHT); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rightSafe, 0); ctx.lineTo(rightSafe, HEIGHT); ctx.stroke();

  // Safe Zone Labels
  ctx.fillStyle = 'red';
  ctx.font = '10px Arial';
  ctx.fillText("OLD (0.75)", leftSafe, HEIGHT - 14);
  ctx.fillText("OLD (0.75)", rightSafe, HEIGHT - 14);

  return await canvasToImage(canvas);
};
// --- TEMPORARY CALIBRATION LOGIC END ---


/**
 * Generate wire drop label as bitmap image
 * Label size: 2.25" x 0.75" at 203 DPI (M211 printer resolution)
 *
 * @param {Object} wireDrop - Wire drop data
 * @returns {Promise<HTMLImageElement>} Label bitmap
 */
export const generateWireDropLabelBitmap = async (wireDrop) => {
  // Brady M211 printer resolution: 203 DPI
  const DPI = 203;

  // Label dimensions in inches (Standard Continuous Label Width)
  // We use 1.5" based on visual optimization (reduced from 2.25")
  const LABEL_WIDTH_INCHES = 1.5;
  const LABEL_HEIGHT_INCHES = 0.75;

  // Convert to pixels
  const WIDTH = Math.floor(LABEL_WIDTH_INCHES * DPI);
  const HEIGHT = Math.floor(LABEL_HEIGHT_INCHES * DPI);

  // Margins
  const MARGIN_TOP = Math.floor(0.125 * DPI);
  const MARGIN_BOTTOM = Math.floor(0.05 * DPI);

  // Calculate Safe Printable Area
  const SAFE_HEIGHT = HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Flag-style layout: QR (45%) | GAP (10%) | TEXT (45%)
  const QR_SECTION_WIDTH = Math.floor(WIDTH * 0.45);
  const GAP_SECTION_WIDTH = Math.floor(WIDTH * 0.10);
  const TEXT_SECTION_WIDTH = WIDTH - QR_SECTION_WIDTH - GAP_SECTION_WIDTH;

  // Draw center line in the gap section
  const centerLineX = QR_SECTION_WIDTH + (GAP_SECTION_WIDTH / 2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(centerLineX, MARGIN_TOP);
  ctx.lineTo(centerLineX, HEIGHT - MARGIN_BOTTOM);
  ctx.stroke();
  ctx.setLineDash([]);

  // LEFT SECTION: QR Code
  // Limit content to 0.75" from center
  const LIMIT_INCHES_LEFT = 0.75;
  const LIMIT_PX_LEFT = Math.floor(LIMIT_INCHES_LEFT * DPI);

  // Maximize size within SAFE_HEIGHT
  const qrSize = Math.floor(SAFE_HEIGHT * 0.95);
  // Align Left Edge to -0.75" from center
  const qrX = centerLineX - LIMIT_PX_LEFT;
  const qrY = MARGIN_TOP + Math.floor((SAFE_HEIGHT - qrSize) / 2);

  try {
    const qrDataUrl = await QRCode.toDataURL(wireDrop.uid || 'NO-UID', {
      width: qrSize,
      margin: 0,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const qrImage = await loadImage(qrDataUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  } catch (error) {
    console.error('Error generating QR code:', error);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
  }

  // RIGHT SECTION: Text Information
  // Move text closer to center line (10px padding)
  const textStartX = centerLineX + 10;

  // Constrain Right Edge to +0.749" from center (User Request)
  const LIMIT_INCHES_RIGHT = 0.749;
  const LIMIT_PX_RIGHT = Math.floor(LIMIT_INCHES_RIGHT * DPI);

  const textEndXLimit = centerLineX + LIMIT_PX_RIGHT;
  const textWidth = textEndXLimit - textStartX;
  const textStartY = MARGIN_TOP;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';

  // 1. Drop Name (Top)
  ctx.font = 'bold 20px Arial';
  const mainText = wireDrop.drop_name || 'No Name';
  const mainLines = wrapText(ctx, mainText, textWidth);
  let currentY = textStartY + 18;

  mainLines.forEach((line, index) => {
    if (index < 3) {
      ctx.fillText(line, textStartX, currentY);
      currentY += 22;
    }
  });

  // Bottom Section Calculation (Working Upwards from Bottom)
  let bottomY = HEIGHT - MARGIN_BOTTOM - 4;

  // 3. Drop ID / UID (Now at the very BOTTOM, Smaller, Non-Bold)
  ctx.font = '10px Arial';
  const uidLines = wrapText(ctx, wireDrop.uid || 'NO-UID', textWidth);

  for (let i = uidLines.length - 1; i >= 0; i--) {
    ctx.fillText(uidLines[i], textStartX, bottomY);
    bottomY -= 12; // Smaller line height for smaller font
  }

  // 2. Wire Type / Drop Type (Now ABOVE the UID)
  bottomY -= 4; // Gap between UID and Type
  ctx.font = '16px Arial';
  const wireType = wireDrop.wire_type || 'N/A';
  const dropType = wireDrop.drop_type || 'N/A';
  const typeText = `${wireType} / ${dropType}`;
  const typeLines = wrapText(ctx, typeText, textWidth);

  for (let i = typeLines.length - 1; i >= 0; i--) {
    ctx.fillText(typeLines[i], textStartX, bottomY);
    bottomY -= 18;
  }

  // No border drawn as per request

  return await canvasToImage(canvas);
};

/**
 * Load image from data URL
 */
const loadImage = (dataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
};

/**
 * Convert canvas to HTMLImageElement
 */
const canvasToImage = (canvas) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to blob'));
        return;
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        // Don't revoke the URL immediately - the printer SDK needs it
        // The browser will clean it up when the page unloads
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  });
};

/**
 * Wrap text to fit within specified width
 */
const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

/**
 * Truncate text to fit within specified width
 */
const truncateText = (ctx, text, maxWidth) => {
  let truncated = text;
  while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }

  if (truncated.length < text.length) {
    truncated = truncated.slice(0, -3) + '...';
  }

  return truncated;
};

/**
 * Generate preview image for display (larger for visibility)
 */
export const generateLabelPreview = async (wireDrop) => {
  // Generate at higher resolution for preview
  const bitmap = await generateWireDropLabelBitmap(wireDrop);
  return bitmap;
};

export default {
  generateWireDropLabelBitmap,
  generateLabelPreview,
  generateCalibrationLabelBitmap
};
