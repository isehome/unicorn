/**
 * AIBrainContext - The Voice AI Agent
 * 5 meta-tools, real-time context, Azure AI Search + web search
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from './AppStateContext';
import { supabase } from '../lib/supabase';

const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;
const LATEST_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';

const AIBrainContext = createContext(null);

export const AIBrainProvider = ({ children }) => {
    const navigate = useNavigate();
    const { executeAction, getAvailableActions, getState } = useAppState();

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [lastTranscript, setLastTranscript] = useState('');

    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]);
    const isPlaying = useRef(false);
    const navigateRef = useRef(navigate);

    useEffect(() => { navigateRef.current = navigate; }, [navigate]);
    useEffect(() => {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        setIsConfigured(!!apiKey && apiKey.length > 10);
    }, []);

    const getSettings = useCallback(() => ({
        voice: localStorage.getItem('ai_voice') || 'Puck',
        persona: localStorage.getItem('ai_persona') || 'brief',
        customInstructions: localStorage.getItem('ai_custom_instructions') || '',
        vadStartSensitivity: parseInt(localStorage.getItem('ai_vad_start') || '1', 10),
        vadEndSensitivity: parseInt(localStorage.getItem('ai_vad_end') || '2', 10),
    }), []);

    const buildContextString = useCallback((state) => {
        const { view, project, shade, form, activeField, shades, rooms } = state;
        let context = `Current View: ${view}\n`;
        if (project) context += `Project: "${project.name}" (${project.address || 'No address'})\n`;

        if (view === 'shade-detail' && shade) {
            context += `\n### Measuring Window: "${shade.name}"${shade.roomName ? ` in ${shade.roomName}` : ''}\n\nMeasurements:\n`;
            context += `- Top Width: ${form?.widthTop || 'NOT SET'}\n`;
            context += `- Middle Width: ${form?.widthMiddle || 'NOT SET'}\n`;
            context += `- Bottom Width: ${form?.widthBottom || 'NOT SET'}\n`;
            context += `- Height: ${form?.height || 'NOT SET'}\n`;
            context += `- Mount Depth: ${form?.mountDepth || 'NOT SET'}\n`;
            if (activeField) context += `\nActive Field: ${activeField}\n`;
            context += `\nAvailable Actions: highlight_field, set_measurement, clear_measurement, save_measurements, read_back, next_shade\n`;
        } else if (view === 'shade-list' && shades) {
            const pending = shades.filter(s => !s.hasMeasurements).length;
            context += `\n### Window List\nTotal: ${shades.length}, Pending: ${pending}, Rooms: ${rooms?.length || 0}\n`;
            context += `Available Actions: open_shade, list_rooms, go_to_next_pending\n`;
        } else if (view === 'prewire') {
            context += `\n### Prewire Mode\nAvailable Actions: get_overview, filter_by_floor, filter_by_room, print_labels, take_photo\n`;
        } else if (view === 'dashboard') {
            context += `\n### Dashboard\nAvailable Actions: list_projects, open_project\n`;
        }
        return context;
    }, []);

    const buildSystemInstruction = useCallback(() => {
        const settings = getSettings();
        const state = getState();
        const persona = settings.persona === 'brief'
            ? `You are a concise field assistant. Keep responses short. Confirm with "Got it" or "Done".`
            : `You are a helpful teaching assistant. Explain your actions.`;

        return `# UNICORN Field Assistant

${persona}

## Capabilities
1. App Navigation - projects, shades, prewire, settings
2. Shade Measuring - guide through window measurements
3. Knowledge Base - Lutron, Ubiquiti, Control4, Sonos docs (Azure AI Search)
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

${settings.customInstructions ? `## Custom Instructions\n${settings.customInstructions}` : ''}

## Current Context
${buildContextString(state)}`;
    }, [getSettings, getState, buildContextString]);

    const tools = [
        { name: 'get_context', description: 'Get current app state. CALL THIS FIRST.', parameters: { type: 'object', properties: {} } },
        { name: 'execute_action', description: 'Execute action: highlight_field, set_measurement, save_measurements, open_shade, etc.', parameters: { type: 'object', properties: { action: { type: 'string' }, params: { type: 'object' } }, required: ['action'] } },
        { name: 'search_knowledge', description: 'Search knowledge base for product info (Lutron, Ubiquiti, etc). USE FIRST for product questions.', parameters: { type: 'object', properties: { query: { type: 'string' }, manufacturer: { type: 'string' } }, required: ['query'] } },
        { name: 'navigate', description: 'Go to: dashboard, prewire, settings, or project name with optional section.', parameters: { type: 'object', properties: { destination: { type: 'string' }, section: { type: 'string' } }, required: ['destination'] } },
        { name: 'web_search', description: 'Search web for general info not in knowledge base.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    ];

    const getContextHint = (view) => {
        const hints = {
            'shade-detail': 'Measuring window. Guide through: top->middle->bottom width, height, mount depth.',
            'shade-list': 'Window list. Can open shade or find next pending.',
            'prewire': 'Prewire mode for wire drop labels.',
            'dashboard': 'Dashboard. Can open projects.',
        };
        return hints[view] || 'Ask how you can help.';
    };

    const searchKnowledgeBase = async (query, manufacturer) => {
        try {
            const response = await fetch('/api/azure-ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, manufacturer, limit: 5 }),
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            if (!data.results?.length) return { found: false, message: `No results for "${query}".`, suggestion: 'Try web_search.' };
            return { found: true, answer: data.results[0].content?.substring(0, 500), source: data.results[0].documentTitle, resultCount: data.results.length };
        } catch (e) { return { found: false, error: e.message }; }
    };

    const handleNavigation = async (destination, section) => {
        const sections = { dashboard: '/pm-dashboard', home: '/pm-dashboard', prewire: '/prewire-mode', settings: '/settings', issues: '/issues', todos: '/todos' };
        if (sections[destination.toLowerCase()]) {
            navigateRef.current(sections[destination.toLowerCase()]);
            return { success: true, message: `Going to ${destination}` };
        }
        const { data: projects } = await supabase.from('projects').select('id, name').ilike('name', `%${destination}%`).limit(5);
        if (!projects?.length) return { success: false, error: `No project "${destination}"` };
        if (projects.length > 1) return { success: false, error: 'Multiple matches', matches: projects.map(p => p.name) };
        let url = `/pm-project/${projects[0].id}`;
        if (section) {
            const s = section.toLowerCase();
            if (['shades', 'windows'].includes(s)) url = `/projects/${projects[0].id}/shades`;
            else if (s === 'equipment') url = `/projects/${projects[0].id}/equipment`;
        }
        navigateRef.current(url);
        return { success: true, message: `Opening ${projects[0].name}` };
    };

    const handleToolCall = useCallback(async (toolCall) => {
        const { name, args = {} } = toolCall;
        console.log(`[AIBrain] Tool: ${name}`, args);
        switch (name) {
            case 'get_context': return { ...getState(), availableActions: getAvailableActions(), hint: getContextHint(getState().view) };
            case 'execute_action': return await executeAction(args.action, args.params || {});
            case 'search_knowledge': return await searchKnowledgeBase(args.query, args.manufacturer);
            case 'navigate': return await handleNavigation(args.destination, args.section);
            case 'web_search': return { message: `Searching for "${args.query}"...`, useGrounding: true };
            default: return { error: `Unknown: ${name}` };
        }
    }, [getState, getAvailableActions, executeAction]);

    // Audio utilities
    const resampleAudio = (data, fromRate, toRate) => {
        if (fromRate === toRate) return data;
        const ratio = fromRate / toRate;
        const result = new Float32Array(Math.round(data.length / ratio));
        for (let i = 0; i < result.length; i++) {
            const pos = i * ratio, idx = Math.floor(pos), frac = pos - idx;
            result[i] = idx + 1 < data.length ? data[idx] * (1 - frac) + data[idx + 1] * frac : data[idx];
        }
        return result;
    };
    const float32ToInt16 = (arr) => {
        const result = new Int16Array(arr.length);
        for (let i = 0; i < arr.length; i++) { const s = Math.max(-1, Math.min(1, arr[i])); result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
        return result;
    };
    const base64ToFloat32 = (b64) => {
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const int16 = new Int16Array(bytes.buffer), float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
        return float32;
    };

    const sendToolResponse = useCallback((name, result) => {
        if (ws.current?.readyState === WebSocket.OPEN)
            ws.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ name, response: result }] } }));
    }, []);

    const playNextChunk = useCallback(() => {
        if (!audioContext.current || !audioQueue.current.length || isPlaying.current) return;
        isPlaying.current = true;
        const data = audioQueue.current.shift();
        const resampled = resampleAudio(data, GEMINI_OUTPUT_SAMPLE_RATE, audioContext.current.sampleRate);
        const buffer = audioContext.current.createBuffer(1, resampled.length, audioContext.current.sampleRate);
        buffer.getChannelData(0).set(resampled);
        const source = audioContext.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.current.destination);
        source.onended = () => { isPlaying.current = false; playNextChunk(); };
        source.start();
    }, []);

    const handleWebSocketMessage = useCallback(async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.setupComplete) return;
            if (data.serverContent?.modelTurn?.parts) {
                for (const part of data.serverContent.modelTurn.parts) {
                    if (part.inlineData?.mimeType?.includes('audio')) { setStatus('speaking'); audioQueue.current.push(base64ToFloat32(part.inlineData.data)); playNextChunk(); }
                    if (part.text) setLastTranscript(part.text);
                    if (part.functionCall) { const r = await handleToolCall(part.functionCall); sendToolResponse(part.functionCall.name, r); }
                }
            }
            if (data.serverContent?.turnComplete) setStatus('listening');
            if (data.toolCall) { const r = await handleToolCall(data.toolCall); sendToolResponse(data.toolCall.name, r); }
        } catch (e) { console.error('[AIBrain] Error:', e); }
    }, [handleToolCall, sendToolResponse, playNextChunk]);

    const startAudioCapture = useCallback(() => {
        if (!mediaStream.current || !audioContext.current) return;
        sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);
        processorNode.current = audioContext.current.createScriptProcessor(4096, 1, 1);
        processorNode.current.onaudioprocess = (e) => {
            if (ws.current?.readyState !== WebSocket.OPEN) return;
            const input = e.inputBuffer.getChannelData(0);
            let sum = 0; for (let i = 0; i < input.length; i++) sum += Math.abs(input[i]);
            setAudioLevel(sum / input.length);
            const resampled = resampleAudio(input, audioContext.current.sampleRate, GEMINI_INPUT_SAMPLE_RATE);
            const int16 = float32ToInt16(resampled);
            const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
            ws.current.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] } }));
        };
        sourceNode.current.connect(processorNode.current);
        processorNode.current.connect(audioContext.current.destination);
        setStatus('listening');
    }, []);

    const stopAudioCapture = useCallback(() => {
        processorNode.current?.disconnect(); processorNode.current = null;
        sourceNode.current?.disconnect(); sourceNode.current = null;
        mediaStream.current?.getTracks().forEach(t => t.stop()); mediaStream.current = null;
        setAudioLevel(0);
    }, []);

    const startSession = useCallback(async () => {
        if (status !== 'idle' && status !== 'error') return;
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) { setError('No API key'); setStatus('error'); return; }
        try {
            setStatus('connecting'); setError(null);
            if (!audioContext.current || audioContext.current.state === 'closed') audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.current.state === 'suspended') await audioContext.current.resume();
            mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
            const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`);
            ws.current = socket;
            socket.onopen = () => {
                const settings = getSettings();
                socket.send(JSON.stringify({
                    setup: {
                        model: `models/${LATEST_MODEL}`,
                        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } } } },
                        systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
                        tools: tools.map(t => ({ functionDeclarations: [{ name: t.name, description: t.description, parameters: t.parameters }] })),
                        realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: settings.vadStartSensitivity === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: settings.vadEndSensitivity === 1 ? 'END_SENSITIVITY_LOW' : 'END_SENSITIVITY_HIGH' } }
                    }
                }));
                setStatus('connected');
                startAudioCapture();
            };
            socket.onmessage = handleWebSocketMessage;
            socket.onerror = () => { setError('Connection error'); setStatus('error'); };
            socket.onclose = () => { setStatus('idle'); stopAudioCapture(); };
        } catch (e) { setError(e.message); setStatus('error'); }
    }, [status, getSettings, buildSystemInstruction, tools, startAudioCapture, handleWebSocketMessage, stopAudioCapture]);

    const endSession = useCallback(() => {
        stopAudioCapture();
        ws.current?.close(); ws.current = null;
        audioQueue.current = []; isPlaying.current = false;
        setStatus('idle');
    }, [stopAudioCapture]);

    return (
        <AIBrainContext.Provider value={{
            status, error, isConfigured, audioLevel, lastTranscript, startSession, endSession,
            testAudioOutput: async () => true, testMicrophoneInput: async () => true,
            debugLog: [], clearDebugLog: () => {},
            platformInfo: { isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent), isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) },
            audioChunksSent: 0, audioChunksReceived: 0, registerTools: () => {}, unregisterTools: () => {},
        }}>
            {children}
        </AIBrainContext.Provider>
    );
};

export const useAIBrain = () => { const ctx = useContext(AIBrainContext); if (!ctx) throw new Error('useAIBrain requires AIBrainProvider'); return ctx; };
export const useVoiceCopilot = useAIBrain;
export default AIBrainContext;
