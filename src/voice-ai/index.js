/**
 * Voice AI Module
 * Provider-agnostic voice AI infrastructure for Unicorn
 *
 * Architecture:
 * - VoiceAgentOrchestrator: Main entry point, manages providers and tools
 * - VoiceProvider: Abstract interface implemented by adapters
 * - GeminiAdapter: Google Gemini Live API
 * - OpenAIAdapter: OpenAI Realtime API
 * - ToolRegistry: Unified tool definitions
 * - voiceConfig: Configuration management
 *
 * Usage:
 * ```javascript
 * import { createUnicornVoiceAgent, PROVIDERS, MODELS } from './voice-ai';
 *
 * const agent = createUnicornVoiceAgent({
 *   model: 'gemini-3-flash',  // or 'gpt-realtime'
 *   voice: 'Puck',
 * });
 *
 * agent.setContextProvider(() => appState);
 * agent.setActionExecutor((action, params) => executeAction(action, params));
 *
 * agent.on('transcript', ({ type, text }) => console.log(type, text));
 * agent.on('audio', ({ data }) => playAudio(data));
 *
 * await agent.start();
 * // ... send audio, receive responses
 * await agent.stop();
 * ```
 *
 * Switching providers:
 * ```javascript
 * // Just change the model in config - no code changes needed!
 * agent.updateConfig({ model: 'gpt-realtime' });
 * await agent.restart();
 * ```
 */

// Main orchestrator
export {
  VoiceAgentOrchestrator,
  createUnicornVoiceAgent,
} from './VoiceAgentOrchestrator';

// Provider base class and adapters
export {
  VoiceProvider,
  SessionConfig,
  ToolCall,
  ToolResponse,
  SessionMetrics,
  AUDIO_FORMAT,
} from './providers/VoiceProvider';

export { GeminiAdapter } from './providers/GeminiAdapter';
export { OpenAIAdapter } from './providers/OpenAIAdapter';

// Tool registry
export {
  ToolRegistry,
  ToolDefinition,
  ToolParameter,
  ToolResult,
  createUnicornToolRegistry,
} from './tools/ToolRegistry';

// Configuration
export {
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
} from './config/voiceConfig';

// Default export
export { createUnicornVoiceAgent as default } from './VoiceAgentOrchestrator';
