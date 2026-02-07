/**
 * Unified AI Model Configuration
 *
 * Central source of truth for all AI model configurations.
 * Works in both frontend (React) and backend (Vercel serverless).
 *
 * Pattern inspired by: src/voice-ai/config/voiceConfig.js
 *
 * Usage:
 *   const { getModelId, getServiceConfig } = require('../shared/aiConfig');
 *   const modelId = getModelId('BUG_ANALYZER'); // 'gemini-2.5-flash'
 */

// ================================
// MODEL DEFINITIONS
// ================================

const AI_MODELS = {
  // Fast, general purpose - good for most tasks
  'gemini-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, cost-effective for most tasks',
    status: 'stable',
    costTier: 'low',
    capabilities: ['text', 'vision', 'json', 'code'],
  },

  // Best reasoning - for complex research tasks
  'gemini-pro': {
    id: 'gemini-2.5-pro-preview-05-06',
    name: 'Gemini 2.5 Pro',
    description: 'Best reasoning, document research, grounding',
    status: 'preview',
    costTier: 'high',
    capabilities: ['text', 'vision', 'json', 'code', 'grounding', 'long-context'],
  },

  // Latest flash - faster with improved quality
  'gemini-flash-3': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    description: 'Latest flash model, 40-60% faster, improved reasoning',
    status: 'preview',
    costTier: 'low',
    capabilities: ['text', 'vision', 'json', 'code', 'audio'],
  },

  // Native audio for real-time voice
  'gemini-native-audio': {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    name: 'Gemini 2.5 Native Audio',
    description: 'Real-time voice conversations with native audio',
    status: 'preview',
    costTier: 'medium',
    capabilities: ['audio', 'realtime', 'interruption'],
  },

  // Legacy - for backwards compatibility
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Legacy model - use gemini-flash instead',
    status: 'deprecated',
    costTier: 'low',
    capabilities: ['text', 'vision', 'json'],
  },
};

// ================================
// SERVICE CONFIGURATIONS
// ================================

const AI_SERVICES = {
  // Bug report analysis with screenshot understanding
  BUG_ANALYZER: {
    model: 'gemini-flash-3',
    description: 'Bug report analysis with screenshot understanding',
    temperature: 0.2,
    maxTokens: 4096,
  },

  // Email classification and response generation
  EMAIL_ANALYZER: {
    model: 'gemini-flash',
    description: 'Email classification and response generation',
    temperature: 0.3,
    maxTokens: 2048,
  },

  // Deep research for part documentation (single part)
  PART_ENRICHER: {
    model: 'gemini-pro',
    description: 'Deep research for part documentation with web grounding',
    temperature: 0.2,
    maxTokens: 8192,
  },

  // Batch part enrichment (cost-optimized)
  PART_ENRICHER_BATCH: {
    model: 'gemini-flash',
    description: 'Batch part enrichment - cost-optimized',
    temperature: 0.2,
    maxTokens: 4096,
  },

  // Parse voice measurements
  MEASUREMENT_PARSER: {
    model: 'gemini-flash',
    description: 'Parse voice measurements for shades',
    temperature: 0.1,
    maxTokens: 1024,
  },

  // Extract contacts from business cards
  BUSINESS_CARD_SCANNER: {
    model: 'gemini-flash',
    description: 'Extract contacts from business card images',
    temperature: 0.1,
    maxTokens: 2048,
  },

  // Real-time voice AI assistant (uses voiceConfig.js for detailed config)
  VOICE_ASSISTANT: {
    model: 'gemini-flash-3',
    description: 'Real-time voice AI assistant',
    temperature: 0.7,
    maxTokens: 4096,
  },

  // Extract training data from screenshots
  TRAINING_EXTRACTOR: {
    model: 'gemini-flash',
    description: 'Extract training data from UI screenshots',
    temperature: 0.2,
    maxTokens: 4096,
  },

  // Room matching for Lucid imports
  ROOM_MATCHER: {
    model: 'gemini-flash',
    description: 'Match rooms between systems',
    temperature: 0.1,
    maxTokens: 2048,
  },

  // Lutron header parsing
  LUTRON_PARSER: {
    model: 'gemini-flash',
    description: 'Parse Lutron shade headers',
    temperature: 0.1,
    maxTokens: 2048,
  },

  // Contact parsing from text
  CONTACT_PARSER: {
    model: 'gemini-flash',
    description: 'Parse contacts from unstructured text',
    temperature: 0.2,
    maxTokens: 2048,
  },
};

// ================================
// ENVIRONMENT CONFIGURATION
// ================================

/**
 * Get the API key for Gemini
 * Works in both browser and Node.js environments
 * @returns {string|null} API key or null if not configured
 */
function getGeminiApiKey() {
  // Node.js / Vercel serverless
  if (typeof process !== 'undefined' && process.env) {
    const key = process.env.GEMINI_API_KEY ||
                process.env.REACT_APP_GEMINI_API_KEY;
    return key || null;
  }
  // Browser (shouldn't be used directly, but fallback)
  if (typeof window !== 'undefined' && window.REACT_APP_GEMINI_API_KEY) {
    return window.REACT_APP_GEMINI_API_KEY;
  }
  return null;
}

/**
 * Validate that API key is configured
 * @throws {Error} If API key is not configured
 */
function requireGeminiApiKey() {
  const key = getGeminiApiKey();
  if (!key || key.length < 10) {
    throw new Error('GEMINI_API_KEY not configured. Set GEMINI_API_KEY environment variable.');
  }
  return key;
}

// ================================
// HELPER FUNCTIONS
// ================================

/**
 * Get model definition by key
 * @param {string} modelKey - Key from AI_MODELS
 * @returns {Object|null} Model definition or null
 */
function getModel(modelKey) {
  return AI_MODELS[modelKey] || null;
}

/**
 * Get model configuration for a service
 * @param {string} serviceName - Key from AI_SERVICES (e.g., 'BUG_ANALYZER')
 * @returns {Object} Complete model configuration with modelId
 */
function getServiceConfig(serviceName) {
  const service = AI_SERVICES[serviceName];
  if (!service) {
    console.warn(`[AIConfig] Unknown service: ${serviceName}, using BUG_ANALYZER as default`);
    return getServiceConfig('BUG_ANALYZER');
  }

  const model = AI_MODELS[service.model];
  if (!model) {
    console.warn(`[AIConfig] Unknown model: ${service.model}, using gemini-flash`);
    return {
      ...service,
      modelId: AI_MODELS['gemini-flash'].id,
      modelName: AI_MODELS['gemini-flash'].name,
      capabilities: AI_MODELS['gemini-flash'].capabilities,
    };
  }

  return {
    ...service,
    modelId: model.id,
    modelName: model.name,
    capabilities: model.capabilities,
    costTier: model.costTier,
  };
}

/**
 * Get the model ID for a service
 * @param {string} serviceName - Key from AI_SERVICES
 * @returns {string} Model ID (e.g., 'gemini-2.5-flash')
 */
function getModelId(serviceName) {
  const config = getServiceConfig(serviceName);
  return config.modelId;
}

/**
 * Get all available models
 * @returns {Object} All model definitions
 */
function getAllModels() {
  return { ...AI_MODELS };
}

/**
 * Get all service configurations
 * @returns {Object} All service definitions
 */
function getAllServices() {
  return { ...AI_SERVICES };
}

/**
 * Get models filtered by capability
 * @param {string} capability - Required capability (e.g., 'vision', 'audio')
 * @returns {Array} Array of [key, model] pairs
 */
function getModelsByCapability(capability) {
  return Object.entries(AI_MODELS)
    .filter(([_, model]) => model.capabilities?.includes(capability));
}

/**
 * Check if a model is deprecated
 * @param {string} modelKey - Key from AI_MODELS
 * @returns {boolean} True if deprecated
 */
function isModelDeprecated(modelKey) {
  const model = AI_MODELS[modelKey];
  return model?.status === 'deprecated';
}

// ================================
// EXPORTS
// ================================

// CommonJS for Node.js/Vercel
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AI_MODELS,
    AI_SERVICES,
    getGeminiApiKey,
    requireGeminiApiKey,
    getModel,
    getServiceConfig,
    getModelId,
    getAllModels,
    getAllServices,
    getModelsByCapability,
    isModelDeprecated,
  };
}
