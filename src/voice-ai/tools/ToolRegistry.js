/**
 * ToolRegistry.js
 * Unified tool/function registry for cross-provider compatibility
 *
 * ARCHITECTURE: Provider-agnostic tool definitions
 * - Define tools once in unified format
 * - Convert to provider-specific format when needed
 * - Centralized tool execution
 *
 * Future: MCP (Model Context Protocol) support
 * - MCP is becoming the "USB-C of AI" for tool integration
 * - When ready, add toMCPFormat() method
 */

/**
 * Unified tool parameter definition
 */
export class ToolParameter {
  constructor({
    name,
    type,
    description,
    required = false,
    enumValues = null,
    default: defaultValue = undefined,
  }) {
    this.name = name;
    this.type = type; // 'string', 'number', 'boolean', 'object', 'array'
    this.description = description;
    this.required = required;
    this.enumValues = enumValues;
    this.default = defaultValue;
  }

  /**
   * Convert to JSON Schema format (used by most providers)
   */
  toJSONSchema() {
    const schema = {
      type: this.type,
      description: this.description,
    };

    if (this.enumValues) {
      schema.enum = this.enumValues;
    }

    if (this.default !== undefined) {
      schema.default = this.default;
    }

    return schema;
  }
}

/**
 * Unified tool definition
 */
export class ToolDefinition {
  constructor({
    name,
    description,
    parameters = [],
    handler = null,
    category = 'general',
    requiresContext = false,
  }) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.handler = handler;
    this.category = category;
    this.requiresContext = requiresContext;
  }

  /**
   * Get required parameter names
   */
  getRequiredParams() {
    return this.parameters
      .filter(p => p.required)
      .map(p => p.name);
  }

  /**
   * Convert to provider-agnostic schema
   */
  toSchema() {
    const properties = {};
    this.parameters.forEach(param => {
      properties[param.name] = param.toJSONSchema();
    });

    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties,
        required: this.getRequiredParams(),
      },
    };
  }
}

/**
 * Tool execution result
 */
export class ToolResult {
  constructor({ success, data = null, error = null, message = null }) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.message = message;
    this.timestamp = Date.now();
  }

  static success(data, message = null) {
    return new ToolResult({ success: true, data, message });
  }

  static error(error, message = null) {
    return new ToolResult({ success: false, error, message });
  }
}

/**
 * Tool Registry - Central repository for all tools
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Set(['general']);
    this.contextProvider = null;
  }

  /**
   * Set context provider (for tools that need app context)
   */
  setContextProvider(provider) {
    this.contextProvider = provider;
  }

  /**
   * Register a tool
   */
  register(tool) {
    if (!(tool instanceof ToolDefinition)) {
      throw new Error('Tool must be an instance of ToolDefinition');
    }

    this.tools.set(tool.name, tool);
    this.categories.add(tool.category);

    return this;
  }

  /**
   * Register multiple tools
   */
  registerAll(tools) {
    tools.forEach(tool => this.register(tool));
    return this;
  }

  /**
   * Get tool by name
   */
  get(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Get all tools
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category) {
    return this.getAll().filter(tool => tool.category === category);
  }

  /**
   * Get all categories
   */
  getCategories() {
    return Array.from(this.categories);
  }

  /**
   * Execute a tool
   */
  async execute(toolName, args = {}) {
    const tool = this.get(toolName);

    if (!tool) {
      return ToolResult.error(`Unknown tool: ${toolName}`);
    }

    if (!tool.handler) {
      return ToolResult.error(`No handler for tool: ${toolName}`);
    }

    try {
      // Get context if tool requires it
      let context = null;
      if (tool.requiresContext && this.contextProvider) {
        context = await this.contextProvider();
      }

      // Execute handler
      const result = await tool.handler(args, context);

      // Wrap result if not already a ToolResult
      if (result instanceof ToolResult) {
        return result;
      }

      return ToolResult.success(result);

    } catch (error) {
      console.error(`[ToolRegistry] Error executing ${toolName}:`, error);
      return ToolResult.error(error.message);
    }
  }

  // ================================
  // FORMAT CONVERTERS
  // ================================

  /**
   * Convert all tools to unified schema format
   */
  toSchemas() {
    return this.getAll().map(tool => tool.toSchema());
  }

  /**
   * Convert to Gemini function declarations format
   */
  toGeminiFormat() {
    return [{
      functionDeclarations: this.toSchemas(),
    }];
  }

  /**
   * Convert to OpenAI tools format
   */
  toOpenAIFormat() {
    return this.toSchemas().map(schema => ({
      type: 'function',
      function: schema,
    }));
  }

  /**
   * Convert to Anthropic tool use format
   */
  toAnthropicFormat() {
    return this.toSchemas().map(schema => ({
      name: schema.name,
      description: schema.description,
      input_schema: schema.parameters,
    }));
  }

  /**
   * Convert to MCP (Model Context Protocol) format
   * Future-proofing for when MCP becomes standard
   */
  toMCPFormat() {
    return this.toSchemas().map(schema => ({
      name: schema.name,
      description: schema.description,
      inputSchema: schema.parameters,
    }));
  }

  /**
   * Convert to provider-specific format
   */
  toProviderFormat(provider) {
    switch (provider) {
      case 'gemini':
        return this.toGeminiFormat();
      case 'openai':
        return this.toOpenAIFormat();
      case 'anthropic':
        return this.toAnthropicFormat();
      case 'mcp':
        return this.toMCPFormat();
      default:
        return this.toSchemas();
    }
  }
}

// ================================
// UNICORN DEFAULT TOOLS
// ================================

/**
 * Create the default Unicorn tool registry
 */
export const createUnicornToolRegistry = () => {
  const registry = new ToolRegistry();

  // Core navigation and context tools
  registry.registerAll([
    new ToolDefinition({
      name: 'get_context',
      description: 'Get current app state including view, project, and available actions. CALL THIS FIRST.',
      category: 'core',
      requiresContext: true,
      handler: async (args, context) => context,
    }),

    new ToolDefinition({
      name: 'execute_action',
      description: 'Execute an app action: highlight_field, set_measurement, save_measurements, open_shade, etc.',
      category: 'core',
      parameters: [
        new ToolParameter({
          name: 'action',
          type: 'string',
          description: 'Action name to execute',
          required: true,
        }),
        new ToolParameter({
          name: 'params',
          type: 'object',
          description: 'Parameters for the action',
          required: false,
        }),
      ],
      requiresContext: true,
      handler: async (args, context) => {
        // This will be wired to AppStateContext.executeAction
        if (context?.executeAction) {
          return await context.executeAction(args.action, args.params || {});
        }
        return ToolResult.error('executeAction not available');
      },
    }),

    new ToolDefinition({
      name: 'navigate',
      description: 'Navigate to: dashboard, home, prewire, service, tickets, todos, issues, people, vendors, parts, settings, admin, knowledge, weekly planning - OR project name with optional section.',
      category: 'navigation',
      parameters: [
        new ToolParameter({
          name: 'destination',
          type: 'string',
          description: 'Page name or project name',
          required: true,
        }),
        new ToolParameter({
          name: 'section',
          type: 'string',
          description: 'For projects: shades, equipment, procurement, receiving, inventory, floor plan, reports, secure data',
          required: false,
        }),
      ],
      handler: async (args) => {
        // Navigation handler will be injected
        return ToolResult.success({ navigating: args.destination });
      },
    }),

    new ToolDefinition({
      name: 'search_knowledge',
      description: 'Search knowledge base for product info (Lutron, Ubiquiti, Control4, Sonos). USE FIRST for product questions.',
      category: 'knowledge',
      parameters: [
        new ToolParameter({
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        }),
        new ToolParameter({
          name: 'manufacturer',
          type: 'string',
          description: 'Filter by manufacturer',
          required: false,
        }),
      ],
      handler: async (args) => {
        // Knowledge search handler will be injected
        return ToolResult.success({ query: args.query });
      },
    }),

    new ToolDefinition({
      name: 'web_search',
      description: 'Search the web for general information not in knowledge base.',
      category: 'knowledge',
      parameters: [
        new ToolParameter({
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        }),
      ],
      handler: async (args) => {
        // Web search handler will be injected
        return ToolResult.success({ query: args.query });
      },
    }),

    new ToolDefinition({
      name: 'quick_create',
      description: 'Create new items: todo, issue, ticket, contact, note.',
      category: 'creation',
      parameters: [
        new ToolParameter({
          name: 'type',
          type: 'string',
          description: 'Type of item to create',
          required: true,
          enumValues: ['todo', 'issue', 'ticket', 'contact', 'note'],
        }),
        new ToolParameter({
          name: 'title',
          type: 'string',
          description: 'Title/name of item',
          required: true,
        }),
        new ToolParameter({
          name: 'description',
          type: 'string',
          description: 'Description or details',
          required: false,
        }),
        new ToolParameter({
          name: 'priority',
          type: 'string',
          description: 'Priority level',
          required: false,
          enumValues: ['low', 'medium', 'high', 'urgent'],
        }),
        new ToolParameter({
          name: 'projectId',
          type: 'string',
          description: 'Project ID if applicable',
          required: false,
        }),
        new ToolParameter({
          name: 'dueDate',
          type: 'string',
          description: 'Due date (YYYY-MM-DD)',
          required: false,
        }),
      ],
      handler: async (args) => {
        // Quick create handler will be injected
        return ToolResult.success({ created: args.type, title: args.title });
      },
    }),

    new ToolDefinition({
      name: 'get_page_training',
      description: 'Get training context for current page - returns business context, workflow info, common mistakes, best practices.',
      category: 'training',
      parameters: [
        new ToolParameter({
          name: 'pageRoute',
          type: 'string',
          description: 'Optional: specific page route. If omitted, uses current page.',
          required: false,
        }),
      ],
      handler: async (args) => {
        // Training handler will be injected
        return ToolResult.success({ pageRoute: args.pageRoute });
      },
    }),

    new ToolDefinition({
      name: 'teach_page',
      description: 'Start teaching the user about the current page using trained context.',
      category: 'training',
      parameters: [
        new ToolParameter({
          name: 'style',
          type: 'string',
          description: 'Teaching style',
          required: false,
          enumValues: ['overview', 'walkthrough', 'tips'],
        }),
      ],
      handler: async (args) => {
        // Teaching handler will be injected
        return ToolResult.success({ style: args.style || 'overview' });
      },
    }),

    new ToolDefinition({
      name: 'answer_page_question',
      description: 'Answer a question about the current page using trained FAQ and context.',
      category: 'training',
      parameters: [
        new ToolParameter({
          name: 'question',
          type: 'string',
          description: 'The user question',
          required: true,
        }),
      ],
      handler: async (args) => {
        // FAQ handler will be injected
        return ToolResult.success({ question: args.question });
      },
    }),
  ]);

  return registry;
};

export default ToolRegistry;
