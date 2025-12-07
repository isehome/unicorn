import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { Bot, Mic, MessageSquare, Sparkles, UserCog } from 'lucide-react';

const AISettings = () => {
    const { mode } = useTheme();
    const sectionStyles = enhancedStyles.sections[mode];

    // State - Initialize from localStorage
    const [persona, setPersona] = useState(() => localStorage.getItem('ai_persona') || 'brief');
    const [voice, setVoice] = useState(() => localStorage.getItem('ai_voice') || 'Puck');
    const [instructions, setInstructions] = useState(() => localStorage.getItem('ai_custom_instructions') || '');
    const [isExpanded, setIsExpanded] = useState(false);

    // Save changes to localStorage
    useEffect(() => {
        localStorage.setItem('ai_persona', persona);
        localStorage.setItem('ai_voice', voice);
        localStorage.setItem('ai_custom_instructions', instructions);
    }, [persona, voice, instructions]);

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

            <div className="space-y-6 pt-2">
                {/* Persona Selection */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <UserCog size={14} />
                        <span>Assistant Persona</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                {/* Voice Selection */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <Mic size={14} />
                        <span>Voice Preference</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

                {/* Custom Instructions */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <MessageSquare size={14} />
                        <span>Custom Context</span>
                    </div>
                    <div className="relative">
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            rows={3}
                            placeholder="e.g., 'I always measure in millimeters', or 'Remind me to check for obstructions'"
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                    </div>
                    <p className="text-xs text-zinc-400 italic">
                        The AI will consider these instructions in every interaction.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default AISettings;
