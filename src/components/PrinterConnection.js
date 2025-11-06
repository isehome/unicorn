import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import { Printer, WifiOff, CheckCircle, AlertCircle } from 'lucide-react';
import bradyPrintService from '../services/bradyPrintService';

const PrinterConnection = ({ onConnectionChange }) => {
  const { mode } = useTheme();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Check browser support
    const isSupported = bradyPrintService.isSupportedBrowser();
    setSupported(isSupported);

    if (!isSupported) {
      setError('Web Bluetooth not supported. Please use Chrome or Edge browser.');
    }

    // Initialize SDK
    initSDK();
  }, []);

  const initSDK = async () => {
    try {
      await bradyPrintService.initializeBradySdk((status) => {
        // Handle printer status updates
        console.log('Printer status:', status);
      });

      // Check if already connected
      const isConnected = bradyPrintService.isPrinterConnected();
      setConnected(isConnected);

      if (onConnectionChange) {
        onConnectionChange(isConnected);
      }
    } catch (err) {
      console.error('SDK initialization error:', err);
      setError(err.message);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const deviceId = await bradyPrintService.connectPrinter();
      if (deviceId) {
        setConnected(true);
        if (onConnectionChange) {
          onConnectionChange(true);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await bradyPrintService.disconnectPrinter();
      setConnected(false);
      if (onConnectionChange) {
        onConnectionChange(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const cardBackground = mode === 'dark' ? '#1F2937' : '#FFFFFF';
  const textColor = mode === 'dark' ? '#F9FAFB' : '#111827';
  const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: cardBackground,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Printer size={20} color={textColor} />
          <div>
            <div style={{ fontWeight: 'bold', color: textColor }}>
              Brady M211 Printer
            </div>
            <div
              style={{
                fontSize: '14px',
                color: connected ? '#10B981' : '#6B7280',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px',
              }}
            >
              {connected ? (
                <>
                  <CheckCircle size={14} />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff size={14} />
                  Not Connected
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          {connected ? (
            <Button onClick={handleDisconnect} variant="outline" size="sm">
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={!supported || connecting}
              size="sm"
            >
              {connecting ? 'Connecting...' : 'Connect Printer'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: mode === 'dark' ? '#7F1D1D' : '#FEE2E2',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: mode === 'dark' ? '#FCA5A5' : '#DC2626',
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </div>
  );
};

export default PrinterConnection;
