import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, AlertCircle, RefreshCw, QrCode, Keyboard } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import wireDropService from '../services/wireDropService';

const ScanTagPage = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const isMountedRef = useRef(true);
  const scannerContainerRef = useRef(null);

  const [statusMessage, setStatusMessage] = useState('Initializing scanner…');
  const [scannerError, setScannerError] = useState(null);
  const [lookupMessage, setLookupMessage] = useState(null);
  const [manualUid, setManualUid] = useState('');
  const [scanning, setScanning] = useState(false);
  const [useFallbackScanner, setUseFallbackScanner] = useState(false);

  const cleanupScanner = useCallback(async () => {
    detectorRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (html5QrCodeRef.current) {
      try {
        const isScanning = html5QrCodeRef.current.getState() === 2; // 2 = SCANNING
        if (isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (err) {
        console.warn('Error stopping html5-qrcode:', err);
      }
      html5QrCodeRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupScanner();
    };
  }, [cleanupScanner]);

  const lookupWireDrop = useCallback(async (rawValue) => {
    const trimmed = (rawValue || '').trim();
    if (!trimmed) {
      throw new Error('The scanned tag was empty. Try again.');
    }

    const drop = await wireDropService.getWireDropByUid(trimmed);
    if (!drop) {
      throw new Error(`No wire drop found for tag "${trimmed}".`);
    }

    return { drop, uid: trimmed };
  }, []);

  const handleLookupSuccess = useCallback((result) => {
    navigate(`/wire-drops/${result.drop.id}`, {
      replace: true,
      state: { scannedUid: result.uid }
    });
  }, [navigate]);

  const startFallbackScanner = useCallback(async () => {
    if (!scannerContainerRef.current) {
      throw new Error('Scanner container not available');
    }

    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCodeRef.current = html5QrCode;

    setStatusMessage('Initializing camera…');
    setScanning(false);

    const onScanSuccess = async (decodedText) => {
      console.log('QR code scanned:', decodedText);
      await cleanupScanner();
      setScanning(false);
      setStatusMessage('Tag detected. Looking up wire drop…');

      try {
        const result = await lookupWireDrop(decodedText);
        if (isMountedRef.current) {
          handleLookupSuccess(result);
        }
      } catch (lookupErr) {
        console.error('Wire drop lookup failed:', lookupErr);
        if (isMountedRef.current) {
          setLookupMessage(lookupErr.message || 'Could not open that wire drop.');
          setStatusMessage('No match found. Try scanning again.');
        }
      }
    };

    const onScanFailure = (error) => {
      // Ignore continuous scanning errors - they're expected when no QR code is visible
    };

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        onScanSuccess,
        onScanFailure
      );

      setStatusMessage('Point the camera at the wire drop tag.');
      setScanning(true);
    } catch (err) {
      console.error('html5-qrcode start failed:', err);
      throw err;
    }
  }, [cleanupScanner, handleLookupSuccess, lookupWireDrop]);

  const startScanner = useCallback(async () => {
    setScannerError(null);
    setLookupMessage(null);
    setStatusMessage('Initializing scanner…');
    setScanning(false);

    cleanupScanner();

    if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      setScannerError('Camera access is not supported in this browser.');
      setStatusMessage('Enter the tag UID manually to open a wire drop.');
      return;
    }

    if (!('BarcodeDetector' in window)) {
      // Use html5-qrcode as fallback for browsers without BarcodeDetector (like iOS Safari)
      console.log('BarcodeDetector not available, using html5-qrcode fallback');
      setUseFallbackScanner(true);
      try {
        await startFallbackScanner();
      } catch (err) {
        setScannerError('QR scanning could not be initialized.');
        setStatusMessage('Enter the tag UID manually to open a wire drop.');
      }
      return;
    }

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (error) {
      console.error('Failed to create BarcodeDetector:', error);
      setScannerError('The QR scanner could not be initialized.');
      setStatusMessage('Enter the tag UID manually to open a wire drop.');
      detectorRef.current = null;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error('Camera preview unavailable.');
      }

      video.srcObject = stream;
      await video.play();

      setStatusMessage('Point the camera at the wire drop tag.');
      setScanning(true);

      const detect = async () => {
        if (!detectorRef.current || !videoRef.current) return;

        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0) {
            cleanupScanner();
            setScanning(false);
            setStatusMessage('Tag detected. Looking up wire drop…');

            try {
              const result = await lookupWireDrop(codes[0].rawValue || codes[0].rawValue);
              if (isMountedRef.current) {
                handleLookupSuccess(result);
              }
            } catch (lookupErr) {
              console.error('Wire drop lookup failed:', lookupErr);
              if (isMountedRef.current) {
                setLookupMessage(lookupErr.message || 'Could not open that wire drop.');
                setStatusMessage('No match found. Adjust the tag and scan again.');
              }
            }
            return;
          }
        } catch (detectErr) {
          console.error('QR detection error:', detectErr);
        }

        if (isMountedRef.current && detectorRef.current) {
          rafRef.current = requestAnimationFrame(detect);
        }
      };

      rafRef.current = requestAnimationFrame(detect);
    } catch (cameraError) {
      console.error('Camera access failed:', cameraError);
      setScannerError(
        cameraError?.name === 'NotAllowedError'
          ? 'Camera access was denied. Enable permissions or use manual entry.'
          : 'Unable to access the camera.'
      );
      setStatusMessage('Enter the tag UID manually to open a wire drop.');
      cleanupScanner();
    }
  }, [cleanupScanner, handleLookupSuccess, lookupWireDrop]);

  useEffect(() => {
    startScanner();
  }, [startScanner]);

  const handleManualSubmit = useCallback(async (event) => {
    event.preventDefault();
    setLookupMessage(null);

    try {
      const result = await lookupWireDrop(manualUid);
      cleanupScanner();
      handleLookupSuccess(result);
    } catch (error) {
      setLookupMessage(error.message || 'Could not open that wire drop.');
    }
  }, [cleanupScanner, handleLookupSuccess, lookupWireDrop, manualUid]);

  return (
    <div className="min-h-screen pb-24 bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="rounded-2xl overflow-hidden" style={sectionStyles.card}>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300">
                <QrCode className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Scan Wire Drop Tag</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Point your device at the QR tag to jump directly to that wire drop.
                  If scanning is unavailable, enter the tag UID manually below.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-violet-200 dark:border-violet-700 overflow-hidden bg-white dark:bg-gray-800">
              <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black">
                {scannerError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <AlertCircle className="w-10 h-10 text-amber-500 mb-2" />
                    <p className="text-sm text-gray-100 dark:text-gray-200">{scannerError}</p>
                  </div>
                ) : useFallbackScanner ? (
                  <div ref={scannerContainerRef} id="qr-reader" className="w-full h-full"></div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    <div className="absolute inset-0 border-4 border-white/10 pointer-events-none" />
                    <div className="absolute inset-6 border border-white/40 rounded-3xl pointer-events-none" />
                    {!scanning && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                        <Camera className="w-10 h-10 text-gray-200 mb-2" />
                        <p className="text-sm text-gray-200">{statusMessage}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-violet-50/70 dark:bg-violet-900/20 text-sm text-violet-700 dark:text-violet-200">
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  {statusMessage}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={startScanner}
                >
                  Scan Again
                </Button>
              </div>
            </div>

            {lookupMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-600/60 dark:bg-amber-900/40 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{lookupMessage}</span>
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Manual UID Entry
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={manualUid}
                    onChange={(event) => setManualUid(event.target.value)}
                    placeholder="Scan fallback: enter UID (e.g., LR-Keypad-1)"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-2.5 pl-9 pr-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  icon={QrCode}
                >
                  Open Wire Drop
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanTagPage;

