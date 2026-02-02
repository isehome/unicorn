import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, Camera, Bug, Loader2, CheckCircle, AlertCircle, Mic, MicOff } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

// Shake detection threshold
const SHAKE_THRESHOLD = 15;
const SHAKE_TIMEOUT = 1000;
const SHAKE_COUNT_THRESHOLD = 3;

// Store recent console errors for debugging
const consoleErrors = [];
const MAX_CONSOLE_ERRORS = 10;

// Intercept console.error to capture errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const errorString = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack}`;
    }
    return String(arg);
  }).join(' ');

  consoleErrors.push({
    timestamp: new Date().toISOString(),
    message: errorString
  });

  // Keep only recent errors
  while (consoleErrors.length > MAX_CONSOLE_ERRORS) {
    consoleErrors.shift();
  }

  originalConsoleError.apply(console, args);
};

export default function BugReporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const { user, accessToken } = useAuth();
  const location = useLocation();
  const modalRef = useRef(null);
  const recognitionRef = useRef(null);

  // Check if speech recognition is supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  const openBugReporter = useCallback(async () => {
    // Capture screenshot immediately when opening
    setIsCapturing(true);
    try {
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 0.5, // Reduce size for email
        ignoreElements: (element) => {
          // Don't capture the bug reporter modal or button itself
          return element.id === 'bug-reporter-modal' || element.id === 'bug-reporter-button';
        }
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setScreenshot(dataUrl);
    } catch (e) {
      console.error('[BugReporter] Screenshot capture failed:', e);
    }
    setIsCapturing(false);
    setIsOpen(true);
    setSubmitStatus(null);
  }, []);

  // Shake detection for mobile
  useEffect(() => {
    let shakeCount = 0;
    let lastShakeTime = 0;
    let lastX = 0, lastY = 0, lastZ = 0;
    let initialized = false;

    const handleMotion = (event) => {
      const { accelerationIncludingGravity } = event;
      if (!accelerationIncludingGravity) return;

      const { x, y, z } = accelerationIncludingGravity;

      if (!initialized) {
        lastX = x;
        lastY = y;
        lastZ = z;
        initialized = true;
        return;
      }

      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);

      if (deltaX + deltaY + deltaZ > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShakeTime > 100) { // Debounce
          shakeCount++;
          lastShakeTime = now;

          if (shakeCount >= SHAKE_COUNT_THRESHOLD) {
            shakeCount = 0;
            openBugReporter();
          }

          // Reset shake count after timeout
          setTimeout(() => {
            if (Date.now() - lastShakeTime >= SHAKE_TIMEOUT) {
              shakeCount = 0;
            }
          }, SHAKE_TIMEOUT);
        }
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    };

    // Request permission on iOS 13+
    const requestMotionPermission = async () => {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
          }
        } catch (e) {
          console.warn('[BugReporter] Motion permission denied:', e);
        }
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    };

    requestMotionPermission();

    // Keyboard shortcut for desktop: Ctrl+Shift+B or Cmd+Shift+B
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        openBugReporter();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openBugReporter]);

  const retakeScreenshot = async () => {
    setIsCapturing(true);
    // Close modal briefly to capture clean screenshot
    const modalEl = modalRef.current;
    if (modalEl) modalEl.style.display = 'none';

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 0.5,
        ignoreElements: (element) => {
          return element.id === 'bug-reporter-modal' || element.id === 'bug-reporter-button';
        }
      });
      setScreenshot(canvas.toDataURL('image/jpeg', 0.7));
    } catch (e) {
      console.error('[BugReporter] Screenshot capture failed:', e);
    }

    if (modalEl) modalEl.style.display = '';
    setIsCapturing(false);
  };

  // Voice dictation
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('[BugReporter] Error stopping recognition:', e);
        }
      }
      setIsRecording(false);
      return;
    }

    // Start recording
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[BugReporter] Speech recognition not supported');
      return;
    }

    // Check for microphone permission first
    try {
      const permissionStatus = await navigator.permissions?.query({ name: 'microphone' });
      if (permissionStatus?.state === 'denied') {
        console.warn('[BugReporter] Microphone permission denied');
        alert('Microphone access is denied. Please enable it in your browser settings to use voice dictation.');
        return;
      }
    } catch (e) {
      // permissions API not supported, continue anyway
      console.log('[BugReporter] Permissions API not available, continuing...');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = description;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + transcript;
          setDescription(finalTranscript);
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('[BugReporter] Speech recognition error:', event.error);
      setIsRecording(false);
      recognitionRef.current = null;

      // Provide user feedback for common errors
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone access to use voice dictation.');
      } else if (event.error === 'no-speech') {
        // This is normal, user just didn't speak - no alert needed
      } else if (event.error === 'audio-capture') {
        alert('No microphone found. Please connect a microphone to use voice dictation.');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    // Wrap start() in try-catch to handle immediate failures
    try {
      recognition.start();
      setIsRecording(true);
    } catch (e) {
      console.error('[BugReporter] Failed to start speech recognition:', e);
      setIsRecording(false);
      recognitionRef.current = null;
      alert('Failed to start voice dictation. Please check your microphone permissions.');
    }
  }, [isRecording, description]);

  const handleSubmit = async () => {
    if (!description.trim()) return;

    // Stop any ongoing recording
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      // Pass user's access token to send email from their mailbox
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: description.trim(),
          screenshot,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          userEmail: user?.email,
          userName: user?.displayName || user?.name,
          consoleErrors: consoleErrors.map(e => `[${e.timestamp}] ${e.message}`)
        })
      });

      if (response.ok) {
        setSubmitStatus('success');
        setTimeout(() => {
          setIsOpen(false);
          setDescription('');
          setScreenshot(null);
          setSubmitStatus(null);
        }, 2000);
      } else {
        const data = await response.json();
        console.error('[BugReporter] Submit failed:', data);
        setSubmitStatus('error');
      }
    } catch (e) {
      console.error('[BugReporter] Submit error:', e);
      setSubmitStatus('error');
    }

    setIsSubmitting(false);
  };

  const handleClose = () => {
    // Stop any ongoing recording
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
    setIsOpen(false);
    setDescription('');
    setScreenshot(null);
    setSubmitStatus(null);
  };

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Hide on public pages and login
  const isPublicPage = location.pathname.includes('/login') ||
    location.pathname.includes('/public') ||
    location.pathname.includes('/shade-portal');

  if (isPublicPage) {
    return null;
  }

  return (
    <>
      {/* Floating Bug Button - Always visible */}
      <button
        id="bug-reporter-button"
        onClick={openBugReporter}
        className={`fixed bottom-24 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 ${
          isDark
            ? 'bg-zinc-800 text-violet-400 border border-zinc-700 hover:bg-zinc-700'
            : 'bg-white text-violet-600 border border-zinc-200 hover:bg-zinc-50'
        }`}
        title="Report a bug (Ctrl+Shift+B)"
      >
        <Bug size={22} />
      </button>

      {/* Bug Reporter Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            id="bug-reporter-modal"
            ref={modalRef}
            className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${
              isDark ? 'bg-gray-800' : 'bg-white'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <Bug className="text-violet-500" size={20} />
                <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Report a Bug
                </h2>
              </div>
              <button
                onClick={handleClose}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Screenshot preview */}
              {screenshot && (
                <div className="relative">
                  <img
                    src={screenshot}
                    alt="Screenshot"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                  <button
                    onClick={retakeScreenshot}
                    disabled={isCapturing}
                    className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 text-xs font-medium bg-black/70 text-white rounded-lg hover:bg-black/80 transition-colors"
                  >
                    {isCapturing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                    Retake
                  </button>
                </div>
              )}

              {/* Description with voice input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-sm font-medium ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    What went wrong?
                  </label>
                  {speechSupported && (
                    <button
                      onClick={toggleRecording}
                      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                        isRecording
                          ? 'bg-red-500 text-white animate-pulse'
                          : isDark
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <MicOff size={14} />
                          Stop
                        </>
                      ) : (
                        <>
                          <Mic size={14} />
                          Dictate
                        </>
                      )}
                    </button>
                  )}
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the bug or issue you encountered..."
                  rows={4}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none transition-colors ${
                    isDark
                      ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500 focus:border-violet-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-violet-500'
                  } focus:outline-none focus:ring-1 focus:ring-violet-500`}
                  autoFocus
                />
                {isRecording && (
                  <p className={`text-xs mt-1 ${isDark ? 'text-red-400' : 'text-red-500'}`}>
                    Listening... speak now
                  </p>
                )}
              </div>

              {/* User info */}
              <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Reporting as: {user?.displayName || user?.name || user?.email || 'Unknown user'}
              </div>

              {/* Status messages */}
              {submitStatus === 'success' && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' }}>
                  <CheckCircle size={18} />
                  <span className="text-sm font-medium">Bug report sent! Thank you.</span>
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                  <AlertCircle size={18} />
                  <span className="text-sm font-medium">Failed to send. Please try again.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-2 px-4 py-3 border-t ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={handleClose}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isDark
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!description.trim() || isSubmitting || submitStatus === 'success'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Send Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Export function to open bug reporter programmatically (e.g., from error boundary)
export function openBugReporter() {
  window.dispatchEvent(new CustomEvent('openBugReporter'));
}
