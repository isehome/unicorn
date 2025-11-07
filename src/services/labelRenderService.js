import QRCode from 'qrcode';

/**
 * Generate wire drop label as bitmap image
 * Label size: 1.5" x 0.75" at 203 DPI (M211 printer resolution)
 *
 * @param {Object} wireDrop - Wire drop data
 * @returns {Promise<HTMLImageElement>} Label bitmap
 */
export const generateWireDropLabelBitmap = async (wireDrop) => {
  // Brady M211 printer resolution: 203 DPI
  const DPI = 203;

  // Label dimensions in inches
  const LABEL_WIDTH_INCHES = 1.5;
  const LABEL_HEIGHT_INCHES = 0.75;

  // Convert to pixels
  const WIDTH = Math.floor(LABEL_WIDTH_INCHES * DPI); // 304 pixels
  const HEIGHT = Math.floor(LABEL_HEIGHT_INCHES * DPI); // 152 pixels

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Add margins to prevent cutoff
  const MARGIN_TOP = 8;
  const MARGIN_BOTTOM = 8;
  const MARGIN_LEFT = 8;
  const MARGIN_RIGHT = 8;

  // Draw vertical divider line
  const halfWidth = WIDTH / 2;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(halfWidth, MARGIN_TOP);
  ctx.lineTo(halfWidth, HEIGHT - MARGIN_BOTTOM);
  ctx.stroke();

  // LEFT SIDE: QR Code (0.6" x 0.6" centered in left half)
  const qrSize = Math.floor(0.6 * DPI); // 122 pixels
  const qrX = MARGIN_LEFT + (halfWidth - MARGIN_LEFT - MARGIN_RIGHT - qrSize) / 2;
  const qrY = MARGIN_TOP + (HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - qrSize) / 2;

  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(wireDrop.uid || 'NO-UID', {
      width: qrSize,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Load QR code image
    const qrImage = await loadImage(qrDataUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  } catch (error) {
    console.error('Error generating QR code:', error);
    // Draw error placeholder
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
  }

  // RIGHT SIDE: Text Information
  const textStartX = halfWidth + 6; // Small padding from divider
  const textWidth = halfWidth - 12; // Padding on both sides
  const textStartY = MARGIN_TOP + 8; // Start below top margin

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';

  // Line 1: Wire Drop UID (Bold, medium size)
  ctx.font = 'bold 18px Arial';
  ctx.fillText(truncateText(ctx, wireDrop.uid || 'NO-UID', textWidth), textStartX, textStartY + 16);

  // Line 2: Room Name (wrap if needed)
  ctx.font = '14px Arial';
  const roomName = wireDrop.room_name || wireDrop.drop_name || 'No Room';
  const wrappedLines = wrapText(ctx, roomName, textWidth);
  let currentY = textStartY + 38;
  wrappedLines.forEach((line, index) => {
    if (index < 2) { // Max 2 lines for room name
      ctx.fillText(line, textStartX, currentY);
      currentY += 16;
    }
  });

  // Line 3: Wire Type / Drop Type (smaller, at bottom)
  ctx.font = '11px Arial';
  const wireType = wireDrop.wire_type || 'N/A';
  const dropType = wireDrop.drop_type || 'N/A';
  const typeText = `${wireType} / ${dropType}`;
  ctx.fillText(truncateText(ctx, typeText, textWidth), textStartX, HEIGHT - MARGIN_BOTTOM - 8);

  // Draw border around entire label (thinner)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);

  // Convert canvas to image
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
