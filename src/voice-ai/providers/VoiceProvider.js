/**
 * VoiceProvider.js
 * Abstract interface for Voice AI providers
 *
 * ARCHITECTURE: Provider Adapter Pattern
 * - All providers implement this interface
 * - Application code uses this interface, never provider-specific code
 * - Swapping providers = changing config, not code
 *
 * Events emitted:
 * - 'connecting' - Starting connection
 * - 'connected' - Connection established
 * - 'listening' - Receiving user audio
 * - 'speaking' - Playing AI audio
 * - 'transcript' - User speech transcribed
 * - 'response' - AI text response
 * - 'audio' - AI audio chunk received
 * - 'tool_call' - Tool/function called
 * - 'error' - Error occurred
 * - 'disconnected' - Connection closed
 */

/**
 * Standard audio format for all providers
 */
export const AUDIO_FORMAT = {
  // Input (microphone) settings
  input: {
    sampleRate: 16000,  // Most providers use 16kHz input
    channels: 1,        // Mono
    bitDepth: 16,       // 16-bit PCM
  },
  // Output (speaker) settings
  output: {
    sampleRate: 24000,  // Most providers use 24kHz output
    channels: 1,
    bitDepth: 16,
  },
};

/**
 * Session configuration
 */
export class SessionConfig {
  constructor({
    model,
    voice,
    systemPrompt,
    tools = [],
    vadConfig = {},
    customConfig = {},
  }) {
    this.model = model;
    this.voice = voice;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.vadConfig = vadConfig;
    this.customConfig = customConfig;
  }
}

/**
 * Tool call representation
 */
export class ToolCall {
  constructor({ id, name, args }) {
    this.id = id;
    this.name = name;
    this.args = args;
    this.timestamp = Date.now();
  }
}

/**
 * Tool response representation
 */
export class ToolResponse {
  constructor({ id, name, result, error = null }) {
    this.id = id;
    this.name = name;
    this.result = result;
    this.error = error;
    this.timestamp = Date.now();
  }
}

/**
 * Session metrics
 */
export class SessionMetrics {
  constructor() {
    this.connectionTime = null;
    this.lastResponseLatency = null;
    this.audioChunksSent = 0;
    this.audioChunksReceived = 0;
    this.toolCallsCount = 0;
    this.turnCount = 0;
    this.startTime = null;
    this.errors = [];
  }

  reset() {
    this.connectionTime = null;
    this.lastResponseLatency = null;
    this.audioChunksSent = 0;
    this.audioChunksReceived = 0;
    this.toolCallsCount = 0;
    this.turnCount = 0;
    this.startTime = Date.now();
    this.errors = [];
  }
}

/**
 * Abstract Voice Provider Interface
 * All provider adapters must implement these methods
 */
export class VoiceProvider {
  constructor(config) {
    this.config = config;
    this.session = null;
    this.metrics = new SessionMetrics();
    this.eventHandlers = new Map();
    this.status = 'idle';
  }

  // ================================
  // ABSTRACT METHODS - Must be implemented
  // ================================

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented');
  }

  /**
   * Check if provider is configured (has API key, etc.)
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('isConfigured() must be implemented');
  }

  /**
   * Start a voice session
   * @param {SessionConfig} config
   * @returns {Promise<void>}
   */
  async startSession(config) {
    throw new Error('startSession() must be implemented');
  }

  /**
   * End the current session
   * @returns {Promise<void>}
   */
  async endSession() {
    throw new Error('endSession() must be implemented');
  }

  /**
   * Send audio data to the provider
   * @param {ArrayBuffer|Float32Array} audioData
   * @returns {void}
   */
  sendAudio(audioData) {
    throw new Error('sendAudio() must be implemented');
  }

  /**
   * Send tool response back to provider
   * @param {ToolResponse} response
   * @returns {void}
   */
  sendToolResponse(response) {
    throw new Error('sendToolResponse() must be implemented');
  }

  /**
   * Get supported models for this provider
   * @returns {Array<{id: string, name: string, description: string}>}
   */
  getSupportedModels() {
    throw new Error('getSupportedModels() must be implemented');
  }

  /**
   * Get supported voices for this provider
   * @returns {Array<{id: string, name: string, gender: string}>}
   */
  getSupportedVoices() {
    throw new Error('getSupportedVoices() must be implemented');
  }

  /**
   * Convert tool definitions to provider-specific format
   * @param {Array} tools - Unified tool definitions
   * @returns {Array} - Provider-specific format
   */
  formatTools(tools) {
    throw new Error('formatTools() must be implemented');
  }

  // ================================
  // COMMON METHODS - Shared implementation
  // ================================

  /**
   * Register event handler
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
    return this; // Allow chaining
  }

  /**
   * Remove event handler
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit event to all handlers
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[VoiceProvider] Error in ${event} handler:`, err);
        }
      });
    }
  }

  /**
   * Get current status
   * @returns {string} - idle, connecting, connected, listening, speaking, error
   */
  getStatus() {
    return this.status;
  }

  /**
   * Set status and emit event
   * @param {string} newStatus
   */
  setStatus(newStatus) {
    const oldStatus = this.status;
    this.status = newStatus;
    if (oldStatus !== newStatus) {
      this.emit('status_change', { oldStatus, newStatus });
    }
  }

  /**
   * Get current metrics
   * @returns {SessionMetrics}
   */
  getMetrics() {
    return this.metrics;
  }

  /**
   * Log debug message
   * @param {string} message
   * @param {string} level - info, warn, error
   */
  log(message, level = 'info') {
    const prefix = `[${this.getProviderName()}]`;
    switch (level) {
      case 'error':
        console.error(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
    this.emit('log', { message, level, timestamp: Date.now() });
  }

  /**
   * Handle error
   * @param {Error|string} error
   */
  handleError(error) {
    const errorMessage = error instanceof Error ? error.message : error;
    this.metrics.errors.push({ message: errorMessage, timestamp: Date.now() });
    this.setStatus('error');
    this.emit('error', { message: errorMessage, error });
    this.log(errorMessage, 'error');
  }

  // ================================
  // AUDIO CONVERSION HELPERS
  // ================================

  /**
   * Convert Float32Array to Int16 PCM
   * @param {Float32Array} float32Array
   * @returns {Int16Array}
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Convert Int16 PCM to Float32Array
   * @param {Int16Array} int16Array
   * @returns {Float32Array}
   */
  int16ToFloat32(int16Array) {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }
    return float32Array;
  }

  /**
   * Convert ArrayBuffer to Base64
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default VoiceProvider;
