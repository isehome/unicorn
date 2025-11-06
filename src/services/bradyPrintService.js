// Brady SDK wrapper service for M211 printer integration

let bradySdk = null;
let isInitialized = false;
let printerStatusCallback = null;

/**
 * Initialize Brady SDK
 * @param {Function} callback - Called when printer status updates
 */
export const initializeBradySdk = async (callback) => {
  if (isInitialized) return bradySdk;

  try {
    // Import Brady SDK (uses import map)
    const BradySdk = (await import('brady-web-sdk')).default;

    printerStatusCallback = callback;

    // Initialize SDK with callback and analytics disabled
    bradySdk = new BradySdk(handlePrinterUpdate, false);

    isInitialized = true;
    return bradySdk;
  } catch (error) {
    console.error('Failed to initialize Brady SDK:', error);
    throw new Error('Brady SDK initialization failed. Please ensure you are using a supported browser (Chrome or Edge).');
  }
};

/**
 * Internal callback for printer status updates
 */
const handlePrinterUpdate = (status) => {
  console.log('Printer status update:', status);
  if (printerStatusCallback) {
    printerStatusCallback(status);
  }
};

/**
 * Check if browser supports Brady SDK (Web Bluetooth)
 */
export const isSupportedBrowser = () => {
  if (!bradySdk) {
    // Check if Web Bluetooth is available
    return 'bluetooth' in navigator;
  }
  return bradySdk.isSupportedBrowser();
};

/**
 * Connect to Brady printer via Bluetooth
 * @returns {Promise<string|null>} Device ID if successful, null otherwise
 */
export const connectPrinter = async () => {
  if (!bradySdk) {
    throw new Error('Brady SDK not initialized. Call initializeBradySdk first.');
  }

  try {
    const deviceId = await bradySdk.showDiscoveredBleDevices('Brady M211');
    if (deviceId) {
      console.log('Connected to printer:', deviceId);
      return deviceId;
    } else {
      console.log('Printer connection cancelled or failed');
      return null;
    }
  } catch (error) {
    console.error('Error connecting to printer:', error);
    throw new Error('Failed to connect to printer. Please ensure Bluetooth is enabled and the printer is powered on.');
  }
};

/**
 * Check if printer is currently connected
 */
export const isPrinterConnected = () => {
  if (!bradySdk) return false;
  return bradySdk.isConnected();
};

/**
 * Disconnect from printer
 */
export const disconnectPrinter = async () => {
  if (!bradySdk) return false;

  try {
    const success = await bradySdk.disconnect();
    console.log('Printer disconnected:', success);
    return success;
  } catch (error) {
    console.error('Error disconnecting printer:', error);
    return false;
  }
};

/**
 * Print a label bitmap
 * @param {HTMLImageElement} bitmap - Image element to print
 * @param {number} copies - Number of copies (default: 1)
 * @param {boolean} cutAfterPrint - Cut after printing (default: true)
 */
export const printLabel = async (bitmap, copies = 1, cutAfterPrint = true) => {
  if (!bradySdk) {
    throw new Error('Brady SDK not initialized');
  }

  if (!bradySdk.isConnected()) {
    throw new Error('Printer not connected. Please connect to a printer first.');
  }

  try {
    // Set number of copies
    bradySdk.setCopies(copies);

    // Set cut option (1 = cut after each label, 0 = cut at end of job, 2 = never cut)
    bradySdk.setCutOption(cutAfterPrint ? 1 : 0);

    // Print the bitmap (no offset needed for centered printing)
    const success = await bradySdk.printBitmap(bitmap);

    if (!success) {
      throw new Error('Print job failed');
    }

    return true;
  } catch (error) {
    console.error('Error printing label:', error);
    throw new Error(`Print failed: ${error.message}`);
  }
};

/**
 * Feed one blank label (for testing/alignment)
 */
export const feedLabel = async () => {
  if (!bradySdk) {
    throw new Error('Brady SDK not initialized');
  }

  if (!bradySdk.isConnected()) {
    throw new Error('Printer not connected');
  }

  try {
    return await bradySdk.feed();
  } catch (error) {
    console.error('Error feeding label:', error);
    return false;
  }
};

/**
 * Get printer status info
 */
export const getPrinterStatus = () => {
  if (!bradySdk) return null;

  // Brady SDK exposes status properties
  return {
    connected: bradySdk.isConnected(),
    // Add other status properties as available from SDK
  };
};

export default {
  initializeBradySdk,
  isSupportedBrowser,
  connectPrinter,
  isPrinterConnected,
  disconnectPrinter,
  printLabel,
  feedLabel,
  getPrinterStatus,
};
