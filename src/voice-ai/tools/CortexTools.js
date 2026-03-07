/**
 * CortexTools.js
 * Tool definitions for Cortex (Stephe's personal AI assistant)
 *
 * Cortex runs as a Gemini voice agent with specialized tools for:
 * - Deep reasoning via Claude API
 * - Browser navigation and research
 * - Document display and task management
 *
 * ARCHITECTURE:
 * - Tools are provider-agnostic (defined once, converted for Gemini/OpenAI/etc)
 * - Uses ToolRegistry pattern from ToolRegistry.js
 * - Each tool returns ToolResult with success/data/error
 * - Gemini voice calls these via function declarations
 */

import { ToolRegistry, ToolDefinition, ToolParameter, ToolResult } from './ToolRegistry.js';

/**
 * Create the Cortex tool registry
 * Contains tools for deep thinking, browser control, and canvas display
 */
export const createCortexToolRegistry = () => {
  const registry = new ToolRegistry();

  registry.registerAll([
    // ================================
    // REASONING & ANALYSIS
    // ================================

    new ToolDefinition({
      name: 'deep_think',
      description:
        'Use this for complex questions, analysis, planning, writing tasks, or anything that requires deep reasoning. Routes to a more powerful AI model.',
      category: 'reasoning',
      parameters: [
        new ToolParameter({
          name: 'query',
          type: 'string',
          description: 'The question, task, or topic to think deeply about',
          required: true,
        }),
        new ToolParameter({
          name: 'context',
          type: 'string',
          description: 'Optional additional context or background information',
          required: false,
        }),
      ],
      handler: async (args) => {
        try {
          const { query, context } = args;

          // Build messages array for Claude
          const messages = [];

          if (context) {
            messages.push({
              role: 'user',
              content: `Context: ${context}\n\nQuestion: ${query}`,
            });
          } else {
            messages.push({
              role: 'user',
              content: query,
            });
          }

          // Call the Cortex chat API endpoint
          const response = await fetch('/api/cortex/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.error || `API returned ${response.status}`
            );
          }

          const data = await response.json();
          const responseText = data.message || data.content || data.text || '';

          return ToolResult.success(responseText);
        } catch (error) {
          console.error('[CortexTools] deep_think error:', error);

          // Return helpful fallback message
          const fallback =
            'I encountered an issue while deep thinking. Let me try a simpler approach instead.';
          return ToolResult.error(error.message, fallback);
        }
      },
    }),

    // ================================
    // BROWSER & NAVIGATION
    // ================================

    new ToolDefinition({
      name: 'open_browser',
      description:
        'Open a website in the Cortex browser canvas. Use when the user asks to visit a website or look something up online.',
      category: 'browser',
      parameters: [
        new ToolParameter({
          name: 'url',
          type: 'string',
          description: 'The URL to navigate to (include http:// or https://)',
          required: true,
        }),
      ],
      handler: async (args) => {
        const { url } = args;

        // Return action object for CortexPage to handle
        return ToolResult.success({
          action: 'browser',
          url,
        });
      },
    }),

    // ================================
    // CANVAS DISPLAY
    // ================================

    new ToolDefinition({
      name: 'show_document',
      description:
        'Display a document, note, or long-form content on the canvas for the user to read.',
      category: 'display',
      parameters: [
        new ToolParameter({
          name: 'title',
          type: 'string',
          description: 'Title of the document',
          required: true,
        }),
        new ToolParameter({
          name: 'content',
          type: 'string',
          description: 'The document content to display',
          required: true,
        }),
      ],
      handler: async (args) => {
        const { title, content } = args;

        return ToolResult.success({
          action: 'document',
          title,
          content,
        });
      },
    }),

    new ToolDefinition({
      name: 'show_tasks',
      description: 'Display a task list on the canvas.',
      category: 'display',
      parameters: [
        new ToolParameter({
          name: 'tasks',
          type: 'array',
          description: 'Array of task objects with title and status properties',
          required: true,
        }),
      ],
      handler: async (args) => {
        const { tasks } = args;

        // Validate tasks format
        if (!Array.isArray(tasks)) {
          return ToolResult.error('Tasks must be an array');
        }

        // Ensure each task has required properties
        const validatedTasks = tasks.map((task) => ({
          title: task.title || 'Untitled',
          status: task.status || 'pending',
        }));

        return ToolResult.success({
          action: 'tasks',
          tasks: validatedTasks,
        });
      },
    }),
  ]);

  return registry;
};

export default createCortexToolRegistry;
