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
  const MARGIN = 6;

  // Flag-style layout: QR (40%) | GAP (20%) | TEXT (40%)
  const QR_SECTION_WIDTH = Math.floor(WIDTH * 0.4);
  const GAP_SECTION_WIDTH = Math.floor(WIDTH * 0.2);
  const TEXT_SECTION_WIDTH = WIDTH - QR_SECTION_WIDTH - GAP_SECTION_WIDTH;

  // Draw center line in the gap section (for wrapping around wire)
  const centerLineX = QR_SECTION_WIDTH + (GAP_SECTION_WIDTH / 2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]); // Dashed line
  ctx.beginPath();
  ctx.moveTo(centerLineX, MARGIN);
  ctx.lineTo(centerLineX, HEIGHT - MARGIN);
  ctx.stroke();
  ctx.setLineDash([]); // Reset to solid line

  // LEFT SECTION: QR Code (0.5" x 0.5", bottom-aligned)
  const qrSize = Math.floor(0.5 * DPI); // 102 pixels
  const qrX = (QR_SECTION_WIDTH - qrSize) / 2; // Center horizontally in left section
  const qrY = HEIGHT - MARGIN - qrSize; // Bottom-align

  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(wireDrop.uid || 'NO-UID', {
      width: qrSize,
      margin: 0,
      errorCorrectionLevel: 'H',
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

  // RIGHT SECTION: Text Information
  const textStartX = QR_SECTION_WIDTH + GAP_SECTION_WIDTH + 6; // Start after gap
  const textWidth = TEXT_SECTION_WIDTH - 12; // Padding
  const textStartY = MARGIN + 8;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';

  // Top: Room Name (larger, bold, wrapped)
  ctx.font = 'bold 16px Arial';
  const roomName = wireDrop.room_name || wireDrop.drop_name || 'No Room';
  const roomLines = wrapText(ctx, roomName, textWidth);
  let currentY = textStartY + 16;
  roomLines.forEach((line, index) => {
    if (index < 3) { // Max 3 lines for room name
      ctx.fillText(line, textStartX, currentY);
      currentY += 18;
    }
  });

  // Bottom section: UID and Wire/Drop Type
  let bottomY = HEIGHT - MARGIN - 8;

  // Wire Type / Drop Type (bottom)
  ctx.font = '14px Arial';
  const wireType = wireDrop.wire_type || 'N/A';
  const dropType = wireDrop.drop_type || 'N/A';
  const typeText = `${wireType} / ${dropType}`;
  const typeLines = wrapText(ctx, typeText, textWidth);
  // Draw from bottom up
  for (let i = typeLines.length - 1; i >= 0; i--) {
    ctx.fillText(typeLines[i], textStartX, bottomY);
    bottomY -= 16;
  }

  // UID (above wire type)
  ctx.font = 'bold 16px Arial';
  const uidLines = wrapText(ctx, wireDrop.uid || 'NO-UID', textWidth);
  bottomY -= 4; // Small gap
  for (let i = uidLines.length - 1; i >= 0; i--) {
    ctx.fillText(uidLines[i], textStartX, bottomY);
    bottomY -= 18;
  }

  // Draw border around entire label
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
