import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/AIBrainContext';

/**
 * useShadeDetailTools - Voice AI tools for the ShadeDetailPage
 *
 * This is for the PAGE-based shade detail view (not the modal).
 * Provides guided workflow for measuring:
 * - 3 width measurements (top, middle, bottom)
 * - 1 height measurement
 * - mount depth
 *
 * The AI will guide the tech through each measurement and confirm values.
 */
export const useShadeDetailTools = ({
    formData,
    setFormData,
    activeTab,
    shade,
    onMarkComplete,
    setActiveField,  // Callback to highlight the currently focused field
    onNavigateBack   // Callback to go back to shade list
}) => {
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // Refs for stable callbacks
    const setFormDataRef = useRef(setFormData);
    const setActiveFieldRef = useRef(setActiveField);
    const onMarkCompleteRef = useRef(onMarkComplete);
    const onNavigateBackRef = useRef(onNavigateBack);
    const formDataRef = useRef(formData);
    const shadeRef = useRef(shade);
    const activeTabRef = useRef(activeTab);

    // Keep refs updated
    useEffect(() => {
        setFormDataRef.current = setFormData;
        setActiveFieldRef.current = setActiveField;
        onMarkCompleteRef.current = onMarkComplete;
        onNavigateBackRef.current = onNavigateBack;
        formDataRef.current = formData;
        shadeRef.current = shade;
        activeTabRef.current = activeTab;
    }, [setFormData, setActiveField, onMarkComplete, onNavigateBack, formData, shade, activeTab]);

    // Field mapping for this page's structure
    const fieldMap = useMemo(() => ({
        // Width measurements
        'top width': 'widthTop',
        'top': 'widthTop',
        'width top': 'widthTop',
        'width 1': 'widthTop',
        'first width': 'widthTop',
        'middle width': 'widthMiddle',
        'middle': 'widthMiddle',
        'width middle': 'widthMiddle',
        'width 2': 'widthMiddle',
        'second width': 'widthMiddle',
        'center width': 'widthMiddle',
        'bottom width': 'widthBottom',
        'bottom': 'widthBottom',
        'width bottom': 'widthBottom',
        'width 3': 'widthBottom',
        'third width': 'widthBottom',
        // Height
        'height': 'height',
        'the height': 'height',
        // Mount depth
        'mount depth': 'mountDepth',
        'depth': 'mountDepth',
        'mount': 'mountDepth'
    }), []);

    // Measurement sequence for guided workflow
    const measurementSequence = useMemo(() => [
        { key: 'widthTop', spoken: 'top width', prompt: 'Give me the width at the top' },
        { key: 'widthMiddle', spoken: 'middle width', prompt: 'Now the width in the middle' },
        { key: 'widthBottom', spoken: 'bottom width', prompt: 'And the width at the bottom' },
        { key: 'height', spoken: 'height', prompt: 'Now give me the height' },
        { key: 'mountDepth', spoken: 'mount depth', prompt: 'Finally, the mount depth' }
    ], []);

    // Get measurement status
    const getMeasurementStatus = useCallback(() => {
        const currentFormData = formDataRef.current;
        const completed = [];
        const missing = [];

        measurementSequence.forEach(m => {
            const value = currentFormData[m.key];
            if (value && value.toString().trim() !== '') {
                completed.push({ ...m, value });
            } else {
                missing.push(m);
            }
        });

        return { completed, missing, allComplete: missing.length === 0 };
    }, [measurementSequence]);

    // Tool definitions
    const tools = useMemo(() => [
        {
            name: "set_measurement",
            description: "Record a measurement value. Fields: 'top width', 'middle width', 'bottom width', 'height', 'mount depth'",
            parameters: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Which measurement: 'top width', 'middle width', 'bottom width', 'height', or 'mount depth'"
                    },
                    value: {
                        type: "number",
                        description: "The measurement in inches (decimals OK, e.g., 52.25)"
                    }
                },
                required: ["field", "value"]
            },
            execute: async ({ field, value }) => {
                const fieldLower = field.toLowerCase().trim();
                const key = fieldMap[fieldLower];

                const validKeys = ['widthTop', 'widthMiddle', 'widthBottom', 'height', 'mountDepth'];
                if (!key || !validKeys.includes(key)) {
                    return {
                        success: false,
                        error: `Unknown field: ${field}`,
                        validFields: ['top width', 'middle width', 'bottom width', 'height', 'mount depth']
                    };
                }

                console.log(`[ShadeDetailTools] Setting ${key} to ${value}`);

                // Highlight the field
                const setActiveFieldFn = setActiveFieldRef.current;
                if (setActiveFieldFn) {
                    setActiveFieldFn(key);
                    setTimeout(() => {
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(null);
                        }
                    }, 2000);
                }

                // Update form data
                const setFormDataFn = setFormDataRef.current;
                if (setFormDataFn) {
                    setFormDataFn(prev => ({
                        ...prev,
                        [key]: value.toString()
                    }));
                }

                // Figure out what's next
                const currentFormData = formDataRef.current;
                const completed = [];
                const missing = [];
                measurementSequence.forEach(m => {
                    if (m.key === key) {
                        completed.push({ ...m, value });
                    } else {
                        const existingValue = currentFormData[m.key];
                        if (existingValue && existingValue.toString().trim() !== '') {
                            completed.push({ ...m, value: existingValue });
                        } else {
                            missing.push(m);
                        }
                    }
                });

                const nextMeasurement = missing[0];

                // Pre-highlight next field
                if (nextMeasurement && setActiveFieldRef.current) {
                    setTimeout(() => {
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(nextMeasurement.key);
                        }
                    }, 2000);
                }

                return {
                    success: true,
                    recorded: { field: fieldLower, value, formKey: key },
                    nextMeasurement: nextMeasurement ? {
                        field: nextMeasurement.spoken,
                        prompt: nextMeasurement.prompt
                    } : null,
                    allComplete: missing.length === 0,
                    hint: missing.length === 0
                        ? "All measurements recorded! Say 'mark complete' to finish."
                        : nextMeasurement.prompt
                };
            }
        },
        {
            name: "get_shade_context",
            description: "Get information about the current shade: name, room, measurements recorded vs needed. CALL THIS FIRST when starting to measure.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const currentShade = shadeRef.current;
                const currentTab = activeTabRef.current;
                const { completed, missing, allComplete } = getMeasurementStatus();

                return {
                    shade: {
                        name: currentShade?.shade_name || currentShade?.name,
                        room: currentShade?.room?.name,
                        quotedWidth: currentShade?.quoted_width,
                        quotedHeight: currentShade?.quoted_height,
                        mountType: currentShade?.mount_type,
                        technology: currentShade?.technology,
                        m1Complete: currentShade?.m1_complete,
                        m2Complete: currentShade?.m2_complete
                    },
                    currentMeasureRound: currentTab === 'm2' ? 'M2' : 'M1',
                    measurements: {
                        completed: completed.map(m => ({ field: m.spoken, value: m.value })),
                        missing: missing.map(m => m.spoken),
                        allComplete
                    },
                    nextPrompt: missing[0]?.prompt || 'All measurements done! Say "mark complete" to finish.',
                    hint: allComplete
                        ? 'All measurements recorded. Say "mark complete" to finish this round.'
                        : `${completed.length} of 5 measurements done. ${missing[0]?.prompt}`
                };
            }
        },
        {
            name: "navigate_to_field",
            description: "Highlight a specific measurement field so the tech can see which one you're asking about.",
            parameters: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Which field: 'top width', 'middle width', 'bottom width', 'height', or 'mount depth'"
                    }
                },
                required: ["field"]
            },
            execute: async ({ field }) => {
                const fieldLower = field.toLowerCase().trim();
                const key = fieldMap[fieldLower];

                if (!key) {
                    return {
                        success: false,
                        error: `Unknown field: ${field}`,
                        validFields: ['top width', 'middle width', 'bottom width', 'height', 'mount depth']
                    };
                }

                const setActiveFieldFn = setActiveFieldRef.current;
                if (setActiveFieldFn) {
                    console.log(`[ShadeDetailTools] Highlighting field: ${key}`);
                    setActiveFieldFn(key);

                    // Keep highlighted for 5 seconds
                    setTimeout(() => {
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(null);
                        }
                    }, 5000);
                }

                const currentValue = formDataRef.current[key];
                const measurement = measurementSequence.find(m => m.key === key);

                return {
                    success: true,
                    field: measurement?.spoken || field,
                    currentValue: currentValue || null,
                    message: currentValue
                        ? `Showing ${measurement?.spoken}. Current value is ${currentValue} inches.`
                        : `Showing ${measurement?.spoken}. Ready for measurement.`
                };
            }
        },
        {
            name: "read_back_measurements",
            description: "Read back all recorded measurements for verification.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const currentShade = shadeRef.current;
                const { completed, missing } = getMeasurementStatus();

                return {
                    shadeName: currentShade?.shade_name || currentShade?.name,
                    recorded: completed.map(m => ({
                        field: m.spoken,
                        value: m.value,
                        spoken: `${m.spoken}: ${m.value} inches`
                    })),
                    missing: missing.map(m => m.spoken),
                    summary: completed.length > 0
                        ? `Recorded ${completed.length} measurements: ${completed.map(m => `${m.spoken} is ${m.value}`).join(', ')}`
                        : "No measurements recorded yet."
                };
            }
        },
        {
            name: "clear_measurement",
            description: "Clear a specific measurement if there was an error.",
            parameters: {
                type: "object",
                properties: {
                    field: { type: "string", description: "Which measurement to clear" }
                },
                required: ["field"]
            },
            execute: async ({ field }) => {
                const key = fieldMap[field.toLowerCase().trim()];
                if (!key) {
                    return { success: false, error: `Unknown field: ${field}` };
                }

                const setFormDataFn = setFormDataRef.current;
                if (setFormDataFn) {
                    setFormDataFn(prev => ({ ...prev, [key]: '' }));
                }

                if (setActiveFieldRef.current) {
                    setActiveFieldRef.current(key);
                }

                return {
                    success: true,
                    cleared: field,
                    message: `Cleared ${field}. What's the correct value?`
                };
            }
        },
        {
            name: "mark_measurement_complete",
            description: "Mark the current measurement round (M1 or M2) as complete. Use when tech says 'done', 'complete', 'mark complete', etc.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const { completed, missing } = getMeasurementStatus();
                const onMarkCompleteFn = onMarkCompleteRef.current;

                if (onMarkCompleteFn) {
                    onMarkCompleteFn();
                    return {
                        success: true,
                        message: 'Marked complete!',
                        measurementsRecorded: completed.length,
                        hint: 'Say "go back" or "next shade" to continue.'
                    };
                }

                return { success: false, error: 'Mark complete function not available' };
            }
        },
        {
            name: "go_back_to_shade_list",
            description: "Navigate back to the shade list. Use when tech says 'go back', 'done with this one', 'back to list', etc.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const onNavigateBackFn = onNavigateBackRef.current;

                if (onNavigateBackFn) {
                    onNavigateBackFn();
                    return { success: true, message: 'Going back to shade list.' };
                }

                return { success: false, error: 'Navigate back function not available' };
            }
        }
    ], [fieldMap, measurementSequence, getMeasurementStatus]);

    // Register tools when shade is loaded
    useEffect(() => {
        if (!shade) return;

        console.log('[ShadeDetailTools] Registering measurement tools for', shade?.shade_name || shade?.name);
        registerTools(tools);

        return () => {
            console.log('[ShadeDetailTools] Unregistering measurement tools');
            unregisterTools(tools.map(t => t.name));
        };
    }, [tools, registerTools, unregisterTools, shade]);

    return {
        getMeasurementStatus,
        measurementSequence
    };
};

export default useShadeDetailTools;
