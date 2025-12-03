import QRCode from 'qrcode';

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
  // We use 2.25" as the base canvas width based on testing
  const LABEL_WIDTH_INCHES = 2.25;
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
};
