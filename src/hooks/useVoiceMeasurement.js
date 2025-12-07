import { useState, useEffect, useRef, useCallback } from 'react';

// Browser compatibility helper
// const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// iOS Safari detection
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

// Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Helper to parse spoken fractions and numbers
// Helper to parse spoken fractions and numbers - REPLACED BY LLM API
// const parseSpokenDimension = (text) => { ... }

export const useVoiceMeasurement = ({ onFieldUpdate, initialContext = null }) => {
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, connecting, listening, speaking
    const [transcript, setTranscript] = useState('');
    const [currentStep, setCurrentStep] = useState(0);

    // Refs
    const ws = useRef(null);
    const audioContext = useRef(null);
    const audioInput = useRef(null);
    const processor = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);

    // ... (previous code)

    // State Ref for event handlers & context
    const stateRef = useRef({
        isActive: false,
        onFieldUpdate,
        currentStep,
        initialContext
    });

    useEffect(() => {
        stateRef.current = { isActive, onFieldUpdate, currentStep, initialContext };
    });

    // Flow Config
    const steps = [
        { key: 'widthTop', label: 'Top Width' },
        { key: 'widthMiddle', label: 'Middle Width' },
        { key: 'widthBottom', label: 'Bottom Width' }
    ];

    // ... (previous code)

    const connect = useCallback(async () => {
        try {
            setStatus('connecting');

            // ... (fetch key) ...
            const response = await fetch('/api/voice-credentials');
            // Check content type
            const contentType = response.headers.get("content-type");
            if (!response.ok || !contentType || !contentType.includes("application/json")) {
                throw new Error("API route not found. Note: 'npm start' does not serve API routes. Please run 'vercel dev'.");
            }
            const { key } = await response.json();

            if (!key) throw new Error("No API key");

            // 2. Setup Audio Context
            // Note: iOS Safari's webkitAudioContext doesn't accept constructor options
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();
            console.log(`[VoiceMeasurement] AudioContext created with sample rate: ${audioContext.current.sampleRate}${isIOS ? ' (iOS)' : ''}`);

            // 3. Open WebSocket
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${key}`;
            ws.current = new WebSocket(url);

            ws.current.onopen = () => {
                console.log("Connected to Gemini Live");
                setStatus('listening');

                // Send Initial Setup
                const setupMsg = {
                    setup: {
                        model: "models/gemini-2.0-flash-exp",
                        generation_config: {
                            response_modalities: ["AUDIO"]
                        }
                    }
                };
                ws.current.send(JSON.stringify(setupMsg));

                // Send Initial Prompt (Simulated User Context)
                // We use stateRef to get the freshest context at connect time
                const contextText = stateRef.current.initialContext || "a window shade";
                const triggerText = `System Instruction: You are a helpful assistant assisting a technician in measuring window shades. 
                The current item is: "${contextText}".
                Please wait 1 second, then say exactly: "Let's add the ${contextText}."
                Then, ask me for the first measurement: "Top Width".
                Maintain a natural, professional but friendly conversation. 
                If I say a number, repeat it back to confirm and move to the next field.`;

                const triggerMsg = {
                    client_content: {
                        turns: [{
                            role: "user",
                            parts: [{ text: triggerText }]
                        }],
                        turn_complete: true
                    }
                };
                ws.current.send(JSON.stringify(triggerMsg));

                startAudioCapture();
            };

            ws.current.onmessage = async (event) => {
                const data = event.data;
                // Blob or Text?
                if (data instanceof Blob) {
                    // Audio data response usually comes as JSON with base64 audio inside in the new API
                    // Check protocol spec. Usually it's text JSON.
                    console.log("Received Blob", data.size);
                } else {
                    const msg = JSON.parse(data);

                    // Handle Server Content (Audio)
                    if (msg.serverContent?.modelTurn?.parts) {
                        for (const part of msg.serverContent.modelTurn.parts) {
                            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                                // Add to queue
                                queueAudio(part.inlineData.data);
                            }
                        }
                    }

                    // Handle Text/Transcripts? 
                    // Gemini Live might send text transcriptions of what it heard/said too if requested.
                }
            };

            ws.current.onerror = (e) => console.error("WS Error", e);
            ws.current.onclose = () => {
                console.log("WS Closed");
                stopSession();
            };

        } catch (e) {
            console.error("Connection Failed", e);
            setStatus('idle');
            setIsActive(false);
        }
    }, []);

    const startAudioCapture = async () => {
        // Note: Don't specify sampleRate - iOS ignores it and uses native rate (48kHz)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        audioInput.current = audioContext.current.createMediaStreamSource(stream);

        // Get device's actual sample rate (iOS uses 48kHz, desktop may vary)
        const deviceSampleRate = audioContext.current.sampleRate;
        console.log(`[VoiceMeasurement] Device sample rate: ${deviceSampleRate}, will downsample to ${GEMINI_INPUT_SAMPLE_RATE}`);

        // Use ScriptProcessor for legacy compatibility (more iOS compatible than AudioWorklet)
        processor.current = audioContext.current.createScriptProcessor(4096, 1, 1);

        processor.current.onaudioprocess = (e) => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);

            // Downsample to 16kHz for Gemini (device may be 48kHz on iOS)
            const downsampledData = downsampleForGemini(inputData, deviceSampleRate);

            // Convert float32 to PCM 16-bit
            const pcmData = floatTo16BitPCM(downsampledData);

            // Send Realtime Input
            const msg = {
                realtime_input: {
                    media_chunks: [{
                        mime_type: "audio/pcm",
                        data: arrayBufferToBase64(pcmData)
                    }]
                }
            };
            ws.current.send(JSON.stringify(msg));
        };

        audioInput.current.connect(processor.current);
        processor.current.connect(audioContext.current.destination);
    };

    const queueAudio = (base64Data) => {
        // Decode and queue
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        // This is raw PCM 24khz usually
        // We need to play it. 
        audioQueue.current.push(bytes.buffer);
        if (!isPlaying.current) playNextChunk();
    };

    const playNextChunk = async () => {
        if (audioQueue.current.length === 0 || !audioContext.current) {
            isPlaying.current = false;
            return;
        }
        isPlaying.current = true;
        const chunk = audioQueue.current.shift();

        try {
            // Convert PCM 16-bit to Float32
            const float32 = new Float32Array(chunk.byteLength / 2);
            const dataView = new DataView(chunk);
            for (let i = 0; i < chunk.byteLength / 2; i++) {
                const int16 = dataView.getInt16(i * 2, true); // Little endian
                float32[i] = int16 / 32768.0;
            }

            // Gemini sends audio at 24kHz, but device may use different rate (iOS uses 48kHz)
            const deviceSampleRate = audioContext.current.sampleRate;
            const resampledData = resampleAudio(float32, GEMINI_OUTPUT_SAMPLE_RATE, deviceSampleRate);

            const buffer = audioContext.current.createBuffer(1, resampledData.length, deviceSampleRate);
            buffer.getChannelData(0).set(resampledData);

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.current.destination);
            source.onended = playNextChunk;
            source.start();
        } catch (e) {
            console.error('[VoiceMeasurement] Audio playback error:', e);
            isPlaying.current = false;
            playNextChunk(); // Try next chunk
        }
    };

    // Helpers

    // Linear interpolation resampling for iOS compatibility
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

    const floatTo16BitPCM = (float32Array) => {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    };

    const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    const startSession = () => {
        setIsActive(true);
        connect();
    };

    const stopSession = () => {
        ws.current?.close();
        audioContext.current?.close();
        // processor.current?.disconnect();
        // audioInput.current?.disconnect();
        setIsActive(false);
        setStatus('idle');
    };

    // Note: This prototype assumes Gemini is driving the flow via the prompt logic.
    // Ideally we feed it the "Steps" as System Instruction context.

    return {
        isActive,
        status,
        transcript: "Gemini Live Active", // Transcript handled by voice mainly
        currentStepLabel: steps[currentStep]?.label,
        startSession,
        stopSession
    };
};
