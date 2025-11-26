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
  const LABEL_WIDTH_INCHES = 2.625;
  const LABEL_HEIGHT_INCHES = 0.75;

  // Convert to pixels
  const WIDTH = Math.floor(LABEL_WIDTH_INCHES * DPI); // 304 pixels
  const HEIGHT = Math.floor(LABEL_HEIGHT_INCHES * DPI); // 152 pixels

  // Brady M211 printable area on 0.75" label: 0.63" width (leaves 0.06" margins on each side)
  const PRINTABLE_HEIGHT = Math.floor(0.63 * DPI); // 128 pixels
  const VERTICAL_MARGIN = Math.floor((HEIGHT - PRINTABLE_HEIGHT) / 2); // ~12 pixels top/bottom

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Horizontal margin for safety
  const HORIZONTAL_MARGIN = 8;

  // Flag-style layout: QR (45%) | GAP (10%) | TEXT (45%)
  const QR_SECTION_WIDTH = Math.floor(WIDTH * 0.45);
  const GAP_SECTION_WIDTH = Math.floor(WIDTH * 0.10);
  const TEXT_SECTION_WIDTH = WIDTH - QR_SECTION_WIDTH - GAP_SECTION_WIDTH;

  // Draw center line in the gap section (for wrapping around wire)
  const centerLineX = QR_SECTION_WIDTH + (GAP_SECTION_WIDTH / 2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]); // Dashed line
  ctx.beginPath();
  ctx.moveTo(centerLineX, VERTICAL_MARGIN);
  ctx.lineTo(centerLineX, HEIGHT - VERTICAL_MARGIN);
  ctx.stroke();
  ctx.setLineDash([]); // Reset to solid line

  // LEFT SECTION: QR Code (maximize size within printable area, centered vertically)
  const qrSize = Math.floor(PRINTABLE_HEIGHT * 0.85); // ~109 pixels (0.54")
  const qrX = (QR_SECTION_WIDTH - qrSize) / 2; // Center horizontally in left section
  const qrY = VERTICAL_MARGIN + Math.floor((PRINTABLE_HEIGHT - qrSize) / 2); // Center vertically

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
  const textStartX = QR_SECTION_WIDTH + GAP_SECTION_WIDTH + 8; // Start after gap
  const textWidth = TEXT_SECTION_WIDTH - 16; // Padding
  const textStartY = VERTICAL_MARGIN + 6;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';

  // Top: Room Name (PROMINENT, larger, bold, wrapped)
  ctx.font = 'bold 22px Arial';
  const roomName = wireDrop.room_name || wireDrop.drop_name || 'No Room';
  const roomLines = wrapText(ctx, roomName, textWidth);
  let currentY = textStartY + 22;
  roomLines.forEach((line, index) => {
    if (index < 2) { // Max 2 lines for room name
      ctx.fillText(line, textStartX, currentY);
      currentY += 24;
    }
  });

  // Bottom section: UID and Wire/Drop Type
  let bottomY = HEIGHT - VERTICAL_MARGIN - 6;

  // Wire Type / Drop Type (bottom)
  ctx.font = '16px Arial';
  const wireType = wireDrop.wire_type || 'N/A';
  const dropType = wireDrop.drop_type || 'N/A';
  const typeText = `${wireType} / ${dropType}`;
  const typeLines = wrapText(ctx, typeText, textWidth);
  // Draw from bottom up
  for (let i = typeLines.length - 1; i >= 0; i--) {
    ctx.fillText(typeLines[i], textStartX, bottomY);
    bottomY -= 18;
  }

  // UID (above wire type)
  ctx.font = 'bold 18px Arial';
  const uidLines = wrapText(ctx, wireDrop.uid || 'NO-UID', textWidth);
  bottomY -= 4; // Small gap
  for (let i = uidLines.length - 1; i >= 0; i--) {
    ctx.fillText(uidLines[i], textStartX, bottomY);
    bottomY -= 20;
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
