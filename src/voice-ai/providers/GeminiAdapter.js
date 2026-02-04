/**
 * GeminiAdapter.js
 * Google Gemini Live API adapter implementing VoiceProvider interface
 *
 * Supports:
 * - Gemini 3 Flash (Preview)
 * - Gemini 2.5 Flash Native Audio
 * - Gemini 2.0 Flash Live (Deprecated)
 *
 * Features:
 * - Real-time audio streaming via WebSocket
 * - Native audio processing
 * - Tool/function calling
 * - Voice Activity Detection (VAD)
 * - Interruption handling
 */

import {
  VoiceProvider,
  SessionConfig,
  ToolCall,
  ToolResponse,
  AUDIO_FORMAT,
} from './VoiceProvider';
import {
  PROVIDERS,
  MODELS,
  VOICES,
  getProviderConfig,
  getModelsForProvider,
} from '../config/voiceConfig';

// Gemini-specific constants
const GEMINI_API_VERSION = 'v1beta';

// VAD sensitivity mappings (Gemini only supports HIGH and LOW, not MEDIUM)
const VAD_SENSITIVITY_MAP = {
  HIGH: 1,
  LOW: 2,
};

const getStartSensitivity = (value) =>
  value === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW';

const getEndSensitivity = (value) =>
  value === 1 ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW';

/**
 * Gemini Live API Adapter
 */
export class GeminiAdapter extends VoiceProvider {
  constructor(config = {}) {
    super(config);
    this.ws = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.speechEndTime = null;
    this.connectionStartTime = null;
  }

  // ================================
  // INTERFACE IMPLEMENTATION
  // ================================

  getProviderName() {
    return 'Gemini';
  }

  isConfigured() {
    const providerConfig = getProviderConfig(PROVIDERS.GEMINI);
    return !!(providerConfig?.apiKey && providerConfig.apiKey.length > 10);
  }

  getSupportedModels() {
    return getModelsForProvider(PROVIDERS.GEMINI);
  }

  getSupportedVoices() {
    return VOICES[PROVIDERS.GEMINI] || [];
  }

  /**
   * Convert unified tool definitions to Gemini format
   */
  formatTools(tools) {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      })),
    }];
  }

  /**
   * Start Gemini Live session
   */
  async startSession(sessionConfig) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key not configured');
    }

    const providerConfig = getProviderConfig(PROVIDERS.GEMINI);
    const modelDef = MODELS[sessionConfig.model] || MODELS['gemini-2.5-flash-native'];

    this.setStatus('connecting');
    this.metrics.reset();
    this.connectionStartTime = performance.now();
    this.emit('connecting', { provider: 'gemini', model: modelDef.id });

    // Build WebSocket URL
    const wsUrl = `${providerConfig.wsEndpoint}?key=${providerConfig.apiKey}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.log('WebSocket connected, sending setup...');

          // Build setup config
          const setupConfig = this.buildSetupConfig(sessionConfig, modelDef);
          this.ws.send(JSON.stringify(setupConfig));

          this.setStatus('connected');
          this.metrics.connectionTime = (performance.now() - this.connectionStartTime).toFixed(0);
          this.emit('connected', {
            provider: 'gemini',
            model: modelDef.id,
            connectionTime: this.metrics.connectionTime,
          });

          resolve();
        };

        this.ws.onmessage = async (event) => {
          await this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.handleError('WebSocket connection error');
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          this.log(`WebSocket closed: ${event.code} ${event.reason || ''}`);
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
   * End Gemini session
   */
  async endSession() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
    this.setStatus('idle');
    this.emit('disconnected', { reason: 'user_ended' });
  }

  /**
   * Send audio to Gemini
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

    // Send in Gemini format
    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        }],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.metrics.audioChunksSent++;
    this.emit('audio_sent', { chunks: this.metrics.audioChunksSent });
  }

  /**
   * Send tool response to Gemini
   */
  sendToolResponse(response) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('Cannot send tool response - WebSocket not open', 'warn');
      return;
    }

    const message = {
      toolResponse: {
        functionResponses: [{
          id: response.id,
          name: response.name,
          response: response.error ? { error: response.error } : response.result,
        }],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.log(`Tool response sent: ${response.name}`);
  }

  // ================================
  // PRIVATE METHODS
  // ================================

  /**
   * Build Gemini setup configuration
   */
  buildSetupConfig(sessionConfig, modelDef) {
    const { voice, systemPrompt, tools, vadConfig } = sessionConfig;

    // Get VAD settings with defaults
    const vadStart = vadConfig?.startSensitivity || 'HIGH';
    const vadEnd = vadConfig?.endSensitivity || 'LOW';
    const silenceDurationMs = vadConfig?.silenceDurationMs || 700;
    const prefixPaddingMs = vadConfig?.prefixPaddingMs || 300;

    const config = {
      setup: {
        model: `models/${modelDef.id}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice || 'Puck',
              },
            },
          },
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: getStartSensitivity(VAD_SENSITIVITY_MAP[vadStart] || 1),
            endOfSpeechSensitivity: getEndSensitivity(VAD_SENSITIVITY_MAP[vadEnd] || 2),
            prefixPaddingMs,
            silenceDurationMs,
          },
        },
      },
    };

    // Add system instruction if provided
    if (systemPrompt) {
      config.setup.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
      config.setup.tools = this.formatTools(tools);
    }

    return config;
  }

  /**
   * Handle incoming WebSocket message
   */
  async handleMessage(event) {
    try {
      // Parse message (Gemini may send as Blob)
      let messageData = event.data;
      if (event.data instanceof Blob) {
        messageData = await event.data.text();
      }

      const data = JSON.parse(messageData);

      // Handle setup complete
      if (data.setupComplete) {
        this.log('Setup complete');
        this.emit('setup_complete', data);
        return;
      }

      // Handle tool calls
      if (data.toolCall) {
        this.handleToolCalls(data.toolCall);
        return;
      }

      // Handle server content
      if (data.serverContent) {
        this.handleServerContent(data.serverContent);
        return;
      }

    } catch (error) {
      this.log(`Message parse error: ${error.message}`, 'error');
    }
  }

  /**
   * Handle tool calls from Gemini
   */
  handleToolCalls(toolCallData) {
    const functionCalls = toolCallData.functionCalls || [];

    for (const fc of functionCalls) {
      const toolCall = new ToolCall({
        id: fc.id,
        name: fc.name,
        args: fc.args || {},
      });

      this.metrics.toolCallsCount++;
      this.log(`Tool call: ${fc.name}`);
      this.emit('tool_call', toolCall);
    }
  }

  /**
   * Handle server content (audio, transcripts, turn status)
   */
  handleServerContent(serverContent) {
    // Model turn started (AI is responding)
    if (serverContent.turnComplete === false) {
      const now = performance.now();
      if (this.speechEndTime) {
        this.metrics.lastResponseLatency = (now - this.speechEndTime).toFixed(0);
        this.emit('latency', { latency: this.metrics.lastResponseLatency });
      }
      this.metrics.turnCount++;
      this.setStatus('speaking');
      this.emit('response_start', { turnCount: this.metrics.turnCount });
    }

    // Model turn complete
    if (serverContent.turnComplete === true) {
      this.setStatus('listening');
      this.emit('response_end', { turnCount: this.metrics.turnCount });
    }

    // Interrupted
    if (serverContent.interrupted) {
      this.emit('interrupted');
    }

    // Handle audio data
    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        // Audio output
        if (part.inlineData?.mimeType?.includes('audio')) {
          this.handleAudioOutput(part.inlineData.data);
        }

        // Text response
        if (part.text) {
          this.emit('response', { text: part.text });
        }

        // Function call in model turn
        if (part.functionCall) {
          const toolCall = new ToolCall({
            id: part.functionCall.id || `func_${Date.now()}`,
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          });
          this.metrics.toolCallsCount++;
          this.emit('tool_call', toolCall);
        }
      }
    }

    // Input transcription (what user said)
    if (serverContent.inputTranscription?.text) {
      this.emit('transcript', {
        type: 'user',
        text: serverContent.inputTranscription.text,
        final: true,
      });
    }

    // Output transcription (what AI said)
    if (serverContent.outputTranscription?.text) {
      this.emit('transcript', {
        type: 'ai',
        text: serverContent.outputTranscription.text,
        final: true,
      });
    }
  }

  /**
   * Handle audio output from Gemini
   */
  handleAudioOutput(base64Data) {
    // Decode base64 to PCM16
    const audioBuffer = this.base64ToArrayBuffer(base64Data);
    const pcm16 = new Int16Array(audioBuffer);
    const float32 = this.int16ToFloat32(pcm16);

    this.metrics.audioChunksReceived++;
    this.emit('audio', {
      data: float32,
      sampleRate: AUDIO_FORMAT.output.sampleRate,
      chunks: this.metrics.audioChunksReceived,
    });
  }

  /**
   * Track when user stops speaking (for latency measurement)
   */
  markSpeechEnd() {
    this.speechEndTime = performance.now();
  }
}

export default GeminiAdapter;
