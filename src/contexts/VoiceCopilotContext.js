import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const VoiceCopilotContext = createContext(null);

// iOS Safari detection
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

// Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

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
        instructions: localStorage.getItem('ai_custom_instructions') || ''
    });

    // --- TOOL REGISTRY ---
    const registerTools = useCallback((newTools) => {
        setActiveTools(prev => {
            const next = new Map(prev);
            newTools.forEach(tool => {
                console.log(`[Copilot] Registering tool: ${tool.name}`);
                next.set(tool.name, tool);
            });
            return next;
        });
    }, []);

    const unregisterTools = useCallback((toolNames) => {
        setActiveTools(prev => {
            const next = new Map(prev);
            toolNames.forEach(name => next.delete(name));
            return next;
        });
    }, []);

    // --- AUDIO PLAYBACK ---
    const playNextChunk = useCallback(() => {
        if (!audioContext.current || audioQueue.current.length === 0 || isPlaying.current) return;

        isPlaying.current = true;
        const audioData = audioQueue.current.shift();

        try {
            // Gemini sends audio at 24kHz, but device may use different rate (iOS uses 48kHz)
            const deviceSampleRate = audioContext.current.sampleRate;
            const resampledData = resampleAudio(audioData, GEMINI_OUTPUT_SAMPLE_RATE, deviceSampleRate);

            const buffer = audioContext.current.createBuffer(1, resampledData.length, deviceSampleRate);
            buffer.getChannelData(0).set(resampledData);

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.current.destination);

            source.onended = () => {
                isPlaying.current = false;
                if (audioQueue.current.length > 0) {
                    playNextChunk();
                } else {
                    // Done speaking, go back to idle or listening
                    setStatus(recordingActive.current ? 'listening' : 'idle');
                }
            };

            setStatus('speaking');
            source.start();
        } catch (e) {
            console.error('[Copilot] Audio playback error:', e);
            isPlaying.current = false;
        }
    }, []);

    // --- TOOL EXECUTION ---
    const handleToolCall = useCallback(async (toolCall) => {
        console.log('[Copilot] Tool call received:', toolCall);

        const functionCalls = toolCall.functionCalls || [toolCall];
        const responses = [];

        for (const call of functionCalls) {
            const toolName = call.name || call.functionCall?.name;
            const args = call.args || call.functionCall?.args || {};

            console.log(`[Copilot] Executing tool: ${toolName}`, args);

            const tool = activeTools.get(toolName);
            if (!tool) {
                console.warn(`[Copilot] Tool not found: ${toolName}`);
                responses.push({
                    id: call.id,
                    name: toolName,
                    response: { error: `Tool '${toolName}' not registered` }
                });
                continue;
            }

            try {
                const result = await tool.execute(args);
                console.log(`[Copilot] Tool ${toolName} result:`, result);
                responses.push({
                    id: call.id,
                    name: toolName,
                    response: result
                });
            } catch (err) {
                console.error(`[Copilot] Tool ${toolName} failed:`, err);
                responses.push({
                    id: call.id,
                    name: toolName,
                    response: { error: err.message }
                });
            }
        }

        // Send responses back to Gemini
        if (ws.current?.readyState === WebSocket.OPEN && responses.length > 0) {
            ws.current.send(JSON.stringify({
                tool_response: {
                    function_responses: responses.map(r => ({
                        id: r.id,
                        name: r.name,
                        response: r.response
                    }))
                }
            }));
        }
    }, [activeTools]);

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
            const uri = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
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

                addLog(`Voice: ${settings.voice}, Persona: ${settings.persona}, Tools: ${toolDeclarations.length}`);

                const config = {
                    setup: {
                        model: "models/gemini-2.0-flash-exp",
                        generation_config: {
                            response_modalities: ["AUDIO"],
                            speech_config: {
                                voice_config: { prebuilt_voice_config: { voice_name: settings.voice } }
                            }
                        },
                        system_instruction: {
                            parts: [{
                                text: `You are a helpful field technician assistant for a smart home installation company.
                                       Persona: ${settings.persona === 'brief' ? 'Be concise and direct. Give short answers.' : 'Be helpful and explain your reasoning.'}
                                       ${settings.instructions ? `Additional instructions: ${settings.instructions}` : ''}
                                       When asked to record measurements, use the available tools to set values.
                                       IMPORTANT: When the session starts, greet the user briefly so they know you're connected.`
                            }]
                        }
                    }
                };

                // Add tools if any are registered
                if (toolDeclarations.length > 0) {
                    config.setup.tools = [{ function_declarations: toolDeclarations }];
                }

                socket.send(JSON.stringify(config));
                addLog('Sent setup config to Gemini');

                // Start audio processing
                startAudioProcessing();
                setStatus('listening');
            };

            let receivedChunks = 0;
            socket.onmessage = (event) => {
                if (event.data instanceof Blob) {
                    addLog('Received blob data (unexpected)');
                    return;
                }

                try {
                    const data = JSON.parse(event.data);

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
                                setLastTranscript(part.text);
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

                    // Handle tool calls
                    if (data.toolCall) {
                        addLog(`Tool call: ${JSON.stringify(data.toolCall)}`, 'tool');
                        handleToolCall(data.toolCall);
                    }
                } catch (e) {
                    addLog(`Message parse error: ${e.message}`, 'error');
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
            clearDebugLog,

            // Actions
            startSession,
            endSession,
            toggle,
            registerTools,
            unregisterTools,

            // Legacy aliases
            connect: startSession,
            disconnect: endSession
        }}>
            {children}
        </VoiceCopilotContext.Provider>
    );
};
