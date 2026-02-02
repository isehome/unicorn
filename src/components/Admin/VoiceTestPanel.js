/**
 * VoiceTestPanel.js
 * Master voice tuning component with real-time latency metrics
 * Can be used standalone or as a modal from Settings
 * The AI can control its own VAD settings through voice commands!
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Mic, Activity, Clock, Wifi, Volume2,
  AlertCircle, Settings, Play, Square, BarChart2, X
} from 'lucide-react';

// Audio settings matching AIBrainContext
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// VAD sensitivity labels - ONLY HIGH and LOW work with gemini-2.5-flash-native-audio!
// MEDIUM causes WebSocket 1007 errors
const VAD_START_OPTIONS = [
  { value: 1, label: 'High (Sensitive)', desc: 'Triggers easily on any speech' },
  { value: 2, label: 'Low (Requires clear speech)', desc: 'Needs clear, loud speech' },
];

const VAD_END_OPTIONS = [
  { value: 1, label: 'High (Fast response)', desc: 'Quick cutoff, responds fast' },
  { value: 2, label: 'Low (Patient)', desc: 'Waits longer before responding' },
];

// Map to Gemini enum strings: 1=HIGH, 2=LOW (no MEDIUM!)
const getStartSensitivity = (val) => val === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW';
const getEndSensitivity = (val) => val === 1 ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW';

const VoiceTestPanel = ({ onClose, isModal = false }) => {
  const { mode } = useTheme();

  // Connection state
  const [status, setStatus] = useState('idle'); // idle, connecting, connected, listening, speaking, error
  const [error, setError] = useState(null);

  // Metrics
  const [metrics, setMetrics] = useState({
    connectionTime: null,
    lastSpeechEndTime: null,
    lastResponseStartTime: null,
    responseLatency: null,
    audioChunksSent: 0,
    audioChunksReceived: 0,
    messagesReceived: 0,
    serverTurnCount: 0,
  });

  // Event log for debugging
  const [eventLog, setEventLog] = useState([]);

  // VAD settings - load from localStorage as numeric values (1=HIGH, 2=LOW)
  // CRITICAL: Only HIGH and LOW work with gemini-2.5-flash-native-audio!
  const [vadStart, setVadStart] = useState(() =>
    parseInt(localStorage.getItem('ai_vad_start') || '1', 10)  // Default HIGH (sensitive)
  );
  const [vadEnd, setVadEnd] = useState(() =>
    parseInt(localStorage.getItem('ai_vad_end') || '1', 10)    // Default HIGH (fast response)
  );
  const [silenceDuration, setSilenceDuration] = useState(() =>
    parseInt(localStorage.getItem('ai_silence_duration') || '500', 10)
  );
  const [prefixPadding, setPrefixPadding] = useState(() =>
    parseInt(localStorage.getItem('ai_prefix_padding') || '200', 10)
  );

  // Track if we need to reconnect after settings change
  const [pendingReconnect, setPendingReconnect] = useState(false);

  // Audio level
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(true); // Always show settings by default

  // Refs
  const ws = useRef(null);
  const audioContext = useRef(null);
  const mediaStream = useRef(null);
  const processorNode = useRef(null);
  const sourceNode = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const connectionStartTime = useRef(null);
  const speechEndTime = useRef(null);
  const startSessionRef = useRef(null); // Ref to hold startSession for reconnect

  // Add to event log
  const addEvent = useCallback((message, type = 'info') => {
    const timestamp = performance.now().toFixed(0);
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    setEventLog(prev => [...prev.slice(-100), { timestamp, time, message, type }]);
  }, []);

  // Tool definitions for AI to control settings (matching AIBrainContext format)
  // IMPORTANT: Only HIGH and LOW are supported - MEDIUM causes WebSocket errors!
  const tools = React.useMemo(() => [
    { name: 'set_vad_start_sensitivity', description: 'Set START sensitivity: HIGH (triggers easily on any speech) or LOW (requires clear speech). MEDIUM is NOT supported.', parameters: { type: 'object', properties: { level: { type: 'string', enum: ['HIGH', 'LOW'] } }, required: ['level'] } },
    { name: 'set_vad_end_sensitivity', description: 'Set END sensitivity: HIGH (fast response, quick cutoff) or LOW (waits longer, more patient). MEDIUM is NOT supported.', parameters: { type: 'object', properties: { level: { type: 'string', enum: ['HIGH', 'LOW'] } }, required: ['level'] } },
    { name: 'set_silence_duration', description: 'Set silence wait in ms (300-2000). Lower = faster response.', parameters: { type: 'object', properties: { milliseconds: { type: 'number' } }, required: ['milliseconds'] } },
    { name: 'get_current_settings', description: 'Get current VAD settings and latency metrics.', parameters: { type: 'object', properties: {} } },
    { name: 'apply_preset', description: 'Apply preset: snappy (fast), balanced (sensitive+patient), patient (clear speech), or interview (long pauses).', parameters: { type: 'object', properties: { preset: { type: 'string', enum: ['snappy', 'balanced', 'patient', 'interview'] } }, required: ['preset'] } },
    { name: 'reconnect_with_settings', description: 'Reconnect to apply new settings.', parameters: { type: 'object', properties: {} } },
  ], []);

  // Handle tool calls from the AI
  const handleToolCall = useCallback((toolName, args) => {
    let result = { success: true };

    switch (toolName) {
      case 'set_vad_start_sensitivity':
        // Map string to numeric: HIGH=1, LOW=2 (no MEDIUM - causes WebSocket errors!)
        const startMap = { HIGH: 1, LOW: 2 };
        if (startMap[args.level] !== undefined) {
          const numVal = startMap[args.level];
          setVadStart(numVal);
          localStorage.setItem('ai_vad_start', numVal.toString());
          setPendingReconnect(true);
          result.message = `Start sensitivity set to ${args.level}. Call reconnect_with_settings to apply.`;
        } else if (args.level === 'MEDIUM') {
          result.message = 'MEDIUM is not supported. Please use HIGH or LOW.';
          result.success = false;
        }
        break;

      case 'set_vad_end_sensitivity':
        // Map string to numeric: HIGH=1, LOW=2 (no MEDIUM - causes WebSocket errors!)
        const endMap = { HIGH: 1, LOW: 2 };
        if (endMap[args.level] !== undefined) {
          const numVal = endMap[args.level];
          setVadEnd(numVal);
          localStorage.setItem('ai_vad_end', numVal.toString());
          setPendingReconnect(true);
          result.message = `End sensitivity set to ${args.level}. Call reconnect_with_settings to apply.`;
        } else if (args.level === 'MEDIUM') {
          result.message = 'MEDIUM is not supported. Please use HIGH or LOW.';
          result.success = false;
        }
        break;

      case 'set_silence_duration':
        const ms = Math.max(300, Math.min(2000, args.milliseconds));
        setSilenceDuration(ms);
        localStorage.setItem('ai_silence_duration', ms.toString());
        setPendingReconnect(true);
        result.message = `Silence duration set to ${ms}ms. Call reconnect_with_settings to apply.`;
        break;

      case 'get_current_settings':
        result = {
          vadStartSensitivity: vadStart === 1 ? 'HIGH' : 'LOW',
          vadEndSensitivity: vadEnd === 1 ? 'HIGH' : 'LOW',
          silenceDurationMs: silenceDuration,
          prefixPaddingMs: prefixPadding,
          lastResponseLatencyMs: metrics.responseLatency,
          totalTurns: metrics.serverTurnCount,
          pendingReconnect: pendingReconnect
        };
        break;

      case 'apply_preset':
        // Presets use numeric values: 1=HIGH, 2=LOW (no MEDIUM!)
        const presets = {
          snappy: { start: 1, end: 1, silence: 400, prefix: 200 },      // HIGH both = fast triggers, fast response
          balanced: { start: 1, end: 2, silence: 700, prefix: 300 },    // HIGH start, LOW end = sensitive + patient
          patient: { start: 2, end: 2, silence: 1200, prefix: 400 },    // LOW both = waits for clear speech, waits longer
          interview: { start: 2, end: 2, silence: 1500, prefix: 500 }   // LOW both + long silence = for long pauses
        };
        const preset = presets[args.preset];
        if (preset) {
          setVadStart(preset.start);
          setVadEnd(preset.end);
          setSilenceDuration(preset.silence);
          setPrefixPadding(preset.prefix);
          localStorage.setItem('ai_vad_start', preset.start.toString());
          localStorage.setItem('ai_vad_end', preset.end.toString());
          localStorage.setItem('ai_silence_duration', preset.silence.toString());
          localStorage.setItem('ai_prefix_padding', preset.prefix.toString());
          setPendingReconnect(true);
          result.message = `Applied "${args.preset}" preset. Call reconnect_with_settings to apply.`;
        }
        break;

      case 'reconnect_with_settings':
        result.message = 'Reconnecting with new settings...';
        // Use refs to avoid dependency issues - close current and restart
        setTimeout(() => {
          // End current session manually (can't use endSession due to dep order)
          ws.current?.close();
          ws.current = null;
          audioQueue.current = [];
          isPlaying.current = false;
          setStatus('idle');
          // Start new session after brief delay
          setTimeout(() => {
            if (startSessionRef.current) {
              startSessionRef.current();
            }
          }, 500);
        }, 100);
        setPendingReconnect(false);
        break;

      default:
        result = { error: `Unknown tool: ${toolName}` };
    }

    return result;
  }, [vadStart, vadEnd, silenceDuration, prefixPadding, metrics, pendingReconnect]);

  // Play audio chunk
  const playNextChunk = useCallback(() => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      setStatus(prev => prev === 'speaking' ? 'connected' : prev);
      return;
    }

    isPlaying.current = true;
    const chunk = audioQueue.current.shift();

    if (!audioContext.current || audioContext.current.state === 'closed') return;

    const buffer = audioContext.current.createBuffer(1, chunk.length, GEMINI_OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(chunk);

    const source = audioContext.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.current.destination);
    source.onended = playNextChunk;
    source.start();
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(async (event) => {
    try {
      // Handle binary data (Blob) - convert to text first (Gemini sends JSON as Blob)
      let messageData = event.data;
      if (event.data instanceof Blob) {
        messageData = await event.data.text();
      }

      const data = JSON.parse(messageData);

      setMetrics(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }));

      // Handle tool calls from the AI - Gemini Live sends { toolCall: { functionCalls: [...] } }
      if (data.toolCall) {
        const functionCalls = data.toolCall.functionCalls || [];
        const responses = [];

        for (const fc of functionCalls) {
          const funcName = fc.name;
          const funcArgs = fc.args || {};
          const funcId = fc.id;

          addEvent(`🔧 Tool: ${funcName}(${JSON.stringify(funcArgs)})`, 'warn');
          const result = handleToolCall(funcName, funcArgs);
          responses.push({ response: result, id: funcId });
        }

        // Send tool responses back
        if (ws.current?.readyState === WebSocket.OPEN && responses.length > 0) {
          ws.current.send(JSON.stringify({
            toolResponse: {
              functionResponses: responses
            }
          }));
        }
        return;
      }

      // Track server events
      if (data.serverContent) {
        const sc = data.serverContent;

        // Model turn started
        if (sc.turnComplete === false) {
          const now = performance.now();
          const latency = speechEndTime.current ? (now - speechEndTime.current).toFixed(0) : null;

          if (latency) {
            setMetrics(prev => ({
              ...prev,
              lastResponseStartTime: now,
              responseLatency: latency,
              serverTurnCount: prev.serverTurnCount + 1
            }));
            addEvent(`🎯 AI response started - Latency: ${latency}ms`, 'success');
          }
          setStatus('speaking');
        }

        // Model turn complete
        if (sc.turnComplete === true) {
          addEvent('✅ AI turn complete', 'info');
          setStatus('connected');
        }

        // Interrupted
        if (sc.interrupted) {
          addEvent('⚡ Turn interrupted by user', 'warn');
        }

        // Audio data
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.mimeType?.includes('audio')) {
              const audioData = atob(part.inlineData.data);
              const pcm16 = new Int16Array(audioData.length / 2);
              for (let i = 0; i < pcm16.length; i++) {
                pcm16[i] = (audioData.charCodeAt(i * 2) | (audioData.charCodeAt(i * 2 + 1) << 8));
              }
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
              }
              audioQueue.current.push(float32);
              setMetrics(prev => ({ ...prev, audioChunksReceived: prev.audioChunksReceived + 1 }));

              if (!isPlaying.current) {
                playNextChunk();
              }
            }

            // Handle function calls in model turn
            if (part.functionCall) {
              const result = handleToolCall(part.functionCall.name, part.functionCall.args || {});

              // Send tool response
              if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: result,
                      id: part.functionCall.id || 'func_' + Date.now()
                    }]
                  }
                }));
              }
            }
          }
        }
      }

      // Setup complete
      if (data.setupComplete) {
        const connectionTime = (performance.now() - connectionStartTime.current).toFixed(0);
        setMetrics(prev => ({ ...prev, connectionTime }));
        addEvent(`🔗 Setup complete in ${connectionTime}ms`, 'success');
      }

      // Input transcription (what user said)
      if (data.serverContent?.inputTranscription?.text) {
        addEvent(`🎤 User: "${data.serverContent.inputTranscription.text}"`, 'user');
      }

      // Output transcription (what AI said)
      if (data.serverContent?.outputTranscription?.text) {
        addEvent(`🤖 AI: "${data.serverContent.outputTranscription.text}"`, 'ai');
      }

    } catch (err) {
      // Log the raw data that failed to parse for debugging
      let preview = 'unknown';
      if (typeof event.data === 'string') {
        preview = event.data.substring(0, 150);
      } else if (event.data instanceof Blob) {
        preview = `Blob(${event.data.size} bytes)`;
      }
      console.error('[VoiceTest] Parse error:', err.message, 'Data:', preview);
      // Only log parse errors if they're not empty data
      if (preview !== '{}' && preview !== '') {
        addEvent(`Parse error: ${err.message}`, 'error');
      }
    }
  }, [addEvent, playNextChunk, handleToolCall]);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: GEMINI_INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      audioContext.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: GEMINI_INPUT_SAMPLE_RATE
      });

      sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);
      processorNode.current = audioContext.current.createScriptProcessor(4096, 1, 1);

      processorNode.current.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // Calculate audio level for meter
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += Math.abs(input[i]);
        }
        const avg = sum / input.length;
        setAudioLevel(Math.min(1, avg * 10));

        // Send to Gemini
        if (ws.current?.readyState === WebSocket.OPEN) {
          const pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          }

          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          ws.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64 }]
            }
          }));

          setMetrics(prev => ({ ...prev, audioChunksSent: prev.audioChunksSent + 1 }));
        }
      };

      sourceNode.current.connect(processorNode.current);
      processorNode.current.connect(audioContext.current.destination);

      addEvent('🎙️ Audio capture started', 'info');
      setStatus('listening');

    } catch (err) {
      addEvent(`Mic error: ${err.message}`, 'error');
      setError('Could not access microphone');
    }
  }, [addEvent]);

  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    processorNode.current?.disconnect();
    sourceNode.current?.disconnect();
    mediaStream.current?.getTracks().forEach(t => t.stop());
    audioContext.current?.close();

    processorNode.current = null;
    sourceNode.current = null;
    mediaStream.current = null;
    audioContext.current = null;
  }, []);

  // Start session
  const startSession = useCallback(async () => {
    console.log('[VoiceTest] startSession called');
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    console.log('[VoiceTest] API key present:', !!apiKey);
    if (!apiKey) {
      setError('No Gemini API key configured');
      addEvent('ERROR: No Gemini API key found in environment', 'error');
      return;
    }

    setStatus('connecting');
    setError(null);
    setEventLog([]);
    setMetrics({
      connectionTime: null,
      lastSpeechEndTime: null,
      lastResponseStartTime: null,
      responseLatency: null,
      audioChunksSent: 0,
      audioChunksReceived: 0,
      messagesReceived: 0,
      serverTurnCount: 0,
    });

    connectionStartTime.current = performance.now();
    addEvent('🚀 Starting connection...', 'info');

    // Use same model as AIBrainContext
    const model = 'gemini-2.5-flash-native-audio-preview-12-2025';
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    try {
      console.log('[VoiceTest] Creating WebSocket connection...');
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('[VoiceTest] WebSocket opened!');
        addEvent('WebSocket connected, sending setup...', 'info');

        const systemPrompt = `You are a voice assistant testing tool. Your job is to help the user tune their voice settings for optimal responsiveness.

## Your Capabilities
You have tools to:
- set_vad_start_sensitivity: Control how easily speech detection triggers (HIGH or LOW only - MEDIUM is NOT supported)
- set_vad_end_sensitivity: Control how fast you respond after silence (HIGH or LOW only - MEDIUM is NOT supported)
- set_silence_duration: Set milliseconds to wait before responding (300-2000)
- get_current_settings: Check current configuration and latency metrics
- apply_preset: Apply presets (snappy, balanced, patient, interview)
- reconnect_with_settings: Reconnect to apply changes

## Current Settings
- Start Sensitivity: ${vadStart === 1 ? 'HIGH' : 'LOW'}
- End Sensitivity: ${vadEnd === 1 ? 'HIGH' : 'LOW'}
- Silence Duration: ${silenceDuration}ms
- Prefix Padding: ${prefixPadding}ms

## How to Help
1. When the user starts, introduce yourself and explain you can tune voice settings
2. Ask the user to speak and measure their experience
3. If response feels slow, try lowering silence duration or increasing end sensitivity
4. If you're cutting them off, try increasing silence duration or lowering end sensitivity
5. After changing settings, call reconnect_with_settings to apply them

## Important Notes
- Changes require a reconnect to take effect
- Keep responses SHORT during testing so you can measure latency accurately
- Tell the user the measured latency after each exchange
- Be conversational but efficient

Start by greeting the user and offering to tune the voice settings.`;

        const setupConfig = {
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
              }
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            tools: [{
              functionDeclarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters
              }))
            }],
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                // Use slider values - mapped to HIGH/LOW only (no MEDIUM!)
                startOfSpeechSensitivity: getStartSensitivity(vadStart),
                endOfSpeechSensitivity: getEndSensitivity(vadEnd),
                // Use slider values for timing
                prefixPaddingMs: prefixPadding,
                silenceDurationMs: silenceDuration
              }
            }
          }
        };

        // Debug: Log the FULL config being sent (copy this for comparison with AIBrainContext)
        console.log('[VoiceTest] ========== FULL SETUP CONFIG ==========');
        console.log('[VoiceTest] JSON:', JSON.stringify(setupConfig, null, 2));
        console.log('[VoiceTest] ===========================================');

        ws.current.send(JSON.stringify(setupConfig));
        setStatus('connected');
        startAudioCapture();
      };

      ws.current.onmessage = handleMessage;

      ws.current.onerror = (err) => {
        console.error('[VoiceTest] WebSocket error:', err);
        addEvent('WebSocket error', 'error');
        setError('Connection error');
        setStatus('error');
      };

      ws.current.onclose = (e) => {
        console.log('[VoiceTest] WebSocket closed:', e.code, e.reason);
        addEvent(`WebSocket closed: ${e.code}`, 'info');
        if (!isPlaying.current && audioQueue.current.length === 0) {
          setStatus('idle');
        }
        stopAudioCapture();
      };

    } catch (err) {
      addEvent(`Error: ${err.message}`, 'error');
      setError(err.message);
      setStatus('error');
    }
  }, [vadStart, vadEnd, silenceDuration, prefixPadding, tools, addEvent, startAudioCapture, handleMessage, stopAudioCapture]);

  // Store startSession in ref for reconnect tool to use
  startSessionRef.current = startSession;

  // End session
  const endSession = useCallback(() => {
    stopAudioCapture();
    ws.current?.close();
    ws.current = null;
    audioQueue.current = [];
    isPlaying.current = false;
    setStatus('idle');
    addEvent('Session ended', 'info');
  }, [stopAudioCapture, addEvent]);

  // Track when user stops speaking (for latency measurement)
  useEffect(() => {
    if (audioLevel < 0.02 && status === 'listening') {
      speechEndTime.current = performance.now();
    }
  }, [audioLevel, status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
      ws.current?.close();
    };
  }, [stopAudioCapture]);

  // Styles
  const cardBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-gray-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-gray-500';
  const borderColor = mode === 'dark' ? 'border-zinc-700' : 'border-gray-200';

  // Handle close - stop session first
  const handleClose = useCallback(() => {
    if (status !== 'idle') {
      endSession();
    }
    onClose?.();
  }, [status, endSession, onClose]);

  return (
    <div className={`${cardBg} rounded-lg shadow-lg border ${borderColor} p-4 ${isModal ? 'w-full' : 'max-w-2xl mx-auto'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-500" />
          <h2 className={`text-lg font-semibold ${textPrimary}`}>Voice Tuning Assistant</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded hover:bg-zinc-700/50 ${textSecondary}`}
            title={showSettings ? 'Hide settings' : 'Show settings'}
          >
            <Settings className="w-5 h-5" />
          </button>
          {isModal && onClose && (
            <button
              onClick={handleClose}
              className={`p-2 rounded hover:bg-zinc-700/50 ${textSecondary}`}
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel (Manual Override) */}
      {showSettings && (
        <div className={`mb-4 p-4 rounded border ${borderColor} ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'}`}>
          <h3 className={`text-sm font-medium ${textPrimary} mb-3`}>Manual Settings (AI can also change these)</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs ${textSecondary} block mb-1`}>Start Sensitivity</label>
              <select
                value={vadStart}
                onChange={(e) => {
                  const numVal = parseInt(e.target.value, 10);
                  setVadStart(numVal);
                  localStorage.setItem('ai_vad_start', numVal.toString());
                  console.log('[VoiceTest] Saved vad_start:', numVal);
                  setPendingReconnect(true);
                }}
                className={`w-full px-2 py-1 rounded text-sm ${mode === 'dark' ? 'bg-zinc-800' : 'bg-white'} border ${borderColor} ${textPrimary}`}
              >
                {VAD_START_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-xs ${textSecondary} block mb-1`}>End Sensitivity</label>
              <select
                value={vadEnd}
                onChange={(e) => {
                  const numVal = parseInt(e.target.value, 10);
                  setVadEnd(numVal);
                  localStorage.setItem('ai_vad_end', numVal.toString());
                  console.log('[VoiceTest] Saved vad_end:', numVal);
                  setPendingReconnect(true);
                }}
                className={`w-full px-2 py-1 rounded text-sm ${mode === 'dark' ? 'bg-zinc-800' : 'bg-white'} border ${borderColor} ${textPrimary}`}
              >
                {VAD_END_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-xs ${textSecondary} block mb-1`}>Silence Duration (ms)</label>
              <input
                type="range"
                min="300"
                max="2000"
                step="100"
                value={silenceDuration}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSilenceDuration(val);
                  localStorage.setItem('ai_silence_duration', val.toString());
                  console.log('[VoiceTest] Saved silence duration:', val);
                  setPendingReconnect(true);
                }}
                className="w-full"
              />
              <span className={`text-xs ${textPrimary}`}>{silenceDuration}ms</span>
            </div>

            <div>
              <label className={`text-xs ${textSecondary} block mb-1`}>Prefix Padding (ms)</label>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={prefixPadding}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPrefixPadding(val);
                  localStorage.setItem('ai_prefix_padding', val.toString());
                  console.log('[VoiceTest] Saved prefix padding:', val);
                  setPendingReconnect(true);
                }}
                className="w-full"
              />
              <span className={`text-xs ${textPrimary}`}>{prefixPadding}ms</span>
            </div>
          </div>

          {pendingReconnect && status !== 'idle' && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠️ Settings changed - reconnect required to apply
            </p>
          )}

          {/* Quick Presets */}
          <div className="mt-4 pt-3 border-t border-zinc-700">
            <label className={`text-xs ${textSecondary} block mb-2`}>Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setVadStart(1); setVadEnd(1); setSilenceDuration(400); setPrefixPadding(200);
                  localStorage.setItem('ai_vad_start', '1');
                  localStorage.setItem('ai_vad_end', '1');
                  localStorage.setItem('ai_silence_duration', '400');
                  localStorage.setItem('ai_prefix_padding', '200');
                  setPendingReconnect(true);
                }}
                className={`px-3 py-1.5 text-xs rounded ${vadStart === 1 && vadEnd === 1 && silenceDuration === 400 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                title="HIGH start + HIGH end + 400ms silence = fastest response"
              >
                Snappy
              </button>
              <button
                onClick={() => {
                  setVadStart(1); setVadEnd(2); setSilenceDuration(700); setPrefixPadding(300);
                  localStorage.setItem('ai_vad_start', '1');
                  localStorage.setItem('ai_vad_end', '2');
                  localStorage.setItem('ai_silence_duration', '700');
                  localStorage.setItem('ai_prefix_padding', '300');
                  setPendingReconnect(true);
                }}
                className={`px-3 py-1.5 text-xs rounded ${vadStart === 1 && vadEnd === 2 && silenceDuration === 700 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                title="HIGH start + LOW end + 700ms silence = sensitive but patient"
              >
                Balanced
              </button>
              <button
                onClick={() => {
                  setVadStart(2); setVadEnd(2); setSilenceDuration(1200); setPrefixPadding(400);
                  localStorage.setItem('ai_vad_start', '2');
                  localStorage.setItem('ai_vad_end', '2');
                  localStorage.setItem('ai_silence_duration', '1200');
                  localStorage.setItem('ai_prefix_padding', '400');
                  setPendingReconnect(true);
                }}
                className={`px-3 py-1.5 text-xs rounded ${vadStart === 2 && vadEnd === 2 && silenceDuration === 1200 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                title="LOW start + LOW end + 1200ms silence = waits for clear speech"
              >
                Patient
              </button>
              <button
                onClick={() => {
                  setVadStart(2); setVadEnd(2); setSilenceDuration(1500); setPrefixPadding(500);
                  localStorage.setItem('ai_vad_start', '2');
                  localStorage.setItem('ai_vad_end', '2');
                  localStorage.setItem('ai_silence_duration', '1500');
                  localStorage.setItem('ai_prefix_padding', '500');
                  setPendingReconnect(true);
                }}
                className={`px-3 py-1.5 text-xs rounded ${vadStart === 2 && vadEnd === 2 && silenceDuration === 1500 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                title="LOW both + 1500ms silence = for interviews with long pauses"
              >
                Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status & Controls */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={status === 'idle' || status === 'error' ? startSession : endSession}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            status === 'idle' || status === 'error'
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {status === 'idle' || status === 'error' ? (
            <>
              <Play className="w-4 h-4" />
              Start
            </>
          ) : (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'idle' ? 'bg-gray-400' :
              status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
              status === 'connected' ? '' :
              status === 'listening' ? 'bg-blue-400 animate-pulse' :
              status === 'speaking' ? 'bg-purple-400 animate-pulse' :
              'bg-red-400'
            }`}
            style={status === 'connected' ? { backgroundColor: '#94AF32' } : undefined}
          />
          <span className={`text-sm ${textSecondary} capitalize`}>{status}</span>
        </div>

        {/* Audio Level */}
        {status !== 'idle' && (
          <div className="flex items-center gap-2 flex-1">
            <Mic className={`w-4 h-4 ${textSecondary}`} style={audioLevel > 0.05 ? { color: '#94AF32' } : undefined} />
            <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-75"
                style={{ width: `${audioLevel * 100}%`, backgroundColor: '#94AF32' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className={`p-3 rounded ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className={`text-xs ${textSecondary}`}>Response Latency</span>
          </div>
          <span
            className={`text-xl font-bold ${
              metrics.responseLatency
                ? parseInt(metrics.responseLatency) < 500 ? ''
                  : parseInt(metrics.responseLatency) < 1000 ? 'text-yellow-400'
                  : 'text-red-400'
                : textPrimary
            }`}
            style={metrics.responseLatency && parseInt(metrics.responseLatency) < 500 ? { color: '#94AF32' } : undefined}
          >
            {metrics.responseLatency ? `${metrics.responseLatency}ms` : '—'}
          </span>
        </div>

        <div className={`p-3 rounded ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          <div className="flex items-center gap-1 mb-1">
            <Wifi className="w-3 h-3 text-purple-400" />
            <span className={`text-xs ${textSecondary}`}>Connect Time</span>
          </div>
          <span className={`text-xl font-bold ${textPrimary}`}>
            {metrics.connectionTime ? `${metrics.connectionTime}ms` : '—'}
          </span>
        </div>

        <div className={`p-3 rounded ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          <div className="flex items-center gap-1 mb-1">
            <Volume2 className="w-3 h-3" style={{ color: '#94AF32' }} />
            <span className={`text-xs ${textSecondary}`}>Audio Sent</span>
          </div>
          <span className={`text-xl font-bold ${textPrimary}`}>
            {metrics.audioChunksSent}
          </span>
        </div>

        <div className={`p-3 rounded ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          <div className="flex items-center gap-1 mb-1">
            <BarChart2 className="w-3 h-3 text-orange-400" />
            <span className={`text-xs ${textSecondary}`}>Turns</span>
          </div>
          <span className={`text-xl font-bold ${textPrimary}`}>
            {metrics.serverTurnCount}
          </span>
        </div>
      </div>

      {/* Event Log */}
      <div className={`border ${borderColor} rounded`}>
        <div className={`px-3 py-2 border-b ${borderColor} flex items-center justify-between`}>
          <span className={`text-sm font-medium ${textPrimary}`}>Event Log</span>
          <button
            onClick={() => setEventLog([])}
            className={`text-xs ${textSecondary} hover:text-white`}
          >
            Clear
          </button>
        </div>
        <div className={`h-48 overflow-y-auto p-2 font-mono text-xs ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'}`}>
          {eventLog.length === 0 ? (
            <p className={textSecondary}>Start a session to see events...</p>
          ) : (
            eventLog.map((entry, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  entry.type === 'error' ? 'text-red-400' :
                  entry.type === 'warn' ? 'text-yellow-400' :
                  entry.type === 'success' ? '' :
                  entry.type === 'user' ? 'text-blue-400' :
                  entry.type === 'ai' ? 'text-purple-400' :
                  textSecondary
                }`}
                style={entry.type === 'success' ? { color: '#94AF32' } : undefined}
              >
                <span className="text-zinc-600">[{entry.time}]</span> {entry.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className={`mt-4 p-3 rounded ${mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-100'}`}>
        <h4 className={`text-sm font-medium ${textPrimary} mb-2`}>How to Use</h4>
        <ul className={`text-xs ${textSecondary} space-y-1 list-disc list-inside`}>
          <li>Click "Start" - the AI assistant will greet you</li>
          <li>Tell the AI how the response feels (too slow, too fast, cuts you off, etc.)</li>
          <li>The AI will adjust its settings and reconnect to apply them</li>
          <li>Watch the latency metric - green (&lt;500ms) is excellent, yellow (&lt;1000ms) is good</li>
          <li>You can also manually adjust settings using the gear icon</li>
        </ul>
      </div>
    </div>
  );
};

export default VoiceTestPanel;
