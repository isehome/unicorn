import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, AlertCircle, CheckCircle, Loader2, MessageSquare } from 'lucide-react';

/**
 * ServiceAITest - Browser-based testing page for Retell AI voice agent
 * Accessible at /service/ai-test
 *
 * Uses Retell Web SDK to connect via WebRTC
 */
const ServiceAITest = () => {
  const [status, setStatus] = useState('idle'); // idle, connecting, connected, ended, error
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [callId, setCallId] = useState(null);
  const [testPhone, setTestPhone] = useState('+15125551234');

  const retellClientRef = useRef(null);
  const sdkLoadedRef = useRef(false);

  // Load Retell SDK from CDN
  useEffect(() => {
    if (sdkLoadedRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/retell-client-js-sdk@2.0.3/dist/index.umd.min.js';
    script.async = true;
    script.onload = () => {
      console.log('[ServiceAITest] Retell SDK loaded');
      sdkLoadedRef.current = true;
    };
    script.onerror = () => {
      setError('Failed to load Retell SDK');
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (retellClientRef.current) {
        try {
          retellClientRef.current.stopCall();
        } catch (e) {
          console.log('[ServiceAITest] Cleanup error:', e);
        }
      }
    };
  }, []);

  // Start a web call
  const startCall = async () => {
    setError(null);
    setStatus('connecting');
    setTranscript([]);

    try {
      // Get access token from our API
      const response = await fetch('/api/retell/web-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_phone: testPhone })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create web call');
      }

      const { access_token, call_id } = await response.json();
      setCallId(call_id);

      // Check if SDK is loaded
      if (!window.Retell) {
        throw new Error('Retell SDK not loaded');
      }

      // Initialize Retell client
      const retellClient = new window.Retell.RetellWebClient();
      retellClientRef.current = retellClient;

      // Set up event listeners
      retellClient.on('call_started', () => {
        console.log('[ServiceAITest] Call started');
        setStatus('connected');
        addTranscript('system', 'Call connected. You can speak now.');
      });

      retellClient.on('call_ended', () => {
        console.log('[ServiceAITest] Call ended');
        setStatus('ended');
        addTranscript('system', 'Call ended.');
      });

      retellClient.on('error', (err) => {
        console.error('[ServiceAITest] Error:', err);
        setError(err.message || 'Call error occurred');
        setStatus('error');
      });

      retellClient.on('update', (update) => {
        // Handle transcript updates
        if (update.transcript) {
          const lastEntry = update.transcript[update.transcript.length - 1];
          if (lastEntry) {
            addTranscript(lastEntry.role, lastEntry.content);
          }
        }
      });

      // Start the call
      await retellClient.startCall({
        accessToken: access_token,
        sampleRate: 24000,
        captureDeviceId: 'default'
      });

    } catch (err) {
      console.error('[ServiceAITest] Start call error:', err);
      setError(err.message);
      setStatus('error');
    }
  };

  // End the call
  const endCall = () => {
    if (retellClientRef.current) {
      try {
        retellClientRef.current.stopCall();
      } catch (e) {
        console.log('[ServiceAITest] End call error:', e);
      }
      retellClientRef.current = null;
    }
    setStatus('ended');
  };

  // Toggle mute
  const toggleMute = () => {
    if (retellClientRef.current) {
      if (isMuted) {
        retellClientRef.current.unmute();
      } else {
        retellClientRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  // Add transcript entry
  const addTranscript = useCallback((role, content) => {
    setTranscript(prev => {
      // Dedupe consecutive identical messages
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.content === content) {
        return prev;
      }
      return [...prev, { role, content, timestamp: new Date() }];
    });
  }, []);

  // Status indicator colors
  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'Ready to connect';
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected - Speaking with Sarah';
      case 'ended': return 'Call ended';
      case 'error': return 'Connection error';
      default: return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Phone className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Voice Agent Test</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Test the Intelligent Systems service phone agent via browser
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Status Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
              <span className="font-medium">{getStatusText()}</span>
            </div>
            {callId && (
              <span className="text-xs text-gray-400 font-mono">
                Call: {callId.slice(0, 12)}...
              </span>
            )}
          </div>

          {/* Test Phone Input */}
          <div className="mb-6">
            <label className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
              Test Phone Number (for caller ID simulation)
            </label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              disabled={status === 'connected' || status === 'connecting'}
              placeholder="+15125551234"
              className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 text-sm font-mono disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-1">
              Enter a phone number to test customer identification. Use a number from your contacts database.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center justify-center gap-4">
            {status === 'idle' || status === 'ended' || status === 'error' ? (
              <button
                onClick={startCall}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium shadow-lg transition-all hover:scale-105"
              >
                <Phone className="w-5 h-5" />
                Start Call
              </button>
            ) : status === 'connecting' ? (
              <button
                disabled
                className="flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-full font-medium shadow-lg cursor-wait"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-4 rounded-full transition-all ${
                    isMuted
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                      : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                  }`}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                  onClick={endCall}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium shadow-lg transition-all hover:scale-105"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Call
                </button>

                <div className="p-4 bg-gray-100 dark:bg-zinc-700 rounded-full">
                  <Volume2 className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Transcript */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <span className="font-medium text-sm">Conversation Transcript</span>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto space-y-3">
            {transcript.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">
                Start a call to see the conversation transcript here.
              </p>
            ) : (
              transcript.map((entry, idx) => (
                <div
                  key={idx}
                  className={`flex ${entry.role === 'agent' ? 'justify-start' : entry.role === 'user' ? 'justify-end' : 'justify-center'}`}
                >
                  {entry.role === 'system' ? (
                    <span className="text-xs text-gray-400 italic">{entry.content}</span>
                  ) : (
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                        entry.role === 'agent'
                          ? 'bg-gray-100 dark:bg-zinc-700 text-gray-900 dark:text-gray-100'
                          : 'bg-violet-600 text-white'
                      }`}
                    >
                      <p>{entry.content}</p>
                      <p className={`text-xs mt-1 ${entry.role === 'agent' ? 'text-gray-400' : 'text-violet-200'}`}>
                        {entry.role === 'agent' ? 'Sarah' : 'You'} - {entry.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">About this test page</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Uses your browser microphone to communicate with the AI agent</li>
                <li>The agent (Sarah) will try to identify you by the test phone number</li>
                <li>You can test creating tickets, checking schedules, etc.</li>
                <li>All test calls are logged in the retell_call_logs table</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceAITest;
