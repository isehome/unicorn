import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const VoiceCopilotContext = createContext(null);

// iOS Safari detection
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Verbose logging flag - enable for debugging
const VERBOSE_LOGGING = true;

export const useVoiceCopilot = () => {
    const context = useContext(VoiceCopilotContext);
    if (!context) {
        throw new Error('useVoiceCopilot must be used within a VoiceCopilotProvider');
    }
    return context;
};

/**
 * VoiceCopilotProvider - Manages AI voice assistant with Gemini
 *
 * Architecture:
 * - Push-to-talk model (not always listening) to save battery
 * - WebSocket connection only when actively in a session
 * - Proper cleanup to prevent resource leaks
 * - Audio processing only when recording
 * - iOS Safari compatible (no constructor options, handles sample rate differences)
 */
export const VoiceCopilotProvider = ({ children }) => {
    // Session State
    const [status, setStatus] = useState('idle'); // idle, connecting, listening, processing, speaking, error
    const [error, setError] = useState(null);
    const [activeTools, setActiveTools] = useState(new Map());
    const [isConfigured, setIsConfigured] = useState(false);

    // Debug state - visible in UI
    const [debugLog, setDebugLog] = useState([]);
    const [audioLevel, setAudioLevel] = useState(0);
    const [lastTranscript, setLastTranscript] = useState('');
    const [wsState, setWsState] = useState('closed');
    const [audioChunksSent, setAudioChunksSent] = useState(0);
    const [audioChunksReceived, setAudioChunksReceived] = useState(0);
    const [platformInfo] = useState(() => ({
        isIOS,
        isSafari,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    }));

    // Tool execution feedback - for visual toast notifications
    const [lastToolAction, setLastToolAction] = useState(null); // { toolName, args, result, timestamp }

    // Debug logging helper
    const addLog = useCallback((message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[Copilot ${type}] ${message}`);
        setDebugLog(prev => [...prev.slice(-50), { timestamp, message, type }]);
    }, []);

    // Refs for audio and connection management
    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);
    const recordingActive = useRef(false);
    const audioLevelInterval = useRef(null);

    // Check if API key is configured on mount
    useEffect(() => {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        setIsConfigured(!!apiKey && apiKey.length > 10);
        if (!apiKey) {
            console.warn('[Copilot] REACT_APP_GEMINI_API_KEY not configured');
        }
    }, []);

    // Settings
    const getSettings = () => ({
        voice: localStorage.getItem('ai_voice') || 'Puck',
        persona: localStorage.getItem('ai_persona') || 'brief',
        instructions: localStorage.getItem('ai_custom_instructions') || '',
        // VAD sensitivity: 1-5 scale maps to Gemini's enum values
        vadStartSensitivity: parseInt(localStorage.getItem('ai_vad_start') || '3', 10),
        vadEndSensitivity: parseInt(localStorage.getItem('ai_vad_end') || '3', 10)
    });

    // Map 1-5 scale to Gemini VAD enum values
    const getVadStartEnum = (level) => {
        // 1 = very sensitive (triggers easily) = HIGH sensitivity
        // 5 = least sensitive (needs clear speech) = LOW sensitivity
        const map = {
            1: 'START_SENSITIVITY_HIGH',
            2: 'START_SENSITIVITY_MEDIUM_HIGH',
            3: 'START_SENSITIVITY_MEDIUM',
            4: 'START_SENSITIVITY_MEDIUM_LOW',
            5: 'START_SENSITIVITY_LOW'
        };
        return map[level] || 'START_SENSITIVITY_MEDIUM';
    };

    const getVadEndEnum = (level) => {
        // 1 = very quick (cuts off fast) = LOW sensitivity (ends turn quickly)
        // 5 = very patient (waits longer) = HIGH sensitivity (waits for long pauses)
        const map = {
            1: 'END_SENSITIVITY_LOW',
            2: 'END_SENSITIVITY_MEDIUM_LOW',
            3: 'END_SENSITIVITY_MEDIUM',
            4: 'END_SENSITIVITY_MEDIUM_HIGH',
            5: 'END_SENSITIVITY_HIGH'
        };
        return map[level] || 'END_SENSITIVITY_MEDIUM';
    };

    // --- TOOL REGISTRY ---
    // Note: Gemini Live API does NOT support dynamic tool updates mid-session.
    // Tools are declared in setup config only. However, we still track tools locally
    // so they can be executed when Gemini calls them. New tools registered after
    // session start will trigger a session refresh to include them.

    // Track pending session refresh for new tools
    const pendingToolRefresh = useRef(false);
    const sessionRefreshTimeout = useRef(null);
    const startSessionRef = useRef(null); // Will be set after startSession is defined

    const registerTools = useCallback((newTools) => {
        setActiveTools(prev => {
            const next = new Map(prev);
            let hasNewTools = false;

            newTools.forEach(tool => {
                // Check if this is a genuinely new tool (not just an update)
                const existingTool = prev.get(tool.name);
                if (!existingTool) {
                    hasNewTools = true;
                    console.log(`[Copilot] Registering NEW tool: ${tool.name}`);
                } else {
                    console.log(`[Copilot] Updating tool: ${tool.name}`);
                }
                next.set(tool.name, tool);
            });

            // If session is active and we have genuinely new tools, flag for refresh
            if (hasNewTools && ws.current?.readyState === WebSocket.OPEN) {
                addLog(`New tools registered during session - will refresh connection`, 'warn');
                pendingToolRefresh.current = true;

                // Debounce the refresh to allow multiple tool registrations to batch
                if (sessionRefreshTimeout.current) {
                    clearTimeout(sessionRefreshTimeout.current);
                }
                sessionRefreshTimeout.current = setTimeout(() => {
                    if (pendingToolRefresh.current && ws.current?.readyState === WebSocket.OPEN && startSessionRef.current) {
                        addLog('Refreshing session to include new tools...', 'info');
                        // Close and immediately reconnect
                        ws.current?.close();
                        // Wait for close, then reconnect
                        setTimeout(() => {
                            pendingToolRefresh.current = false;
                            setStatus('idle');
                            // Reconnect with new tools
                            setTimeout(() => {
                                if (startSessionRef.current) {
                                    startSessionRef.current();
                                }
                            }, 100);
                        }, 200);
                    }
                    pendingToolRefresh.current = false;
                }, 500); // Wait 500ms for any other tools to register
            }

            addLog(`Tools registered locally: ${newTools.map(t => t.name).join(', ')}`, 'tool');
            return next;
        });
    }, [addLog]);

    const unregisterTools = useCallback((toolNames) => {
        setActiveTools(prev => {
            const next = new Map(prev);
            toolNames.forEach(name => next.delete(name));
            return next;
        });
    }, []);

    // --- AUDIO PLAYBACK ---
    const playNextChunk = useCallback(() => {
        if (!audioContext.current) {
            if (VERBOSE_LOGGING) addLog('playNextChunk: No audioContext', 'error');
            return;
        }
        if (audioQueue.current.length === 0) {
            if (VERBOSE_LOGGING) addLog('playNextChunk: Queue empty', 'audio');
            return;
        }
        if (isPlaying.current) {
            if (VERBOSE_LOGGING) addLog('playNextChunk: Already playing', 'audio');
            return;
        }

        isPlaying.current = true;
        const audioData = audioQueue.current.shift();

        try {
            // Gemini sends audio at 24kHz, but device may use different rate (iOS uses 48kHz)
            const deviceSampleRate = audioContext.current.sampleRate;
            const contextState = audioContext.current.state;

            if (VERBOSE_LOGGING) {
                addLog(`Audio playback: contextState=${contextState}, deviceRate=${deviceSampleRate}, inputSamples=${audioData.length}`, 'audio');
            }

            // iOS Safari: AudioContext may be suspended - must resume from user gesture
            if (contextState === 'suspended') {
                addLog('AudioContext suspended - attempting resume...', 'warn');
                audioContext.current.resume().then(() => {
                    addLog('AudioContext resumed successfully', 'audio');
                    // Retry playback after resume
                    isPlaying.current = false;
                    audioQueue.current.unshift(audioData); // Put back in queue
                    playNextChunk();
                }).catch(e => {
                    addLog(`AudioContext resume failed: ${e.message}`, 'error');
                    isPlaying.current = false;
                });
                return;
            }

            const resampledData = resampleAudio(audioData, GEMINI_OUTPUT_SAMPLE_RATE, deviceSampleRate);

            if (VERBOSE_LOGGING) {
                addLog(`Resampled: ${audioData.length} → ${resampledData.length} samples (${GEMINI_OUTPUT_SAMPLE_RATE}→${deviceSampleRate}Hz)`, 'audio');
            }

            const buffer = audioContext.current.createBuffer(1, resampledData.length, deviceSampleRate);
            buffer.getChannelData(0).set(resampledData);

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.current.destination);

            source.onended = () => {
                if (VERBOSE_LOGGING) addLog(`Chunk played (${resampledData.length} samples)`, 'audio');
                isPlaying.current = false;
                if (audioQueue.current.length > 0) {
                    playNextChunk();
                } else {
                    addLog('Audio playback complete', 'audio');
                    // Done speaking, go back to idle or listening
                    setStatus(recordingActive.current ? 'listening' : 'idle');
                }
            };

            source.onerror = (e) => {
                addLog(`AudioBufferSource error: ${e}`, 'error');
                isPlaying.current = false;
            };

            setStatus('speaking');
            source.start(0);
            if (VERBOSE_LOGGING) addLog('AudioBufferSource started', 'audio');
        } catch (e) {
            addLog(`Audio playback error: ${e.message}`, 'error');
            console.error('[Copilot] Audio playback error:', e);
            isPlaying.current = false;
            // Try next chunk
            if (audioQueue.current.length > 0) {
                setTimeout(() => playNextChunk(), 100);
            }
        }
    }, [addLog]);

    // --- TOOL EXECUTION ---
    const handleToolCall = useCallback(async (toolCall) => {
        addLog(`Tool call received: ${JSON.stringify(toolCall).substring(0, 200)}`, 'tool');
        console.log('[Copilot] Tool call received:', toolCall);
        console.log('[Copilot] Active tools:', Array.from(activeTools.keys()));

        // Gemini Live sends tool calls in different formats - handle all of them
        let functionCalls = [];

        // Format 1: { functionCalls: [...] }
        if (toolCall.functionCalls) {
            functionCalls = toolCall.functionCalls;
        }
        // Format 2: { functionCall: { name, args } } (single call)
        else if (toolCall.functionCall) {
            functionCalls = [toolCall.functionCall];
        }
        // Format 3: Direct { name, args }
        else if (toolCall.name) {
            functionCalls = [toolCall];
        }
        // Format 4: Array passed directly
        else if (Array.isArray(toolCall)) {
            functionCalls = toolCall;
        }

        if (functionCalls.length === 0) {
            addLog(`No function calls found in: ${JSON.stringify(toolCall)}`, 'warn');
            return;
        }

        const responses = [];

        for (const call of functionCalls) {
            const toolName = call.name;
            const args = call.args || {};
            const callId = call.id || `call_${Date.now()}`;

            addLog(`Executing tool: ${toolName} with args: ${JSON.stringify(args)}`, 'tool');
            console.log(`[Copilot] Executing tool: ${toolName}`, args);

            const tool = activeTools.get(toolName);
            if (!tool) {
                const availableTools = Array.from(activeTools.keys()).join(', ');
                addLog(`Tool not found: ${toolName}. Available: ${availableTools}`, 'error');
                console.warn(`[Copilot] Tool not found: ${toolName}. Available tools:`, Array.from(activeTools.keys()));
                responses.push({
                    id: callId,
                    name: toolName,
                    response: { error: `Tool '${toolName}' not registered. Available: ${availableTools}` }
                });
                continue;
            }

            try {
                const result = await tool.execute(args);
                addLog(`Tool ${toolName} succeeded: ${JSON.stringify(result).substring(0, 100)}`, 'tool');
                console.log(`[Copilot] Tool ${toolName} result:`, result);

                // Set last tool action for visual feedback (toast notifications)
                setLastToolAction({
                    toolName,
                    args,
                    result,
                    success: true,
                    timestamp: Date.now()
                });

                responses.push({
                    id: callId,
                    name: toolName,
                    response: result
                });
            } catch (err) {
                addLog(`Tool ${toolName} failed: ${err.message}`, 'error');
                console.error(`[Copilot] Tool ${toolName} failed:`, err);

                // Set last tool action for visual feedback (error case)
                setLastToolAction({
                    toolName,
                    args,
                    result: { error: err.message },
                    success: false,
                    timestamp: Date.now()
                });

                responses.push({
                    id: callId,
                    name: toolName,
                    response: { error: err.message }
                });
            }
        }

        // Send responses back to Gemini
        // Gemini Live API expects camelCase format
        // Docs: https://ai.google.dev/api/live
        if (ws.current?.readyState === WebSocket.OPEN && responses.length > 0) {
            const toolResponseMsg = {
                toolResponse: {
                    functionResponses: responses.map(r => ({
                        id: r.id,
                        name: r.name,
                        response: r.response
                    }))
                }
            };
            addLog(`Sending tool response: ${JSON.stringify(toolResponseMsg).substring(0, 200)}`, 'tool');
            console.log('[Copilot] Sending tool response:', toolResponseMsg);
            ws.current.send(JSON.stringify(toolResponseMsg));
        }
    }, [activeTools, addLog]);

    // --- AUDIO HELPERS ---
    const floatTo16BitPCM = (input) => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    };

    const base64ToFloat32 = (base64) => {
        const binary = atob(base64);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        const int16 = new Int16Array(buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        return float32;
    };

    // Linear interpolation resampling (simple but effective for voice)
    const resampleAudio = (inputData, inputSampleRate, outputSampleRate) => {
        if (inputSampleRate === outputSampleRate) {
            return inputData;
        }
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
            const t = srcIndex - srcIndexFloor;
            output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
        }
        return output;
    };

    // Downsample from device rate to Gemini's expected 16kHz
    const downsampleForGemini = (inputData, inputSampleRate) => {
        return resampleAudio(inputData, inputSampleRate, GEMINI_INPUT_SAMPLE_RATE);
    };

    // --- CLEANUP ---
    const cleanup = useCallback(() => {
        recordingActive.current = false;

        // Stop media stream
        if (mediaStream.current) {
            mediaStream.current.getTracks().forEach(track => track.stop());
            mediaStream.current = null;
        }

        // Disconnect audio nodes
        if (processorNode.current) {
            processorNode.current.disconnect();
            processorNode.current = null;
        }
        if (sourceNode.current) {
            sourceNode.current.disconnect();
            sourceNode.current = null;
        }

        // Close audio context (but keep it if we might reconnect)
        // Don't close - let it be reused

        // Close WebSocket
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        audioQueue.current = [];
        isPlaying.current = false;
    }, []);

    // --- START SESSION ---
    const startSession = useCallback(async () => {
        if (status !== 'idle' && status !== 'error') {
            addLog(`Session already active, status: ${status}`);
            return;
        }

        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            addLog('No API key configured', 'error');
            setError('Gemini API key not configured. Add REACT_APP_GEMINI_API_KEY to environment.');
            setStatus('error');
            return;
        }

        addLog(`Starting session... API key length: ${apiKey.length}`);

        try {
            setStatus('connecting');
            setError(null);
            setAudioChunksSent(0);
            setAudioChunksReceived(0);

            // Initialize audio context (must be from user gesture)
            // Note: iOS Safari's webkitAudioContext doesn't accept constructor options
            if (!audioContext.current || audioContext.current.state === 'closed') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContext.current = new AudioContextClass();
                addLog(`AudioContext created: ${audioContext.current.sampleRate}Hz${isIOS ? ' (iOS Safari)' : ''}`);
            }
            if (audioContext.current.state === 'suspended') {
                await audioContext.current.resume();
                addLog('AudioContext resumed from suspended state');
            }

            // Get microphone access
            // Note: Don't specify sampleRate - iOS ignores it and uses native rate (48kHz)
            addLog('Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            mediaStream.current = stream;
            const audioTrack = stream.getAudioTracks()[0];
            addLog(`Mic access granted: ${audioTrack.label || 'default mic'}`);

            // Create WebSocket connection to Gemini
            // Using v1beta as per official docs: https://ai.google.dev/api/live
            const uri = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
            const socket = new WebSocket(uri);
            ws.current = socket;

            socket.onopen = () => {
                addLog('WebSocket connected to Gemini');
                setWsState('open');

                // Send initial configuration
                const settings = getSettings();
                const toolDeclarations = Array.from(activeTools.values()).map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }));

                // Log all registered tools for debugging
                addLog(`Voice: ${settings.voice}, Persona: ${settings.persona}, Tools: ${toolDeclarations.length}`);
                if (toolDeclarations.length > 0) {
                    addLog(`Registered tools: ${toolDeclarations.map(t => t.name).join(', ')}`, 'tool');
                } else {
                    addLog('WARNING: No tools registered! Voice commands won\'t work.', 'warn');
                }

                // Get user's model preference (default to latest native audio model)
                const selectedModel = localStorage.getItem('ai_model') || 'gemini-2.5-flash-native-audio-preview-09-2025';

                // Build config using camelCase as per Gemini API spec
                // Docs: https://ai.google.dev/api/live
                const config = {
                    setup: {
                        model: `models/${selectedModel}`,
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: settings.voice }
                                }
                            }
                        },
                        // VAD config - user-configurable sensitivity
                        // Docs: https://ai.google.dev/gemini-api/docs/live-guide
                        realtimeInputConfig: {
                            automaticActivityDetection: {
                                disabled: false,
                                // User-configurable sensitivity (1-5 scale mapped to Gemini enums)
                                startOfSpeechSensitivity: getVadStartEnum(settings.vadStartSensitivity),
                                endOfSpeechSensitivity: getVadEndEnum(settings.vadEndSensitivity),
                                // How long to wait before committing speech start (ms)
                                prefixPaddingMs: 100,
                                // How long of silence before end of speech (ms) - scale with patience
                                silenceDurationMs: 300 + (settings.vadEndSensitivity * 100) // 400-800ms based on patience
                            }
                        },
                        systemInstruction: {
                            parts: [{
                                text: `You are a friendly voice assistant helping field technicians measure windows for motorized shades.

PERSONALITY:
${settings.persona === 'brief' ? '- Be concise and direct. Short confirmations like "Got it" or "Done".' : '- Be helpful and explain what you\'re doing.'}
- Speak naturally like a helpful coworker, never read out technical names
- NEVER say tool names, function names, or parameters out loud
- Instead of "calling navigate_to_project", just say "Taking you there now"
- Instead of "using set_measurement with field top width", say "Recording 52 inches for the top"
${settings.instructions ? `- User preferences: ${settings.instructions}` : ''}

SHADE MEASURING WORKFLOW:
When helping measure a window shade, guide the technician through these 6 measurements:
1. WIDTH measurements (measure the opening width at 3 points):
   - Top width
   - Middle width
   - Bottom width
2. HEIGHT measurements (measure the opening height at 3 points):
   - Left side height
   - Center height
   - Right side height

Always confirm each measurement back verbally: "Got it, 52 and a quarter inches for the top width."
After recording a measurement, prompt for the next one: "Now give me the middle width."
When all 6 are done, summarize and offer to save or move to the next shade.

SPEECH RULES:
- Say numbers naturally: "52 and a quarter" not "52.25"
- Use "inches" not symbols
- Keep confirmations short: "Got it" "Done" "Saved"
- If you hear a number, confirm it back before recording
- If unclear, ask them to repeat

ON SESSION START:
Greet briefly and state what page they're on. Example: "Hey! You're in the shades section. Which window should we measure?"

AVAILABLE ACTIONS:
- Navigate between projects and sections
- Open a specific shade for measuring
- Record measurements into form fields
- Save and move to next shade`
                            }]
                        }
                    }
                };

                // Add tools if any are registered (camelCase: functionDeclarations)
                if (toolDeclarations.length > 0) {
                    config.setup.tools = [{ functionDeclarations: toolDeclarations }];
                }

                socket.send(JSON.stringify(config));
                addLog('Sent setup config to Gemini');

                // Start audio processing
                startAudioProcessing();
                setStatus('listening');
            };

            let receivedChunks = 0;
            socket.onmessage = async (event) => {
                // Handle Blob data (Gemini can send binary audio responses)
                if (event.data instanceof Blob) {
                    try {
                        const text = await event.data.text();
                        if (VERBOSE_LOGGING) {
                            addLog(`Received blob (${event.data.size} bytes), parsing as text...`, 'audio');
                        }
                        // Try to parse as JSON
                        const data = JSON.parse(text);
                        handleGeminiMessage(data);
                    } catch (e) {
                        addLog(`Blob parse error: ${e.message}`, 'error');
                    }
                    return;
                }

                try {
                    const data = JSON.parse(event.data);
                    handleGeminiMessage(data);
                } catch (e) {
                    addLog(`Message parse error: ${e.message}`, 'error');
                }
            };

            // Extracted message handler for reuse with both blob and text
            const handleGeminiMessage = (data) => {
                try {
                    // Log ALL incoming messages for debugging (truncated)
                    if (VERBOSE_LOGGING) {
                        const keys = Object.keys(data);
                        addLog(`Gemini message keys: [${keys.join(', ')}]`, 'debug');
                    }

                    // Log setup complete
                    if (data.setupComplete) {
                        addLog('Gemini setup complete - ready for audio');
                    }

                    // Handle text transcripts if present
                    if (data.serverContent?.modelTurn?.parts) {
                        for (const part of data.serverContent.modelTurn.parts) {
                            // Text response
                            if (part.text) {
                                addLog(`Gemini text: "${part.text.substring(0, 100)}..."`, 'response');
                                setLastTranscript(prev => prev + (prev ? '\n' : '') + part.text);
                            }
                            // Audio response
                            if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
                                receivedChunks++;
                                setAudioChunksReceived(receivedChunks);
                                const pcmData = base64ToFloat32(part.inlineData.data);
                                audioQueue.current.push(pcmData);
                                if (receivedChunks === 1) {
                                    addLog('Receiving audio response from Gemini');
                                }
                                playNextChunk();
                            }
                        }
                    }

                    // Handle turn complete
                    if (data.serverContent?.turnComplete) {
                        addLog(`Turn complete - received ${receivedChunks} audio chunks`);
                        receivedChunks = 0;
                    }

                    // Handle tool calls - Gemini Live API uses multiple formats
                    // Format 1: data.toolCall (direct)
                    if (data.toolCall) {
                        addLog(`Tool call (direct): ${JSON.stringify(data.toolCall).substring(0, 200)}`, 'tool');
                        handleToolCall(data.toolCall);
                    }
                    // Format 2: data.serverContent.modelTurn.parts[].functionCall
                    if (data.serverContent?.modelTurn?.parts) {
                        for (const part of data.serverContent.modelTurn.parts) {
                            if (part.functionCall) {
                                addLog(`Tool call (functionCall in parts): ${JSON.stringify(part.functionCall).substring(0, 200)}`, 'tool');
                                handleToolCall(part.functionCall);
                            }
                        }
                    }
                    // Format 3: data.toolCallCancellation (tool was cancelled)
                    if (data.toolCallCancellation) {
                        addLog(`Tool call cancelled: ${JSON.stringify(data.toolCallCancellation)}`, 'warn');
                    }
                } catch (e) {
                    addLog(`Message parse error: ${e.message}`, 'error');
                    console.error('[Copilot] Message parse error:', e, 'Data:', data);
                }
            };

            socket.onclose = (e) => {
                addLog(`WebSocket closed: code=${e.code}, reason=${e.reason || 'none'}`);
                setWsState('closed');
                cleanup();
                setStatus('idle');
            };

            socket.onerror = (e) => {
                addLog(`WebSocket error: ${e.message || 'unknown'}`, 'error');
                setWsState('error');
                setError('Connection failed. Check your API key and internet connection.');
                cleanup();
                setStatus('error');
            };

        } catch (e) {
            addLog(`Failed to start session: ${e.message}`, 'error');
            setError(e.message || 'Failed to start voice session');
            cleanup();
            setStatus('error');
        }
    }, [status, activeTools, cleanup, handleToolCall, playNextChunk, addLog]);

    // Keep ref updated for use in registerTools
    useEffect(() => {
        startSessionRef.current = startSession;
    }, [startSession]);

    // --- AUDIO PROCESSING ---
    const startAudioProcessing = useCallback(() => {
        if (!audioContext.current || !mediaStream.current) {
            addLog('Cannot start audio: missing context or stream', 'error');
            return;
        }

        recordingActive.current = true;
        sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);

        // Get device's actual sample rate (iOS uses 48kHz, desktop may use 44.1kHz or 48kHz)
        const deviceSampleRate = audioContext.current.sampleRate;
        addLog(`Device sample rate: ${deviceSampleRate}Hz, downsampling to ${GEMINI_INPUT_SAMPLE_RATE}Hz`);

        // Use ScriptProcessor (deprecated but more iOS compatible than AudioWorklet)
        const processor = audioContext.current.createScriptProcessor(4096, 1, 1);
        processorNode.current = processor;

        let chunkCount = 0;
        processor.onaudioprocess = (e) => {
            if (!recordingActive.current || ws.current?.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);

            // Calculate audio level (RMS) for debug display
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            const level = Math.min(100, Math.round(rms * 500)); // Scale to 0-100
            setAudioLevel(level);

            // Downsample to 16kHz for Gemini (device may be 48kHz on iOS)
            const downsampledData = downsampleForGemini(inputData, deviceSampleRate);
            const pcmData = floatTo16BitPCM(downsampledData);

            // Convert to base64
            const bytes = new Uint8Array(pcmData.buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Audio = btoa(binary);

            // Send to Gemini
            ws.current.send(JSON.stringify({
                realtime_input: {
                    media_chunks: [{
                        mime_type: "audio/pcm",
                        data: base64Audio
                    }]
                }
            }));

            chunkCount++;
            setAudioChunksSent(chunkCount);

            // Log every 50 chunks (~3 seconds of audio)
            if (chunkCount % 50 === 0) {
                addLog(`Sent ${chunkCount} audio chunks, level: ${level}%`);
            }
        };

        sourceNode.current.connect(processor);
        processor.connect(audioContext.current.destination);
        addLog('Audio processing started');
    }, [addLog]);

    // --- END SESSION ---
    const endSession = useCallback(() => {
        console.log('[Copilot] Ending session');
        cleanup();
        setStatus('idle');
        setError(null);
    }, [cleanup]);

    // --- TOGGLE (for simple UI) ---
    const toggle = useCallback(() => {
        if (status === 'idle' || status === 'error') {
            startSession();
        } else {
            endSession();
        }
    }, [status, startSession, endSession]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    // Clear debug log
    const clearDebugLog = useCallback(() => {
        setDebugLog([]);
        setAudioChunksSent(0);
        setAudioChunksReceived(0);
    }, []);

    // Test audio output - plays a simple tone to verify audio works
    const testAudioOutput = useCallback(async () => {
        addLog('Testing audio output...', 'info');
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const testCtx = new AudioContextClass();
            addLog(`Test AudioContext created: state=${testCtx.state}, sampleRate=${testCtx.sampleRate}`, 'audio');

            // Resume if suspended (iOS requirement)
            if (testCtx.state === 'suspended') {
                addLog('Test context suspended, resuming...', 'warn');
                await testCtx.resume();
                addLog(`Resumed: state=${testCtx.state}`, 'audio');
            }

            // Create a simple 440Hz tone for 0.5 seconds
            const duration = 0.5;
            const frequency = 440;
            const sampleRate = testCtx.sampleRate;
            const numSamples = Math.floor(duration * sampleRate);

            const buffer = testCtx.createBuffer(1, numSamples, sampleRate);
            const channelData = buffer.getChannelData(0);

            for (let i = 0; i < numSamples; i++) {
                // Sine wave with fade in/out to avoid clicks
                const t = i / sampleRate;
                const envelope = Math.min(1, t * 20) * Math.min(1, (duration - t) * 20);
                channelData[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope;
            }

            const source = testCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(testCtx.destination);

            source.onended = () => {
                addLog('Test tone completed successfully!', 'info');
                testCtx.close();
            };

            source.start(0);
            addLog(`Playing ${frequency}Hz test tone for ${duration}s...`, 'audio');
            return true;
        } catch (e) {
            addLog(`Test audio failed: ${e.message}`, 'error');
            console.error('[Copilot] Test audio error:', e);
            return false;
        }
    }, [addLog]);

    // Test microphone input
    const testMicrophoneInput = useCallback(async () => {
        addLog('Testing microphone input...', 'info');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();
            addLog(`Mic access granted: ${track.label}`, 'info');
            addLog(`Mic settings: sampleRate=${settings.sampleRate || 'default'}, channelCount=${settings.channelCount}`, 'audio');

            // Create context to measure audio level
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const testCtx = new AudioContextClass();

            if (testCtx.state === 'suspended') {
                await testCtx.resume();
            }

            addLog(`Test context: sampleRate=${testCtx.sampleRate}Hz`, 'audio');

            const source = testCtx.createMediaStreamSource(stream);
            const analyser = testCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            // Measure for 2 seconds
            let maxLevel = 0;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const measureInterval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                if (avg > maxLevel) maxLevel = avg;
            }, 50);

            setTimeout(() => {
                clearInterval(measureInterval);
                stream.getTracks().forEach(t => t.stop());
                testCtx.close();
                addLog(`Mic test complete. Max level: ${Math.round(maxLevel)} (speak louder if < 10)`, maxLevel > 10 ? 'info' : 'warn');
            }, 2000);

            return true;
        } catch (e) {
            addLog(`Mic test failed: ${e.message}`, 'error');
            console.error('[Copilot] Mic test error:', e);
            return false;
        }
    }, [addLog]);

    return (
        <VoiceCopilotContext.Provider value={{
            // State
            status,
            error,
            isConfigured,
            activeTools,

            // Debug state
            debugLog,
            audioLevel,
            lastTranscript,
            wsState,
            audioChunksSent,
            audioChunksReceived,
            platformInfo,
            clearDebugLog,

            // Tool execution feedback (for visual toasts)
            lastToolAction,

            // Actions
            startSession,
            endSession,
            toggle,
            registerTools,
            unregisterTools,

            // Test functions
            testAudioOutput,
            testMicrophoneInput,

            // Legacy aliases
            connect: startSession,
            disconnect: endSession
        }}>
            {children}
        </VoiceCopilotContext.Provider>
    );
};
