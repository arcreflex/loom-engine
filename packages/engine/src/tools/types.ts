import type { JSONSchema7 } from 'json-schema';

/**
 * A handler function that executes a tool's logic.
 * @param args - The arguments for the tool, validated against its schema.
 * @returns A promise that resolves to a string (typically JSON) representing the tool's output.
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

/**
 * Defines a tool, including its schema and handler.
 * This structure is compatible with the MCP `Tool` object and provider-native tool definitions.
 * Tool parameters must always be object schemas.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7 & { type: 'object'; [k: string]: unknown };
  handler: ToolHandler;
  group?: string; // Optional group name (e.g., MCP server name)
}

export type ToolInfo = Omit<ToolDefinition, 'handler'>;
