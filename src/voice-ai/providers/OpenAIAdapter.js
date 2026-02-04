/**
 * OpenAIAdapter.js
 * OpenAI Realtime API adapter implementing VoiceProvider interface
 *
 * Supports:
 * - gpt-realtime (Latest, recommended)
 * - gpt-4o-realtime-preview (Deprecated)
 *
 * Features:
 * - Real-time audio streaming via WebSocket
 * - Lowest latency (232ms median)
 * - Tool/function calling
 * - Voice Activity Detection (VAD)
 * - Interruption handling
 *
 * Note: OpenAI uses 24kHz audio for both input and output
 */

import {
  VoiceProvider,
  SessionConfig,
  ToolCall,
  ToolResponse,
} from './VoiceProvider';
import {
  PROVIDERS,
  MODELS,
  VOICES,
  getProviderConfig,
  getModelsForProvider,
} from '../config/voiceConfig';

// OpenAI-specific audio settings (different from Gemini!)
const OPENAI_AUDIO_FORMAT = {
  sampleRate: 24000, // OpenAI uses 24kHz for both input and output
  channels: 1,
  bitDepth: 16,
};

/**
 * OpenAI Realtime API Adapter
 */
export class OpenAIAdapter extends VoiceProvider {
  constructor(config = {}) {
    super(config);
    this.ws = null;
    this.sessionId = null;
    this.conversationId = null;
    this.speechEndTime = null;
    this.connectionStartTime = null;
  }

  // ================================
  // INTERFACE IMPLEMENTATION
  // ================================

  getProviderName() {
    return 'OpenAI';
  }

  isConfigured() {
    const providerConfig = getProviderConfig(PROVIDERS.OPENAI);
    return !!(providerConfig?.apiKey && providerConfig.apiKey.length > 10);
  }

  getSupportedModels() {
    return getModelsForProvider(PROVIDERS.OPENAI);
  }

  getSupportedVoices() {
    return VOICES[PROVIDERS.OPENAI] || [];
  }

  /**
   * Convert unified tool definitions to OpenAI format
   */
  formatTools(tools) {
    return tools.map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    }));
  }

  /**
   * Start OpenAI Realtime session
   */
  async startSession(sessionConfig) {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const providerConfig = getProviderConfig(PROVIDERS.OPENAI);
    const modelDef = MODELS[sessionConfig.model] || MODELS['gpt-realtime'];

    this.setStatus('connecting');
    this.metrics.reset();
    this.connectionStartTime = performance.now();
    this.emit('connecting', { provider: 'openai', model: modelDef.id });

    // Build WebSocket URL with model query param
    const wsUrl = `${providerConfig.wsEndpoint}?model=${modelDef.id}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, [
          'realtime',
          `openai-insecure-api-key.${providerConfig.apiKey}`,
          'openai-beta.realtime-v1',
        ]);

        this.ws.onopen = () => {
          this.log('WebSocket connected');

          // Send session.update to configure
          const sessionUpdate = this.buildSessionUpdate(sessionConfig);
          this.ws.send(JSON.stringify(sessionUpdate));

          this.setStatus('connected');
          this.metrics.connectionTime = (performance.now() - this.connectionStartTime).toFixed(0);
          this.emit('connected', {
            provider: 'openai',
            model: modelDef.id,
            connectionTime: this.metrics.connectionTime,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.handleError('WebSocket connection error');
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          this.log(`WebSocket closed: ${event.code}`);
          this.setStatus('idle');
          this.emit('disconnected', { code: event.code, reason: event.reason });
        };

      } catch (error) {
        this.handleError(error);
        reject(error);
      }
    });
  }

  /**
   * End OpenAI session
   */
  async endSession() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
    this.conversationId = null;
    this.setStatus('idle');
    this.emit('disconnected', { reason: 'user_ended' });
  }

  /**
   * Send audio to OpenAI
   * Note: OpenAI expects 24kHz audio, you may need to resample
   */
  sendAudio(audioData) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert to Int16 PCM if Float32
    let pcmData;
    if (audioData instanceof Float32Array) {
      pcmData = this.float32ToInt16(audioData);
    } else if (audioData instanceof Int16Array) {
      pcmData = audioData;
    } else {
      this.log('Invalid audio data format', 'warn');
      return;
    }

    // Convert to base64
    const base64 = this.arrayBufferToBase64(pcmData.buffer);

    // Send in OpenAI format
    const message = {
      type: 'input_audio_buffer.append',
      audio: base64,
    };

    this.ws.send(JSON.stringify(message));
    this.metrics.audioChunksSent++;
  }

  /**
   * Send tool response to OpenAI
   */
  sendToolResponse(response) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('Cannot send tool response - WebSocket not open', 'warn');
      return;
    }

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: response.id,
        output: response.error
          ? JSON.stringify({ error: response.error })
          : JSON.stringify(response.result),
      },
    };

    this.ws.send(JSON.stringify(message));

    // Trigger response generation
    this.ws.send(JSON.stringify({ type: 'response.create' }));

    this.log(`Tool response sent: ${response.name}`);
  }

  /**
   * Commit audio buffer and trigger response
   * Call this when user stops speaking
   */
  commitAudioAndRespond() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Commit the audio buffer
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));

    // Trigger response
    this.ws.send(JSON.stringify({ type: 'response.create' }));

    this.speechEndTime = performance.now();
  }

  // ================================
  // PRIVATE METHODS
  // ================================

  /**
   * Build OpenAI session.update message
   */
  buildSessionUpdate(sessionConfig) {
    const { voice, systemPrompt, tools, vadConfig } = sessionConfig;

    const session = {
      modalities: ['text', 'audio'],
      voice: voice || 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      turn_detection: {
        type: 'server_vad',
        threshold: vadConfig?.threshold || 0.5,
        prefix_padding_ms: vadConfig?.prefixPaddingMs || 300,
        silence_duration_ms: vadConfig?.silenceDurationMs || 700,
      },
    };

    // Add instructions
    if (systemPrompt) {
      session.instructions = systemPrompt;
    }

    // Add tools
    if (tools && tools.length > 0) {
      session.tools = this.formatTools(tools);
      session.tool_choice = 'auto';
    }

    return {
      type: 'session.update',
      session,
    };
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      const eventType = data.type;

      switch (eventType) {
        case 'session.created':
          this.sessionId = data.session?.id;
          this.log(`Session created: ${this.sessionId}`);
          this.emit('setup_complete', data);
          break;

        case 'session.updated':
          this.log('Session updated');
          break;

        case 'conversation.created':
          this.conversationId = data.conversation?.id;
          break;

        case 'input_audio_buffer.speech_started':
          this.setStatus('listening');
          this.emit('speech_started');
          break;

        case 'input_audio_buffer.speech_stopped':
          this.speechEndTime = performance.now();
          this.emit('speech_stopped');
          break;

        case 'response.created':
          this.setStatus('speaking');
          this.emit('response_start', { turnCount: ++this.metrics.turnCount });
          break;

        case 'response.done':
          this.setStatus('listening');
          if (this.speechEndTime) {
            this.metrics.lastResponseLatency = (performance.now() - this.speechEndTime).toFixed(0);
            this.emit('latency', { latency: this.metrics.lastResponseLatency });
          }
          this.emit('response_end', { turnCount: this.metrics.turnCount });
          break;

        case 'response.audio.delta':
          this.handleAudioDelta(data);
          break;

        case 'response.audio_transcript.delta':
          this.emit('transcript', {
            type: 'ai',
            text: data.delta,
            final: false,
          });
          break;

        case 'response.audio_transcript.done':
          this.emit('transcript', {
            type: 'ai',
            text: data.transcript,
            final: true,
          });
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.emit('transcript', {
            type: 'user',
            text: data.transcript,
            final: true,
          });
          break;

        case 'response.function_call_arguments.done':
          this.handleFunctionCall(data);
          break;

        case 'error':
          this.handleError(data.error?.message || 'Unknown error');
          break;

        default:
          // Log unknown events for debugging
          if (eventType && !eventType.includes('.delta')) {
            this.log(`Unhandled event: ${eventType}`);
          }
      }

    } catch (error) {
      this.log(`Message parse error: ${error.message}`, 'error');
    }
  }

  /**
   * Handle audio delta from OpenAI
   */
  handleAudioDelta(data) {
    if (!data.delta) return;

    // Decode base64 to PCM16
    const audioBuffer = this.base64ToArrayBuffer(data.delta);
    const pcm16 = new Int16Array(audioBuffer);
    const float32 = this.int16ToFloat32(pcm16);

    this.metrics.audioChunksReceived++;
    this.emit('audio', {
      data: float32,
      sampleRate: OPENAI_AUDIO_FORMAT.sampleRate, // 24kHz
      chunks: this.metrics.audioChunksReceived,
    });
  }

  /**
   * Handle function call from OpenAI
   */
  handleFunctionCall(data) {
    const toolCall = new ToolCall({
      id: data.call_id,
      name: data.name,
      args: JSON.parse(data.arguments || '{}'),
    });

    this.metrics.toolCallsCount++;
    this.log(`Tool call: ${data.name}`);
    this.emit('tool_call', toolCall);
  }

  /**
   * Track when user stops speaking (for latency measurement)
   */
  markSpeechEnd() {
    this.speechEndTime = performance.now();
  }
}

export default OpenAIAdapter;
