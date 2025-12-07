import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const VoiceCopilotContext = createContext(null);

export const useVoiceCopilot = () => {
    const context = useContext(VoiceCopilotContext);
    if (!context) {
        throw new Error('useVoiceCopilot must be used within a VoiceCopilotProvider');
    }
    return context;
};

export const VoiceCopilotProvider = ({ children }) => {
    // Session State
    const [status, setStatus] = useState('idle'); // idle, connecting, active, speaking, error
    const [error, setError] = useState(null);
    const [activeTools, setActiveTools] = useState(new Map()); // Registry of { name: toolDef }

    // Audio & Connection Refs
    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const audioWorkletNode = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);
    const currentSource = useRef(null);

    // Settings (Lazy Loaded)
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
            // Setup source
            const buffer = audioContext.current.createBuffer(1, audioData.length, 24000);
            buffer.getChannelData(0).set(audioData);

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.current.destination);
            currentSource.current = source;

            source.onended = () => {
                isPlaying.current = false;
                playNextChunk(); // Chain playback
            };

            setStatus('speaking');
            source.start();
        } catch (e) {
            console.error('[Copilot] Audio playback error:', e);
            isPlaying.current = false;
        }
    }, []);

    // --- WEBSOCKET CONNECTION ---
    const connect = useCallback(async () => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        try {
            setStatus('connecting');
            setError(null);

            // 1. Get Token (Assuming endpoint exists or use API key directly for prototype)
            // NOTE: Using direct API key from previous prototype logic for now, should move to backend proxy
            const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
            const HOST = 'generativelanguage.googleapis.com';
            const URI = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

            // 2. Setup WebSocket
            const socket = new WebSocket(URI);
            ws.current = socket;

            socket.onopen = async () => {
                console.log('[Copilot] Connected to Gemini Live');
                setStatus('active');

                // 3. Send Initial Config
                const settings = getSettings();
                const tools = Array.from(activeTools.values()).map(t => ({
                    function_declarations: [{
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters
                    }]
                }));

                const initialConfig = {
                    setup: {
                        model: "models/gemini-2.0-flash-exp",
                        tools: tools.length > 0 ? [{ function_declarations: tools.flatMap(t => t.function_declarations) }] : undefined,
                        generation_config: {
                            response_modalities: ["AUDIO"],
                            speech_config: {
                                voice_config: { prebuilt_voice_config: { voice_name: settings.voice } }
                            }
                        },
                        system_instruction: {
                            parts: [{
                                text: `You are a helpful field assistant. Persona: ${settings.persona}. 
                                       Custom Instructions: ${settings.instructions}.
                                       Be concise.`
                            }]
                        }
                    }
                };
                socket.send(JSON.stringify(initialConfig));

                // 4. Start Audio Input
                await startAudioInput();
            };

            socket.onmessage = async (event) => {
                let data;
                if (event.data instanceof Blob) {
                    // Audio Blob (Input check? Usually output comes as text-encoded JSON with base64 audio)
                    // Currently Gemini API sends JSON text frames
                    return;
                } else {
                    data = JSON.parse(event.data);
                }

                // Handle Audio Output
                if (data.serverContent?.modelTurn?.parts) {
                    for (const part of data.serverContent.modelTurn.parts) {
                        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                            // Decode Base64 to Float32
                            const pcmData = base64ToFloat32(part.inlineData.data);
                            audioQueue.current.push(pcmData);
                            playNextChunk();
                        }
                    }
                }

                // Handle Function Calls
                if (data.toolUse) {
                    handleToolUse(data.toolUse);
                }
            };

            socket.onclose = () => {
                console.log('[Copilot] Disconnected');
                setStatus('idle');
                stopAudioInput();
            };

            socket.onerror = (e) => {
                console.error('[Copilot] Error:', e);
                setError('Connection failed. Please try again.');
                setStatus('error');
            };

        } catch (e) {
            console.error('[Copilot] Connect failed:', e);
            setError(e.message);
            setStatus('error');
        }
    }, [activeTools]);

    // --- TOOL EXECUTION LOGIC ---
    const handleToolUse = async (toolCall) => {
        console.log('[Copilot] Tool Call Received:', toolCall);

        // Handle both formats: toolCall.functionCalls[] or toolCall directly
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

        // Send tool responses back to Gemini
        if (ws.current?.readyState === WebSocket.OPEN && responses.length > 0) {
            const toolResponse = {
                tool_response: {
                    function_responses: responses.map(r => ({
                        id: r.id,
                        name: r.name,
                        response: r.response
                    }))
                }
            };
            console.log('[Copilot] Sending tool response:', toolResponse);
            ws.current.send(JSON.stringify(toolResponse));
        }
    };

    // --- AUDIO HELPERS ---
    const floatTo16BitPCM = (input) => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    };

    const startAudioInput = async () => {
        try {
            // Ensure context is running (user gesture requirement)
            if (!audioContext.current) {
                audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); // Use 16kHz for input to match Gemini pref
            }
            if (audioContext.current.state === 'suspended') {
                await audioContext.current.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            mediaStream.current = stream;

            const source = audioContext.current.createMediaStreamSource(stream);

            // bufferSize: 2048 or 4096. 4096 = ~250ms latency but safer from glitches
            const processor = audioContext.current.createScriptProcessor(4096, 1, 1);

            processor.onaudioprocess = (e) => {
                if (ws.current?.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Downsample to 16kHz is automatic if context is 16kHz? 
                // Context is created at 16000 above.

                const pcmData = floatTo16BitPCM(inputData);

                // Convert to Base64
                let binary = '';
                const bytes = new Uint8Array(pcmData.buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
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

            source.connect(processor);
            processor.connect(audioContext.current.destination); // Essential for script processor to run

            // Store nodes to clean up later
            audioWorkletNode.current = processor; // reusing ref name
            currentSource.current = source; // reuse ref

        } catch (e) {
            console.error('[Copilot] Mic access failed:', e);
            setError('Microphone access denied');
            setStatus('error');
        }
    };

    const stopAudioInput = () => {
        mediaStream.current?.getTracks().forEach(track => track.stop());
        if (audioWorkletNode.current) {
            audioWorkletNode.current.disconnect();
            audioWorkletNode.current = null;
        }
        if (currentSource.current) {
            currentSource.current.disconnect();
            currentSource.current = null;
        }
        if (audioContext.current?.state !== 'closed') {
            audioContext.current?.close();
        }
    };

    const base64ToFloat32 = (base64) => {
        const binary = atob(base64);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        // Assuming 16-bit PCM little-endian from Gemini
        const int16 = new Int16Array(buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        return float32;
    };

    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        stopAudioInput();
        setStatus('idle');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    return (
        <VoiceCopilotContext.Provider value={{
            status,
            error,
            connect,
            disconnect,
            registerTools,
            unregisterTools,
            activeTools
        }}>
            {children}
        </VoiceCopilotContext.Provider>
    );
};
