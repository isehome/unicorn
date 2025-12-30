import { z } from "zod";

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};

export function createSuccessResponse(data: any): ToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data),
      },
    ],
  };
}

export function createErrorResponse(error: any): ToolResponse {
  const errorMessage = error?.message || String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${errorMessage}`,
      },
    ],
  };
}

export function createToolHandler<T>(
  handler: (data: T) => Promise<any>
): (data: T) => Promise<ToolResponse> {
  return async (data: T) => {
    try {
      const result = await handler(data);
      return createSuccessResponse(result);
    } catch (error) {
      console.error("Tool execution error:", error);
      return createErrorResponse(error);
    }
  };
}
