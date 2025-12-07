import { useEffect, useState } from 'react';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';
import { Mic, MicOff, Loader2, X, Activity } from 'lucide-react';

const VoiceCopilotOverlay = () => {
    const { status, toggle, error, isConfigured } = useVoiceCopilot();
    const [isExpanded, setIsExpanded] = useState(false);

    // Auto-expand on error to show message
    useEffect(() => {
        if (error) setIsExpanded(true);
    }, [error]);

    // Handle Mic Click
    const handleToggle = () => {
        if (!isConfigured) {
            setIsExpanded(true);
            return;
        }
        toggle();
    };

    // Dynamic Styles based on Status
    const getButtonStyles = () => {
        if (!isConfigured) {
            return 'bg-zinc-300 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed';
        }
        switch (status) {
            case 'connecting':
                return 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 animate-pulse cursor-wait';
            case 'listening':
                return 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 hover:bg-violet-600';
            case 'speaking':
                return 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-110';
            case 'error':
                return 'bg-red-500 text-white';
            default: // idle
                return 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-lg';
        }
    };

    const getIcon = () => {
        switch (status) {
            case 'connecting': return <Loader2 size={24} className="animate-spin" />;
            case 'listening': return <Mic size={24} />;
            case 'speaking': return <Activity size={24} className="animate-pulse" />;
            case 'error': return <MicOff size={24} />;
            default: return <Mic size={24} />;
        }
    };

    const getStatusMessage = () => {
        if (!isConfigured) {
            return "Voice AI not configured. Add REACT_APP_GEMINI_API_KEY to Vercel environment.";
        }
        if (status === 'error' && error) return error;
        if (status === 'listening') return "Listening... Tap to stop.";
        if (status === 'speaking') return "Speaking...";
        if (status === 'connecting') return "Connecting...";
        return "Tap to start voice assistant";
    };

    return (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2">
            {/* Expanded Status / Error Message */}
            {(isExpanded || (status !== 'idle' && status !== 'connecting')) && (
                <div className={`p-3 rounded-2xl shadow-xl mb-2 backdrop-blur-md transition-all max-w-xs ${
                    status === 'error' || !isConfigured
                        ? 'bg-red-500/90 text-white'
                        : 'bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700'
                    }`}>
                    <div className="flex items-start gap-3">
                        <div className="text-sm font-medium">
                            {getStatusMessage()}
                        </div>
                        <button onClick={() => setIsExpanded(false)} className="text-current opacity-70 hover:opacity-100 flex-shrink-0">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Orb Button */}
            <button
                onClick={handleToggle}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${getButtonStyles()}`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
            >
                {/* Ping Animation for Active Listening */}
                {status === 'listening' && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75 animate-ping"></span>
                )}

                <div className="relative z-10">
                    {getIcon()}
                </div>
            </button>
        </div>
    );
};

export default VoiceCopilotOverlay;
