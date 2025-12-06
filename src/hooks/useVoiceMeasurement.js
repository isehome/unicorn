import { useState, useEffect, useRef, useCallback } from 'react';

// Browser compatibility helper
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Helper to parse spoken fractions and numbers
const parseSpokenDimension = (text) => {
    const clean = text.toLowerCase().trim();

    // Quick keyword replacements for common fractions
    const replacements = {
        'half': '.5',
        'quarter': '.25',
        'eighth': '.125',
        'sixteenth': '.0625',
        'three quarters': '.75',
        'five eighths': '.625',
        'seven eighths': '.875'
    };

    let processed = clean;
    // Replace "thirty five" -> "35" if possible (simple regex or let specific libraries handle it)
    // For prototype, we rely on browser's "35" output, but handle the fraction part.

    // Handle "and a [fraction]"
    Object.entries(replacements).forEach(([word, val]) => {
        if (processed.includes(word)) {
            // "35 and a half" -> "35 .5" (roughly)
            // Or just append the decimal if user said "35 [pause] half"
            if (processed.includes('and a')) {
                processed = processed.replace('and a ' + word, val);
            } else if (processed.includes('and')) {
                processed = processed.replace('and ' + word, val);
            } else {
                // "35 half"
                processed = processed.replace(word, val);
            }
        }
    });

    // Extract numbers
    // This simple regex looks for integers and floats
    const matches = processed.match(/(\d+(\.\d+)?)/g);

    if (!matches) return null;

    // If we have "35" and ".5", sum them
    if (matches.length > 1) {
        // e.g. ["35", ".5"]
        // Check if one is a pure decimal
        const whole = parseFloat(matches[0]);
        const frac = parseFloat(matches[1]);
        if (frac < 1) return whole + frac;
    }

    return parseFloat(matches[0]);
};

export const useVoiceMeasurement = ({ onFieldUpdate }) => {
    // State
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, speaking, listening, confirming
    const [transcript, setTranscript] = useState('');
    const [currentStep, setCurrentStep] = useState(0);
    const [pendingValue, setPendingValue] = useState(null);

    // Refs for API instances
    const recognition = useRef(null);
    const synthesis = useRef(window.speechSynthesis);

    // Flow Configuration
    const steps = [
        { key: 'widthTop', label: 'Top Width' },
        { key: 'widthMiddle', label: 'Middle Width' },
        { key: 'widthBottom', label: 'Bottom Width' },
        // Could expand to Height later
    ];

    // --- Speech Synthesis (TTS) ---
    const speak = useCallback((text, onEnd) => {
        if (!synthesis.current) return;

        // Cancel any current speech
        synthesis.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0; // Normal speed
        utterance.onend = () => {
            if (onEnd) onEnd();
        };

        setStatus('speaking');
        synthesis.current.speak(utterance);
    }, []);

    // --- Speech Recognition (STT) ---
    useEffect(() => {
        if (SpeechRecognition) {
            const r = new SpeechRecognition();
            r.continuous = false; // We want single interactions
            r.interimResults = false;
            r.lang = 'en-US';

            r.onstart = () => setStatus('listening');

            r.onresult = (event) => {
                const text = event.results[0][0].transcript;
                console.log('Voice result:', text);
                setTranscript(text);
                handleInput(text);
            };

            r.onerror = (event) => {
                console.error('Speech error:', event.error);
                if (status === 'listening') {
                    speak("I didn't catch that. Please say it again.", startListening);
                }
            };

            recognition.current = r;
        }
    }, [status]); // Re-bind if status logic depends on it (simpler to keep stable)

    const startListening = () => {
        try {
            recognition.current?.start();
        } catch (e) {
            console.warn('Recognition already started', e);
        }
    };

    const stopListening = () => {
        recognition.current?.stop();
    };

    // --- Core Logic Loop ---

    const startSession = () => {
        setIsActive(true);
        setCurrentStep(0);
        // Delay slightly or ensure wake lock here
        setTimeout(() => runStep(0), 500);
    };

    const runStep = (stepIndex) => {
        if (stepIndex >= steps.length) {
            speak("All width checks complete. Stopping voice mode.");
            setIsActive(false);
            setStatus('idle');
            return;
        }

        const step = steps[stepIndex];
        setTranscript('');
        speak(`Ready. What is the ${step.label}?`, () => {
            startListening();
        });
    };

    const handleInput = (text) => {
        // Check for navigation commands
        if (text.toLowerCase().includes('stop') || text.toLowerCase().includes('cancel')) {
            speak("Stopping voice mode.");
            setIsActive(false);
            return;
        }

        // If we are waiting for a measurement
        if (!pendingValue) {
            const val = parseSpokenDimension(text);
            if (val !== null && !isNaN(val)) {
                setPendingValue(val);
                speak(`I heard ${val}. Is that correct?`, startListening);
            } else {
                speak("I didn't understand the number. Please try again.", startListening);
            }
        }
        // If we are waiting for confirmation (Yes/No)
        else {
            const clean = text.toLowerCase();
            if (clean.includes('yes') || clean.includes('correct') || clean.includes('yeah')) {
                // Save
                const step = steps[currentStep];
                onFieldUpdate(step.key, pendingValue.toString());

                speak("Saved.", () => {
                    setPendingValue(null);
                    setCurrentStep(prev => {
                        const next = prev + 1;
                        runStep(next);
                        return next;
                    });
                });
            } else {
                // Retry specific step
                setPendingValue(null);
                speak("Okay, let's try again.", () => {
                    runStep(currentStep);
                });
            }
        }
    };

    const stopSession = () => {
        synthesis.current?.cancel();
        stopListening();
        setIsActive(false);
        setStatus('idle');
    };

    return {
        isActive,
        status, // 'listening', 'speaking', 'idle'
        transcript,
        currentStepLabel: steps[currentStep]?.label,
        startSession,
        stopSession
    };
};
