import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useVoiceCopilot } from '../contexts/AIBrainContext';
import { projectShadeService } from '../services/projectShadeService';

/**
 * useShadeTools - Voice AI tools for the ShadeMeasurementModal (inside a specific shade)
 *
 * Provides guided workflow for measuring 6 dimensions:
 * - 3 width measurements (top, middle, bottom)
 * - 3 height measurements (left, center, right)
 *
 * The AI will guide the tech through each measurement and confirm values.
 *
 * IMPORTANT: Uses refs for callbacks to prevent stale closure issues.
 * The tool execute functions read from refs to always get the current callbacks.
 */
export const useShadeTools = ({
    formData,
    setFormData,
    activeTab,
    shade,
    onClose,
    onSave,
    onNextShade,  // Optional: callback to advance to next shade after saving
    setActiveField  // Optional: callback to highlight the currently focused field
}) => {
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // ===== REFS FOR STABLE CALLBACKS =====
    // These refs ensure tool execute functions always have access to current callbacks
    // This prevents stale closure issues when tools are stored in the context Map
    const setFormDataRef = useRef(setFormData);
    const setActiveFieldRef = useRef(setActiveField);
    const onSaveRef = useRef(onSave);
    const onCloseRef = useRef(onClose);
    const formDataRef = useRef(formData);
    const shadeRef = useRef(shade);
    const activeTabRef = useRef(activeTab);

    // Keep refs updated
    useEffect(() => {
        setFormDataRef.current = setFormData;
        setActiveFieldRef.current = setActiveField;
        onSaveRef.current = onSave;
        onCloseRef.current = onClose;
        formDataRef.current = formData;
        shadeRef.current = shade;
        activeTabRef.current = activeTab;
    }, [setFormData, setActiveField, onSave, onClose, formData, shade, activeTab]);

    // Field Mapping - maps spoken phrases to form field names
    const fieldMap = useMemo(() => ({
        // Width measurements
        'top width': 'widthTop',
        'top': 'widthTop',
        'width top': 'widthTop',
        'middle width': 'widthMiddle',
        'middle': 'widthMiddle',
        'width middle': 'widthMiddle',
        'center width': 'widthMiddle',
        'bottom width': 'widthBottom',
        'bottom': 'widthBottom',
        'width bottom': 'widthBottom',

        // Height measurements
        'left height': 'heightLeft',
        'left': 'heightLeft',
        'height left': 'heightLeft',
        'left side': 'heightLeft',
        'center height': 'heightCenter',
        'center': 'heightCenter',
        'height center': 'heightCenter',
        'right height': 'heightRight',
        'right': 'heightRight',
        'height right': 'heightRight',
        'right side': 'heightRight',

        // Fallback shortcuts
        'width': 'widthTop',
        'height': 'heightLeft'
    }), []);

    // Measurement sequence for guided workflow
    const measurementSequence = useMemo(() => [
        { key: 'widthTop', spoken: 'top width', prompt: 'Give me the width at the top' },
        { key: 'widthMiddle', spoken: 'middle width', prompt: 'Now the width in the middle' },
        { key: 'widthBottom', spoken: 'bottom width', prompt: 'And the width at the bottom' },
        { key: 'heightLeft', spoken: 'left height', prompt: 'Now for heights - give me the left side height' },
        { key: 'heightCenter', spoken: 'center height', prompt: 'The height in the center' },
        { key: 'heightRight', spoken: 'right height', prompt: 'And finally the right side height' }
    ], []);

    // Determine which measurements are complete - uses ref for current formData
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

    // Get the next measurement to prompt for
    const getNextMeasurement = useCallback(() => {
        const { missing } = getMeasurementStatus();
        return missing[0] || null;
    }, [getMeasurementStatus]);

    // ===== TOOL DEFINITIONS =====
    // Tools are created once and use refs to access current state/callbacks
    // This prevents tools from being re-created on every render
    const tools = useMemo(() => [
        {
            name: "set_measurement",
            description: "Record a measurement value for the current shade. Use this when the technician tells you a measurement. Fields: 'top width', 'middle width', 'bottom width', 'left height', 'center height', 'right height'",
            parameters: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Which measurement: 'top width', 'middle width', 'bottom width', 'left height', 'center height', or 'right height'"
                    },
                    value: {
                        type: "number",
                        description: "The measurement in inches (decimals OK, e.g., 52.25 for 52 and a quarter)"
                    }
                },
                required: ["field", "value"]
            },
            execute: async ({ field, value }) => {
                const fieldLower = field.toLowerCase().trim();
                const key = fieldMap[fieldLower] || fieldLower;

                // Validate it's a known field
                const validKeys = ['widthTop', 'widthMiddle', 'widthBottom', 'heightLeft', 'heightCenter', 'heightRight'];
                if (!validKeys.includes(key)) {
                    return {
                        success: false,
                        error: `Unknown measurement field: ${field}`,
                        validFields: ['top width', 'middle width', 'bottom width', 'left height', 'center height', 'right height']
                    };
                }

                console.log(`[ShadeTools] Setting ${key} to ${value}`);

                // Highlight the field being updated (via ref)
                const setActiveFieldFn = setActiveFieldRef.current;
                if (setActiveFieldFn) {
                    console.log(`[ShadeTools] Highlighting field: ${key}`);
                    setActiveFieldFn(key);
                    // Clear highlight after 2 seconds
                    setTimeout(() => {
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(null);
                        }
                    }, 2000);
                }

                // Update form data (via ref)
                const setFormDataFn = setFormDataRef.current;
                if (setFormDataFn) {
                    console.log(`[ShadeTools] Calling setFormData for ${key}=${value}`);
                    setFormDataFn(prev => ({
                        ...prev,
                        [key]: value.toString()
                    }));
                } else {
                    console.error('[ShadeTools] setFormData ref is null!');
                }

                // AUTO-SAVE to database immediately (don't wait for explicit save)
                const currentShade = shadeRef.current;
                const currentTab = activeTabRef.current;
                if (currentShade?.id) {
                    try {
                        await projectShadeService.autoSaveMeasurementField(
                            currentShade.id,
                            key,
                            value.toString(),
                            currentTab === 'm2' ? 'm2' : 'm1'
                        );
                        console.log(`[ShadeTools] Auto-saved ${key} to database`);
                    } catch (err) {
                        console.error(`[ShadeTools] Auto-save failed:`, err);
                        // Don't fail the tool - just log the error
                    }
                }

                // Check what's next after this update
                const currentFormData = formDataRef.current;
                const completed = [];
                const missing = [];
                measurementSequence.forEach(m => {
                    // For the field we just set, consider it complete
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

                // If there's a next field, highlight it after a delay
                if (nextMeasurement && setActiveFieldRef.current) {
                    setTimeout(() => {
                        console.log(`[ShadeTools] Pre-highlighting next field: ${nextMeasurement.key}`);
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(nextMeasurement.key);
                        }
                    }, 2500);
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
                        ? "All measurements recorded! Say 'save' to save this shade, or 'read them back' to review."
                        : nextMeasurement.prompt
                };
            }
        },
        {
            name: "get_shade_context",
            description: "Get information about the current shade being measured: name, room, quoted dimensions, M1/M2 status, and which measurements have been recorded vs still needed. ALWAYS call this first when the user asks about measuring.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const currentShade = shadeRef.current;
                const currentTab = activeTabRef.current;
                const { completed, missing, allComplete } = getMeasurementStatus();

                // Determine M1/M2 status
                const m1Complete = currentShade?.m1_complete || false;
                const m2Complete = currentShade?.m2_complete || false;
                const currentMeasureRound = currentTab === 'm2' ? 'M2' : 'M1';

                return {
                    shade: {
                        name: currentShade?.name,
                        room: currentShade?.room?.name,
                        quotedWidth: currentShade?.quoted_width,
                        quotedHeight: currentShade?.quoted_height,
                        mountType: currentShade?.mount_type,
                        technology: currentShade?.technology,
                        m1Complete: m1Complete,
                        m2Complete: m2Complete
                    },
                    currentMeasureRound: currentMeasureRound,
                    measurementTab: currentTab,
                    measurements: {
                        completed: completed.map(m => ({ field: m.spoken, value: m.value })),
                        missing: missing.map(m => m.spoken),
                        allComplete
                    },
                    nextPrompt: missing[0]?.prompt || `All ${currentMeasureRound} measurements done! Ready to save.`,
                    hint: allComplete
                        ? `All 6 ${currentMeasureRound} measurements recorded. Say 'save' to complete this ${currentMeasureRound}.${currentTab === 'm1' && !m2Complete ? ' After saving, you can switch to M2 tab for second measurements.' : ''}`
                        : `${completed.length} of 6 ${currentMeasureRound} measurements done. ${missing[0]?.prompt}`
                };
            }
        },
        {
            name: "read_back_measurements",
            description: "Read back all the measurements that have been recorded for this shade so the technician can verify them.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const currentShade = shadeRef.current;
                const { completed, missing } = getMeasurementStatus();

                return {
                    shadeName: currentShade?.name,
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
            description: "Clear/reset a specific measurement if the technician made an error.",
            parameters: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Which measurement to clear"
                    }
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
                    setFormDataFn(prev => ({
                        ...prev,
                        [key]: ''
                    }));
                }

                // Highlight the cleared field
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
            name: "save_shade_measurements",
            description: "Save the current measurements and mark this shade as complete. Use when the tech says 'save' or 'done'. Note: Individual measurements are auto-saved as you go, but this marks the shade complete.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const { completed, missing, allComplete } = getMeasurementStatus();
                const currentShade = shadeRef.current;

                // Photo requirement disabled - can save anytime
                // Just warn if measurements are incomplete
                if (!allComplete && missing.length > 0) {
                    // Allow save anyway - just inform them
                    console.log(`[ShadeTools] Saving with ${missing.length} missing measurements`);
                }

                // Call the save handler via ref
                const onSaveFn = onSaveRef.current;
                if (onSaveFn) {
                    try {
                        onSaveFn();
                        return {
                            success: true,
                            message: `Saved ${currentShade?.name}!`,
                            measurementsRecorded: completed.length,
                            missingCount: missing.length,
                            hint: missing.length > 0
                                ? `Saved with ${missing.length} measurements still pending. Say 'next shade' to continue.`
                                : "All measurements saved. Say 'next shade' to continue or close the modal."
                        };
                    } catch (err) {
                        return {
                            success: false,
                            error: `Failed to save: ${err.message}`
                        };
                    }
                } else {
                    return {
                        success: false,
                        error: "Save function not available"
                    };
                }
            }
        },
        {
            name: "close_without_saving",
            description: "Close the measurement modal without saving. Use if the tech wants to cancel or skip this shade.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const onCloseFn = onCloseRef.current;
                if (onCloseFn) {
                    onCloseFn();
                    return {
                        success: true,
                        message: "Closed without saving. Back to the shade list."
                    };
                }
                return {
                    success: false,
                    error: "Close function not available"
                };
            }
        },
        {
            name: "navigate_to_field",
            description: "Navigate to and highlight a specific measurement field. Use when the tech asks to 'go to' or 'focus on' a field, or when you need to show them which field to measure next.",
            parameters: {
                type: "object",
                properties: {
                    field: {
                        type: "string",
                        description: "Which measurement field to navigate to: 'top width', 'middle width', 'bottom width', 'left height', 'center height', or 'right height'"
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
                        validFields: ['top width', 'middle width', 'bottom width', 'left height', 'center height', 'right height']
                    };
                }

                // Highlight the field
                const setActiveFieldFn = setActiveFieldRef.current;
                if (setActiveFieldFn) {
                    console.log(`[ShadeTools] Navigating to field: ${key}`);
                    setActiveFieldFn(key);

                    // Keep highlighted for 5 seconds for navigation
                    setTimeout(() => {
                        if (setActiveFieldRef.current) {
                            setActiveFieldRef.current(null);
                        }
                    }, 5000);
                }

                // Get current value if any
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
        }
    ], [fieldMap, measurementSequence, getMeasurementStatus]); // Minimal deps - refs handle the rest

    // Register tools once when shade changes (not on every formData change)
    useEffect(() => {
        console.log('[ShadeTools] Registering measurement tools for', shade?.name);
        registerTools(tools);

        return () => {
            console.log('[ShadeTools] Unregistering measurement tools');
            unregisterTools(tools.map(t => t.name));
        };
    }, [tools, registerTools, unregisterTools, shade?.name]);

    return {
        getMeasurementStatus,
        getNextMeasurement,
        measurementSequence
    };
};

export default useShadeTools;
