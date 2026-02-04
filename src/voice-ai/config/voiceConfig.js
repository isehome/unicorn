/**
 * voiceConfig.js
 * Central configuration for Voice AI providers
 *
 * ARCHITECTURE: Provider-agnostic configuration
 * - Change providers by updating config, not code
 * - Fallback chains for reliability
 * - Model-specific tuning parameters
 *
 * Future-proofing: When Gemini 4 releases, add it here and update DEFAULT_PROVIDER
 */

// ================================
// AVAILABLE PROVIDERS
// ================================

export const PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic', // Future: when Claude gets real-time API
  DEEPGRAM: 'deepgram',   // Future: Deepgram Voice Agent API
};

// ================================
// MODEL DEFINITIONS
// ================================

export const MODELS = {
  // Google Gemini Models
  'gemini-3-flash': {
    provider: PROVIDERS.GEMINI,
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    description: 'Latest model - 40-60% faster latency, better reasoning',
    status: 'preview',
    recommended: true,
    capabilities: {
      realtime: true,
      videoInput: true,
      toolCalling: true,
      interruption: true,
      nativeAudio: true,
    },
    audio: {
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
    latency: {
      typical: 250,
      best: 200,
    },
    pricing: {
      inputPer1M: 0.50,
      outputPer1M: 3.00,
    },
  },

  'gemini-2.5-flash-native': {
    provider: PROVIDERS.GEMINI,
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    name: 'Gemini 2.5 Flash Native Audio',
    description: 'Current stable - excellent audio quality',
    status: 'stable',
    recommended: false,
    capabilities: {
      realtime: true,
      videoInput: true,
      toolCalling: true,
      interruption: true,
      nativeAudio: true,
    },
    audio: {
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
    latency: {
      typical: 320,
      best: 280,
    },
    pricing: {
      inputPer1M: 0.075,
      outputPer1M: 0.30,
    },
  },

  'gemini-2.0-flash-live': {
    provider: PROVIDERS.GEMINI,
    id: 'gemini-2.0-flash-live-001',
    name: 'Gemini 2.0 Flash Live',
    description: '⚠️ DEPRECATED - Retiring March 3, 2026',
    status: 'deprecated',
    deprecationDate: '2026-03-03',
    recommended: false,
    capabilities: {
      realtime: true,
      videoInput: false,
      toolCalling: true,
      interruption: true,
      nativeAudio: false,
    },
    audio: {
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
    latency: {
      typical: 400,
      best: 350,
    },
  },

  // OpenAI Models
  'gpt-realtime': {
    provider: PROVIDERS.OPENAI,
    id: 'gpt-realtime',
    name: 'GPT Realtime',
    description: 'Lowest latency (232ms median), best natural speech',
    status: 'stable',
    recommended: true,
    capabilities: {
      realtime: true,
      videoInput: true,
      toolCalling: true,
      interruption: true,
      nativeAudio: true,
    },
    audio: {
      inputSampleRate: 24000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
    latency: {
      typical: 232,
      best: 200,
    },
    pricing: {
      inputPer1M: 100.00,  // Audio is more expensive
      outputPer1M: 200.00,
    },
  },

  'gpt-4o-realtime': {
    provider: PROVIDERS.OPENAI,
    id: 'gpt-4o-realtime-preview',
    name: 'GPT-4o Realtime',
    description: '⚠️ Being replaced by gpt-realtime Feb 2026',
    status: 'deprecated',
    deprecationDate: '2026-02-28',
    recommended: false,
    capabilities: {
      realtime: true,
      videoInput: false,
      toolCalling: true,
      interruption: true,
      nativeAudio: true,
    },
    audio: {
      inputSampleRate: 24000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
    latency: {
      typical: 320,
      best: 270,
    },
  },

  // Future: Gemini 4 (placeholder)
  'gemini-4-flash': {
    provider: PROVIDERS.GEMINI,
    id: 'gemini-4-flash', // Update when released
    name: 'Gemini 4 Flash',
    description: 'Next generation (placeholder for future)',
    status: 'future',
    recommended: false,
    capabilities: {
      realtime: true,
      videoInput: true,
      toolCalling: true,
      interruption: true,
      nativeAudio: true,
    },
    audio: {
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      codec: 'pcm',
    },
  },
};

// ================================
// VOICE OPTIONS BY PROVIDER
// ================================

export const VOICES = {
  [PROVIDERS.GEMINI]: [
    { id: 'Puck', name: 'Puck', description: 'Energetic male voice', gender: 'male' },
    { id: 'Charon', name: 'Charon', description: 'Deep, calm male voice', gender: 'male' },
    { id: 'Kore', name: 'Kore', description: 'Warm female voice', gender: 'female' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Deep male voice', gender: 'male' },
    { id: 'Aoede', name: 'Aoede', description: 'Formal female voice', gender: 'female' },
  ],
  [PROVIDERS.OPENAI]: [
    { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced voice', gender: 'neutral' },
    { id: 'echo', name: 'Echo', description: 'Warm male voice', gender: 'male' },
    { id: 'fable', name: 'Fable', description: 'British accent', gender: 'male' },
    { id: 'onyx', name: 'Onyx', description: 'Deep male voice', gender: 'male' },
    { id: 'nova', name: 'Nova', description: 'Friendly female voice', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', description: 'Clear female voice', gender: 'female' },
  ],
};

// ================================
// VAD (Voice Activity Detection) SETTINGS
// ================================

export const VAD_PRESETS = {
  snappy: {
    name: 'Snappy',
    description: 'Fastest response, may cut off',
    startSensitivity: 'HIGH',
    endSensitivity: 'HIGH',
    silenceDurationMs: 400,
    prefixPaddingMs: 200,
  },
  balanced: {
    name: 'Balanced',
    description: 'Good balance of speed and accuracy',
    startSensitivity: 'HIGH',
    endSensitivity: 'LOW',
    silenceDurationMs: 700,
    prefixPaddingMs: 300,
  },
  patient: {
    name: 'Patient',
    description: 'Waits for clear speech',
    startSensitivity: 'LOW',
    endSensitivity: 'LOW',
    silenceDurationMs: 1200,
    prefixPaddingMs: 400,
  },
  interview: {
    name: 'Interview',
    description: 'Long pauses allowed',
    startSensitivity: 'LOW',
    endSensitivity: 'LOW',
    silenceDurationMs: 1500,
    prefixPaddingMs: 500,
  },
};

// ================================
// DEFAULT CONFIGURATION
// ================================

export const DEFAULT_CONFIG = {
  // Primary provider - change this to switch providers
  provider: PROVIDERS.GEMINI,

  // Primary model - change this to switch models
  model: 'gemini-2.5-flash-native', // Key from MODELS

  // Fallback chain - try these if primary fails
  fallbackChain: [
    'gemini-3-flash',      // Try newer model
    'gemini-2.0-flash-live', // Try older stable
    'gpt-realtime',        // Try OpenAI
  ],

  // Voice settings
  voice: 'Puck',
  vadPreset: 'balanced',

  // Feature flags
  features: {
    enableFallback: true,
    enableLatencyTracking: true,
    enableTranscriptLogging: true,
    enableToolCalling: true,
    enableInterruption: true,
  },

  // Timeouts
  timeouts: {
    connectionMs: 10000,
    responseMs: 30000,
    sessionMaxMs: 600000, // 10 minutes
  },
};

// ================================
// ENVIRONMENT CONFIGURATION
// ================================

export const getProviderConfig = (provider) => {
  const configs = {
    [PROVIDERS.GEMINI]: {
      apiKey: process.env.REACT_APP_GEMINI_API_KEY,
      wsEndpoint: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      apiVersion: 'v1beta',
    },
    [PROVIDERS.OPENAI]: {
      apiKey: process.env.REACT_APP_OPENAI_API_KEY,
      wsEndpoint: 'wss://api.openai.com/v1/realtime',
      apiVersion: 'v1',
    },
  };
  return configs[provider] || null;
};

// ================================
// HELPER FUNCTIONS
// ================================

/**
 * Get model definition by key
 */
export const getModel = (modelKey) => MODELS[modelKey] || null;

/**
 * Get all models for a provider
 */
export const getModelsForProvider = (provider) =>
  Object.entries(MODELS)
    .filter(([_, model]) => model.provider === provider && model.status !== 'future')
    .map(([key, model]) => ({ key, ...model }));

/**
 * Get recommended model for a provider
 */
export const getRecommendedModel = (provider) =>
  Object.entries(MODELS)
    .find(([_, model]) => model.provider === provider && model.recommended)?.[0] || null;

/**
 * Get voices for a provider
 */
export const getVoicesForProvider = (provider) => VOICES[provider] || [];

/**
 * Check if a model is deprecated
 */
export const isModelDeprecated = (modelKey) => {
  const model = MODELS[modelKey];
  if (!model) return false;
  if (model.status === 'deprecated') {
    if (model.deprecationDate) {
      return new Date() < new Date(model.deprecationDate)
        ? 'warning' // Not yet deprecated but will be
        : 'deprecated'; // Already deprecated
    }
    return 'deprecated';
  }
  return false;
};

/**
 * Load config from localStorage with defaults
 */
export const loadStoredConfig = () => {
  try {
    const stored = localStorage.getItem('voice_ai_config');
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('[VoiceConfig] Failed to load stored config:', e);
  }
  return DEFAULT_CONFIG;
};

/**
 * Save config to localStorage
 */
export const saveConfig = (config) => {
  try {
    localStorage.setItem('voice_ai_config', JSON.stringify(config));
  } catch (e) {
    console.warn('[VoiceConfig] Failed to save config:', e);
  }
};

export default {
  PROVIDERS,
  MODELS,
  VOICES,
  VAD_PRESETS,
  DEFAULT_CONFIG,
  getProviderConfig,
  getModel,
  getModelsForProvider,
  getRecommendedModel,
  getVoicesForProvider,
  isModelDeprecated,
  loadStoredConfig,
  saveConfig,
};
