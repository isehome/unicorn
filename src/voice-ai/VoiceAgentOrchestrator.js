/**
 * VoiceAgentOrchestrator.js
 * Main orchestrator for the Voice AI Agent
 *
 * ARCHITECTURE: Provider-agnostic voice agent
 * - Manages provider selection and fallback
 * - Handles audio I/O
 * - Executes tools
 * - Tracks metrics
 *
 * Usage:
 * ```
 * const orchestrator = new VoiceAgentOrchestrator(config);
 * orchestrator.on('transcript', ({ type, text }) => console.log(type, text));
 * orchestrator.on('audio', ({ data }) => playAudio(data));
 * await orchestrator.start();
 * orchestrator.sendAudio(audioChunk);
 * await orchestrator.stop();
 * ```
 */

import { GeminiAdapter } from './providers/GeminiAdapter';
import { OpenAIAdapter } from './providers/OpenAIAdapter';
import { SessionConfig } from './providers/VoiceProvider';
import { ToolRegistry, createUnicornToolRegistry, ToolResult } from './tools/ToolRegistry';
import {
  PROVIDERS,
  MODELS,
  DEFAULT_CONFIG,
  loadStoredConfig,
  saveConfig,
  getModel,
  getProviderConfig,
} from './config/voiceConfig';

/**
 * Voice Agent Orchestrator
 * Manages provider selection, session lifecycle, and tool execution
 */
export class VoiceAgentOrchestrator {
  constructor(config = {}) {
    // Merge with stored/default config
    this.config = { ...loadStoredConfig(), ...config };

    // Initialize provider adapter (null until started)
    this.provider = null;
    this.providerName = null;

    // Tool registry
    this.toolRegistry = config.toolRegistry || createUnicornToolRegistry();

    // Event handlers
    this.eventHandlers = new Map();

    // State
    this.status = 'idle';
    this.currentModel = null;
    this.fallbackIndex = 0;

    // Audio context for playback
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;

    // Context provider for tools
    this.contextProvider = null;
    this.actionExecutor = null;
    this.navigationHandler = null;

    // Bind methods
    this.handleToolCall = this.handleToolCall.bind(this);
    this.handleAudio = this.handleAudio.bind(this);
    this.handleStatusChange = this.handleStatusChange.bind(this);
  }

  // ================================
  // CONFIGURATION
  // ================================

  /**
   * Set the context provider (for get_context tool)
   */
  setContextProvider(provider) {
    this.contextProvider = provider;
    this.toolRegistry.setContextProvider(provider);
    return this;
  }

  /**
   * Set action executor (for execute_action tool)
   */
  setActionExecutor(executor) {
    this.actionExecutor = executor;
    return this;
  }

  /**
   * Set navigation handler (for navigate tool)
   */
  setNavigationHandler(handler) {
    this.navigationHandler = handler;
    return this;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    saveConfig(this.config);
    return this;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  // ================================
  // EVENT HANDLING
  // ================================

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
    return this;
  }

  /**
   * Remove event handler
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
   * Emit event
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[Orchestrator] Error in ${event} handler:`, err);
        }
      });
    }
  }

  // ================================
  // PROVIDER MANAGEMENT
  // ================================

  /**
   * Create provider adapter based on config
   */
  createProvider(modelKey) {
    const model = getModel(modelKey);
    if (!model) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    const providerConfig = getProviderConfig(model.provider);
    if (!providerConfig?.apiKey) {
      throw new Error(`No API key configured for ${model.provider}`);
    }

    switch (model.provider) {
      case PROVIDERS.GEMINI:
        return new GeminiAdapter(this.config);
      case PROVIDERS.OPENAI:
        return new OpenAIAdapter(this.config);
      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  }

  /**
   * Get available providers (those with API keys configured)
   */
  getAvailableProviders() {
    const available = [];

    if (getProviderConfig(PROVIDERS.GEMINI)?.apiKey) {
      available.push({
        id: PROVIDERS.GEMINI,
        name: 'Google Gemini',
        models: Object.entries(MODELS)
          .filter(([_, m]) => m.provider === PROVIDERS.GEMINI && m.status !== 'future')
          .map(([key, m]) => ({ key, ...m })),
      });
    }

    if (getProviderConfig(PROVIDERS.OPENAI)?.apiKey) {
      available.push({
        id: PROVIDERS.OPENAI,
        name: 'OpenAI',
        models: Object.entries(MODELS)
          .filter(([_, m]) => m.provider === PROVIDERS.OPENAI && m.status !== 'future')
          .map(([key, m]) => ({ key, ...m })),
      });
    }

    return available;
  }

  /**
   * Try next fallback provider
   */
  async tryFallback() {
    if (!this.config.features.enableFallback) {
      return false;
    }

    const fallbackChain = this.config.fallbackChain || [];
    if (this.fallbackIndex >= fallbackChain.length) {
      this.emit('fallback_exhausted', { tried: this.fallbackIndex });
      return false;
    }

    const nextModel = fallbackChain[this.fallbackIndex];
    this.fallbackIndex++;

    this.emit('fallback_attempt', { model: nextModel, attempt: this.fallbackIndex });
    console.log(`[Orchestrator] Trying fallback: ${nextModel}`);

    try {
      await this.startWithModel(nextModel);
      return true;
    } catch (err) {
      console.error(`[Orchestrator] Fallback failed:`, err);
      return this.tryFallback();
    }
  }

  // ================================
  // SESSION MANAGEMENT
  // ================================

  /**
   * Start voice session with specific model
   */
  async startWithModel(modelKey) {
    // Create provider
    this.provider = this.createProvider(modelKey);
    this.providerName = this.provider.getProviderName();
    this.currentModel = modelKey;

    // Wire up events
    this.provider.on('status_change', this.handleStatusChange);
    this.provider.on('tool_call', this.handleToolCall);
    this.provider.on('audio', this.handleAudio);
    this.provider.on('transcript', (data) => this.emit('transcript', data));
    this.provider.on('response', (data) => this.emit('response', data));
    this.provider.on('latency', (data) => this.emit('latency', data));
    this.provider.on('error', (data) => this.emit('error', data));
    this.provider.on('log', (data) => this.emit('log', data));

    // Build session config
    const model = getModel(modelKey);
    const sessionConfig = new SessionConfig({
      model: modelKey,
      voice: this.config.voice,
      systemPrompt: this.config.systemPrompt || this.buildDefaultSystemPrompt(),
      tools: this.toolRegistry.toSchemas(),
      vadConfig: this.config.vadConfig || {
        startSensitivity: 'HIGH',
        endSensitivity: 'LOW',
        silenceDurationMs: 700,
        prefixPaddingMs: 300,
      },
    });

    // Start session
    await this.provider.startSession(sessionConfig);

    // Initialize audio context for playback
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: model.audio?.outputSampleRate || 24000,
      });
    }

    this.emit('started', { model: modelKey, provider: this.providerName });
  }

  /**
   * Start voice session with configured model
   */
  async start() {
    this.fallbackIndex = 0;

    try {
      await this.startWithModel(this.config.model);
    } catch (err) {
      console.error(`[Orchestrator] Primary model failed:`, err);

      if (this.config.features.enableFallback) {
        const success = await this.tryFallback();
        if (!success) {
          throw new Error('All providers failed');
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Stop voice session
   */
  async stop() {
    if (this.provider) {
      await this.provider.endSession();
      this.provider = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.audioQueue = [];
    this.isPlaying = false;
    this.status = 'idle';

    this.emit('stopped');
  }

  /**
   * Restart session (used when changing settings)
   */
  async restart() {
    const wasRunning = this.status !== 'idle';
    if (wasRunning) {
      await this.stop();
    }
    await this.start();
  }

  // ================================
  // AUDIO HANDLING
  // ================================

  /**
   * Send audio to provider
   */
  sendAudio(audioData) {
    if (this.provider) {
      this.provider.sendAudio(audioData);
    }
  }

  /**
   * Handle incoming audio from provider
   */
  handleAudio(data) {
    this.audioQueue.push(data);
    this.emit('audio_received', { chunks: this.audioQueue.length });

    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  /**
   * Play next audio chunk
   */
  playNextChunk() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const chunk = this.audioQueue.shift();

    if (!this.audioContext || this.audioContext.state === 'closed') {
      return;
    }

    const buffer = this.audioContext.createBuffer(
      1,
      chunk.data.length,
      chunk.sampleRate
    );
    buffer.getChannelData(0).set(chunk.data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.playNextChunk();
    source.start();

    this.emit('audio_playing', { remaining: this.audioQueue.length });
  }

  // ================================
  // TOOL HANDLING
  // ================================

  /**
   * Handle tool call from provider
   */
  async handleToolCall(toolCall) {
    this.emit('tool_call', toolCall);

    let result;

    // Special handling for certain tools
    switch (toolCall.name) {
      case 'get_context':
        result = this.contextProvider
          ? await this.contextProvider()
          : ToolResult.error('No context provider');
        break;

      case 'execute_action':
        result = this.actionExecutor
          ? await this.actionExecutor(toolCall.args.action, toolCall.args.params || {})
          : ToolResult.error('No action executor');
        break;

      case 'navigate':
        result = this.navigationHandler
          ? await this.navigationHandler(toolCall.args.destination, toolCall.args.section)
          : ToolResult.error('No navigation handler');
        break;

      default:
        // Use tool registry for other tools
        result = await this.toolRegistry.execute(toolCall.name, toolCall.args);
    }

    // Send response back to provider
    if (this.provider) {
      this.provider.sendToolResponse({
        id: toolCall.id,
        name: toolCall.name,
        result: result.success ? result.data : null,
        error: result.error,
      });
    }

    this.emit('tool_result', { toolCall, result });
  }

  // ================================
  // STATUS HANDLING
  // ================================

  handleStatusChange({ oldStatus, newStatus }) {
    this.status = newStatus;
    this.emit('status', { status: newStatus, previousStatus: oldStatus });
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.provider ? this.provider.getMetrics() : null;
  }

  // ================================
  // SYSTEM PROMPT
  // ================================

  /**
   * Build default system prompt
   */
  buildDefaultSystemPrompt() {
    const persona = this.config.persona === 'brief'
      ? 'You are a concise field assistant. Keep responses short. Confirm with "Got it" or "Done".'
      : 'You are a helpful teaching assistant. Explain your actions.';

    return `# UNICORN Field Assistant

${persona}

## Capabilities
1. App Navigation - projects, shades, prewire, settings
2. Shade Measuring - guide through window measurements
3. Knowledge Base - Lutron, Ubiquiti, Control4, Sonos docs
4. Web Search - general information
5. Execute Actions - interact with current view

## Rules
- ALWAYS call get_context FIRST
- Use execute_action for app interactions
- Use search_knowledge for product questions (PRIORITY)
- Use web_search for general info
- Use navigate to move around

## Measurement Order
1. Top Width -> 2. Middle Width -> 3. Bottom Width -> 4. Height -> 5. Mount Depth

For each: highlight_field first, ask for value, set_measurement, confirm, next field.

## Terminology
Windows = Shades = Blinds = Window Treatments (same thing)

${this.config.customInstructions ? `## Custom Instructions\n${this.config.customInstructions}` : ''}`;
  }

  /**
   * Set custom system prompt
   */
  setSystemPrompt(prompt) {
    this.config.systemPrompt = prompt;
    return this;
  }
}

/**
 * Create orchestrator with default Unicorn configuration
 */
export const createUnicornVoiceAgent = (overrides = {}) => {
  return new VoiceAgentOrchestrator({
    ...DEFAULT_CONFIG,
    ...overrides,
  });
};

export default VoiceAgentOrchestrator;
