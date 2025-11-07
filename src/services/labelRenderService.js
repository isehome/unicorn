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

  // Draw vertical divider line
  const halfWidth = WIDTH / 2;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(halfWidth, 0);
  ctx.lineTo(halfWidth, HEIGHT);
  ctx.stroke();

  // LEFT SIDE: QR Code (0.7" x 0.7" centered in left half)
  const qrSize = Math.floor(0.7 * DPI); // 142 pixels
  const qrX = (halfWidth - qrSize) / 2;
  const qrY = (HEIGHT - qrSize) / 2;

  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(wireDrop.uid || 'NO-UID', {
      width: qrSize,
      margin: 1,
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
  const textStartX = halfWidth + 8; // 8px padding from divider
  const textWidth = halfWidth - 16; // 8px padding on each side
  const textStartY = 15; // Start from top

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';

  // Line 1: Wire Drop UID (Bold, larger)
  ctx.font = 'bold 24px Arial';
  ctx.fillText(truncateText(ctx, wireDrop.uid || 'NO-UID', textWidth), textStartX, textStartY + 25);

  // Line 2: Room Name
  ctx.font = '18px Arial';
  const roomName = wireDrop.room_name || wireDrop.drop_name || 'No Room';
  ctx.fillText(truncateText(ctx, roomName, textWidth), textStartX, textStartY + 55);

  // Line 3: Wire Type / Drop Type
  ctx.font = '16px Arial';
  const wireType = wireDrop.wire_type || 'N/A';
  const dropType = wireDrop.drop_type || 'N/A';
  const typeText = `${wireType} / ${dropType}`;
  ctx.fillText(truncateText(ctx, typeText, textWidth), textStartX, textStartY + 80);

  // Draw border around entire label
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, WIDTH, HEIGHT);

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
