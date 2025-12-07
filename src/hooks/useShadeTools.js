import { useEffect, useMemo } from 'react';
import { useVoiceCopilot } from '../contexts/VoiceCopilotContext';

export const useShadeTools = ({
    formData,
    setFormData,
    activeTab,
    shade,
    onClose,
    onSave
}) => {
    const { registerTools, unregisterTools } = useVoiceCopilot();

    // Field Mapping (AI "top width" -> form "widthTop")
    const fieldMap = useMemo(() => ({
        'top width': 'widthTop',
        'middle width': 'widthMiddle',
        'bottom width': 'widthBottom',
        'left height': 'heightLeft',
        'center height': 'heightCenter',
        'right height': 'heightRight',
        'width': 'widthTop', // sloppy matching
        'height': 'heightLeft'
    }), []);

    // Tool Definitions
    const tools = useMemo(() => [
        {
            name: "set_measurement",
            description: "Record a measurement for the current shade.",
            parameters: {
                type: "OBJECT",
                properties: {
                    field: {
                        type: "STRING",
                        description: "The dimension being measured (e.g., 'top width', 'left height')."
                    },
                    value: {
                        type: "NUMBER",
                        description: "The measurement value in inches (decimals allowed)."
                    }
                },
                required: ["field", "value"]
            },
            execute: async ({ field, value }) => {
                const key = fieldMap[field.toLowerCase()] || field;
                console.log(`[ShadeTools] Setting ${key} to ${value}`);

                setFormData(prev => ({
                    ...prev,
                    [key]: value.toString()
                }));

                return { success: true, message: `Set ${field} to ${value}` };
            }
        },
        {
            name: "get_current_context",
            description: "Get the current shade details and filled measurements.",
            parameters: { type: "OBJECT", properties: {} },
            execute: async () => {
                return {
                    shadeName: shade?.name,
                    room: shade?.room?.name,
                    currentValues: formData
                };
            }
        },
        {
            name: "save_and_close",
            description: "Save the current measurements and close the modal.",
            parameters: { type: "OBJECT", properties: {} },
            execute: async () => {
                onSave();
                return { success: true, message: "Measurements saved." };
            }
        }
    ], [formData, fieldMap, shade, onSave, setFormData]);

    // Register/Unregister
    useEffect(() => {
        registerTools(tools);
        return () => unregisterTools(tools.map(t => t.name));
    }, [registerTools, unregisterTools, tools]);
};
