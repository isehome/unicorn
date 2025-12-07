import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const VoiceCopilotContext = createContext(null);

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
 */
export const VoiceCopilotProvider = ({ children }) => {
    // Session State
    const [status, setStatus] = useState('idle'); // idle, connecting, listening, processing, speaking, error
    const [error, setError] = useState(null);
    const [activeTools, setActiveTools] = useState(new Map());
    const [isConfigured, setIsConfigured] = useState(false);

    // Refs for audio and connection management
    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);
    const recordingActive = useRef(false);

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
            const buffer = audioContext.current.createBuffer(1, audioData.length, 24000);
            buffer.getChannelData(0).set(audioData);

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
            console.log('[Copilot] Session already active, status:', status);
            return;
        }

        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            setError('Gemini API key not configured. Add REACT_APP_GEMINI_API_KEY to environment.');
            setStatus('error');
            return;
        }

        try {
            setStatus('connecting');
            setError(null);

            // Initialize audio context (must be from user gesture)
            if (!audioContext.current || audioContext.current.state === 'closed') {
                audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            }
            if (audioContext.current.state === 'suspended') {
                await audioContext.current.resume();
            }

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            mediaStream.current = stream;

            // Create WebSocket connection to Gemini
            const uri = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
            const socket = new WebSocket(uri);
            ws.current = socket;

            socket.onopen = () => {
                console.log('[Copilot] Connected to Gemini');

                // Send initial configuration
                const settings = getSettings();
                const toolDeclarations = Array.from(activeTools.values()).map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }));

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
                                       When asked to record measurements, use the available tools to set values.`
                            }]
                        }
                    }
                };

                // Add tools if any are registered
                if (toolDeclarations.length > 0) {
                    config.setup.tools = [{ function_declarations: toolDeclarations }];
                }

                socket.send(JSON.stringify(config));

                // Start audio processing
                startAudioProcessing();
                setStatus('listening');
            };

            socket.onmessage = (event) => {
                if (event.data instanceof Blob) return;

                try {
                    const data = JSON.parse(event.data);

                    // Handle audio responses
                    if (data.serverContent?.modelTurn?.parts) {
                        for (const part of data.serverContent.modelTurn.parts) {
                            if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
                                const pcmData = base64ToFloat32(part.inlineData.data);
                                audioQueue.current.push(pcmData);
                                playNextChunk();
                            }
                        }
                    }

                    // Handle tool calls
                    if (data.toolCall) {
                        handleToolCall(data.toolCall);
                    }
                } catch (e) {
                    console.error('[Copilot] Message parse error:', e);
                }
            };

            socket.onclose = () => {
                console.log('[Copilot] Disconnected');
                cleanup();
                setStatus('idle');
            };

            socket.onerror = (e) => {
                console.error('[Copilot] WebSocket error:', e);
                setError('Connection failed. Check your API key and internet connection.');
                cleanup();
                setStatus('error');
            };

        } catch (e) {
            console.error('[Copilot] Failed to start session:', e);
            setError(e.message || 'Failed to start voice session');
            cleanup();
            setStatus('error');
        }
    }, [status, activeTools, cleanup, handleToolCall, playNextChunk]);

    // --- AUDIO PROCESSING ---
    const startAudioProcessing = useCallback(() => {
        if (!audioContext.current || !mediaStream.current) return;

        recordingActive.current = true;
        sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);

        // Use ScriptProcessor (deprecated but more compatible)
        // In production, consider AudioWorklet for better performance
        const processor = audioContext.current.createScriptProcessor(4096, 1, 1);
        processorNode.current = processor;

        processor.onaudioprocess = (e) => {
            if (!recordingActive.current || ws.current?.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = floatTo16BitPCM(inputData);

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
        };

        sourceNode.current.connect(processor);
        processor.connect(audioContext.current.destination);
    }, []);

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

    return (
        <VoiceCopilotContext.Provider value={{
            // State
            status,
            error,
            isConfigured,
            activeTools,

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
