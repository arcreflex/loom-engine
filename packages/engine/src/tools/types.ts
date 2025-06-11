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

/**
 * Represents a group of related tools (e.g., from the same MCP server)
 */
export interface ToolGroup {
  name: string;
  description?: string;
  tools: string[]; // Array of tool names in this group
}

/**
 * Tool information for external consumption (without handler)
 */
export interface ToolInfo {
  name: string;
  description: string;
  parameters: JSONSchema7 & { type: 'object'; [k: string]: unknown };
  group?: string;
}
