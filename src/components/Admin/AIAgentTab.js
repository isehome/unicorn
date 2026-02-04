/**
 * AIAgentTab.js
 * Unified AI Agent management page with voice control interface,
 * real-time metrics, model selection, and collapsible settings/training sections.
 *
 * Consolidates:
 * - Voice Control Interface (real-time monitoring & testing)
 * - AI Copilot Settings (persona, voice, VAD, custom instructions)
 * - AI Brain Training (page training management)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Play, Square, Eye, EyeOff, CheckCircle, AlertCircle,
  Loader2, Sparkles, ChevronDown, ChevronRight, Activity,
  Mic, Clock, Wifi, Volume2, BarChart2, Settings, RefreshCw,
  UserCog, MessageSquare, ScrollText, Sliders, Copy, Check,
  Zap, Brain, Radio, Server
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useVoiceCopilot } from '../../contexts/AIBrainContext';
import { useTrainingMode } from '../../contexts/TrainingModeContext';
import { pageContextService } from '../../services/pageContextService';
import { getAllRoutes, PAGE_REGISTRY } from '../../config/pageRegistry';

// Audio settings matching AIBrainContext
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Available models - Gemini 3 is now the default
const AVAILABLE_MODELS = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    description: 'Default - 40-60% faster latency, better reasoning',
    recommended: true,
    status: 'default'
  },
  {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    name: 'Gemini 2.5 Flash Native Audio',
    description: 'Fallback - excellent audio quality, proven stable',
    recommended: false,
    status: 'stable'
  }
  // Note: gemini-2.0-flash-live-001 removed - deprecated, retiring March 3, 2026
];

// VAD sensitivity options - ONLY HIGH and LOW work with Gemini
const VAD_START_OPTIONS = [
  { value: 1, label: 'High (Sensitive)', desc: 'Triggers easily on any speech' },
  { value: 2, label: 'Low (Requires clear speech)', desc: 'Needs clear, loud speech' },
];

const VAD_END_OPTIONS = [
  { value: 1, label: 'High (Fast response)', desc: 'Quick cutoff, responds fast' },
  { value: 2, label: 'Low (Patient)', desc: 'Waits longer before responding' },
];

// Presets for quick configuration
const PRESETS = {
  snappy: { start: 1, end: 1, silence: 400, prefix: 200, name: 'Snappy', desc: 'Fastest response' },
  balanced: { start: 1, end: 2, silence: 700, prefix: 300, name: 'Balanced', desc: 'Sensitive + patient' },
  patient: { start: 2, end: 2, silence: 1200, prefix: 400, name: 'Patient', desc: 'Clear speech, waits longer' },
  interview: { start: 2, end: 2, silence: 1500, prefix: 500, name: 'Interview', desc: 'Long pauses allowed' }
};

const voices = [
  { id: 'Puck', name: 'Puck (Energetic)', gender: 'Male' },
  { id: 'Charon', name: 'Charon (Deep/Calm)', gender: 'Male' },
  { id: 'Kore', name: 'Kore (Warm)', gender: 'Female' },
  { id: 'Fenrir', name: 'Fenrir (Deep)', gender: 'Male' },
  { id: 'Aoede', name: 'Aoede (Formal)', gender: 'Female' },
];

const AIAgentTab = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const { enterTrainingMode, isTrainingMode } = useTrainingMode();

  // Voice Copilot context
  const voiceCopilot = useVoiceCopilot();
  const {
    status: voiceStatus = 'idle',
    audioLevel = 0,
    lastTranscript = '',
    audioChunksSent = 0,
    audioChunksReceived = 0,
    debugLog = [],
    startSession,
    endSession,
    clearDebugLog
  } = voiceCopilot || {};

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState({
    voiceControl: true,
    copilotSettings: false,
    training: false,
    modelInfo: false
  });

  // Voice settings state - load from localStorage
  const [selectedModel, setSelectedModel] = useState(() =>
    localStorage.getItem('ai_model') || 'gemini-2.5-flash-native-audio-preview-12-2025'
  );
  const [persona, setPersona] = useState(() => localStorage.getItem('ai_persona') || 'brief');
  const [voice, setVoice] = useState(() => localStorage.getItem('ai_voice') || 'Puck');
  const [instructions, setInstructions] = useState(() => localStorage.getItem('ai_custom_instructions') || '');
  const [vadStart, setVadStart] = useState(() => parseInt(localStorage.getItem('ai_vad_start') || '1', 10));
  const [vadEnd, setVadEnd] = useState(() => parseInt(localStorage.getItem('ai_vad_end') || '1', 10));
  const [silenceDuration, setSilenceDuration] = useState(() => parseInt(localStorage.getItem('ai_silence_duration') || '500', 10));
  const [prefixPadding, setPrefixPadding] = useState(() => parseInt(localStorage.getItem('ai_prefix_padding') || '200', 10));

  // Test session state - use voiceStatus from AIBrainContext
  // Map voiceStatus to testStatus for backwards compatibility
  const testStatus = voiceStatus; // 'idle', 'connecting', 'connected', 'speaking', etc.
  const [testMetrics, setTestMetrics] = useState({
    connectionTime: null,
    responseLatency: null,
    audioChunksSent: 0,
    audioChunksReceived: 0,
    serverTurnCount: 0
  });
  const [testEvents, setTestEvents] = useState([]);
  const testAudioLevel = audioLevel; // Use real audio level from AIBrainContext
  const [pendingReconnect, setPendingReconnect] = useState(false);

  // Training status
  const [trainingStatus, setTrainingStatus] = useState({
    total: 0,
    trained: 0,
    published: 0,
    pages: []
  });
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [trainingError, setTrainingError] = useState(null);

  // Transcript state
  const [transcript, setTranscript] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ai_transcript') || '[]');
    } catch {
      return [];
    }
  });
  const [copied, setCopied] = useState(false);
  const transcriptEndRef = useRef(null);

  // Test session refs (legacy - most now handled by AIBrainContext)
  const connectionStartTime = useRef(null); // Still used for tracking

  // Styles
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-zinc-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500';
  const cardBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const borderColor = mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200';
  const inputBg = mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50';

  // Toggle section
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('ai_model', selectedModel);
    localStorage.setItem('ai_persona', persona);
    localStorage.setItem('ai_voice', voice);
    localStorage.setItem('ai_custom_instructions', instructions);
    localStorage.setItem('ai_vad_start', vadStart.toString());
    localStorage.setItem('ai_vad_end', vadEnd.toString());
    localStorage.setItem('ai_silence_duration', silenceDuration.toString());
    localStorage.setItem('ai_prefix_padding', prefixPadding.toString());
  }, [selectedModel, persona, voice, instructions, vadStart, vadEnd, silenceDuration, prefixPadding]);

  // Capture AI responses to transcript
  useEffect(() => {
    if (lastTranscript && lastTranscript.trim()) {
      const newEntry = {
        type: 'ai',
        text: lastTranscript,
        timestamp: new Date().toISOString()
      };
      setTranscript(prev => {
        const updated = [...prev, newEntry].slice(-50);
        localStorage.setItem('ai_transcript', JSON.stringify(updated));
        return updated;
      });
    }
  }, [lastTranscript]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Load training status
  const loadTrainingStatus = useCallback(async () => {
    setTrainingLoading(true);
    setTrainingError(null);
    try {
      await pageContextService.initializeFromRegistry(PAGE_REGISTRY);
      const status = await pageContextService.getTrainingStatus();
      const allRoutes = getAllRoutes();

      const merged = allRoutes.map(route => {
        const dbStatus = status.pages.find(p => p.page_route === route.route);
        return {
          ...route,
          is_trained: dbStatus?.is_trained || false,
          is_published: dbStatus?.is_published || false,
          training_version: dbStatus?.training_version || 0,
          last_trained_at: dbStatus?.last_trained_at,
          page_title: dbStatus?.page_title || route.pageTitle,
        };
      });

      setTrainingStatus({
        total: allRoutes.length,
        trained: merged.filter(p => p.is_trained).length,
        published: merged.filter(p => p.is_published).length,
        untrained: allRoutes.length - merged.filter(p => p.is_trained).length,
        pages: merged,
      });
    } catch (err) {
      console.error('Error loading training status:', err);
      setTrainingError(err.message);
    } finally {
      setTrainingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrainingStatus();
  }, [loadTrainingStatus]);

  // Add event to test log
  const addTestEvent = useCallback((message, type = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
    });
    setTestEvents(prev => [...prev.slice(-100), { time, message, type }]);
  }, []);

  // NOTE: Audio playback is now handled by AIBrainContext internally
  // The playNextChunk function is no longer needed

  // NOTE: All audio capture and WebSocket handling is now done by AIBrainContext
  // The old custom functions (handleMessage, startAudioCapture, stopAudioCapture) have been removed
  // because we now use the real startSession/endSession from AIBrainContext which has full tools

  // ══════════════════════════════════════════════════════════════
  // USE REAL AIBRAIN CONTEXT - Full tools, system prompt, database access
  // ══════════════════════════════════════════════════════════════

  // Start test session using REAL AIBrainContext (has all tools + dynamic context)
  const startTestSession = useCallback(async () => {
    if (!startSession) {
      addTestEvent('ERROR: AIBrainContext not available', 'error');
      return;
    }

    setTestEvents([]);
    setTestMetrics({
      connectionTime: null,
      responseLatency: null,
      audioChunksSent: 0,
      audioChunksReceived: 0,
      serverTurnCount: 0
    });

    connectionStartTime.current = performance.now();
    addTestEvent('🚀 Starting FULL AI Agent session (with tools + app awareness)...', 'info');
    addTestEvent('Tools: get_context, query_data, search_knowledge, navigate, quick_create, web_search', 'info');

    try {
      // Use the REAL AIBrainContext session - this has full tools and system prompt
      await startSession();
      addTestEvent('✅ Connected with full AI capabilities', 'success');
    } catch (err) {
      addTestEvent(`Error: ${err.message}`, 'error');
    }
  }, [startSession, addTestEvent]);

  // End test session using REAL AIBrainContext
  const endTestSession = useCallback(() => {
    if (endSession) {
      endSession();
    }
    addTestEvent('Session ended', 'info');
  }, [endSession, addTestEvent]);

  // Reconnect with new settings
  const reconnectSession = useCallback(() => {
    if (testStatus !== 'idle') {
      endTestSession();
    }
    setTimeout(() => startTestSession(), 500);
    setPendingReconnect(false);
  }, [testStatus, endTestSession, startTestSession]);

  // Apply preset
  const applyPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    setVadStart(preset.start);
    setVadEnd(preset.end);
    setSilenceDuration(preset.silence);
    setPrefixPadding(preset.prefix);
    setPendingReconnect(testStatus !== 'idle');
  };

  // Training handlers
  const handleTogglePublish = async (pageRoute, isPublished) => {
    try {
      if (isPublished) {
        await pageContextService.unpublishTraining(pageRoute);
      } else {
        await pageContextService.publishTraining(pageRoute);
      }
      await loadTrainingStatus();
    } catch (err) {
      console.error('Error toggling publish:', err);
    }
  };

  const handleTrainPage = (route) => {
    enterTrainingMode();
    const navigableRoute = route.replace(/:[\w]+/g, 'demo');
    navigate(navigableRoute);
  };

  // Transcript handlers
  const copyTranscript = async () => {
    const text = transcript.map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      return `[${time}] ${entry.type === 'ai' ? 'AI' : 'You'}: ${entry.text}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearTranscript = () => {
    setTranscript([]);
    localStorage.removeItem('ai_transcript');
  };

  // NOTE: Speech tracking and cleanup are now handled by AIBrainContext internally

  const trainedCount = trainingStatus.trained;
  const progressPercent = trainingStatus.total > 0 ? Math.round((trainedCount / trainingStatus.total) * 100) : 0;

  // Collapsible section header component
  const SectionHeader = ({ section, icon: Icon, title, subtitle, badge, color = 'purple' }) => (
    <button
      onClick={() => toggleSection(section)}
      className={`w-full flex items-center justify-between gap-3 p-4 text-left rounded-t-xl border ${borderColor} ${cardBg} hover:bg-zinc-700/20 transition-colors`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
          <Icon className={`w-5 h-5 text-${color}-400`} />
        </div>
        <div>
          <h3 className={`font-semibold ${textPrimary}`}>{title}</h3>
          {subtitle && <p className={`text-xs ${textSecondary}`}>{subtitle}</p>}
        </div>
        {badge && (
          <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' }}>
            {badge}
          </span>
        )}
      </div>
      {expandedSections[section] ? (
        <ChevronDown className={`w-5 h-5 ${textSecondary}`} />
      ) : (
        <ChevronRight className={`w-5 h-5 ${textSecondary}`} />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${textPrimary} flex items-center gap-2`}>
            <Brain className="w-6 h-6 text-purple-500" />
            AI Agent Control Center
          </h2>
          <p className={textSecondary}>
            Configure, test, and train the Unicorn AI assistant
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-700/50">
            <div className={`w-2 h-2 rounded-full ${
              voiceStatus === 'speaking' ? 'bg-purple-500 animate-pulse' :
              voiceStatus === 'listening' ? 'animate-pulse' :
              voiceStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
              voiceStatus === 'idle' ? 'bg-zinc-500' : 'bg-zinc-500'
            }`} style={voiceStatus === 'listening' ? { backgroundColor: '#94AF32' } : undefined} />
            <span className={`text-xs ${textSecondary} capitalize`}>
              {voiceStatus === 'idle' ? 'Copilot Ready' : voiceStatus}
            </span>
          </div>
        </div>
      </div>

      {/* ========================== */}
      {/* Voice Control Interface */}
      {/* ========================== */}
      <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
        <SectionHeader
          section="voiceControl"
          icon={Radio}
          title="Voice Control Interface"
          subtitle="Real-time voice testing and metrics"
        />

        {expandedSections.voiceControl && (
          <div className={`p-4 border-t ${borderColor} ${cardBg} space-y-4`}>
            {/* Model Selection */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className={`text-xs ${textSecondary} block mb-1`}>Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setPendingReconnect(testStatus !== 'idle');
                  }}
                  className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${borderColor} ${textPrimary}`}
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.recommended ? '⭐' : ''} {m.status === 'deprecated' ? '⚠️' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className={`text-xs ${textSecondary} block mb-1`}>Voice</label>
                <select
                  value={voice}
                  onChange={(e) => {
                    setVoice(e.target.value);
                    setPendingReconnect(testStatus !== 'idle');
                  }}
                  className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${borderColor} ${textPrimary}`}
                >
                  {voices.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Start/Stop/Reconnect buttons */}
              <div className="flex items-end gap-2">
                {testStatus === 'idle' || testStatus === 'error' ? (
                  <button
                    onClick={startTestSession}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Start Test
                  </button>
                ) : (
                  <>
                    <button
                      onClick={endTestSession}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                    {pendingReconnect && (
                      <button
                        onClick={reconnectSession}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Reconnect
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Status & Audio Level */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  testStatus === 'idle' ? 'bg-zinc-400' :
                  testStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                  testStatus === 'connected' ? '' :
                  testStatus === 'listening' ? 'bg-blue-400 animate-pulse' :
                  testStatus === 'speaking' ? 'bg-purple-400 animate-pulse' :
                  'bg-red-400'
                }`} style={testStatus === 'connected' ? { backgroundColor: '#94AF32' } : undefined} />
                <span className={`text-sm ${textSecondary} capitalize`}>{testStatus}</span>
              </div>

              {testStatus !== 'idle' && (
                <div className="flex items-center gap-2 flex-1">
                  <Mic className={`w-4 h-4 ${textSecondary}`} style={testAudioLevel > 0.05 ? { color: '#94AF32' } : undefined} />
                  <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-75"
                      style={{ width: `${testAudioLevel * 100}%`, backgroundColor: '#94AF32' }}
                    />
                  </div>
                </div>
              )}

              {pendingReconnect && testStatus !== 'idle' && (
                <span className="text-xs text-amber-400">⚠️ Settings changed - reconnect to apply</span>
              )}
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`p-3 rounded-lg ${inputBg}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span className={`text-xs ${textSecondary}`}>Response Latency</span>
                </div>
                <span className={`text-xl font-bold ${
                  testMetrics.responseLatency
                    ? parseInt(testMetrics.responseLatency) < 500 ? ''
                      : parseInt(testMetrics.responseLatency) < 1000 ? 'text-yellow-400'
                      : 'text-red-400'
                    : textPrimary
                }`} style={testMetrics.responseLatency && parseInt(testMetrics.responseLatency) < 500 ? { color: '#94AF32' } : undefined}>
                  {testMetrics.responseLatency ? `${testMetrics.responseLatency}ms` : '—'}
                </span>
              </div>

              <div className={`p-3 rounded-lg ${inputBg}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Wifi className="w-3 h-3 text-purple-400" />
                  <span className={`text-xs ${textSecondary}`}>Connect Time</span>
                </div>
                <span className={`text-xl font-bold ${textPrimary}`}>
                  {testMetrics.connectionTime ? `${testMetrics.connectionTime}ms` : '—'}
                </span>
              </div>

              <div className={`p-3 rounded-lg ${inputBg}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Volume2 className="w-3 h-3" style={{ color: '#94AF32' }} />
                  <span className={`text-xs ${textSecondary}`}>Audio Chunks</span>
                </div>
                <span className={`text-xl font-bold ${textPrimary}`}>
                  {audioChunksSent} / {audioChunksReceived}
                </span>
              </div>

              <div className={`p-3 rounded-lg ${inputBg}`}>
                <div className="flex items-center gap-1 mb-1">
                  <BarChart2 className="w-3 h-3 text-orange-400" />
                  <span className={`text-xs ${textSecondary}`}>Turns</span>
                </div>
                <span className={`text-xl font-bold ${textPrimary}`}>
                  {testMetrics.serverTurnCount}
                </span>
              </div>
            </div>

            {/* VAD Settings */}
            <div className={`p-4 rounded-lg ${inputBg} space-y-4`}>
              <div className="flex items-center justify-between">
                <h4 className={`text-sm font-medium ${textPrimary}`}>Voice Activity Detection (VAD)</h4>
                <div className="flex gap-2">
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      className={`px-2 py-1 text-xs rounded ${
                        vadStart === preset.start && vadEnd === preset.end && silenceDuration === preset.silence
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                      title={preset.desc}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={`text-xs ${textSecondary} block mb-1`}>Start Sensitivity</label>
                  <select
                    value={vadStart}
                    onChange={(e) => {
                      setVadStart(parseInt(e.target.value, 10));
                      setPendingReconnect(testStatus !== 'idle');
                    }}
                    className={`w-full px-2 py-1.5 rounded text-sm ${inputBg} border ${borderColor} ${textPrimary}`}
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
                      setVadEnd(parseInt(e.target.value, 10));
                      setPendingReconnect(testStatus !== 'idle');
                    }}
                    className={`w-full px-2 py-1.5 rounded text-sm ${inputBg} border ${borderColor} ${textPrimary}`}
                  >
                    {VAD_END_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`text-xs ${textSecondary} block mb-1`}>Silence Duration</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="300"
                      max="2000"
                      step="100"
                      value={silenceDuration}
                      onChange={(e) => {
                        setSilenceDuration(parseInt(e.target.value));
                        setPendingReconnect(testStatus !== 'idle');
                      }}
                      className="flex-1"
                    />
                    <span className={`text-xs ${textPrimary} w-12`}>{silenceDuration}ms</span>
                  </div>
                </div>

                <div>
                  <label className={`text-xs ${textSecondary} block mb-1`}>Prefix Padding</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="50"
                      value={prefixPadding}
                      onChange={(e) => {
                        setPrefixPadding(parseInt(e.target.value));
                        setPendingReconnect(testStatus !== 'idle');
                      }}
                      className="flex-1"
                    />
                    <span className={`text-xs ${textPrimary} w-12`}>{prefixPadding}ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Event Log */}
            <div className={`border ${borderColor} rounded-lg overflow-hidden`}>
              <div className={`px-3 py-2 border-b ${borderColor} flex items-center justify-between ${inputBg}`}>
                <span className={`text-sm font-medium ${textPrimary}`}>Event Log</span>
                <button
                  onClick={() => setTestEvents([])}
                  className={`text-xs ${textSecondary} hover:text-white`}
                >
                  Clear
                </button>
              </div>
              <div className={`h-40 overflow-y-auto p-2 font-mono text-xs ${inputBg}`}>
                {testEvents.length === 0 ? (
                  <p className={textSecondary}>Start a test session to see events...</p>
                ) : (
                  testEvents.map((entry, i) => (
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
          </div>
        )}
      </div>

      {/* ========================== */}
      {/* Model Information */}
      {/* ========================== */}
      <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
        <SectionHeader
          section="modelInfo"
          icon={Server}
          title="Model Information"
          subtitle="Available AI models and their capabilities"
        />

        {expandedSections.modelInfo && (
          <div className={`p-4 border-t ${borderColor} ${cardBg}`}>
            <div className="grid gap-3">
              {AVAILABLE_MODELS.map(model => (
                <div
                  key={model.id}
                  className={`p-4 rounded-lg border ${borderColor} ${
                    selectedModel === model.id ? 'ring-2 ring-purple-500' : ''
                  } ${model.status === 'deprecated' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`font-medium ${textPrimary}`}>{model.name}</h4>
                        {model.recommended && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
                            Recommended
                          </span>
                        )}
                        {model.status === 'deprecated' && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">
                            Deprecated
                          </span>
                        )}
                        {model.status === 'preview' && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                            Preview
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${textSecondary} mt-1`}>{model.description}</p>
                    </div>
                    {selectedModel !== model.id && (
                      <button
                        onClick={() => {
                          setSelectedModel(model.id);
                          setPendingReconnect(testStatus !== 'idle');
                        }}
                        className="px-3 py-1 text-sm bg-zinc-700 text-white rounded hover:bg-zinc-600"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-4 p-4 rounded-lg ${inputBg}`}>
              <h4 className={`text-sm font-medium ${textPrimary} mb-2`}>💡 Gemini 3 Flash Highlights</h4>
              <ul className={`text-sm ${textSecondary} space-y-1 list-disc list-inside`}>
                <li><strong>40-60% faster</strong> response latency than Gemini 2.5</li>
                <li><strong>Better reasoning</strong> for complex technical queries</li>
                <li><strong>1M token context</strong> window (Pro version)</li>
                <li><strong>Same WebSocket API</strong> - drop-in replacement</li>
                <li><strong>Lower pricing</strong> with improved performance</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ========================== */}
      {/* AI Copilot Settings */}
      {/* ========================== */}
      <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
        <SectionHeader
          section="copilotSettings"
          icon={Sparkles}
          title="AI Copilot Settings"
          subtitle="Persona, voice preferences, and custom instructions"
        />

        {expandedSections.copilotSettings && (
          <div className={`p-4 border-t ${borderColor} ${cardBg} space-y-4`}>
            {/* Persona Selection */}
            <div>
              <label className={`text-sm font-medium ${textPrimary} block mb-2`}>Assistant Persona</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setPersona('brief')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    persona === 'brief'
                      ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                      : `${cardBg} border-zinc-200 dark:border-zinc-700 hover:border-violet-300`
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'brief' ? 'border-violet-500' : 'border-zinc-400'}`}>
                    {persona === 'brief' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                  </div>
                  <div>
                    <h3 className={`text-sm font-medium ${textPrimary}`}>The Field Partner</h3>
                    <p className={`text-xs ${textSecondary} mt-1`}>Concise, fast, and proactive. Optimized for hands-free work.</p>
                  </div>
                </button>

                <button
                  onClick={() => setPersona('detailed')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    persona === 'detailed'
                      ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                      : `${cardBg} border-zinc-200 dark:border-zinc-700 hover:border-violet-300`
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'detailed' ? 'border-violet-500' : 'border-zinc-400'}`}>
                    {persona === 'detailed' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                  </div>
                  <div>
                    <h3 className={`text-sm font-medium ${textPrimary}`}>The Teacher</h3>
                    <p className={`text-xs ${textSecondary} mt-1`}>Explains reasoning, confirms details verbally, offers guidance.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className={`text-sm font-medium ${textPrimary} block mb-2`}>Custom Instructions</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="e.g., 'I always measure in millimeters', or 'Remind me to check for obstructions'"
                className={`w-full px-3 py-2 rounded-xl border ${borderColor} ${inputBg} text-sm ${textPrimary} focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500`}
              />
              <p className={`text-xs ${textSecondary} mt-1 italic`}>
                The AI will consider these instructions in every interaction.
              </p>
            </div>

            {/* Conversation Transcript */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-medium ${textPrimary}`}>Conversation Transcript</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyTranscript}
                    disabled={transcript.length === 0}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      !copied
                        ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                        : ''
                    } ${transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={copied ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' } : undefined}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={clearTranscript}
                    disabled={transcript.length === 0}
                    className={`px-2 py-1 rounded text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors ${
                      transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className={`${inputBg} rounded-lg p-3 max-h-60 overflow-y-auto`}>
                {transcript.length === 0 ? (
                  <div className={`${textSecondary} text-sm text-center py-4`}>
                    No conversation yet. Start a voice session to see the transcript here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transcript.map((entry, i) => (
                      <div key={i} className={`text-sm ${entry.type === 'ai' ? '' : 'text-right'}`}>
                        <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg ${
                          entry.type === 'ai'
                            ? `${cardBg} border ${borderColor} ${textPrimary}`
                            : 'bg-violet-500 text-white'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                          <p className={`text-[10px] mt-1 ${entry.type === 'ai' ? 'text-zinc-400' : 'text-violet-200'}`}>
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================== */}
      {/* AI Brain Training */}
      {/* ========================== */}
      <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
        <SectionHeader
          section="training"
          icon={Bot}
          title="AI Brain Training"
          subtitle="Train the AI to understand each page"
          badge={`${progressPercent}% Complete`}
        />

        {expandedSections.training && (
          <div className={`p-4 border-t ${borderColor} ${cardBg} space-y-4`}>
            {/* Header with Enter Training Mode button */}
            <div className="flex items-center justify-between">
              <div>
                <p className={textSecondary}>
                  Train the AI to understand each page and teach users
                </p>
              </div>
              <button
                onClick={() => {
                  enterTrainingMode();
                  navigate('/');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Bot className="w-5 h-5" />
                {isTrainingMode ? 'Training Mode Active' : 'Enter Training Mode'}
              </button>
            </div>

            {trainingError && (
              <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
                {trainingError}
              </div>
            )}

            {trainingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-lg ${inputBg}`}>
                    <p className={textSecondary}>Total Pages</p>
                    <p className={`text-2xl font-bold ${textPrimary}`}>{trainingStatus.total}</p>
                  </div>
                  <div className={`p-4 rounded-lg ${inputBg}`}>
                    <p className={textSecondary}>Trained</p>
                    <p className="text-2xl font-bold" style={{ color: '#94AF32' }}>{trainedCount}</p>
                  </div>
                  <div className={`p-4 rounded-lg ${inputBg}`}>
                    <p className={textSecondary}>Published</p>
                    <p className="text-2xl font-bold text-blue-500">{trainingStatus.published}</p>
                  </div>
                  <div className={`p-4 rounded-lg ${inputBg}`}>
                    <p className={textSecondary}>Untrained</p>
                    <p className="text-2xl font-bold text-yellow-500">{trainingStatus.untrained}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className={textSecondary}>Training Progress</span>
                    <span className={textPrimary}>{progressPercent}%</span>
                  </div>
                  <div className={`w-full h-3 ${inputBg} rounded-full overflow-hidden`}>
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Page list */}
                <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full">
                      <thead className={`${inputBg} sticky top-0`}>
                        <tr>
                          <th className={`px-4 py-3 text-left text-sm font-medium ${textSecondary}`}>Page</th>
                          <th className={`px-4 py-3 text-left text-sm font-medium ${textSecondary}`}>Route</th>
                          <th className={`px-4 py-3 text-center text-sm font-medium ${textSecondary}`}>Status</th>
                          <th className={`px-4 py-3 text-right text-sm font-medium ${textSecondary}`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${borderColor}`}>
                        {trainingStatus.pages.map((page) => (
                          <tr key={page.route} className={`${cardBg} hover:bg-zinc-700/30`}>
                            <td className={`px-4 py-3 ${textPrimary}`}>
                              <div className="font-medium">{page.page_title || page.pageTitle || page.componentName}</div>
                              <div className={`text-xs ${textSecondary}`}>{page.componentName}</div>
                            </td>
                            <td className={`px-4 py-3 text-sm ${textSecondary}`}>
                              <code className="text-xs bg-zinc-700/50 px-1 py-0.5 rounded">{page.route}</code>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {page.is_trained ? (
                                page.is_published ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' }}>
                                    <CheckCircle className="w-3 h-3" />
                                    Published
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                                    <CheckCircle className="w-3 h-3" />
                                    Trained
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                                  <AlertCircle className="w-3 h-3" />
                                  Untrained
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleTrainPage(page.route)}
                                  className="p-1.5 rounded hover:bg-purple-500/20 text-purple-400"
                                  title="Train this page"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                                {page.is_trained && !page.is_published && (
                                  <button
                                    onClick={() => handleTogglePublish(page.route, false)}
                                    className="p-1.5 rounded"
                                    style={{ color: '#94AF32' }}
                                    title="Publish training"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {page.is_published && (
                                  <button
                                    onClick={() => handleTogglePublish(page.route, true)}
                                    className={`p-1.5 rounded hover:bg-zinc-600 ${textSecondary}`}
                                    title="Unpublish"
                                  >
                                    <EyeOff className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* How it works */}
                <div className={`p-4 rounded-lg ${inputBg}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h3 className={`font-semibold ${textPrimary}`}>How Brain Training Works</h3>
                  </div>
                  <div className={`text-sm ${textSecondary} space-y-2`}>
                    <p>1. <strong>Enter Training Mode</strong> - Click the button above to activate the floating training panel</p>
                    <p>2. <strong>Navigate to a Page</strong> - Go to any page in the app you want to train</p>
                    <p>3. <strong>Start Training</strong> - Use voice or text to explain what the page does</p>
                    <p>4. <strong>Save & Publish</strong> - Save your training and publish it to make it available</p>
                    <p>5. <strong>AI Teaches Users</strong> - The AI can now help users understand that page</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAgentTab;
