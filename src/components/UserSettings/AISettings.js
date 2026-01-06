import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { Mic, MessageSquare, Sparkles, UserCog, Copy, Check, ScrollText, Sliders, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useVoiceCopilot } from '../../contexts/AIBrainContext';
import VoiceTestPanel from '../Admin/VoiceTestPanel';

const AISettings = () => {
    const { mode } = useTheme();
    const sectionStyles = enhancedStyles.sections[mode];

    // Voice Copilot context
    const {
        debugLog,
        clearDebugLog,
        lastTranscript,
        status,
        audioChunksSent,
        audioChunksReceived
    } = useVoiceCopilot();

    // Conversation transcript state (persists across sessions)
    const [transcript, setTranscript] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('ai_transcript') || '[]');
        } catch {
            return [];
        }
    });
    const [copied, setCopied] = useState(false);
    const transcriptEndRef = useRef(null);

    // Voice Tuning Modal state
    const [showVoiceTuning, setShowVoiceTuning] = useState(false);

    // State - Initialize from localStorage
    const [persona, setPersona] = useState(() => localStorage.getItem('ai_persona') || 'brief');
    const [voice, setVoice] = useState(() => localStorage.getItem('ai_voice') || 'Puck');
    const [instructions, setInstructions] = useState(() => localStorage.getItem('ai_custom_instructions') || '');

    // VAD Sensitivity settings (0-2 scale: LOW, MEDIUM, HIGH)
    // 0 = LOW sensitivity (needs clear speech / waits longer)
    // 1 = MEDIUM
    // 2 = HIGH sensitivity (triggers easily / responds fast)
    const [vadStartSensitivity, setVadStartSensitivity] = useState(() =>
        parseInt(localStorage.getItem('ai_vad_start') || '0', 10)
    );
    const [vadEndSensitivity, setVadEndSensitivity] = useState(() =>
        parseInt(localStorage.getItem('ai_vad_end') || '2', 10)
    );
    const [silenceDurationMs, setSilenceDurationMs] = useState(() =>
        parseInt(localStorage.getItem('ai_silence_duration') || '500', 10)
    );

    // Collapsible sections state - all collapsed by default to save space
    const [expandedSections, setExpandedSections] = useState({
        persona: false,
        voice: false,
        vad: false,
        context: false,
        transcript: false
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    // Save changes to localStorage
    useEffect(() => {
        localStorage.setItem('ai_persona', persona);
        localStorage.setItem('ai_voice', voice);
        localStorage.setItem('ai_custom_instructions', instructions);
        localStorage.setItem('ai_vad_start', vadStartSensitivity.toString());
        localStorage.setItem('ai_vad_end', vadEndSensitivity.toString());
        localStorage.setItem('ai_silence_duration', silenceDurationMs.toString());
    }, [persona, voice, instructions, vadStartSensitivity, vadEndSensitivity, silenceDurationMs]);

    // Capture AI responses to transcript
    useEffect(() => {
        if (lastTranscript && lastTranscript.trim()) {
            const newEntry = {
                type: 'ai',
                text: lastTranscript,
                timestamp: new Date().toISOString()
            };
            setTranscript(prev => {
                const updated = [...prev, newEntry].slice(-50); // Keep last 50 entries
                localStorage.setItem('ai_transcript', JSON.stringify(updated));
                return updated;
            });
        }
    }, [lastTranscript]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    // Copy transcript to clipboard
    const copyTranscript = async () => {
        const text = transcript.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `[${time}] ${entry.type === 'ai' ? 'AI' : 'You'}: ${entry.text}`;
        }).join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback for iOS
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const clearTranscript = () => {
        setTranscript([]);
        localStorage.removeItem('ai_transcript');
    };

    const voices = [
        { id: 'Puck', name: 'Puck (Energetic)', gender: 'Male' },
        { id: 'Charon', name: 'Charon (Deep/Calm)', gender: 'Male' },
        { id: 'Kore', name: 'Kore (Warm)', gender: 'Female' },
        { id: 'Fenrir', name: 'Fenrir (Deep)', gender: 'Male' },
        { id: 'Aoede', name: 'Aoede (Formal)', gender: 'Female' },
    ];

    return (
        <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={18} className="text-violet-500" />
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Copilot Settings</h2>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Configure your voice assistant's personality and behavior.</p>
                </div>
            </div>

            <div className="space-y-2 pt-2">
                {/* Persona Selection - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('persona')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <UserCog size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Assistant Persona</span>
                            <span className="text-xs text-violet-500 font-medium">{persona === 'brief' ? 'Field Partner' : 'Teacher'}</span>
                        </div>
                        {expandedSections.persona ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.persona && (
                        <div className="px-3 pb-3 space-y-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                <button
                                    onClick={() => setPersona('brief')}
                                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${persona === 'brief'
                                            ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'brief' ? 'border-violet-500' : 'border-zinc-400'
                                        }`}>
                                        {persona === 'brief' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">The Field Partner</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Concise, fast, and proactive. Optimized for hands-free work while measuring.</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setPersona('detailed')}
                                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${persona === 'detailed'
                                            ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'detailed' ? 'border-violet-500' : 'border-zinc-400'
                                        }`}>
                                        {persona === 'detailed' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">The Teacher</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Explains reasoning, confirms details verbally, and offers more guidance.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Voice Selection - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('voice')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Mic size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice Preference</span>
                            <span className="text-xs text-violet-500 font-medium">{voice}</span>
                        </div>
                        {expandedSections.voice ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.voice && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
                                {voices.map(v => (
                                    <button
                                        key={v.id}
                                        onClick={() => setVoice(v.id)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${voice === v.id
                                                ? 'bg-violet-500 text-white border-violet-600 shadow-sm'
                                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                    >
                                        {v.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Voice Tuning - Opens Modal */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => setShowVoiceTuning(true)}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Sliders size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice Tuning</span>
                            <span className="text-xs text-zinc-500">
                                {silenceDurationMs}ms delay
                            </span>
                        </div>
                        <span className="text-xs text-violet-500 font-medium">Open Tuner</span>
                    </button>
                </div>

                {/* Custom Instructions - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('context')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custom Context</span>
                            {instructions && <span className="text-xs text-green-500">Configured</span>}
                        </div>
                        {expandedSections.context ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.context && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="relative pt-3">
                                <textarea
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    rows={3}
                                    placeholder="e.g., 'I always measure in millimeters', or 'Remind me to check for obstructions'"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                />
                            </div>
                            <p className="text-xs text-zinc-400 italic mt-2">
                                The AI will consider these instructions in every interaction.
                            </p>
                        </div>
                    )}
                </div>

                {/* Conversation Transcript - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('transcript')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <ScrollText size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Conversation Transcript</span>
                            {transcript.length > 0 && <span className="text-xs text-zinc-500">{transcript.length} messages</span>}
                            {/* Status indicator inline */}
                            <div className={`w-2 h-2 rounded-full ${
                                status === 'listening' ? 'bg-green-500 animate-pulse' :
                                status === 'speaking' ? 'bg-violet-500 animate-pulse' :
                                status === 'connecting' ? 'bg-amber-500 animate-pulse' :
                                'bg-zinc-400'
                            }`} />
                        </div>
                        {expandedSections.transcript ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.transcript && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3 pt-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-zinc-500 dark:text-zinc-400 capitalize">{status}</span>
                                    {status !== 'idle' && (
                                        <>
                                            <span className="text-zinc-400">Sent: {audioChunksSent}</span>
                                            <span className="text-zinc-400">Recv: {audioChunksReceived}</span>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={copyTranscript}
                                        disabled={transcript.length === 0}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                            copied
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                        } ${transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={clearTranscript}
                                        disabled={transcript.length === 0}
                                        className={`px-2 py-1 rounded text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors ${
                                            transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* Transcript Display */}
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 max-h-80 overflow-y-auto">
                                {transcript.length === 0 ? (
                                    <div className="text-zinc-400 text-sm text-center py-8">
                                        No conversation yet. Start a voice session to see the transcript here.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {transcript.map((entry, i) => (
                                            <div key={i} className={`text-sm ${entry.type === 'ai' ? '' : 'text-right'}`}>
                                                <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg ${
                                                    entry.type === 'ai'
                                                        ? 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                                                        : 'bg-violet-500 text-white'
                                                }`}>
                                                    <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                                                    <p className={`text-[10px] mt-1 ${
                                                        entry.type === 'ai' ? 'text-zinc-400' : 'text-violet-200'
                                                    }`}>
                                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={transcriptEndRef} />
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-zinc-400 italic">
                                This shows what the AI said. Copy to share issues with Steve for debugging.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Voice Tuning Modal */}
            {showVoiceTuning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
                        <VoiceTestPanel
                            isModal={true}
                            onClose={() => {
                                setShowVoiceTuning(false);
                                // Refresh local state from localStorage after modal closes
                                setVadStartSensitivity(parseInt(localStorage.getItem('ai_vad_start') || '0', 10));
                                setVadEndSensitivity(parseInt(localStorage.getItem('ai_vad_end') || '2', 10));
                                setSilenceDurationMs(parseInt(localStorage.getItem('ai_silence_duration') || '500', 10));
                            }}
                        />
                    </div>
                </div>
            )}
        </section>
    );
};

export default AISettings;
