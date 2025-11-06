import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import bradyPrintService from '../services/bradyPrintService';

const PrinterContext = createContext(null);

export const PrinterProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(true);
  const [sdkInitialized, setSdkInitialized] = useState(false);

  // Detect if user is on iOS Safari
  const isIOSSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) &&
                      /Safari/.test(navigator.userAgent) &&
                      !/Chrome|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

  // Initialize Brady SDK on mount
  useEffect(() => {
    const initSDK = async () => {
      // Skip SDK initialization on iOS Safari since Web Bluetooth is not supported
      if (isIOSSafari) {
        setSupported(false);
        setError('Web Bluetooth is not supported on iPhone/iPad Safari. Please use Chrome or Edge on a desktop computer.');
        setSdkInitialized(true);
        return;
      }

      try {
        console.log('[PrinterContext] Starting SDK initialization...');

        // Check browser support first
        const isSupported = bradyPrintService.isSupportedBrowser();
        console.log('[PrinterContext] Browser supported:', isSupported);
        setSupported(isSupported);

        if (!isSupported) {
          setError('Web Bluetooth not supported. Please use Chrome or Edge browser on a desktop computer.');
          setSdkInitialized(true);
          return;
        }

        // Initialize SDK
        console.log('[PrinterContext] Initializing Brady SDK...');
        await bradyPrintService.initializeBradySdk((status) => {
          console.log('Printer status update:', status);
        });
        console.log('[PrinterContext] Brady SDK initialized successfully');

        // Check if already connected (from previous session)
        const isConnected = bradyPrintService.isPrinterConnected();
        console.log('[PrinterContext] Already connected:', isConnected);
        setConnected(isConnected);

        setSdkInitialized(true);
        console.log('[PrinterContext] Initialization complete, ready to connect');
      } catch (err) {
        console.error('[PrinterContext] Failed to initialize Brady SDK:', err);
        setError(err.message);
        setSdkInitialized(true);
      }
    };

    initSDK();
  }, [isIOSSafari]);

  const connectPrinter = useCallback(async () => {
    if (!sdkInitialized) {
      setError('SDK is still initializing. Please wait a moment and try again.');
      return false;
    }

    if (!supported) {
      setError('Web Bluetooth is not supported on this device/browser.');
      return false;
    }

    setConnecting(true);
    setError(null);

    try {
      const deviceId = await bradyPrintService.connectPrinter();
      if (deviceId) {
        setConnected(true);
        return true;
      } else {
        setError('Connection cancelled or failed');
        return false;
      }
    } catch (err) {
      console.error('Error connecting to printer:', err);
      setError(err.message);
      return false;
    } finally {
      setConnecting(false);
    }
  }, [supported, sdkInitialized]);

  const disconnectPrinter = useCallback(async () => {
    try {
      await bradyPrintService.disconnectPrinter();
      setConnected(false);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error disconnecting printer:', err);
      setError(err.message);
      return false;
    }
  }, []);

  const isPrinterConnected = useCallback(() => {
    return connected && bradyPrintService.isPrinterConnected();
  }, [connected]);

  const printLabel = useCallback(async (bitmap, copies = 1, cutAfterPrint = true) => {
    if (!connected) {
      throw new Error('Printer not connected. Please connect to a printer in Settings first.');
    }

    try {
      await bradyPrintService.printLabel(bitmap, copies, cutAfterPrint);
      return true;
    } catch (err) {
      console.error('Print error:', err);
      throw err;
    }
  }, [connected]);

  const value = {
    connected,
    connecting,
    error,
    supported,
    sdkInitialized,
    isIOSSafari,
    connectPrinter,
    disconnectPrinter,
    isPrinterConnected,
    printLabel,
  };

  return (
    <PrinterContext.Provider value={value}>
      {children}
    </PrinterContext.Provider>
  );
};

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};

export default PrinterContext;
