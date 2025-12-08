import { useEffect, useMemo, useCallback } from 'react';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';

/**
 * useShadeTools - Voice AI tools for the ShadeMeasurementModal (inside a specific shade)
 *
 * Provides guided workflow for measuring 6 dimensions:
 * - 3 width measurements (top, middle, bottom)
 * - 3 height measurements (left, center, right)
 *
 * The AI will guide the tech through each measurement and confirm values.
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

    // Determine which measurements are complete
    const getMeasurementStatus = useCallback(() => {
        const completed = [];
        const missing = [];

        measurementSequence.forEach(m => {
            const value = formData[m.key];
            if (value && value.toString().trim() !== '') {
                completed.push({ ...m, value });
            } else {
                missing.push(m);
            }
        });

        return { completed, missing, allComplete: missing.length === 0 };
    }, [formData, measurementSequence]);

    // Get the next measurement to prompt for
    const getNextMeasurement = useCallback(() => {
        const { missing } = getMeasurementStatus();
        return missing[0] || null;
    }, [getMeasurementStatus]);

    // Tool Definitions
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

                // Highlight the field being updated
                if (setActiveField) {
                    setActiveField(key);
                    // Clear highlight after 2 seconds
                    setTimeout(() => setActiveField(null), 2000);
                }

                setFormData(prev => ({
                    ...prev,
                    [key]: value.toString()
                }));

                // Check what's next after this update
                const currentStatus = getMeasurementStatus();
                // Account for the one we just set
                const remainingAfterThis = currentStatus.missing.filter(m => m.key !== key);
                const nextMeasurement = remainingAfterThis[0];

                return {
                    success: true,
                    recorded: { field: fieldLower, value, formKey: key },
                    nextMeasurement: nextMeasurement ? {
                        field: nextMeasurement.spoken,
                        prompt: nextMeasurement.prompt
                    } : null,
                    allComplete: remainingAfterThis.length === 0,
                    hint: remainingAfterThis.length === 0
                        ? "All measurements recorded! Say 'save' to save this shade, or 'read them back' to review."
                        : nextMeasurement.prompt
                };
            }
        },
        {
            name: "get_shade_context",
            description: "Get information about the current shade being measured: name, room, quoted dimensions, and which measurements have been recorded vs still needed.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const { completed, missing, allComplete } = getMeasurementStatus();

                return {
                    shade: {
                        name: shade?.name,
                        room: shade?.room?.name,
                        quotedWidth: shade?.quoted_width,
                        quotedHeight: shade?.quoted_height,
                        mountType: shade?.mount_type,
                        technology: shade?.technology
                    },
                    measurementTab: activeTab,
                    measurements: {
                        completed: completed.map(m => ({ field: m.spoken, value: m.value })),
                        missing: missing.map(m => m.spoken),
                        allComplete
                    },
                    nextPrompt: missing[0]?.prompt || "All measurements done! Ready to save.",
                    hint: allComplete
                        ? "All 6 measurements recorded. Say 'save' to complete this shade."
                        : `${completed.length} of 6 measurements done. ${missing[0]?.prompt}`
                };
            }
        },
        {
            name: "read_back_measurements",
            description: "Read back all the measurements that have been recorded for this shade so the technician can verify them.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const { completed, missing } = getMeasurementStatus();

                return {
                    shadeName: shade?.name,
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

                setFormData(prev => ({
                    ...prev,
                    [key]: ''
                }));

                return {
                    success: true,
                    cleared: field,
                    message: `Cleared ${field}. What's the correct value?`
                };
            }
        },
        {
            name: "save_shade_measurements",
            description: "Save the current measurements and complete this shade. Use when all measurements are done or when the tech says to save.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                const { completed, missing, allComplete } = getMeasurementStatus();

                if (!allComplete && missing.length > 0) {
                    return {
                        success: false,
                        warning: `Still missing ${missing.length} measurements: ${missing.map(m => m.spoken).join(', ')}`,
                        hint: "Do you want to save anyway, or finish measuring first?"
                    };
                }

                // Call the save handler
                try {
                    onSave();
                    return {
                        success: true,
                        message: `Saved ${shade?.name}!`,
                        measurementsRecorded: completed.length,
                        hint: onNextShade
                            ? "Say 'next shade' to move to the next window, or 'done' to stop."
                            : "Shade saved. Close the modal to return to the list."
                    };
                } catch (err) {
                    return {
                        success: false,
                        error: `Failed to save: ${err.message}`
                    };
                }
            }
        },
        {
            name: "close_without_saving",
            description: "Close the measurement modal without saving. Use if the tech wants to cancel or skip this shade.",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                onClose();
                return {
                    success: true,
                    message: "Closed without saving. Back to the shade list."
                };
            }
        }
    ], [formData, fieldMap, shade, activeTab, onSave, onClose, onNextShade, setFormData, setActiveField, getMeasurementStatus]);

    // Register/update tools when they change
    // Tools change when formData changes (to capture latest measurement values)
    useEffect(() => {
        console.log('[ShadeTools] Registering/updating measurement tools for', shade?.name);
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
